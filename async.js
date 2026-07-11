const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('async')
    .setDescription('Look for opponents for an asynchronous game')
    .addStringOption(option =>
      option.setName('notes')
        .setDescription('Any extra details or text right after the command')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('board')
        .setDescription('Choose game base variant')
        .setRequired(false)
        .addChoices(
          { name: 'Base Game', value: 'Base' },
          { name: 'Uprising', value: 'Uprising' }
        )
    )
    .addStringOption(option =>
      option.setName('expansion')
        .setDescription('Select expansion packages')
        .setRequired(false)
        .addChoices(
          { name: 'Rise of Ix', value: 'Ix' },
          { name: 'Immortality', value: 'Immortality' },
          { name: 'Ix + Immortality', value: 'Both' },
          { name: 'Epic Mode', value: 'Epic' }
        )
    )
    .addStringOption(option =>
      option.setName('password')
        .setDescription('Optional lobby password')
        .setRequired(false)
    ),

  async execute(interaction, { supabase }) {
    const notes = interaction.options.getString('notes') || 'Looking for an async match!';
    const board = interaction.options.getString('board') || 'Not Specified';
    const expansion = interaction.options.getString('expansion') || 'None';
    const password = interaction.options.getString('password') || 'None';
    const host = interaction.user;

    const guild = interaction.guild;
    const getCustomEmoji = (name, fallback) => {
      if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
      const emoji = guild.emojis.cache.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    let expansionDisplay = expansion;
    if (expansion === 'Ix') expansionDisplay = `${getCustomEmoji('Ix', 'Ix')} Rise of IX`;
    if (expansion === 'Immortality') expansionDisplay = `${getCustomEmoji('Immo', 'Immo')} Immortality`;
    if (expansion === 'Epic') expansionDisplay = `${getCustomEmoji('Epic', 'Epic')} Epic Mode`;

    let boardDisplay = board;
    if (board === 'Uprising') boardDisplay = `${getCustomEmoji('Uprising', 'Uprising')} Uprising`;

    const embed = new EmbedBuilder()
      .setTitle(`🎲 New Async Match Open!`)
      .setDescription(`"${notes}"`)
      .setColor(0x3498db)
      .addFields(
        { name: '👤 Host', value: `${host}`, inline: true },
        { name: '🗺️ Board', value: boardDisplay, inline: true },
        { name: '🔌 Expansion', value: expansionDisplay, inline: true },
        { name: '🔑 Password', value: password === 'None' ? '🔓 Public' : `\`${password}\``, inline: false },
        { name: '👥 Players (1/4)', value: `• ${host}`, inline: false },
        { name: '🔔 Notifications Active For', value: '—', inline: false }
      )
      .setFooter({ text: 'Lobbies time out automatically if unstarted after 15 hours.' })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('async_join').setLabel('Join Match').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('async_leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('async_start').setLabel('Start Game').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('async_cancel').setLabel('Cancel Lobby').setStyle(ButtonStyle.Danger)
    );

    const utilityRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('async_toggle_bell').setLabel('Toggle Ping Alerts').setEmoji('🔔').setStyle(ButtonStyle.Secondary)
    );

    // Fixed implementation using fetchReply for discord.js v14 compatibility
    const response = await interaction.reply({
      embeds: [embed],
      components: [actionRow, utilityRow],
      fetchReply: true
    });

    await supabase
      .from('active_async_matches')
      .insert({
        message_id: response.id,
        channel_id: interaction.channelId,
        guild_id: interaction.guildId,
        host_id: host.id,
        player_ids: [host.id],
        notify_user_ids: [],
        message_text: notes,
        lobby_password: password !== 'None' ? password : null,
        board_type: boardDisplay,
        expansions: expansion !== 'None' ? [expansionDisplay] : [],
        status: 'searching'
      });
  }
};
