const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const LOOKUP_THRESHOLD = 0.72;

// Standard Rank Tier Configuration
const SP_ROLES_CONFIG = [
  { name: 'Kwisatz Haderach', min: 10000, id: '152621467311616082' },
  { name: 'Swordmaster',      min: 5000,  id: '1526218389004226640' },
  { name: 'Mentat',           min: 2500,  id: '1526218251858612274' },
  { name: 'Fedaykin',         min: 1000,  id: '1526218112054198332' },
  { name: 'Trooper',          min: 250,   id: '1526217478017908786' },
  { name: 'Spiceworker',      min: 0,     id: '1526217296501276702' }
];

// Comprehensive mapping for ALL actions (Discord Bot AND Website)
const ACTION_LABELS = {
  // --- Discord Bot Actions ---
  daily_first_message: 'Daily Message Bonus',
  image_upload:        'Recruitment Proof Posted',
  match_start_base:    'Match Lobbies Started',
  first_live_game:     'Daily Live Match Bonus',
  first_weekly_async:  'Weekly Async Match Bonus',

  // --- Website Actions ---
  daily_check_in:      'Daily Website Check-in',
  verify_match:        'Match Verified',
  report_match:        'Match Reported',
  tournament_complete: 'Tournament Completed',
  tournament_win:      'Tournament Match Win',
  semi_finals:         'Reached Semi-Finals',
  grand_finals:        'Reached Grand Finals',
  tournament_champion: 'Tournament Champion Finish',
  referral_signup:     'Referral Sign Up Payout',
  referral_milestone:  'Referral Friend Active Milestone'
};

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
  return 1 - dp[x.length][y.length] / Math.max(x.length, y.length);
}

async function resolvePlayerByDiscordUser(supabase, discordUser) {
  if (!discordUser) return null;
  const candidates = [
    discordUser.username,
    discordUser.globalName,
    discordUser.displayName,
    discordUser.tag
  ].filter(Boolean);

  const orFilters = [
    `discord_user_id.eq.${discordUser.id}`,
    ...candidates.map((value) => `discord_username.ilike.${value}`),
    ...candidates.map((value) => `username.ilike.${value}`),
    ...candidates.map((value) => `display_name.ilike.${value}`)
  ];

  const { data, error } = await supabase
    .from('player_discord_map')
    .select('player_key, display_name, claimed_by, username, discord_username, discord_user_id')
    .or(orFilters.join(','))
    .limit(25);

  if (error) throw error;
  if (!data || !data.length) return null;

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

function buildProgressBar(currentSp, currentRankIndex) {
  if (currentRankIndex === 0) {
    return '`[▰▰▰▰▰▰▰▰▰▰]` **MAX RANK REACHED**';
  }
  
  const nextRank = SP_ROLES_CONFIG[currentRankIndex - 1];
  const currentRank = SP_ROLES_CONFIG[currentRankIndex];
  
  const range = nextRank.min - currentRank.min;
  const progress = currentSp - currentRank.min;
  const percentage = Math.min(Math.max(progress / range, 0), 1);
  
  const totalSegments = 10;
  const filledSegments = Math.round(percentage * totalSegments);
  const emptySegments = totalSegments - filledSegments;
  
  const bar = '▰'.repeat(filledSegments) + '▱'.repeat(emptySegments);
  return `\`[${bar}]\` **${currentSp} / ${nextRank.min} SP**`;
}

async function fetchLeaderboardRanks(supabase, playerKey) {
  const { data, error } = await supabase
    .from('player_sp')
    .select('player_key, lifetime_sp, seasonal_sp')
    .order('lifetime_sp', { ascending: false });

  if (error || !data) return { overallRank: '—', seasonalRank: '—' };

  const overallIndex = data.findIndex(row => row.player_key === playerKey);
  const overallRank = overallIndex !== -1 ? `#${overallIndex + 1}` : '—';

  const seasonalData = [...data].sort((a, b) => Number(b.seasonal_sp || 0) - Number(a.seasonal_sp || 0));
  const seasonalIndex = seasonalData.findIndex(row => row.player_key === playerKey);
  const seasonalRank = seasonalIndex !== -1 ? `#${seasonalIndex + 1}` : '—';

  return { overallRank, seasonalRank };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sp')
    .setDescription('View detailed Strategy Points (SP) metrics and history')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The Discord user to check')
        .setRequired(false)
    ),
  async execute(interaction, { supabase }) {
    await interaction.deferReply();

    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const player = await resolvePlayerByDiscordUser(supabase, targetUser);

      if (!player) {
        await interaction.editReply({
          content: `I couldn't find a linked account for **${targetUser.username}**. Make sure to claim your profile on https://dunestats.cc first!`
        });
        return;
      }

      // 1. Fetch aggregates
      const { data: spRecord, error: spErr } = await supabase
        .from('player_sp')
        .select('lifetime_sp, seasonal_sp')
        .eq('player_key', player.player_key)
        .single();

      if (spErr || !spRecord) {
        await interaction.editReply({
          content: `No Strategy Points account found in the database for **${player.display_name || player.player_key}**.`
        });
        return;
      }

      // 2. Fetch all raw events
      const { data: rawEvents, error: eventErr } = await supabase
        .from('sp_events')
        .select('action_type')
        .eq('player_key', player.player_key);

      if (eventErr) throw eventErr;

      const eventCounts = {};
      (rawEvents || []).forEach(evt => {
        eventCounts[evt.action_type] = (eventCounts[evt.action_type] || 0) + 1;
      });

      // 3. Resolve Current Strategic Rank
      const lifetimeSp = Number(spRecord.lifetime_sp || 0);
      let currentRankIndex = SP_ROLES_CONFIG.length - 1;

      for (let i = 0; i < SP_ROLES_CONFIG.length; i++) {
        if (lifetimeSp >= SP_ROLES_CONFIG[i].min) {
          currentRankIndex = i;
          break;
        }
      }
      const currentRank = SP_ROLES_CONFIG[currentRankIndex];
      const nextRank = currentRankIndex > 0 ? SP_ROLES_CONFIG[currentRankIndex - 1] : null;

      // 4. Fetch dynamic Leaderboard Placements
      const { overallRank, seasonalRank } = await fetchLeaderboardRanks(supabase, player.player_key);

      // 5. Gather and Sort activity counts
      const aggregateList = [];
      Object.keys(ACTION_LABELS).forEach(key => {
        const count = eventCounts[key] || 0;
        if (count > 0) {
          aggregateList.push({ label: ACTION_LABELS[key], count });
        }
      });

      aggregateList.sort((a, b) => b.count - a.count);

      const aggregateDisplayLines = aggregateList.map(item => `• **${item.label}:** \`${item.count}\` times`);

      let rankDescription = `Current Rank: <@&${currentRank.id}>`;
      if (nextRank) {
        rankDescription += `\nNext Goal: <@&${nextRank.id}>`;
      }

      const spEmbed = new EmbedBuilder()
        .setTitle(`Strategy Profile: ${player.display_name || player.player_key}`)
        .setColor(0xf1c40f)
        .setDescription(rankDescription)
        .addFields(
          { name: '📊 Progress to Next Rank', value: buildProgressBar(lifetimeSp, currentRankIndex), inline: false },
          { name: '🍂 Season 1 Points', value: `**${spRecord.seasonal_sp || 0} SP**\nRank: **${seasonalRank}**`, inline: true },
          { name: '👑 Lifetime Points', value: `**${lifetimeSp} SP**\nRank: **${overallRank}**`, inline: true },
          { name: '📋 Cumulative Activity Metrics', value: aggregateDisplayLines.join('\n') || '*No recorded active stats found in the database yet.*', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Show your ranking and complete stats at https://dunestats.cc/ledger' });

      await interaction.editReply({ embeds: [spEmbed] });

    } catch (err) {
      console.error('Error executing /sp command:', err);
      await interaction.editReply({
        content: 'An error occurred while executing the command. Please try again later.'
      });
    }
  }
};
