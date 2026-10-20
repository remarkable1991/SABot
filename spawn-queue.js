const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');

function getEmoji(guild, name, fallback = '') {
  if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
  const emoji = guild.emojis.cache.find((e) => e.name === name);
  return emoji ? emoji.toString() : fallback;
}

function formatPresetWithEmojis(guild, preset) {
  if (!preset) return '**Standard Rules**';
  const parts = [];

  if (preset.board_type) {
    if (preset.board_type.toLowerCase().includes('uprising')) {
      parts.push(`${getEmoji(guild, 'Uprising', '')} **Uprising**`.trim());
    } else {
      parts.push(`**${preset.board_type}**`);
    }
  }

  const rawExps = [...(preset.expansions || [])];
  if (preset.mode && !rawExps.includes(preset.mode)) rawExps.push(preset.mode);

  for (const exp of rawExps) {
    if (exp.includes('Rise of IX') || exp === 'Ix') {
      parts.push(`${getEmoji(guild, 'Ix', '')} **Rise of IX**`.trim());
    } else if (exp.includes('Immortality') || exp === 'Immo') {
      parts.push(`${getEmoji(guild, 'Immo', '')} **Immortality**`.trim());
    } else if (exp.includes('Epic Mode') || exp === 'Epic') {
      parts.push(`${getEmoji(guild, 'Epic', '')} **Epic Mode**`.trim());
    } else if (exp.includes('CHOAM')) {
      parts.push(`${getEmoji(guild, 'CHOAM', '')} **CHOAM Module**`.trim());
    } else {
      parts.push(`**${exp}**`);
    }
  }

  return parts.join(' + ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawn-queue')
    .setDescription('Spawns the permanent Automated Matchmaking Queue message')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, { supabase, updateQueueMessage }) {
    if (interaction.channelId !== '1558128709523996763') {
      return interaction.reply({ content: '❌ This command can only be run in the dedicated queue channel (<#1558128709523996763>).', flags: MessageFlags.Ephemeral });
    }

    const now = new Date().toISOString();
    const guild = interaction.guild;

    const [{ data: currentPreset }, { data: nextPreset }] = await Promise.all([
      supabase.from('league_presets').select('*').lte('start_date', now).gt('end_date', now).order('start_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('league_presets').select('*').gt('start_date', now).order('start_date', { ascending: true }).limit(1).maybeSingle()
    ]);

    const currentDesc = formatPresetWithEmojis(guild, currentPreset);
    let rotationDetails = `🎲 **Current Active Format:**\n• ${currentDesc}`;

    if (nextPreset) {
      const nextDesc = formatPresetWithEmojis(guild, nextPreset);
      const startUnix = Math.floor(new Date(nextPreset.start_date).getTime() / 1000);
      rotationDetails += `\n\n📅 **Upcoming Format (starts <t:${startUnix}:D>):**\n• ${nextDesc} (<t:${startUnix}:R>)`;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Automated League Matchmaking Queue')
      .setDescription(
        `${rotationDetails}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Click **Play** to join an open lobby, enter the queue, or host a match.\n` +
        `• Click **Leave** to exit the queue or leave your current open lobby.`
      )
      .setColor(0xF1C40F)
      .addFields(
        { name: '🔴 Live Queue (0/4)', value: '*Queue is empty*', inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('queue_play').setLabel('Play').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('queue_leave').setLabel('Leave').setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    if (updateQueueMessage) updateQueueMessage();

    await interaction.reply({ content: '✅ Queue message created successfully.', flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
  }
};
