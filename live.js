const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('live')
    .setDescription('Look for opponents for a live game')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Any extra details or notes for this match')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('minutes')
        .setDescription('How many minutes are you available? (Defaults to 180 mins / 3 hours)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('players')
        .setDescription('Add up to 2 other players: tag them, enter names, or type a number ("1" or "2")')
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
    const notes = interaction.options.getString('text') || 'Looking for a live match!';
    const customMinutes = interaction.options.getInteger('minutes');
    const playersInput = interaction.options.getString('players');
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

    const normalize = (val) => String(val || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const calculateSimilarity = (a, b) => {
      const x = normalize(a); const y = normalize(b);
      if (!x || !y) return 0; if (x === y) return 1;
      if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
      const dp = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
      for (let i = 0; i <= x.length; i++) dp[i][0] = i;
      for (let j = 0; j <= y.length; j++) dp[0][j] = j;
      for (let i = 1; i <= x.length; i++) {
        for (let j = 1; j <= y.length; j++) {
          const cost = x[i - 1] === y[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
      }
      return 1 - dp[x.length][y.length] / Math.max(x.length, y.length);
    };

    const ixEmoji = getCustomEmoji('Ix', '');
    const immoEmoji = getCustomEmoji('Immo', '');
    const epicEmoji = getCustomEmoji('Epic', '');
    const uprisingEmoji = getCustomEmoji('Uprising', '');
    const choamEmoji = getCustomEmoji('CHOAM', '');

    const isUprising = board === 'Uprising';
    const hasIxMode = selectedMode === 'Epic';

    let activeMode = selectedMode;
    if (hasIxMode && expansion !== 'Ix' && expansion !== 'Ix_Immo') {
      expansion = expansion === 'Immortality' ? 'Ix_Immo' : 'Ix';
    }
    if ((selectedMode === 'BaseLeaders' || selectedMode === 'CHOAM' || selectedMode === 'Leaders_CHOAM') && !isUprising) {
      activeMode = null; 
    }

    const expansionsStored = [];
    if (expansion === 'Ix' || expansion === 'Ix_Immo') expansionsStored.push(`${ixEmoji} Rise of IX`.trim());
    if (expansion === 'Immortality' || expansion === 'Ix_Immo') expansionsStored.push(`${immoEmoji} Immortality`.trim());
    if (activeMode === 'Epic') expansionsStored.push(`${epicEmoji} Epic Mode`.trim());
    if (activeMode === 'BaseLeaders' || activeMode === 'Leaders_CHOAM') expansionsStored.push('Base Leaders');
    if (activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') expansionsStored.push(`${choamEmoji} CHOAM Module`.trim());

    let boardDisplay = board || 'Not Specified';
    if (board === 'Uprising') boardDisplay = `${uprisingEmoji} Uprising`.trim();
    if (board === 'Base') boardDisplay = 'Base Game';

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

    const liveDuneEmoji = getCustomEmoji('LiveDune', '⚔️');
    
    const minutesToExpiry = customMinutes ? Math.max(customMinutes, 5) : 180;
    const expirationMs = minutesToExpiry * 60 * 1000;
    const timeoutTimestamp = Math.floor((Date.now() + expirationMs) / 1000);
    const expiresAtISO = new Date(Date.now() + expirationMs).toISOString();

    const roleMention = `<@&1219666679764877424>`;

    let customPingSentence = `**${interaction.user.username}** is looking for live players ${roleMention}`;
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

    const playerIds = [host.id];
    const guestPlayers = [];

    if (playersInput) {
      const mentionRegex = /<@!?(\d+)>/g;
      let match;
      const parsedMentions = [];
      while ((match = mentionRegex.exec(playersInput)) !== null) {
        parsedMentions.push(match[1]);
      }

      if (parsedMentions.length > 0) {
        const toAdd = parsedMentions.slice(0, 2);
        for (const id of toAdd) {
          if (!playerIds.includes(id)) playerIds.push(id);
        }
      } else {
        const cleanInput = playersInput.trim();
        
        if (/^\d+$/.test(cleanInput)) {
          const numberVal = parseInt(cleanInput, 10);
          if (numberVal === 1 || numberVal === 2) {
            for (let i = 0; i < numberVal; i++) {
              guestPlayers.push(`Friend of ${host.username}`);
            }
          }
        } else {
          const rawNames = cleanInput.split(',').map(n => n.trim()).filter(Boolean);
          const toAddNames = rawNames.slice(0, 2);
          
          for (const name of toAddNames) {
            let bestDbMatch = null;
            let bestDbScore = 0;

            try {
              const pattern = `%${name}%`;
              const { data: dbRows } = await supabase
                .from('player_discord_map')
                .select('discord_user_id, player_key, display_name, username, discord_username')
                .or(`display_name.ilike.${pattern},discord_username.ilike.${pattern},username.ilike.${pattern}`)
                .limit(5);

              if (dbRows) {
                for (const row of dbRows) {
                  if (!row.discord_user_id) continue;
                  const score = Math.max(
                    calculateSimilarity(name, row.display_name),
                    calculateSimilarity(name, row.discord_username),
                    calculateSimilarity(name, row.username),
                    calculateSimilarity(name, row.player_key)
                  );
                  if (score > bestDbScore) {
                    bestDbScore = score;
                    bestDbMatch = row.discord_user_id;
                  }
                }
              }
            } catch (e) { console.error(e); }

            if (bestDbMatch && bestDbScore >= 0.72) {
              if (!playerIds.includes(bestDbMatch)) playerIds.push(bestDbMatch);
            } else {
              guestPlayers.push(name);
            }
          }
        }
      }
    }

    let generatedMatchId = `MATCH-${Math.floor(100 + Math.random() * 900)}`;
    try {
      const { data: nameRows } = await supabase
        .from('player_discord_map')
        .select('display_name')
        .not('display_name', 'is', null)
        .limit(40);

      if (nameRows && nameRows.length >= 2) {
        const cleanNames = nameRows
          .map(r => r.display_name.trim().replace(/[^a-zA-Z]/g, ''))
          .filter(n => n.length >= 4);

        if (cleanNames.length >= 2) {
          const shuffled = cleanNames.sort(() => 0.5 - Math.random());
          const pickCount = Math.random() > 0.5 ? 3 : 2;
          const selectedChunks = shuffled.slice(0, Math.min(pickCount, shuffled.length));
          
          let combinedWord = '';
          selectedChunks.forEach((name) => {
            const halfLength = Math.ceil(name.length / 2);
            if (Math.random() > 0.5) {
              combinedWord += name.slice(0, halfLength);
            } else {
              combinedWord += name.slice(-halfLength);
            }
          });

          if (combinedWord.length > 3) {
            combinedWord = combinedWord.charAt(0).toUpperCase() + combinedWord.slice(1).toLowerCase();
            generatedMatchId = `${combinedWord}-${Math.floor(100 + Math.random() * 900)}`;
          }
        }
      }
    } catch (idErr) { console.error(idErr); }

    const totalSlotCount = playerIds.length + guestPlayers.length;
    const mentionsList = playerIds.map(id => `• <@${id}>`);
    const guestsList = guestPlayers.map(name => `• ${name} 👥`);
    const fullRosterDisplay = [...mentionsList, ...guestsList].join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`${liveDuneEmoji} New Live Match Open! [ID: ${generatedMatchId}]`)
      .setDescription(`"${notes}"`)
      .setColor(0xe74c3c) 
      .addFields(
        { name: '📝 Match Details', value: `${statusSentence}\n*Lobby expires <t:${timeoutTimestamp}:R>.*`, inline: false },
        { name: '🔑 Password', value: password === 'None' ? 'Check chat for more info' : `\`${password}\``, inline: false },
        { name: `👥 Players (${totalSlotCount}/4)`, value: fullRosterDisplay, inline: false },
        { 
          name: 'Reaction Legend', 
          value: [
            `${liveDuneEmoji} • **Join / Leave** the lobby`,
            `🎮 • **Start Game** (Requires 2+ players)`,
            `❌ • **Cancel Lobby** (Host only)`,
            `🔔 • **Toggle Ping Alerts** to get notified when someone joins`,
            `📢 • **Ping Lobby Role** (45m cooldown)`
          ].join('\n'), 
          inline: false 
        }
      )
      .setFooter({ text: `Lobbies time out automatically if unstarted after ${minutesToExpiry} minutes.` })
      .setTimestamp();

    const response = await interaction.reply({
      embeds: [embed],
      withResponse: true
    });

    const messageId = response.resource?.message?.id || response.id;
    const message = response.resource?.message || await interaction.channel.messages.fetch(messageId);

    try {
      const customJoinEmoji = guild.emojis.cache.find((e) => e.name === 'LiveDune');
      if (customJoinEmoji) {
        await message.react(customJoinEmoji).catch(() => {});
      } else {
        await message.react('⚔️').catch(() => {});
      }
      await message.react('🎮').catch(() => {});
      await message.react('❌').catch(() => {});
      await message.react('🔔').catch(() => {});
      await message.react('📢').catch(() => {});
    } catch (reactErr) { console.error(reactErr); }

    const pingMessage = await interaction.followUp({
      content: customPingSentence,
      allowedMentions: { roles: ['1219666679764877424'] } 
    });

    setTimeout(() => {
      pingMessage.delete().catch(() => {});
    }, 1500);

    await supabase
      .from('active_async_matches')
      .insert({
        message_id: messageId,
        match_id: generatedMatchId,
        channel_id: interaction.channelId,
        guild_id: interaction.guildId,
        host_id: host.id,
        player_ids: playerIds,
        notify_user_ids: [],
        guest_players: guestPlayers,
        message_text: notes,
        lobby_password: password !== 'None' ? password : null,
        board_type: boardDisplay,
        expansions: expansionsStored,
        status: 'searching',
        expires_at: expiresAtISO 
      });
  }
};
