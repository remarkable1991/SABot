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
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Select additional game variants/modes')
        .setRequired(false)
        .addChoices(
          { name: 'Epic Mode', value: 'Epic' },
          { name: 'Base Leaders', value: 'BaseLeaders' },
          { name: 'CHOAM Module', value: 'CHOAM' },
          { name: 'Base Leaders + CHOAM', value: 'Leaders_CHOAM' }
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
    const choamEmoji = getCustomEmoji('CHOAM', ''); // Fetches custom CHOAM emoji map string

    const isUprising = board === 'Uprising';
    const hasIxMode = selectedMode === 'Epic';

    // Strict Rule Validation Layer
    let activeMode = selectedMode;
    if (hasIxMode && expansion !== 'Ix' && expansion !== 'Ix_Immo') {
      expansion = expansion === 'Immortality' ? 'Ix_Immo' : 'Ix';
    }
    if ((selectedMode === 'BaseLeaders' || selectedMode === 'CHOAM' || selectedMode === 'Leaders_CHOAM') && !isUprising) {
      activeMode = null; 
    }

    // Combine parameters safely into expansionsStored array for index.js compatibility
    const expansionsStored = [];
    if (expansion === 'Ix' || expansion === 'Ix_Immo') expansionsStored.push(`${ixEmoji} Rise of IX`.trim());
    if (expansion === 'Immortality' || expansion === 'Ix_Immo') expansionsStored.push(`${immoEmoji} Immortality`.trim());
    if (activeMode === 'Epic') expansionsStored.push(`${epicEmoji} Epic Mode`.trim());
    if (activeMode === 'BaseLeaders' || activeMode === 'Leaders_CHOAM') expansionsStored.push('Base Leaders');
    if (activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') expansionsStored.push(`${choamEmoji} CHOAM Module`.trim());

    let boardDisplay = board || 'Not Specified';
    if (board === 'Uprising') boardDisplay = `${uprisingEmoji} Uprising`.trim();
    if (board === 'Base') boardDisplay = 'Base Game';

    // UI Sentence String Generation
    const ixText = `${ixEmoji} Rise of IX`.trim();
    const immoText = `${immoEmoji} Immortality`.trim();
    const epicText = `${epicEmoji} Epic Mode`.trim();
    const uprisingText = `${uprisingEmoji} Uprising`.trim();
    const choamText = `${choamEmoji} CHOAM Module`.trim();

    let expansionText = '';
    if (expansion === 'Ix') expansionText = ixText;
    if (expansion === 'Immortality') expansionText = immoText;
    if (expansion === 'Ix_Immo') expansionText = `${ixText} and ${immoText}`;

    let modeText = '';
    if (activeMode === 'Epic') modeText = epicText;
    if (activeMode === 'BaseLeaders') modeText = 'Base Leaders';
    if (activeMode === 'CHOAM') modeText = choamText;
    if (activeMode === 'Leaders_CHOAM') modeText = `Base Leaders + ${choamText}`;

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

    // Custom formatting phrase layout generation for mobile notifications
    let customPingSentence = `**${interaction.user.username}** is looking for players ${roleMention}`;
    if (board && board !== 'Base' && expansionText) {
      customPingSentence += ` for ${boardText} with ${expansionText}`;
    } else if (board && board !== 'Base') {
      customPingSentence += ` for ${boardText}`;
    } else if (board === 'Base' && expansionText) {
      customPingSentence += ` for Base Game with ${expansionText}`;
    } else if (expansionText) {
      customPingSentence += ` playing with ${expansionText}`;
    }
    customPingSentence += '.';

    const embed = new EmbedBuilder()
      .setTitle(`${asyncDuneEmoji} New Async Match Open!`)
      .setDescription(`"${notes}"`)
      .setColor(0x3498db)
      .addFields(
        { name: '📝 Match Details', value: `${statusSentence}\n*Lobby expires <t:${timeoutTimestamp}:R>.*`, inline: false },
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
      withResponse: true
    });

    const messageId = response.resource?.message?.id || response.id;

    // Dispatch raw text follow-up to circumvent native slash command notification suppressions
    const pingMessage = await interaction.followUp({
      content: customPingSentence,
      allowedMentions: { roles: [targetRole?.id].filter(Boolean) }
    });

    setTimeout(() => {
      pingMessage.delete().catch(() => {});
    }, 1500);

    await supabase
      .from('active_async_matches')
      .insert({
        message_id: messageId,
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
