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

// Map internal database action_types to clean, readable descriptions
const ACTION_LABELS = {
  daily_first_message: 'Daily Message Bonus',
  image_upload:        'Recruitment Proofs Posted',
  match_start_base:    'Match Lobbies Started',
  first_live_game:     'Daily Live Match Bonuses',
  first_weekly_async:  'Weekly Async Match Bonuses',
  daily_check_in:      'Daily Website Check-ins'
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
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
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

/**
 * Builds a visual text progress bar representing progression to the next SP rank
 */
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
  return `\`[${bar}]\` **${currentSp} / ${nextRank.min} SP** (to *${nextRank.name}*)`;
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

      // 1. Fetch current aggregates from player_sp
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

      // 2. Query all historic event counts grouped by action_type
      const { data: rawEvents, error: eventErr } = await supabase
        .from('sp_events')
        .select('action_type')
        .eq('player_key', player.player_key);

      if (eventErr) throw eventErr;

      // Deduplicate and aggregate totals
      const eventCounts = {};
      (rawEvents || []).forEach(evt => {
        eventCounts[evt.action_type] = (eventCounts[evt.action_type] || 0) + 1;
      });

      // 3. Resolve Current Strategic Rank Config
      const lifetimeSp = Number(spRecord.lifetime_sp || 0);
      let currentRankIndex = SP_ROLES_CONFIG.length - 1; // Default to lowest rank (Spiceworker)

      for (let i = 0; i < SP_ROLES_CONFIG.length; i++) {
        if (lifetimeSp >= SP_ROLES_CONFIG[i].min) {
          currentRankIndex = i;
          break;
        }
      }
      const currentRank = SP_ROLES_CONFIG[currentRankIndex];

      // Build out cumulative occurrences display block
      const aggregateLines = [];
      Object.keys(ACTION_LABELS).forEach(key => {
        const count = eventCounts[key] || 0;
        aggregateLines.push(`• **${ACTION_LABELS[key]}:** \`${count}\` times`);
      });

      // Construct final Discord Embed response
      const spEmbed = new EmbedBuilder()
        .setTitle(`Strategy Ledger: ${player.display_name || player.player_key}`)
        .setColor(0xf1c40f) // Gold color
        .addFields(
          { name: '🏆 Lifetime Ranks', value: `Current Title: **${currentRank.name}**`, inline: false },
          { name: '📊 Progression Tracker', value: buildProgressBar(lifetimeSp, currentRankIndex), inline: false },
          { name: '🍂 Season 1 Strategy Points', value: `**${spRecord.seasonal_sp || 0} SP** / \`1,000 SP\` Target`, inline: true },
          { name: '👑 Lifetime Strategy Points', value: `**${lifetimeSp} SP**`, inline: true },
          { name: '📋 Cumulative Milestone Events', value: aggregateLines.join('\n') || '*No recorded events in ledger yet*', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Check out your complete, itemized ledger at https://dunestats.cc/ledger' });

      await interaction.editReply({ embeds: [spEmbed] });

    } catch (err) {
      console.error('Error executing /sp command:', err);
      await interaction.editReply({
        content: 'An error occurred while executing the command. Please try again later.'
      });
    }
  }
};
