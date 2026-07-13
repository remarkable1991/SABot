const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const LOOKUP_THRESHOLD = 0.72;
const CURRENT_TOURNAMENT_NUM = 14;
const CHECK_IN_ROLE_ID = '1526157402435620964';

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

async function checkTournamentRegistration(supabase, discordUser) {
  if (!discordUser) return null;

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
    .eq('tournament_num', CURRENT_TOURNAMENT_NUM)
    .eq('active_on_discord', true)
    .or(orFilters.join(','));

  if (error) throw error;
  if (!data || !data.length) return null;

  let best = null;
  let bestScore = 0;

  for (const row of data) {
    const score = Math.max(
      ...candidates.map((candidate) => similarity(candidate, row.discord_username))
    );

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (!best || bestScore < LOOKUP_THRESHOLD) return null;
  return best;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Verify your registration status and check-in configuration parameters'),
    
  async execute(interaction, { supabase }) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const registration = await checkTournamentRegistration(supabase, interaction.user);

      if (registration) {
        // Evaluate the member's server roles directly out of the interaction context
        const hasCheckInRole = interaction.member.roles.cache.has(CHECK_IN_ROLE_ID);
        
        const checkInStatusText = hasCheckInRole 
          ? '✅ **Successfully checked in**' 
          : '❌ **Not checked in.** Please go to <#1233029532785573918> to complete the check-in process.'; 
          // Note: Adjust the channel ID placeholder above if your true #check-in channel snowflake changes

        const embed = new EmbedBuilder()
          .setTitle('🏆 Tournament Status Profile')
          .setDescription(`Your verification records for **Tournament #${CURRENT_TOURNAMENT_NUM}**:`)
          .addFields(
            { name: 'Registration Status', value: '✅ **Registered & Active**', inline: false },
            { name: 'Check-In Status', value: checkInStatusText, inline: false },
            { name: 'Discord Username', value: `\`${registration.discord_username}\``, inline: true },
            { name: 'Direwolf Handle', value: `\`${registration.direwolf_name || '—'}\``, inline: true }
          )
          .setColor(hasCheckInRole ? 0x2ECC71 : 0xF1C40F)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('❌ Registration Not Found')
          .setDescription(`We couldn't find a valid active registration for **${interaction.user.username}** under Tournament #${CURRENT_TOURNAMENT_NUM}.`)
          .addFields({ 
            name: 'Next Steps', 
            value: '• Make sure your active tournament registration form name matches your current Discord username.\n• Verify that your registration status is set to active.' 
          })
          .setColor(0xE74C3C)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error handling /tournament command:', error);
      await interaction.editReply({
        content: '⚠️ An error occurred while checking your tournament status. Please contact a coordinator.'
      });
    }
  }
};
