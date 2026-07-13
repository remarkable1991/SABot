const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('async')
    .setDescription('Look for opponents for an asynchronous game')
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
          { name: 'Ix + Immortality', value: 'Ix_Immo' }
        )
    )
    // Replaced boolean toggle with an explicitly rule-bound mode selection dropdown
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Select additional game variants/modes')
        .setRequired(false)
        .addChoices(
          { name: 'Epic Mode (Requires Ix)', value: 'Epic' },
          { name: 'Ix + Immortality + Epic Mode', value: 'Ix_Immo_Epic' },
          { name: 'Base Leaders (Uprising Only)', value: 'BaseLeaders' },
          { name: 'CHOAM Module (Uprising Only)', value: 'CHOAM' },
          { name: 'Base Leaders + CHOAM (Uprising Only)', value: 'Leaders_CHOAM' }
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
    let expansion = interaction.options.getString('expansion');
    const selectedMode = interaction.options.getString('mode');
    const password = interaction.options.getString('password') || 'None';
    const host = interaction.user;

    const guild = interaction.guild;
    const getCustomEmoji = (name, fallback) => {
      if (!guild || !guild.emojis || !guild.emojis.cache) return fallback;
      const emoji = guild.emojis.cache.find((e) => e.name === name);
      return emoji ? emoji.toString() : fallback;
    };

    const ixEmoji = getCustomEmoji('Ix', '');
    const immoEmoji = getCustomEmoji('Immo', '');
    const epicEmoji = getCustomEmoji('Epic', '');
    const uprisingEmoji = getCustomEmoji('Uprising', '');

    // Rule Enforcement Verification: Check context constraints before building layout
    const isUprising = board === 'Uprising';
    const hasIxMode = selectedMode === 'Epic' || selectedMode === 'Ix_Immo_Epic';

    // Auto-correct configurations if user picked incompatible combinations
    let activeMode = selectedMode;
    if (hasIxMode && expansion !== 'Ix' && expansion !== 'Ix_Immo') {
      // Force Ix to true if an Epic variant was selected without it
      expansion = expansion === 'Immortality' ? 'Ix_Immo' : 'Ix';
    }
    if ((selectedMode === 'BaseLeaders' || selectedMode === 'CHOAM' || selectedMode === 'Leaders_CHOAM') && !isUprising) {
      // Clear Uprising-exclusive modules if Base Game was chosen
      activeMode = null;
    }

    // 1. Build expansions array for database storage syncing
    const expansionsStored = [];
    if (expansion === 'Ix' || expansion === 'Ix_Immo' || activeMode === 'Ix_Immo_Epic') expansionsStored.push(`${ixEmoji} Rise of IX`.trim());
    if (expansion === 'Immortality' || expansion === 'Ix_Immo' || activeMode === 'Ix_Immo_Epic') expansionsStored.push(`${immoEmoji} Immortality`.trim());
    
    // Add extra variant tags to the storage array tracking parameters
    if (activeMode === 'Epic' || activeMode === 'Ix_Immo_Epic') expansionsStored.push(`${epicEmoji} Epic Mode`.trim());
    if (activeMode === 'BaseLeaders' || activeMode === 'Leaders_CHOAM') expansionsStored.push('Base Leaders');
    if (activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') expansionsStored.push('CHOAM Module');

    let boardDisplay = board || 'Not Specified';
    if (board === 'Uprising') boardDisplay = `${uprisingEmoji} Uprising`.trim();
    if (board === 'Base') boardDisplay = 'Base Game';

    // 2. Build Interface Layout Strings
    const ixText = `${ixEmoji} Rise of IX`.trim();
    const immoText = `${immoEmoji} Immortality`.trim();
    const epicText = `${epicEmoji} Epic Mode`.trim();
    const uprisingText = `${uprisingEmoji} Uprising`.trim();

    let expansionText = '';
    if (expansion === 'Ix') expansionText = ixText;
    if (expansion === 'Immortality') expansionText = immoText;
    if (expansion === 'Ix_Immo' || activeMode === 'Ix_Immo_Epic') expansionText = `${ixText} and ${immoText}`;

    // Append extra text formatting for modules seamlessly into the main setup sentence
    let modeText = '';
    if (activeMode === 'Epic' || activeMode === 'Ix_Immo_Epic') modeText = epicText;
    if (activeMode === 'BaseLeaders') modeText = 'Base Leaders';
    if (activeMode === 'CHOAM') modeText = 'CHOAM Module';
    if (activeMode === 'Leaders_CHOAM') modeText = 'Base Leaders + CHOAM';

    if (modeText) {
      if (expansionText) {
        expansionText += ` (with ${modeText})`;
      } else {
        expansionText = modeText;
      }
    }

    let boardText = board === 'Uprising' ? uprisingText : 'Base Game';

    let statusSentence = `${host} is looking for players`;
    if (board && board !== 'Base' && expansionText) {
      statusSentence += ` for ${boardText} with ${expansionText}`;
    } else if (board && board !== 'Base') {
      statusSentence += ` for ${boardText}`;
    } else if (board === 'Base' && expansionText) {
      statusSentence += ` for Base Game with ${expansionText}`;
    } else if (expansionText) {
      statusSentence += ` playing with ${expansionText}`;
    }
    statusSentence += '.';

    const asyncDuneEmoji = getCustomEmoji('AsyncDune', '🎲');
    const timeoutTimestamp = Math.floor((Date.now() + 15 * 60 * 60 * 1000) / 1000);

    const targetRole = guild?.roles.cache.find(r => r.name === 'DuneASYNC');
    const roleMention = targetRole ? `<@&${targetRole.id}>` : '@DuneASYNC';

    const embed = new EmbedBuilder()
      .setTitle(`${asyncDuneEmoji} New Async Match Open!`)
      .setDescription(`${roleMention}\n\n"${notes}"`)
      .setColor(0x3498db)
      .addFields(
        { name: '📝 Match Details', value: `${statusSentence}\n*Lobby expires <t:${timeoutTimestamp}:R>.*`, inline: false },
        { name: '🔑 Password', value: password === 'None' ? 'Check chat for more info' : `\`${password}\``, inline: false },
        { name: '👥 Players (1/4)', value: `• ${host} 🔔`, inline: false }
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
      withResponse: true
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
        expansions: expansionsStored,
        status: 'searching'
      });
  }
};
