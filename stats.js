const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BRACKET_ORDER = ['overall', 'base', 'ix', 'uprising'];
const BRACKET_LABELS = {
  overall: 'Overall',
  base: 'Base',
  ix: 'Rise of Ix',
  uprising: 'Uprising'
};
const LOOKUP_THRESHOLD = 0.72;

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/[^a-z0-9]/g, '');
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const distance = dp[x.length][y.length];
  return 1 - distance / Math.max(x.length, y.length);
}

function formatPercent(wins, games) {
  const totalGames = Number(games || 0);
  if (!totalGames) return '0.0%';
  return ((Number(wins || 0) / totalGames) * 100).toFixed(1) + '%';
}

function formatElo(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(2);
}

function rankSuffix(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n)) return '#—';
  return '#' + n;
}

async function resolvePlayerByDiscordUser(supabase, discordUser) {
  if (!discordUser) return null;

  const candidates = [
    discordUser.username,
    discordUser.globalName,
    discordUser.displayName,
    discordUser.tag
  ].filter(Boolean);

  // CHANGED: Replaced claimed_by (UUID) with discord_user_id (text) to prevent 22P02 Postgres errors
  const orFilters = [
    `discord_user_id.eq.${discordUser.id}`,
    ...candidates.map((value) => `discord_username.ilike.${value}`),
    ...candidates.map((value) => `username.ilike.${value}`),
    ...candidates.map((value) => `display_name.ilike.${value}`)
  ];

  const { data, error } = await supabase
    .from('player_discord_map')
    .select('player_key, display_name, claimed_by, username, discord_username, source, discord_user_id')
    .or(orFilters.join(','))
    .limit(25);

  if (error) throw error;
  if (!data || !data.length) return null;

  // CHANGED: Prioritize the direct text snowflake ID match if it exists
  const directId = data.find((row) => row.discord_user_id === discordUser.id);
  if (directId) return directId;

  let best = null;
  let bestScore = 0;

  for (const row of data) {
    const score = Math.max(
      ...candidates.flatMap((candidate) => [
        similarity(candidate, row.player_key),
        similarity(candidate, row.display_name),
        similarity(candidate, row.username),
        similarity(candidate, row.discord_username)
      ])
    );

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (!best || bestScore < LOOKUP_THRESHOLD) return null;
  return best;
}

async function fetchRatings(supabase, playerKey) {
  const { data, error } = await supabase
    .from('player_ratings')
    .select('player_key, display_name, game_version, elo, games_played, wins, top2, total_points')
    .eq('player_key', playerKey)
    .in('game_version', BRACKET_ORDER);

  if (error) throw error;
  return data || [];
}

async function fetchRanks(supabase, playerKey) {
  const { data, error } = await supabase.rpc('get_player_ranks_for_stats', {
    p_player_key: playerKey
  });

  if (!error && data) return data;

  const { data: ratings, error: ratingsError } = await supabase
    .from('player_ratings')
    .select('player_key, game_version, elo')
    .in('game_version', BRACKET_ORDER);

  if (ratingsError) throw ratingsError;

  const byBracket = new Map();
  for (const row of ratings || []) {
    if (!byBracket.has(row.game_version)) byBracket.set(row.game_version, []);
    byBracket.get(row.game_version).push(row);
  }

  const result = [];
  for (const bracket of BRACKET_ORDER) {
    const rows = (byBracket.get(bracket) || []).sort((a, b) => Number(b.elo) - Number(a.elo));
    let currentRank = 0;
    let prevElo = null;

    rows.forEach((row, index) => {
      const elo = Number(row.elo);
      if (prevElo === null || elo !== prevElo) currentRank = index + 1;
      prevElo = elo;
      if (row.player_key === playerKey) {
        result.push({ game_version: bracket, rank: currentRank });
      }
    });
  }

  return result;
}

async function fetchFavoriteLeaders(supabase, playerKey) {
  const { data, error } = await supabase.rpc('get_player_favorite_leaders_for_stats', {
    p_player_key: playerKey
  });

  if (!error && data) return data;

  const { data: rows, error: fallbackError } = await supabase
    .from('game_results')
    .select('leader_name, placement, games!inner(game_version, has_rise_of_ix)')
    .eq('player_name', playerKey);

  if (fallbackError) throw fallbackError;

  const bucket = new Map();

  for (const row of rows || []) {
    const leader = row.leader_name || 'Unknown';
    const game = Array.isArray(row.games) ? row.games[0] : row.games;
    const gameVersion = String(game?.game_version || '').toLowerCase();
    const hasIx = Boolean(game?.has_rise_of_ix);
    const brackets = ['overall'];

    if (gameVersion === 'uprising') brackets.push('uprising');
    if (gameVersion === 'base') brackets.push('base');
    if (hasIx) brackets.push('ix');

    for (const bracket of brackets) {
      const key = `${bracket}__${leader}`;
      const current = bucket.get(key) || { game_version: bracket, leader_name: leader, plays: 0, wins: 0 };
      current.plays += 1;
      if (Number(row.placement) === 1) current.wins += 1;
      bucket.set(key, current);
    }
  }

  const result = [];
  for (const bracket of BRACKET_ORDER) {
    const leaders = Array.from(bucket.values()).filter((entry) => entry.game_version === bracket);
    leaders.sort((a, b) => b.wins - a.wins || b.plays - a.plays || a.leader_name.localeCompare(b.leader_name));
    if (leaders[0]) result.push(leaders[0]);
  }

  return result;
}

async function fetchTopOpponents(supabase, playerKey) {
  const { data, error } = await supabase.rpc('get_player_top_opponents_for_stats', {
    p_player_key: playerKey
  });

  if (!error && data) return data;

  return [];
}

function buildStatsEmbed(player, ratings, ranks, leaders, opponents) {
  const ratingMap = new Map(ratings.map((row) => [row.game_version, row]));
  const rankMap = new Map(ranks.map((row) => [row.game_version, row.rank]));
  const leaderMap = new Map(leaders.map((row) => [row.game_version, row]));
  const opponentMap = new Map();

  for (const row of opponents || []) {
    if (!opponentMap.has(row.game_version)) opponentMap.set(row.game_version, []);
    opponentMap.get(row.game_version).push(row);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Stats: ${player.display_name || player.player_key}`)
    .setColor(0xC9A24B)
    .setTimestamp(new Date())
    .setFooter({ text: 'Link your account on dunestats.cc if your stats are missing.' });

  for (const bracket of BRACKET_ORDER) {
    const rating = ratingMap.get(bracket);
    if (!rating) continue;

    const favoriteLeader = leaderMap.get(bracket);
    const opponentText = (opponentMap.get(bracket) || [])
      .slice(0, 3)
      .map((row) => `${row.opponent_name} (${row.games_played})`)
      .join(', ') || '—';

    const lines = [
      `ELO: ${formatElo(rating.elo)} • Rank: ${rankSuffix(rankMap.get(bracket))}`,
      `Win rate: ${formatPercent(rating.wins, rating.games_played)} • Games: ${Number(rating.games_played || 0)}`,
      `Favorite leader: ${favoriteLeader ? `${favoriteLeader.leader_name} (${favoriteLeader.wins}W/${favoriteLeader.plays}G)` : '—'}`,
      `Most played opponents: ${opponentText}`
    ];

    embed.addFields({
      name: BRACKET_LABELS[bracket],
      value: lines.join('\n'),
      inline: false
    });
  }

  return embed;
}

async function execute(interaction, supabase) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const player = await resolvePlayerByDiscordUser(supabase, targetUser);

  if (!player) {
    await interaction.editReply({
      content: `I couldn't find linked stats for **${targetUser.username}**. Please link your account on https://dunestats.cc to see stats.`
    });
    return;
  }

  const [ratings, ranks, leaders, opponents] = await Promise.all([
    fetchRatings(supabase, player.player_key),
    fetchRanks(supabase, player.player_key),
    fetchFavoriteLeaders(supabase, player.player_key),
    fetchTopOpponents(supabase, player.player_key)
  ]);

  if (!ratings.length) {
    await interaction.editReply({
      content: `I found **${player.display_name || player.player_key}**, but there are no stats rows yet.`
    });
    return;
  }

  const embed = buildStatsEmbed(player, ratings, ranks, leaders, opponents);
  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show Dune stats for yourself or another linked Discord user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The Discord user to look up')
        .setRequired(false)
    ),
  async execute(interaction, { supabase }) {
    await interaction.deferReply();
    await execute(interaction, supabase);
  }
};
