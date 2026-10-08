const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

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
      option.setName('password')
        .setDescription('Optional lobby password')
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
    .addBooleanOption(option =>
      option.setName('league')
        .setDescription('Official Season League Game (Admins only)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase }) {
    const isLeague = interaction.options.getBoolean('league') || false;
    const LFG_ADMIN_ROLE = '1557469534133162045';
    const LEAGUE_CHANNEL_ID = '1557473551227818024';

    // League Match Authorization Guard
    if (isLeague) {
      if (!interaction.member.roles.cache.has(LFG_ADMIN_ROLE) && !interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Only LFG Admins can host official League matches during the testing phase.', flags: MessageFlags.Ephemeral });
      }
    }

    const notes = interaction.options.getString('text') || (isLeague ? 'Looking for players for an Official League match!' : 'Looking for a live match!');
    const customMinutes = interaction.options.getInteger('minutes');
    const password = interaction.options.getString('password') || 'None';
    const playersInput = interaction.options.getString('players');
    const board = interaction.options.getString('board');
    let expansion = interaction.options.getString('expansion');
    const selectedMode = interaction.options.getString('mode');
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
    if (expansion === 'Ix_Immo') expansionText = `${ixText} and${immoText}`;

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

    const liveDuneEmoji = getCustomEmoji('LiveDune', '⚔️');
    
    const minutesToExpiry = customMinutes ? Math.max(customMinutes, 5) : 180;
    const expirationMs = minutesToExpiry * 60 * 1000;
    const timeoutTimestamp = Math.floor((Date.now() + expirationMs) / 1000);
    const expiresAtISO = new Date(Date.now() + expirationMs).toISOString();

    const roleMention = `<@&1219666679764877424>`;

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

    // --- IGN MAPPING & ELO FETCHING FOR DISPLAY ---
    const expectedPlayerKeys = [];
    const discordUsernames = [];
    const pkMap = {};
    const displayMap = {};
    const elos = {};
    let currentSeasonId = 2;

    try {
      if (isLeague) {
        const nowIso = new Date().toISOString();
        const { data: seasonData } = await supabase.from('sp_seasons').select('id').lte('starts_at', nowIso).gt('ends_at', nowIso).maybeSingle();
        if (seasonData?.id) currentSeasonId = seasonData.id;
      }

      // Fetch mappings so we can display real IGNs next to Discord tags
      const { data: mapData } = await supabase.from('player_discord_map')
        .select('discord_user_id, player_key, discord_username, display_name')
        .in('discord_user_id', playerIds);
        
      if (mapData) {
        mapData.forEach(row => {
          if (row.player_key) {
             pkMap[row.discord_user_id] = row.player_key;
             if (isLeague) expectedPlayerKeys.push(row.player_key);
          }
          if (row.display_name) {
             displayMap[row.discord_user_id] = row.display_name;
          } else if (row.player_key) {
             displayMap[row.discord_user_id] = row.player_key.charAt(0).toUpperCase() + row.player_key.slice(1);
          }
          
          if (isLeague && row.discord_username) discordUsernames.push(row.discord_username);
        });
      }
      
      // Fetch Elo for mapped players and guests (if league)
      if (isLeague) {
        const keysToFetch = [...expectedPlayerKeys, ...guestPlayers.map(g => normalize(g))].filter(Boolean);
        if (keysToFetch.length > 0) {
          const [{ data: oData }, { data: lData }] = await Promise.all([
            supabase.from('player_ratings').select('player_key, elo').in('player_key', keysToFetch).eq('game_version', 'overall'),
            supabase.from('player_league_ratings').select('player_key, elo').in('player_key', keysToFetch).eq('season', currentSeasonId)
          ]);
          oData?.forEach(r => { if (!elos[r.player_key]) elos[r.player_key] = {}; elos[r.player_key].overall = r.elo; });
          lData?.forEach(r => { if (!elos[r.player_key]) elos[r.player_key] = {}; elos[r.player_key].league = r.elo; });
        }
      }
    } catch (err) { console.error('Failed to map players/elos:', err); }

    // Display sentences using mapped IGN
    const hostDisplayName = displayMap[host.id] || host.username;
    let statusSentence = `**${hostDisplayName}** <@${host.id}> is looking for players`;
    if (board && board !== 'Base' && expansionText) statusSentence += ` for ${boardText} with${expansionText}`;
    else if (board && board !== 'Base') statusSentence += ` for ${boardText}`;
    else if (board === 'Base' && expansionText) statusSentence += ` for Base Game with ${expansionText}`;
    else if (expansionText) statusSentence += ` playing with ${expansionText}`;
    statusSentence += '.';

    if (isLeague) {
       statusSentence += `\n\n⚠️ **Official League Match**: Results will count toward Season ${currentSeasonId} League standings.`;
    }

    let customPingSentence = `**${hostDisplayName}** <@${host.id}> is looking for live players${roleMention}`;
    if (board && board !== 'Base' && expansionText) customPingSentence += ` for ${boardText} with${expansionText}`;
    else if (board && board !== 'Base') customPingSentence += ` for ${boardText}`;
    else if (board === 'Base' && expansionText) customPingSentence += ` for Base Game with ${expansionText}`;
    else if (expansionText) customPingSentence += ` playing with ${expansionText}`;
    customPingSentence += '.';

    // Format Display with IGN and Elo (if League)
    const mentionsList = playerIds.map(id => {
      const dName = displayMap[id];
      let str = dName ? `**${dName}** <@${id}>` : `<@${id}>`;
      
      if (isLeague) {
        const pk = pkMap[id];
        const leagueElo = pk && elos[pk]?.league !== undefined ? Math.round(elos[pk].league) : 1000;
        const overallElo = pk && elos[pk]?.overall !== undefined ? Math.round(elos[pk].overall) : 1000;
        str += ` [🏆 ${leagueElo} \vert{} 🌍 ${overallElo}]`;
      }
      return `• ${str}`;
    });
    
    const guestsList = guestPlayers.map(name => {
      let str = `**${name}** 👥`;
      if (isLeague) {
        const pk = normalize(name);
        const leagueElo = elos[pk]?.league !== undefined ? Math.round(elos[pk].league) : 1000;
        const overallElo = elos[pk]?.overall !== undefined ? Math.round(elos[pk].overall) : 1000;
        str += ` [🏆 ${leagueElo} \vert{} 🌍 ${overallElo}]`;
      }
      return `• ${str}`;
    });
    
    // SAFE FALLBACK: If roster is completely empty, supply a Zero-Width Space to satisfy Discord.js requirements.
    let fullRosterDisplay = [...mentionsList, ...guestsList].join('\n');
    if (!fullRosterDisplay || fullRosterDisplay.trim() === '') {
       fullRosterDisplay = '\u200B'; 
    }

    // --- SEQUENTIAL HOST MATCH ID CREATION ENGINE (HostName-L#) ---
    const cleanHostName = host.username.replace(/[^a-zA-Z0-9]/g, '') || 'Host';
    const prefixPattern = `${cleanHostName}-L`;
    let generatedMatchId = `${prefixPattern}1`;

    try {
      const { data: existingHostLobbies } = await supabase
        .from('active_async_matches')
        .select('match_id')
        .ilike('match_id', `${prefixPattern}%`);

      if (existingHostLobbies && existingHostLobbies.length > 0) {
        let maxNumber = 0;
        // Adjusted Regex to strictly extract the numeric portion reliably
        const numberRegex = new RegExp(`^${cleanHostName}-L(\\d+)$`, 'i');

        existingHostLobbies.forEach((row) => {
          const match = row.match_id ? row.match_id.match(numberRegex) : null;
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNumber) {
              maxNumber = num;
            }
          }
        });

        generatedMatchId = `${prefixPattern}${maxNumber + 1}`;
      }
    } catch (idErr) {
      console.error('Error generating host-based live match ID:', idErr);
    }

    const totalSlotCount = playerIds.length + guestPlayers.length;

    // Dynamic Title & Color for League
    const embedTitle = isLeague 
      ? `🏆 Ranked League Match Open! [ID: ${generatedMatchId}]`
      : `${liveDuneEmoji} New Live Match Open! [ID:${generatedMatchId}]`;
    const embedColor = isLeague ? 0xF1C40F : 0xe74c3c;

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setDescription(`"${notes}"`)
      .setColor(embedColor) 
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
            `🥾 • **Kick Player** (Host/Admin only)`,
            `🔔 • **Toggle Ping Alerts** to get notified when someone joins`,
            `📢 • **Ping Lobby Role** (45m cooldown)`
          ].join('\n'), 
          inline: false 
        }
      )
      .setFooter({ text: `Lobbies time out automatically if unstarted after ${minutesToExpiry} minutes.` })
      .setTimestamp();

    // -------------------------------------------------------------
    // DATABASE INSERT (MUST HAPPEN FIRST TO GET THE LOBBY ID)
    // -------------------------------------------------------------
    let actualChannelId = interaction.channelId;
    if (isLeague && interaction.channelId !== LEAGUE_CHANNEL_ID) {
      actualChannelId = LEAGUE_CHANNEL_ID;
    }

    const { data: insertedMatch, error: insertError } = await supabase
      .from('active_async_matches')
      .insert({
        match_id: generatedMatchId,
        channel_id: actualChannelId,
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
        expires_at: expiresAtISO,
        mode: 'live',
        is_league: isLeague,
        season_id: isLeague ? currentSeasonId : null,
        league_status: isLeague ? 'open' : null,
        expected_player_keys: expectedPlayerKeys,
        discord_usernames: discordUsernames
      })
      .select('id')
      .single();

    const numericLobbyId = insertedMatch?.id || 'unknown';

    // Tap-to-copy code blocks placed outside the embed, now with the real web URL
    let copyableContent = `🎮 Match ID: \`${generatedMatchId}\``;
    if (password !== 'None') {
      copyableContent += `\n🔑 Lobby Password: \`${password}\` *(Tap to copy)*`;
    }
    copyableContent += `\n🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${numericLobbyId}`;

    // --- NEW ROUTING LOGIC: POST IN TARGET CHANNEL ---
    let targetMessage;
    let targetMessageId;

    if (isLeague && interaction.channelId !== LEAGUE_CHANNEL_ID) {
      // If it's a league game but they typed the command somewhere else, send it to the League channel
      const leagueChannel = await interaction.client.channels.fetch(LEAGUE_CHANNEL_ID).catch(() => null);
      if (leagueChannel) {
        targetMessage = await leagueChannel.send({ content: copyableContent, embeds: [embed] });
        targetMessageId = targetMessage.id;
        
        // Let the user know it was moved ephemerally
        await interaction.reply({ content: `✅ League match successfully posted in <#${LEAGUE_CHANNEL_ID}>!`, flags: MessageFlags.Ephemeral });
      }
    }

    if (!targetMessage) {
      // Fallback: It's not a league game, OR they already typed it in the League channel
      const response = await interaction.reply({
        content: copyableContent,
        embeds: [embed],
        withResponse: true
      });
      targetMessageId = response.resource?.message?.id || response.id;
      targetMessage = response.resource?.message || await interaction.channel.messages.fetch(targetMessageId);
    }

    // Now securely link the newly generated Discord Message back to the Supabase record
    if (insertedMatch && targetMessageId) {
       await supabase.from('active_async_matches')
         .update({ message_id: targetMessageId })
         .eq('id', numericLobbyId);
    }

    try {
      const customJoinEmoji = guild.emojis.cache.find((e) => e.name === 'LiveDune');
      if (customJoinEmoji) {
        await targetMessage.react(customJoinEmoji).catch(() => {});
      } else {
        await targetMessage.react('⚔️').catch(() => {});
      }
      await targetMessage.react('🎮').catch(() => {});
      await targetMessage.react('❌').catch(() => {});
      await targetMessage.react('🥾').catch(() => {}); // KICK EMOJI
      await targetMessage.react('🔔').catch(() => {});
      await targetMessage.react('📢').catch(() => {});
    } catch (reactErr) { console.error(reactErr); }

    const pingMessage = await targetMessage.channel.send({
      content: customPingSentence,
      allowedMentions: { roles: ['1219666679764877424'] } 
    });

    setTimeout(() => {
      pingMessage.delete().catch(() => {});
    }, 1500);

  }
};
