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

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  AttachmentBuilder,
  userMention,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  MessageFlags
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const liveCommand = require('./live'); 
const tournamentCommand = require('./tournament');
const massThreadsCommand = require('./mass-threads'); 
const spCommand = require('./sp'); 
const timeCommand = require('./time');
const confirmCommand = require('./confirm');
const tournamentStatusCommand = require('./tournament-status');
const checkinCommand = require('./checkin');
const spawnQueueCommand = require('./spawn-queue');
const spawnInfoCommand = require('./spawn-info');
const leagueCommand = require('./league');
const { TOURNAMENTS_CONFIG } = require('./tournament-config');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const sharp = require('sharp');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1233029532785573918';
const TOURNAMENT_RESULTS_CHANNEL_ID = '1225554306808287248';
const LEAGUE_RESULTS_CHANNEL_ID = '1562444292574941184';
const YOUTUBE_VOD_CHANNEL_ID = '1561777632100745346';
const LEAGUE_INFO_CHANNEL_ID = '1563165091669475499';
const LEAGUE_POLL_CHANNEL_ID = '1221556256406507611';
const ACTIVE_LEAGUE_ROLE_ID = '1563153007728791622';
const LEAGUE_NOTIFY_ROLE_ID = '1219666679764877424';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const LIVE_SETTINGS_CHANNEL_ID = '1534192105533083648';
const ASYNC_SETTINGS_CHANNEL_ID = '1084215554841264169';
const SCHEDULING_GUIDE_LINK = 'https://discord.com/channels/747212662483583069/1561135482946064524';
const EMOJI_GUIDE_LINK = 'https://discord.com/channels/747212662483583069/1561400611348553810';
const HOST_RESPONSIBILITIES_LINK = 'https://discord.com/channels/747212662483583069/1561711715891023982';

// Web LFG Channels
const WEB_LFG_ASYNC_CHANNEL = '1258014952199950449';
const WEB_LFG_LIVE_CHANNEL = '1258016587617931284';

// Queue & League Channel Config
const QUEUE_CHANNEL_ID = '1558128709523996763';
const LEAGUE_LFG_CHANNEL_ID = '1557473551227818024';
const LFG_ADMIN_ALERT_CHANNEL_ID = '937921061180309505';
const LFG_ADMIN_ROLE = '1557469534133162045';

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

// Control emojis on lobbies
const LOBBY_CONTROL_EMOJIS = new Set(['🙋', '➕', '🎮', '❌', '🥾', '🔔', '📢', '🇦', '🇧', '🇨', '🇩', '🇪', '🇫']);

const BOILERPLATE_NOTES = new Set([
  'official ranked league match!',
  'looking for players for an official league match!',
  'looking for a live match!',
  'looking for an async match!',
  'looking for players via the website!',
  'custom match generated from the queue channel!',
  'automated matchmaking queue pop!'
]);

function isCustomLobbyNote(text) {
  if (!text) return false;
  const clean = String(text).trim();
  if (!clean) return false;
  return !BOILERPLATE_NOTES.has(clean.toLowerCase());
}

// --- AI SCAN STATUS ANNOUNCEMENT CONFIG ---
const SCAN_RESULTS_CHANNEL_ID = '1519019834011160576';
const AI_SCAN_IGNORED_STATUS = 'No'; 

const SCAN_STATUS_TITLES = {
  'Yes': '🤖 AI Verified',
  'Manually reviewed': '🔍 Manually Reviewed',
  'Manually verified': '✅ Manually Verified',
  'Issue detected': '⚠️ Issue Detected',
  'Roster mismatch': '🚨 Roster Mismatch'
};

const SCAN_STATUS_COLORS = {
  'Yes': 0xF39C12,               
  'Manually reviewed': 0xF39C12, 
  'Manually verified': 0x2ECC71, 
  'Issue detected': 0xE74C3C,    
  'Roster mismatch': 0xE74C3C    
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

discordClient.on('error', (err) => { console.error('[DiscordClient Error]:', err); });
process.on('unhandledRejection', (reason) => { console.error('[Unhandled Rejection]:', reason); });

const slashCommands = new Map([
  [statsCommand.data.name, statsCommand],
  [asyncCommand.data.name, asyncCommand],
  [liveCommand.data.name, liveCommand],
  [tournamentCommand.data.name, tournamentCommand],
  [massThreadsCommand.data.name, massThreadsCommand],
  [spCommand.data.name, spCommand],
  [timeCommand.data.name, timeCommand],
  [confirmCommand.data.name, confirmCommand],
  [tournamentStatusCommand.data.name, tournamentStatusCommand],
  [checkinCommand.data.name, checkinCommand],
  [spawnQueueCommand.data.name, spawnQueueCommand],
  [spawnInfoCommand.data.name, spawnInfoCommand],
  [leagueCommand.data.name, leagueCommand]
]);

const pendingGames = new Set();
const pendingScanRefresh = new Set();
const scheduleDebounceTimers = new Map();
const activeStartLocks = new Set();
const activeGameLocks = new Set();
const activeVodLocks = new Set();
const activeSpLocks = new Set();
const recentDiscordQueueIds = new Set();

const hostClaimAlertMessages = new Map();
const active3PlayerVotes = new Map();
const pendingLeagueNotes = new Map();

let realtimeRetryCount = 0;
let realtimeChannel = null;
let reconnectTimer = null;

let cachedSeasonId = 2;
let lastSeasonCheck = 0;

let queueUpdateDebounce = null;
let infoUpdateDebounce = null;
let activeAutoPops = new Set();

function autoDeleteEphemeral(interaction, ms = 60000) {
  setTimeout(() => { interaction.deleteReply().catch(() => {}); }, ms);
}

async function getCurrentSeasonId() {
  const now = Date.now();
  if (now - lastSeasonCheck < 60 * 60 * 1000) return cachedSeasonId;
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabase.from('sp_seasons').select('id').lte('starts_at', nowIso).gt('ends_at', nowIso).maybeSingle();
    if (data?.id) cachedSeasonId = data.id;
    lastSeasonCheck = now;
  } catch (e) {}
  return cachedSeasonId;
}

function getEmoji(guild, name, fallback = '') {
  if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
  const emoji = guild.emojis.cache.find((e) => e.name === name);
  return emoji ? emoji.toString() : fallback;
}

function wrapLink(text, url) {
  return url ? `[${text}](${url})` : text;
}

function formatBoardWithEmoji(guild, boardType, url = null) {
  if (!boardType) return wrapLink('**Base Game**', url);
  if (boardType.toLowerCase().includes('uprising')) {
    const emoji = getEmoji(guild, 'Uprising', '');
    return `${emoji} ${wrapLink('**Uprising**', url)}`.trim();
  }
  return wrapLink(`**${boardType}**`, url);
}

function formatExpansionsWithEmoji(guild, expansions = [], url = null) {
  return (expansions || []).map(exp => {
    const lower = String(exp).toLowerCase();

    if (lower.includes('rise of ix') || lower === 'ix') {
      return `${getEmoji(guild, 'Ix', '')} ${wrapLink('**Rise of IX**', url)}`.trim();
    }
    // Detects "Immortality to 11" or "Immortality (To 11)"
    if (lower.includes('immortality') && lower.includes('11')) {
      return `${getEmoji(guild, 'Immo', '')} ${wrapLink('**Immortality (To 11)**', url)}`.trim();
    }
    // Detects standard "Immortality"
    if (lower.includes('immortality') || lower === 'immo') {
      return `${getEmoji(guild, 'Immo', '')} ${wrapLink('**Immortality**', url)}`.trim();
    }
    if (lower.includes('epic mode') || lower === 'epic') {
      return `${getEmoji(guild, 'Epic', '')} ${wrapLink('**Epic Mode**', url)}`.trim();
    }
    if (lower.includes('choam')) {
      return `${getEmoji(guild, 'CHOAM', '')} ${wrapLink('**CHOAM Module**', url)}`.trim();
    }
    return wrapLink(`**${exp}**`, url);
  });
}

// Used for the visible Embeds (has Emojis + optional clickable URL)
function buildFormatSummaryLine(guild, boardType, expansions = [], url = null) {
  const richBoard = formatBoardWithEmoji(guild, boardType, url);
  const richExps = formatExpansionsWithEmoji(guild, expansions, url);
  return [richBoard, ...richExps].filter(Boolean).join(' + ');
}

// Used for the 1.5s Ghost Ping (Clean plain text, no emojis, no URLs)
function buildPlainFormatLine(boardType, expansions = []) {
  const board = boardType || 'Base Game';
  const exps = (expansions || []).map(exp => {
    const lower = String(exp).toLowerCase();
    if (lower.includes('immortality') && lower.includes('11')) return 'Immortality (To 11)';
    return exp;
  });
  return [board, ...exps].filter(Boolean).join(' + ');
}

function formatPresetText(guild, preset) {
  if (!preset) return '**Standard Rules**';
  const rawExps = [...(preset.expansions || [])];
  if (preset.mode && !rawExps.includes(preset.mode)) rawExps.push(preset.mode);
  return buildFormatSummaryLine(guild, preset.board_type, rawExps, preset.url || null);
}

async function getActivePreset() {
  try {
    const now = new Date().toISOString();
    const { data } = await supabase.from('league_presets').select('*').lte('start_date', now).gt('end_date', now).order('start_date', { ascending: false }).limit(1).maybeSingle();
    if (data) return data;
  } catch (err) {}
  return { board_type: 'Uprising', expansions: ['Immortality'], mode: 'CHOAM Module' };
}

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

function generateGoogleCalendarUrl(title, dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return null;
  const start = dateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const endObj = new Date(dateObj.getTime() + 2 * 60 * 60 * 1000);
  const end = endObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}`;
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

async function persistDiscordUserId(dbMatch, discordUserId, discordUsername = null) {
  const normalizedId = normalizeDiscordId(discordUserId);
  if (!dbMatch || !dbMatch.id || !normalizedId) return;
  const payload = { discord_user_id: normalizedId, updated_at: new Date().toISOString() };
  if (discordUsername) payload.discord_username = discordUsername;
  await supabase.from('player_discord_map').update(payload).eq('id', dbMatch.id);
}

async function saveDiscordPlayerMap({ discordUserId, discordUsername, displayName, playerKey }) {
  if (!discordUserId || !playerKey) return;
  try {
    const normKey = normalizeName(playerKey);
    const { data: existingRows } = await supabase
      .from('player_discord_map')
      .select('id, discord_user_id, player_key, display_name')
      .or(`discord_user_id.eq.${discordUserId},player_key.eq.${normKey}`)
      .limit(2);

    const payload = { discord_user_id: discordUserId, player_key: normKey, updated_at: new Date().toISOString() };
    if (discordUsername) payload.discord_username = discordUsername;
    if (displayName) payload.display_name = displayName;

    if (existingRows && existingRows.length > 0) {
      const targetRow = existingRows.find(r => r.player_key === normKey) || existingRows[0];
      await supabase.from('player_discord_map').update(payload).eq('id', targetRow.id);
    } else {
      await supabase.from('player_discord_map').insert(payload);
    }
  } catch (err) {}
}

async function resolveHostIgn(discordUserId, webHostId = null, webPlayerNames = []) {
  const validDiscordId = normalizeDiscordId(discordUserId);
  if (validDiscordId) {
    const { data: mapRow } = await supabase.from('player_discord_map').select('player_key, display_name').eq('discord_user_id', validDiscordId).maybeSingle();
    if (mapRow && mapRow.player_key) {
      const { data: ratingRow } = await supabase.from('player_ratings').select('display_name').eq('player_key', mapRow.player_key).eq('game_version', 'overall').maybeSingle();
      return { ign: ratingRow?.display_name || mapRow.display_name || capitalize(mapRow.player_key), isKnown: true };
    }
    const { data: dirRow } = await supabase.from('discord_guild_members').select('suggested_player_key, display_name, discord_username, similarity_score').eq('discord_user_id', validDiscordId).maybeSingle();
    if (dirRow && dirRow.suggested_player_key && (dirRow.similarity_score === null || dirRow.similarity_score >= DB_MATCH_THRESHOLD)) {
      const { data: ratingRow } = await supabase.from('player_ratings').select('display_name').eq('player_key', dirRow.suggested_player_key).eq('game_version', 'overall').maybeSingle();
      const resolvedIgn = ratingRow?.display_name || dirRow.display_name || capitalize(dirRow.suggested_player_key);
      await saveDiscordPlayerMap({ discordUserId: validDiscordId, discordUsername: dirRow.discord_username, displayName: resolvedIgn, playerKey: dirRow.suggested_player_key });
      return { ign: resolvedIgn, isKnown: true };
    }
    return { ign: null, isKnown: false };
  }
  if (webHostId) {
    const { data: wMap } = await supabase.from('player_discord_map').select('player_key, display_name').eq('claimed_by', webHostId).maybeSingle();
    if (wMap?.player_key) {
      const { data: rRow } = await supabase.from('player_ratings').select('display_name').eq('player_key', wMap.player_key).eq('game_version', 'overall').maybeSingle();
      return { ign: rRow?.display_name || wMap.display_name || capitalize(wMap.player_key), isKnown: true };
    }
  }
  if (webPlayerNames && webPlayerNames.length > 0 && webPlayerNames[0]) return { ign: webPlayerNames[0], isKnown: true };
  return { ign: null, isKnown: false };
}

async function promptUnknownHostIgn(lobby, hostUser, channel) {
  if (!lobby || !hostUser || !channel) return;
  try {
    const promptMsg = await channel.send({ content: `🎮 <@${hostUser.id}>, we don't have your **In-Game Name (IGN)** linked yet! Please reply in this channel with your exact Dune in-game name so players know which room to join (e.g. **YourName's game**).\n*(Type \`cancel\` to skip — expires in 2 minutes)*` });
    try {
      const filter = (m) => m.author.id === hostUser.id;
      const collected = await channel.awaitMessages({ filter, max: 1, time: 120000, errors: ['time'] });
      const replyMsg = collected.first();
      const inputIgn = replyMsg.content.trim();
      await replyMsg.delete().catch(() => {});
      if (inputIgn && inputIgn.toLowerCase() !== 'cancel') {
        const normKey = normalizeName(inputIgn);
        const { data: ratingRow } = await supabase.from('player_ratings').select('display_name').eq('player_key', normKey).eq('game_version', 'overall').maybeSingle();
        const finalDisplay = ratingRow?.display_name || inputIgn;
        await saveDiscordPlayerMap({ discordUserId: hostUser.id, discordUsername: hostUser.username, displayName: finalDisplay, playerKey: normKey });
        await supabase.from('discord_guild_members').update({ suggested_player_key: normKey, has_verified_map: true }).eq('discord_user_id', hostUser.id);
        const { data: freshLobby } = await supabase.from('active_async_matches').select('*').eq('id', lobby.id).maybeSingle();
        if (freshLobby && freshLobby.status === 'searching') await syncLobbyEmbed(freshLobby);
      }
    } catch (timeoutErr) {}
    await promptMsg.delete().catch(() => {});
  } catch (err) {}
}

async function clearHostClaimAlert(lobbyId) {
  const key = String(lobbyId);
  const info = hostClaimAlertMessages.get(key);
  if (!info) return;
  hostClaimAlertMessages.delete(key);
  try {
    const ch = await discordClient.channels.fetch(info.channelId).catch(() => null);
    if (ch) {
      const msg = await ch.messages.fetch(info.messageId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    }
  } catch (e) {}
}

async function clear3PlayerVote(lobbyId, reasonText = null) {
  const key = String(lobbyId);
  const vote = active3PlayerVotes.get(key);
  if (!vote) return;
  active3PlayerVotes.delete(key);
  try {
    const ch = await discordClient.channels.fetch(vote.channelId).catch(() => null);
    if (ch) {
      if (vote.promptMsgId) {
        const msg = await ch.messages.fetch(vote.promptMsgId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
      if (reasonText) {
        const notice = await ch.send({ content: reasonText }).catch(() => null);
        if (notice) setTimeout(() => notice.delete().catch(() => {}), 15000);
      }
    }
  } catch (e) {}
}

async function handlePostLeaveOrHostCheck(lobby, previousHostId = null) {
  if (!lobby || lobby.status !== 'searching') return false;
  const pIds = lobby.player_ids || [];
  const wNames = lobby.web_player_names || [];
  const guests = lobby.guest_players || [];
  const totalCount = pIds.length + wNames.length + guests.length;
  const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';

  if (totalCount === 0) {
    await clearHostClaimAlert(lobby.id);
    await clear3PlayerVote(lobby.id);
    await supabase.from('active_async_matches').update({ status: 'cancelled', auto_start_at: null }).eq('id', lobby.id);
    const channel = await discordClient.channels.fetch(lobby.channel_id || LEAGUE_LFG_CHANNEL_ID).catch(() => null);
    if (channel && lobby.message_id) {
      const msg = await channel.messages.fetch(lobby.message_id).catch(() => null);
      if (msg && msg.embeds && msg.embeds[0]) {
        await msg.edit({
          content: `🚫 **Lobby automatically cancelled (0/4 players)**`,
          embeds: [EmbedBuilder.from(msg.embeds[0]).setTitle('❌ Lobby Cancelled').setColor(0x95A5A6).setDescription('All players left the lobby.').setFields([]).setFooter(null)],
          components: []
        }).catch(() => {});
        await msg.reactions.removeAll().catch(() => {});
      }
    }
    if (isLeague) updateQueueMessage();
    return true;
  }

  if (totalCount < 3 && active3PlayerVotes.has(String(lobby.id))) {
    await clear3PlayerVote(lobby.id, '⚠️ **Roster changed.** 3-player start vote aborted.');
  }

  const currentHostId = normalizeDiscordId(lobby.host_id);
  const hostLeft = currentHostId && !pIds.includes(currentHostId);
  if (hostLeft) {
    await supabase.from('active_async_matches').update({ host_id: 'UNCLAIMED' }).eq('id', lobby.id);
    lobby.host_id = 'UNCLAIMED';
    const channel = await discordClient.channels.fetch(lobby.channel_id || LEAGUE_LFG_CHANNEL_ID).catch(() => null);
    if (channel && lobby.message_id) {
      const msg = await channel.messages.fetch(lobby.message_id).catch(() => null);
      if (msg) {
        const claimRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_auto_host_${lobby.id}`).setLabel('Claim Host').setStyle(ButtonStyle.Success).setEmoji('945323522140565514')
        );
        await msg.edit({ components: [claimRow] }).catch(() => {});
      }
      await syncLobbyEmbed(lobby);
      await clearHostClaimAlert(lobby.id);
      const remainingMentions = pIds.map(id => `<@${id}>`).join(' ');
      const alertMsg = await channel.send({ content: `⚠️ **The host has left the lobby!** Remaining players (${remainingMentions || 'on website'}): please click **Claim Host** on the lobby post above if you want to take over hosting duties!` }).catch(() => null);
      if (alertMsg) hostClaimAlertMessages.set(String(lobby.id), { channelId: channel.id, messageId: alertMsg.id });
    }
    if (isLeague) updateQueueMessage();
    return true;
  }
  return false;
}

async function getLobbySeatedParticipants(lobby) {
  const participants = [];
  const pIds = lobby.player_ids || [];
  const wNames = lobby.web_player_names || [];
  const wIds = lobby.web_player_ids || [];
  const guests = lobby.guest_players || [];
  const webMentionsMap = await getDiscordMentionsForWebPlayers(wIds);
  const seenDiscordIds = new Set();

  if (pIds.length > 0) {
    const [{ data: dMap }, { data: dirRows }] = await Promise.all([
      supabase.from('player_discord_map').select('discord_user_id, player_key, display_name, discord_username').in('discord_user_id', pIds),
      supabase.from('discord_guild_members').select('discord_user_id, discord_username, global_name, display_name, suggested_player_key').in('discord_user_id', pIds)
    ]);
    for (const uid of pIds) {
      seenDiscordIds.add(uid);
      const mRow = (dMap || []).find(r => r.discord_user_id === uid);
      const dRow = (dirRows || []).find(r => r.discord_user_id === uid);
      const names = [mRow?.display_name, mRow?.player_key, mRow?.discord_username, dRow?.display_name, dRow?.global_name, dRow?.discord_username, dRow?.suggested_player_key].filter(Boolean).map(n => normalizeName(n));
      const labelName = mRow?.display_name || dRow?.display_name || dRow?.discord_username || 'Player';
      participants.push({ key: `discord_${uid}`, discordId: uid, displayName: labelName, mention: `<@${uid}>`, normNames: new Set(names) });
    }
  }

  for (let i = 0; i < wNames.length; i++) {
    const rawName = wNames[i];
    const wId = wIds[i];
    let dId = null;
    if (wId && webMentionsMap[wId]) {
      const m = webMentionsMap[wId].match(/<@(\d+)>/);
      if (m) dId = m[1];
    }
    if (dId && seenDiscordIds.has(dId)) continue;
    participants.push({ key: dId ? `discord_${dId}` : `web_${normalizeName(rawName)}`, discordId: dId, displayName: rawName, mention: dId ? `<@${dId}>` : `**${rawName}** 🌐`, normNames: new Set([normalizeName(rawName)]) });
  }
  for (const g of guests) participants.push({ key: `guest_${normalizeName(g)}`, discordId: null, displayName: g, mention: `**${g}**`, normNames: new Set([normalizeName(g)]) });
  return participants;
}

function matchSenderToParticipant(senderName, participants, fallbackDiscordId = null) {
  if (fallbackDiscordId) {
    const byId = participants.find(p => p.discordId === fallbackDiscordId);
    if (byId) return byId;
  }
  const normSender = normalizeName(senderName);
  if (!normSender) return null;
  for (const p of participants) if (p.normNames.has(normSender)) return p;
  let best = null, bestScore = 0;
  for (const p of participants) {
    for (const candidate of p.normNames) {
      const score = similarity(normSender, candidate);
      if (score > bestScore) { bestScore = score; best = p; }
    }
  }
  return bestScore >= DB_MATCH_THRESHOLD ? best : null;
}

async function process3PlayerQuickChatEvent(lobby, senderName, messageCode) {
  const key = String(lobby.id);
  const participants = await getLobbySeatedParticipants(lobby);
  if (participants.length !== 3) return;
  const channel = await discordClient.channels.fetch(lobby.channel_id || LEAGUE_LFG_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  let vote = active3PlayerVotes.get(key);
  const matchedPart = matchSenderToParticipant(senderName, participants);
  const participantKey = matchedPart ? matchedPart.key : `raw_${normalizeName(senderName || 'Player')}`;
  const displaySender = matchedPart ? matchedPart.displayName : (senderName || 'Player');

  if (messageCode === 'start_3p_ask') {
    if (!vote) {
      vote = { agreedKeys: new Set([participantKey]), agreedNames: [displaySender], promptMsgId: null, channelId: channel.id };
      active3PlayerVotes.set(key, vote);
      const remainingMentions = participants.filter(p => !vote.agreedKeys.has(p.key)).map(p => p.mention).join(', ');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`agree_3p_btn_${lobby.id}`).setLabel('Agree to 3-Player Start').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`cancel_3p_btn_${lobby.id}`).setLabel('Wait for 4th Player').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );
      const promptMsg = await channel.send({
        content: `🗳️ **3-Player Match Start Requested!**\n**${displaySender}** wants to start League Lobby \`${lobby.match_id || `sa${lobby.id}`}\` with **3 players** (**1/3** agreed).\n\nWaiting on: ${remainingMentions || 'remaining players'}\n*(Click **Agree to 3-Player Start** below or on the website — all 3 players must agree!)*`,
        components: [row]
      }).catch(() => null);
      if (promptMsg) vote.promptMsgId = promptMsg.id;
    }
    return;
  }
  if (messageCode === 'agree_3p') {
    if (!vote) { vote = { agreedKeys: new Set(), agreedNames: [], promptMsgId: null, channelId: channel.id }; active3PlayerVotes.set(key, vote); }
    if (vote.agreedKeys.has(participantKey)) return;
    vote.agreedKeys.add(participantKey);
    vote.agreedNames.push(displaySender);
    const agreedCount = vote.agreedKeys.size;
    if (agreedCount < 3) {
      const remainingMentions = participants.filter(p => !vote.agreedKeys.has(p.key)).map(p => p.mention).join(', ');
      await channel.send({ content: `✅ **${displaySender}** agreed to start with 3 players! (**${agreedCount}/3** agreed — waiting on ${remainingMentions || 'remaining player'})` }).catch(() => {});
      if (vote.promptMsgId) {
        const promptMsg = await channel.messages.fetch(vote.promptMsgId).catch(() => null);
        if (promptMsg) await promptMsg.edit({ content: `🗳️ **3-Player Match Start Vote (${agreedCount}/3 Agreed)**\nAgreed: **${vote.agreedNames.join(', ')}**\nWaiting on: ${remainingMentions || 'remaining player'}` }).catch(() => {});
      }
    } else {
      await clear3PlayerVote(lobby.id);
      const startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
      await channel.send({ content: `🎉 **All 3 players agreed (3/3)!** Match \`${lobby.match_id || `sa${lobby.id}`}\` is now **3/3** and officially started — please start your game in-game within **15 minutes** (<t:${Math.floor(startTargetDate.getTime() / 1000)}:R>)!` }).catch(() => {});
      await executeLobbyStartSequence(lobby, channel);
    }
  }
}

async function syncGuildDirectory() {
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    if (!guild) return;
    const members = await guild.members.fetch();
    const validMembers = members.filter(m => !m.user.bot);

    const { data: verifiedMaps } = await supabase
      .from('player_discord_map')
      .select('id, discord_user_id, player_key, has_league_lfg_role');

    const verifiedSet = new Set((verifiedMaps || []).map(m => m.discord_user_id).filter(Boolean));
    const { data: allRatings } = await supabase.from('player_ratings').select('player_key, display_name').eq('game_version', 'overall');
    const ratingsList = allRatings || [];

    const rows = [];
    const roleHolderDiscordIds = new Set();

    for (const [, member] of validMembers) {
      const dId = member.id;
      const username = member.user.username;
      const globalName = member.user.globalName || null;
      const displayName = member.nickname || member.displayName || username;
      const isVerified = verifiedSet.has(dId);
      const hasLeagueRole = member.roles.cache.has(LEAGUE_NOTIFY_ROLE_ID);

      if (hasLeagueRole) roleHolderDiscordIds.add(dId);

      let suggestedKey = null, bestScore = 0;
      if (!isVerified) {
        for (const rating of ratingsList) {
          const score = Math.max(
            similarity(displayName, rating.display_name),
            similarity(displayName, rating.player_key),
            similarity(username, rating.player_key)
          );
          if (score > bestScore) { bestScore = score; suggestedKey = rating.player_key; }
        }
      }

      rows.push({
        discord_user_id: dId,
        discord_username: username,
        global_name: globalName,
        display_name: displayName,
        suggested_player_key: bestScore >= DB_MATCH_THRESHOLD ? suggestedKey : null,
        similarity_score: bestScore >= DB_MATCH_THRESHOLD ? parseFloat(bestScore.toFixed(3)) : null,
        has_verified_map: isVerified,
        has_league_lfg_role: hasLeagueRole,
        joined_at: member.joinedAt ? member.joinedAt.toISOString() : null,
        updated_at: new Date().toISOString()
      });
    }

    for (let i = 0; i < rows.length; i += 100) {
      await supabase.from('discord_guild_members').upsert(rows.slice(i, i + 100), { onConflict: 'discord_user_id' });
    }

    // Backfill player_discord_map ONLY where the DB state differs from live Discord role state
    const idsToSetTrue = [];
    const idsToSetFalse = [];

    for (const m of verifiedMaps || []) {
      if (!m.discord_user_id) continue;
      const shouldBeTrue = roleHolderDiscordIds.has(m.discord_user_id);
      if (shouldBeTrue && m.has_league_lfg_role !== true) {
        idsToSetTrue.push(m.id);
      } else if (!shouldBeTrue && m.has_league_lfg_role === true) {
        idsToSetFalse.push(m.id);
      }
    }

    if (idsToSetTrue.length > 0) {
      await supabase.from('player_discord_map').update({ has_league_lfg_role: true }).in('id', idsToSetTrue);
    }
    if (idsToSetFalse.length > 0) {
      await supabase.from('player_discord_map').update({ has_league_lfg_role: false }).in('id', idsToSetFalse);
    }
  } catch (err) {
    console.error('[Directory] Error syncing guild directory:', err);
  }
}
async function resolveMentionForName(guild, playerName) {
  let dbMatch = await getDatabasePlayerMap(playerName);
  const mappedDiscordId = normalizeDiscordId(dbMatch && dbMatch.discord_user_id);
  if (mappedDiscordId) return userMention(mappedDiscordId);
  const norm = normalizeName(playerName);
  const safeName = String(playerName || '').trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
  const { data: directoryMatches } = await supabase.from('discord_guild_members').select('discord_user_id, display_name, discord_username, suggested_player_key, similarity_score').or(`display_name.ilike.*${safeName}*,discord_username.ilike.*${safeName}*,suggested_player_key.eq.${norm}`).limit(5);
  if (directoryMatches && directoryMatches.length > 0) {
    let bestDir = null, bestScore = 0;
    for (const d of directoryMatches) {
      const score = Math.max(similarity(playerName, d.display_name), similarity(playerName, d.discord_username), similarity(playerName, d.suggested_player_key));
      if (score > bestScore) { bestScore = score; bestDir = d; }
    }
    if (bestDir && bestScore >= DB_MATCH_THRESHOLD) {
      await saveDiscordPlayerMap({ discordUserId: bestDir.discord_user_id, discordUsername: bestDir.discord_username, displayName: bestDir.display_name, playerKey: bestDir.suggested_player_key || norm });
      await supabase.from('discord_guild_members').update({ has_verified_map: true }).eq('discord_user_id', bestDir.discord_user_id);
      return userMention(bestDir.discord_user_id);
    }
  }
  const searchNames = [dbMatch && dbMatch.discord_username, dbMatch && dbMatch.display_name, dbMatch && dbMatch.username, dbMatch && dbMatch.player_key, playerName].filter(Boolean);
  const member = await searchGuildMemberByNames(guild, searchNames);
  if (member && member.id) { await persistDiscordUserId(dbMatch, member.id, member.user.username); return userMention(member.id); }
  if (dbMatch && dbMatch.discord_username) return '(' + dbMatch.discord_username + ')';
  return null;
}

async function notifyLfgAdminQueueJoin(whoText, howText) {
  try {
    const alertChannel = await discordClient.channels.fetch(LFG_ADMIN_ALERT_CHANNEL_ID).catch(() => null);
    if (!alertChannel) return;
    await alertChannel.send({ content: `📢 <@&${LFG_ADMIN_ROLE}> **Queue Activity:** ${whoText} joined the queue (${howText}).`, allowedMentions: { roles: [LFG_ADMIN_ROLE] } }).catch(() => {});
  } catch (err) {}
}

async function resolveQueuePlayerIdentity(discordUserId, member) {
  const { data: mapRecord } = await supabase.from('player_discord_map').select('player_key, display_name, claimed_by').eq('discord_user_id', discordUserId).maybeSingle();
  if (mapRecord && mapRecord.player_key) return { userId: mapRecord.claimed_by || null, playerKey: mapRecord.player_key, displayName: mapRecord.display_name || capitalize(mapRecord.player_key) };
  const { data: dirRecord } = await supabase.from('discord_guild_members').select('suggested_player_key, display_name, discord_username').eq('discord_user_id', discordUserId).maybeSingle();
  if (dirRecord?.suggested_player_key) return { userId: null, playerKey: dirRecord.suggested_player_key, displayName: dirRecord.display_name || dirRecord.discord_username || capitalize(dirRecord.suggested_player_key) };
  const fallbackName = member?.nickname || member?.displayName || member?.user?.username || 'Player';
  return { userId: null, playerKey: normalizeName(fallbackName), displayName: fallbackName };
}

async function getOldestOpenLeagueLobby() {
  try {
    const { data: openLobbies } = await supabase.from('active_async_matches').select('*').eq('status', 'searching').eq('is_league', true).order('created_at', { ascending: true });
    if (!openLobbies || openLobbies.length === 0) return null;
    for (const lobby of openLobbies) {
      const totalCount = (lobby.player_ids?.length || 0) + (lobby.web_player_names?.length || 0) + (lobby.guest_players?.length || 0);
      if (totalCount < 4) return lobby;
    }
  } catch (err) {}
  return null;
}

async function tryAutoSeatIntoOpenLeagueLobby(discordUserId, displayName, userId = null) {
  try {
    const { data: openLobbies } = await supabase.from('active_async_matches').select('*').eq('status', 'searching').eq('is_league', true).order('created_at', { ascending: true });
    if (!openLobbies || openLobbies.length === 0) return null;
    for (const lobby of openLobbies) {
      const pIds = [...(lobby.player_ids || [])];
      const wNames = [...(lobby.web_player_names || [])];
      const wIds = [...(lobby.web_player_ids || [])];
      const guests = [...(lobby.guest_players || [])];
      const totalCount = pIds.length + wNames.length + guests.length;
      if (totalCount >= 4) continue;
      if (discordUserId && pIds.includes(discordUserId)) return { ...lobby, alreadySeated: true };
      if (userId && wIds.includes(userId)) return { ...lobby, alreadySeated: true };

      if (discordUserId) pIds.push(discordUserId);
      else { wNames.push(displayName || 'Web Player'); wIds.push(userId || null); }

      const newTotal = pIds.length + wNames.length + guests.length;
      const updatePayload = { player_ids: pIds, web_player_names: wNames, web_player_ids: wIds };
      let startTargetDate = null;
      if (newTotal === 4 && !lobby.auto_start_at) {
        startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
        updatePayload.auto_start_at = startTargetDate.toISOString();
      }
      if (newTotal === 4 && active3PlayerVotes.has(String(lobby.id))) await clear3PlayerVote(lobby.id);

      await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);
      await syncLobbyEmbed({ ...lobby, ...updatePayload });
      updateQueueMessage();

      const targetChId = lobby.channel_id || LEAGUE_LFG_CHANNEL_ID;
      const leagueChannel = await discordClient.channels.fetch(targetChId).catch(() => null);
      if (leagueChannel) {
        const whoSeated = discordUserId ? `<@${discordUserId}> (**${displayName}**)` : `**${displayName}** 🌐`;
        const hostMention = normalizeDiscordId(lobby.host_id) ? `<@${lobby.host_id}>` : '';
        const notifyPings = (lobby.notify_user_ids || []).map(id => `<@${id}>`).join(' ');
        const extraPings = [hostMention, notifyPings].filter(Boolean).join(' ');
        await leagueChannel.send({ content: `⚔️ ${whoSeated} clicked **Play** and was **automatically seated** into open League Lobby \`${lobby.match_id || `sa${lobby.id}`}\`! (${newTotal}/4) ${extraPings}`.trim() }).catch(() => {});
        if (startTargetDate) await leagueChannel.send({ content: `⏳ **Lobby full (4/4)!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!` }).catch(() => {});
      }
      return lobby;
    }
  } catch (err) {}
  return null;
}

async function updateQueueMessage() {
  if (queueUpdateDebounce) clearTimeout(queueUpdateDebounce);
  
  queueUpdateDebounce = setTimeout(async () => {
    try {
      const channel = await discordClient.channels.fetch(QUEUE_CHANNEL_ID).catch(() => null);
      if (!channel) return;
      const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (!messages) return;
      const targetMsg = messages.find(m => m.author.id === discordClient.user.id && m.embeds[0] && m.embeds[0].title && m.embeds[0].title.includes('League Matchmaking Queue'));
      if (!targetMsg) return;

      const now = new Date().toISOString();
      const guild = channel.guild;

      const [{ data: currentPreset }, { data: queueRecords }, openLobby] = await Promise.all([
        supabase.from('league_presets').select('*').lte('start_date', now).gt('end_date', now).order('start_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('matchmaking_queue').select('*').eq('mode', 'live').order('joined_at', { ascending: true }),
        getOldestOpenLeagueLobby()
      ]);

      const currentDesc = formatPresetText(guild, currentPreset);
      const rotationDetails = `🎲 **Current Active Format:**\n• ${currentDesc}`;

      const liveQueue = queueRecords || [];
      const currentSeasonId = await getCurrentSeasonId();
      let activeField;

      if (openLobby) {
        const { display: openRosterStr, count: openCount } = await buildRosterDisplay(openLobby);
        const hostIgnInfo = openLobby.host_id === 'UNCLAIMED'
          ? { ign: null, isKnown: false }
          : await resolveHostIgn(openLobby.host_id, openLobby.web_host_id, openLobby.web_player_names);
        const lobbyRoomStr = hostIgnInfo.isKnown && hostIgnInfo.ign ? `🎮 Room: **${hostIgnInfo.ign}'s game**\n` : '';
        let openChId = LEAGUE_LFG_CHANNEL_ID;
        if (openLobby.channel_id) openChId = openLobby.channel_id;
        const jumpUrl = `https://discord.com/channels/${DISCORD_GUILD_ID}/${openChId}/${openLobby.message_id}`;

       activeField = {
          name: `🟢 Open League Lobby (${openCount}/4) — Click Play to Join!`,
          value: `${lobbyRoomStr}${openRosterStr}\n\n🔗 **[Jump to Lobby](${jumpUrl})** in <#${openChId}>`,
          inline: false
        };
      } else {
        let liveText = '*Queue is empty*';
        if (liveQueue.length > 0) {
          const linePromises = liveQueue.map(async (r) => {
            const singleLobbyStub = {
              player_ids: r.discord_user_id ? [r.discord_user_id] : [],
              web_player_names: !r.discord_user_id ? [r.display_name || r.player_key || 'Web Player'] : [],
              web_player_ids: !r.discord_user_id ? [r.user_id || null] : [],
              guest_players: [], notify_user_ids: [], is_league: true, season_id: currentSeasonId
            };
            const { display: singleLine } = await buildRosterDisplay(singleLobbyStub);
            const expireStr = r.expires_at ? ` *(expires <t:${Math.floor(new Date(r.expires_at).getTime() / 1000)}:R>)*` : '';
            return `${singleLine}${expireStr}`;
          });
          const formattedLines = await Promise.all(linePromises);
          liveText = formattedLines.join('\n');
        }
        activeField = { name: `🔴 Live Queue (${liveQueue.length}/4)`, value: liveText, inline: false };
      }

      const updatedEmbed = new EmbedBuilder()
        .setTitle('⚔️ Automated League Matchmaking Queue')
        .setDescription(`${rotationDetails}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Click **Play** to join an open lobby, enter the queue, or host a match.\n• Click **Leave** to exit the queue or leave your current open lobby.`)
        .setColor(0xF1C40F)
        .setFields(activeField);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('queue_play').setLabel('Play').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('queue_leave').setLabel('Leave').setStyle(ButtonStyle.Danger)
      );

      await targetMsg.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => {});
      if (liveQueue.length >= 4) await triggerAutoPop('live');
    } catch (e) {}
  }, 1000);
}

async function syncActiveLeaguePlayersRole() {
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    if (!guild) return 0;
    const role = guild.roles.cache.get(ACTIVE_LEAGUE_ROLE_ID) || await guild.roles.fetch(ACTIVE_LEAGUE_ROLE_ID).catch(() => null);
    if (!role) return 0;

    const threeWeeksAgoIso = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDeltas } = await supabase.from('league_match_rating_deltas').select('player_key').gte('created_at', threeWeeksAgoIso);
    const { data: recentLeagueGames } = await supabase.from('games').select('id').eq('is_league', true).gte('created_at', threeWeeksAgoIso);

    const activeKeysSet = new Set((recentDeltas || []).map(d => normalizeName(d.player_key)).filter(Boolean));
    if (recentLeagueGames && recentLeagueGames.length > 0) {
      const gameIds = recentLeagueGames.map(g => g.id);
      const { data: recentResults } = await supabase.from('game_results').select('player_name').in('game_id', gameIds);
      for (const r of recentResults || []) {
        const nk = normalizeName(r.player_name);
        if (nk) activeKeysSet.add(nk);
      }
    }

    const activeKeys = Array.from(activeKeysSet);
    const eligibleDiscordIds = new Set();
    if (activeKeys.length > 0) {
      const [{ data: mappedRows }, { data: dirRows }] = await Promise.all([
        supabase.from('player_discord_map').select('discord_user_id, player_key').in('player_key', activeKeys),
        supabase.from('discord_guild_members').select('discord_user_id, suggested_player_key').in('suggested_player_key', activeKeys)
      ]);
      for (const m of mappedRows || []) if (m.discord_user_id) eligibleDiscordIds.add(m.discord_user_id);
      for (const d of dirRows || []) if (d.discord_user_id) eligibleDiscordIds.add(d.discord_user_id);
    }

    for (const discordId of eligibleDiscordIds) {
      const member = guild.members.cache.get(discordId) || await guild.members.fetch(discordId).catch(() => null);
      if (member && !member.roles.cache.has(ACTIVE_LEAGUE_ROLE_ID)) await member.roles.add(ACTIVE_LEAGUE_ROLE_ID).catch(() => {});
    }
    for (const [memberId, member] of role.members) {
      if (!eligibleDiscordIds.has(memberId)) await member.roles.remove(ACTIVE_LEAGUE_ROLE_ID).catch(() => {});
    }
    return eligibleDiscordIds.size;
  } catch (err) { return 0; }
}

async function updateLeagueInfoMessage() {
  if (infoUpdateDebounce) clearTimeout(infoUpdateDebounce);
  infoUpdateDebounce = setTimeout(async () => {
    try {
      const channel = await discordClient.channels.fetch(LEAGUE_INFO_CHANNEL_ID).catch(() => null);
      if (!channel) return;
      const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (!messages) return;
      const targetMsg = messages.find(m =>
        m.author.id === discordClient.user.id &&
        m.embeds[0] &&
        m.embeds[0].title &&
        m.embeds[0].title.includes('Ranked League')
      );
      if (!targetMsg) return;

      const now = new Date().toISOString();
      const guild = channel.guild;
      const { data: seasonRow } = await supabase.from('sp_seasons').select('*').lte('starts_at', now).gt('ends_at', now).maybeSingle();

      const dbSeasonId = seasonRow?.id || await getCurrentSeasonId();
      const displaySeasonNum = Math.max(1, dbSeasonId - 1);
      const seasonStartsAt = seasonRow?.starts_at || '2026-10-01T00:00:00Z';
      const seasonEndsUnix = seasonRow?.ends_at ? Math.floor(new Date(seasonRow.ends_at).getTime() / 1000) : null;

      const [
        { data: currentPreset },
        { data: nextPreset },
        { data: topRatings },
        { count: seasonGamesCount }
      ] = await Promise.all([
        supabase.from('league_presets').select('*').lte('start_date', now).gt('end_date', now).order('start_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('league_presets').select('*').gt('start_date', now).order('start_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('player_league_ratings').select('player_key, elo, games_played, wins').eq('season', dbSeasonId).order('elo', { ascending: false }).limit(3),
        supabase.from('games').select('id', { count: 'exact', head: true }).eq('is_league', true).gte('created_at', seasonStartsAt)
      ]);

      // 1. Format Rotation (Current + Upcoming from Supabase + Poll channel)
      const currentDesc = formatPresetText(guild, currentPreset);
      let formatSection = `🎲 **Current Active Format:**\n• ${currentDesc}`;

      if (nextPreset) {
        const nextDesc = formatPresetText(guild, nextPreset);
        const startUnix = Math.floor(new Date(nextPreset.start_date).getTime() / 1000);
        formatSection += `\n\n📅 **Upcoming Format (starts <t:${startUnix}:D>):**\n• ${nextDesc} (<t:${startUnix}:R>)`;
      }

      formatSection += `\n\n🗳️ **Future Formats:**\n• Decided based on the community poll in <#${LEAGUE_POLL_CHANNEL_ID}>!`;

      // 2. Top 3 Standings (Using Lobby/Queue Deduplication & Profile Links)
      let top3Text = '*No ranked matches recorded yet this season.*';
      if (topRatings && topRatings.length > 0) {
        const topKeys = topRatings.map(r => r.player_key);
        const [{ data: mapRows }, { data: dirRows }, { data: globalRatingRows }] = await Promise.all([
          supabase.from('player_discord_map').select('player_key, display_name, discord_user_id, discord_username').in('player_key', topKeys),
          supabase.from('discord_guild_members').select('discord_user_id, discord_username, global_name, display_name, suggested_player_key').in('suggested_player_key', topKeys),
          supabase.from('player_ratings').select('player_key, display_name').in('player_key', topKeys).eq('game_version', 'overall')
        ]);

        const nameMap = {};
        const discordIdMap = {};
        const discordNamesMap = {};

        (globalRatingRows || []).forEach(r => {
          if (r.display_name) nameMap[r.player_key] = r.display_name;
        });

        (mapRows || []).forEach(r => {
          if (r.display_name && !nameMap[r.player_key]) nameMap[r.player_key] = r.display_name;
          if (r.discord_user_id) {
            discordIdMap[r.player_key] = r.discord_user_id;
            if (!discordNamesMap[r.discord_user_id]) discordNamesMap[r.discord_user_id] = [];
            if (r.discord_username) discordNamesMap[r.discord_user_id].push(r.discord_username);
          }
        });

        (dirRows || []).forEach(d => {
          if (d.suggested_player_key && !discordIdMap[d.suggested_player_key] && d.discord_user_id) {
            discordIdMap[d.suggested_player_key] = d.discord_user_id;
          }
          if (d.discord_user_id) {
            if (!discordNamesMap[d.discord_user_id]) discordNamesMap[d.discord_user_id] = [];
            discordNamesMap[d.discord_user_id].push(d.display_name, d.global_name, d.discord_username);
          }
        });

        // Also check live guild member cache for nicknames/display names
        for (const pk of topKeys) {
          const uid = discordIdMap[pk];
          if (uid && guild) {
            const member = guild.members.cache.get(uid) || await guild.members.fetch(uid).catch(() => null);
            if (member) {
              if (!discordNamesMap[uid]) discordNamesMap[uid] = [];
              discordNamesMap[uid].push(member.nickname, member.displayName, member.user?.globalName, member.user?.username);
            }
          }
        }

        const trophyEmojis = [
          getEmoji(guild, 'Tournament', '🥇'),
          getEmoji(guild, '2ndTrophy', '🥈'),
          getEmoji(guild, '3rdTrophy', '🥉')
        ];

        const rankLines = topRatings.map((row, idx) => {
          const badge = trophyEmojis[idx] || `${idx + 1}.`;
          const caseName = nameMap[row.player_key] || capitalize(row.player_key);
          const profileUrl = `https://dunestats.cc/players/${encodeURIComponent(caseName)}`;
          const uid = discordIdMap[row.player_key];

          let playerDisplay = `[${caseName}](${profileUrl})`;
          if (uid) {
            const normIgn = normalizeName(caseName);
            const knownDiscordNames = (discordNamesMap[uid] || []).filter(Boolean);
            const sameName = knownDiscordNames.some(dn => normalizeName(dn) === normIgn);
            playerDisplay = sameName
              ? `<@${uid}> [📊](${profileUrl})`
              : `[${caseName}](${profileUrl}) <@${uid}>`;
          }

          return `${badge} ${playerDisplay} — **${Number(row.elo).toFixed(1)} ELO**`;
        });

        top3Text = `${rankLines.join('\n')}\n\n🔗 **[View Full Ranking on dunestats.cc](https://dunestats.cc/leaderboard)**`;
      } else {
        top3Text += `\n\n🔗 **[View Full Ranking on dunestats.cc](https://dunestats.cc/leaderboard)**`;
      }

      // 3. League Activity Stats (Tracked via role, but without mentioning the role)
      const role = guild.roles.cache.get(ACTIVE_LEAGUE_ROLE_ID) || await guild.roles.fetch(ACTIVE_LEAGUE_ROLE_ID).catch(() => null);
      const activeRoleCount = role ? role.members.size : 0;

      const statsLines = [
        `👥 **Active Players on Discord (Last 3 Weeks):** **${activeRoleCount}**`,
        `🎮 **League Games Played (Season ${displaySeasonNum}):** **${seasonGamesCount || 0}**`
      ];

      if (seasonEndsUnix) {
        statsLines.push(`⏳ **Season ${displaySeasonNum} Ends / Season ${displaySeasonNum + 1} Starts:** <t:${seasonEndsUnix}:D> (<t:${seasonEndsUnix}:R>)`);
      }

      const updatedEmbed = new EmbedBuilder()
        .setTitle(`🏆 Dune: Imperium Digital — Ranked League (Season ${displaySeasonNum})`)
        .setDescription(formatSection)
        .setColor(0xF1C40F)
        .setFields(
          { name: `🏅 Current Top 3 Standings`, value: top3Text, inline: false },
          { name: `📊 League Activity & Season Info`, value: statsLines.join('\n'), inline: false }
        )
        .setTimestamp();

      await targetMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
    } catch (e) {
      console.error('Error updating League Info message:', e);
    }
  }, 1000);
}
// -------------------------------------------------------------
// LOBBY UTILS
// -------------------------------------------------------------

async function createQueueLobby(hostId, players, mode = 'live', isAutoPop = false, useButtons = false, customNote = null) {
  try {
    const preset = await getActivePreset();
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    if (!guild) return null;

    const leagueChannel = await discordClient.channels.fetch(LEAGUE_LFG_CHANNEL_ID).catch(() => null);
    if (!leagueChannel) return null;
    
const boardDisplay = preset.board_type;
    const dbExpansions = [...(preset.expansions || [])];
    if (preset.mode && !dbExpansions.includes(preset.mode)) dbExpansions.push(preset.mode);
    
    // 1. Visible Embed gets Emojis + Clickable URL
    const formatLine = buildFormatSummaryLine(guild, boardDisplay, dbExpansions, preset.url || null);
    // 2. Ghost Ping gets clean plain text (no emojis, no URL)
    const plainFormatLine = buildPlainFormatLine(boardDisplay, dbExpansions);
    const currentSeasonId = await getCurrentSeasonId();

    const embedTitle = `🏆 Ranked League Match Open!`;
    const embedColor = 0xF1C40F;
    const emojiTarget = getEmoji(guild, 'LiveDune', '<:LiveDune:1232049130151346216>');
    const roleMention = `<@&1219666679764877424>`;

    let hostDisplay = isAutoPop ? '*(Host Unclaimed)*' : `<@${hostId}>`;
    const allSeatedTags = (players || []).map(id => `<@${id}>`).join(' ');
    let customPingSentence = `${hostDisplay} is looking for live players ${roleMention} for **${plainFormatLine}**. ${allSeatedTags}`.trim();

    if (isAutoPop) {
      customPingSentence = `A queue has popped! A new live League match has been generated ${roleMention} for **${plainFormatLine}**. ${allSeatedTags}`.trim();
    }

    const { display: rosterStr, count } = await buildRosterDisplay({ 
      player_ids: players, 
      is_league: true, 
      season_id: currentSeasonId,
      guest_players: [],
      web_player_names: [],
      web_player_ids: []
    });

    const hostIgnInfo = isAutoPop ? { ign: null, isKnown: false } : await resolveHostIgn(hostId);
    const lobbyNameLine = isAutoPop
      ? `🎮 In-Game Lobby: *(Claim host to set lobby name)*`
      : (hostIgnInfo.isKnown ? `🎮 In-Game Lobby: **${hostIgnInfo.ign}'s game**` : `🎮 In-Game Lobby: *(Waiting for host IGN...)*`);

    const expireUnix = Math.floor(Date.now() / 1000) + 10800;
    const descLines = [];
    if (isCustomLobbyNote(customNote)) {
      descLines.push(`"${customNote.trim()}"\n`);
    }
    descLines.push(formatLine);
    descLines.push(lobbyNameLine);

    const footerGuideBlock = `${emojiTarget} • **Join / Leave** the lobby\n📖 **[Emoji Controls Guide](${EMOJI_GUIDE_LINK})**`;
    const fields = [
      { name: `👥 Players (${count}/4)\n\u200B`, value: `${rosterStr}\n\n${footerGuideBlock}`, inline: false }
    ];

    const initialEmbed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setDescription(descLines.join('\n'))
      .setColor(embedColor)
      .addFields(fields)
      .setTimestamp();

    const targetMessage = await leagueChannel.send({ content: '🎮 Match Lobby generating...', embeds: [initialEmbed] });
    const dbMessageText = isCustomLobbyNote(customNote) ? customNote.trim() : 'Official Ranked League Match!';

    const { data: insertedMatch, error: insertError } = await supabase
      .from('active_async_matches')
      .insert({
        message_id: targetMessage.id,
        match_id: 'pending',
        channel_id: LEAGUE_LFG_CHANNEL_ID,
        guild_id: DISCORD_GUILD_ID,
        host_id: isAutoPop ? (players[0] || 'UNCLAIMED') : hostId,
        player_ids: players,
        notify_user_ids: [],
        guest_players: [],
        message_text: dbMessageText,
        lobby_password: 'None',
        board_type: boardDisplay,
        expansions: dbExpansions,
        status: 'searching',
        expires_at: new Date(expireUnix * 1000).toISOString(),
        mode: 'live',
        is_league: true,
        season_id: currentSeasonId,
        league_status: 'open',
        expected_player_keys: [],
        discord_usernames: []
      }).select('*').single();

    if (insertError || !insertedMatch) {
      await targetMessage.delete().catch(() => {});
      return null;
    }

    const numericLobbyId = insertedMatch.id;
    const generatedMatchId = `sa${numericLobbyId}`;
    const generatedPassword = `sa${numericLobbyId}`;

    await supabase.from('active_async_matches').update({
      match_id: generatedMatchId,
      lobby_password: generatedPassword,
      host_id: isAutoPop ? 'UNCLAIMED' : hostId
    }).eq('id', numericLobbyId);

    const copyableContent = `🔑 Lobby Password: \`${generatedPassword}\` *(Tap to copy)*\n🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${numericLobbyId}`;

    let components = [];
    if (isAutoPop) {
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_auto_host_${numericLobbyId}`).setLabel('Claim Host').setStyle(ButtonStyle.Success).setEmoji('945323522140565514')
        )
      ];
    }

    await targetMessage.edit({ content: copyableContent, embeds: [initialEmbed], components });
    updateQueueMessage();

    try {
      const customJoinEmoji = guild.emojis.cache.find((e) => e.name === 'LiveDune');
      await targetMessage.react(customJoinEmoji ? customJoinEmoji.id : '1232049130151346216').catch(() => {});
      await targetMessage.react('🎮').catch(() => {}); 
      await targetMessage.react('❌').catch(() => {});
      await targetMessage.react('🥾').catch(() => {}); 
      await targetMessage.react('🔔').catch(() => {}); 
      await targetMessage.react('📢').catch(() => {});
    } catch (e) {}

    const pingMessage = await leagueChannel.send({
      content: customPingSentence,
      allowedMentions: { roles: ['1219666679764877424'], users: players }
    });
    setTimeout(() => { pingMessage.delete().catch(() => {}); }, 1500);

    if (count >= 4) {
      const playerPing = players.map(id => `<@${id}>`).join(' ');
      const readyPing = await leagueChannel.send({ content: `🔔 **QUEUE POP!** Wake up: ${playerPing}` });
      setTimeout(() => { readyPing.delete().catch(() => {}); }, 15000);
      
      const startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
      await supabase.from('active_async_matches').update({ auto_start_at: startTargetDate.toISOString() }).eq('id', numericLobbyId);
      await leagueChannel.send({ content: `⏳ **Lobby full!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!` }).catch(() => {});
    }

    if (!isAutoPop && hostId && !hostIgnInfo.isKnown) {
      const hostUser = await discordClient.users.fetch(hostId).catch(() => null);
      if (hostUser) promptUnknownHostIgn({ ...insertedMatch, match_id: generatedMatchId, lobby_password: generatedPassword, host_id: hostId }, hostUser, leagueChannel);
    }

    return targetMessage;
  } catch (err) {
    console.error('Error creating queue lobby:', err);
    return null;
  }
}

async function triggerAutoPop(mode = 'live') {
  if (activeAutoPops.has(mode)) return;
  activeAutoPops.add(mode);

  try {
    const { data: queueRecords } = await supabase.from('matchmaking_queue').select('*').eq('mode', mode).order('joined_at', { ascending: true }).limit(4);
    if (!queueRecords || queueRecords.length < 4) return;
    const playersToPop = queueRecords.map(r => r.discord_user_id).filter(Boolean);
    for (const r of queueRecords) await supabase.from('matchmaking_queue').delete().eq('id', r.id);
    await createQueueLobby(null, playersToPop, mode, true, false, null);
    updateQueueMessage();
  } catch (err) {} finally { activeAutoPops.delete(mode); }
}

async function cleanExpiredQueueEntries() {
  try {
    const nowIso = new Date().toISOString();
    const { data: expired } = await supabase.from('matchmaking_queue').select('id').lte('expires_at', nowIso);
    if (expired && expired.length > 0) {
      await supabase.from('matchmaking_queue').delete().lte('expires_at', nowIso);
      updateQueueMessage();
    }
  } catch (e) {}
}

async function checkLobbyPermissions(lobby, userId, guild) {
  const validDiscordHostId = normalizeDiscordId(lobby.host_id);
  const isDiscordHost = userId === validDiscordHostId;
  const member = guild?.members?.cache?.get(userId) || await guild?.members?.fetch(userId).catch(() => null);
  const isAdmin = member?.roles?.cache?.has(LFG_ADMIN_ROLE) || member?.permissions?.has('Administrator') || false;

  let isWebHost = false;
  if (lobby.web_host_id) {
    const { data: profile } = await supabase.from('player_discord_map').select('claimed_by').eq('discord_user_id', userId).maybeSingle();
    if (profile && profile.claimed_by === lobby.web_host_id) isWebHost = true;
  }
  const isSeatedPlayer = (lobby.player_ids || []).includes(userId);
  return { canCancel: isDiscordHost || isWebHost || isAdmin, canManageRoster: isDiscordHost || isWebHost || isAdmin || isSeatedPlayer };
}

async function resolveAndAddPlayerToLobby(lobby, rawInput, adderUser, guild) {
  let players = [...(lobby.player_ids || [])];
  let guests = [...(lobby.guest_players || [])];
  let webNames = [...(lobby.web_player_names || [])];

  const totalCount = players.length + guests.length + webNames.length;
  if (totalCount >= 4) return { success: false, message: '❌ This lobby is already full (4/4).' };

  const cleanInput = String(rawInput || '').trim();
  const defaultFriendName = `Friend of ${adderUser.username}`;

  if (!cleanInput || cleanInput.toLowerCase() === 'default' || cleanInput.toLowerCase() === defaultFriendName.toLowerCase()) {
    guests.push(defaultFriendName);
  } else {
    const mentionMatch = cleanInput.match(/<@!?(\d{17,20})>/) || cleanInput.match(/^(\d{17,20})$/);
    if (mentionMatch) {
      const targetDiscordId = mentionMatch[1];
      if (players.includes(targetDiscordId)) return { success: false, message: `⚠️ <@${targetDiscordId}> is already in the lobby.` };
      const member = await guild?.members?.fetch(targetDiscordId).catch(() => null);
      await resolveQueuePlayerIdentity(targetDiscordId, member);
      players.push(targetDiscordId);
    } else {
      let matchedDiscordId = null, matchedDisplayName = null;
      const normInput = normalizeName(cleanInput);
      const safePattern = `*${cleanInput.replace(/[,%()]/g, ' ').trim()}*`;
      const { data: mapRows } = await supabase.from('player_discord_map').select('discord_user_id, player_key, display_name, username, discord_username').or(`player_key.eq.${normInput},display_name.ilike.${safePattern},discord_username.ilike.${safePattern},username.ilike.${safePattern}`).limit(5);

      let bestScore = 0;
      if (mapRows && mapRows.length > 0) {
        for (const r of mapRows) {
          const score = Math.max(similarity(cleanInput, r.display_name), similarity(cleanInput, r.player_key), similarity(cleanInput, r.discord_username), similarity(cleanInput, r.username));
          if (score > bestScore) { bestScore = score; matchedDiscordId = r.discord_user_id; matchedDisplayName = r.display_name || (r.player_key ? capitalize(r.player_key) : cleanInput); }
        }
      }

      if (bestScore < DB_MATCH_THRESHOLD) {
        const { data: dirRows } = await supabase.from('discord_guild_members').select('discord_user_id, display_name, discord_username, suggested_player_key').or(`display_name.ilike.${safePattern},discord_username.ilike.${safePattern},suggested_player_key.eq.${normInput}`).limit(5);
        if (dirRows && dirRows.length > 0) {
          for (const d of dirRows) {
            const score = Math.max(similarity(cleanInput, d.display_name), similarity(cleanInput, d.discord_username), similarity(cleanInput, d.suggested_player_key));
            if (score > bestScore) { bestScore = score; matchedDiscordId = d.discord_user_id; matchedDisplayName = d.display_name || d.discord_username; }
          }
        }
      }

      if (bestScore >= DB_MATCH_THRESHOLD && matchedDiscordId) {
        if (players.includes(matchedDiscordId)) return { success: false, message: `⚠️ <@${matchedDiscordId}> is already in the lobby.` };
        players.push(matchedDiscordId);
        await supabase.from('matchmaking_queue').delete().eq('discord_user_id', matchedDiscordId);
        updateQueueMessage();
      } else {
        const { data: ratingRow } = await supabase.from('player_ratings').select('display_name').eq('player_key', normInput).eq('game_version', 'overall').maybeSingle();
        guests.push(ratingRow?.display_name || matchedDisplayName || cleanInput);
      }
    }
  }

  const newTotal = players.length + guests.length + webNames.length;
  const updatePayload = { player_ids: players, guest_players: guests };
  let hitFull = false, startTargetDate = null;
  if (newTotal === 4 && !lobby.auto_start_at) {
    startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
    updatePayload.auto_start_at = startTargetDate.toISOString();
    hitFull = true;
  }

  await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);
  await syncLobbyEmbed({ ...lobby, ...updatePayload });
  updateQueueMessage();

  const channel = await discordClient.channels.fetch(lobby.channel_id).catch(() => null);
  if (channel && hitFull && startTargetDate) {
    await channel.send({ content: `⏳ **Lobby full!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!` }).catch(() => {});
  }
  return { success: true, message: `✅ Added player to the lobby! (${newTotal}/4)` };
}

async function runKickFlow(lobby, user, channel, lobbyMessage = null) {
  const targets = [];
  const letters = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫'];
  let idx = 0;

  const pIds = lobby.player_ids || [];
  const wNames = lobby.web_player_names || [];
  const wIds = lobby.web_player_ids || [];
  const guests = lobby.guest_players || [];

  while (wIds.length < wNames.length) wIds.push(null);
  for (const p of pIds) targets.push({ type: 'discord', id: p, label: `<@${p}>`, emoji: letters[idx++] });
  for (let i = 0; i < wNames.length; i++) targets.push({ type: 'web', name: wNames[i], index: i, id: wIds[i], label: `🌐 ${wNames[i]}`, emoji: letters[idx++] });
  for (let i = 0; i < guests.length; i++) targets.push({ type: 'guest', name: guests[i], index: i, label: `👥 ${guests[i]}`, emoji: letters[idx++] });
  if (targets.length === 0) return;

  const promptMsg = await channel.send({ content: `<@${user.id}>, who do you want to **kick** from the lobby?\n\n` + targets.map(t => `${t.emoji} — ${t.label}`).join('\n') });
  for (const t of targets) await promptMsg.react(t.emoji).catch(() => {});

  try {
    const filter = (r, u) => u.id === user.id && targets.some(t => t.emoji === (r.emoji.name || r.emoji.toString()));
    const collected = await promptMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const pickedEmoji = collected.first().emoji.name || collected.first().emoji.toString();
    const pickedTarget = targets.find(t => t.emoji === pickedEmoji);

    let newPIds = [...pIds], newWNames = [...wNames], newWIds = [...wIds], newGuests = [...guests];
    if (pickedTarget.type === 'discord') newPIds = newPIds.filter(id => id !== pickedTarget.id);
    else if (pickedTarget.type === 'web') { newWNames.splice(pickedTarget.index, 1); newWIds.splice(pickedTarget.index, 1); }
    else if (pickedTarget.type === 'guest') newGuests.splice(pickedTarget.index, 1);

    const cleanWIds = newWIds.map(id => (id && String(id).trim() !== '') ? id : null);
    const updatedFields = { player_ids: newPIds, web_player_names: newWNames, web_player_ids: cleanWIds, guest_players: newGuests, status: 'searching', auto_start_at: null };

    await supabase.from('active_async_matches').update(updatedFields).eq('id', lobby.id);
    let kickedName = pickedTarget.type === 'discord' ? `<@${pickedTarget.id}>` : pickedTarget.name;
    let kickNotice = `🥾 <@${user.id}> removed **${kickedName}** from the lobby.`;
    if (lobby.auto_start_at) kickNotice += `\n⚠️ **Roster drop verified.** Match countdown aborted.`;
    await channel.send({ content: kickNotice }).catch(() => {});

    if (pickedTarget.type === 'discord' && lobbyMessage) {
      for (const [, r] of lobbyMessage.reactions.cache) {
        if (!LOBBY_CONTROL_EMOJIS.has(r.emoji.name || '')) await r.users.remove(pickedTarget.id).catch(() => {});
      }
    }

    const updatedLobbyObj = { ...lobby, ...updatedFields };
    const handledSpecial = await handlePostLeaveOrHostCheck(updatedLobbyObj, lobby.host_id);
    if (!handledSpecial) {
      await syncLobbyEmbed(updatedLobbyObj);
      updateQueueMessage();
    }
  } catch (err) {}
  await promptMsg.delete().catch(() => {});
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
    if (!contentType.startsWith('image/')) return { attachment: null, buffer: null, fileName: null, imageUrl: publicUrl, tooLarge: false };
    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    if (buffer.length <= maxBytes) {
      return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.png' }), buffer, fileName: 'match-result.png', imageUrl: null, tooLarge: false };
    }
    try {
      buffer = await sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
      if (buffer.length <= maxBytes) return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.jpg' }), buffer, fileName: 'match-result.jpg', imageUrl: null, tooLarge: false };
      buffer = await sharp(buffer).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 62, mozjpeg: true }).toBuffer();
      if (buffer.length <= maxBytes) return { attachment: new AttachmentBuilder(buffer, { name: 'match-result.jpg' }), buffer, fileName: 'match-result.jpg', imageUrl: null, tooLarge: false };
    } catch (e) {}
    return { attachment: null, buffer: null, fileName: null, imageUrl: publicUrl, tooLarge: true };
  } catch (err) { return { attachment: null, buffer: null, fileName: null, imageUrl: null, tooLarge: false }; }
}

async function buildGameResultPayload(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, public_match_id, game_version, image_url, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, tournament_num, is_league, youtube_url')
    .eq('id', gameId)
    .single();
  if (gameError || !game) return null;

  const { data: results, error: resultsError = null } = await supabase
    .from('game_results')
    .select('player_name, leader_name, placement, points, player_slot, elo_delta, elo_delta_overall')
    .eq('game_id', gameId)
    .order('placement', { ascending: true });
  if (resultsError || !results || !results.length) return null;
  
  let tournamentDetails = null;
  if (game.tournament_num) {
    try {
      const currentPlayers = results.map(r => normalizeName(r.player_name));
      const { data: matchRows } = await supabase.from('tournament_matches').select('round_type, table_identifier, player_name').eq('tournament_num', game.tournament_num);
      if (matchRows && matchRows.length > 0) {
        const tablesMap = new Map();
        matchRows.forEach(row => {
          const groupKey = row.round_type + '_' + row.table_identifier;
          if (!tablesMap.has(groupKey)) tablesMap.set(groupKey, { roundType: row.round_type, tableIdentifier: row.table_identifier, players: [] });
          tablesMap.get(groupKey).players.push(normalizeName(row.player_name));
        });
        const matchedTable = Array.from(tablesMap.values()).find(t => currentPlayers.every(p => t.players.includes(p)));
        if (matchedTable) tournamentDetails = { roundType: matchedTable.roundType, tableIdentifier: matchedTable.tableIdentifier };
      }
    } catch (err) {}
  }

  const playerKeys = results.map(r => String(r.player_name || '').trim().toLowerCase());
  const normalizedKeys = results.map(r => normalizeName(r.player_name));
  const allLookupKeys = [...new Set([...playerKeys, ...normalizedKeys])].filter(Boolean);

  const { data: ratings } = await supabase.from('player_ratings').select('player_key, display_name, game_version, elo').in('player_key', allLookupKeys).in('game_version', ['overall', game.game_version]);
  const ratingsMap = {};
  for (const row of ratings || []) {
    if (!ratingsMap[row.player_key]) ratingsMap[row.player_key] = {};
    ratingsMap[row.player_key][row.game_version] = row.elo;
  }

  const { data: sandboxResults } = await supabase.from('sandbox_game_results').select('player_name, elo_delta_overall').eq('game_id', gameId);
  const sandboxDeltaMap = {};
  for (const row of sandboxResults || []) sandboxDeltaMap[normalizeName(row.player_name)] = row.elo_delta_overall;

  const { data: sandboxRatings } = await supabase.from('sandbox_player_ratings').select('player_key, overall_vp_elo').in('player_key', allLookupKeys).eq('game_version', 'overall');
  const sandboxRatingsMap = {};
  for (const row of sandboxRatings || []) sandboxRatingsMap[row.player_key] = row.overall_vp_elo;

  const leagueDeltaMap = {};
  const leagueRatingMap = {};
  const leagueRankMap = {};
  const isLeagueGame = game.is_league === true || String(game.is_league).toLowerCase() === 'true';

  if (isLeagueGame) {
    try {
      const currentSeasonId = await getCurrentSeasonId();
      const [{ data: lDeltas }, { data: allLeagueRatings }] = await Promise.all([
        supabase.from('league_match_rating_deltas').select('player_key, elo_delta, season').eq('game_id', gameId),
        supabase.from('player_league_ratings').select('player_key, elo, games_played').eq('season', currentSeasonId)
      ]);

      const beforeRatings = [];
      const afterRatings = [];

      for (const r of allLeagueRatings || []) {
        const currentElo = Number(r.elo);
        let deltaForThisGame = 0;
        
        const deltaRow = (lDeltas || []).find(d => d.player_key === r.player_key);
        if (deltaRow) {
          deltaForThisGame = Number(deltaRow.elo_delta);
          leagueDeltaMap[r.player_key] = deltaForThisGame;
          leagueDeltaMap[normalizeName(r.player_key)] = deltaForThisGame;
        }

        leagueRatingMap[r.player_key] = currentElo;
        leagueRatingMap[normalizeName(r.player_key)] = currentElo;

        afterRatings.push({ key: r.player_key, elo: currentElo });
        beforeRatings.push({ key: r.player_key, elo: currentElo - deltaForThisGame });
      }

      beforeRatings.sort((a, b) => b.elo - a.elo);
      afterRatings.sort((a, b) => b.elo - a.elo);

      for (let i = 0; i < afterRatings.length; i++) {
        const key = afterRatings[i].key;
        const newRank = i + 1;
        const oldRankIdx = beforeRatings.findIndex(b => b.key === key);
        const oldRank = oldRankIdx !== -1 ? oldRankIdx + 1 : newRank;
        
        const rData = (allLeagueRatings || []).find(r => r.player_key === key);
        const isNew = rData && rData.games_played <= 1;
        const rankDiff = oldRank - newRank;

        const rankInfo = { newRank, oldRank, rankDiff, isNew };
        leagueRankMap[key] = rankInfo;
        leagueRankMap[normalizeName(key)] = rankInfo;
      }
    } catch (lErr) {
      console.error('Error fetching league ratings/deltas for game:', gameId, lErr);
    }
  }

  const screenshotMedia = game.image_url ? await createDiscordImagePayload(game.image_url) : null;
  return { game, results, ratingsMap, sandboxDeltaMap, sandboxRatingsMap, leagueDeltaMap, leagueRatingMap, leagueRankMap, screenshotMedia, tournamentDetails };
}
// Calculates Tournament Points (TP) for a player row based on 1st and 2nd place VP
function calculateTournamentPoints(row, results) {
  const firstRow = results.find(r => Number(r.placement) === 1) || results[0];
  const secondRow = results.find(r => Number(r.placement) === 2) || results[1];
  const vp1 = Number(firstRow?.points);
  const vp2 = Number(secondRow?.points);
  const playerVp = Number(row.points);
  const place = Number(row.placement);

  if (isNaN(vp1) || isNaN(playerVp)) return null;

  if (place === 1) {
    const margin = !isNaN(vp2) ? Math.max(0, vp1 - vp2) : 0;
    return 20 + margin;
  }
  const baseMap = { 2: 15, 3: 10, 4: 5 };
  const baseTp = baseMap[place];
  if (baseTp === undefined) return null;
  const deficit = Math.max(0, vp1 - playerVp);
  return Math.max(0, baseTp - deficit);
}

async function buildEmbed(payload, guild) {
  const { game, results, ratingsMap, sandboxDeltaMap, sandboxRatingsMap, screenshotMedia, tournamentDetails: tourney } = payload;
  const modeLabel = capitalize(game.game_version || 'unknown'); 
  const tags = buildGameTags(game, guild); 
  const lines = [];
  const pipeSep = '|';
  
  let titleString = `Game Finished - ${modeLabel}`;
  if (game.tournament_num) {
    titleString = tourney ? `🏆 Tournament ${game.tournament_num} ${pipeSep} ${tourney.roundType} ${tourney.tableIdentifier}` : `🏆 Tournament ${game.tournament_num} Match Finished!`;
  }

  for (const row of results) {
    const place = getPlacementEmoji(guild, row.placement); 
    const playerKey = String(row.player_name || '').trim().toLowerCase();
    const normalizedKey = normalizeName(row.player_name);
    const mention = await resolveMentionForName(guild, row.player_name);
    const leaderEmoji = getLeaderEmoji(guild, row.leader_name);

    const safeMention = mention ? mention : '';
    const safeLeader = row.leader_name ? row.leader_name : 'Unknown Leader';
    const safePoints = row.points !== null && row.points !== undefined ? row.points : '?';

    let tpSuffix = '';
    if (game.tournament_num) {
      const tpVal = calculateTournamentPoints(row, results);
      if (tpVal !== null) tpSuffix = ` · **${tpVal} TP**`;
    }

    let text = `${place} **${row.player_name}** ${safeMention} -${leaderEmoji}${safeLeader} -${safePoints} pts${tpSuffix}`;
    text += `\nOverall: ${formatDelta(row.elo_delta_overall)}`;
    const overallElo = ratingsMap[playerKey]?.overall ?? ratingsMap[normalizedKey]?.overall;
    if (overallElo !== undefined) text += ` (-> ${Number(overallElo).toFixed(1)})`;

    text += ` ${pipeSep} ${modeLabel}:${formatDelta(row.elo_delta)}`;
    const modeElo = ratingsMap[playerKey]?.[game.game_version] ?? ratingsMap[normalizedKey]?.[game.game_version];
    if (modeElo !== undefined) text += ` (-> ${Number(modeElo).toFixed(1)})`;

    if (sandboxDeltaMap[normalizedKey] !== undefined) {
      text += ` ${pipeSep} All VP: ${formatDelta(sandboxDeltaMap[normalizedKey])}`;
      const sbElo = sandboxRatingsMap[playerKey] ?? sandboxRatingsMap[normalizedKey];
      if (sbElo !== undefined) text += ` (-> ${Number(sbElo).toFixed(1)})`;
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

// Shorter League-only Embed for LEAGUE_RESULTS_CHANNEL_ID (1562444292574941184)
async function buildLeagueEmbed(payload, guild) {
  const { game, results, leagueDeltaMap, leagueRatingMap, leagueRankMap, screenshotMedia } = payload;
  const tags = buildGameTags(game, guild);
  const lines = [];
  const pipeSep = '|';

  for (const row of results) {
    const place = getPlacementEmoji(guild, row.placement);
    const rawKey = String(row.player_name || '').trim().toLowerCase();
    const normKey = normalizeName(row.player_name);
    const mention = await resolveMentionForName(guild, row.player_name);
    const leaderEmoji = getLeaderEmoji(guild, row.leader_name);

    const safeMention = mention ? mention : '';
    const safeLeader = row.leader_name ? row.leader_name : 'Unknown Leader';
    const safePoints = row.points !== null && row.points !== undefined ? row.points : '?';

    const lDelta = leagueDeltaMap[rawKey] ?? leagueDeltaMap[normKey];
    const lElo = leagueRatingMap[rawKey] ?? leagueRatingMap[normKey];
    const rankInfo = leagueRankMap?.[rawKey] ?? leagueRankMap?.[normKey];

    let text = `${place} **${row.player_name}** ${safeMention} -${leaderEmoji}${safeLeader} -${safePoints} pts`;
    text += `\nLeague: ${formatDelta(lDelta !== undefined ? lDelta : row.elo_delta)}`;
    if (lElo !== undefined) text += ` (-> **${Number(lElo).toFixed(1)}**)`;

    if (rankInfo && rankInfo.newRank) {
      let changeBadge = '⚪ 0';
      if (rankInfo.isNew) changeBadge = '🆕';
      else if (rankInfo.rankDiff > 0) changeBadge = `🟢 ▲${rankInfo.rankDiff}`;
      else if (rankInfo.rankDiff < 0) changeBadge = `🔴 ▼${Math.abs(rankInfo.rankDiff)}`;
      text += ` ${pipeSep} Rank: **#${rankInfo.newRank}** (${changeBadge})`;
    }
    lines.push(text);
  }

  if (tags.length) lines.push('Game modes played: ' + tags.join(' | '));

  const titleStr = game.public_match_id
    ? `🏆 Ranked League Match — #${game.public_match_id}`
    : `🏆 Ranked League Match Finished!`;

  const embed = new EmbedBuilder()
    .setTitle(titleStr)
    .setURL(game.public_match_id ? `https://dunestats.cc/match/${game.public_match_id}` : `https://dunestats.cc/matches`)
    .setDescription(lines.join('\n\n'))
    .setColor(0xF1C40F)
    .setTimestamp(new Date());

  if (screenshotMedia?.imageUrl) embed.setImage(screenshotMedia.imageUrl);
  return embed;
}

// Spoiler-Free YouTube VOD Announcement for YOUTUBE_VOD_CHANNEL_ID (1561777632100745346)
async function announceYoutubeVod(gameId) {
  if (!gameId || activeVodLocks.has(gameId)) return;
  activeVodLocks.add(gameId);

  try {
    const { data: game } = await supabase
      .from('games')
      .select('id, public_match_id, youtube_url, tournament_num, is_league')
      .eq('id', gameId)
      .maybeSingle();

    if (!game || !game.youtube_url) return;

    const { data: results } = await supabase
      .from('game_results')
      .select('player_name, player_slot')
      .eq('game_id', gameId);

    if (!results || results.length === 0) return;

    const vodChannel = await discordClient.channels.fetch(YOUTUBE_VOD_CHANNEL_ID).catch(() => null);
    if (!vodChannel) return;

    const sortedPlayers = [...results].sort((a, b) => {
      if (a.player_slot !== null && b.player_slot !== null && a.player_slot !== b.player_slot) {
        return a.player_slot - b.player_slot;
      }
      return String(a.player_name || '').localeCompare(String(b.player_name || ''));
    });

    const playerDisplays = [];
    for (const r of sortedPlayers) {
      const mention = await resolveMentionForName(vodChannel.guild, r.player_name);
      playerDisplays.push(mention ? `**${r.player_name}** (${mention})` : `**${r.player_name}**`);
    }

    const matchLabel = game.public_match_id ? `#${game.public_match_id}` : `Match`;
    const matchLink = game.public_match_id ? `https://dunestats.cc/match/${game.public_match_id}` : `https://dunestats.cc/matches`;

    let typePrefix = '🎬 **Match Recording Available!**';
    if (game.tournament_num) typePrefix = `🎬 **Tournament #${game.tournament_num} Match Recording!**`;
    else if (game.is_league) typePrefix = `🎬 **Ranked League Match Recording!**`;

    const content = [
      `${typePrefix} — **[${matchLabel}](<${matchLink}>)**`,
      `👥 **Players:** ${playerDisplays.join(' · ')}`,
      `📺 ${game.youtube_url}`
    ].join('\n');

    await vodChannel.send({ content }).catch((err) => console.error('Failed to send VOD announcement:', err));
  } catch (err) {
    console.error('Error in announceYoutubeVod:', err);
  } finally {
    setTimeout(() => activeVodLocks.delete(gameId), 30000);
  }
}

async function announceGame(gameId) {
  if (activeGameLocks.has(gameId)) return;
  activeGameLocks.add(gameId);

  try {
    const { data: checkGame } = await supabase.from('games').select('announced_to_discord').eq('id', gameId).single();
    if (checkGame && checkGame.announced_to_discord) return;

    let payload = await buildGameResultPayload(gameId); 
    if (!payload) return;

    if (payload.game.is_league) {
       const missingDeltas = payload.results.some(r => payload.leagueDeltaMap[normalizeName(r.player_name)] === undefined);
       if (missingDeltas) {
         await new Promise(resolve => setTimeout(resolve, 3000));
         payload = await buildGameResultPayload(gameId);
       }
    }

    await supabase.from('games').update({ announced_to_discord: true }).eq('id', gameId);

    const targetPrimaryChannelId = payload.game.tournament_num
      ? TOURNAMENT_RESULTS_CHANNEL_ID
      : DISCORD_CHANNEL_ID;

    const primaryChannel = await discordClient.channels.fetch(targetPrimaryChannelId).catch(() => null); 
    if (primaryChannel) {
      const built = await buildEmbed(payload, primaryChannel.guild); 
      const messagePayload = { embeds: [built.embed] };

      if (built.screenshotMedia?.attachment) {
        messagePayload.files = [built.screenshotMedia.attachment];
      } else if (built.screenshotMedia?.tooLarge) {
        messagePayload.content = 'Image was too big for Discord. Check https://dunestats.cc/matches for the screenshot.';
      }

      await primaryChannel.send(messagePayload).catch(err => console.error('Error sending primary match result:', err));
    }

    const isLeagueGame = payload.game.is_league === true || String(payload.game.is_league).toLowerCase() === 'true';
    if (isLeagueGame) {
      const leagueChannel = await discordClient.channels.fetch(LEAGUE_RESULTS_CHANNEL_ID).catch(() => null);
      if (leagueChannel) {
        const leagueEmbed = await buildLeagueEmbed(payload, leagueChannel.guild);
        const leaguePayload = { embeds: [leagueEmbed] };

        if (payload.screenshotMedia?.buffer) {
          leaguePayload.files = [new AttachmentBuilder(payload.screenshotMedia.buffer, { name: payload.screenshotMedia.fileName || 'match-result.png' })];
        } else if (payload.screenshotMedia?.tooLarge) {
          leaguePayload.content = 'Image was too big for Discord. Check https://dunestats.cc/matches for the screenshot.';
        }

        await leagueChannel.send(leaguePayload).catch(err => console.error('Error sending league match result:', err));
      }

      await syncActiveLeaguePlayersRole();
      await updateLeagueInfoMessage();
    }

    if (payload.game.youtube_url) {
      await announceYoutubeVod(gameId);
    }

    if (payload.game?.tournament_num && payload.tournamentDetails) {
      try {
        await supabase.from('tournament_match_schedules').update({ status: 'played', updated_at: new Date().toISOString() })
          .eq('tournament_num', payload.game.tournament_num).eq('round_type', payload.tournamentDetails.roundType).eq('table_identifier', payload.tournamentDetails.tableIdentifier);
      } catch (schedErr) {}
    }
  } catch (err) {
    console.error('Error in announceGame:', err);
  } finally {
    setTimeout(() => activeGameLocks.delete(gameId), 30000);
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

// -------------------------------------------------------------
// SP EVENT ANNOUNCEMENT HANDLER
// -------------------------------------------------------------
async function announceSpEvent(eventId) {
  if (activeSpLocks.has(eventId)) return;
  activeSpLocks.add(eventId);

  try {
    const { data: event, error } = await supabase.from('sp_events').select('*').eq('id', eventId).single();
    if (error || !event || event.announced_to_discord) return;

    await supabase.from('sp_events').update({ announced_to_discord: true }).eq('id', eventId);

    const { data: mapRecord } = await supabase.from('player_discord_map').select('discord_user_id, sp_alerts_opt_out').eq('player_key', event.player_key).limit(1).maybeSingle();
    if (!mapRecord || !mapRecord.discord_user_id) {
      return;
    }

    const notificationChannel = await discordClient.channels.fetch(SP_NOTIFICATION_CHANNEL_ID).catch(() => null);
    if (notificationChannel) {
      const displayAction = event.action_type === 'image_upload' ? 'Recruitment Proof Posted' : event.action_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      
      let rewardClarity = 'Standard Reward';
      if (event.action_type === 'daily_first_message') rewardClarity = 'Daily Bonus (First message of the day)';
      else if (event.action_type === 'first_live_game') rewardClarity = 'Daily Bonus (First live game of the day)';
      else if (event.action_type === 'first_weekly_async') rewardClarity = 'Weekly Bonus (First async game of the week)';
      else if (event.action_type === 'match_participation') rewardClarity = 'Match Participation';
      else if (event.action_type === 'match_start_base') rewardClarity = 'Match Started';

      if (!mapRecord.sp_alerts_opt_out) {
        const ghostMsg = await notificationChannel.send(`💬 You gained **${event.amount} SP** for ${rewardClarity.toLowerCase()} <@${mapRecord.discord_user_id}>!`).catch(() => null);
        if (ghostMsg) {
          setTimeout(() => ghostMsg.delete().catch(() => {}), 1500);
        }
      }

      const alertEmbed = new EmbedBuilder()
        .setTitle('🪙 Strategy Points Earned!')
        .setDescription(`Congratulations <@${mapRecord.discord_user_id}>!\nYou've earned a **${rewardClarity}**!`)
        .setColor(0xf1c40f)
        .addFields(
          { name: '✨ Action', value: `\`${displayAction}\``, inline: true },
          { name: '💰 Reward', value: `**+${event.amount} SP**`, inline: true }
        )
        .setTimestamp();
        
      const components = [];
      if (!mapRecord.sp_alerts_opt_out) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`disable_sp_${mapRecord.discord_user_id}`).setLabel('Disable Alerts').setStyle(ButtonStyle.Secondary).setEmoji('🔕')
        ));
      }
        
      await notificationChannel.send({ embeds: [alertEmbed], components: components.length > 0 ? components : undefined });
    }
  } catch (err) {
    console.error('Error announcing SP event:', err);
  } finally {
    setTimeout(() => activeSpLocks.delete(eventId), 30000);
  }
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

// -------------------------------------------------------------
// 🔍 AI SCAN STATUS ANNOUNCEMENT
// -------------------------------------------------------------
function buildFactionLine(row) {
  const factions = [
    ['Emperor', row.emperor_level, row.emperor_alliance],
    ['Guild', row.spacing_guild_level, row.spacing_guild_alliance],
    ['Bene Gesserit', row.bene_gesserit_level, row.bene_gesserit_alliance],
    ['Fremen', row.fremen_level, row.fremen_alliance]
  ];
  const parts = factions
    .filter(([, level]) => level > 0)
    .map(([name, level, alliance]) => `${name} Lv${level}${alliance ? ' 👑' : ''}`);
  return parts.length ? parts.join(' · ') : null;
}

function buildScanResultEmbed(game, results) {
  const sorted = [...results].sort((a, b) => (a.player_slot ?? 0) - (b.player_slot ?? 0));

  const lines = sorted.map((row) => {
    const placementMap = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '4️⃣' };
    const placementLabel = placementMap[row.placement] || row.placement;

    const badges = [
      row.has_first_player ? '✅' : '',
      row.has_high_council ? '🏛️ High Council' : '',
      row.has_swordmaster ? '⚔️ Swordmaster' : ''
    ].filter(Boolean).join('  ');

    const safeLeader = row.leader_name ? row.leader_name : 'Unknown Leader';
    const safePoints = row.points !== null && row.points !== undefined ? row.points : '?';
    const safeSlot = row.player_slot !== null && row.player_slot !== undefined ? row.player_slot : '?';
    const safeTurn = row.turn_order !== null && row.turn_order !== undefined ? row.turn_order : '?';

    let block = `${placementLabel} **${row.player_name}** —${safeLeader}\n`;
    block += `${safePoints} pts · Slot ${safeSlot} · Turn ${safeTurn}\n`;
    block += `🌶️ ${row.spice ?? 0}  💰 ${row.solaris ?? 0}  💧 ${row.water ?? 0}`;
    if (badges) block += `   ${badges}`;

    const factionLine = buildFactionLine(row);
    if (factionLine) block += `\n${factionLine}`;

    return block;
  });

  const matchUrl = game.public_match_id ? `https://dunestats.cc/match/${game.public_match_id}` : null;
  const imageUrl = game.public_match_id
    ? `${R2_MATCHES_BASE}/matches/${game.public_match_id}/${game.public_match_id}-content-area.png`
    : null;

  const titleBase = SCAN_STATUS_TITLES[game.ai_scan_status] || 'Match Scan Result';
  const color = SCAN_STATUS_COLORS[game.ai_scan_status] || 0x95A5A6;

  let finalTitle = titleBase;
  if (game.public_match_id) {
    finalTitle = `${titleBase} — #${game.public_match_id}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(finalTitle)
    .setDescription(lines.join('\n\n'))
    .setColor(color)
    .setFooter({ text: `Status: ${game.ai_scan_status}` })
    .setTimestamp(new Date());

  if (matchUrl) embed.setURL(matchUrl);
  if (imageUrl) embed.setImage(imageUrl);

  return embed;
}

async function announceOrUpdateScanResult(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, public_match_id, ai_scan_status, ai_scan_discord_message_id')
    .eq('id', gameId)
    .single();

  if (gameError || !game) { console.error('Failed to fetch game for scan announcement', gameId, gameError); return; }
  if (!game.ai_scan_status || game.ai_scan_status === AI_SCAN_IGNORED_STATUS) return;

  const { data: results, error: resultsError } = await supabase
    .from('game_results')
    .select('*')
    .eq('game_id', gameId)
    .order('player_slot', { ascending: true });

  if (resultsError || !results || !results.length) { console.error('Failed to fetch results for scan announcement', gameId, resultsError); return; }

  const channel = await discordClient.channels.fetch(SCAN_RESULTS_CHANNEL_ID).catch(() => null);
  if (!channel) { console.error('Could not find scan results channel', SCAN_RESULTS_CHANNEL_ID); return; }

  const embed = buildScanResultEmbed(game, results);

  if (game.ai_scan_discord_message_id) {
    const existingMsg = await channel.messages.fetch(game.ai_scan_discord_message_id).catch(() => null);
    if (existingMsg) {
      await existingMsg.edit({ embeds: [embed] }).catch((err) => console.error('Failed to edit scan result message for game', gameId, err));
      return;
    }
  }

  const sentMessage = await channel.send({ embeds: [embed] });
  await supabase.from('games').update({ ai_scan_discord_message_id: sentMessage.id }).eq('id', gameId);
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
// ROSTER DISPLAY BUILDER (DEDUPLICATED NAMES + [📊](url) + SINGLE ELO)
// -------------------------------------------------------------
async function buildRosterDisplay(lobby) {
  const pIds = lobby.player_ids || [];
  const guests = lobby.guest_players || [];
  const webNames = lobby.web_player_names || [];
  const webIds = lobby.web_player_ids || [];
  const notifies = lobby.notify_user_ids || [];

  const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';
  const currentSeasonId = lobby.season_id || await getCurrentSeasonId();

  const webMentionsMap = await getDiscordMentionsForWebPlayers(webIds);
  const discordIgnMap = {};
  const discordNamesMap = {};
  const elos = {};
  const leaderboardCaseMap = {};
  
  if (pIds.length > 0) {
    const [{ data: dMap }, { data: dirRows }] = await Promise.all([
      supabase.from('player_discord_map').select('discord_user_id, player_key, display_name, discord_username').in('discord_user_id', pIds),
      supabase.from('discord_guild_members').select('discord_user_id, discord_username, global_name, display_name, suggested_player_key, similarity_score').in('discord_user_id', pIds)
    ]);

    if (dMap) {
      dMap.forEach(r => {
        if (r.player_key) {
          discordIgnMap[r.discord_user_id] = r.player_key;
          if (r.display_name) leaderboardCaseMap[r.player_key] = r.display_name;
        }
        if (!discordNamesMap[r.discord_user_id]) discordNamesMap[r.discord_user_id] = [];
        if (r.discord_username) discordNamesMap[r.discord_user_id].push(r.discord_username);
      });
    }

    const dirMap = {};
    if (dirRows) {
      dirRows.forEach(d => {
        dirMap[d.discord_user_id] = d;
        if (!discordNamesMap[d.discord_user_id]) discordNamesMap[d.discord_user_id] = [];
        discordNamesMap[d.discord_user_id].push(d.display_name, d.global_name, d.discord_username);
      });
    }

    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    for (const uid of pIds) {
      if (!discordNamesMap[uid]) discordNamesMap[uid] = [];
      if (guild) {
        const member = guild.members.cache.get(uid) || await guild.members.fetch(uid).catch(() => null);
        if (member) {
          discordNamesMap[uid].push(member.nickname, member.displayName, member.user?.globalName, member.user?.username);
        }
      }
    }

    const unmappedIds = pIds.filter(id => !discordIgnMap[id]);
    if (unmappedIds.length > 0) {
      for (const uid of unmappedIds) {
        const dirEntry = dirMap[uid];
        if (dirEntry && dirEntry.suggested_player_key && (dirEntry.similarity_score === null || dirEntry.similarity_score >= DB_MATCH_THRESHOLD)) {
          discordIgnMap[uid] = dirEntry.suggested_player_key;
          if (dirEntry.display_name) leaderboardCaseMap[dirEntry.suggested_player_key] = dirEntry.display_name;

          await saveDiscordPlayerMap({
            discordUserId: uid,
            discordUsername: dirEntry.discord_username,
            displayName: dirEntry.display_name,
            playerKey: dirEntry.suggested_player_key
          });
          await supabase.from('discord_guild_members').update({ has_verified_map: true }).eq('discord_user_id', uid);
        }
      }
    }
  }

  const allKeys = [
    ...Object.values(discordIgnMap),
    ...webNames.map(n => normalizeName(n)),
    ...guests.map(g => normalizeName(g))
  ].filter(Boolean);

  if (allKeys.length > 0) {
    try {
      const [{ data: oData }, { data: lData }] = await Promise.all([
        supabase.from('player_ratings').select('player_key, display_name, elo').in('player_key', allKeys).eq('game_version', 'overall'),
        isLeague ? supabase.from('player_league_ratings').select('player_key, elo').in('player_key', allKeys).eq('season', currentSeasonId) : Promise.resolve({ data: [] })
      ]);
      oData?.forEach(r => { 
        if (!elos[r.player_key]) elos[r.player_key] = {}; 
        elos[r.player_key].overall = r.elo;
        if (r.display_name) leaderboardCaseMap[r.player_key] = r.display_name;
      });
      lData?.forEach(r => { 
        if (!elos[r.player_key]) elos[r.player_key] = {}; 
        elos[r.player_key].league = r.elo; 
      });
    } catch (e) {}
  }

  const rosterLines = [];
  const seenDiscordIds = new Set();
  let actualCount = 0;

  function isIgnSameAsDiscord(ign, uid) {
    if (!ign || !uid) return false;
    const normIgn = normalizeName(ign);
    const knownDiscordNames = (discordNamesMap[uid] || []).filter(Boolean);
    return knownDiscordNames.some(dn => normalizeName(dn) === normIgn);
  }

  // 1. DISCORD PLAYERS
  for (const id of pIds) {
    seenDiscordIds.add(id);
    const pk = discordIgnMap[id];
    const caseName = (pk && leaderboardCaseMap[pk]) ? leaderboardCaseMap[pk] : (pk ? capitalize(pk) : null);
    const bell = notifies.includes(id) ? ' 🔔' : '';
    
    let nameLine = '';
    if (pk && caseName) {
      const profileUrl = `https://dunestats.cc/players/${encodeURIComponent(caseName)}`;
      const sameName = isIgnSameAsDiscord(caseName, id);
      nameLine = sameName
        ? `<@${id}> [📊](${profileUrl})`
        : `[${caseName}](${profileUrl}) <@${id}>`;

      if (isLeague) {
        const lElo = elos[pk]?.league !== undefined ? Math.round(elos[pk].league) : 1000;
        nameLine += ` [🏆 ${lElo}]`;
      }
    } else {
      nameLine = `<@${id}>`;
    }

    rosterLines.push(`• ${nameLine}${bell}`);
    actualCount++;
  }

  // 2. WEB PLAYERS
  for (let i = 0; i < webNames.length; i++) {
    const rawName = webNames[i];
    const normKey = normalizeName(rawName);
    const wId = webIds[i];
    let dId = null;
    if (wId && webMentionsMap[wId]) {
      const match = webMentionsMap[wId].match(/<@(\d+)>/);
      if (match) dId = match[1];
    }

    if (dId && seenDiscordIds.has(dId)) continue; 

    const caseName = leaderboardCaseMap[normKey] || rawName;
    const isLeaderboard = !!leaderboardCaseMap[normKey] || !!elos[normKey];
    const profileUrl = `https://dunestats.cc/players/${encodeURIComponent(caseName)}`;

    let line = '';
    if (dId) {
      const sameName = isIgnSameAsDiscord(caseName, dId);
      if (isLeaderboard) {
        line = sameName
          ? `<@${dId}> [📊](${profileUrl}) 🌐`
          : `[${caseName}](${profileUrl}) <@${dId}> 🌐`;
      } else {
        line = `**${rawName}** <@${dId}> 🌐`;
      }
    } else {
      line = isLeaderboard
        ? `[${caseName}](${profileUrl}) 🌐`
        : `**${rawName}** 🌐`;
    }

    if (isLeague && isLeaderboard) {
      const lElo = elos[normKey]?.league !== undefined ? Math.round(elos[normKey].league) : 1000;
      line += ` [🏆 ${lElo}]`;
    }

    rosterLines.push(`• ${line}`);
    if (dId) seenDiscordIds.add(dId);
    actualCount++;
  }

  // 3. GUEST PLAYERS
  for (const guest of guests) {
    const normKey = normalizeName(guest);
    const isLeaderboard = !!leaderboardCaseMap[normKey] || !!elos[normKey];
    let line = '';

    if (isLeaderboard) {
      const caseName = leaderboardCaseMap[normKey] || guest;
      line = `[${caseName}](https://dunestats.cc/players/${encodeURIComponent(caseName)}) 📊`;
      if (isLeague) {
        const lElo = elos[normKey]?.league !== undefined ? Math.round(elos[normKey].league) : 1000;
        line += ` [🏆 ${lElo}]`;
      }
    } else {
      line = guest.toLowerCase().startsWith('friend of') ? `${guest} 👥` : `**${guest}** 👥`;
    }

    rosterLines.push(`• ${line}`);
    actualCount++;
  }

  const finalDisplay = rosterLines.length > 0 ? rosterLines.join('\n') : '\u200B';
  return { display: finalDisplay, count: actualCount };
}

async function syncLobbyEmbed(lobby) {
  if (lobby.status !== 'searching') return;
  if (!lobby.channel_id || !lobby.message_id) return;
  const channel = await discordClient.channels.fetch(lobby.channel_id).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(lobby.message_id).catch(() => null);
  if (!msg || !msg.embeds || !msg.embeds[0]) return;

  const { display, count } = await buildRosterDisplay(lobby);

 const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';
  const activePreset = isLeague ? await getActivePreset() : null;
  const formatLine = buildFormatSummaryLine(channel.guild, lobby.board_type, lobby.expansions, activePreset?.url || null);

  let lobbyNameLine = `🎮 In-Game Lobby: *(Waiting for host IGN...)*`;
  if (lobby.host_id === 'UNCLAIMED') {
    lobbyNameLine = `🎮 In-Game Lobby: *(Claim host to set lobby name)*`;
  } else {
    const hostIgnInfo = await resolveHostIgn(lobby.host_id, lobby.web_host_id, lobby.web_player_names);
    if (hostIgnInfo.isKnown && hostIgnInfo.ign) {
      lobbyNameLine = `🎮 In-Game Lobby: **${hostIgnInfo.ign}'s game**`;
    }
  }

  const descLines = [];
  if (isCustomLobbyNote(lobby.message_text)) {
    descLines.push(`"${lobby.message_text.trim()}"\n`);
  }
  descLines.push(formatLine);
  descLines.push(lobbyNameLine);

  const isLive = String(lobby.mode || '').toLowerCase() !== 'async';
  const emojiTarget = isLive
    ? getEmoji(channel.guild, 'LiveDune', '<:LiveDune:1232049130151346216>')
    : getEmoji(channel.guild, 'AsyncDune', '<:AsyncDune:1232048177390289097>');

  const footerGuideBlock = `${emojiTarget} • **Join / Leave** the lobby\n📖 **[Emoji Controls Guide](${EMOJI_GUIDE_LINK})**`;
  const playersValue = `${display}\n\n${footerGuideBlock}`;

  const updatedFields = [
    { name: `👥 Players (${count}/4)\n\u200B`, value: playersValue, inline: false }
  ];

  const embed = EmbedBuilder.from(msg.embeds[0])
    .setDescription(descLines.join('\n'))
    .setFields(updatedFields)
    .setFooter(null);

  const contentLines = [];
  if (lobby.lobby_password && lobby.lobby_password !== 'None') {
    contentLines.push(`🔑 Lobby Password: \`${lobby.lobby_password}\` *(Tap to copy)*`);
  }
  contentLines.push(`🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${lobby.id}`);

  let components = msg.components || [];
  if (lobby.host_id === 'UNCLAIMED') {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_auto_host_${lobby.id}`)
          .setLabel('Claim Host')
          .setStyle(ButtonStyle.Success)
          .setEmoji('945323522140565514')
      )
    ];
  } else {
    components = [];
  }

  await msg.edit({ content: contentLines.join('\n'), embeds: [embed], components }).catch(err => console.error('Failed to sync embed roster:', err));
}

// -------------------------------------------------------------
// 🌐 WEB LOBBY CREATION HANDLER WITH ATOMIC LOCK & RE-FETCH
// -------------------------------------------------------------
async function handleWebLobbyCreation(lobby) {
  try {
    const { data: claimed } = await supabase
      .from('active_async_matches')
      .update({ status: 'posting' })
      .eq('id', lobby.id)
      .eq('status', 'pending_creation')
      .select('id');

    if (!claimed || claimed.length === 0) return;

    const isLive = lobby.mode === 'live';
    const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';
    
    let channelId = isLive ? WEB_LFG_LIVE_CHANNEL : WEB_LFG_ASYNC_CHANNEL;
    if (isLeague) {
      channelId = LEAGUE_LFG_CHANNEL_ID;
    }

    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      await supabase.from('active_async_matches').update({ status: 'pending_creation' }).eq('id', lobby.id);
      return console.error('LFG channel not found for Web Lobby Creation.');
    }

    const { data: fresh } = await supabase.from('active_async_matches').select('*').eq('id', lobby.id).single();
    if (fresh) lobby = fresh;

    const hostIgnInfo = await resolveHostIgn(lobby.host_id, lobby.web_host_id, lobby.web_player_names);
    const hostName = hostIgnInfo.ign || 'Web Player';
    let discordMention = '';

    if (lobby.web_host_id) {
      const { data: mapData } = await supabase.from('player_discord_map').select('discord_user_id').eq('claimed_by', lobby.web_host_id).limit(1);
      if (mapData && mapData.length > 0 && mapData[0].discord_user_id) {
        discordMention = ` <@${mapData[0].discord_user_id}>`;
      }
    }

    let generatedMatchId = lobby.match_id;
    if (!generatedMatchId || generatedMatchId.startsWith('pending-web-')) {
      if (isLeague) {
        generatedMatchId = `sa${lobby.id}`;
      } else {
        const cleanHostName = hostName.replace(/[^a-zA-Z0-9]/g, '') || 'Host';
        const modeLetter = isLive ? 'L' : 'A';
        const prefixPattern = `${cleanHostName}-${modeLetter}`;
        generatedMatchId = `${prefixPattern}1`;

        const { data: existingHostLobbies } = await supabase.from('active_async_matches').select('match_id').ilike('match_id', `${prefixPattern}%`);
        if (existingHostLobbies && existingHostLobbies.length > 0) {
          let maxNumber = 0;
          const numberRegex = new RegExp(`^${cleanHostName}-[LA](\\d+)$`, 'i');
          existingHostLobbies.forEach((row) => {
            const match = row.match_id ? row.match_id.match(numberRegex) : null;
            if (match && match[1]) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNumber) maxNumber = num;
            }
          });
          generatedMatchId = `${prefixPattern}${maxNumber + 1}`;
        }
      }
    }

    const emojiTarget = isLive
      ? getEmoji(channel.guild, 'LiveDune', '<:LiveDune:1232049130151346216>')
      : getEmoji(channel.guild, 'AsyncDune', '<:AsyncDune:1232048177390289097>');
    const embedColor = isLeague ? 0xF1C40F : (isLive ? 0xe74c3c : 0xC9A24B);
    const roleId = isLeague ? '1219666679764877424' : (isLive ? '1268299468785062099' : '1219666516644204554');
    
    const formatLine = buildFormatSummaryLine(channel.guild, lobby.board_type, lobby.expansions);

    const seatedPings = (lobby.player_ids || []).map(id => `<@${id}>`).join(' ');
    const modeLabelWord = isLive ? 'live' : 'async';
    const customPingSentence = `**${hostName} 🌐**${discordMention} is looking for ${modeLabelWord} players <@&${roleId}> for ${formatLine}. ${seatedPings}`.trim();

    let embedTitle = hostName !== 'Web Player' ? `${emojiTarget} ${hostName}'s Game` : `${emojiTarget} New Match Open!`;
    if (isLeague) embedTitle = `🏆 Ranked League Match Open!`;

    const { display: rosterStr, count } = await buildRosterDisplay(lobby);

    const lobbyNameLine = `🎮 In-Game Lobby: **${hostName}'s game**`;
    const descLines = [];
    if (isCustomLobbyNote(lobby.message_text)) {
      descLines.push(`"${lobby.message_text.trim()}"\n`);
    }
    descLines.push(formatLine);
    descLines.push(lobbyNameLine);

    const footerGuideBlock = `${emojiTarget} • **Join / Leave** the lobby\n📖 **[Emoji Controls Guide](${EMOJI_GUIDE_LINK})**`;

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setDescription(descLines.join('\n'))
      .setColor(embedColor)
      .addFields(
        { name: `👥 Players (${count}/4)\n\u200B`, value: `${rosterStr}\n\n${footerGuideBlock}`, inline: false }
      )
      .setTimestamp();

    const copyableLines = [];
    if (lobby.lobby_password && lobby.lobby_password !== 'None') {
      copyableLines.push(`🔑 Lobby Password: \`${lobby.lobby_password}\` *(Tap to copy)*`);
    }
    copyableLines.push(`🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${lobby.id}`);

    const message = await channel.send({ content: copyableLines.join('\n'), embeds: [embed] });

    try {
      const customJoinEmoji = channel.guild.emojis.cache.find(e => e.name === (isLive ? 'LiveDune' : 'AsyncDune'));
      await message.react(customJoinEmoji ? customJoinEmoji.id : (isLive ? '1232049130151346216' : '1232048177390289097')).catch(() => {});
      if (!isLeague) await message.react('🙋').catch(() => {});
      await message.react('🎮').catch(() => {}); 
      await message.react('❌').catch(() => {});
      await message.react('🥾').catch(() => {}); 
      await message.react('🔔').catch(() => {}); 
      await message.react('📢').catch(() => {});
    } catch (reactErr) {}

    const pingMessage = await channel.send({ content: customPingSentence, allowedMentions: { roles: [roleId], users: lobby.player_ids || [] } });
    setTimeout(() => { pingMessage.delete().catch(() => {}); }, 1500);

    await supabase.from('active_async_matches').update({
      status: 'searching', 
      match_id: generatedMatchId, 
      message_id: message.id, 
      channel_id: channel.id, 
      guild_id: channel.guild.id
    }).eq('id', lobby.id);

    if (isLeague) updateQueueMessage();

  } catch (err) { 
    console.error('Error creating Discord Lobby from Web Event:', err);
    await supabase.from('active_async_matches').update({ status: 'pending_creation' }).eq('id', lobby.id).catch(() => {});
  }
}

async function catchUpMissedWebLobbies() {
  try {
    const { data: missedLobbies } = await supabase
      .from('active_async_matches')
      .select('*')
      .eq('status', 'pending_creation')
      .like('message_id', 'pending-web-%');

    for (const missed of missedLobbies ?? []) {
      console.log(`[Catch-Up] Processing missed lobby: ID ${missed.id}`);
      await handleWebLobbyCreation(missed);
    }
  } catch (err) {
    console.error('Error in catchUpMissedWebLobbies:', err);
  }
}

async function executeLobbyPing(lobby, channel) {
  const now = new Date();
  const lastTagged = lobby.last_prompted_at ? new Date(lobby.last_prompted_at) : null;
  if (lastTagged && (now.getTime() - lastTagged.getTime() < TAG_COOLDOWN_MS)) return false;

  await supabase.from('active_async_matches').update({ last_prompted_at: now.toISOString() }).eq('id', lobby.id);
  lobby.last_prompted_at = now.toISOString();

  const isLiveLobby = lobby.mode === 'live';
  const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';
  let roleId = isLeague ? '1219666679764877424' : (isLiveLobby ? '1268299468785062099' : '1219666516644204554');
  
  const msg = await channel.messages.fetch(lobby.message_id).catch(() => null);
  if (!msg || !msg.embeds || !msg.embeds[0]) return true;

  const formatLine = buildFormatSummaryLine(channel.guild, lobby.board_type, lobby.expansions);

  let hostMentionString = 'Web Player 🌐';
  const validDiscordHostId = normalizeDiscordId(lobby.host_id);

  if (validDiscordHostId) {
    hostMentionString = `<@${validDiscordHostId}>`;
  } else if (lobby.web_player_names && lobby.web_player_names.length > 0) {
    const wName = lobby.web_player_names[0];
    hostMentionString = `[${wName}](https://dunestats.cc/players/${encodeURIComponent(wName)}) 🌐`;
    if (lobby.web_player_ids && lobby.web_player_ids[0]) {
      const webMentionsMap = await getDiscordMentionsForWebPlayers([lobby.web_player_ids[0]]);
      if (webMentionsMap[lobby.web_player_ids[0]]) hostMentionString += webMentionsMap[lobby.web_player_ids[0]];
    }
  }

  const totalCount = (lobby.player_ids?.length || 0) + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0);
  const optionalPasswordText = (lobby.lobby_password && lobby.lobby_password !== 'None') ? `\n🔑 Lobby Password: \`${lobby.lobby_password}\` *(Tap to copy)*` : '';
  const accurateEndEmoji = isLiveLobby
    ? getEmoji(channel.guild, 'LiveDune', '<:LiveDune:1232049130151346216>')
    : getEmoji(channel.guild, 'AsyncDune', '<:AsyncDune:1232048177390289097>');
  const manageLink = `\n🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${lobby.id}`;

  const tagMessage = `<@&${roleId}> ${hostMentionString} (${totalCount}/4) is looking for players for ${formatLine} ${accurateEndEmoji}${optionalPasswordText}${manageLink}`;

  let historyCountMet = false;
  try {
    const fetchedHistory = await channel.messages.fetch({ after: msg.id, limit: 12 }).catch(() => null);
    if (fetchedHistory && fetchedHistory.size >= 5) historyCountMet = true;
  } catch (err) {}

  if (historyCountMet) {
    const newLobbyMsg = await channel.send({
      content: tagMessage,
      embeds: [EmbedBuilder.from(msg.embeds[0])],
      components: msg.components || [],
      allowedMentions: { roles: [roleId] }
    });
    try {
      const joinEmojiObj = channel.guild.emojis.cache.find(e => e.name === (isLiveLobby ? 'LiveDune' : 'AsyncDune'));
      await newLobbyMsg.react(joinEmojiObj ? joinEmojiObj.id : (isLiveLobby ? '1232049130151346216' : '1232048177390289097')).catch(() => {});
      if (!isLeague) await newLobbyMsg.react('🙋').catch(() => {});
      await newLobbyMsg.react('🎮').catch(() => {}); 
      await newLobbyMsg.react('❌').catch(() => {});
      await newLobbyMsg.react('🥾').catch(() => {}); 
      await newLobbyMsg.react('🔔').catch(() => {}); 
      await newLobbyMsg.react('📢').catch(() => {});
    } catch (rErr) {}
    await supabase.from('active_async_matches').update({ message_id: newLobbyMsg.id }).eq('id', lobby.id);
    if (isLeague) updateQueueMessage();
    msg.reactions.cache.forEach(async (r) => { await r.users.remove(discordClient.user.id).catch(() => {}); });
    await msg.edit({ content: `➡️ **This lobby has moved to the bottom of the chat:** https://discord.com/channels/${channel.guild.id}/${channel.id}/${newLobbyMsg.id}`, embeds: [], components: [] }).catch(() => {});
  } else {
    await channel.send({ content: tagMessage, allowedMentions: { roles: [roleId] } });
  }
  return true;
}

async function handleWebQuickChat(chatRow) {
  const { lobby_id, sender_name, message_code } = chatRow;
  const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('id', lobby_id).single();
  if (!lobby || !lobby.channel_id || lobby.status !== 'searching') return;
  const channel = await discordClient.channels.fetch(lobby.channel_id).catch(() => null);
  if (!channel) return;

  if (message_code === 'start_3p_ask' || message_code === 'agree_3p') {
    await process3PlayerQuickChatEvent(lobby, sender_name, message_code);
    return;
  }

  const hostPing = normalizeDiscordId(lobby.host_id) ? `<@${lobby.host_id}> ` : '';

  if (message_code === 'room_up') {
    await channel.send(`💬 **[🌐 ${sender_name}]**: 🎮 Room has been created in-game!`);
  } else if (message_code === 'password_ask') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`quickchat_pw_btn_${lobby.id}`)
        .setLabel('Reply with Password')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔑')
    );
    await channel.send({
      content: `💬 **[🌐 ${sender_name}]**: 🔑 ${hostPing}What is the in-game room password?`,
      components: [row]
    });
  } else if (message_code === 'need_5') {
    await channel.send(`💬 **[🌐 ${sender_name}]**: ⏳ Stepping away for 5 minutes, be right back!`);
  } else if (message_code === 'lobby_name_ask') {
    await channel.send(`💬 **[🌐 ${sender_name}]**: 📛 ${hostPing}What is the in-game lobby name?`);
  } else if (message_code === 'ping') {
    await executeLobbyPing(lobby, channel);
  }
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sp_events' }, (payload) => {
      if (payload.new && payload.new.id) {
        setTimeout(() => announceSpEvent(payload.new.id), 2000);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matchmaking_queue' }, async (payload) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        const qRow = payload.new;
        if (!qRow.discord_user_id || !recentDiscordQueueIds.has(qRow.discord_user_id)) {
          const fallbackName = qRow.display_name || qRow.player_key || 'Web Player';
          const whoStr = qRow.discord_user_id
            ? `**${fallbackName}** (<@${qRow.discord_user_id}>)`
            : `**${fallbackName}** 🌐`;

          const seatedLobby = await tryAutoSeatIntoOpenLeagueLobby(
            qRow.discord_user_id || null,
            fallbackName,
            qRow.user_id || null
          );

          if (seatedLobby && !seatedLobby.alreadySeated) {
            const lobbyCodeLabel = seatedLobby.match_id || `sa${seatedLobby.id}`;
            await supabase.from('matchmaking_queue').delete().eq('id', qRow.id);
            await notifyLfgAdminQueueJoin(whoStr, `via Website — auto-seated into open Lobby \`${lobbyCodeLabel}\``);
          } else if (!seatedLobby) {
            const durMins = qRow.duration_minutes || 45;
            await notifyLfgAdminQueueJoin(whoStr, `via Website for ${durMins} mins`);
          }
        }
      }
      updateQueueMessage();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'active_async_matches' }, async (payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      if (!newRecord) return;
      if (eventType === 'INSERT' && newRecord.status === 'pending_creation') await handleWebLobbyCreation(newRecord);
      
      if (eventType === 'UPDATE' && oldRecord) {
        const rosterChanged =
          JSON.stringify(oldRecord.web_player_names) !== JSON.stringify(newRecord.web_player_names) ||
          JSON.stringify(oldRecord.player_ids) !== JSON.stringify(newRecord.player_ids) ||
          JSON.stringify(oldRecord.guest_players) !== JSON.stringify(newRecord.guest_players);

        if (rosterChanged && newRecord.status === 'searching') {
          const oldTotal = (oldRecord.player_ids?.length || 0) + (oldRecord.web_player_names?.length || 0) + (oldRecord.guest_players?.length || 0);
          const newTotal = (newRecord.player_ids?.length || 0) + (newRecord.web_player_names?.length || 0) + (newRecord.guest_players?.length || 0);

          if (newTotal === 4 && oldTotal < 4) {
            if (active3PlayerVotes.has(String(newRecord.id))) {
              await clear3PlayerVote(newRecord.id);
            }
            if (!newRecord.auto_start_at) {
              const startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
              await supabase.from('active_async_matches').update({ auto_start_at: startTargetDate.toISOString() }).eq('id', newRecord.id);
              const ch = await discordClient.channels.fetch(newRecord.channel_id || LEAGUE_LFG_CHANNEL_ID).catch(() => null);
              if (ch) {
                await ch.send({ content: `⏳ **Lobby full (4/4)!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!` }).catch(() => {});
              }
            }
          }

          if (newTotal < oldTotal) {
            const handled = await handlePostLeaveOrHostCheck(newRecord, oldRecord.host_id);
            if (handled) return;
          }
        }

        if (
          rosterChanged ||
          JSON.stringify(oldRecord.notify_user_ids) !== JSON.stringify(newRecord.notify_user_ids) ||
          oldRecord.board_type !== newRecord.board_type ||
          JSON.stringify(oldRecord.expansions) !== JSON.stringify(newRecord.expansions) ||
          oldRecord.lobby_password !== newRecord.lobby_password ||
          oldRecord.message_text !== newRecord.message_text ||
          oldRecord.host_id !== newRecord.host_id ||
          oldRecord.status !== newRecord.status
        ) {
          await syncLobbyEmbed(newRecord);
          if (newRecord.is_league || oldRecord.is_league) {
            updateQueueMessage();
          }
        }
        
        if (newRecord.status === 'started' && oldRecord.status !== 'started') {
          await executeLobbyStartSequence(newRecord);
          if (newRecord.is_league) updateQueueMessage();
        }
      }
    })
    .subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') { 
        realtimeRetryCount = 0; 
        try {
          const { data: unannouncedGames } = await supabase.from('games').select('id').eq('announced_to_discord', false).lt('created_at', new Date(Date.now() - 10000).toISOString()).order('created_at', { ascending: true });
          if (unannouncedGames && unannouncedGames.length > 0) unannouncedGames.forEach(g => scheduleAnnouncement(g.id));
        } catch (catchUpErr) {}

        await catchUpMissedWebLobbies();
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
// -------------------------------------------------------------
// 🏆 TOURNAMENT CONFIRMATION & CONFLICT HELPER
// -------------------------------------------------------------
async function finalizeTournamentConfirmation(scheduleId) {
  try {
    const { data: fresh } = await supabase.from('tournament_match_schedules').select('*').eq('id', scheduleId).single();
    if (!fresh || fresh.status === 'played') return false;

    let rawSlots = fresh.suggested_slots;
    if (typeof rawSlots === 'string') {
      try { rawSlots = JSON.parse(rawSlots); } catch (e) { rawSlots = []; }
    }
    const freshVotes = fresh.votes || {};
    const freshSlots = (rawSlots || []).map(s => s.label);
    const freshScores = {};
    for (const slot of freshSlots) freshScores[slot] = 0;
    for (const uid of Object.keys(freshVotes)) {
      for (const slot of (freshVotes[uid] || [])) {
        if (freshScores[slot] !== undefined) freshScores[slot]++;
      }
    }

    const finalWinSlot = freshSlots.find(s => freshScores[s] >= 4) || fresh.confirmed_slot;
    if (!finalWinSlot) return false;

    const matchedSlot = (rawSlots || []).find(s => s.label === finalWinSlot);
    let confirmedTimestamp = fresh.confirmed_timestamp || null;
    let confirmedDate = confirmedTimestamp ? new Date(confirmedTimestamp) : null;
    const confirmedTimeText = fresh.confirmed_time_text || (matchedSlot ? matchedSlot.time_text : 'Agreed Time');

    if (!confirmedTimestamp) {
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
    }

    await supabase.from('tournament_match_schedules').update({
      status: 'confirmed',
      confirmed_slot: finalWinSlot,
      confirmed_time_text: confirmedTimeText,
      confirmed_timestamp: confirmedTimestamp,
      updated_at: new Date().toISOString()
    }).eq('id', fresh.id);

    const matchTitle = `[${fresh.match_code}] ${fresh.round_type} ${fresh.table_identifier}`;
    const calUrl = confirmedDate ? generateGoogleCalendarUrl(matchTitle, confirmedDate) : null;
    
    let tablePath = 'table';
    if (fresh.match_code && fresh.match_code.includes('G')) tablePath = fresh.match_code.slice(fresh.match_code.indexOf('G'));
    const webUrl = `https://dunestats.cc/tournament/${fresh.tournament_num}/${tablePath}`;
    
    const confirmEmbed = new EmbedBuilder()
      .setTitle(`📅 Match Time Confirmed: ${matchTitle}`)
      .setColor(0x2ECC71)
      .setDescription(`All 4 players agreed! Match locked in for **${confirmedTimeText}**.\n\n🔗 **[Jump to Voting Post](https://discord.com/channels/${DISCORD_GUILD_ID}/${fresh.thread_id}/${fresh.message_id})** · **[Table Details & Map](${webUrl})**\n\nPlease let your opponents know on time if you need to reschedule.`)
      .setTimestamp();
    
    const components = calUrl ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Add to Google Calendar').setStyle(ButtonStyle.Link).setURL(calUrl).setEmoji('📅'))] : [];
    const thread = await discordClient.channels.fetch(fresh.thread_id).catch(() => null);
    if (thread) {
      await thread.send({
        content: `👥 ${(fresh.player_discord_ids || []).map(id => `<@${id}>`).join(' ')}`,
        embeds: [confirmEmbed],
        components
      }).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('Error in finalizeTournamentConfirmation:', err);
    return false;
  }
}

async function sendTournamentConflictAlert(scheduleRecord) {
  try {
    let rawSlots = scheduleRecord.suggested_slots;
    if (typeof rawSlots === 'string') {
      try { rawSlots = JSON.parse(rawSlots); } catch (e) { rawSlots = []; }
    }
    const currentVotes = scheduleRecord.votes || {};
    let tablePath = 'table';
    if (scheduleRecord.match_code && scheduleRecord.match_code.includes('G')) {
      tablePath = scheduleRecord.match_code.slice(scheduleRecord.match_code.indexOf('G'));
    }
    const webUrl = `https://dunestats.cc/tournament/${scheduleRecord.tournament_num}/${tablePath}`;
    
    const rankedSlots = (rawSlots || []).map((slot) => {
      const backers = (scheduleRecord.player_discord_ids || []).filter(id => currentVotes[id] && currentVotes[id].includes(slot.label));
      return { ...slot, count: backers.length, backers, missing: (scheduleRecord.player_discord_ids || []).filter(id => !backers.includes(id)) };
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

    const instructions = `**💡 How to Resolve & Propose Solutions:**\n1. [Jump to the pinned voting post](https://discord.com/channels/${DISCORD_GUILD_ID}/${scheduleRecord.thread_id}/${scheduleRecord.message_id}) to check or update your votes.\n2. Check mutual 2-hour free windows on the live map:\n   👉 **[Availability Map for Table ${scheduleRecord.table_identifier}](${webUrl})** · **[Scheduling Guide](${SCHEDULING_GUIDE_LINK})**\n3. Use \`/time\` to propose an adjustment:\n   • **Shift by minutes:** \`/time slot: B offset_minutes: 60\` *(Creates a new option **🇩** shifted +1h)*\n   • **Custom time code:** \`/time custom_time: <t:1787814000:F>\`\n4. Once proposed, everyone can vote on the new option above!`;
    const conflictEmbed = new EmbedBuilder()
      .setTitle(`⚠️ Scheduling Conflict: [${scheduleRecord.match_code}] ${scheduleRecord.round_type} ${scheduleRecord.table_identifier}`)
      .setColor(0xE74C3C)
      .setDescription(`All 4 players have voted, but no single slot reached unanimous agreement.\n\n${breakdownLines.join('\n')}${instructions}`)
      .setTimestamp();

    const thread = await discordClient.channels.fetch(scheduleRecord.thread_id).catch(() => null);
    if (thread) {
      await thread.send({
        content: `👥 ${(scheduleRecord.player_discord_ids || []).map(id => `<@${id}>`).join(' ')}\n🛡️ <@&${TOURNAMENT_HOST_ROLE_ID}>`,
        embeds: [conflictEmbed]
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Error sending conflict alert:', err);
  }
}

function startGlobalDatabaseListener() {
  supabase.channel('global_db_sync')
    .on('postgres_changes', { event: '*', schema: 'public' }, async (payload) => {
        const { table, eventType, new: newRecord, old: oldRecord } = payload;
        
        if (table === 'tournament_registrations') {
          const rec = newRecord || oldRecord;
          if (rec && TOURNAMENT_ROLE_MAP[Number(rec.tournament_num)]) {
            const member = await syncSingleUserRole(rec.discord_username, TOURNAMENT_ROLE_MAP[Number(rec.tournament_num)], (eventType !== 'DELETE') && (newRecord?.active_on_discord === true));
            if (member && eventType !== 'DELETE' && member.user.username !== rec.discord_username && rec.id) {
               await supabase.from('tournament_registrations').update({ discord_username: member.user.username }).eq('id', rec.id);
               await supabase.from('player_discord_map').update({ discord_username: member.user.username, discord_user_id: member.id, updated_at: new Date().toISOString() }).eq('discord_username', rec.discord_username);
            }
          }
          if (table === 'player_discord_map' && eventType === 'UPDATE' && newRecord && oldRecord) {
          if (
            typeof newRecord.has_league_lfg_role === 'boolean' &&
            newRecord.has_league_lfg_role !== oldRecord.has_league_lfg_role &&
            newRecord.discord_user_id
          ) {
            try {
              const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
              const member = guild ? await guild.members.fetch(newRecord.discord_user_id).catch(() => null) : null;
              if (member) {
                const currentlyHasRole = member.roles.cache.has(LEAGUE_NOTIFY_ROLE_ID);
                if (newRecord.has_league_lfg_role && !currentlyHasRole) {
                  await member.roles.add(LEAGUE_NOTIFY_ROLE_ID).catch(() => {});
                } else if (!newRecord.has_league_lfg_role && currentlyHasRole) {
                  await member.roles.remove(LEAGUE_NOTIFY_ROLE_ID).catch(() => {});
                }
              }
            } catch (roleErr) {
              console.error('Error syncing league ping role from website:', roleErr);
            }
          }
        }
          if (eventType === 'UPDATE' && newRecord?.has_checked_in === true) {
            const isFreshWebsiteCheckin = (oldRecord?.has_checked_in !== true && newRecord.check_in_method === 'website');
            const isDualConfirmed = (oldRecord?.check_in_method === 'discord' && newRecord.check_in_method === 'discord/website');
            if (isFreshWebsiteCheckin || isDualConfirmed) {
              try {
                const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
                if (guild && newRecord.discord_username) {
                  const member = await searchGuildMemberByNames(guild, [newRecord.discord_username]);
                  const dbMatch = await getDatabasePlayerMap(newRecord.discord_username);
                  const discordId = member?.id || dbMatch?.discord_user_id;
                  if (discordId) {
                    const tNum = Number(newRecord.tournament_num);
                    const config = TOURNAMENTS_CONFIG[tNum];
                    if (member && config?.checkInRoleId && !member.roles.cache.has(config.checkInRoleId)) await member.roles.add(config.checkInRoleId).catch(() => {});
                    const reminderChannel = await discordClient.channels.fetch(CHECKIN_REMINDER_CHANNEL_ID).catch(() => null);
                    if (reminderChannel) {
                      let messageContent = `🌐 <@${discordId}> has successfully checked in via the website for **Tournament #${tNum}**!`;
                      if (isDualConfirmed) messageContent = `🌐 <@${discordId}> has confirmed their check-in on the website for **Tournament #${tNum}** (Discord & Website ✅)!`;
                      await reminderChannel.send({ content: messageContent }).catch(() => {});
                    }
                  }
                }
              } catch (err) {}
            }
          }
        }

        if (table === 'tournament_match_schedules' && eventType === 'UPDATE' && newRecord && oldRecord) {
          if (JSON.stringify(newRecord.votes) !== JSON.stringify(oldRecord.votes) || newRecord.status !== oldRecord.status) {
            try {
              const thread = await discordClient.channels.fetch(newRecord.thread_id).catch(() => null);
              if (thread) {
                const fetchedMsg = await thread.messages.fetch(newRecord.message_id).catch(() => null);
                if (fetchedMsg && fetchedMsg.embeds.length > 0) {
                  let rawSlots = newRecord.suggested_slots;
                  if (typeof rawSlots === 'string') { try { rawSlots = JSON.parse(rawSlots); } catch (e) { rawSlots = []; } }
                  const originalEmbed = fetchedMsg.embeds[0];
                  const updatedEmbed = EmbedBuilder.from(originalEmbed);
                  const currentVotes = newRecord.votes || {};
                  const votedUserIds = Object.keys(currentVotes);
                  const votesCount = votedUserIds.length;
                  const slotLines = (rawSlots || []).map((slot) => {
                    const votersForSlot = (newRecord.player_discord_ids || []).filter(id => currentVotes[id] && currentVotes[id].includes(slot.label));
                    const mentions = votersForSlot.length > 0 ? ` — ${votersForSlot.map(id => `<@${id}>`).join(' ')}` : '';
                    return `${slot.label} ${slot.time_text}${mentions}`;
                  });
                  const nonVoters = (newRecord.player_discord_ids || []).filter(id => !votedUserIds.includes(id));
                  let voteString = `\n\n**✅ All 4 players have voted!**`;
                  if (nonVoters.length > 0) voteString = `\n\n**⏳ Did not vote yet (${votesCount}/4):**\n${nonVoters.map(id => `<@${id}>`).join(', ')}`;
                  const updatedFields = originalEmbed.fields.filter(f => !f.name.includes('Suggested Time Slots'));
                  updatedFields.push({ name: '📅 Suggested Time Slots & Votes', value: `${slotLines.join('\n')}${voteString}`, inline: false });
                  updatedEmbed.setFields(updatedFields);
                  await fetchedMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
                }
              }
            } catch (e) {}
          }
          if (newRecord.status === 'confirmed' && oldRecord.status !== 'confirmed') {
            const debounceKey = `schedule_${newRecord.id}`;
            if (scheduleDebounceTimers.has(debounceKey)) { clearTimeout(scheduleDebounceTimers.get(debounceKey)); scheduleDebounceTimers.delete(debounceKey); }
            scheduleDebounceTimers.set(debounceKey, setTimeout(async () => { scheduleDebounceTimers.delete(debounceKey); await finalizeTournamentConfirmation(newRecord.id); }, 5000));
          } else if (newRecord.status === 'conflict' && oldRecord.status !== 'conflict') {
            await sendTournamentConflictAlert(newRecord);
          }
        }

        if (table === 'games' && eventType === 'UPDATE' && newRecord) {
          if (newRecord.ai_scan_status && newRecord.ai_scan_status !== AI_SCAN_IGNORED_STATUS && newRecord.ai_scan_status !== (oldRecord ? oldRecord.ai_scan_status : undefined)) {
            try { await announceOrUpdateScanResult(newRecord.id); } catch (scanErr) {}
          }
          if (newRecord.youtube_url && newRecord.youtube_url !== (oldRecord ? oldRecord.youtube_url : null)) {
            try { await announceYoutubeVod(newRecord.id); } catch (vodErr) {}
          }
        }
        if (table === 'game_results' && (eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.game_id) scheduleScanRefresh(newRecord.game_id);

        if (!newRecord) return;
        
        if (table === 'player_sp' && eventType === 'UPDATE' && newRecord.is_claimed === true) {
          const { data: mapRecord } = await supabase.from('player_discord_map').select('discord_user_id').eq('player_key', newRecord.player_key).single();
          if (mapRecord?.discord_user_id) await syncPlayerSpRole(mapRecord.discord_user_id, Number(newRecord.lifetime_sp));
        }
        
        if (table === 'player_league_ratings' && (eventType === 'INSERT' || eventType === 'UPDATE')) {
          await syncActiveLeaguePlayersRole();
          await updateLeagueInfoMessage();
        }
      }
    )
    .subscribe((status) => { if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') supabase.realtime.setAuth(SUPABASE_SECRET_KEY); });
}

async function syncSingleUserRole(discordUsername, roleId, shouldHaveRole) {
  if (!discordUsername) return null;
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    const role = guild.roles.cache.get(roleId);
    if (!guild || !role) return null;
    const member = await searchGuildMemberByNames(guild, [discordUsername]);
    if (!member) return null;
    const hasRole = member.roles.cache.has(roleId);
    if (shouldHaveRole && !hasRole) await member.roles.add(role);
    else if (!shouldHaveRole && hasRole) await member.roles.remove(role);
    return member;
  } catch (err) { return null; }
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
        if (member) { discordId = member.id; await persistDiscordUserId(mapRecord, member.id, member.user.username); }
      }
      if (discordId) await syncPlayerSpRole(discordId, Number(record.lifetime_sp));
    }
  } catch (err) {}
}

async function runInitialDatabaseSync() {
  try {
    const activeTournamentNums = Object.keys(TOURNAMENT_ROLE_MAP).map(Number);
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    const { data: activeRegs } = await supabase.from('tournament_registrations').select('id, discord_username, tournament_num').in('tournament_num', activeTournamentNums).eq('active_on_discord', true);
    const activeUserMap = new Map();
    if (activeRegs && activeRegs.length) {
      for (const reg of activeRegs) {
        const roleId = TOURNAMENT_ROLE_MAP[Number(reg.tournament_num)];
        if (roleId) {
          if (!activeUserMap.has(roleId)) activeUserMap.set(roleId, new Set());
          activeUserMap.get(roleId).add(reg.discord_username.toLowerCase());
          const member = await syncSingleUserRole(reg.discord_username, roleId, true);
          if (member && member.user.username !== reg.discord_username) {
              await supabase.from('tournament_registrations').update({ discord_username: member.user.username }).eq('id', reg.id);
              await supabase.from('player_discord_map').update({ discord_username: member.user.username, discord_user_id: member.id, updated_at: new Date().toISOString() }).eq('discord_username', reg.discord_username);
          }
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
    await persistDiscordUserId(bestMatch, discordUserId, member ? member.user.username : null);
    return { playerKey: bestMatch.player_key, userId: bestMatch.claimed_by };
  }
  return null;
}

async function awardSP(playerKey, userId, actionType, amount, metadata = {}) {
  try {
    const currentSeasonId = await getCurrentSeasonId();

    const { error: insertErr } = await supabase.from('sp_events').insert({ 
      player_key: playerKey, 
      user_id: userId || null, 
      action_type: actionType, 
      amount: amount, 
      season_id: currentSeasonId, 
      metadata: metadata,
      announced_to_discord: false
    });
    
    if (insertErr) {
      console.error(`[awardSP] Failed to insert ${actionType} for ${playerKey}:`, insertErr);
      return; 
    }

    const { data: currentSp } = await supabase.from('player_sp').select('lifetime_sp, seasonal_sp').eq('player_key', playerKey).maybeSingle();
    if (currentSp) {
      await supabase.from('player_sp').update({ 
        lifetime_sp: (currentSp.lifetime_sp || 0) + amount, 
        seasonal_sp: (currentSp.seasonal_sp || 0) + amount, 
        updated_at: new Date().toISOString() 
      }).eq('player_key', playerKey);
    }
  } catch (err) {
    console.error(`[awardSP] Error executing awardSP for ${playerKey}:`, err);
  }
}

async function executeLobbyStartSequence(lobbyRecord, targetChannel = null) {
  if (!lobbyRecord || !lobbyRecord.id) return;
  if (activeStartLocks.has(lobbyRecord.id)) return;
  activeStartLocks.add(lobbyRecord.id);

  try {
    await clearHostClaimAlert(lobbyRecord.id);
    await clear3PlayerVote(lobbyRecord.id);

    let channel = targetChannel || await discordClient.channels.fetch(lobbyRecord.channel_id).catch(() => null);
    if (!channel) return;

    const targetMsg = await channel.messages.fetch(lobbyRecord.message_id).catch(() => null);
    if (!targetMsg || !targetMsg.embeds[0]) return;

    if (targetMsg.embeds[0].title && targetMsg.embeds[0].title.includes('Started!')) {
      return;
    }

    await supabase.from('active_async_matches').update({ status: 'started', auto_start_at: null }).eq('id', lobbyRecord.id);
    if (lobbyRecord.is_league) updateQueueMessage();

    const { display, count } = await buildRosterDisplay(lobbyRecord);
    const isLeague = lobbyRecord.is_league === true || String(lobbyRecord.is_league).toLowerCase() === 'true';
    const activePreset = isLeague ? await getActivePreset() : null;
    const formatLine = buildFormatSummaryLine(channel.guild, lobbyRecord.board_type, lobbyRecord.expansions, activePreset?.url || null);
    const hostIgnInfo = await resolveHostIgn(lobbyRecord.host_id, lobbyRecord.web_host_id, lobbyRecord.web_player_names);
    const lobbyNameLine = hostIgnInfo.ign ? `🎮 In-Game Lobby: **${hostIgnInfo.ign}'s game**` : '';
    
    const isLive = String(lobbyRecord.mode || '').trim().toLowerCase() === 'live';
    const matchTypeTitle = isLive ? '🏁 Live Match Started!' : '🏁 Async Match Started!';

    const descLines = [];
    if (isCustomLobbyNote(lobbyRecord.message_text)) {
      descLines.push(`"${lobbyRecord.message_text.trim()}"\n`);
    }
    descLines.push(formatLine);
    if (lobbyNameLine) descLines.push(lobbyNameLine);

    const embed = EmbedBuilder.from(targetMsg.embeds[0])
      .setTitle(matchTypeTitle)
      .setDescription(descLines.join('\n'))
      .setColor(0x2ecc71)
      .setFooter(null) 
      .setFields(
        { name: `👥 Final Roster (${count}/4)\n\u200B`, value: display, inline: false }
      );

    const playerTags = (lobbyRecord.player_ids || []).map(id => `<@${id}>`).join(', ');
    const pwLine = (lobbyRecord.lobby_password && lobbyRecord.lobby_password !== 'None')
      ? `\n🔑 Lobby Password: \`${lobbyRecord.lobby_password}\` *(Tap to copy)*`
      : '';
    
    const contentStr = `🚀 **The match has officially begun! Good luck, commanders!**\nPlayers: ${playerTags}${pwLine}\n🔗 **Submit Results:** https://dunestats.cc/LFG/${lobbyRecord.id}`;
    
    await targetMsg.edit({ content: contentStr, embeds: [embed], components: [] }).catch(() => {});

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const startOfThisWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (now.getUTCDay() * 24 * 60 * 60 * 1000)).toISOString();
    const unlinkedPlayers = [];

    for (const playerId of (lobbyRecord.player_ids || [])) {
      const profile = await getPlayerProfileFromDiscord(playerId);
      if (!profile) {
        unlinkedPlayers.push({ id: playerId, points: SP_REWARDS_CONFIG.MATCH_START_BASE.amount + (isLive ? SP_REWARDS_CONFIG.FIRST_DAILY_LIVE.amount : SP_REWARDS_CONFIG.FIRST_WEEKLY_ASYNC.amount) });
        continue;
      }
      
      const { data: hourlyMatchEvents } = await supabase.from('sp_events')
        .select('id')
        .eq('player_key', profile.playerKey)
        .eq('action_type', 'match_start_base')
        .gte('created_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());
      
      if (!hourlyMatchEvents || hourlyMatchEvents.length === 0) {
        await awardSP(profile.playerKey, profile.userId, 'match_start_base', SP_REWARDS_CONFIG.MATCH_START_BASE.amount, { discord_user_id: playerId, match_id: lobbyRecord.id });
      }

      if (isLive) {
        const { data: dailyLiveEvents } = await supabase.from('sp_events')
          .select('id')
          .eq('player_key', profile.playerKey)
          .eq('action_type', 'first_live_game')
          .gte('created_at', startOfToday);
        if (!dailyLiveEvents || dailyLiveEvents.length === 0) {
          await awardSP(profile.playerKey, profile.userId, 'first_live_game', SP_REWARDS_CONFIG.FIRST_DAILY_LIVE.amount, { discord_user_id: playerId, match_id: lobbyRecord.id });
        }
      } else {
        const { data: weeklyAsyncEvents } = await supabase.from('sp_events')
          .select('id')
          .eq('player_key', profile.playerKey)
          .eq('action_type', 'first_weekly_async')
          .gte('created_at', startOfThisWeek);
        if (!weeklyAsyncEvents || weeklyAsyncEvents.length === 0) {
          await awardSP(profile.playerKey, profile.userId, 'first_weekly_async', SP_REWARDS_CONFIG.FIRST_WEEKLY_ASYNC.amount, { discord_user_id: playerId, match_id: lobbyRecord.id });
        }
      }
    }

    if (unlinkedPlayers.length > 0) {
      const lines = unlinkedPlayers.map(p => `• <@${p.id}> could have gotten **+${p.points} Strategy Points**!`).join('\n');
      await channel.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Missed Strategy Points!').setDescription(`${lines}\n\nLink your Discord account on [dunestats.cc](https://dunestats.cc) now to start claiming your rewards and climb the ranks!`).setColor(0xe74c3c)] }).catch(() => {});
    }
  } finally {
    setTimeout(() => activeStartLocks.delete(lobbyRecord.id), 15000);
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
      
      try {
        const { data: regs } = await supabase
          .from('tournament_registrations')
          .select('id, check_in_method, discord_username')
          .eq('tournament_num', checkin.tournament_num);

        let bestReg = null;
        let bestScore = 0;
        const candidateNames = [member.user.username, member.user.globalName, member.displayName, member.nickname].filter(Boolean);

        if (regs) {
          for (const r of regs) {
            if (!r.discord_username) continue;
            const score = Math.max(...candidateNames.map(name => similarity(name, r.discord_username)));
            if (score > bestScore) {
              bestScore = score;
              bestReg = r;
            }
          }
        }

        if (bestReg && bestScore >= DB_MATCH_THRESHOLD) {
          let newMethod = 'discord';
          if (bestReg.check_in_method === 'website') {
            newMethod = 'website/discord';
          } else if (bestReg.check_in_method && bestReg.check_in_method.includes('discord')) {
            newMethod = bestReg.check_in_method;
          }

          await supabase
            .from('tournament_registrations')
            .update({
              has_checked_in: true,
              check_in_method: newMethod,
              checked_in_at: new Date().toISOString(),
              discord_username: member.user.username
            })
            .eq('id', bestReg.id);
            
          await supabase.from('player_discord_map').update({ discord_username: member.user.username, discord_user_id: member.id, updated_at: new Date().toISOString() }).eq('discord_username', bestReg.discord_username);
        }
      } catch (syncErr) {
        console.error('Failed to sync check-in to registration DB:', syncErr);
      }

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
      await clearHostClaimAlert(lobby.id);
      await clear3PlayerVote(lobby.id);
      await supabase.from('active_async_matches').update({ status: 'cancelled', auto_start_at: null }).eq('id', lobby.id);
      if (lobby.channel_id && lobby.message_id) {
        const channel = await discordClient.channels.fetch(lobby.channel_id).catch(() => null);
        const msg = channel ? await channel.messages.fetch(lobby.message_id).catch(() => null) : null;
        if (msg && msg.embeds && msg.embeds.length > 0) {
          await msg.edit({ content: `🚫 **Lobby expired**`, embeds: [EmbedBuilder.from(msg.embeds[0]).setTitle('⏳ Lobby Expired').setColor(0x95A5A6).setDescription('This lobby timed out because it did not fill up in time.').setFooter(null)], components: [] }).catch(() => {});
          await msg.reactions.removeAll().catch(() => {});
        }
      }
    }
    updateQueueMessage();
  } catch (err) {}
}

async function handleTournamentVotingReaction(message, user, emojiName, isAdd) {
  const { data: schedule } = await supabase
    .from('tournament_match_schedules')
    .select('*')
    .eq('message_id', message.id)
    .maybeSingle();

  if (!schedule || schedule.status === 'played' || !schedule.player_discord_ids?.includes(user.id)) return;

  let rawSlots = schedule.suggested_slots;
  if (typeof rawSlots === 'string') {
    try { rawSlots = JSON.parse(rawSlots); } catch (e) { rawSlots = []; }
  }
  const availableSlotLabels = (rawSlots || []).map(s => s.label);
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
    const slotLines = (rawSlots || []).map((slot) => {
      const votersForSlot = schedule.player_discord_ids.filter(id => currentVotes[id] && currentVotes[id].includes(slot.label));
      const mentions = votersForSlot.length > 0 ? ` — ${votersForSlot.map(id => `<@${id}>`).join(' ')}` : '';
      return `${slot.label} ${slot.time_text}${mentions}`;
    });
    const nonVoters = schedule.player_discord_ids.filter(id => !votedUserIds.includes(id));
    
    let voteString = `\n\n**✅ All 4 players have voted!**`;
    if (nonVoters.length > 0) {
      voteString = `\n\n**⏳ Did not vote yet (${votesCount}/4):**\n${nonVoters.map(id => `<@${id}>`).join(', ')}`;
    }
    
    const updatedFields = originalEmbed.fields.filter(f => !f.name.includes('Suggested Time Slots'));
    updatedFields.push({ name: '📅 Suggested Time Slots & Votes', value: `${slotLines.join('\n')}${voteString}`, inline: false });
    updatedEmbed.setFields(updatedFields);
    await fetchedMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
  }

  const slotScores = {};
  for (const slot of availableSlotLabels) slotScores[slot] = 0;
  for (const uid of votedUserIds) for (const slot of currentVotes[uid]) if (slotScores[slot] !== undefined) slotScores[slot]++;
  const winningSlot = availableSlotLabels.find(slot => slotScores[slot] >= 4);

  const previousStatus = schedule.status;
  const newStatus = winningSlot ? 'confirmed' : (votesCount >= 4 ? 'conflict' : 'pending_votes');
  await supabase.from('tournament_match_schedules').update({
    mode: 'live',
    votes: currentVotes,
    votes_count: votesCount,
    status: newStatus,
    updated_at: new Date().toISOString()
  }).eq('id', schedule.id);

  const debounceKey = `schedule_${schedule.id}`;
  if (scheduleDebounceTimers.has(debounceKey)) {
    clearTimeout(scheduleDebounceTimers.get(debounceKey));
    scheduleDebounceTimers.delete(debounceKey);
  }

  if (newStatus === 'confirmed') {
    scheduleDebounceTimers.set(debounceKey, setTimeout(async () => {
      scheduleDebounceTimers.delete(debounceKey);
      await finalizeTournamentConfirmation(schedule.id);
    }, 5000));
  } else if (newStatus === 'conflict' && previousStatus !== 'conflict') {
    await sendTournamentConflictAlert({ ...schedule, votes: currentVotes, status: newStatus });
  }
}

async function checkAndSendMatchReminders() {
  try {
    const now = new Date();
    
    // --- 1. LIVE CONFIRMED MATCH COUNTDOWN REMINDERS (36h, 1h, 5m) ---
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

    // --- 2. 24-HOUR LIVE MATCH STATUS & DAILY UNSCHEDULED REMINDER CHECK ---
    const { data: unplayedSchedules } = await supabase
      .from('tournament_match_schedules')
      .select('*')
      .in('status', ['pending_votes', 'published', 'conflict', 'confirmed']);

    for (const sched of unplayedSchedules || []) {
      let rawSlots = sched.suggested_slots;
      if (typeof rawSlots === 'string') {
        try { rawSlots = JSON.parse(rawSlots); } catch (e) { rawSlots = []; }
      }
      const isLiveSched = sched.mode?.trim() === 'live' || (rawSlots && rawSlots.length > 0);
      if (!isLiveSched) continue;

      const votesObj = sched.votes || {};
      const slotLabels = (rawSlots || []).map(s => s.label);
      const scores = {};
      for (const sl of slotLabels) scores[sl] = 0;
      for (const uid of Object.keys(votesObj)) {
        for (const sl of (votesObj[uid] || [])) {
          if (scores[sl] !== undefined) scores[sl]++;
        }
      }
      const unanimousSlot = slotLabels.find(sl => scores[sl] >= 4);

      if ((unanimousSlot || sched.status === 'confirmed') && !sched.confirmed_timestamp) {
        await finalizeTournamentConfirmation(sched.id);
        continue;
      }

      if (sched.status !== 'confirmed' && !sched.confirmed_timestamp) {
        const lastStamp = sched.updated_at || sched.created_at;
        const hoursSinceUpdate = (now.getTime() - new Date(lastStamp).getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate >= 24) {
          const thread = await discordClient.channels.fetch(sched.thread_id).catch(() => null);
          if (thread) {
            let tablePath = 'table';
            if (sched.match_code && sched.match_code.includes('G')) {
              tablePath = sched.match_code.slice(sched.match_code.indexOf('G'));
            }
            const webUrl = `https://dunestats.cc/tournament/${sched.tournament_num}/${tablePath}`;
            const topPostUrl = `https://discord.com/channels/${DISCORD_GUILD_ID}/${sched.thread_id}/${sched.message_id}`;

            const votedIds = Object.keys(votesObj);
            const missingVoters = (sched.player_discord_ids || []).filter(id => !votedIds.includes(id));
            const missingLine = missingVoters.length > 0
              ? `\n\n⏳ **Still waiting on votes from:** ${missingVoters.map(id => `<@${id}>`).join(', ')}`
              : `\n\n⚠️ **Votes are currently split with no unanimous slot!**`;

            const reminderEmbed = new EmbedBuilder()
              .setTitle(`⏰ Daily Scheduling Reminder: [${sched.match_code}] ${sched.round_type} ${sched.table_identifier}`)
              .setColor(0xE67E22)
              .setDescription(
                `This match does not have a confirmed time locked in yet!${missingLine}\n\n` +
                `📢 **It is up to all 4 of you to get a valid scheduled match going:**\n` +
                `• Please actively tag your opponents in this thread—especially if someone has been silent—and involve <@&${TOURNAMENT_HOST_ROLE_ID}> if you need help.\n` +
                `• [Jump to the Voting Post](${topPostUrl}) to cast or update your reaction votes.\n` +
                `• Use \`/time\` to propose a new slot or shift an existing one (e.g. \`/time slot: A offset_minutes: 60\` or \`/time custom_time: <t:1792098000:F>\`).\n\n` +
                `🔗 **[Table Availability Map & Details](${webUrl})** · 📖 **[Scheduling Guide](${SCHEDULING_GUIDE_LINK})**`
              )
              .setTimestamp();

            const allMentions = (sched.player_discord_ids || []).map(id => `<@${id}>`).join(' ');
            const pipeSep = '|';
            await thread.send({
              content: `👥 ${allMentions} ${pipeSep} 🛡️ <@&${TOURNAMENT_HOST_ROLE_ID}>`,
              embeds: [reminderEmbed],
              allowedMentions: { users: sched.player_discord_ids || [], roles: [TOURNAMENT_HOST_ROLE_ID] }
            }).catch(() => {});
          }
          await supabase.from('tournament_match_schedules').update({ updated_at: now.toISOString() }).eq('id', sched.id);
        }
      }
    }

    // --- 3. ASYNC MATCH START REMINDERS ---
    const { data: asyncMatches } = await supabase.from('tournament_match_schedules').select('*').eq('mode', 'async').in('status', ['pending_votes', 'published']).is('confirmed_timestamp', null);
    if (asyncMatches && asyncMatches.length > 0) {
      for (const asyncMatch of asyncMatches) {
        let rawSlots = asyncMatch.suggested_slots;
        if (typeof rawSlots === 'string') {
          try { rawSlots = JSON.parse(rawSlots); } catch (e) { rawSlots = []; }
        }
        if (rawSlots && rawSlots.length > 0) continue;

        const lastAsyncStamp = asyncMatch.updated_at || asyncMatch.created_at;
        if ((now.getTime() - new Date(lastAsyncStamp).getTime()) / (1000 * 60 * 60) >= 24) {
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
  } catch (err) {
    console.error('Error in checkAndSendMatchReminders:', err);
  }
}

// -------------------------------------------------------------
// 🎮 INTERACTION HANDLERS (SLASH COMMANDS, BUTTONS, MODALS)
// -------------------------------------------------------------
discordClient.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = slashCommands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, {
          supabase,
          discordClient,
          createQueueLobby,
          updateQueueMessage,
          updateLeagueInfoMessage,
          buildRosterDisplay,
          resolveHostIgn,
          promptUnknownHostIgn,
          pendingLeagueNotes
        });
      } catch (error) {
        console.error(`Error executing /${interaction.commandName}:`, error);
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content: 'Something went wrong while processing the command.' }).catch(() => {}); 
        else await interaction.reply({ content: 'Something went wrong while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {}); 
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('quickchat_pw_modal_')) {
        const lobbyId = interaction.customId.replace('quickchat_pw_modal_', '');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('id', lobbyId).maybeSingle();
        if (!lobby || lobby.status !== 'searching') {
          await interaction.editReply({ content: '❌ This lobby is no longer active.' }).catch(() => {});
          return autoDeleteEphemeral(interaction, 60000);
        }
        const perms = await checkLobbyPermissions(lobby, interaction.user.id, interaction.guild);
        if (!perms.canManageRoster) {
          await interaction.editReply({ content: '❌ Only the Host, seated players, or Admins can set the lobby password.' }).catch(() => {});
          return autoDeleteEphemeral(interaction, 60000);
        }
        const newPassword = interaction.fields.getTextInputValue('password_input')?.trim() || 'None';
        await supabase.from('active_async_matches').update({ lobby_password: newPassword }).eq('id', lobby.id);
        await syncLobbyEmbed({ ...lobby, lobby_password: newPassword });
        if (interaction.message) await interaction.message.edit({ content: `${interaction.message.content}\n✅ **Password set by <@${interaction.user.id}>:** \`${newPassword}\` *(Sent to website & updated on lobby)*`, components: [] }).catch(() => {});
        else await interaction.channel?.send({ content: `🔑 <@${interaction.user.id}> set the lobby password to: \`${newPassword}\`` }).catch(() => {});
        await interaction.editReply({ content: `✅ Lobby password updated to \`${newPassword}\`!` }).catch(() => {});
        return autoDeleteEphemeral(interaction, 60000);
      }
      return;
    }

    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith('quickchat_pw_btn_')) {
        const lobbyId = customId.replace('quickchat_pw_btn_', '');
        const modal = new ModalBuilder().setCustomId(`quickchat_pw_modal_${lobbyId}`).setTitle('Set In-Game Lobby Password');
        const input = new TextInputBuilder().setCustomId('password_input').setLabel('In-Game Room Password').setStyle(TextInputStyle.Short).setPlaceholder('Enter the password you set in Dune...').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal).catch((err) => console.error('Failed to show Password modal:', err.message));
        return;
      }

      if (customId === 'league_cmd_pull_yes' || customId === 'league_cmd_pull_no') {
        const shouldPull = customId === 'league_cmd_pull_yes';
        const customNote = pendingLeagueNotes.get(interaction.user.id) || null;
        pendingLeagueNotes.delete(interaction.user.id);
        const isEphemeralMsg = interaction.message && interaction.message.flags?.has(MessageFlags.Ephemeral);
        if (isEphemeralMsg) await interaction.update({ content: '⚙️ Creating your Live League lobby...', components: [] }).catch(() => {});
        else { await interaction.message?.delete().catch(() => {}); await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {}); }

        let playersForLobby = [interaction.user.id];
        if (shouldPull) {
          const { data: queueRecords } = await supabase.from('matchmaking_queue').select('*').eq('mode', 'live').order('joined_at', { ascending: true }).limit(3);
          const pulledIds = (queueRecords || []).map(r => r.discord_user_id).filter(Boolean);
          playersForLobby = Array.from(new Set([interaction.user.id, ...pulledIds]));
          for (const pid of playersForLobby) await supabase.from('matchmaking_queue').delete().eq('discord_user_id', pid);
        } else {
          await supabase.from('matchmaking_queue').delete().eq('discord_user_id', interaction.user.id);
        }
        updateQueueMessage();
        const targetMsg = await createQueueLobby(interaction.user.id, playersForLobby, 'live', false, false, customNote);
        const jumpLink = targetMsg ? `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}/${targetMsg.id}` : `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}`;
        await interaction.editReply({ content: `✅ Created your Live League match in <#${LEAGUE_LFG_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**`, components: [] }).catch(() => {});
        return autoDeleteEphemeral(interaction, 60000);
      }

      if (customId.startsWith('agree_3p_btn_')) {
        const lobbyId = customId.replace('agree_3p_btn_', '');
        const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('id', lobbyId).maybeSingle();
        if (!lobby || lobby.status !== 'searching') {
          await interaction.reply({ content: '❌ This lobby is no longer active.', flags: MessageFlags.Ephemeral }).catch(() => {});
          return autoDeleteEphemeral(interaction, 60000);
        }
        if (!(lobby.player_ids || []).includes(interaction.user.id)) {
          await interaction.reply({ content: '❌ Only seated players in this lobby can vote on a 3-player start.', flags: MessageFlags.Ephemeral }).catch(() => {});
          return autoDeleteEphemeral(interaction, 60000);
        }
        const identity = await resolveQueuePlayerIdentity(interaction.user.id, interaction.member);
        await interaction.deferUpdate().catch(() => {});
        await supabase.from('lobby_quick_chats').insert({ lobby_id: lobby.id, sender_name: identity.displayName, message_code: 'agree_3p' });
        return;
      }

      if (customId.startsWith('cancel_3p_btn_')) {
        const lobbyId = customId.replace('cancel_3p_btn_', '');
        const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('id', lobbyId).maybeSingle();
        if (!lobby || !(lobby.player_ids || []).includes(interaction.user.id)) {
          await interaction.reply({ content: '❌ Only seated players in this lobby can decline the 3-player start.', flags: MessageFlags.Ephemeral }).catch(() => {});
          return autoDeleteEphemeral(interaction, 60000);
        }
        const identity = await resolveQueuePlayerIdentity(interaction.user.id, interaction.member);
        await interaction.deferUpdate().catch(() => {});
        await clear3PlayerVote(lobbyId, `❌ **${identity.displayName}** declined the 3-player start. Waiting for a 4th player!`);
        return;
      }

      if (customId === 'queue_play') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const identity = await resolveQueuePlayerIdentity(interaction.user.id, interaction.member);
        const whoAdminStr = `**${identity.displayName}** (<@${interaction.user.id}>)`;
        const seatedLobby = await tryAutoSeatIntoOpenLeagueLobby(interaction.user.id, identity.displayName, identity.userId);
        if (seatedLobby) {
          await supabase.from('matchmaking_queue').delete().eq('discord_user_id', interaction.user.id);
          updateQueueMessage();
          const targetChId = seatedLobby.channel_id || LEAGUE_LFG_CHANNEL_ID;
          const lobbyCodeLabel = seatedLobby.match_id || `sa${seatedLobby.id}`;
          const jumpLink = `https://discord.com/channels/${interaction.guildId}/${targetChId}/${seatedLobby.message_id}`;
          if (seatedLobby.alreadySeated) await interaction.editReply({ content: `ℹ️ You are already seated in open League Lobby \`${lobbyCodeLabel}\`!\n🔗 **[Jump to Lobby](${jumpLink})**` }).catch(() => {});
          else {
            await interaction.editReply({ content: `⚔️ Joined open League Lobby \`${lobbyCodeLabel}\` in <#${targetChId}>!\n🔗 **[Jump to Lobby](${jumpLink})**` }).catch(() => {});
            await notifyLfgAdminQueueJoin(whoAdminStr, `via Play Button — auto-seated into open Lobby \`${lobbyCodeLabel}\``);
          }
          return autoDeleteEphemeral(interaction, 60000);
        }

        const choiceRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('queue_live_prompt').setLabel('Join Queue (Passive)').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('queue_host').setLabel('Host Lobby (Active)').setStyle(ButtonStyle.Success)
        );
        const promptText = [
          `🎲 **No open League lobby is currently active. How would you like to play?**\n`,
          `• **Join Queue (Wait Passively):** Enter the waiting queue. A lobby will open in <#${LEAGUE_LFG_CHANNEL_ID}> as soon as the queue reaches **4/4** or another player decides to host.`,
          `• **Host Lobby (Be the Host):** Open a lobby in <#${LEAGUE_LFG_CHANNEL_ID}> right now with yourself and any waiting queue players! By hosting, you take responsibility for creating the room in-game — see **[Host Responsibilities & Guide](${HOST_RESPONSIBILITIES_LINK})**.`
        ].join('\n');
        await interaction.editReply({ content: promptText, components: [choiceRow] }).catch(() => {});
        return autoDeleteEphemeral(interaction, 60000);
      }

      if (customId === 'queue_live_prompt') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('queue_join_live_5').setLabel('5 min').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('queue_join_live_15').setLabel('15 min').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('queue_join_live_30').setLabel('30 min').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('queue_join_live_45').setLabel('45 min').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('queue_join_live_60').setLabel('60 min').setStyle(ButtonStyle.Danger)
        );
        const durationPrompt = '⏳ **How long are you able to wait in the queue before a host opens a lobby?**\n*(If you get put in a lobby later and don\'t want to wait any longer, please leave the lobby).*';
        if (interaction.message && interaction.message.flags?.has(MessageFlags.Ephemeral)) await interaction.update({ content: durationPrompt, components: [row] }).catch(() => {});
        else { await interaction.reply({ content: durationPrompt, components: [row], flags: MessageFlags.Ephemeral }).catch(() => {}); autoDeleteEphemeral(interaction, 60000); }
        return;
      }

      if (customId.startsWith('queue_join_live_')) {
        const durationValue = parseInt(customId.replace('queue_join_live_', ''), 10);
        const expiryDate = new Date(Date.now() + durationValue * 60 * 1000);
        const identity = await resolveQueuePlayerIdentity(interaction.user.id, interaction.member);
        const whoAdminStr = `**${identity.displayName}** (<@${interaction.user.id}>)`;

        const seatedLobby = await tryAutoSeatIntoOpenLeagueLobby(interaction.user.id, identity.displayName, identity.userId);
        if (seatedLobby) {
          await supabase.from('matchmaking_queue').delete().eq('discord_user_id', interaction.user.id);
          updateQueueMessage();
          const targetChId = seatedLobby.channel_id || LEAGUE_LFG_CHANNEL_ID;
          const lobbyCodeLabel = seatedLobby.match_id || `sa${seatedLobby.id}`;
          const jumpLink = `https://discord.com/channels/${interaction.guildId}/${targetChId}/${seatedLobby.message_id}`;
          await interaction.update({ content: `⚔️ An open League lobby was just created! You have been **automatically seated** into Match \`${lobbyCodeLabel}\`.\n🔗 **[Jump to Lobby](${jumpLink})**`, components: [] }).catch(() => {});
          autoDeleteEphemeral(interaction, 60000);
          if (!seatedLobby.alreadySeated) await notifyLfgAdminQueueJoin(whoAdminStr, `via Discord (${durationValue}m) — auto-seated into open Lobby \`${lobbyCodeLabel}\``);
          return;
        }

        recentDiscordQueueIds.add(interaction.user.id);
        setTimeout(() => recentDiscordQueueIds.delete(interaction.user.id), 10000);

        const { error: insErr } = await supabase.from('matchmaking_queue').upsert({
          discord_user_id: interaction.user.id, user_id: identity.userId, player_key: identity.playerKey, display_name: identity.displayName,
          mode: 'live', duration_minutes: durationValue, expires_at: expiryDate.toISOString(), joined_at: new Date().toISOString()
        }, { onConflict: 'discord_user_id,mode' });

        if (insErr) {
          await interaction.update({ content: `❌ Failed to join queue: ${insErr.message}`, components: [] }).catch(() => {});
          return autoDeleteEphemeral(interaction, 60000);
        }
        await interaction.update({ content: `✅ You joined the queue as **${identity.displayName}** for **${durationValue} minutes** (active until <t:${Math.floor(expiryDate.getTime() / 1000)}:t>).`, components: [] }).catch(() => {});
        autoDeleteEphemeral(interaction, 60000);
        await notifyLfgAdminQueueJoin(whoAdminStr, `via Discord Queue Button for ${durationValue} mins`);
        updateQueueMessage();
        return;
      }

      if (customId === 'queue_leave') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        let removedFromQueue = false, removedFromLobbies = [];
        const { data: existingQueue } = await supabase.from('matchmaking_queue').select('id').eq('discord_user_id', interaction.user.id);
        if (existingQueue && existingQueue.length > 0) { await supabase.from('matchmaking_queue').delete().eq('discord_user_id', interaction.user.id); removedFromQueue = true; }

        const { data: openLeagueLobbies } = await supabase.from('active_async_matches').select('*').eq('status', 'searching').eq('is_league', true);
        for (const lobby of openLeagueLobbies || []) {
          const pIds = lobby.player_ids || [];
          if (pIds.includes(interaction.user.id)) {
            const newPIds = pIds.filter(id => id !== interaction.user.id);
            const newNotifies = (lobby.notify_user_ids || []).filter(id => id !== interaction.user.id);
            const totalAfter = newPIds.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0);
            const updatePayload = { player_ids: newPIds, notify_user_ids: newNotifies };
            if (totalAfter < 4 && lobby.auto_start_at) updatePayload.auto_start_at = null;
            await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);
            removedFromLobbies.push(lobby.match_id || `sa${lobby.id}`);

            const lobbyCh = await discordClient.channels.fetch(lobby.channel_id || LEAGUE_LFG_CHANNEL_ID).catch(() => null);
            if (lobbyCh) {
              const lobbyMsg = await lobbyCh.messages.fetch(lobby.message_id).catch(() => null);
              if (lobbyMsg) {
                for (const [, r] of lobbyMsg.reactions.cache) if (!LOBBY_CONTROL_EMOJIS.has(r.emoji.name || '')) await r.users.remove(interaction.user.id).catch(() => {});
              }
              if (totalAfter > 0) {
                let leaveNotice = `🚪 <@${interaction.user.id}> left League Lobby \`${lobby.match_id || `sa${lobby.id}`}\` (${totalAfter}/4).`;
                if (lobby.auto_start_at && totalAfter < 4) leaveNotice += `\n⚠️ **Roster drop verified.** Automated match countdown aborted.`;
                await lobbyCh.send({ content: leaveNotice }).catch(() => {});
              }
            }
            const updatedLobbyObj = { ...lobby, ...updatePayload };
            const handledSpecial = await handlePostLeaveOrHostCheck(updatedLobbyObj, lobby.host_id);
            if (!handledSpecial) await syncLobbyEmbed(updatedLobbyObj);
          }
        }
        updateQueueMessage();
        if (!removedFromQueue && removedFromLobbies.length === 0) await interaction.editReply({ content: 'ℹ️ You are not currently in the matchmaking queue or any open League lobby.' }).catch(() => {});
        else {
          const parts = [];
          if (removedFromQueue) parts.push('the matchmaking queue');
          if (removedFromLobbies.length > 0) parts.push(`open League Lobby \`${removedFromLobbies.join(', ')}\``);
          await interaction.editReply({ content: `🚪 You have been removed from ${parts.join(' and ')}.` }).catch(() => {});
        }
        return autoDeleteEphemeral(interaction, 60000);
      }

      if (customId === 'queue_host' || customId === 'queue_create_live') {
        const isFromEphemeralPrompt = interaction.message && interaction.message.flags?.has(MessageFlags.Ephemeral);
        if (isFromEphemeralPrompt) await interaction.update({ content: '⚙️ Creating your Live League lobby and pulling waiting queue players...', components: [] }).catch(() => {});
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const { data: queueRecords } = await supabase.from('matchmaking_queue').select('*').eq('mode', 'live').order('joined_at', { ascending: true }).limit(3);
        const playersToPop = (queueRecords || []).map(r => r.discord_user_id).filter(Boolean);
        const allToClear = [interaction.user.id, ...playersToPop];
        for (const pid of allToClear) await supabase.from('matchmaking_queue').delete().eq('discord_user_id', pid);
        updateQueueMessage();
        const playerSet = new Set([interaction.user.id, ...playersToPop]);
        const targetMsg = await createQueueLobby(interaction.user.id, Array.from(playerSet), 'live', false, false, null);
        const jumpLink = targetMsg ? `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}/${targetMsg.id}` : `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}`;
        await interaction.editReply({ content: `✅ Created your Live League lobby in <#${LEAGUE_LFG_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**`, components: [] }).catch(() => {});
        return autoDeleteEphemeral(interaction, 60000);
      }

      if (customId.startsWith('claim_auto_host_')) {
        const lobbyId = customId.replace('claim_auto_host_', '');
        const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('id', lobbyId).single();
        if (!lobby || lobby.host_id !== 'UNCLAIMED') { await interaction.reply({ content: 'Host already claimed!', flags: MessageFlags.Ephemeral }).catch(() => {}); return autoDeleteEphemeral(interaction, 60000); }
        if (!lobby.player_ids.includes(interaction.user.id)) { await interaction.reply({ content: 'You must be a player in this match to claim host.', flags: MessageFlags.Ephemeral }).catch(() => {}); return autoDeleteEphemeral(interaction, 60000); }
        await supabase.from('active_async_matches').update({ host_id: interaction.user.id }).eq('id', lobbyId);
        await clearHostClaimAlert(lobbyId);
        let channel = null;
        try {
          channel = await discordClient.channels.fetch(lobby.channel_id);
          const msg = await channel.messages.fetch(lobby.message_id);
          if (msg) await msg.edit({ components: [] });
        } catch (e) {}
        const { data: updatedLobby } = await supabase.from('active_async_matches').select('*').eq('id', lobbyId).single();
        if (updatedLobby) await syncLobbyEmbed(updatedLobby);
        updateQueueMessage();
        await interaction.reply({ content: `✅ You claimed host! Please set up the in-game room with password \`${lobby.lobby_password}\`.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        autoDeleteEphemeral(interaction, 60000);
        const hostIgnInfo = await resolveHostIgn(interaction.user.id);
        if (!hostIgnInfo.isKnown && updatedLobby && channel) promptUnknownHostIgn(updatedLobby, interaction.user, channel);
        return;
      }

      if (customId.startsWith('disable_sp_')) {
        const targetId = customId.replace('disable_sp_', '');
        if (interaction.user.id !== targetId) return await interaction.reply({ content: '❌ You can only disable your own notifications.', flags: MessageFlags.Ephemeral }).catch(() => {});
        await supabase.from('player_discord_map').update({ sp_alerts_opt_out: true }).eq('discord_user_id', targetId);
        return await interaction.reply({ content: '🔕 **SP Notifications Disabled.** You will no longer be pinged for SP gains.\n*(If you want them back later, you can ask an admin to re-enable them in the database).*', flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      if (customId.startsWith('async_start_')) {
        const matchId = customId.replace('async_start_', '');
        const { data: schedule } = await supabase.from('tournament_match_schedules').select('*').eq('id', matchId).single();
        if (!schedule) return await interaction.reply({ content: '❌ Match schedule not found.', flags: MessageFlags.Ephemeral }).catch(() => {});
        if (!(schedule.player_discord_ids && schedule.player_discord_ids.includes(interaction.user.id)) && !interaction.member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID) && !interaction.member.permissions.has('Administrator')) {
          return await interaction.reply({ content: '❌ You must be a player in this match or tournament host to mark it as started.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await supabase.from('tournament_match_schedules').update({ status: 'ongoing', confirmed_timestamp: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', schedule.id);
        await interaction.update({ components: [] }).catch(() => {});
        await interaction.channel.send({ content: `👥 ${(schedule.player_discord_ids || []).map(id => `<@${id}>`).join(' ')}`, embeds: [new EmbedBuilder().setTitle(`🚀 Async Match Started: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`).setColor(0x2ECC71).setDescription(`<@${interaction.user.id}> marked this game as **Ongoing**! Turn timers are active.\n\n⚙️ Async Tournament Settings: <#${ASYNC_SETTINGS_CHANNEL_ID}>\n\n📸 **Reporting Results**\nOnce the game concludes, upload your final screenshot to:\n🔗 [dunestats.cc/tournament](https://dunestats.cc/tournament)`).setTimestamp()] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Unhandled error in interactionCreate:', err);
  }
});

discordClient.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    const trimmedContent = message.content.trim();
    const leaguePrefixMatch = trimmedContent.match(/^[\/!]league(?:\s+(.+))?$/i);
    if (leaguePrefixMatch) {
      const customNote = leaguePrefixMatch[1]?.trim() || null;
      const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && (member.roles.cache.has(LFG_ADMIN_ROLE) || member.permissions.has('Administrator'))) {
        await message.delete().catch(() => {});
        const { data: queueRecords } = await supabase.from('matchmaking_queue').select('*').eq('mode', 'live').order('joined_at', { ascending: true }).limit(3);
        const waitingQueue = (queueRecords || []).filter(r => r.discord_user_id && r.discord_user_id !== message.author.id);

        if (waitingQueue.length > 0) {
          pendingLeagueNotes.set(message.author.id, customNote);
          const namesList = waitingQueue.map(r => `<@${r.discord_user_id}>`).join(', ');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('league_cmd_pull_yes').setLabel(`Pull Queue Players (${waitingQueue.length})`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('league_cmd_pull_no').setLabel('Start Fresh (Just Me)').setStyle(ButtonStyle.Secondary)
          );
          const askMsg = await message.channel.send({ content: `👥 <@${message.author.id}>, there ${waitingQueue.length === 1 ? 'is **1 player**' : `are **${waitingQueue.length} players**`} currently waiting in the queue (${namesList}). Would you like to pull them into your new League lobby?`, components: [row] }).catch(() => null);
          if (askMsg) setTimeout(() => askMsg.delete().catch(() => {}), 60000);
          return;
        }

        await supabase.from('matchmaking_queue').delete().eq('discord_user_id', message.author.id);
        updateQueueMessage();
        const targetMsg = await createQueueLobby(message.author.id, [message.author.id], 'live', false, false, customNote);
        if (targetMsg && message.channel.id !== LEAGUE_LFG_CHANNEL_ID) {
          const jumpLink = `https://discord.com/channels/${message.guild.id}/${LEAGUE_LFG_CHANNEL_ID}/${targetMsg.id}`;
          const tempNotice = await message.channel.send({ content: `✅ <@${message.author.id}>, your Live League match has been posted in <#${LEAGUE_LFG_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**` }).catch(() => null);
          if (tempNotice) setTimeout(() => tempNotice.delete().catch(() => {}), 60000);
        }
        return;
      }
    }

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

discordClient.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    if (newMember.user.bot) return;
    const username = newMember.user.username;
    const displayName = newMember.nickname || newMember.displayName || username;
    const hasLeagueRole = newMember.roles.cache.has(LEAGUE_NOTIFY_ROLE_ID);

    await supabase.from('discord_guild_members').upsert({
      discord_user_id: newMember.id,
      discord_username: username,
      global_name: newMember.user.globalName || null,
      display_name: displayName,
      has_league_lfg_role: hasLeagueRole,
      updated_at: new Date().toISOString()
    }, { onConflict: 'discord_user_id' });

    // If the League Notification Role changed on Discord, update player_discord_map
    const hadLeagueRole = oldMember.roles.cache.has(LEAGUE_NOTIFY_ROLE_ID);
    if (hadLeagueRole !== hasLeagueRole) {
      await supabase
        .from('player_discord_map')
        .update({ has_league_lfg_role: hasLeagueRole, updated_at: new Date().toISOString() })
        .eq('discord_user_id', newMember.id);
    }
  } catch (e) {}
});
discordClient.on('guildMemberRemove', async (member) => {
  try {
    if (member.user.bot) return;
    await supabase.from('discord_guild_members').delete().eq('discord_user_id', member.id);
  } catch (e) {}
});

discordClient.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (err) { return; } }
    const message = reaction.message;
    if (message.partial) { try { await message.fetch(); } catch (err) { return; } }

    const emojiObj = reaction.emoji;
    const emojiName = emojiObj.name || '';
    const emojiStr = emojiObj.toString();

    await handleTournamentVotingReaction(message, user, emojiName, true);
    await handleTournamentCheckinReaction(message, user, emojiName);

    const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('message_id', message.id).maybeSingle();
    if (!lobby || lobby.status !== 'searching') return;

    const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';
    const isJoinEmoji = !LOBBY_CONTROL_EMOJIS.has(emojiName) && !LOBBY_CONTROL_EMOJIS.has(emojiStr);

    let players = [...(lobby.player_ids || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    let shouldUpdate = false;

    if (isJoinEmoji) {
      if (!players.includes(user.id)) {
        const totalRoster = players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0);
        if (totalRoster < 4) {
          players.push(user.id);
          shouldUpdate = true;
          await supabase.from('matchmaking_queue').delete().eq('discord_user_id', user.id);
          if (totalRoster + 1 === 4 && active3PlayerVotes.has(String(lobby.id))) await clear3PlayerVote(lobby.id);
          const notifyTargets = notifications.filter(id => id !== user.id);
          if (notifyTargets.length > 0) await message.channel.send({ content: `🔔 ${notifyTargets.map(id => `<@${id}>`).join(' ')}, **${user.username}** joined the lobby!` }).catch(() => {});
        } else {
          await reaction.users.remove(user.id).catch(() => {});
        }
      }
    } else if (emojiName === '🔔' || emojiStr === '🔔') {
      if (!notifications.includes(user.id)) { notifications.push(user.id); shouldUpdate = true; }
    } else if (emojiName === '📢' || emojiStr === '📢') {
      const pingResult = await executeLobbyPing(lobby, message.channel);
      if (!pingResult) {
        const cooldownMsg = await message.reply({ content: `⏳ Tag is on cooldown. Next ping available <t:${Math.floor((new Date(lobby.last_prompted_at).getTime() + TAG_COOLDOWN_MS) / 1000)}:R>` }).catch(() => {});
        if (cooldownMsg) setTimeout(() => { cooldownMsg.delete().catch(() => {}); }, 5000);
      }
      await reaction.users.remove(user.id).catch(() => {});
      return;
    } else if (emojiName === '🙋' || emojiStr === '🙋' || emojiName === '➕' || emojiStr === '➕') {
      await reaction.users.remove(user.id).catch(() => {});
      if (isLeague) return;
      const perms = await checkLobbyPermissions(lobby, user.id, message.guild);
      if (!perms.canManageRoster) return;
      const defaultFriend = `Friend of ${user.username}`;
      const promptMsg = await message.channel.send({ content: `🙋 <@${user.id}>, reply with the **in-game name (IGN)** or **Discord @mention** of the player to add.\n*(Type \`default\` for **${defaultFriend}**, or \`cancel\` to abort — expires in 2 minutes)*` });
      try {
        const filter = (m) => m.author.id === user.id;
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 120000, errors: ['time'] });
        const replyMsg = collected.first();
        const inputStr = replyMsg.content.trim();
        await replyMsg.delete().catch(() => {});
        if (inputStr.toLowerCase() !== 'cancel') {
          const { data: freshLobby } = await supabase.from('active_async_matches').select('*').eq('id', lobby.id).maybeSingle();
          if (freshLobby && freshLobby.status === 'searching') await resolveAndAddPlayerToLobby(freshLobby, inputStr, user, message.guild);
        }
      } catch (timeoutErr) {
        const { data: freshLobby } = await supabase.from('active_async_matches').select('*').eq('id', lobby.id).maybeSingle();
        if (freshLobby && freshLobby.status === 'searching') await resolveAndAddPlayerToLobby(freshLobby, defaultFriend, user, message.guild);
      }
      await promptMsg.delete().catch(() => {});
      return;
    } else if (emojiName === '🎮' || emojiStr === '🎮') {
      const perms = await checkLobbyPermissions(lobby, user.id, message.guild);
      const totalCount = players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0);
      if (!perms.canManageRoster) { await reaction.users.remove(user.id).catch(() => {}); return; }
      if (isLeague) {
        await reaction.users.remove(user.id).catch(() => {});
        if (totalCount < 3) {
          const warnMsg = await message.channel.send({ content: `⚠️ <@${user.id}>, official **League matches** cannot be started with fewer than **3 players** (currently ${totalCount}/4).` }).catch(() => null);
          if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 10000);
          return;
        }
        if (totalCount === 3) {
          const member = message.guild?.members?.cache?.get(user.id) || await message.guild?.members?.fetch(user.id).catch(() => null);
          const identity = await resolveQueuePlayerIdentity(user.id, member);
          if (!active3PlayerVotes.has(String(lobby.id))) await supabase.from('lobby_quick_chats').insert({ lobby_id: lobby.id, sender_name: identity.displayName, message_code: 'start_3p_ask' });
          await supabase.from('lobby_quick_chats').insert({ lobby_id: lobby.id, sender_name: identity.displayName, message_code: 'agree_3p' });
          return;
        }
        return await executeLobbyStartSequence(lobby, message.channel);
      }
      if (totalCount >= 2) return await executeLobbyStartSequence(lobby, message.channel);
      else await reaction.users.remove(user.id).catch(() => {});
      return;
    } else if (emojiName === '❌' || emojiStr === '❌') {
      const perms = await checkLobbyPermissions(lobby, user.id, message.guild);
      if (!perms.canCancel) { await reaction.users.remove(user.id).catch(() => {}); return; }
      await clearHostClaimAlert(lobby.id);
      await clear3PlayerVote(lobby.id);
      await supabase.from('active_async_matches').update({ status: 'cancelled', auto_start_at: null }).eq('id', lobby.id);
      if (isLeague) updateQueueMessage();
      await message.edit({ content: `🚫 **Lobby cancelled by ${user.username}**`, embeds: [EmbedBuilder.from(message.embeds[0]).setTitle('❌ Lobby Cancelled').setColor(0xff0000).setDescription(`This lobby was cancelled by ${user.username}`).setFooter(null)], components: [] }).catch(() => {});
      return;
    } else if (emojiName === '🥾' || emojiStr === '🥾') {
      const perms = await checkLobbyPermissions(lobby, user.id, message.guild);
      if (!perms.canManageRoster) { await reaction.users.remove(user.id).catch(() => {}); return; }
      await runKickFlow(lobby, user, message.channel, message);
      await reaction.users.remove(user.id).catch(() => {}); 
      return;
    }

    if (shouldUpdate) {
      let updatePayload = { player_ids: players, notify_user_ids: notifications };
      if (players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0) === 4 && !lobby.auto_start_at) {
        const startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
        updatePayload.auto_start_at = startTargetDate.toISOString();
        await message.channel.send({ content: `⏳ **Lobby full (4/4)!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!` }).catch(() => {});
      }
      await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);
      await syncLobbyEmbed({ ...lobby, ...updatePayload });
      if (isLeague) updateQueueMessage();
    }
  } catch (err) {
    console.error('Error in messageReactionAdd:', err);
  }
});

discordClient.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (err) { return; } }
    const message = reaction.message;
    if (message.partial) { try { await message.fetch(); } catch (err) { return; } }

    const emojiObj = reaction.emoji;
    const emojiName = emojiObj.name || '';
    const emojiStr = emojiObj.toString();

    await handleTournamentVotingReaction(message, user, emojiName, false);

    const { data: lobby } = await supabase.from('active_async_matches').select('*').eq('message_id', message.id).maybeSingle();
    if (!lobby || lobby.status !== 'searching') return;

    const isLeague = lobby.is_league === true || String(lobby.is_league).toLowerCase() === 'true';
    const isJoinEmoji = !LOBBY_CONTROL_EMOJIS.has(emojiName) && !LOBBY_CONTROL_EMOJIS.has(emojiStr);
    
    let players = [...(lobby.player_ids || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    let shouldUpdate = false;

    if (isJoinEmoji && players.includes(user.id)) {
      players = players.filter(id => id !== user.id);
      shouldUpdate = true;
    }
    if ((emojiName === '🔔' || emojiStr === '🔔') && notifications.includes(user.id)) {
      notifications = notifications.filter(id => id !== user.id);
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const totalAfter = players.length + (lobby.guest_players?.length || 0) + (lobby.web_player_names?.length || 0);
      let updatePayload = { player_ids: players, notify_user_ids: notifications };
      if (totalAfter < 4 && lobby.auto_start_at) {
        updatePayload.auto_start_at = null;
        if (totalAfter > 0) {
          const matchCodeLabel = lobby.match_id ? `\`${lobby.match_id}\`` : '';
          await message.channel.send({ content: `⚠️ **Roster drop verified.** Automated match countdown for lobby ${matchCodeLabel} aborted.` }).catch(() => {});
        }
      }
      await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);

      const updatedLobbyObj = { ...lobby, ...updatePayload };
      const handledSpecial = await handlePostLeaveOrHostCheck(updatedLobbyObj, lobby.host_id);
      if (!handledSpecial) {
        await syncLobbyEmbed(updatedLobbyObj);
        if (isLeague) updateQueueMessage();
      }
    }
  } catch (err) {
    console.error('Error in messageReactionRemove:', err);
  }
});

discordClient.once('clientReady', async () => {
  console.log('Logged in as', discordClient.user.tag);
  startRealtimeListener();
  startGlobalDatabaseListener();
  await runInitialDatabaseSync();
  await syncGuildDirectory();
  await updateQueueMessage();
  await catchUpMissedWebLobbies();
  await checkAndSendMatchReminders();
  await syncActiveLeaguePlayersRole();
  await updateLeagueInfoMessage();

  try {
    const { data: unannouncedSp } = await supabase.from('sp_events').select('id').eq('announced_to_discord', false).lt('created_at', new Date(Date.now() - 10000).toISOString()).order('created_at', { ascending: false }).limit(15);
    if (unannouncedSp && unannouncedSp.length > 0) unannouncedSp.forEach((e, index) => setTimeout(() => announceSpEvent(e.id), index * 2500 + 2000));
  } catch (err) {}

  try {
    const { data: unannouncedScans } = await supabase.from('games').select('id').is('ai_scan_discord_message_id', null).not('ai_scan_status', 'is', null).neq('ai_scan_status', AI_SCAN_IGNORED_STATUS).order('created_at', { ascending: false }).limit(15);
    if (unannouncedScans && unannouncedScans.length > 0) unannouncedScans.forEach((g, index) => setTimeout(() => announceOrUpdateScanResult(g.id), index * 2500 + 5000));
  } catch (err) {}

  setInterval(async () => { await executeGlobalSpAuditSweep(); await syncActiveLeaguePlayersRole(); await updateLeagueInfoMessage(); }, 24 * 60 * 60 * 1000);
  setInterval(async () => {
    try {
      const { data: expiredLobbies } = await supabase.from('active_async_matches').select('*').eq('status', 'searching').not('auto_start_at', 'is', null).lte('auto_start_at', new Date().toISOString());
      if (expiredLobbies && expiredLobbies.length > 0) {
        for (const targetLobby of expiredLobbies) await supabase.from('active_async_matches').update({ status: 'started', auto_start_at: null }).eq('id', targetLobby.id);
      }
    } catch (cronErr) {}
  }, 30 * 1000);
  setInterval(async () => { await checkAndSendMatchReminders(); }, 60 * 1000);
  setInterval(async () => { await checkAndExpireCheckins(); }, 5 * 60 * 1000);
  setInterval(async () => { await checkAndExpireLobbies(); }, 5 * 60 * 1000);
  setInterval(async () => { await cleanExpiredQueueEntries(); }, 30 * 1000);
  setInterval(async () => { await catchUpMissedWebLobbies(); }, 60 * 1000);

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
