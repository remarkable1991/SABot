const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const LEAGUE_INFO_CHANNEL_ID = '1563165091669475499';
const POLL_CHANNEL_ID = '1221556256406507611';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawn-info')
    .setDescription('Spawns the permanent Ranked League Season Info & Top 3 Leaderboard message')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, { updateLeagueInfoMessage }) {
    if (interaction.channelId !== LEAGUE_INFO_CHANNEL_ID) {
      return interaction.reply({
        content: `❌ This command can only be run in the dedicated League Info channel (<#${LEAGUE_INFO_CHANNEL_ID}>).`,
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Ranked League — Season 1')
      .setDescription(
        `🎲 **Current Active Format:**\n• Loading...\n\n` +
        `🗳️ **Future Formats:**\n• Decided by community vote in <#${POLL_CHANNEL_ID}>!`
      )
      .setColor(0xF1C40F)
      .addFields(
        { name: '🏅 Current Top 3 Standings', value: '*Loading standings...*', inline: false },
        { name: '📊 League Activity & Season Info', value: '*Loading stats...*', inline: false }
      )
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });

    if (updateLeagueInfoMessage) {
      await updateLeagueInfoMessage();
    }

    await interaction.editReply({ content: '✅ League Info message created and synced!' });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
  }
};
