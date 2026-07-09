require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// ---------- Config ----------
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1233029532785573918';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const STORAGE_BUCKET = 'match-screenshots';
const SIGNED_URL_EXPIRY_SECONDS = 60;
const GAME_ROWS_WAIT_MS = 2000;
const REALTIME_RETRY_DELAY_MS = 5000;
const REALTIME_MAX_RETRIES = 10;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing required environment variables. Check DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  realtime: {
    transport: WebSocket,
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    WebSocket: WebSocket
  }
});

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function capitalize(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function formatDelta(value) {
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}`;
}

function getEmoji(guild, name, fallback) {
  return guild?.emojis?.cache?.find(emoji => emoji.name === name)?.toString() || fallback;
}

function getPlacementEmoji(guild, placement) {
  const placementEmojiNames = { 1: 'Tournament', 2: '2ndTrophy', 3: '3rdTrophy', 4: '4thTrophy' };
  const fallbacks = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' };
  return getEmoji(guild, placementEmojiNames[placement], fallbacks[placement] || `${placement}.`);
}

function buildGameTags(game, guild) {
  const tags = [];
  if (game.has_epic_mode) tags.push(`${getEmoji(guild, 'Epic', ':Epic:')} Epic Mode`);
  if (game.has_immortality) tags.push(`${getEmoji(guild, 'Immo', ':Immo:')} Immortality`);
  if (game.has_rise_of_ix) tags.push(`${getEmoji(guild, 'Ix', ':Ix:')} Rise of IX`);
  if (String(game.game_version || '').toLowerCase() === 'uprising') {
    tags.push(`${getEmoji(guild, 'Uprising', ':Uprising:')} Uprising`);
  }
  if (game.has_base_leaders) tags.push('Base Leaders');
  return tags;
}

async function resolveMentionForName(guild, playerName) {
  const normalized = normalizeName(playerName);
  const { data: linkRows, error: linkError } = await supabase
    .from('player_discord_links')
    .select('player_name, discord_user_id');

  if (!linkError && linkRows?.length) {
    const exact = linkRows.find(row => normalizeName(row.player_name) === normalized && row.discord_user_id);
    if (exact) return `<@${exact.discord_user_id}>`;
  }

  const member = guild.members.cache.find(m =>
    normalizeName(m.displayName) === normalized ||
    normalizeName(m.user.username) === normalized ||
    normalizeName(m.user.globalName) === normalized
  );

  return member ? member.toString() : null;
}

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

  const playerKeys = results.map(r => r.player_name.toLowerCase());
  const { data: ratings, error: ratingsError } = await supabase
    .from('player_ratings')
    .select('player_key, display_name, game_version, elo')
    .in('player_key', playerKeys)
    .in('game_version', ['overall', game.game_version]);

  if (ratingsError) {
    console.error('Failed to fetch player_ratings', ratingsError);
  }

  const ratingsMap = {};
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

    if (signedError) console.error('Failed to create signed URL', signedError);
    else screenshotUrl = signed.signedUrl;
  }

  return { game, results, ratingsMap, screenshotUrl };
}

async function buildEmbed(payload, guild) {
  const { game, results, ratingsMap, screenshotUrl } = payload;
  const modeLabel = capitalize(game.game_version);
  const tags = buildGameTags(game, guild);

  const lines = [];
  for (const r of results) {
    const emoji = getPlacementEmoji(guild, r.placement);
    const key = r.player_name.toLowerCase();
    const currentOverall = ratingsMap[key]?.overall;
    const currentMode = ratingsMap[key]?.[game.game_version];
    const mention = await resolveMentionForName(guild, r.player_name);
    const namePart = mention ? `${r.player_name} ${mention}` : r.player_name;

    const overallPart = `Overall: ${formatDelta(r.elo_delta_overall)}` +
      (currentOverall !== undefined ? ` (→ ${Number(currentOverall).toFixed(1)})` : '');
    const modePart = `${modeLabel}: ${formatDelta(r.elo_delta)}` +
      (currentMode !== undefined ? ` (→ ${Number(currentMode).toFixed(1)})` : '');

    lines.push(`${emoji} **${namePart}** — ${r.leader_name || 'Unknown Leader'} — ${r.points} pts\n${overallPart} | ${modePart}`);
  }

  if (tags.length) {
    lines.push(`Game modes played: ${tags.join(' • ')}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Game Finished 🎲 (${modeLabel})`)
    .setDescription(lines.join('\n\n'))
    .setColor(0xC9A24B)
    .setTimestamp(new Date());

  if (screenshotUrl) embed.setImage(screenshotUrl);
  return embed;
}

async function announceGame(gameId) {
  const payload = await buildGameResultPayload(gameId);
  if (!payload) return;

  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
  if (!channel) {
    console.error('Could not find target channel', DISCORD_CHANNEL_ID);
    return;
  }

  const embed = await buildEmbed(payload, channel.guild);
  await channel.send({ embeds: [embed] });
  console.log(`Announced game ${gameId}`);
}

const pendingGames = new Set();
function scheduleAnnouncement(gameId) {
  if (pendingGames.has(gameId)) return;
  pendingGames.add(gameId);
  setTimeout(async () => {
    pendingGames.delete(gameId);
    try { await announceGame(gameId); } catch (err) { console.error('Error announcing game', gameId, err); }
  }, GAME_ROWS_WAIT_MS);
}

let realtimeRetryCount = 0;
let realtimeChannel = null;
function startRealtimeListener() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel('game_results-inserts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_results' }, (payload) => {
      const gameId = payload.new.game_id;
      if (gameId) scheduleAnnouncement(gameId);
    })
    .subscribe((status, err) => {
      console.log('Supabase realtime subscription status:', status);
      if (status === 'SUBSCRIBED') { realtimeRetryCount = 0; return; }
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        if (err) console.error('Realtime error:', err);
        if (realtimeRetryCount >= REALTIME_MAX_RETRIES) { console.error(`Realtime failed after ${REALTIME_MAX_RETRIES} retries. Giving up.`); return; }
        realtimeRetryCount += 1;
        const delay = REALTIME_RETRY_DELAY_MS * realtimeRetryCount;
        console.log(`Retrying realtime subscription in ${delay}ms (attempt ${realtimeRetryCount}/${REALTIME_MAX_RETRIES})...`);
        setTimeout(startRealtimeListener, delay);
      }
    });
}

discordClient.once('clientReady', () => {
  console.log(`Logged in as ${discordClient.user.tag}`);
  startRealtimeListener();
});

discordClient.login(DISCORD_BOT_TOKEN);
