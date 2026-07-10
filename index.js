if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  userMention
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const sharp = require('sharp');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'screenshots';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;
const MAX_DISCORD_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_COMPRESS_TARGET_BYTES = 7.5 * 1024 * 1024;
const DB_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_THRESHOLD = 0.86;
const GUILD_MATCH_GAP = 0.03;
const MEMBER_SEARCH_LIMIT = 10;

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('Missing required environment variables.');
}

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function similarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const leftBigrams = new Map();
  for (let i = 0; i < left.length - 1; i += 1) {
    const pair = left.slice(i, i + 2);
    leftBigrams.set(pair, (leftBigrams.get(pair) || 0) + 1);
  }

  let intersection = 0;
  let total = Math.max(left.length - 1, 0) + Math.max(right.length - 1, 0);

  for (let i = 0; i < right.length - 1; i += 1) {
    const pair = right.slice(i, i + 2);
    const count = leftBigrams.get(pair) || 0;
    if (count > 0) {
      leftBigrams.set(pair, count - 1);
      intersection += 2;
    }
  }

  return total > 0 ? intersection / total : 0;
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function formatDelta(value) {
  const num = Number(value || 0);
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}`;
}

function getEmoji(guild, emojiName, fallback) {
  const emoji = guild?.emojis?.cache?.find((e) => e.name === emojiName);
  return emoji ? `${emoji}` : fallback;
}

function getPlacementEmoji(guild, placement) {
  const map = {
    1: ['Tournament', '🥇'],
    2: ['2ndTrophy', '🥈'],
    3: ['3rdTrophy', '🥉'],
    4: ['4thTrophy', '4th']
  };

  const [name, fallback] = map[Number(placement)] || [null, `${placement}.`];
  return name ? getEmoji(guild, name, fallback) : fallback;
}

function buildGameTags(game, guild) {
  const tags = [];
  if (game.has_epic_mode) tags.push(getEmoji(guild, 'Epic', 'Epic') + ' Epic Mode');
  if (game.has_immortality) tags.push(getEmoji(guild, 'Immo', 'Immo') + ' Immortality');
  if (game.has_rise_of_ix) tags.push(getEmoji(guild, 'Ix', 'Ix') + ' Rise of IX');
  if (String(game.game_version || '').toLowerCase() === 'uprising') {
    tags.push(getEmoji(guild, 'Uprising', 'Uprising') + ' Uprising');
  }
  if (game.has_base_leaders) tags.push('Base Leaders');
  return tags;
}

async function getDatabasePlayerMap(playerName) {
  const normalized = normalizeName(playerName);
  if (!normalized) return null;

  const rawName = String(playerName || '').trim();
  const safeName = rawName.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
  const pattern = `*${safeName || rawName}*`;

  const { data, error } = await supabase
    .from('player_discord_map')
    .select('id, player_key, display_name, username, discord_username, claimed_by, discord_user_id')
    .or(`player_key.eq.${normalized},display_name.ilike.${pattern},discord_username.ilike.${pattern},username.ilike.${pattern}`)
    .limit(10);

  if (error) {
    console.error('Failed player_discord_map lookup for', playerName, error);
    return null;
  }

  if (!data || !data.length) return null;

  let best = null;
  let bestScore = 0;

  for (const row of data) {
    const score = Math.max(
      similarity(playerName, row.player_key),
      similarity(playerName, row.display_name),
      similarity(playerName, row.discord_username),
      similarity(playerName, row.username)
    );

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (!best || bestScore < DB_MATCH_THRESHOLD) return null;
  return best;
}

async function searchGuildMemberByNames(guild, names) {
  if (!guild) return null;

  const seen = new Map();

  for (const rawName of names.filter(Boolean)) {
    const query = String(rawName).trim();
    if (!query) continue;

    try {
      const members = await guild.members.search({
        query: query.slice(0, 32),
        limit: MEMBER_SEARCH_LIMIT
      });

      for (const member of members.values()) {
        const candidateNames = [
          member.user && member.user.username,
          member.nickname,
          member.displayName,
          member.user && member.user.globalName
        ].filter(Boolean);

        const score = Math.max(...candidateNames.map((candidate) => similarity(query, candidate)));
        const existing = seen.get(member.id);

        if (!existing || score > existing.score) {
          seen.set(member.id, { member, score });
        }
      }
    } catch (err) {
      console.error('Guild search failed for', query, err);
    }
  }

  const ranked = Array.from(seen.values()).sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked[0].score < GUILD_MATCH_THRESHOLD) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < GUILD_MATCH_GAP) return null;
  return ranked[0].member;
}

function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

async function persistDiscordUserId(dbMatch, discordUserId) {
  const normalizedId = normalizeDiscordId(discordUserId);
  if (!dbMatch || !dbMatch.id || !normalizedId) return;
  if (normalizeDiscordId(dbMatch.discord_user_id) === normalizedId) return;

  const { error } = await supabase
    .from('player_discord_map')
    .update({ discord_user_id: normalizedId, updated_at: new Date().toISOString() })
    .eq('id', dbMatch.id);

  if (error) {
    console.error('Failed to persist discord_user_id for', dbMatch.player_key || dbMatch.display_name, error);
  }
}

async function resolveMentionForName(guild, playerName) {
  const dbMatch = await getDatabasePlayerMap(playerName);
  const mappedDiscordId = normalizeDiscordId(dbMatch && dbMatch.discord_user_id);

  if (mappedDiscordId) {
    return userMention(mappedDiscordId);
  }

  const searchNames = [
    dbMatch && dbMatch.discord_username,
    dbMatch && dbMatch.display_name,
    dbMatch && dbMatch.username,
    dbMatch && dbMatch.player_key,
    playerName
  ].filter(Boolean);

  const member = await searchGuildMemberByNames(guild, searchNames);

  if (member && member.id) {
    await persistDiscordUserId(dbMatch, member.id);
    return userMention(member.id);
  }

  if (dbMatch && dbMatch.discord_username) {
    return '(' + dbMatch.discord_username + ')';
  }

  return null;
}

async function createDiscordImagePayload(storagePath) {
  if (!storagePath) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed URL for screenshot', storagePath, error);
    return null;
  }

  const signedUrl = data.signedUrl;

  try {
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength <= MAX_DISCORD_FILE_BYTES) {
      return {
        attachment: new AttachmentBuilder(buffer, { name: 'results.png' }),
        imageUrl: 'attachment://results.png'
      };
    }

    buffer = await sharp(buffer)
      .rotate()
      .png({ quality: 80, compressionLevel: 9, adaptiveFiltering: true })
      .resize({ width: 1800, withoutEnlargement: true })
      .toBuffer();

    if (buffer.byteLength <= IMAGE_COMPRESS_TARGET_BYTES) {
      return {
        attachment: new AttachmentBuilder(buffer, { name: 'results.png' }),
        imageUrl: 'attachment://results.png'
      };
    }

    return { tooLarge: true, signedUrl };
  } catch (err) {
    console.error('Failed preparing screenshot payload', storagePath, err);
    return { tooLarge: true, signedUrl };
  }
}

async function buildGameResultPayload(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('Failed to fetch game', gameId, gameError);
    return null;
  }

  const { data: results, error: resultsError } = await supabase
    .from('game_results')
    .select('*')
    .eq('game_id', gameId)
    .order('placement', { ascending: true });

  if (resultsError || !results?.length) {
    console.error('Failed to fetch results for', gameId, resultsError);
    return null;
  }

  const playerKeys = results.map((r) => String(r.player_name || '').toLowerCase());

  const { data: ratings, error: ratingsError } = await supabase
    .from('player_ratings')
    .select('player_key, display_name, game_version, elo')
    .in('player_key', playerKeys)
    .in('game_version', ['overall', game.game_version]);

  if (ratingsError) {
    console.error('Failed to fetch ratings', ratingsError);
  }

  const ratingsMap = {};
  for (const row of ratings || []) {
    if (!ratingsMap[row.player_key]) ratingsMap[row.player_key] = {};
    ratingsMap[row.player_key][row.game_version] = row.elo;
  }

  const screenshotMedia = game.image_url ? await createDiscordImagePayload(game.image_url) : null;

  return { game, results, ratingsMap, screenshotMedia };
}

async function buildEmbed(payload, guild) {
  const game = payload.game;
  const results = payload.results;
  const ratingsMap = payload.ratingsMap;
  const screenshotMedia = payload.screenshotMedia;
  const modeLabel = capitalize(game.game_version || 'unknown');
  const tags = buildGameTags(game, guild);
  const lines = [];

  for (const row of results) {
    const place = getPlacementEmoji(guild, row.placement);
    const playerKey = String(row.player_name || '').toLowerCase();
    const currentOverall = ratingsMap[playerKey] ? ratingsMap[playerKey].overall : undefined;
    const currentMode = ratingsMap[playerKey] ? ratingsMap[playerKey][game.game_version] : undefined;
    const mention = await resolveMentionForName(guild, row.player_name);

    const playerPart = mention
      ? '**' + row.player_name + '** ' + mention
      : '**' + row.player_name + '**';

    let text = place + ' ' + playerPart + ' - ' + (row.leader_name || 'Unknown Leader') + ' - ' + (row.points ?? '?') + ' pts';
    text += '\nOverall: ' + formatDelta(row.elo_delta_overall);

    if (currentOverall !== undefined) {
      text += ' (-> ' + Number(currentOverall).toFixed(1) + ')';
    }

    text += ' | ' + modeLabel + ': ' + formatDelta(row.elo_delta);

    if (currentMode !== undefined) {
      text += ' (-> ' + Number(currentMode).toFixed(1) + ')';
    }

    lines.push(text);
  }

  if (tags.length) {
    lines.push('Game modes played: ' + tags.join(' | '));
  }

  const embed = new EmbedBuilder()
    .setTitle('Game Finished - ' + modeLabel)
    .setDescription(lines.join('\n\n'))
    .setColor(0xC9A24B)
    .setTimestamp(new Date());

  if (screenshotMedia?.imageUrl) {
    embed.setImage(screenshotMedia.imageUrl);
  }

  return { embed, screenshotMedia };
}

async function announceGame(gameId) {
  const payload = await buildGameResultPayload(gameId);
  if (!payload) return;

  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
  if (!channel) {
    console.error('Could not find target channel', DISCORD_CHANNEL_ID);
    return;
  }

  const built = await buildEmbed(payload, channel.guild);
  const messagePayload = { embeds: [built.embed] };

  if (built.screenshotMedia?.attachment) {
    messagePayload.files = [built.screenshotMedia.attachment];
  } else if (built.screenshotMedia?.tooLarge) {
    messagePayload.content = 'Image was too big for Discord. Check https://dunestats.cc/matches for the screenshot.';
  }

  await channel.send(messagePayload);
}

discordClient.once('clientReady', () => {
  console.log('Logged in as', discordClient.user.tag);
});

discordClient.login(DISCORD_BOT_TOKEN);

module.exports = {
  announceGame,
  resolveMentionForName,
  getDatabasePlayerMap
};
