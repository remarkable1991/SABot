const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const LOOKUP_THRESHOLD = 0.72;

// --- CONFIGURATION PER TOURNAMENT ---
const TOURNAMENTS_CONFIG = {
  15: {
    registeredRoleId: '1525805277662679121',
    checkInRoleId: '1533798975138828359',
    checkInStartTimestamp: 1786194000,   // Aug 8, 2026 15:00 CEST
    tournamentStartTimestamp: 1786280400 // Aug 9, 2026 15:00 CEST
  },
  16: {
    registeredRoleId: '1266076612424634571',
    checkInRoleId: '1533798669923647588',
    checkInStartTimestamp: 1786698000,   // Aug 14, 2026 11:00 CEST
    tournamentStartTimestamp: 1786784400 // Aug 15, 2026 11:00 CEST
  }
};

const TARGET_TOURNAMENT_NUMS = Object.keys(TOURNAMENTS_CONFIG).map(Number);

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
  for (let j = 0; j <= j + 1; j++) dp[0][j] = j;

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

async function fetchTournamentRegistrations(supabase, discordUser) {
  if (!discordUser) return [];

  const candidates = [
    discordUser.username,
    discordUser.globalName,
    discordUser.displayName,
    discordUser.tag
  ].filter(Boolean);

  const orFilters = [
    ...candidates.map((value) => `discord_username.ilike.%${value}%`)
  ];

  const { data, error } = await supabase
    .from('tournament_registrations')
    .select('id, discord_username, direwolf_name, tournament_num, active_on_discord')
    .in('tournament_num', TARGET_TOURNAMENT_NUMS)
    .eq('active_on_discord', true)
    .or(orFilters.join(','));

  if (error) throw error;
  if (!data || !data.length) return [];

  const matchedRegistrations = [];

  for (const tNum of TARGET_TOURNAMENT_NUMS) {
    const tRows = data.filter(row => Number(row.tournament_num) === tNum);
    let best = null;
    let bestScore = 0;

    for (const row of tRows) {
      const score = Math.max(
        ...candidates.map((candidate) => similarity(candidate, row.discord_username))
      );

      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }

    if (best && bestScore >= LOOKUP_THRESHOLD) {
      matchedRegistrations.push(best);
    }
  }

  return matchedRegistrations;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Verify registration status and check tournament stats'),

  async execute(interaction, { supabase }) {
    // PUBLIC RESPONSE DEFERRAL (Removed Ephemeral Flag)
    await interaction.deferReply();

    try {
      const guild = interaction.guild;
      const userRegistrations = await fetchTournamentRegistrations(supabase, interaction.user);

      // --- GLOBAL TOURNAMENT REGISTRATION & VERIFICATION COUNTS ---
      const { data: allActiveRegs } = await supabase
        .from('tournament_registrations')
        .select('tournament_num, active_on_discord')
        .in('tournament_num', TARGET_TOURNAMENT_NUMS)
        .eq('active_on_discord', true);

      const overviewLines = [];

      for (const tNum of TARGET_TOURNAMENT_NUMS) {
        const config = TOURNAMENTS_CONFIG[tNum];
        const registeredCount = allActiveRegs ? allActiveRegs.filter(r => Number(r.tournament_num) === tNum).length : 0;

        let verifiedCount = 0;
        if (guild && config.registeredRoleId) {
          const role = guild.roles.cache.get(config.registeredRoleId);
          if (role) {
            verifiedCount = role.members.size;
          }
        }

        overviewLines.push(`• **Tournament #${tNum}:** **${registeredCount}** Registered | **${verifiedCount}** Discord Verified ✅`);
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Tournament Status Profile')
        .setColor(userRegistrations.length > 0 ? 0x2ECC71 : 0xC9A24B)
        .addFields({
          name: '📊 Global Tournament Registrations',
          value: overviewLines.join('\n'),
          inline: false
        })
        .setTimestamp();

      embed.setDescription(`Verification status for <@${interaction.user.id}>:`);

      for (const tNum of TARGET_TOURNAMENT_NUMS) {
        const config = TOURNAMENTS_CONFIG[tNum];
        const reg = userRegistrations.find(r => Number(r.tournament_num) === tNum);

        let fieldValue = '';

        if (reg) {
          const hasCheckInRole = config.checkInRoleId ? interaction.member.roles.cache.has(config.checkInRoleId) : false;
          
          const checkInStatus = hasCheckInRole
            ? '✅ **Checked In**'
            : '❌ **Not Checked In** (Check <#1224323203011186728> when check-ins open)';

          fieldValue += `• **Status:** ✅ Registered & Active\n`;
          fieldValue += `• **Check-In:** ${checkInStatus}\n`;
          fieldValue += `• **Direwolf:** \`${reg.direwolf_name || '—'}\`\n`;
        } else {
          fieldValue += `• **Status:** ❌ Not Registered\n`;
        }

        if (config.checkInStartTimestamp) {
          fieldValue += `• **Check-In Opens:** <t:${config.checkInStartTimestamp}:F> (<t:${config.checkInStartTimestamp}:R>)\n`;
        }
        if (config.tournamentStartTimestamp) {
          fieldValue += `• **Tournament Begins:** <t:${config.tournamentStartTimestamp}:F> (<t:${config.tournamentStartTimestamp}:R>)\n`;
        }

        embed.addFields({
          name: `Tournament #${tNum}`,
          value: fieldValue,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error handling /tournament command:', error);
      await interaction.editReply({
        content: '⚠️ An error occurred while checking your tournament status. Please contact a coordinator.'
      });
    }
  }
};
