require('dotenv').config();

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is live!');
}).listen(PORT, () => {
  console.log(`Health check server instantly listening on port ${PORT}`);
});

const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder, userMention, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const liveCommand = require('./live'); 
const fixCommand = require('./fix');
const tournamentCommand = require('./tournament');
const massThreadsCommand = require('./mass-threads'); 
const spCommand = require('./sp'); 
const confirmCommand = require('./confirm');
const tournamentStatusCommand = require('./tournament-status');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const sharp = require('sharp');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1233029532785573918';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const STORAGE_BUCKET = 'match-screenshots';
const SIGNED_URL_EXPIRY_SECONDS = 300;
const GAME_ROWS_WAIT_MS = 5000; 
const REALTIME_RETRY_DELAY_MS = 5000;
const REALTIME_MAX_RETRIES = 10;
const MEMBER_SEARCH_LIMIT = 10;
const DB_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_GAP = 0.08;
const TAG_COOLDOWN_MS = 45 * 60 * 1000;
const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421';

const TOURNAMENT_ROLE_MAP = {
  15: '1533819999699865751',
  16: '1266076612424634571'
};

const LEADER_EMOJI_MAP = {
  '"Princess" Yuna Moritani': 'princessyunamoritani',
  'Archduke Armand Ecaz': 'archdukearmandecaz',
  'Baron Vladimir Harkonnen': 'baronvladimirharkonnen',
  'Count Ilban Richese': 'countilbanrichese',
  'Countess Ariana Thorvald': 'countessarianathorvald',
  'Duke Leto Atreides': 'dukeletoatreides',
  'Earl Memnon Thorvald': 'earlmemnonthorvald',
  'Feyd-Rautha Harkonnen': 'feyd',
  'Glossu "Beast" Rabban': 'glossubeastrabban',
  'Gurney Halleck': 'gurneyhalleck',
  'Helena Richese': 'helenarichese',
  'Ilesa Ecaz': 'ilesaecaz',
  'Lady Amber Metulli': 'ladyambermetulli',
  'Lady Jessica': 'ladyjessica',
  'Lady Margot Fenring': 'ladymargotfenring',
  "Muad'Dib": 'muaddib',
  "Muad''Dib": 'muaddib',
  'Paul Atreides': 'paulatreides',
  'Prince Rhombur Vernius': 'princerhomburvernius',
  'Princess Irulan': 'princessirulan',
  'Shaddam Corrino IV': 'shaddamcorrinoiv',
  'Staban Tuek': 'stabantuek',
  'Tessia Vernius': 'tessiavernius',
  'Viscount Hundro Moritani': 'viscounthundromoritani'
};

const SP_ROLES_CONFIG = [
  { name: 'Kwisatz Haderach', min: 10000, id: '152621467311616082' },
  { name: 'Swordmaster',      min: 5000,  id: '1526218389004226640' },
  { name: 'Mentat',           min: 2500,  id: '1526218251858612274' },
  { name: 'Fedaykin',         min: 1000,  id: '1526218112054198332' },
  { name: 'Trooper',          min: 250,   id: '1526217478017908786' },
  { name: 'Spiceworker',      min: 0,     id: '1526217296501276702' }
];

const SP_REWARDS_CONFIG = {
  DAILY_FIRST_MESSAGE: { amount: 10,  label: 'Daily First Message' },
  IMAGE_UPLOAD:        { amount: 50,  label: 'Recruitment Proof Posted' },
  MATCH_START_BASE:    { amount: 50,  label: 'Match Started' },
  FIRST_DAILY_LIVE:    { amount: 100, label: 'First Daily Live Game' },
  FIRST_WEEKLY_ASYNC:  { amount: 350, label: 'First Weekly Async Game' }
};

const SP_NOTIFICATION_CHANNEL_ID = '1233026531291566132';
const IMAGE_UPLOADS_CHANNEL_ID = '1233026527294390385';

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  realtime: { transport: WebSocket, params: { eventsPerSecond: 10 } },
  global: { WebSocket }
});

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions 
  ],
  partials: [
    Partials.Message, 
    Partials.Channel, 
    Partials.Reaction 
  ]
});

const slashCommands = new Map([
  [statsCommand.data.name, statsCommand],
  [asyncCommand.data.name, asyncCommand],
  [liveCommand.data.name, liveCommand], 
  [fixCommand.data.name, fixCommand],
  [tournamentCommand.data.name, tournamentCommand],
  [massThreadsCommand.data.name, massThreadsCommand],
  [spCommand.data.name, spCommand],
  [confirmCommand.data.name, confirmCommand],
  [tournamentStatusCommand.data.name, tournamentStatusCommand]
]);

const pendingGames = new Set();
const scheduleDebounceTimers = new Map(); // Debounce map for voting updates

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/^[.\s]+|[.\s]+$/g, '').replace(/[^a-z0-9]/g, '');
}

function similarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  }
  const dp = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const distance = dp[x.length][y.length];
  return 1 - distance / Math.max(x.length, y.length);
}

function formatDelta(value) {
  const num = Number(value || 0);
  return (num > 0 ? '+' : '') + num.toFixed(2);
}

function getEmoji(guild, name, fallback) {
  if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
  const emoji = guild.emojis.cache.find((e) => e.name === name);
  return emoji ? emoji.toString() : fallback;
}

function getLeaderEmoji(guild, leaderName) {
  if (!leaderName) return '';
  const emojiKey = LEADER_EMOJI_MAP[leaderName];
  if (!emojiKey) return '';
  return getEmoji(guild, emojiKey, '');
}

function getPlacementEmoji(guild, placement) {
  const map = {
    1: { name: 'Tournament', fallback: '1st' },
    2: { name: '2ndTrophy', fallback: '2nd' },
    3: { name: '3rdTrophy', fallback: '3rd' },
    4: { name: '4thTrophy', fallback: '4th' }
  };
  if (!map[placement]) return String(placement);
  return getEmoji(guild, map[placement].name, map[placement].fallback);
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

function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

function generateGoogleCalendarUrl(title, startDate, durationHours = 2) {
  if (!startDate || isNaN(startDate.getTime())) return null;
  const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
  
  const pad = (n) => String(n).padStart(2, '0');
  const formatUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  
  const dates = `${formatUtc(startDate)}/${formatUtc(endDate)}`;
  const text = encodeURIComponent(title);
  const details = encodeURIComponent('Strategy Arena Tournament Match. Coordinate with your tablemates on Discord!');
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;
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
  if (error) return null;
  if (!data || !data.length) return null;
  let best = null;
  let bestScore = 0;
  for (const row of data) {
    const score = Math.max(similarity(playerName, row.player_key), similarity(playerName, row.display_name), similarity(playerName, row.discord_username), similarity(playerName, row.username));
    if (score > bestScore) { best = row; bestScore = score; }
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
      const members = await guild.members.search({ query: query.slice(0, 32), limit: MEMBER_SEARCH_LIMIT });
      for (const member of members.values()) {
        const candidateNames = [member.user && member.user.username, member.nickname, member.displayName, member.user && member.user.globalName].filter(Boolean);
        const score = Math.max(...candidateNames.map((candidate) => similarity(query, candidate)));
        const existing = seen.get(member.id);
        if (!existing || score > existing.score) { seen.set(member.id, { member, score }); }
      }
    } catch (err) {}
  }
  const ranked = Array.from(seen.values()).sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked[0].score < GUILD_MATCH_THRESHOLD) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < GUILD_MATCH_GAP) return null;
  return ranked[0].member;
}

async function persistDiscordUserId(dbMatch, discordUserId) {
  const normalizedId = normalizeDiscordId(discordUserId);
  if (!dbMatch || !dbMatch.id || !normalizedId) return;
  if (normalizeDiscordId(dbMatch.discord_user_id) === normalizedId) return;
  await supabase.from('player_discord_map').update({ discord_user_id: normalizedId, updated_at: new Date().toISOString() }).eq('id', dbMatch.id);
}

async function resolveMentionForName(guild, playerName) {
  const dbMatch = await getDatabasePlayerMap(playerName);
  const mappedDiscordId = normalizeDiscordId(dbMatch && dbMatch.discord_user_id);
  if (mappedDiscordId) { return userMention(mappedDiscordId); }
  const searchNames = [dbMatch && dbMatch.discord_username, dbMatch && dbMatch.display_name, dbMatch && dbMatch.username, dbMatch && dbMatch.player_key, playerName].filter(Boolean);
  const member = await searchGuildMemberByNames(guild, searchNames);
  if (member && member.id) { await persistDiscordUserId(dbMatch, member.id); return userMention(member.id); }
  if (dbMatch && dbMatch.discord_username) { return '(' + dbMatch.discord_username + ')'; }
  return null;
}

async function createDiscordImagePayload(storagePath) {
  if (!storagePath) return null;
  let attempts = 3;
  let response = null;
  let data = null;
  while (attempts > 0) {
    try {
      const signedUrlResult = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
      if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
        data = signedUrlResult.data;
        response = await fetch(data.signedUrl);
        if (response.ok) break;
      }
    } catch (fetchErr) {}
    attempts -= 1;
    if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 2500));
  }

  if (!response || !response.ok || !data) return null;

  try {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const maxBytes = Math.floor(7.5 * 1024 * 1024);
    if (!contentType.startsWith('image/')) { return { attachment: null, imageUrl: data.signedUrl, tooLarge: false }; }
    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    if (buffer.length <= maxBytes) { return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.png' }), imageUrl: null, tooLarge: false }; }
    try {
      buffer = await sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
      if (buffer.length <= maxBytes) { return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.jpg' }), imageUrl: null, tooLarge: false }; }
      buffer = await sharp(buffer).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 62, mozjpeg: true }).toBuffer();
      if (buffer.length <= maxBytes) { return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.jpg' }), imageUrl: null, tooLarge: false }; }
    } catch (compressionError) {}
    return { attachment: null, imageUrl: data.signedUrl, tooLarge: true };
  } catch (err) { return { attachment: null, imageUrl: null, tooLarge: false }; }
}

async function buildGameResultPayload(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, public_match_id, game_version, image_url, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, tournament_num')
    .eq('id', gameId)
    .single();

  if (gameError || !game) return null;
  
  const { data: results, error: resultsError = null } = await supabase
    .from('game_results')
    .select('player_name, leader_name, placement, points, elo_delta, elo_delta_overall')
    .eq('game_id', gameId)
    .order('placement', { ascending: true });

  if (resultsError || !results || !results.length) return null;
  
  let tournamentDetails = null;
  if (game.tournament_num) {
    try {
      const currentPlayers = results.map(r => normalizeName(r.player_name));
      const { data: matchRows, error: tourneyError } = await supabase
        .from('tournament_matches')
        .select('round_type, table_identifier, player_name')
        .eq('tournament_num', game.tournament_num);

      if (!tourneyError && matchRows && matchRows.length > 0) {
        const tablesMap = new Map();
        matchRows.forEach(row => {
          const groupKey = `${row.round_type}||${row.table_identifier}`;
          if (!tablesMap.has(groupKey)) {
            tablesMap.set(groupKey, { roundType: row.round_type, tableIdentifier: row.table_identifier, players: [] });
          }
          tablesMap.get(groupKey).players.push(normalizeName(row.player_name));
        });

        const matchedTable = Array.from(tablesMap.values()).find(t => {
          return currentPlayers.every(p => t.players.includes(p));
        });

        if (matchedTable) {
          tournamentDetails = { roundType: matchedTable.roundType, tableIdentifier: matchedTable.tableIdentifier };
        }
      }
    } catch (err) {}
  }

  const playerKeys = results.map((r) => String(r.player_name || '').toLowerCase());
  const { data: ratings } = await supabase
    .from('player_ratings')
    .select('player_key, display_name, game_version, elo')
    .in('player_key', playerKeys)
    .in('game_version', ['overall', game.game_version]);

  const ratingsMap = {};
  for (const row of ratings || []) {
    if (!ratingsMap[row.player_key]) ratingsMap[row.player_key] = {};
    ratingsMap[row.player_key][row.game_version] = row.elo;
  }

  const { data: sandboxResults } = await supabase
    .from('sandbox_game_results')
    .select('player_name, elo_delta_overall')
    .eq('game_id', gameId);

  const sandboxDeltaMap = {};
  for (const row of sandboxResults || []) {
    sandboxDeltaMap[normalizeName(row.player_name)] = row.elo_delta_overall;
  }

  const { data: sandboxRatings } = await supabase
    .from('sandbox_player_ratings')
    .select('player_key, overall_vp_elo')
    .in('player_key', playerKeys)
    .eq('game_version', 'overall');

  const sandboxRatingsMap = {};
  for (const row of sandboxRatings || []) {
    sandboxRatingsMap[row.player_key] = row.overall_vp_elo;
  }

  const screenshotMedia = game.image_url ? await createDiscordImagePayload(game.image_url) : null;
  return { game, results, ratingsMap, sandboxDeltaMap, sandboxRatingsMap, screenshotMedia, tournamentDetails };
}

async function buildEmbed(payload, guild) {
  const game = payload.game; 
  const results = payload.results; 
  const ratingsMap = payload.ratingsMap; 
  const sandboxDeltaMap = payload.sandboxDeltaMap || {};
  const sandboxRatingsMap = payload.sandboxRatingsMap || {};
  const screenshotMedia = payload.screenshotMedia;
  const tourney = payload.tournamentDetails;
  
  const modeLabel = capitalize(game.game_version || 'unknown'); 
  const tags = buildGameTags(game, guild); 
  const lines = [];
  
  let titleString = `Game Finished - ${modeLabel}`;
  if (game.tournament_num) {
    titleString = tourney 
      ? `🏆 Tournament ${game.tournament_num} | ${tourney.roundType} ${tourney.tableIdentifier}`
      : `🏆 Tournament ${game.tournament_num} Match Finished!`;
  }

  const matchUrl = game.public_match_id 
    ? `https://dunestats.cc/match/${game.public_match_id}` 
    : `https://dunestats.cc/matches`;

  for (const row of results) {
    const place = getPlacementEmoji(guild, row.placement); 
    const playerKey = String(row.player_name || '').toLowerCase();
    const normalizedKey = normalizeName(row.player_name);

    const currentOverall = ratingsMap[playerKey] ? ratingsMap[playerKey].overall : undefined; 
    const currentMode = ratingsMap[playerKey] ? ratingsMap[playerKey][game.game_version] : undefined;
    
    const sandboxDelta = sandboxDeltaMap[normalizedKey];
    const currentSandboxTotal = sandboxRatingsMap[playerKey];

    const mention = await resolveMentionForName(guild, row.player_name);
    const playerPart = mention ? '**' + row.player_name + '** ' + mention : '**' + row.player_name + '**';
    
    const leaderEmoji = getLeaderEmoji(guild, row.leader_name);
    const leaderDisplay = leaderEmoji ? `${leaderEmoji} ${row.leader_name}` : (row.leader_name || 'Unknown Leader');

    let text = place + ' ' + playerPart + ' - ' + leaderDisplay + ' - ' + (row.points ?? '?') + ' pts';
    text += '\nOverall: ' + formatDelta(row.elo_delta_overall);
    if (currentOverall !== undefined) { text += ' (-> ' + Number(currentOverall).toFixed(1) + ')'; }
    text += ' | ' + modeLabel + ': ' + formatDelta(row.elo_delta);
    if (currentMode !== undefined) { text += ' (-> ' + Number(currentMode).toFixed(1) + ')'; }

    if (sandboxDelta !== undefined) {
      text += ' | All VP: ' + formatDelta(sandboxDelta);
      if (currentSandboxTotal !== undefined) { text += ' (-> ' + Number(currentSandboxTotal).toFixed(1) + ')'; }
    }

    lines.push(text);
  }

  if (tags.length) { lines.push('Game modes played: ' + tags.join(' | ')); }

  const embed = new EmbedBuilder()
    .setTitle(titleString)
    .setURL(matchUrl)
    .setDescription(lines.join('\n\n'))
    .setColor(game.tournament_num ? 0xd35400 : 0xC9A24B)
    .setTimestamp(new Date());

  if (screenshotMedia?.imageUrl) { embed.setImage(screenshotMedia.imageUrl); }
  return { embed, screenshotMedia };
}

async function announceGame(gameId) {
  const { data: checkGame } = await supabase
    .from('games')
    .select('announced_to_discord')
    .eq('id', gameId)
    .single();

  if (checkGame && checkGame.announced_to_discord === true) return;

  const payload = await buildGameResultPayload(gameId); 
  if (!payload) return;

  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID); 
  if (!channel) return;

  const built = await buildEmbed(payload, channel.guild); 
  const messagePayload = { embeds: [built.embed] };

  if (built.screenshotMedia?.attachment) { 
    messagePayload.files = [built.screenshotMedia.attachment]; 
  } else if (built.screenshotMedia?.tooLarge) { 
    messagePayload.content = 'Image was too big for Discord. Check https://dunestats.cc/matches for the screenshot.'; 
  }

  await channel.send(messagePayload);

  await supabase.from('games').update({ announced_to_discord: true }).eq('id', gameId);

  // Auto-mark schedule row as played
  if (payload.game?.tournament_num && payload.tournamentDetails) {
    try {
      await supabase
        .from('tournament_match_schedules')
        .update({
          status: 'played',
          updated_at: new Date().toISOString()
        })
        .eq('tournament_num', payload.game.tournament_num)
        .eq('round_type', payload.tournamentDetails.roundType)
        .eq('table_identifier', payload.tournamentDetails.tableIdentifier);
    } catch (schedErr) {}
  }
}

function scheduleAnnouncement(gameId) {
  if (pendingGames.has(gameId)) return;
  pendingGames.add(gameId);
  setTimeout(async () => {
    pendingGames.delete(gameId);
    try { await announceGame(gameId); } catch (err) {}
  }, GAME_ROWS_WAIT_MS);
}

function startRealtimeListener() {
  supabase.channel('game_results_inserts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_results' }, (payload) => {
    const gameId = payload?.new?.game_id;
    if (gameId) scheduleAnnouncement(gameId);
  }).subscribe();
}

function startGlobalDatabaseListener() {
  supabase.channel('global_db_sync').on('postgres_changes', { event: '*', schema: 'public' }, async (payload) => {
    const { table, eventType, new: newRecord, old: oldRecord } = payload;
    if (table === 'tournament_registrations') {
      const rec = newRecord || oldRecord;
      if (!rec) return;
      const targetRoleId = TOURNAMENT_ROLE_MAP[Number(rec.tournament_num)];
      if (targetRoleId) {
        await syncSingleUserRole(rec.discord_username, targetRoleId, (eventType !== 'DELETE') && (newRecord?.active_on_discord === true));
      }
    }
  }).subscribe();
}

async function syncSingleUserRole(discordUsername, roleId, shouldHaveRole) {
  if (!discordUsername) return;
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    const role = guild.roles.cache.get(roleId);
    if (!guild || !role) return;
    const member = await searchGuildMemberByNames(guild, [discordUsername]);
    if (!member) return;
    const hasRole = member.roles.cache.has(roleId);
    if (shouldHaveRole && !hasRole) await member.roles.add(role);
    else if (!shouldHaveRole && hasRole) await member.roles.remove(role);
  } catch (err) {}
}

// -------------------------------------------------------------
// 🔄 LIVE TOURNAMENT VOTING & AUTOMATIC SELF-UPDATING EMBED
// -------------------------------------------------------------
async function handleTournamentVotingReaction(message, user, emojiName, isAdd) {
  const allowedEmojis = ['🇦', '🇧', '🇨'];
  if (!allowedEmojis.includes(emojiName)) return;

  const { data: schedule, error } = await supabase
    .from('tournament_match_schedules')
    .select('*')
    .eq('message_id', message.id)
    .single();

  if (error || !schedule || schedule.mode !== 'live' || schedule.status === 'played') return;
  if (!schedule.player_discord_ids || !schedule.player_discord_ids.includes(user.id)) return;

  let currentVotes = schedule.votes || {};
  let userSelected = currentVotes[user.id] || [];

  if (isAdd) {
    if (!userSelected.includes(emojiName)) userSelected.push(emojiName);
  } else {
    userSelected = userSelected.filter(e => e !== emojiName);
  }

  if (userSelected.length > 0) {
    currentVotes[user.id] = userSelected;
  } else {
    delete currentVotes[user.id];
  }

  const votedUserIds = Object.keys(currentVotes);
  const votesCount = votedUserIds.length;

  // 1. UPDATE THE EMBED IN THE PINNED THREAD MESSAGE
  try {
    const fetchedMsg = await message.channel.messages.fetch(schedule.message_id).catch(() => null);
    if (fetchedMsg && fetchedMsg.embeds.length > 0) {
      const originalEmbed = fetchedMsg.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed);

      const slotLines = (schedule.suggested_slots || []).map((slot) => {
        const votersForSlot = schedule.player_discord_ids.filter(
          id => currentVotes[id] && currentVotes[id].includes(slot.label)
        );
        const voterMentions = votersForSlot.length > 0
          ? ` — ${votersForSlot.map(id => `<@${id}>`).join(' ')}`
          : '';
        return `${slot.label} ${slot.time_text}${voterMentions}`;
      });

      const nonVoters = schedule.player_discord_ids.filter(id => !votedUserIds.includes(id));
      const nonVoterDisplay = nonVoters.length > 0
        ? `\n\n**⏳ Did not vote yet (${votesCount}/4):**\n${nonVoters.map(id => `<@${id}>`).join(', ')}`
        : `\n\n**✅ All 4 players have voted!**`;

      const updatedFields = originalEmbed.fields.filter(f => !f.name.includes('Suggested Time Slots'));
      updatedFields.push({
        name: '📅 Suggested Time Slots & Votes',
        value: `${slotLines.join('\n')}${nonVoterDisplay}`,
        inline: false
      });

      updatedEmbed.setFields(updatedFields);
      await fetchedMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
  } catch (embedUpdateErr) {
    console.error('Failed to update live guidelines embed with votes:', embedUpdateErr);
  }

  // 2. CHECK CONSENSUS STATUS
  const slotScores = { '🇦': 0, '🇧': 0, '🇨': 0 };
  for (const uid of votedUserIds) {
    for (const slot of currentVotes[uid]) {
      if (slotScores[slot] !== undefined) slotScores[slot]++;
    }
  }

  // Pick earliest slot that received 4 votes
  const winningSlot = allowedEmojis.find(slot => slotScores[slot] >= 4);

  let newStatus = schedule.status;
  if (winningSlot) {
    newStatus = 'confirmed';
  } else if (votesCount >= 4) {
    newStatus = 'conflict';
  } else {
    newStatus = 'pending_votes';
  }

  await supabase
    .from('tournament_match_schedules')
    .update({
      votes: currentVotes,
      votes_count: votesCount,
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', schedule.id);

  // 3. 60-SECOND DEBOUNCE TIMER FOR CONFIRMATION
  const debounceKey = `schedule_${schedule.id}`;

  if (scheduleDebounceTimers.has(debounceKey)) {
    clearTimeout(scheduleDebounceTimers.get(debounceKey));
    scheduleDebounceTimers.delete(debounceKey);
  }

  if (newStatus === 'confirmed') {
    const timer = setTimeout(async () => {
      scheduleDebounceTimers.delete(debounceKey);

      // Re-query database to ensure consensus still holds after 60s
      const { data: fresh } = await supabase
        .from('tournament_match_schedules')
        .select('*')
        .eq('id', schedule.id)
        .single();

      if (!fresh || fresh.status !== 'confirmed') return;

      const freshVotes = fresh.votes || {};
      const freshScores = { '🇦': 0, '🇧': 0, '🇨': 0 };
      for (const uid of Object.keys(freshVotes)) {
        for (const slot of freshVotes[uid]) {
          if (freshScores[slot] !== undefined) freshScores[slot]++;
        }
      }
      const finalWinSlot = allowedEmojis.find(s => freshScores[s] >= 4);
      if (!finalWinSlot) return;

      const matchedSlot = (fresh.suggested_slots || []).find(s => s.label === finalWinSlot);
      let confirmedTimestamp = null;
      let confirmedDate = null;
      const confirmedTimeText = matchedSlot ? matchedSlot.time_text : 'Agreed Time';

      const matchDiscord = String(confirmedTimeText).match(/<t:(\d+)/);
      if (matchDiscord) {
        confirmedDate = new Date(parseInt(matchDiscord[1], 10) * 1000);
        confirmedTimestamp = confirmedDate.toISOString();
      } else {
        const parsed = Date.parse(confirmedTimeText);
        if (!isNaN(parsed)) {
          confirmedDate = new Date(parsed);
          confirmedTimestamp = confirmedDate.toISOString();
        }
      }

      await supabase
        .from('tournament_match_schedules')
        .update({
          confirmed_slot: finalWinSlot,
          confirmed_time_text: confirmedTimeText,
          confirmed_timestamp: confirmedTimestamp,
          updated_at: new Date().toISOString()
        })
        .eq('id', fresh.id);

      const playerMentions = fresh.player_discord_ids.map(id => `<@${id}>`).join(' ');
      const matchTitle = `[${fresh.match_code}] ${fresh.round_type} ${fresh.table_identifier}`;
      const calUrl = confirmedDate ? generateGoogleCalendarUrl(matchTitle, confirmedDate) : null;

      const confirmEmbed = new EmbedBuilder()
        .setTitle(`📅 Match Time Confirmed: ${matchTitle}`)
        .setColor(0x2ECC71)
        .setDescription(`All 4 players agreed! Match locked in for **${confirmedTimeText}**.\n\nPlease let your opponents know on time if you need to reschedule.`)
        .setTimestamp();

      const components = [];
      if (calUrl) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('Add to Google Calendar')
              .setStyle(ButtonStyle.Link)
              .setURL(calUrl)
              .setEmoji('📅')
          )
        );
      }

      await message.channel.send({
        content: `👥 ${playerMentions}`,
        embeds: [confirmEmbed],
        components: components
      }).catch(() => {});

    }, 60 * 1000); // 60-second debounce

    scheduleDebounceTimers.set(debounceKey, timer);

  } else if (newStatus === 'conflict') {
    const playerMentions = schedule.player_discord_ids.map(id => `<@${id}>`).join(' ');
    const conflictEmbed = new EmbedBuilder()
      .setTitle(`⚠️ Scheduling Conflict: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`)
      .setColor(0xE74C3C)
      .setDescription(`All 4 players have voted, but no single slot reached unanimous agreement.\n\nPlease coordinate in this thread or use \`/confirm\` to lock in an agreed time.`)
      .setTimestamp();

    await message.channel.send({
      content: `👥 ${playerMentions}\n🛡️ <@&${TOURNAMENT_HOST_ROLE_ID}>`,
      embeds: [conflictEmbed]
    }).catch(() => {});
  }
}

discordClient.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = slashCommands.get(interaction.commandName); if (!command) return;
    try {
      await command.execute(interaction, { supabase, discordClient });
    } catch (error) {
      console.error(`Error running /${interaction.commandName}:`, error);
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: 'Something went wrong.' }).catch(() => {});
      else await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  }
});

discordClient.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const emojiName = reaction.emoji.name || reaction.emoji.toString();
    await handleTournamentVotingReaction(reaction.message, user, emojiName, true);
  } catch (err) {
    console.error('Reaction Add Error:', err);
  }
});

discordClient.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const emojiName = reaction.emoji.name || reaction.emoji.toString();
    await handleTournamentVotingReaction(reaction.message, user, emojiName, false);
  } catch (err) {
    console.error('Reaction Remove Error:', err);
  }
});

discordClient.once('clientReady', async () => {
  console.log('Logged in as', discordClient.user.tag);
  startRealtimeListener();
  startGlobalDatabaseListener();

  if (DISCORD_CLIENT_ID && DISCORD_GUILD_ID) {
    try {
      const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
      const commands = Array.from(slashCommands.values()).map(c => c.data.toJSON());
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });
      console.log('Successfully registered all commands.');
    } catch (error) { console.error('Failed to register commands:', error); }
  }
});

discordClient.login(DISCORD_BOT_TOKEN);
