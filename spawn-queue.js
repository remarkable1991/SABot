const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawn-queue')
    .setDescription('Spawns the permanent Automated Matchmaking Queue message')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Automated League Matchmaking')
      .setDescription('Click a button below to join the matchmaking queue.\n\nWhen a queue reaches **4/4 players**, a lobby will automatically generate in the League channel using the current active Seasonal Preset!\n\nYou can also click the SA button to instantly pull waiting players into your own custom lobby.')
      .setColor(0xF1C40F)
      .addFields(
        { name: '🔴 Live Queue (0/4)', value: '*Queue is empty*', inline: true },
        { name: '🔵 Async Queue (0/4)', value: '*Queue is empty*', inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('queue_live').setLabel('Queue Live').setStyle(ButtonStyle.Danger).setEmoji('1232049130151346216'),
      new ButtonBuilder().setCustomId('queue_async').setLabel('Queue Async').setStyle(ButtonStyle.Primary).setEmoji('1232048177390289097'),
      new ButtonBuilder().setCustomId('queue_host').setLabel('Host Custom').setStyle(ButtonStyle.Secondary).setEmoji('945323522140565514')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Queue message generated successfully.', flags: MessageFlags.Ephemeral });
  }
};
