const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('async')
    .setDescription('Look for opponents for an asynchronous game')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Match notes (Hit Enter to leave blank/default)')
        .setRequired(true)
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
          { name: 'Epic Mode', value: 'Epic' },
          { name: 'Ix + Immortality', value: 'Ix_Immo' },
          { name: 'Ix + Epic', value: 'Ix_Epic' },
          { name: 'Immortality + Epic', value: 'Immo_Epic' },
          { name: 'All Expansions (Ix + Immo + Epic)', value: 'All' }
        )
    )
    .addStringOption(option =>
      option.setName('password')
        .setDescription('Optional lobby password')
        .setRequired(false)
    ),

  async execute(interaction, { supabase }) {
    let inputNotes = interaction.options.getString('text');
    // If they just hit space or left the default text, treat it as blank
    if (!inputNotes || inputNotes.trim() === '') {
      inputNotes = 'Looking for an async match!';
    }

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

    // Grab core emojis safely
    const ixEmoji = getCustomEmoji('Ix', '');
    const immoEmoji = getCustomEmoji('Immo', '');
    const epicEmoji = getCustomEmoji('Epic', '');
    const uprisingEmoji = getCustomEmoji('Uprising', '');

    // 1. Database Display Mapping (Keeps database arrays consistent)
    let expansionDisplay = expansion || 'None';
    if (expansion === 'Ix') expansionDisplay = `${ixEmoji} Rise of IX`.trim();
    if (expansion === 'Immortality') expansionDisplay = `${immoEmoji} Immortality`.trim();
    if (expansion === 'Epic') expansionDisplay = `${epicEmoji} Epic Mode`.trim();
    if (expansion === 'Ix_Immo') expansionDisplay = 'Rise of IX + Immortality';
    if (expansion === 'Ix_Epic') expansionDisplay = 'Rise of IX + Epic Mode';
    if (expansion === 'Immo_Epic') expansionDisplay = 'Immortality + Epic Mode';
    if (expansion === 'All') expansionDisplay = 'Rise of IX + Immortality + Epic Mode';

    let boardDisplay = board || 'Not Specified';
    if (board === 'Uprising') boardDisplay = `${uprisingEmoji} Uprising`.trim();
    if (board === 'Base') boardDisplay = 'Base Game';

    // 2. Sentence Text Construction (Emoji + Text Name combinations)
    const ixText = `${ixEmoji} Rise of IX`.trim();
    const immoText = `${immoEmoji} Immortality`.trim();
    const epicText = `${epicEmoji} Epic Mode`.trim();
    const uprisingText = `${uprisingEmoji} Uprising`.trim();

    let expansionText = '';
    if (expansion === 'Ix') expansionText = ixText;
    if (expansion === 'Immortality') expansionText = immoText;
    if (expansion === 'Epic') expansionText = epicText;
    if (expansion === 'Ix_Immo') expansionText = `${ixText} and ${immoText}`;
    if (expansion === 'Ix_Epic') expansionText = `${ixText} and ${epicText}`;
    if (expansion === 'Immo_Epic') expansionText = `${immoText} and ${epicText}`;
    if (expansion === 'All') expansionText = `${ixText}, ${immoText}, and ${epicText}`;

    // Base Game shows no emoji prefix
    let boardText = board === 'Uprising' ? uprisingText : 'Base Game';

    let statusSentence = `${host} is looking for players`;
    if (board && board !== 'Base' && expansion && expansion !== 'None') {
      statusSentence += ` for ${boardText} with ${expansionText}`;
    } else if (board && board !== 'Base') {
      statusSentence += ` for ${boardText}`;
    } else if (board === 'Base' && expansion && expansion !== 'None') {
      statusSentence += ` for Base Game with ${expansionText}`;
    } else if (expansion && expansion !== 'None') {
      statusSentence += ` with ${expansionText}`;
    }
    statusSentence += '.';

    const asyncDuneEmoji = getCustomEmoji('AsyncDune', '🎲');

    const embed = new EmbedBuilder()
      .setTitle(`${asyncDuneEmoji} New Async Match Open!`)
      .setDescription(`"${inputNotes}"`)
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
        message_text: inputNotes,
        lobby_password: password !== 'None' ? password : null,
        board_type: boardDisplay,
        expansions: expansion && expansion !== 'None' ? [expansionDisplay] : [],
        status: 'searching'
      });
  }
};
