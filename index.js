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

const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder, userMention, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const liveCommand = require('./live'); 
const fixCommand = require('./fix'); // Registered the new fix command module
const tournamentCommand = require('./tournament');
const massThreadsCommand = require('./mass-threads'); 
const spCommand = require('./sp'); 
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
const GAME_ROWS_WAIT_MS = 2000;
const REALTIME_RETRY_DELAY_MS = 5000;
const REALTIME_MAX_RETRIES = 10;
const MEMBER_SEARCH_LIMIT = 10;
const DB_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_THRESHOLD = 0.72;
const GUILD_MATCH_GAP = 0.08;
const TAG_COOLDOWN_MS = 45 * 60 * 1000; // 45 minutes

// Your designated target tournament role ID
const TOURNAMENT_ROLE_ID = '1525805277662679121';
const TARGET_TOURNAMENT_NUM = 14;

// Automated SP Progression Tier Structure Array Configuration
const SP_ROLES_CONFIG = [
  { name: 'Kwisatz Haderach', min: 10000, id: '152621467311616082' },
  { name: 'Swordmaster',      min: 5000,  id: '1526218389004226640' },
  { name: 'Mentat',           min: 2500,  id: '1526218251858612274' },
  { name: 'Fedaykin',         min: 1000,  id: '1526218112054198332' },
  { name: 'Trooper',          min: 250,   id: '1526217478017908786' },
  { name: 'Spiceworker',      min: 0,     id: '1526217296501276702' }
];

// --- SP SYSTEM CONFIGURATION ---
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

// Registered fixCommand within the internal slashCommands Map
const slashCommands = new Map([
  [statsCommand.data.name, statsCommand],
  [asyncCommand.data.name, asyncCommand],
  [liveCommand.data.name, liveCommand], 
  [fixCommand.data.name, fixCommand],
  [tournamentCommand.data.name, tournamentCommand],
  [massThreadsCommand.data.name, massThreadsCommand],
  [spCommand.data.name, spCommand]
]);

const pendingGames = new Set();
let realtimeRetryCount = 0;
let realtimeChannel = null;

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
    } catch (err) { console.error('Guild search failed for', query, err); }
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
  const { error } = await supabase.from('player_discord_map').update({ discord_user_id: normalizedId, updated_at: new Date().toISOString() }).eq('id', dbMatch.id);
  if (error) { console.error('Failed to persist discord_user_id for', dbMatch.player_key || dbMatch.display_name, error); }
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
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data || !data.signedUrl) { console.error('Failed to create signed URL for image', storagePath, error); return null; }
  try {
    const response = await fetch(data.signedUrl);
    if (!response.ok) { console.error('Failed to fetch signed image URL', response.status, response.statusText); return null; }
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
    } catch (compressionError) { console.error('Failed to compress screenshot', compressionError); }
    return { attachment: null, imageUrl: data.signedUrl, tooLarge: true };
  } catch (err) { console.error('Failed to build attachment from screenshot', err); return { attachment: null, imageUrl: null, tooLarge: false }; }
}

async function buildGameResultPayload(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, game_version, image_url, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, tournament_num')
    .eq('id', gameId)
    .single();

  if (gameError || !game) { console.error('Failed to fetch game', gameId, gameError); return null; }
  
  const { data: results, error: resultsError = null } = await supabase
    .from('game_results')
    .select('player_name, leader_name, placement, points, elo_delta, elo_delta_overall')
    .eq('game_id', gameId)
    .order('placement', { ascending: true });

  if (resultsError || !results || !results.length) { console.error('Failed to fetch results for', gameId, resultsError); return null; }
  
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
            tablesMap.set(groupKey, {
              roundType: row.round_type,
              tableIdentifier: row.table_identifier,
              players: []
            });
          }
          tablesMap.get(groupKey).players.push(normalizeName(row.player_name));
        });

        const matchedTable = Array.from(tablesMap.values()).find(t => {
          return currentPlayers.every(p => t.players.includes(p));
        });

        if (matchedTable) {
          tournamentDetails = {
            roundType: matchedTable.roundType,
            tableIdentifier: matchedTable.tableIdentifier
          };
        }
      }
    } catch (err) {
      console.error('Error cross-referencing tournament match metadata pairings:', err);
    }
  }

  const playerKeys = results.map((r) => String(r.player_name || '').toLowerCase());
  const { data: ratings, error: ratingsError = null } = await supabase
    .from('player_ratings')
    .select('player_key, display_name, game_version, elo')
    .in('player_key', playerKeys)
    .in('game_version', ['overall', game.game_version]);

  if (ratingsError) { console.error('Failed to fetch ratings', ratingsError); }
  const ratingsMap = {};
  for (const row of ratings || []) {
    if (!ratingsMap[row.player_key]) ratingsMap[row.player_key] = {};
    ratingsMap[row.player_key][row.game_version] = row.elo;
  }
  const screenshotMedia = game.image_url ? await createDiscordImagePayload(game.image_url) : null;
  return { game, results, ratingsMap, screenshotMedia, tournamentDetails };
}

async function buildEmbed(payload, guild) {
  const game = payload.game; const results = payload.results; const ratingsMap = payload.ratingsMap; const screenshotMedia = payload.screenshotMedia;
  const tourney = payload.tournamentDetails;
  
  const modeLabel = capitalize(game.game_version || 'unknown'); const tags = buildGameTags(game, guild); const lines = [];
  
  let titleString = `Game Finished - ${modeLabel}`;
  if (game.tournament_num) {
    if (tourney) {
      titleString = `🏆 Tournament ${game.tournament_num} | ${tourney.roundType} ${tourney.tableIdentifier}`;
    } else {
      titleString = `🏆 Tournament ${game.tournament_num} Match Finished!`;
    }
  }

  for (const row of results) {
    const place = getPlacementEmoji(guild, row.placement); const playerKey = String(row.player_name || '').toLowerCase();
    const currentOverall = ratingsMap[playerKey] ? ratingsMap[playerKey].overall : undefined; const currentMode = ratingsMap[playerKey] ? ratingsMap[playerKey][game.game_version] : undefined;
    const mention = await resolveMentionForName(guild, row.player_name);
    const playerPart = mention ? '**' + row.player_name + '** ' + mention : '**' + row.player_name + '**';
    let text = place + ' ' + playerPart + ' - ' + (row.leader_name || 'Unknown Leader') + ' - ' + (row.points ?? '?') + ' pts';
    text += '\nOverall: ' + formatDelta(row.elo_delta_overall);
    if (currentOverall !== undefined) { text += ' (-> ' + Number(currentOverall).toFixed(1) + ')'; }
    text += ' | ' + modeLabel + ': ' + formatDelta(row.elo_delta);
    if (currentMode !== undefined) { text += ' (-> ' + Number(currentMode).toFixed(1) + ')'; }
    lines.push(text);
  }
  if (tags.length) { lines.push('Game modes played: ' + tags.join(' | ')); }
  const embed = new EmbedBuilder().setTitle(titleString).setDescription(lines.join('\n\n')).setColor(game.tournament_num ? 0xd35400 : 0xC9A24B).setTimestamp(new Date());
  if (screenshotMedia?.imageUrl) { embed.setImage(screenshotMedia.imageUrl); }
  return { embed, screenshotMedia };
}

async function announceGame(gameId) {
  const payload = await buildGameResultPayload(gameId); if (!payload) return;
  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID); if (!channel) { console.error('Could not find target channel', DISCORD_CHANNEL_ID); return; }
  const built = await buildEmbed(payload, channel.guild); const messagePayload = { embeds: [built.embed] };
  if (built.screenshotMedia?.attachment) { messagePayload.files = [built.screenshotMedia.attachment]; }
  else if (built.screenshotMedia?.tooLarge) { messagePayload.content = 'Image was too big for Discord. Check https://dunestats.cc/matches for the screenshot.'; }
  await channel.send(messagePayload);
  console.log('Announced game', gameId);
}

function scheduleAnnouncement(gameId) {
  if (pendingGames.has(gameId)) return;
  pendingGames.add(gameId);
  setTimeout(async () => {
    pendingGames.delete(gameId);
    try { await announceGame(gameId); } catch (err) { console.error('Error announcing game', gameId, err); }
  }, GAME_ROWS_WAIT_MS);
}

function startRealtimeListener() {
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); }
  realtimeChannel = supabase.channel('game_results_inserts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_results' }, (payload) => {
    const gameId = payload && payload.new ? payload.new.game_id : null; if (gameId) scheduleAnnouncement(gameId);
  }).subscribe((status, err) => {
    console.log('Supabase realtime subscription status:', status);
    if (status === 'SUBSCRIBED') { realtimeRetryCount = 0; return; }
    if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
      if (err) { console.error('Realtime error:', err); }
      if (realtimeRetryCount >= REALTIME_MAX_RETRIES) { console.error('Realtime failed after max retries'); return; }
      realtimeRetryCount += 1; const delay = REALTIME_RETRY_DELAY_MS * realtimeRetryCount;
      setTimeout(startRealtimeListener, delay);
    }
  });
}

function startGlobalDatabaseListener() {
  supabase
    .channel('global_db_sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      async (payload) => {
        const { table, eventType, new: newRecord } = payload;
        if (!newRecord) return;
        console.log(`📡 Real-time DB Event [${eventType}] on table [${table}]`);

        if (table === 'tournament_registrations') {
          if (newRecord.active_on_discord === true && Number(newRecord.tournament_num) === TARGET_TOURNAMENT_NUM) {
            await syncSingleUserRole(newRecord.discord_username, TOURNAMENT_ROLE_ID, true);
          } else if (newRecord.active_on_discord === false || Number(newRecord.tournament_num) !== TARGET_TOURNAMENT_NUM) {
            await syncSingleUserRole(newRecord.discord_username, TOURNAMENT_ROLE_ID, false);
          }
        }

        if (table === 'player_sp' && eventType === 'UPDATE') {
          if (newRecord.is_claimed === true) {
            const { data: mapRecord } = await supabase
              .from('player_discord_map')
              .select('discord_user_id')
              .eq('player_key', newRecord.player_key)
              .single();

            const targetDiscordId = mapRecord?.discord_user_id;
            if (targetDiscordId) {
              await syncPlayerSpRole(targetDiscordId, Number(newRecord.lifetime_sp));
            }
          }
        }

        if (table === 'sp_events' && eventType === 'INSERT') {
          try {
            const event = newRecord;
            const { data: mapRecord } = await supabase
              .from('player_discord_map')
              .select('discord_user_id')
              .eq('player_key', event.player_key)
              .single();

            const targetDiscordId = mapRecord?.discord_user_id;
            const notificationChannel = await discordClient.channels.fetch(SP_NOTIFICATION_CHANNEL_ID).catch(() => null);

            if (notificationChannel && targetDiscordId) {
              let displayAction = formatActionType(event.action_type);
              let rewardClarity = 'Standard Reward';
              if (event.action_type === 'daily_first_message') {
                rewardClarity = 'Daily Bonus (First message of the day)';
              } else if (event.action_type === 'first_live_game') {
                rewardClarity = 'Daily Bonus (First live game of the day)';
              } else if (event.action_type === 'first_weekly_async') {
                rewardClarity = 'Weekly Bonus (First async game of the week)';
              } else if (event.action_type === 'image_upload') {
                rewardClarity = 'Standard Reward';
                displayAction = 'Recruitment Proof Posted';
              } else if (event.action_type === 'match_start_base') {
                rewardClarity = 'Standard Reward';
              }

              const alertEmbed = new EmbedBuilder()
                .setTitle('🪙 Strategy Points Earned!')
                .setDescription(`Congratulations <@${targetDiscordId}>!\nYou've earned a **${rewardClarity}**!`)
                .setColor(0xf1c40f)
                .addFields(
                  { name: '✨ Action', value: `\`${displayAction}\``, inline: true },
                  { name: '💰 Reward', value: `**+${event.amount} SP**`, inline: true }
                )
                .setTimestamp();

              await notificationChannel.send({ content: `<@${targetDiscordId}>`, embeds: [alertEmbed] });
            }
          } catch (err) {
            console.error('Failed to dispatch real-time SP notification alert:', err);
          }
        }
      }
    )
    .subscribe();
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
    if (shouldHaveRole && !hasRole) {
      await member.roles.add(role);
      console.log(`✅ Automated Sync: Added ${role.name} to ${member.user.tag}`);
    } else if (!shouldHaveRole && hasRole) {
      await member.roles.remove(role);
      console.log(`❌ Automated Sync: Removed ${role.name} from ${member.user.tag}`);
    }
  } catch (err) {
    console.error(`Error executing automated sync for ${discordUsername}:`, err);
  }
}

async function syncPlayerSpRole(discordUserId, lifetimeSp) {
  if (!discordUserId) return;
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return;

    const targetRoleConfig = SP_ROLES_CONFIG.find(role => lifetimeSp >= role.min);
    if (!targetRoleConfig) return;

    const allRoleIds = SP_ROLES_CONFIG.map(r => r.id);
    const rolesToRemove = allRoleIds.filter(id => id !== targetRoleConfig.id && member.roles.cache.has(id));
    const shouldAddTarget = !member.roles.cache.has(targetRoleConfig.id);

    if (rolesToRemove.length > 0) {
      for (const roleId of rolesToRemove) {
        await member.roles.remove(roleId).catch(() => null);
      }
    }

    if (shouldAddTarget) {
      const targetRole = guild.roles.cache.get(targetRoleConfig.id);
      if (targetRole) {
        await member.roles.add(targetRole).catch(() => null);
        console.log(`🎖️ SP Promotion: Assigned ${targetRole.name} to ${member.user.tag} (${lifetimeSp} SP)`);
      }
    }
  } catch (err) {
    console.error(`Failed executing unified SP tier validation loops for user ID ${discordUserId}:`, err);
  }
}

async function executeGlobalSpAuditSweep() {
  console.log('🧼 Starting comprehensive background SP role synchronization sweep...');
  try {
    const { data: claimedSpRecords, error: spError } = await supabase
      .from('player_sp')
      .select('player_key, lifetime_sp')
      .eq('is_claimed', true);

    if (spError || !claimedSpRecords || !claimedSpRecords.length) return;

    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    if (!guild) return;

    for (const record of claimedSpRecords) {
      let { data: mapRecord } = await supabase
        .from('player_discord_map')
        .select('id, discord_user_id, discord_username, display_name, username')
        .eq('player_key', record.player_key)
        .maybeSingle();

      let discordId = mapRecord?.discord_user_id;

      if (!discordId && mapRecord) {
        const searchNames = [
          mapRecord.discord_username,
          mapRecord.display_name,
          mapRecord.username,
          record.player_key
        ].filter(Boolean);

        const member = await searchGuildMemberByNames(guild, searchNames);
        if (member) {
          discordId = member.id;
          console.log(`🔗 Sweep Auto-Link: Mapped unclaimed ID for "${record.player_key}" -> ${member.user.tag}`);
          await persistDiscordUserId(mapRecord, member.id);
        }
      }

      if (discordId) {
        await syncPlayerSpRole(discordId, Number(record.lifetime_sp));
      }
    }
    console.log('🏁 Global background validation check complete.');
  } catch (err) {
    console.error('Critical failure running background validation sweeps:', err);
  }
}

async function runInitialDatabaseSync() {
  console.log('🔄 Running initial boot-time synchronization scan...');
  try {
    const { data: activeRegs, error } = await supabase
      .from('tournament_registrations')
      .select('discord_username')
      .eq('tournament_num', TARGET_TOURNAMENT_NUM)
      .eq('active_on_discord', true);
    if (error) throw error;
    if (activeRegs && activeRegs.length) {
      console.log(`Found ${activeRegs.length} existing active registrations. Processing profiles...`);
      for (const reg of activeRegs) {
        await syncSingleUserRole(reg.discord_username, TOURNAMENT_ROLE_ID, true);
      }
    }

    await executeGlobalSpAuditSweep();
    console.log('🏁 Boot-time verification sweep complete.');
  } catch (err) {
    console.error('Failed executing initial boot-time scan:', err);
  }
}

function getAsyncDuneEmoji(guild, isLive = false) {
  if (!guild || !guild.emojis || !guild.emojis.cache) return isLive ? '⚔️' : '🎲';
  const targetName = isLive ? 'LiveDune' : 'AsyncDune';
  const emoji = guild.emojis.cache.find((e) => e.name === targetName);
  return emoji ? emoji.toString() : (isLive ? '⚔️' : '🎲');
}

async function getPlayerProfileFromDiscord(discordUserId, memberObject = null) {
  if (!discordUserId) return null;

  let { data, error } = await supabase
    .from('player_discord_map')
    .select('player_key, claimed_by, id, discord_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();

  if (data) {
    return { playerKey: data.player_key, userId: data.claimed_by };
  }

  let member = memberObject;
  if (!member) {
    try {
      const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
      member = await guild.members.fetch(discordUserId).catch(() => null);
    } catch (err) {
      console.error(`Failed to fetch guild member metadata for fallback mapping on ID ${discordUserId}:`, err);
    }
  }

  if (!member) return null;

  const candidates = [
    member.user?.username,
    member.user?.globalName,
    member.displayName,
    member.nickname
  ].filter(Boolean);

  const orFilters = [
    ...candidates.map((value) => `discord_username.ilike.${value}`),
    ...candidates.map((value) => `username.ilike.${value}`),
    ...candidates.map((value) => `display_name.ilike.${value}`)
  ];

  const { data: searchData, error: searchError } = await supabase
    .from('player_discord_map')
    .select('player_key, claimed_by, id, username, discord_username, display_name, discord_user_id')
    .or(orFilters.join(','))
    .limit(10);

  if (searchError || !searchData || !searchData.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const row of searchData) {
    const score = Math.max(
      ...candidates.flatMap((candidate) => [
        similarity(candidate, row.player_key),
        similarity(candidate, row.display_name),
        similarity(candidate, row.username),
        similarity(candidate, row.discord_username)
      ])
    );

    if (score > bestScore) {
      bestMatch = row;
      bestScore = score;
    }
  }

  if (bestMatch && bestScore >= DB_MATCH_THRESHOLD) {
    console.log(`🔗 Auto-Linking Map: Resolved ${member.user.tag} to database player "${bestMatch.player_key}" (Score: ${bestScore.toFixed(2)})`);
    await persistDiscordUserId(bestMatch, discordUserId);
    return { playerKey: bestMatch.player_key, userId: bestMatch.claimed_by };
  }

  return null;
}

function formatActionType(action) {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function awardSP(playerKey, userId, actionType, amount, metadata = {}) {
  try {
    const { error: eventError } = await supabase
      .from('sp_events')
      .insert({
        player_key: playerKey,
        user_id: userId || null,
        action_type: actionType,
        amount: amount,
        metadata: metadata
      });

    if (eventError) throw eventError;

    const { data: currentSp, error: selectError } = await supabase
      .from('player_sp')
      .select('lifetime_sp, seasonal_sp')
      .eq('player_key', playerKey)
      .single();

    if (selectError) throw selectError;

    const newLifetime = (currentSp?.lifetime_sp || 0) + amount;
    const newSeasonal = (currentSp?.seasonal_sp || 0) + amount;

    const { error: updateError } = await supabase
      .from('player_sp')
      .update({
        lifetime_sp: newLifetime,
        seasonal_sp: newSeasonal,
        updated_at: new Date().toISOString()
      })
      .eq('player_key', playerKey);

    if (updateError) throw updateError;

    console.log(`🪙 Awarded +${amount} SP to ${playerKey} for ${actionType}`);
  } catch (err) {
    console.error(`Failed to award SP to ${playerKey}:`, err);
  }
}

discordClient.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = slashCommands.get(interaction.commandName); if (!command) return;
    try {
      await command.execute(interaction, { supabase, discordClient });
    } catch (error) {
      console.error(`Error running /${interaction.commandName}:`, error);
      const message = 'Something went wrong while processing the command.';
      if (interaction.deferred || interaction.replied) { await interaction.editReply({ content: message }).catch(() => {}); }
      else { await interaction.reply({ content: message, ephemeral: true }).catch(() => {}); }
    }
    return;
  }
});

discordClient.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    const profile = await getPlayerProfileFromDiscord(message.author.id);
    if (!profile) return; 

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const { data: dailyTextEvents, error: textErr } = await supabase
      .from('sp_events')
      .select('id')
      .eq('player_key', profile.playerKey)
      .eq('action_type', 'daily_first_message')
      .gte('created_at', startOfToday);

    if (!textErr && (!dailyTextEvents || dailyTextEvents.length === 0)) {
      await awardSP(
        profile.playerKey,
        profile.userId,
        'daily_first_message',
        SP_REWARDS_CONFIG.DAILY_FIRST_MESSAGE.amount,
        { discord_user_id: message.author.id, channel_id: message.channel.id }
      );
    }

    const attachments = Array.from(message.attachments.values());
    const hasImage = attachments.some(attachment => 
      (attachment.contentType && attachment.contentType.startsWith('image/')) || 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.url)
    );

    if (message.channel.id === IMAGE_UPLOADS_CHANNEL_ID && hasImage) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

      const { data: recentImageEvents, error: imgErr } = await supabase
        .from('sp_events')
        .select('id')
        .eq('player_key', profile.playerKey)
        .eq('action_type', 'image_upload')
        .gte('created_at', oneHourAgo);

      if (!imgErr && (!recentImageEvents || recentImageEvents.length === 0)) {
        await awardSP(
          profile.playerKey,
          profile.userId,
          'image_upload',
          SP_REWARDS_CONFIG.IMAGE_UPLOAD.amount,
          { discord_user_id: message.author.id, message_id: message.id }
        );
      }
    }
  } catch (err) {
    console.error('Error processing message for SP triggers:', err);
  }
});

discordClient.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error('Failed to resolve partial unreaction structure:', err);
        return;
      }
    }

    const message = reaction.message;
    const { data: lobby, error: fetchErr } = await supabase.from('active_async_matches').select('*').eq('message_id', message.id).single();
    if (fetchErr || !lobby || lobby.status !== 'searching') return;

    const isLiveLobby = lobby.expires_at !== null || (message.embeds[0] && message.embeds[0].title && message.embeds[0].title.includes('Live'));
    const joinEmojiString = getAsyncDuneEmoji(message.guild, isLiveLobby);

    const emoji = reaction.emoji.name || reaction.emoji;
    const isJoinEmoji = emoji === 'AsyncDune' || emoji === 'LiveDune' || 
                        reaction.emoji.toString().includes('AsyncDune') || reaction.emoji.toString().includes('LiveDune') ||
                        emoji === '🎲' || emoji === '⚔️';

    let players = [...(lobby.player_ids || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    const guestPlayers = [...(lobby.guest_players || [])];
    let shouldUpdate = false;

    if (isJoinEmoji) {
      if (!players.includes(user.id)) {
        const totalCount = players.length + guestPlayers.length;
        if (totalCount < 4) {
          players.push(user.id);
          shouldUpdate = true;
          if (notifications.length > 0) {
            await message.channel.send({ content: `🔔 ${notifications.map(id => `<@${id}>`).join(' ')}, **${user.username}** joined the lobby!` }).catch(() => {});
          }
        } else {
          await reaction.users.remove(user.id).catch(() => {});
        }
      }
    }

    if (emoji === '🎮') {
      const totalCount = players.length + guestPlayers.length;
      if (players.includes(user.id) && totalCount >= 2) {
        await supabase.from('active_async_matches').update({ status: 'started' }).eq('id', lobby.id);
        const embed = EmbedBuilder.from(message.embeds[0]);

        const mentionsList = players.map(id => `• <@${id}>${notifications.includes(id) ? ' 🔔' : ''}`);
        const guestsList = guestPlayers.map(name => `• ${name} 👥`);
        const finalRosterDisplay = [...mentionsList, ...guestsList].join('\n');

        const originalDetailsSentence = String(message.embeds[0].fields[0].value).split('\n')[0];
        const cleanStartedSentence = originalDetailsSentence.replace('is looking', 'was looking');

        const matchTypeTitle = isLiveLobby ? '🏁 Live Match Started!' : '🏁 Async Match Started!';

        embed.setTitle(matchTypeTitle)
             .setColor(0x2ecc71)
             .setFooter(null) 
             .setFields(
               { name: '📝 Match Details', value: cleanStartedSentence, inline: false }, 
               { name: '🔑 Password', value: lobby.lobby_password ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
               { name: `👥 Final Roster (${totalCount}/4)`, value: finalRosterDisplay, inline: false }
             );

        const labelMatchId = lobby.match_id ? ` [ID: ${lobby.match_id}]` : '';
        await message.edit({ content: `🚀 **The match${labelMatchId} has officially begun! Good luck, commanders!**\nPlayers: ${players.map(id => `<@${id}>`).join(', ')}`, embeds: [embed] }).catch(() => {});

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

        const currentUtcDay = now.getUTCDay(); 
        const sundayDistanceMs = currentUtcDay * 24 * 60 * 60 * 1000;
        const startOfThisWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - sundayDistanceMs).toISOString();

        const unlinkedPlayers = [];

        for (const playerId of players) {
          const profile = await getPlayerProfileFromDiscord(playerId);
          
          if (!profile) {
            let potentialSp = SP_REWARDS_CONFIG.MATCH_START_BASE.amount; 
            if (isLiveLobby) {
              potentialSp += SP_REWARDS_CONFIG.FIRST_DAILY_LIVE.amount; 
            } else {
              potentialSp += SP_REWARDS_CONFIG.FIRST_WEEKLY_ASYNC.amount; 
            }
            
            unlinkedPlayers.push({ id: playerId, points: potentialSp });
            continue;
          }

          const { data: hourlyMatchEvents } = await supabase
            .from('sp_events')
            .select('id')
            .eq('player_key', profile.playerKey)
            .eq('action_type', 'match_start_base')
            .gte('created_at', oneHourAgo);

          if (!hourlyMatchEvents || hourlyMatchEvents.length === 0) {
            await awardSP(
              profile.playerKey,
              profile.userId,
              'match_start_base',
              SP_REWARDS_CONFIG.MATCH_START_BASE.amount,
              { discord_user_id: playerId, match_id: lobby.id }
            );
          }

          if (isLiveLobby) {
            const { data: dailyLiveEvents } = await supabase
              .from('sp_events')
              .select('id')
              .eq('player_key', profile.playerKey)
              .eq('action_type', 'first_live_game')
              .gte('created_at', startOfToday);

            if (!dailyLiveEvents || dailyLiveEvents.length === 0) {
              await awardSP(
                profile.playerKey,
                profile.userId,
                'first_live_game',
                SP_REWARDS_CONFIG.FIRST_DAILY_LIVE.amount,
                { discord_user_id: playerId, match_id: lobby.id }
              );
            }
          }

          if (!isLiveLobby) {
            const { data: weeklyAsyncEvents } = await supabase
              .from('sp_events')
              .select('id')
              .eq('player_key', profile.playerKey)
              .eq('action_type', 'first_weekly_async')
              .gte('created_at', startOfThisWeek);

            if (!weeklyAsyncEvents || weeklyAsyncEvents.length === 0) {
              await awardSP(
                profile.playerKey,
                profile.userId,
                'first_weekly_async',
                SP_REWARDS_CONFIG.FIRST_WEEKLY_ASYNC.amount,
                { discord_user_id: playerId, match_id: lobby.id }
              );
            }
          }
        }

        if (unlinkedPlayers.length > 0) {
          const warningLines = unlinkedPlayers.map(p => `• <@${p.id}> could have gotten **+${p.points} Strategy Points**!`);
          
          const warningEmbed = new EmbedBuilder()
            .setTitle('⚠️ Missed Strategy Points!')
            .setDescription(
              `${warningLines.join('\n')}\n\nLink your Discord account on [dunestats.cc](https://dunestats.cc) now to start claiming your rewards and climb the ranks!`
            )
            .setColor(0xe74c3c); 

          await message.channel.send({ embeds: [warningEmbed] }).catch(() => {});
        }

        return;
      }
    }

    if (emoji === '❌' && user.id === lobby.host_id) {
      await supabase.from('active_async_matches').update({ status: 'cancelled' }).eq('id', lobby.id);
      const embed = EmbedBuilder.from(message.embeds[0]);
      embed.setTitle('❌ Lobby Cancelled')
           .setColor(0xff0000)
           .setDescription(`This lobby was cancelled by ${user.username}`);
      await message.edit({ content: `🚫 **Lobby cancelled by ${user.username}**`, embeds: [embed] }).catch(() => {});
      return;
    }

    if (emoji === '🔔') {
      if (!notifications.includes(user.id)) {
        notifications.push(user.id);
        shouldUpdate = true;
      }
    }

    if (emoji === '📢') {
      const now = new Date();
      const lastTagged = lobby.last_tagged_at ? new Date(lobby.last_tagged_at) : null;

      if (lastTagged && (now.getTime() - lastTagged.getTime() < TAG_COOLDOWN_MS)) {
        const nextAvailableTime = Math.floor((lastTagged.getTime() + TAG_COOLDOWN_MS) / 1000);
        await reaction.users.remove(user.id).catch(() => {});

        const cooldownMsg = await message.reply({ content: `⏳ Tag is on cooldown. Next ping available <t:${nextAvailableTime}:R>` }).catch(() => {});
        setTimeout(() => {
          cooldownMsg.delete().catch(() => {});
        }, 5000);
        return;
      }

      await supabase.from('active_async_matches').update({ last_tagged_at: now.toISOString() }).eq('id', lobby.id);

      let targetRole;
      let roleMention;
      if (isLiveLobby) {
        roleMention = `<@&1219666679764877424>`; 
      } else {
        targetRole = message.guild?.roles.cache.find(r => r.name === 'DuneASYNC');
        roleMention = targetRole ? `<&${targetRole.id}>` : '@DuneASYNC';
      }

      const cleanDetailsLine = String(message.embeds[0].fields[0].value).split('\n')[0];
      const nextAvailableTime = Math.floor((now.getTime() + TAG_COOLDOWN_MS) / 1000);

      const totalCount = players.length + guestPlayers.length;
      const labelMatchId = lobby.match_id ? `[ID: ${lobby.match_id}] ` : '';
      const tagMessage = `🎲 Match ${labelMatchId}looking for players (${totalCount}/4) ${roleMention} ${joinEmojiString}!\nDetails: ${cleanDetailsLine}\nNext ping available in: <t:${nextAvailableTime}:R>`;

      const allowedMentionsOptions = isLiveLobby ? { roles: ['1219666679764877424'] } : { roles: [targetRole?.id].filter(Boolean) };

      await message.channel.send({ content: tagMessage, allowedMentions: allowedMentionsOptions });
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    if (shouldUpdate) {
      await supabase.from('active_async_matches').update({ player_ids: players, notify_user_ids: notifications }).eq('id', lobby.id);

      const embed = EmbedBuilder.from(message.embeds[0]);

      const mentionsList = players.map(id => `• <@${id}>${notifications.includes(id) ? ' 🔔' : ''}`);
      const guestsList = guestPlayers.map(name => `• ${name} 👥`);
      const fullRosterDisplay = [...mentionsList, ...guestsList].join('\n');
      const totalCount = players.length + guestPlayers.length;

      embed.setFields(
        { name: message.embeds[0].fields[0].name, value: message.embeds[0].fields[0].value, inline: false },
        { name: '🔑 Password', value: lobby.lobby_password ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
        { name: `👥 Players (${totalCount}/4)`, value: fullRosterDisplay, inline: false },
        { name: message.embeds[0].fields[3].name, value: message.embeds[0].fields[3].value, inline: false }
      );

      await message.edit({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Error handling reaction:', err);
  }
});

discordClient.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error('Failed to resolve partial unreaction structure:', err);
        return;
      }
    }

    const message = reaction.message;
    const { data: lobby, error: fetchErr } = await supabase.from('active_async_matches').select('*').eq('message_id', message.id).single();
    if (fetchErr || !lobby || lobby.status !== 'searching') return;

    const emoji = reaction.emoji.name || reaction.emoji;
    const isJoinEmoji = emoji === 'AsyncDune' || emoji === 'LiveDune' || 
                        reaction.emoji.toString().includes('AsyncDune') || reaction.emoji.toString().includes('LiveDune') ||
                        emoji === '🎲' || emoji === '⚔️';

    let players = [...(lobby.player_ids || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    const guestPlayers = [...(lobby.guest_players || [])];
    let shouldUpdate = false;

    if (isJoinEmoji) {
      if (players.includes(user.id)) {
        players = players.filter(id => id !== user.id);
        notifications = notifications.filter(id => id !== user.id);
        shouldUpdate = true;
      }
    }

    if (emoji === '🔔') {
      if (notifications.includes(user.id)) {
        notifications = notifications.filter(id => id !== user.id);
        shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      await supabase.from('active_async_matches').update({ player_ids: players, notify_user_ids: notifications }).eq('id', lobby.id);

      const embed = EmbedBuilder.from(message.embeds[0]);

      const mentionsList = players.map(id => `• <@${id}>${notifications.includes(id) ? ' 🔔' : ''}`);
      const guestsList = guestPlayers.map(name => `• ${name} 👥`);
      const fullRosterDisplay = [...mentionsList, ...guestsList].join('\n');
      const totalCount = players.length + guestPlayers.length;

      embed.setFields(
        { name: message.embeds[0].fields[0].name, value: message.embeds[0].fields[0].value, inline: false },
        { name: '🔑 Password', value: lobby.lobby_password ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
        { name: `👥 Players (${totalCount}/4)`, value: fullRosterDisplay, inline: false },
        { name: message.embeds[0].fields[3].name, value: message.embeds[0].fields[3].value, inline: false }
      );

      await message.edit({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Error handling reaction remove:', err);
  }
});

discordClient.once('clientReady', async () => {
  console.log('Logged in as', discordClient.user.tag);
  startRealtimeListener();
  startGlobalDatabaseListener();
  await runInitialDatabaseSync();

  setInterval(async () => {
    await executeGlobalSpAuditSweep();
  }, 24 * 60 * 60 * 1000);

  if (DISCORD_CLIENT_ID && DISCORD_GUILD_ID) {
    try {
      const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
      const commands = Array.from(slashCommands.values()).map(c => c.data.toJSON());
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });
      console.log('Successfully registered all commands internally.');
    } catch (error) { console.error('Failed to register commands internally:', error); }
  }
});

discordClient.login(DISCORD_BOT_TOKEN);
