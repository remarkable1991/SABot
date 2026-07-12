const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('async')
    .setDescription('Look for opponents for an asynchronous game')
    // Changed option name to 'text' so it populates immediately as the primary free-flow field
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Any extra details or notes for this match')
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
    const notes = interaction.options.getString('text') || 'Looking for an async match!';
    const board = interaction.options.getString('board');
    const expansion = interaction.options.getString('expansion');
    const password = interaction.options.getString('password') || 'None';
    const host = interaction.user;

    const guild = interaction.guild;
    const getCustomEmoji = (name, fallback) => {
      if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
      const emoji = guild.emojis.cache.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    // Keep original backend/database string formatting intact
    let expansionDisplay = expansion || 'None';
    if (expansion === 'Ix') expansionDisplay = `${getCustomEmoji('Ix', 'Ix')} Rise of IX`;
    if (expansion === 'Immortality') expansionDisplay = `${getCustomEmoji('Immo', 'Immo')} Immortality`;
    if (expansion === 'Epic') expansionDisplay = `${getCustomEmoji('Epic', 'Epic')} Epic Mode`;
    if (expansion === 'Both') expansionDisplay = `Rise of IX + Immortality`;

    let boardDisplay = board || 'Not Specified';
    if (board === 'Uprising') boardDisplay = `${getCustomEmoji('Uprising', 'Uprising')} Uprising`;
    if (board === 'Base') boardDisplay = 'Base Game';

    // Parse specific emojis directly into the visual sentence builder
    const ixEmoji = getCustomEmoji('Ix', 'Rise of IX');
    const immoEmoji = getCustomEmoji('Immo', 'Immortality');
    const epicEmoji = getCustomEmoji('Epic', 'Epic Mode');
    const uprisingEmoji = getCustomEmoji('Uprising', 'Uprising');

    let expansionText = 'Expansions';
    if (expansion === 'Ix') expansionText = ixEmoji;
    if (expansion === 'Immortality') expansionText = immoEmoji;
    if (expansion === 'Epic') expansionText = epicEmoji;
    if (expansion === 'Both') expansionText = `${ixEmoji} + ${immoEmoji}`;

    let boardText = board === 'Uprising' ? uprisingEmoji : 'Base Game';

    // Build the dynamic status text using the host mention instead of plain username string
    let statusSentence = `${host} is looking for players`;
    if (board && board !== 'Base' && expansion && expansion !== 'None') {
      statusSentence += ` for ${boardText} with ${expansionText}`;
    } else if (board && board !== 'Base') {
      statusSentence += ` for ${boardText}`;
    } else if (expansion && expansion !== 'None') {
      statusSentence += ` with ${expansionText}`;
    }
    statusSentence += '.';

    const asyncDuneEmoji = getCustomEmoji('AsyncDune', '🎲');

    const embed = new EmbedBuilder()
      .setTitle(`${asyncDuneEmoji} New Async Match Open!`)
      .setDescription(`"${notes}"`)
      .setColor(0x3498db)
      .addFields(
        { name: '📝 Match Details', value: statusSentence, inline: false },
        { name: '🔑 Password', value: password === 'None' ? 'Check chat for more info' : `\`${password}\``, inline: false },
        { name: '👥 Players (1/4)', value: `• ${host}`, inline: false }
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
        expansions: expansion && expansion !== 'None' ? [expansionDisplay] : [],
        status: 'searching'
      });
  }
};
