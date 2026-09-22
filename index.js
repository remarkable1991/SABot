require('dotenv').config();

const http = require('http');
// 1. Instantly spin up health check to satisfy Railway web service requirements
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is live!');
}).listen(PORT, () => {
  console.log(`Health check server instantly listening on port ${PORT}`);
});

const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder, userMention, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, MessageFlags } = require('discord.js');
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
const checkinCommand = require('./checkin');
const { TOURNAMENTS_CONFIG } = require('./tournament-config');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const sharp = require('sharp');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1233029532785573918';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const LIVE_SETTINGS_CHANNEL_ID = '1534192105533083648';
const ASYNC_SETTINGS_CHANNEL_ID = '1084215554841264169';

// Web LFG Channels
const WEB_LFG_ASYNC_CHANNEL = '1258014952199950449';
const WEB_LFG_LIVE_CHANNEL = '1258016587617931284';

// --- R2 PUBLIC BUCKET CONFIG ---
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL || 'https://pub-f1cf1291e80f47448517d28bc5cb51b3.r2.dev';
const R2_MATCHES_BASE = process.env.R2_MATCHES_BASE_URL || 'https://pub-6fb62f34a2e3491fa0c7c71cc9a969fd.r2.dev';

const GAME_ROWS_WAIT_MS = 5000; 
const REALTIME_RETRY_DELAY_MS = 5000;
const REALTIME_MAX_RETRIES = 10;
const MEMBER_SEARCH_LIMIT = 10;
const DB_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_GAP = 0.08;
const TAG_COOLDOWN_MS = 45 * 60 * 1000; // 45 minutes
const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421';

// --- AI SCAN STATUS ANNOUNCEMENT CONFIG ---
const SCAN_RESULTS_CHANNEL_ID = '1519019834011160576';
const AI_SCAN_IGNORED_STATUS = 'No'; 
const SCAN_STATUS_TITLES = {
  'Yes': '✅ Match Verified',
  'Issue detected': '⚠️ Issue Detected',
  'Manually reviewed': '🔍 Manually Reviewed'
};
const SCAN_STATUS_COLORS = {
  'Yes': 0x2ECC71,
  'Issue detected': 0xE74C3C,
  'Manually reviewed': 0x9B59B6
};

const TOURNAMENT_ROLE_MAP = Object.fromEntries(
  Object.entries(TOURNAMENTS_CONFIG)
    .filter(([, cfg]) => cfg.registeredRoleId)
    .map(([num, cfg]) => [Number(num), cfg.registeredRoleId])
);

const CHECKIN_REMINDER_CHANNEL_ID = '1084215380517605486';
const CHECKIN_EMOJI_NAME = 'SA';

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
  auth: { autoRefreshToken: true, persistSession: false },
  realtime: { transport: WebSocket, params: { eventsPerSecond: 10 } },
  global: { WebSocket }
});

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions 
  ],
  partials: [ Partials.Message, Partials.Channel, Partials.Reaction ]
});

const slashCommands = new Map([
  [statsCommand.data.name, statsCommand], [asyncCommand.data.name, asyncCommand],
  [liveCommand.data.name, liveCommand], [fixCommand.data.name, fixCommand],
  [tournamentCommand.data.name, tournamentCommand], [massThreadsCommand.data.name, massThreadsCommand],
  [spCommand.data.name, spCommand], [confirmCommand.data.name, confirmCommand],
  [tournamentStatusCommand.data.name, tournamentStatusCommand], [checkinCommand.data.name, checkinCommand]
]);

const pendingGames = new Set();
const pendingScanRefresh = new Set();
const scheduleDebounceTimers = new Map();
let realtimeRetryCount = 0;
let realtimeChannel = null;
let reconnectTimer = null;

function capitalize(word) { return word ? word.charAt(0).toUpperCase() + word.slice(1) : ''; }
function normalizeName(value) { return String(value || '').trim().toLowerCase().replace(/^[.\s]+|[.\s]+$/g, '').replace(/[^a-z0-9]/g, ''); }

function similarity(a, b) {
  const x = normalizeName(a); const y = normalizeName(b);
  if (!x || !y) return 0; if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  const dp = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return 1 - dp[x.length][y.length] / Math.max(x.length, y.length);
}

function formatDelta(value) { const num = Number(value || 0); return (num > 0 ? '+' : '') + num.toFixed(2); }
function getEmoji(guild, name, fallback) {
  if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
  const emoji = guild.emojis.cache.find((e) => e.name === name);
  return emoji ? emoji.toString() : fallback;
}
function getLeaderEmoji(guild, leaderName) { return getEmoji(guild, LEADER_EMOJI_MAP[leaderName], ''); }
function getPlacementEmoji(guild, placement) {
  const map = { 1: { name: 'Tournament', fallback: '1st' }, 2: { name: '2ndTrophy', fallback: '2nd' }, 3: { name: '3rdTrophy', fallback: '3rd' }, 4: { name: '4thTrophy', fallback: '4th' } };
  return map[placement] ? getEmoji(guild, map[placement].name, map[placement].fallback) : String(placement);
}

function buildGameTags(game, guild) {
  const tags = [];
  if (game.has_epic_mode) tags.push(getEmoji(guild, 'Epic', 'Epic') + ' Epic Mode');
  if (game.has_immortality) tags.push(getEmoji(guild, 'Immo', 'Immo') + ' Immortality');
  if (game.has_rise_of_ix) tags.push(getEmoji(guild, 'Ix', 'Ix') + ' Rise of IX');
  if (String(game.game_version || '').toLowerCase() === 'uprising') tags.push(getEmoji(guild, 'Uprising', 'Uprising') + ' Uprising');
  if (game.has_base_leaders) tags.push('Base Leaders');
  return tags;
}

function normalizeDiscordId(value) { const id = String(value || '').trim(); return /^\d{17,20}$/.test(id) ? id : null; }

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
  if (error || !data || !data.length) return null;
  let best = null, bestScore = 0;
  for (const row of data) {
    const score = Math.max(similarity(playerName, row.player_key), similarity(playerName, row.display_name), similarity(playerName, row.discord_username), similarity(playerName, row.username));
    if (score > bestScore) { best = row; bestScore = score; }
  }
  return bestScore >= DB_MATCH_THRESHOLD ? best : null;
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
        if (!existing || score > existing.score) seen.set(member.id, { member, score });
      }
    } catch (err) {}
  }
  const ranked = Array.from(seen.values()).sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score < GUILD_MATCH_THRESHOLD) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < GUILD_MATCH_GAP) return null;
  return ranked[0].member;
}

async function persistDiscordUserId(dbMatch, discordUserId) {
  const normalizedId = normalizeDiscordId(discordUserId);
  if (!dbMatch || !dbMatch.id || !normalizedId || normalizeDiscordId(dbMatch.discord_user_id) === normalizedId) return;
  await supabase.from('player_discord_map').update({ discord_user_id: normalizedId, updated_at: new Date().toISOString() }).eq('id', dbMatch.id);
}

async function resolveMentionForName(guild, playerName) {
  const dbMatch = await getDatabasePlayerMap(playerName);
  const mappedDiscordId = normalizeDiscordId(dbMatch && dbMatch.discord_user_id);
  if (mappedDiscordId) return userMention(mappedDiscordId);
  const searchNames = [dbMatch && dbMatch.discord_username, dbMatch && dbMatch.display_name, dbMatch && dbMatch.username, dbMatch && dbMatch.player_key, playerName].filter(Boolean);
  const member = await searchGuildMemberByNames(guild, searchNames);
  if (member && member.id) { await persistDiscordUserId(dbMatch, member.id); return userMention(member.id); }
  if (dbMatch && dbMatch.discord_username) return '(' + dbMatch.discord_username + ')';
  return null;
}

async function createDiscordImagePayload(storagePath) {
  if (!storagePath) return null;
  const publicUrl = `${R2_PUBLIC_BASE}/${storagePath}`;
  let attempts = 3, response = null;
  while (attempts > 0) {
    try { response = await fetch(publicUrl); if (response.ok) break; } catch (e) {}
    attempts -= 1; if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 2500));
  }
  if (!response || !response.ok) return null;
  try {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const maxBytes = Math.floor(7.5 * 1024 * 1024);
    if (!contentType.startsWith('image/')) return { attachment: null, imageUrl: publicUrl, tooLarge: false };
    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    if (buffer.length <= maxBytes) return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.png' }), imageUrl: null, tooLarge: false };
    try {
      buffer = await sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
      if (buffer.length <= maxBytes) return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.jpg' }), imageUrl: null, tooLarge: false };
      buffer = await sharp(buffer).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 62, mozjpeg: true }).toBuffer();
      if (buffer.length <= maxBytes) return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.jpg' }), imageUrl: null, tooLarge: false };
    } catch (e) {}
    return { attachment: null, imageUrl: publicUrl, tooLarge: true };
  } catch (err) { return { attachment: null, imageUrl: null, tooLarge: false }; }
}

async function buildGameResultPayload(gameId) {
  const { data: game, error: gameError } = await supabase.from('games').select('id, public_match_id, game_version, image_url, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, tournament_num').eq('id', gameId).single();
  if (gameError || !game) return null;
  const { data: results, error: resultsError = null } = await supabase.from('game_results').select('player_name, leader_name, placement, points, elo_delta, elo_delta_overall').eq('game_id', gameId).order('placement', { ascending: true });
  if (resultsError || !results || !results.length) return null;
  
  let tournamentDetails = null;
  if (game.tournament_num) {
    try {
      const currentPlayers = results.map(r => normalizeName(r.player_name));
      const { data: matchRows } = await supabase.from('tournament_matches').select('round_type, table_identifier, player_name').eq('tournament_num', game.tournament_num);
      if (matchRows && matchRows.length > 0) {
        const tablesMap = new Map();
        matchRows.forEach(row => {
          const groupKey = `${row.round_type}||${row.table_identifier}`;
          if (!tablesMap.has(groupKey)) tablesMap.set(groupKey, { roundType: row.round_type, tableIdentifier: row.table_identifier, players: [] });
          tablesMap.get(groupKey).players.push(normalizeName(row.player_name));
        });
        const matchedTable = Array.from(tablesMap.values()).find(t => currentPlayers.every(p => t.players.includes(p)));
        if (matchedTable) tournamentDetails = { roundType: matchedTable.roundType, tableIdentifier: matchedTable.tableIdentifier };
      }
    } catch (err) {}
  }

  const playerKeys = results.map(r => String(r.player_name || '').toLowerCase());
  const { data: ratings } = await supabase.from('player_ratings').select('player_key, display_name, game_version, elo').in('player_key', playerKeys).in('game_version', ['overall', game.game_version]);
  const ratingsMap = {};
  for (const row of ratings || []) {
    if (!ratingsMap[row.player_key]) ratingsMap[row.player_key] = {};
    ratingsMap[row.player_key][row.game_version] = row.elo;
  }

  const { data: sandboxResults } = await supabase.from('sandbox_game_results').select('player_name, elo_delta_overall').eq('game_id', gameId);
  const sandboxDeltaMap = {};
  for (const row of sandboxResults || []) sandboxDeltaMap[normalizeName(row.player_name)] = row.elo_delta_overall;

  const { data: sandboxRatings } = await supabase.from('sandbox_player_ratings').select('player_key, overall_vp_elo').in('player_key', playerKeys).eq('game_version', 'overall');
  const sandboxRatingsMap = {};
  for (const row of sandboxRatings || []) sandboxRatingsMap[row.player_key] = row.overall_vp_elo;

  const screenshotMedia = game.image_url ? await createDiscordImagePayload(game.image_url) : null;
  return { game, results, ratingsMap, sandboxDeltaMap, sandboxRatingsMap, screenshotMedia, tournamentDetails };
}

async function buildEmbed(payload, guild) {
  const { game, results, ratingsMap, sandboxDeltaMap, sandboxRatingsMap, screenshotMedia, tournamentDetails: tourney } = payload;
  const modeLabel = capitalize(game.game_version || 'unknown'); 
  const tags = buildGameTags(game, guild); 
  const lines = [];
  
  let titleString = `Game Finished - ${modeLabel}`;
  if (game.tournament_num) titleString = tourney ? `🏆 Tournament ${game.tournament_num} | ${tourney.roundType} ${tourney.tableIdentifier}` : `🏆 Tournament ${game.tournament_num} Match Finished!`;

  for (const row of results) {
    const place = getPlacementEmoji(guild, row.placement); 
    const playerKey = String(row.player_name || '').toLowerCase();
    const normalizedKey = normalizeName(row.player_name);
    const mention = await resolveMentionForName(guild, row.player_name);
    const leaderEmoji = getLeaderEmoji(guild, row.leader_name);

    let text = `${place} **${row.player_name}** ${mention || ''} - ${leaderEmoji}${row.leader_name || 'Unknown Leader'} - ${row.points ?? '?'} pts`;
    text += `\nOverall: ${formatDelta(row.elo_delta_overall)}`;
    if (ratingsMap[playerKey]?.overall !== undefined) text += ` (-> ${Number(ratingsMap[playerKey].overall).toFixed(1)})`;
    text += ` | ${modeLabel}: ${formatDelta(row.elo_delta)}`;
    if (ratingsMap[playerKey]?.[game.game_version] !== undefined) text += ` (-> ${Number(ratingsMap[playerKey][game.game_version]).toFixed(1)})`;
    if (sandboxDeltaMap[normalizedKey] !== undefined) {
      text += ` | All VP: ${formatDelta(sandboxDeltaMap[normalizedKey])}`;
      if (sandboxRatingsMap[playerKey] !== undefined) text += ` (-> ${Number(sandboxRatingsMap[playerKey]).toFixed(1)})`;
    }
    lines.push(text);
  }

  if (tags.length) lines.push('Game modes played: ' + tags.join(' | '));

  const embed = new EmbedBuilder()
    .setTitle(titleString)
    .setURL(game.public_match_id ? `https://dunestats.cc/match/${game.public_match_id}` : `https://dunestats.cc/matches`)
    .setDescription(lines.join('\n\n'))
    .setColor(game.tournament_num ? 0xd35400 : 0xC9A24B)
    .setTimestamp(new Date());

  if (screenshotMedia?.imageUrl) embed.setImage(screenshotMedia.imageUrl);
  return { embed, screenshotMedia };
}

async function announceGame(gameId) {
  const { data: checkGame } = await supabase.from('games').select('announced_to_discord').eq('id', gameId).single();
  if (checkGame && checkGame.announced_to_discord) return;

  const payload = await buildGameResultPayload(gameId); 
  if (!payload) return;

  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID); 
  if (!channel) return; 

  const built = await buildEmbed(payload, channel.guild); 
  const messagePayload = { embeds: [built.embed] };

  if (built.screenshotMedia?.attachment) messagePayload.files = [built.screenshotMedia.attachment]; 
  else if (built.screenshotMedia?.tooLarge) messagePayload.content = 'Image was too big for Discord. Check https://dunestats.cc/matches for the screenshot.'; 

  await channel.send(messagePayload);
  await supabase.from('games').update({ announced_to_discord: true }).eq('id', gameId);

  if (payload.game?.tournament_num && payload.tournamentDetails) {
    try {
      await supabase.from('tournament_match_schedules').update({ status: 'played', updated_at: new Date().toISOString() })
        .eq('tournament_num', payload.game.tournament_num).eq('round_type', payload.tournamentDetails.roundType).eq('table_identifier', payload.tournamentDetails.tableIdentifier);
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
function scheduleScanRefresh(gameId) {
  if (!gameId || pendingScanRefresh.has(gameId)) return;
  pendingScanRefresh.add(gameId);
  setTimeout(async () => {
    pendingScanRefresh.delete(gameId);
    try {
      const { data: game, error } = await supabase
        .from('games')
        .select('ai_scan_status')
        .eq('id', gameId)
        .single();

      if (error || !game || !game.ai_scan_status || game.ai_scan_status === AI_SCAN_IGNORED_STATUS) return;

      await announceOrUpdateScanResult(gameId);
    } catch (err) {
      console.error('Error refreshing scan result after game_results change', gameId, err);
    }
  }, GAME_ROWS_WAIT_MS);
}
// -------------------------------------------------------------
// 🌐 WEB LOBBIES / QUICK CHAT / ROSTER RENDERING HANDLERS
// -------------------------------------------------------------
async function getDiscordMentionsForWebPlayers(webIds) {
  if (!webIds || webIds.length === 0) return {};
  const { data } = await supabase.from('player_discord_map').select('claimed_by, discord_user_id').in('claimed_by', webIds);
  const map = {};
  if (data) data.forEach(row => { if (row.discord_user_id) map[row.claimed_by] = ` <@${row.discord_user_id}>`; });
  return map;
}

// Universal unified roster renderer that prevents duplicates and fetches IGNs automatically
async function buildRosterDisplay(lobby) {
  const pIds = lobby.player_ids || [];
  const guests = lobby.guest_players || [];
  const webNames = lobby.web_player_names || [];
  const webIds = lobby.web_player_ids || [];
  const notifies = lobby.notify_user_ids || [];

  const webMentionsMap = await getDiscordMentionsForWebPlayers(webIds);
  const discordIgnMap = {};
  
  if (pIds.length > 0) {
    const { data: dMap } = await supabase.from('player_discord_map').select('discord_user_id, player_key').in('discord_user_id', pIds);
    if (dMap) dMap.forEach(r => discordIgnMap[r.discord_user_id] = capitalize(r.player_key));
  }

  const rosterLines = [];
  const seenDiscordIds = new Set();
  let actualCount = 0;

  for (const id of pIds) {
    seenDiscordIds.add(id);
    const ign = discordIgnMap[id];
    const bell = notifies.includes(id) ? ' 🔔' : '';
    rosterLines.push(ign ? `• **${ign}** <@${id}>${bell}` : `• <@${id}>${bell}`);
    actualCount++;
  }

  for (let i = 0; i < webNames.length; i++) {
    const name = webNames[i];
    const wId = webIds[i];
    let dId = null;
    if (wId && webMentionsMap[wId]) {
      const match = webMentionsMap[wId].match(/<@(\d+)>/);
      if (match) dId = match[1];
    }

    if (dId && seenDiscordIds.has(dId)) continue; 

    const mention = dId ? ` <@${dId}>` : '';
    rosterLines.push(`• **${name}** 🌐${mention}`);
    if (dId) seenDiscordIds.add(dId);
    actualCount++;
  }

  for (const guest of guests) {
    rosterLines.push(`• ${guest} 👥`);
    actualCount++;
  }

  return { display: rosterLines.join('\n') || 'None', count: actualCount };
}

async function syncLobbyEmbed(lobby) {
  if (!lobby.channel_id || !lobby.message_id) return;
  const channel = await discordClient.channels.fetch(lobby.channel_id).catch(()=>null);
  if (!channel) return;
  const msg = await channel.messages.fetch(lobby.message_id).catch(()=>null);
  if (!msg || !msg.embeds || !msg.embeds[0]) return;

  const { display, count } = await buildRosterDisplay(lobby);

  let hostDisplay = 'Web Player 🌐';
  if (lobby.host_id) {
     const { data: mapData } = await supabase.from('player_discord_map').select('player_key').eq('discord_user_id', lobby.host_id).maybeSingle();
     if (mapData && mapData.player_key) hostDisplay = `**${capitalize(mapData.player_key)}** <@${lobby.host_id}>`;
     else hostDisplay = `<@${lobby.host_id}>`;
  } else if (lobby.web_player_names && lobby.web_player_names.length > 0) {
     hostDisplay = `**${lobby.web_player_names[0]} 🌐**`;
     if (lobby.web_player_ids && lobby.web_player_ids[0]) {
         const webMentionsMap = await getDiscordMentionsForWebPlayers([lobby.web_player_ids[0]]);
         if (webMentionsMap[lobby.web_player_ids[0]]) hostDisplay += webMentionsMap[lobby.web_player_ids[0]];
     }
  }

  const oldDetails = msg.embeds[0].fields[0].value;
  const verb = oldDetails.includes('created a lobby') ? 'created a lobby for' : 'is looking for players for';
  const expText = (lobby.expansions && lobby.expansions.length > 0) ? ` with ${lobby.expansions.join(', ')}` : '';
  const boardText = lobby.board_type || 'Base Game';
  
  const newDetailsLine = `${hostDisplay} ${verb} ${boardText}${expText}.`;
  const timerLine = oldDetails.split('\n')[1] || `*Lobby expires <t:${Math.floor(new Date(lobby.expires_at).getTime()/1000)}:R>.*`;

  const embed = EmbedBuilder.from(msg.embeds[0]);
  if (lobby.message_text) embed.setDescription(`"${lobby.message_text}"`);
  
  embed.setFields(
    { name: '📝 Match Details', value: `${newDetailsLine}\n${timerLine}`, inline: false },
    { name: '🔑 Password', value: lobby.lobby_password && lobby.lobby_password !== 'None' ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
    { name: `👥 Players (${count}/4)`, value: display, inline: false },
    { name: msg.embeds[0].fields[3].name, value: msg.embeds[0].fields[3].value, inline: false }
  );

  await msg.edit({ embeds: [embed] }).catch(err => console.error('Failed to sync embed roster via Web update:', err));
}

async function handleWebLobbyCreation(lobby) {
  try {
    const isLive = lobby.mode === 'live';
    const channelId = isLive ? WEB_LFG_LIVE_CHANNEL : WEB_LFG_ASYNC_CHANNEL;
    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (!channel) return console.error('LFG channel not found for Web Lobby Creation.');

    let hostName = 'Web Player';
    let discordMention = '';

    if (lobby.web_host_id) {
      const { data: mapData } = await supabase.from('player_discord_map').select('player_key, discord_user_id').eq('claimed_by', lobby.web_host_id).limit(1);
      if (mapData && mapData.length > 0) {
        hostName = capitalize(mapData[0].player_key);
        if (mapData[0].discord_user_id) discordMention = ` <@${mapData[0].discord_user_id}>`;
      }
    }

    const cleanHostName = hostName.replace(/[^a-zA-Z0-9]/g, '') || 'Host';
    const prefixPattern = `${cleanHostName}-${isLive ? 'L' : 'A'}`;
    let generatedMatchId = `${prefixPattern}1`;

    const { data: existingHostLobbies } = await supabase.from('active_async_matches').select('match_id').ilike('match_id', `${prefixPattern}%`);
    if (existingHostLobbies && existingHostLobbies.length > 0) {
      let maxNumber = 0;
      existingHostLobbies.forEach((row) => {
        const match = row.match_id ? row.match_id.match(new RegExp(`^${cleanHostName}-[LA](\\d+)$`, 'i')) : null;
        if (match && parseInt(match[1], 10) > maxNumber) maxNumber = parseInt(match[1], 10);
      });
      generatedMatchId = `${prefixPattern}${maxNumber + 1}`;
    }

    const emojiTarget = isLive ? '⚔️' : '🎲';
    const embedColor = isLive ? 0xe74c3c : 0xC9A24B;
    const roleId = isLive ? '1219666679764877424' : '1219666516644204554';
    
    const expStrings = lobby.expansions || [];
    const expText = expStrings.length > 0 ? ` with ${expStrings.join(', ')}` : '';
    const boardDisplay = lobby.board_type ? lobby.board_type : 'Base Game';
    const statusSentence = `**${hostName} 🌐**${discordMention} created a lobby for ${boardDisplay}${expText}.`;

    let customPingSentence = `**${hostName} 🌐**${discordMention} is looking for ${isLive ? 'live' : 'async'} players <@&${roleId}>`;
    if (lobby.board_type && lobby.board_type !== 'Base Game') customPingSentence += ` for ${lobby.board_type}`;
    else if (lobby.board_type === 'Base Game') customPingSentence += ` for Base Game`;
    customPingSentence += `${expText}.`;

    const embedTitle = hostName !== 'Web Player' ? `${emojiTarget} ${hostName}'s Game [ID:${generatedMatchId}]` : `${emojiTarget} New Match Open! [ID:${generatedMatchId}]`;
    const tempLobby = { ...lobby, web_player_names: [hostName], web_player_ids: [lobby.web_host_id] };
    const { display: rosterStr } = await buildRosterDisplay(tempLobby);

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setDescription(`"${lobby.message_text || 'Looking for players via the Website!'}"`)
      .setColor(embedColor)
      .addFields(
        { name: '📝 Match Details', value: `${statusSentence}\n*Lobby expires <t:${Math.floor(new Date(lobby.expires_at).getTime()/1000)}:R>.*`, inline: false },
        { name: '🔑 Password', value: lobby.lobby_password && lobby.lobby_password !== 'None' ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
        { name: `👥 Players (1/4)`, value: rosterStr, inline: false },
        { name: 'Reaction Legend', value: [`${emojiTarget} • **Join / Leave** the lobby`, `🎮 • **Start Game** (Requires 2+ players)`, `❌ • **Cancel Lobby** (Host only)`, `🔔 • **Toggle Ping Alerts**`, `📢 • **Ping Lobby Role** (45m cooldown)`].join('\n'), inline: false }
      )
      .setFooter({ text: `Lobby created from dunestats.cc/lobbies` }).setTimestamp();

    let copyableContent = `🎮 Match ID: \`${generatedMatchId}\``;
    if (lobby.lobby_password && lobby.lobby_password !== 'None') copyableContent += `\n🔑 Lobby Password: \`${lobby.lobby_password}\` *(Tap to copy)*`;

    const message = await channel.send({ content: copyableContent, embeds: [embed] });

    try {
      const customJoinEmoji = channel.guild.emojis.cache.find(e => e.name === (isLive ? 'LiveDune' : 'AsyncDune'));
      await message.react(customJoinEmoji ? customJoinEmoji : emojiTarget).catch(() => {});
      await message.react('🎮').catch(() => {}); await message.react('❌').catch(() => {});
      await message.react('🔔').catch(() => {}); await message.react('📢').catch(() => {});
    } catch (reactErr) {}

    const pingMessage = await channel.send({ content: customPingSentence, allowedMentions: { roles: [roleId] } });
    setTimeout(() => { pingMessage.delete().catch(() => {}); }, 1500);

    await supabase.from('active_async_matches').update({
      status: 'searching', match_id: generatedMatchId, message_id: message.id, channel_id: channel.id, guild_id: channel.guild.id,
      web_player_names: [hostName], web_player_ids: [lobby.web_host_id]
    }).eq('id', lobby.id);

  } catch (err) { console.error('Error creating Discord Lobby from Web Event:', err); }
}

async function executeLobbyPing(lobby, channel) {
  const now = new Date();
  const lastTagged = lobby.last_prompted_at ? new Date(lobby.last_prompted_at) : null;
  if (lastTagged && (now.getTime() - lastTagged.getTime() < TAG_COOLDOWN_MS)) return false;

  await supabase.from('active_async_matches').update({ last_prompted_at: now.toISOString() }).eq('id', lobby.id);
  lobby.last_prompted_at = now.toISOString();

  const isLiveLobby = lobby.mode === 'live';
  let roleId = isLiveLobby ? '1219666679764877424' : '1219666516644204554';
  
  const msg = await channel.messages.fetch(lobby.message_id).catch(() => null);
  if (!msg || !msg.embeds || !msg.embeds[0]) return true;

  const modeInformation = (msg.embeds[0].fields[0]?.value || '').split('\n')[0]
    .replace(/<@!?\d+>\s+is\s+looking\s+for\s+players\s+for\s+/i, '')
    .replace(/<@!?\d+>\s+is\s+looking\s+for\s+players\s+/i, '')
    .replace(/\*\*.+?\*\*\s+(?:<@\d+>\s+)?created\s+a\s+lobby\s+for\s+/i, '')
    .replace(/\*\*.+?\*\*\s+(?:<@\d+>\s+)?created\s+a\s+lobby\s+/i, '');

  let hostMentionString = 'Web Player 🌐';
  if (lobby.host_id) {
    const { data: mapData } = await supabase.from('player_discord_map').select('player_key').eq('discord_user_id', lobby.host_id).maybeSingle();
    hostMentionString = mapData && mapData.player_key ? `**${capitalize(mapData.player_key)}** <@${lobby.host_id}>` : `<@${lobby.host_id}>`;
  } else if (lobby.web_player_names && lobby.web_player_names.length > 0) {
    hostMentionString = `**${lobby.web_player_names[0]} 🌐**`;
    if (lobby.web_player_ids && lobby.web_player_ids[0]) {
      const webMentionsMap = await getDiscordMentionsForWebPlayers([lobby.web_player_ids[0]]);
      if (webMentionsMap[lobby.web_player_ids[0]]) hostMentionString += webMentionsMap[lobby.web_player_ids[0]];
    }
  }

  const totalCount = (lobby.player_ids?.length || 0) + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0);
  const optionalPasswordText = (lobby.lobby_password && lobby.lobby_password !== 'None') ? `Password: \`${lobby.lobby_password}\` ` : '';
  const accurateEndEmoji = isLiveLobby ? (getEmoji(channel.guild, 'LiveDune', '⚔️')) : (getEmoji(channel.guild, 'AsyncDune', '🎲'));
  const copyableMatchId = lobby.match_id ? `\n🎮 Match ID: \`${lobby.match_id}\`` : '';

  const tagMessage = `<@&${roleId}> ${hostMentionString} (${totalCount}/4) is looking for players for ${modeInformation}${optionalPasswordText}${accurateEndEmoji}${copyableMatchId}`;

  let historyCountMet = false;
  try {
    const fetchedHistory = await channel.messages.fetch({ after: msg.id, limit: 12 }).catch(() => null);
    if (fetchedHistory && fetchedHistory.size >= 5) historyCountMet = true;
  } catch (err) {}

  if (historyCountMet) {
    const newLobbyMsg = await channel.send({ content: tagMessage, embeds: [EmbedBuilder.from(msg.embeds[0])], allowedMentions: { roles: [roleId] } });
    try {
      const joinEmojiObj = channel.guild.emojis.cache.find(e => e.name === (isLiveLobby ? 'LiveDune' : 'AsyncDune'));
      await newLobbyMsg.react(joinEmojiObj ? joinEmojiObj : (isLiveLobby ? '⚔️' : '🎲')).catch(() => {});
      await newLobbyMsg.react('🎮').catch(() => {}); await newLobbyMsg.react('❌').catch(() => {});
      await newLobbyMsg.react('🔔').catch(() => {}); await newLobbyMsg.react('📢').catch(() => {});
    } catch (rErr) {}
    await supabase.from('active_async_matches').update({ message_id: newLobbyMsg.id }).eq('id', lobby.id);
    msg.reactions.cache.forEach(async (r) => { await r.users.remove(discordClient.user.id).catch(() => {}); });
    await msg.edit({ content: `➡️ **This lobby has moved to the bottom of the chat:** https://discord.com/channels/${channel.guild.id}/${channel.id}/${newLobbyMsg.id}`, embeds: [] }).catch(() => {});
  } else {
    await channel.send({ content: tagMessage, allowedMentions: { roles: [roleId] } });
  }
  return true;
}

async function handleWebQuickChat(chatRow) {
  const { lobby_id, sender_name, message_code } = chatRow;
  const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('id', lobby_id).single();
  if (!lobby || !lobby.channel_id) return;
  const channel = await discordClient.channels.fetch(lobby.channel_id).catch(() => null);
  if (!channel) return;

  if (message_code === 'room_up') await channel.send(`💬 **[🌐 ${sender_name}]**: 🎮 Room has been created in-game!`);
  else if (message_code === 'password_ask') await channel.send(`💬 **[🌐 ${sender_name}]**: 🔑 What is the in-game room password?`);
  else if (message_code === 'need_5') await channel.send(`💬 **[🌐 ${sender_name}]**: ⏳ Stepping away for 5 minutes, be right back!`);
  else if (message_code === 'lobby_name_ask') await channel.send(`💬 **[🌐 ${sender_name}]**: 📛 What is the in-game lobby name?`);
  else if (message_code === 'ping') await executeLobbyPing(lobby, channel);
}

function startRealtimeListener() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }

  realtimeChannel = supabase.channel('global_discord_listeners')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_results' }, (payload) => {
      if (payload && payload.new && payload.new.game_id) scheduleAnnouncement(payload.new.game_id);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lobby_quick_chats' }, (payload) => {
      if (payload.new) handleWebQuickChat(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'active_async_matches' }, async (payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      if (!newRecord) return;
      if (eventType === 'INSERT' && newRecord.status === 'pending_creation') await handleWebLobbyCreation(newRecord);
      
      if (eventType === 'UPDATE' && oldRecord) {
        if (
          JSON.stringify(oldRecord.web_player_names) !== JSON.stringify(newRecord.web_player_names) ||
          JSON.stringify(oldRecord.player_ids) !== JSON.stringify(newRecord.player_ids) ||
          JSON.stringify(oldRecord.guest_players) !== JSON.stringify(newRecord.guest_players) ||
          oldRecord.board_type !== newRecord.board_type ||
          JSON.stringify(oldRecord.expansions) !== JSON.stringify(newRecord.expansions) ||
          oldRecord.lobby_password !== newRecord.lobby_password ||
          oldRecord.message_text !== newRecord.message_text
        ) {
          await syncLobbyEmbed(newRecord);
        }
        if (oldRecord.status === 'searching' && newRecord.status === 'started') await executeLobbyStartSequence(newRecord);
      }
    })
    .subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') { 
        realtimeRetryCount = 0; 
        try {
          const { data: unannouncedGames } = await supabase.from('games').select('id').eq('announced_to_discord', false).lt('created_at', new Date(Date.now() - 10000).toISOString()).order('created_at', { ascending: true });
          if (unannouncedGames && unannouncedGames.length > 0) unannouncedGames.forEach(g => scheduleAnnouncement(g.id));
        } catch (catchUpErr) {}
        return; 
      }
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        supabase.realtime.setAuth(SUPABASE_SECRET_KEY);
        if (realtimeRetryCount >= REALTIME_MAX_RETRIES) realtimeRetryCount = 0; 
        realtimeRetryCount += 1; 
        const delay = Math.min(REALTIME_RETRY_DELAY_MS * realtimeRetryCount, 30000);
        if (!reconnectTimer) { reconnectTimer = setTimeout(() => { reconnectTimer = null; startRealtimeListener(); }, delay); }
      }
    });
}

function startGlobalDatabaseListener() {
  supabase.channel('global_db_sync')
    .on('postgres_changes', { event: '*', schema: 'public' }, async (payload) => {
        const { table, eventType, new: newRecord, old: oldRecord } = payload;
        
        if (table === 'tournament_registrations') {
          const rec = newRecord || oldRecord;
          if (rec && TOURNAMENT_ROLE_MAP[Number(rec.tournament_num)]) {
            await syncSingleUserRole(rec.discord_username, TOURNAMENT_ROLE_MAP[Number(rec.tournament_num)], (eventType !== 'DELETE') && (newRecord?.active_on_discord === true));
          }
        }
        if (table === 'games' && eventType === 'UPDATE' && newRecord) {
          if (newRecord.ai_scan_status && newRecord.ai_scan_status !== AI_SCAN_IGNORED_STATUS && newRecord.ai_scan_status !== (oldRecord ? oldRecord.ai_scan_status : undefined)) {
            try { await announceOrUpdateScanResult(newRecord.id); } catch (scanErr) {}
          }
        }
        if (table === 'game_results' && (eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.game_id) scheduleScanRefresh(newRecord.game_id);

        if (!newRecord) return;
        if (table === 'player_sp' && eventType === 'UPDATE' && newRecord.is_claimed === true) {
          const { data: mapRecord } = await supabase.from('player_discord_map').select('discord_user_id').eq('player_key', newRecord.player_key).single();
          if (mapRecord?.discord_user_id) await syncPlayerSpRole(mapRecord.discord_user_id, Number(newRecord.lifetime_sp));
        }
        if (table === 'sp_events' && eventType === 'INSERT') {
          try {
            const { data: mapRecord } = await supabase.from('player_discord_map').select('discord_user_id').eq('player_key', newRecord.player_key).single();
            const notificationChannel = await discordClient.channels.fetch(SP_NOTIFICATION_CHANNEL_ID).catch(() => null);
            if (notificationChannel && mapRecord?.discord_user_id) {
              const displayAction = newRecord.action_type === 'image_upload' ? 'Recruitment Proof Posted' : newRecord.action_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              const rewardClarity = newRecord.action_type === 'daily_first_message' ? 'Daily Bonus (First message of the day)' : newRecord.action_type === 'first_live_game' ? 'Daily Bonus (First live game of the day)' : newRecord.action_type === 'first_weekly_async' ? 'Weekly Bonus (First async game of the week)' : 'Standard Reward';
              const alertEmbed = new EmbedBuilder().setTitle('🪙 Strategy Points Earned!').setDescription(`Congratulations <@${mapRecord.discord_user_id}>!\nYou've earned a **${rewardClarity}**!`).setColor(0xf1c40f).addFields({ name: '✨ Action', value: `\`${displayAction}\``, inline: true }, { name: '💰 Reward', value: `**+${newRecord.amount} SP**`, inline: true }).setTimestamp();
              await notificationChannel.send({ content: `<@${mapRecord.discord_user_id}>`, embeds: [alertEmbed] });
            }
          } catch (err) {}
        }
      }
    )
    .subscribe((status) => { if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') supabase.realtime.setAuth(SUPABASE_SECRET_KEY); });
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

async function syncPlayerSpRole(discordUserId, lifetimeSp) {
  if (!discordUserId) return;
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return;
    const targetRoleConfig = SP_ROLES_CONFIG.find(role => lifetimeSp >= role.min);
    if (!targetRoleConfig) return;
    const rolesToRemove = SP_ROLES_CONFIG.map(r => r.id).filter(id => id !== targetRoleConfig.id && member.roles.cache.has(id));
    for (const roleId of rolesToRemove) await member.roles.remove(roleId).catch(() => null);
    if (!member.roles.cache.has(targetRoleConfig.id)) {
      const targetRole = guild.roles.cache.get(targetRoleConfig.id);
      if (targetRole) await member.roles.add(targetRole).catch(() => null);
    }
  } catch (err) {}
}

async function executeGlobalSpAuditSweep() {
  try {
    const { data: claimedSpRecords, error: spError } = await supabase.from('player_sp').select('player_key, lifetime_sp').eq('is_claimed', true);
    if (spError || !claimedSpRecords || !claimedSpRecords.length) return;
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    if (!guild) return;
    for (const record of claimedSpRecords) {
      let { data: mapRecord } = await supabase.from('player_discord_map').select('id, discord_user_id, discord_username, display_name, username').eq('player_key', record.player_key).maybeSingle();
      let discordId = mapRecord?.discord_user_id;
      if (!discordId && mapRecord) {
        const searchNames = [mapRecord.discord_username, mapRecord.display_name, mapRecord.username, record.player_key].filter(Boolean);
        const member = await searchGuildMemberByNames(guild, searchNames);
        if (member) { discordId = member.id; await persistDiscordUserId(mapRecord, member.id); }
      }
      if (discordId) await syncPlayerSpRole(discordId, Number(record.lifetime_sp));
    }
  } catch (err) {}
}

async function runInitialDatabaseSync() {
  try {
    const activeTournamentNums = Object.keys(TOURNAMENT_ROLE_MAP).map(Number);
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    const { data: activeRegs } = await supabase.from('tournament_registrations').select('discord_username, tournament_num').in('tournament_num', activeTournamentNums).eq('active_on_discord', true);
    const activeUserMap = new Map();
    if (activeRegs && activeRegs.length) {
      for (const reg of activeRegs) {
        const roleId = TOURNAMENT_ROLE_MAP[Number(reg.tournament_num)];
        if (roleId) {
          if (!activeUserMap.has(roleId)) activeUserMap.set(roleId, new Set());
          activeUserMap.get(roleId).add(reg.discord_username.toLowerCase());
          await syncSingleUserRole(reg.discord_username, roleId, true);
        }
      }
    }
    if (guild) {
      for (const tNum of activeTournamentNums) {
        const roleId = TOURNAMENT_ROLE_MAP[tNum];
        const role = guild.roles.cache.get(roleId);
        const validUsersSet = activeUserMap.get(roleId) || new Set();
        if (role && role.members) {
          for (const member of role.members.values()) {
            const memberNames = [member.user.username, member.nickname, member.displayName].filter(Boolean).map(n => n.toLowerCase());
            if (!memberNames.some(name => validUsersSet.has(name))) await member.roles.remove(roleId).catch(() => null);
          }
        }
      }
    }
    await executeGlobalSpAuditSweep();
  } catch (err) {}
}

async function getPlayerProfileFromDiscord(discordUserId, memberObject = null) {
  if (!discordUserId) return null;
  let { data } = await supabase.from('player_discord_map').select('player_key, claimed_by, id, discord_user_id').eq('discord_user_id', discordUserId).maybeSingle();
  if (data) return { playerKey: data.player_key, userId: data.claimed_by };

  let member = memberObject;
  if (!member) {
    try {
      const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
      member = await guild.members.fetch(discordUserId).catch(() => null);
    } catch (err) {}
  }
  if (!member) return null;

  const candidates = [member.user?.username, member.user?.globalName, member.displayName, member.nickname].filter(Boolean);
  const orFilters = [...candidates.map((value) => `discord_username.ilike.${value}`), ...candidates.map((value) => `username.ilike.${value}`), ...candidates.map((value) => `display_name.ilike.${value}`)];
  const { data: searchData } = await supabase.from('player_discord_map').select('player_key, claimed_by, id, username, discord_username, display_name, discord_user_id').or(orFilters.join(',')).limit(10);
  if (!searchData || !searchData.length) return null;

  let bestMatch = null, bestScore = 0;
  for (const row of searchData) {
    const score = Math.max(...candidates.flatMap((candidate) => [similarity(candidate, row.player_key), similarity(candidate, row.display_name), similarity(candidate, row.username), similarity(candidate, row.discord_username)]));
    if (score > bestScore) { bestMatch = row; bestScore = score; }
  }

  if (bestMatch && bestScore >= DB_MATCH_THRESHOLD) {
    await persistDiscordUserId(bestMatch, discordUserId);
    return { playerKey: bestMatch.player_key, userId: bestMatch.claimed_by };
  }
  return null;
}

async function awardSP(playerKey, userId, actionType, amount, metadata = {}) {
  try {
    await supabase.from('sp_events').insert({ player_key: playerKey, user_id: userId || null, action_type: actionType, amount: amount, metadata: metadata });
    const { data: currentSp } = await supabase.from('player_sp').select('lifetime_sp, seasonal_sp').eq('player_key', playerKey).single();
    await supabase.from('player_sp').update({ lifetime_sp: (currentSp?.lifetime_sp || 0) + amount, seasonal_sp: (currentSp?.seasonal_sp || 0) + amount, updated_at: new Date().toISOString() }).eq('player_key', playerKey);
  } catch (err) {}
}

async function executeLobbyStartSequence(lobbyRecord, targetChannel = null) {
  let channel = targetChannel || await discordClient.channels.fetch(lobbyRecord.channel_id).catch(() => null);
  if (!channel) return;

  const targetMsg = await channel.messages.fetch(lobbyRecord.message_id).catch(() => null);
  if (!targetMsg || !targetMsg.embeds[0]) return;

  await supabase.from('active_async_matches').update({ status: 'started', auto_start_at: null }).eq('id', lobbyRecord.id);

  const { display, count } = await buildRosterDisplay(lobbyRecord);
  const cleanStartedSentence = String(targetMsg.embeds[0].fields[0].value).split('\n')[0].replace('is looking', 'was looking');
  const matchTypeTitle = (targetMsg.embeds[0].title || '').includes('Live Match') || !(targetMsg.embeds[0].title || '').includes('Async Match') ? '🏁 Live Match Started!' : '🏁 Async Match Started!';

  const embed = EmbedBuilder.from(targetMsg.embeds[0])
    .setTitle(matchTypeTitle).setColor(0x2ecc71).setFooter(null) 
    .setFields(
      { name: '📝 Match Details', value: cleanStartedSentence, inline: false }, 
      { name: '🔑 Password', value: lobbyRecord.lobby_password && lobbyRecord.lobby_password !== 'None' ? `\`${lobbyRecord.lobby_password}\`` : 'Check chat for more info', inline: false },
      { name: `👥 Final Roster (${count}/4)`, value: display, inline: false }
    );

  await targetMsg.edit({ content: `🚀 **The match${lobbyRecord.match_id ? ` [ID: ${lobbyRecord.match_id}]` : ''} has officially begun! Good luck, commanders!**\nPlayers: ${(lobbyRecord.player_ids || []).map(id => `<@${id}>`).join(', ')}`, embeds: [embed] }).catch(() => {});

  const now = new Date(), startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfThisWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (now.getUTCDay() * 24 * 60 * 60 * 1000)).toISOString();
  const unlinkedPlayers = [];

  for (const playerId of (lobbyRecord.player_ids || [])) {
    const profile = await getPlayerProfileFromDiscord(playerId);
    if (!profile) {
      unlinkedPlayers.push({ id: playerId, points: SP_REWARDS_CONFIG.MATCH_START_BASE.amount + (matchTypeTitle.includes('Live') ? SP_REWARDS_CONFIG.FIRST_DAILY_LIVE.amount : SP_REWARDS_CONFIG.FIRST_WEEKLY_ASYNC.amount) });
      continue;
    }
    const { data: hourlyMatchEvents } = await supabase.from('sp_events').select('id').eq('player_key', profile.playerKey).eq('action_type', 'match_start_base').gte('created_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());
    if (!hourlyMatchEvents || hourlyMatchEvents.length === 0) await awardSP(profile.playerKey, profile.userId, 'match_start_base', SP_REWARDS_CONFIG.MATCH_START_BASE.amount, { discord_user_id: playerId, match_id: lobbyRecord.id });

    if (matchTypeTitle.includes('Live')) {
      const { data: dailyLiveEvents } = await supabase.from('sp_events').select('id').eq('player_key', profile.playerKey).eq('action_type', 'first_live_game').gte('created_at', startOfToday);
      if (!dailyLiveEvents || dailyLiveEvents.length === 0) await awardSP(profile.playerKey, profile.userId, 'first_live_game', SP_REWARDS_CONFIG.FIRST_DAILY_LIVE.amount, { discord_user_id: playerId, match_id: lobbyRecord.id });
    } else {
      const { data: weeklyAsyncEvents } = await supabase.from('sp_events').select('id').eq('player_key', profile.playerKey).eq('action_type', 'first_weekly_async').gte('created_at', startOfThisWeek);
      if (!weeklyAsyncEvents || weeklyAsyncEvents.length === 0) await awardSP(profile.playerKey, profile.userId, 'first_weekly_async', SP_REWARDS_CONFIG.FIRST_WEEKLY_ASYNC.amount, { discord_user_id: playerId, match_id: lobbyRecord.id });
    }
  }

  if (unlinkedPlayers.length > 0) {
    await channel.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Missed Strategy Points!').setDescription(`${unlinkedPlayers.map(p => `• <@${p.id}> could have gotten **+${p.points} Strategy Points**!`).join('\n')}\n\nLink your Discord account on [dunestats.cc](https://dunestats.cc) now to start claiming your rewards and climb the ranks!`).setColor(0xe74c3c)] }).catch(() => {});
  }
}

async function handleTournamentCheckinReaction(message, user, emojiName) {
  if (emojiName !== CHECKIN_EMOJI_NAME && emojiName !== '✅') return;
  const { data: checkin } = await supabase.from('tournament_checkins').select('*').eq('message_id', message.id).maybeSingle();
  if (!checkin || checkin.deleted_at) return;
  const config = TOURNAMENTS_CONFIG[checkin.tournament_num];
  if (!config || !config.registeredRoleId || !config.checkInRoleId) return;
  const member = await message.guild?.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const reminderChannel = await discordClient.channels.fetch(CHECKIN_REMINDER_CHANNEL_ID).catch(() => null);
  if (member.roles.cache.has(config.registeredRoleId)) {
    if (!member.roles.cache.has(config.checkInRoleId)) {
      await member.roles.add(config.checkInRoleId).catch(() => {});
      if (reminderChannel) await reminderChannel.send({ content: `✅ <@${user.id}> has successfully checked in for **Tournament #${checkin.tournament_num}**!` }).catch(() => {});
    }
    return;
  }

  const targetReaction = message.reactions.cache.find((r) => (r.emoji.name || r.emoji.toString()) === emojiName);
  if (targetReaction) await targetReaction.users.remove(user.id).catch(() => {});
  if ((checkin.notified_user_ids || []).includes(user.id)) return;
  
  if (reminderChannel) await reminderChannel.send({ content: `⚠️ <@${user.id}>, you tried to check in for **Tournament #${checkin.tournament_num}** but you're not registered yet!\n\n🔗 Register here: https://dunestats.cc/tournament-register/t${checkin.tournament_num}\n📝 Use this exact Discord username when registering: \`${member.user.username}\`` }).catch(() => {});
  await supabase.from('tournament_checkins').update({ notified_user_ids: [...(checkin.notified_user_ids || []), user.id] }).eq('id', checkin.id).catch(() => {});
}

async function checkAndExpireCheckins() {
  try {
    const { data: dueCheckins } = await supabase.from('tournament_checkins').select('*').lte('expires_at', new Date().toISOString()).is('deleted_at', null);
    if (!dueCheckins || !dueCheckins.length) return;
    for (const row of dueCheckins) {
      const channel = await discordClient.channels.fetch(row.channel_id).catch(() => null);
      const msg = channel ? await channel.messages.fetch(row.message_id).catch(() => null) : null;
      if (row.remove_after_24h) {
        if (msg) await msg.delete().catch(() => {});
        await supabase.from('tournament_checkins').update({ deleted_at: new Date().toISOString() }).eq('id', row.id);
      } else if (!row.closed_at) {
        if (msg && msg.embeds[0]) await msg.edit({ embeds: [EmbedBuilder.from(msg.embeds[0]).setTitle(`🔒 Tournament #${row.tournament_num} Check-In is CLOSED`).setColor(0x95A5A6).setFooter({ text: 'Check-in window has ended.' })] }).catch(() => {});
        await supabase.from('tournament_checkins').update({ closed_at: new Date().toISOString() }).eq('id', row.id);
      }
    }
  } catch (err) {}
}

async function checkAndExpireLobbies() {
  try {
    const { data: expiredLobbies } = await supabase.from('active_async_matches').select('*').eq('status', 'searching').lte('expires_at', new Date().toISOString());
    if (!expiredLobbies || expiredLobbies.length === 0) return;
    for (const lobby of expiredLobbies) {
      await supabase.from('active_async_matches').update({ status: 'cancelled', auto_start_at: null }).eq('id', lobby.id);
      if (lobby.channel_id && lobby.message_id) {
        const channel = await discordClient.channels.fetch(lobby.channel_id).catch(() => null);
        const msg = channel ? await channel.messages.fetch(lobby.message_id).catch(() => null) : null;
        if (msg && msg.embeds && msg.embeds.length > 0) {
          await msg.edit({ content: `🚫 **Lobby expired**`, embeds: [EmbedBuilder.from(msg.embeds[0]).setTitle('⏳ Lobby Expired').setColor(0x95A5A6).setDescription('This lobby timed out because it did not fill up in time.')] }).catch(() => {});
          await msg.reactions.removeAll().catch(() => {});
        }
      }
    }
  } catch (err) {}
}

async function handleTournamentVotingReaction(message, user, emojiName, isAdd) {
  const { data: schedule } = await supabase.from('tournament_match_schedules').select('*').eq('message_id', message.id).single();
  if (!schedule || schedule.mode?.trim() !== 'live' || schedule.status === 'played' || !schedule.player_discord_ids?.includes(user.id)) return;
  const availableSlotLabels = (schedule.suggested_slots || []).map(s => s.label);
  if (!availableSlotLabels.includes(emojiName)) return;

  let fetchedMsg = await message.channel.messages.fetch(schedule.message_id).catch(() => message);
  const currentVotes = {};
  for (const slot of availableSlotLabels) {
    const r = fetchedMsg.reactions.cache.find(react => react.emoji.name === slot || react.emoji.toString() === slot);
    if (r) {
      try {
        for (const [uid, u] of await r.users.fetch()) {
          if (!u.bot && schedule.player_discord_ids.includes(uid)) {
            if (!currentVotes[uid]) currentVotes[uid] = [];
            if (!currentVotes[uid].includes(slot)) currentVotes[uid].push(slot);
          }
        }
      } catch (fErr) {}
    }
  }

  const votedUserIds = Object.keys(currentVotes);
  const votesCount = votedUserIds.length;

  if (fetchedMsg && fetchedMsg.embeds.length > 0) {
    const originalEmbed = fetchedMsg.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed);
    const slotLines = (schedule.suggested_slots || []).map((slot) => {
      const votersForSlot = schedule.player_discord_ids.filter(id => currentVotes[id] && currentVotes[id].includes(slot.label));
      return `${slot.label} ${slot.time_text}${votersForSlot.length > 0 ? ` — ${votersForSlot.map(id => `<@${id}>`).join(' ')}` : ''}`;
    });
    const nonVoters = schedule.player_discord_ids.filter(id => !votedUserIds.includes(id));
    const updatedFields = originalEmbed.fields.filter(f => !f.name.includes('Suggested Time Slots'));
    updatedFields.push({ name: '📅 Suggested Time Slots & Votes', value: `${slotLines.join('\n')}${nonVoters.length > 0 ? `\n\n**⏳ Did not vote yet (${votesCount}/4):**\n${nonVoters.map(id => `<@${id}>`).join(', ')}` : `\n\n**✅ All 4 players have voted!**`}`, inline: false });
    updatedEmbed.setFields(updatedFields);
    await fetchedMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
  }

  const slotScores = {};
  for (const slot of availableSlotLabels) slotScores[slot] = 0;
  for (const uid of votedUserIds) for (const slot of currentVotes[uid]) if (slotScores[slot] !== undefined) slotScores[slot]++;
  const winningSlot = availableSlotLabels.find(slot => slotScores[slot] >= 4);

  const previousStatus = schedule.status;
  const newStatus = winningSlot ? 'confirmed' : (votesCount >= 4 ? 'conflict' : 'pending_votes');
  await supabase.from('tournament_match_schedules').update({ votes: currentVotes, votes_count: votesCount, status: newStatus, updated_at: new Date().toISOString() }).eq('id', schedule.id);

  const debounceKey = `schedule_${schedule.id}`;
  if (scheduleDebounceTimers.has(debounceKey)) { clearTimeout(scheduleDebounceTimers.get(debounceKey)); scheduleDebounceTimers.delete(debounceKey); }

  if (newStatus === 'confirmed') {
    scheduleDebounceTimers.set(debounceKey, setTimeout(async () => {
      scheduleDebounceTimers.delete(debounceKey);
      const { data: fresh } = await supabase.from('tournament_match_schedules').select('*').eq('id', schedule.id).single();
      if (!fresh || fresh.status !== 'confirmed') return;

      const freshVotes = fresh.votes || {};
      const freshSlots = (fresh.suggested_slots || []).map(s => s.label);
      const freshScores = {};
      for (const slot of freshSlots) freshScores[slot] = 0;
      for (const uid of Object.keys(freshVotes)) for (const slot of freshVotes[uid]) if (freshScores[slot] !== undefined) freshScores[slot]++;
      const finalWinSlot = freshSlots.find(s => freshScores[s] >= 4);
      if (!finalWinSlot) return;

      const matchedSlot = (fresh.suggested_slots || []).find(s => s.label === finalWinSlot);
      let confirmedTimestamp = null, confirmedDate = null;
      const confirmedTimeText = matchedSlot ? matchedSlot.time_text : 'Agreed Time';
      const matchDiscord = String(confirmedTimeText).match(/<t:(\d+)/);
      if (matchDiscord) { confirmedDate = new Date(parseInt(matchDiscord[1], 10) * 1000); confirmedTimestamp = confirmedDate.toISOString(); } 
      else { const parsed = Date.parse(confirmedTimeText); if (!isNaN(parsed)) { confirmedDate = new Date(parsed); confirmedTimestamp = confirmedDate.toISOString(); } }

      await supabase.from('tournament_match_schedules').update({ confirmed_slot: finalWinSlot, confirmed_time_text: confirmedTimeText, confirmed_timestamp: confirmedTimestamp, reminders_sent: [], updated_at: new Date().toISOString() }).eq('id', fresh.id);

      const calUrl = confirmedDate ? generateGoogleCalendarUrl(`[${fresh.match_code}] ${fresh.round_type} ${fresh.table_identifier}`, confirmedDate) : null;
      const webUrl = `https://dunestats.cc/tournament/${fresh.tournament_num}/${fresh.match_code && fresh.match_code.includes('G') ? fresh.match_code.slice(fresh.match_code.indexOf('G')) : 'table'}`;
      
      const confirmEmbed = new EmbedBuilder().setTitle(`📅 Match Time Confirmed: [${fresh.match_code}] ${fresh.round_type} ${fresh.table_identifier}`).setColor(0x2ECC71).setDescription(`All 4 players agreed! Match locked in for **${confirmedTimeText}**.\n\n🔗 **[Jump to Voting Post](https://discord.com/channels/${DISCORD_GUILD_ID}/${fresh.thread_id}/${fresh.message_id})** · **[Table Details & Map](${webUrl})**\n\nPlease let your opponents know on time if you need to reschedule.`).setTimestamp();
      
      const components = calUrl ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Add to Google Calendar').setStyle(ButtonStyle.Link).setURL(calUrl).setEmoji('📅'))] : [];
      await fetchedMsg.channel.send({ content: `👥 ${fresh.player_discord_ids.map(id => `<@${id}>`).join(' ')}`, embeds: [confirmEmbed], components: components }).catch(() => {});
    }, 60 * 1000));
  } else if (newStatus === 'conflict' && previousStatus !== 'conflict') {
    const webUrl = `https://dunestats.cc/tournament/${schedule.tournament_num}/${schedule.match_code && schedule.match_code.includes('G') ? schedule.match_code.slice(schedule.match_code.indexOf('G')) : 'table'}`;
    const rankedSlots = (schedule.suggested_slots || []).map((slot) => {
      const backers = schedule.player_discord_ids.filter(id => currentVotes[id] && currentVotes[id].includes(slot.label));
      return { ...slot, count: backers.length, backers, missing: schedule.player_discord_ids.filter(id => !backers.includes(id)) };
    }).sort((a, b) => b.count - a.count);

    const breakdownLines = [];
    const threeVoterSlots = rankedSlots.filter(s => s.count === 3);
    const twoVoterSlots = rankedSlots.filter(s => s.count === 2);
    
    if (threeVoterSlots.length > 0) {
      breakdownLines.push('**🔥 Closest Options (3/4 Players Agreed):**');
      for (const s of threeVoterSlots) breakdownLines.push(`• **${s.label} ${s.time_text}**\n  ↳ Agreed: ${s.backers.map(id => `<@${id}>`).join(', ')}\n  ↳ **Needs:** ${s.missing.map(id => `<@${id}>`).join(', ')} — *Are you available, or could you play slightly earlier/later?*`);
      breakdownLines.push('');
    }
    if (twoVoterSlots.length > 0) {
      breakdownLines.push('**⚖️ Split Options (2/4 Players Agreed):**');
      for (const s of twoVoterSlots) breakdownLines.push(`• **${s.label} ${s.time_text}** (Agreed: ${s.backers.map(id => `<@${id}>`).join(', ')})`);
      breakdownLines.push('');
    }
    if (threeVoterSlots.length === 0 && twoVoterSlots.length === 0) {
      breakdownLines.push('**Current Votes:**');
      for (const s of rankedSlots.filter(s => s.count < 2)) breakdownLines.push(`• **${s.label} ${s.time_text}** (${s.count}/4 votes)`);
      breakdownLines.push('');
    }

    const conflictEmbed = new EmbedBuilder().setTitle(`⚠️ Scheduling Conflict: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`).setColor(0xE74C3C).setDescription(`All 4 players have voted, but no single slot reached unanimous agreement.\n\n${breakdownLines.join('\n')}**💡 How to Resolve & Propose Solutions:**\n1. [Jump to the pinned voting post](https://discord.com/channels/${DISCORD_GUILD_ID}/${schedule.thread_id}/${schedule.message_id}) to check or update your votes.\n2. Check mutual 2-hour free windows on the live map:\n   👉 **[Availability Map for Table ${schedule.table_identifier}](${webUrl})** *(Click any slot to copy its Discord timestamp)*\n3. Use \`/confirm\` to propose an adjustment:\n   • **Shift by minutes:** \`/confirm slot: B offset_minutes: 60\` *(Creates a new option **🇩** shifted +1h)*\n   • **Custom time code:** \`/confirm custom_time: <t:1787814000:F>\`\n4. Once proposed, everyone can vote on the new option above!`).setTimestamp();
    await fetchedMsg.channel.send({ content: `👥 ${schedule.player_discord_ids.map(id => `<@${id}>`).join(' ')}\n🛡️ <@&${TOURNAMENT_HOST_ROLE_ID}>`, embeds: [conflictEmbed] }).catch(() => {});
  }
}

async function checkAndSendMatchReminders() {
  try {
    const now = new Date();
    
    // --- 1. LIVE MATCH REMINDERS ---
    const { data: liveConfirmedMatches } = await supabase.from('tournament_match_schedules').select('*').eq('status', 'confirmed').not('confirmed_timestamp', 'is', null);
    const matches = (liveConfirmedMatches || []).filter(m => m.mode?.trim() === 'live');
    if (matches.length > 0) {
      for (const match of matches) {
        const matchTime = new Date(match.confirmed_timestamp);
        const diffMinutes = Math.floor((matchTime.getTime() - now.getTime()) / (1000 * 60));
        if (diffMinutes < -60) continue; 

        const sent = match.reminders_sent || [];
        let alertStage = null, alertTitle = '', alertDesc = '';

        if (diffMinutes <= 36 * 60 && diffMinutes >= 35 * 60 && !sent.includes('36h')) { alertStage = '36h'; alertTitle = '⏳ 36-Hour Match Reminder'; alertDesc = `Your tournament game is scheduled for **${match.confirmed_time_text}** (<t:${Math.floor(matchTime.getTime() / 1000)}:R>).\n\nIf anyone needs to reschedule, please let opponents know in this thread ASAP!`; }
        else if (diffMinutes <= 60 && diffMinutes > 5 && !sent.includes('1h')) { alertStage = '1h'; alertTitle = '⏰ 1-Hour Match Reminder'; alertDesc = `Your game starts in **1 hour** (<t:${Math.floor(matchTime.getTime() / 1000)}:R>)!\n\nPlease start getting ready and say anything in this chat to let everyone know you will be there.\n\n⚙️ Tournament game settings: <#${LIVE_SETTINGS_CHANNEL_ID}>`; }
        else if (diffMinutes <= 5 && diffMinutes >= 0 && !sent.includes('5m')) { alertStage = '5m'; alertTitle = '🚨 5-Minute Final Call!'; alertDesc = `Match is starting **NOW** (<t:${Math.floor(matchTime.getTime() / 1000)}:R>)!\n\n**Table Rule:** Anyone can host this table. Please create the room in-game, verify the settings, and share the password directly in this thread.\n\n⚙️ Tournament game settings: <#${LIVE_SETTINGS_CHANNEL_ID}>\n\n📸 **Reporting Results**\nOnce the game concludes, upload your final screenshot to:\n🔗 [dunestats.cc/tournament](https://dunestats.cc/tournament)`; }

        if (alertStage) {
          const thread = await discordClient.channels.fetch(match.thread_id).catch(() => null);
          if (thread) await thread.send({ content: `👥 ${(match.player_discord_ids || []).map(id => `<@${id}>`).join(' ')}`, embeds: [new EmbedBuilder().setTitle(alertTitle).setColor(alertStage === '5m' ? 0xE74C3C : (alertStage === '1h' ? 0xE67E22 : 0xF39C12)).setDescription(alertDesc).setTimestamp()] }).catch(() => {});
          await supabase.from('tournament_match_schedules').update({ reminders_sent: [...sent, alertStage], updated_at: new Date().toISOString() }).eq('id', match.id);
        }
      }
    }

    // --- 2. ASYNC MATCH START REMINDERS ---
    const { data: asyncMatches } = await supabase.from('tournament_match_schedules').select('*').eq('mode', 'async').in('status', ['pending_votes', 'published']).is('confirmed_timestamp', null);
    if (asyncMatches && asyncMatches.length > 0) {
      for (const asyncMatch of asyncMatches) {
        if ((now.getTime() - new Date(asyncMatch.updated_at || asyncMatch.created_at).getTime()) / (1000 * 60 * 60) >= 24) {
          const thread = await discordClient.channels.fetch(asyncMatch.thread_id).catch(() => null);
          if (thread) {
            await thread.send({
              content: `👥 ${(asyncMatch.player_discord_ids || []).map(id => `<@${id}>`).join(' ')}`,
              embeds: [new EmbedBuilder().setTitle(`🎲 Async Match Check-in: [${asyncMatch.match_code}] ${asyncMatch.round_type} ${asyncMatch.table_identifier}`).setColor(0x3498DB).setDescription(`Has your async match started in-game?\n\nOnce all 4 players are seated and the game begins, please click **Mark Game Started** below or use \`/confirm\` so the tournament clock and timers activate.\n\n⚙️ Async Tournament Settings: <#${ASYNC_SETTINGS_CHANNEL_ID}>\n\n📸 **Reporting Results**\nOnce the game concludes, upload your final screenshot to:\n🔗 [dunestats.cc/tournament](https://dunestats.cc/tournament)`).setTimestamp()],
              components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`async_start_${asyncMatch.id}`).setLabel('🚀 Mark Game Started').setStyle(ButtonStyle.Success))]
            }).catch(() => {});
            await supabase.from('tournament_match_schedules').update({ updated_at: now.toISOString() }).eq('id', asyncMatch.id);
          }
        }
      }
    }
  } catch (err) {}
}

discordClient.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = slashCommands.get(interaction.commandName); if (!command) return;
    try { await command.execute(interaction, { supabase, discordClient }); } 
    catch (error) {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: 'Something went wrong while processing the command.' }).catch(() => {}); 
      else await interaction.reply({ content: 'Something went wrong while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {}); 
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('async_start_')) {
    const matchId = interaction.customId.replace('async_start_', '');
    const { data: schedule } = await supabase.from('tournament_match_schedules').select('*').eq('id', matchId).single();
    if (!schedule) return await interaction.reply({ content: '❌ Match schedule not found.', flags: MessageFlags.Ephemeral });
    if (!(schedule.player_discord_ids && schedule.player_discord_ids.includes(interaction.user.id)) && !interaction.member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID) && !interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({ content: '❌ You must be a player in this match or tournament host to mark it as started.', flags: MessageFlags.Ephemeral });
    }
    await supabase.from('tournament_match_schedules').update({ status: 'ongoing', confirmed_timestamp: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', schedule.id);
    await interaction.update({ components: [] }).catch(() => {});
    await interaction.channel.send({ content: `👥 ${(schedule.player_discord_ids || []).map(id => `<@${id}>`).join(' ')}`, embeds: [new EmbedBuilder().setTitle(`🚀 Async Match Started: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`).setColor(0x2ECC71).setDescription(`<@${interaction.user.id}> marked this game as **Ongoing**! Turn timers are active.\n\n⚙️ Async Tournament Settings: <#${ASYNC_SETTINGS_CHANNEL_ID}>\n\n📸 **Reporting Results**\nOnce the game concludes, upload your final screenshot to:\n🔗 [dunestats.cc/tournament](https://dunestats.cc/tournament)`).setTimestamp()] });
  }
});

discordClient.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;
    const profile = await getPlayerProfileFromDiscord(message.author.id);
    if (!profile) return; 

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const { data: dailyTextEvents } = await supabase.from('sp_events').select('id').eq('player_key', profile.playerKey).eq('action_type', 'daily_first_message').gte('created_at', startOfToday);
    if (!dailyTextEvents || dailyTextEvents.length === 0) await awardSP(profile.playerKey, profile.userId, 'daily_first_message', SP_REWARDS_CONFIG.DAILY_FIRST_MESSAGE.amount, { discord_user_id: message.author.id, channel_id: message.channel.id });

    if (message.channel.id === IMAGE_UPLOADS_CHANNEL_ID && Array.from(message.attachments.values()).some(attachment => (attachment.contentType && attachment.contentType.startsWith('image/')) || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.url))) {
      const { data: recentImageEvents } = await supabase.from('sp_events').select('id').eq('player_key', profile.playerKey).eq('action_type', 'image_upload').gte('created_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());
      if (!recentImageEvents || recentImageEvents.length === 0) await awardSP(profile.playerKey, profile.userId, 'image_upload', SP_REWARDS_CONFIG.IMAGE_UPLOAD.amount, { discord_user_id: message.author.id, message_id: message.id });
    }
  } catch (err) {}
});

discordClient.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (err) { return; } }
    const message = reaction.message;
    const emojiName = reaction.emoji.name || reaction.emoji.toString();

    await handleTournamentVotingReaction(message, user, emojiName, true);
    await handleTournamentCheckinReaction(message, user, emojiName);

    const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('message_id', message.id).single();
    if (!lobby || lobby.status !== 'searching') return;

    const isJoinEmoji = emojiName === 'AsyncDune' || emojiName === 'LiveDune' || emojiName === '🎲' || emojiName === '⚔️' || reaction.emoji.toString().includes('AsyncDune') || reaction.emoji.toString().includes('LiveDune');
    let players = [...(lobby.player_ids || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    let shouldUpdate = false;

    if (isJoinEmoji) {
      if (!players.includes(user.id)) {
        if (players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0) < 4) {
          players.push(user.id);
          shouldUpdate = true;
          if (notifications.length > 0) await message.channel.send({ content: `🔔 ${notifications.map(id => `<@${id}>`).join(' ')}, **${user.username}** joined the lobby!` }).catch(() => {});
        } else {
          await reaction.users.remove(user.id).catch(() => {});
        }
      }
    } else if (emojiName === '🎮') {
      if (players.includes(user.id) && players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0) >= 2) return await executeLobbyStartSequence(lobby, message.channel);
    } else if (emojiName === '❌' && user.id === lobby.host_id) {
      await supabase.from('active_async_matches').update({ status: 'cancelled', auto_start_at: null }).eq('id', lobby.id);
      await message.edit({ content: `🚫 **Lobby cancelled by ${user.username}**`, embeds: [EmbedBuilder.from(message.embeds[0]).setTitle('❌ Lobby Cancelled').setColor(0xff0000).setDescription(`This lobby was cancelled by ${user.username}`)] }).catch(() => {});
      return;
    } else if (emojiName === '🔔') {
      if (!notifications.includes(user.id)) { notifications.push(user.id); shouldUpdate = true; }
    } else if (emojiName === '📢') {
      const pingResult = await executeLobbyPing(lobby, message.channel);
      if (!pingResult) {
        const cooldownMsg = await message.reply({ content: `⏳ Tag is on cooldown. Next ping available <t:${Math.floor((new Date(lobby.last_prompted_at).getTime() + TAG_COOLDOWN_MS) / 1000)}:R>` }).catch(() => {});
        setTimeout(() => { cooldownMsg.delete().catch(() => {}); }, 5000);
      }
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    if (shouldUpdate) {
      let updatePayload = { player_ids: players, notify_user_ids: notifications };
      if (players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0) === 4 && !lobby.auto_start_at) {
        const startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
        updatePayload.auto_start_at = startTargetDate.toISOString();
        await message.channel.send({ content: `⏳ **Lobby full!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!` }).catch(() => {});
      }
      await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);
    }
  } catch (err) {}
});

discordClient.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (err) { return; } }
    const message = reaction.message;
    const emojiName = reaction.emoji.name || reaction.emoji.toString();

    await handleTournamentVotingReaction(message, user, emojiName, false);

    const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('message_id', message.id).single();
    if (!lobby || lobby.status !== 'searching') return;

    const isJoinEmoji = emojiName === 'AsyncDune' || emojiName === 'LiveDune' || emojiName === '🎲' || emojiName === '⚔️' || reaction.emoji.toString().includes('AsyncDune') || reaction.emoji.toString().includes('LiveDune');
    let players = [...(lobby.player_ids || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    let shouldUpdate = false;

    if (isJoinEmoji && players.includes(user.id)) { players = players.filter(id => id !== user.id); notifications = notifications.filter(id => id !== user.id); shouldUpdate = true; }
    if (emojiName === '🔔' && notifications.includes(user.id)) { notifications = notifications.filter(id => id !== user.id); shouldUpdate = true; }

    if (shouldUpdate) {
      let updatePayload = { player_ids: players, notify_user_ids: notifications };
      if (players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0) < 4 && lobby.auto_start_at) {
        updatePayload.auto_start_at = null;
        await message.channel.send({ content: `⚠️ **Roster drop verified.** Automated match countdown for lobby ${lobby.match_id ? `\`${lobby.match_id}\`` : ''} aborted.` }).catch(() => {});
      }
      await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);
    }
  } catch (err) {}
});

discordClient.once('clientReady', async () => {
  console.log('Logged in as', discordClient.user.tag);
  startRealtimeListener();
  startGlobalDatabaseListener();
  await runInitialDatabaseSync();

  setInterval(async () => { await executeGlobalSpAuditSweep(); }, 24 * 60 * 60 * 1000);
  setInterval(async () => {
    try {
      const { data: expiredLobbies } = await supabase.from('active_async_matches').select('*').eq('status', 'searching').not('auto_start_at', 'is', null).lte('auto_start_at', new Date().toISOString());
      if (expiredLobbies && expiredLobbies.length > 0) for (const targetLobby of expiredLobbies) await executeLobbyStartSequence(targetLobby).catch(() => {});
    } catch (cronErr) {}
  }, 30 * 1000);
  setInterval(async () => { await checkAndSendMatchReminders(); }, 60 * 1000);
  setInterval(async () => { await checkAndExpireCheckins(); }, 5 * 60 * 1000);
  setInterval(async () => { await checkAndExpireLobbies(); }, 5 * 60 * 1000);

  if (DISCORD_CLIENT_ID && DISCORD_GUILD_ID) {
    try {
      const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
      const commands = Array.from(slashCommands.values()).map(c => c.data.toJSON());
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });
      console.log('Successfully registered all commands internally.');
    } catch (error) {}
  }
});

discordClient.login(DISCORD_BOT_TOKEN);
