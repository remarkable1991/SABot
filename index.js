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

const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, userMention, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const tournamentCommand = require('./tournament');
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

// Your designated target tournament role ID
const TOURNAMENT_ROLE_ID = '1525805277662679121';
const TARGET_TOURNAMENT_NUM = 14;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  realtime: { transport: WebSocket, params: { eventsPerSecond: 10 } },
  global: { WebSocket }
});

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const slashCommands = new Map([
  [statsCommand.data.name, statsCommand],
  [asyncCommand.data.name, asyncCommand],
  [tournamentCommand.data.name, tournamentCommand]
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
  const { data: game, error: gameError } = await supabase.from('games').select('id, game_version, image_url, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders').eq('id', gameId).single();
  if (gameError || !game) { console.error('Failed to fetch game', gameId, gameError); return null; }
  const { data: results, error: resultsError } = await supabase.from('game_results').select('player_name, leader_name, placement, points, elo_delta, elo_delta_overall').eq('game_id', gameId).order('placement', { ascending: true });
  if (resultsError || !results || !results.length) { console.error('Failed to fetch results for', gameId, resultsError); return null; }
  const playerKeys = results.map((r) => String(r.player_name || '').toLowerCase());
  const { data: ratings, error: ratingsError } = await supabase.from('player_ratings').select('player_key, display_name, game_version, elo').in('player_key', playerKeys).in('game_version', ['overall', game.game_version]);
  if (ratingsError) { console.error('Failed to fetch ratings', ratingsError); }
  const ratingsMap = {};
  for (const row of ratings || []) {
    if (!ratingsMap[row.player_key]) ratingsMap[row.player_key] = {};
    ratingsMap[row.player_key][row.game_version] = row.elo;
  }
  const screenshotMedia = game.image_url ? await createDiscordImagePayload(game.image_url) : null;
  return { game, results, ratingsMap, screenshotMedia };
}

async function buildEmbed(payload, guild) {
  const game = payload.game; const results = payload.results; const ratingsMap = payload.ratingsMap; const screenshotMedia = payload.screenshotMedia;
  const modeLabel = capitalize(game.game_version || 'unknown'); const tags = buildGameTags(game, guild); const lines = [];
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
  const embed = new EmbedBuilder().setTitle('Game Finished - ' + modeLabel).setDescription(lines.join('\n\n')).setColor(0xC9A24B).setTimestamp(new Date());
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

// --- AUTOMATED REAL-TIME DISPATCHER ---
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

        // HANDLER A: Tournament Registrations
        if (table === 'tournament_registrations') {
          if (newRecord.active_on_discord === true && Number(newRecord.tournament_num) === TARGET_TOURNAMENT_NUM) {
            await syncSingleUserRole(newRecord.discord_username, TOURNAMENT_ROLE_ID, true);
          } else if (newRecord.active_on_discord === false || Number(newRecord.tournament_num) !== TARGET_TOURNAMENT_NUM) {
            await syncSingleUserRole(newRecord.discord_username, TOURNAMENT_ROLE_ID, false);
          }
        }
      }
    )
    .subscribe();
}

// --- GLOBAL ROLE ASSIGNER HELPER ---
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

// --- BOOT SCAN FOR PAST USERS ---
async function runInitialDatabaseSync() {
  console.log('🔄 Running initial boot-time synchronization scan...');
  try {
    const { data: activeRegs, error } = await supabase
      .from('tournament_registrations')
      .select('discord_username')
      .eq('tournament_num', TARGET_TOURNAMENT_NUM)
      .eq('active_on_discord', true);

    if (error) throw error;
    if (!activeRegs || !activeRegs.length) {
      console.log('No existing active registrations found to sync.');
      return;
    }

    console.log(`Found ${activeRegs.length} existing active registrations. Processing profiles...`);
    for (const reg of activeRegs) {
      await syncSingleUserRole(reg.discord_username, TOURNAMENT_ROLE_ID, true);
    }
    console.log('🏁 Boot-time verification sweep complete.');
  } catch (err) {
    console.error('Failed executing initial boot-time scan:', err);
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

  if (interaction.isButton() && interaction.customId.startsWith('async_')) {
    try {
      const { customId, user, message } = interaction;
      const { data: lobby, error: fetchErr } = await supabase.from('active_async_matches').select('*').eq('message_id', interaction.message.id).single();
      if (fetchErr || !lobby || lobby.status !== 'searching') {
        return interaction.deferUpdate().catch(() => {});
      }

      let players = [...(lobby.player_ids || [])];
      let notifications = [...(lobby.notify_user_ids || [])];
      let shouldUpdate = false;

      // New '📢 Request Players' Manual Button handling infrastructure with a strict 1-hour interval restriction rule mapping
      if (customId === 'async_ping_role') {
        const now = new Date();
        const lastPrompted = lobby.last_prompted_at ? new Date(lobby.last_prompted_at) : null;
        const oneHourMs = 60 * 60 * 1000;

        if (lastPrompted && (now.getTime() - lastPrompted.getTime() < oneHourMs)) {
          const remainingMinutes = Math.ceil((oneHourMs - (now.getTime() - lastPrompted.getTime())) / 60000);
          return interaction.reply({ content: `⏳ Cooldown active! You can ping the role again in **${remainingMinutes} minutes**.`, ephemeral: true });
        }

        await interaction.deferUpdate();
        const targetRole = interaction.guild?.roles.cache.find(r => r.name === 'DuneASYNC');
        const roleMention = targetRole ? `<@&${targetRole.id}>` : '@DuneASYNC';
        
        const broadcastText = `🎲 **Match looking for players (${players.length}/4)** ${roleMention}!\nDetails: ${message.embeds[0].fields[0].value}`;
        const pingMsg = await interaction.channel.send({ content: broadcastText, allowedMentions: { roles: [targetRole?.id].filter(Boolean) } });
        
        setTimeout(() => { pingMsg.delete().catch(() => {}); }, 3000);
        await supabase.from('active_async_matches').update({ last_prompted_at: now.toISOString() }).eq('id', lobby.id);
        return;
      }

      await interaction.deferUpdate();

      if (customId === 'async_join' && players.length < 4 && !players.includes(user.id)) {
        players.push(user.id); shouldUpdate = true;
        if (notifications.length > 0) {
          await interaction.channel.send({ content: `🔔 ${notifications.map(id => `<@${id}>`).join(' ')}, **${user.username}** joined the lobby!` }).catch(() => {});
        }
      }
      if (customId === 'async_leave' && players.includes(user.id)) {
        players = players.filter(id => id !== user.id); notifications = notifications.filter(id => id !== user.id); shouldUpdate = true;
      }
      if (customId === 'async_toggle_bell') {
        notifications = notifications.includes(user.id) ? notifications.filter(id => id !== user.id) : [...notifications, user.id]; shouldUpdate = true;
      }
      if (customId === 'async_cancel' && user.id === lobby.host_id) {
        await supabase.from('active_async_matches').update({ status: 'cancelled' }).eq('id', lobby.id);
        return message.delete().catch(() => null);
      }
      if (customId === 'async_start' && players.includes(user.id)) {
        await supabase.from('active_async_matches').update({ status: 'started' }).eq('id', lobby.id);
        const embed = EmbedBuilder.from(message.embeds[0]);
        const playerList = players.map(id => `• <@${id}>${notifications.includes(id) ? ' 🔔' : ''}`).join('\n');
        embed.setTitle('🏁 Async Match Started!').setColor(0x2ecc71).setFields(
          { name: message.embeds[0].fields[0].name, value: message.embeds[0].fields[0].value, inline: false },
          { name: '🔑 Password', value: lobby.lobby_password ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
          { name: `👥 Final Roster (${players.length}/4)`, value: playerList, inline: false }
        );
        return interaction.editReply({ content: `🚀 **The match has officially begun! Good luck, commanders!**\nPlayers: ${players.map(id => `<@${id}>`).join(', ')}`, embeds: [embed], components: [] }).catch(() => {});
      }

      if (shouldUpdate) {
        await supabase.from('active_async_matches').update({ player_ids: players, notify_user_ids: notifications }).eq('id', lobby.id);
        const embed = EmbedBuilder.from(message.embeds[0]);
        const playerList = players.map(id => `• <@${id}>${notifications.includes(id) ? ' 🔔' : ''}`).join('\n');
        embed.setFields(
          { name: message.embeds[0].fields[0].name, value: message.embeds[0].fields[0].value, inline: false },
          { name: '🔑 Password', value: lobby.lobby_password ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
          { name: `👥 Players (${players.length}/4)`, value: playerList, inline: false }
        );

        const isUserHost = user.id === lobby.host_id;
        const userInLobby = players.includes(user.id);
        const alertActive = notifications.includes(user.id);

        const primaryRow = new ActionRowBuilder();
        if (userInLobby) {
          primaryRow.addComponents(new ButtonBuilder().setCustomId('async_leave').setLabel('Leave Match').setStyle(ButtonStyle.Danger));
        } else {
          primaryRow.addComponents(new ButtonBuilder().setCustomId('async_join').setLabel('Join Match').setStyle(ButtonStyle.Primary).setDisabled(players.length >= 4));
        }
        primaryRow.addComponents(new ButtonBuilder().setCustomId('async_start').setLabel('Start Game').setStyle(ButtonStyle.Success).setDisabled(players.length < 2));
        if (isUserHost) {
          primaryRow.addComponents(new ButtonBuilder().setCustomId('async_cancel').setLabel('Cancel Lobby').setStyle(ButtonStyle.Danger));
        }

        const secondaryRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('async_toggle_bell').setLabel(alertActive ? 'Alerts: ON' : 'Alerts: OFF').setEmoji('🔔').setStyle(alertActive ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('async_ping_role').setLabel('📢 Request Players').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [primaryRow, secondaryRow] }).catch(() => {});
      }
    } catch (err) { console.error('Error handling async button trigger:', err); }
  }
});

discordClient.once('clientReady', async () => {
  console.log('Logged in as', discordClient.user.tag);
  
  // Launch all real-time event frameworks
  startRealtimeListener();
  startGlobalDatabaseListener();

  // Execute past history catch-up routine
  await runInitialDatabaseSync();

  if (DISCORD_CLIENT_ID && DISCORD_GUILD_ID) {
    try {
      const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
      const commands = Array.from(slashCommands.values()).map(c => c.data.toJSON());
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commands }
      );
      console.log('Successfully registered all commands internally.');
    } catch (error) {
      console.error('Failed to register commands internally:', error);
    }
  }
});

discordClient.login(DISCORD_BOT_TOKEN);
