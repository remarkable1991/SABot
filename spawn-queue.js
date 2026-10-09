const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawn-queue')
    .setDescription('Spawns the permanent Automated Matchmaking Queue message')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (interaction.channelId !== '1558128709523996763') {
      return interaction.reply({ content: '❌ This command can only be run in the dedicated queue channel (<#1558128709523996763>).', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Automated League Matchmaking Queue')
      .setDescription(
        'Select a mode below to enter the queue.\n\n' +
        '• When a queue reaches **4/4**, an official League match will automatically generate using the active season format!\n' +
        '• Click **Host Custom** to instantly start a match and pull any players currently waiting.'
      )
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
    await interaction.reply({ content: '✅ Queue message created successfully.', flags: MessageFlags.Ephemeral });
  }
};
