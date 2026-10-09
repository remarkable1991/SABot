const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');

function formatPresetDescription(preset) {
  if (!preset) return 'Standard Rules';
  const exps = preset.expansions || [];
  const parts = [];
  if (preset.board_type) parts.push(`**${preset.board_type}**`);
  if (exps.length > 0) parts.push(exps.join(', '));
  if (preset.mode) parts.push(preset.mode);
  return parts.join(' + ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawn-queue')
    .setDescription('Spawns the permanent Automated Matchmaking Queue message')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, { supabase }) {
    if (interaction.channelId !== '1558128709523996763') {
      return interaction.reply({ content: '❌ This command can only be run in the dedicated queue channel (<#1558128709523996763>).', flags: MessageFlags.Ephemeral });
    }

    const now = new Date().toISOString();

    const [{ data: currentPreset }, { data: nextPreset }] = await Promise.all([
      supabase.from('league_presets').select('*').lte('start_date', now).gt('end_date', now).order('start_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('league_presets').select('*').gt('start_date', now).order('start_date', { ascending: true }).limit(1).maybeSingle()
    ]);

    const currentDesc = formatPresetDescription(currentPreset);
    let rotationDetails = `🎲 **Current Active Format:**\n• ${currentDesc}`;

    if (nextPreset) {
      const nextDesc = formatPresetDescription(nextPreset);
      const startUnix = Math.floor(new Date(nextPreset.start_date).getTime() / 1000);
      rotationDetails += `\n\n📅 **Upcoming Format (starts <t:${startUnix}:D>):**\n• ${nextDesc} (<t:${startUnix}:R>)`;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Automated League Matchmaking Queue')
      .setDescription(
        `${rotationDetails}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Select your mode and how long you are available.\n` +
        `• When a queue reaches **4/4**, a League lobby generates automatically in <#1557473551227818024>.\n` +
        `• Click **Host Custom** (<:SA:945323522140565514>) to pull waiting players into your own lobby.`
      )
      .setColor(0xF1C40F)
      .addFields(
        { name: '🔴 Live Queue (0/4)', value: '*Queue is empty*', inline: true },
        { name: '🔵 Async Queue (0/4)', value: '*Queue is empty*', inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('queue_live_prompt').setLabel('Queue Live').setStyle(ButtonStyle.Danger).setEmoji('1232049130151346216'),
      new ButtonBuilder().setCustomId('queue_async_prompt').setLabel('Queue Async').setStyle(ButtonStyle.Primary).setEmoji('1232048177390289097'),
      new ButtonBuilder().setCustomId('queue_host').setLabel('Host Custom').setStyle(ButtonStyle.Secondary).setEmoji('945323522140565514'),
      new ButtonBuilder().setCustomId('queue_leave').setLabel('Leave Queue').setStyle(ButtonStyle.Secondary).setEmoji('🚪')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Queue message created successfully.', flags: MessageFlags.Ephemeral });
  }
};
