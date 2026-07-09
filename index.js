require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// ---------- Config ----------
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1233029532785573918';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const STORAGE_BUCKET = 'match-screenshots';
const SIGNED_URL_EXPIRY_SECONDS = 60;
const GAME_ROWS_WAIT_MS = 2000; // small buffer so all players in a game have landed

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing required environment variables. Check DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY.');
  process.exit(1);
}

// ---------- Clients ----------
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---------- Helpers ----------
const PLACEMENT_EMOJI = { 1: '\ud83e\udd47', 2: '\ud83e\udd48', 3: '\ud83e\udd49', 4: '4\ufe0f\u20e3' };

function capitalize(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatDelta(value) {
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}`;
}

// Fetch all game_results rows for a given game_id, joined conceptually with games and player_ratings
async function buildGameResultPayload(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, game_version, image_url, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('Failed to fetch game', gameId, gameError);
    return null;
  }

  const { data: results, error: resultsError } = await supabase
    .from('game_results')
    .select('player_name, leader_name, placement, points, elo_delta, elo_delta_overall')
    .eq('game_id', gameId)
    .order('placement', { ascending: true });

  if (resultsError || !results || results.length === 0) {
    console.error('Failed to fetch game_results for', gameId, resultsError);
    return null;
  }

  // Fetch current overall + mode ratings for each player (lowercased player_key)
  const playerKeys = results.map(r => r.player_name.toLowerCase());
  const { data: ratings, error: ratingsError } = await supabase
    .from('player_ratings')
    .select('player_key, display_name, game_version, elo')
    .in('player_key', playerKeys)
    .in('game_version', ['overall', game.game_version]);

  if (ratingsError) {
    console.error('Failed to fetch player_ratings', ratingsError);
  }

  const ratingsMap = {}; // player_key -> { overall: elo, mode: elo }
  (ratings || []).forEach(r => {
    if (!ratingsMap[r.player_key]) ratingsMap[r.player_key] = {};
    ratingsMap[r.player_key][r.game_version] = r.elo;
  });

  let screenshotUrl = null;
  if (game.image_url) {
    const { data: signed, error: signedError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(game.image_url, SIGNED_URL_EXPIRY_SECONDS);

    if (signedError) {
      console.error('Failed to create signed URL', signedError);
    } else {
      screenshotUrl = signed.signedUrl;
    }
  }

  return { game, results, ratingsMap, screenshotUrl };
}

function buildEmbed(payload) {
  const { game, results, ratingsMap, screenshotUrl } = payload;
  const modeLabel = capitalize(game.game_version);

  const lines = results.map(r => {
    const emoji = PLACEMENT_EMOJI[r.placement] || `${r.placement}.`;
    const key = r.player_name.toLowerCase();
    const currentOverall = ratingsMap[key]?.overall;
    const currentMode = ratingsMap[key]?.[game.game_version];

    const overallPart = `Overall: ${formatDelta(r.elo_delta_overall)}` +
      (currentOverall !== undefined ? ` (\u2192 ${Number(currentOverall).toFixed(1)})` : '');
    const modePart = `${modeLabel}: ${formatDelta(r.elo_delta)}` +
      (currentMode !== undefined ? ` (\u2192 ${Number(currentMode).toFixed(1)})` : '');

    return `${emoji} **${r.player_name}** \u2014 ${r.leader_name || 'Unknown Leader'} \u2014 ${r.points} pts\n${overallPart} | ${modePart}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`Game Finished \ud83c\udfb2 (${modeLabel})`)
    .setDescription(lines.join('\n\n'))
    .setColor(0xC9A24B)
    .setTimestamp(new Date());

  if (screenshotUrl) {
    embed.setImage(screenshotUrl);
  }

  return embed;
}

async function announceGame(gameId) {
  const payload = await buildGameResultPayload(gameId);
  if (!payload) return;

  const embed = buildEmbed(payload);
  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
  if (!channel) {
    console.error('Could not find target channel', DISCORD_CHANNEL_ID);
    return;
  }
  await channel.send({ embeds: [embed] });
  console.log(`Announced game ${gameId}`);
}

// ---------- Realtime listener ----------
// Buffers game_ids seen in the last GAME_ROWS_WAIT_MS window so all player rows
// for a single game are grouped into one announcement.
const pendingGames = new Set();

function scheduleAnnouncement(gameId) {
  if (pendingGames.has(gameId)) return; // already scheduled
  pendingGames.add(gameId);
  setTimeout(async () => {
    pendingGames.delete(gameId);
    try {
      await announceGame(gameId);
    } catch (err) {
      console.error('Error announcing game', gameId, err);
    }
  }, GAME_ROWS_WAIT_MS);
}

function startRealtimeListener() {
  supabase
    .channel('game_results-inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_results' },
      (payload) => {
        const gameId = payload.new.game_id;
        if (gameId) scheduleAnnouncement(gameId);
      }
    )
    .subscribe((status) => {
      console.log('Supabase realtime subscription status:', status);
    });
}

// ---------- Discord client lifecycle ----------
discordClient.once('ready', () => {
  console.log(`Logged in as ${discordClient.user.tag}`);
  startRealtimeListener();
});

discordClient.login(DISCORD_BOT_TOKEN);
