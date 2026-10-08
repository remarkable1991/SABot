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

    if (isLeague) {
      if (!interaction.member.roles.cache.has(LFG_ADMIN_ROLE) && !interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Only LFG Admins can host official League matches during the testing phase.', flags: MessageFlags.Ephemeral });
      }
    }

    if (isLeague && interaction.channelId !== LEAGUE_CHANNEL_ID) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else {
      await interaction.deferReply();
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

    const dbExpansions = [];
    if (expansion === 'Ix' || expansion === 'Ix_Immo') dbExpansions.push('Rise of IX');
    if (expansion === 'Immortality' || expansion === 'Ix_Immo') dbExpansions.push('Immortality');
    if (activeMode === 'Epic') dbExpansions.push('Epic Mode');
    if (activeMode === 'BaseLeaders' || activeMode === 'Leaders_CHOAM') dbExpansions.push('Base Leaders');
    if (activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') dbExpansions.push('CHOAM Module');

    const dbBoardType = board === 'Uprising' ? 'Uprising' : 'Base Game';

    let boardDisplay = 'Base Game';
    if (board === 'Uprising') boardDisplay = `${uprisingEmoji} Uprising`.trim();

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
      
      // Look up ratings for players & guests to resolve case-sensitive leaderboard names & ELO
      const keysToFetch = [...expectedPlayerKeys, ...guestPlayers.map(g => normalize(g))].filter(Boolean);
      const guestRatingsLookup = {};

      if (keysToFetch.length > 0) {
        const [{ data: oData }, { data: lData }] = await Promise.all([
          supabase.from('player_ratings').select('player_key, display_name, elo').in('player_key', keysToFetch).eq('game_version', 'overall'),
          isLeague ? supabase.from('player_league_ratings').select('player_key, elo').in('player_key', keysToFetch).eq('season', currentSeasonId) : Promise.resolve({ data: [] })
        ]);
        oData?.forEach(r => { 
          if (!elos[r.player_key]) elos[r.player_key] = {}; 
          elos[r.player_key].overall = r.elo;
          if (r.display_name) guestRatingsLookup[r.player_key] = r.display_name;
        });
        lData?.forEach(r => { 
          if (!elos[r.player_key]) elos[r.player_key] = {}; 
          elos[r.player_key].league = r.elo; 
        });
      }

      // Check if guests match player_ratings to update discord map
      for (const guest of guestPlayers) {
        const normKey = normalize(guest);
        if (guestRatingsLookup[normKey]) {
          // Keep their exact case-sensitive name from player_ratings
          guestRatingsLookup[guest] = guestRatingsLookup[normKey];
        }
      }

      this.guestRatingsLookup = guestRatingsLookup;
    } catch (err) { console.error('Failed to map players/elos:', err); }

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

    const guestLookup = this.guestRatingsLookup || {};

    // Format roster with Leaderboard Hyperlinks
    const mentionsList = playerIds.map(id => {
      const dName = displayMap[id] || (pkMap[id] ? pkMap[id] : null);
      let nameStr = dName ? `[${dName}](https://dunestats.cc/players/${encodeURIComponent(dName)}) <@${id}>` : `<@${id}>`;
      
      if (isLeague) {
        const pk = pkMap[id];
        const leagueElo = pk && elos[pk]?.league !== undefined ? Math.round(elos[pk].league) : 1000;
        const overallElo = pk && elos[pk]?.overall !== undefined ? Math.round(elos[pk].overall) : 1000;
        nameStr += ` [🏆 ${leagueElo} \vert{} 🌍 ${overallElo}]`;
      }
      return `• ${nameStr}`;
    });
    
    const guestsList = guestPlayers.map(name => {
      const normKey = normalize(name);
      const isKnownOnBoard = guestLookup[normKey] || guestLookup[name];
      let str = '';

      if (isKnownOnBoard) {
        const realCaseName = isKnownOnBoard;
        str = `[${realCaseName}](https://dunestats.cc/players/${encodeURIComponent(realCaseName)}) 📊`;
      } else {
        str = name.toLowerCase().startsWith('friend of') ? `${name} 👥` : `**${name}** 👥`;
      }

      if (isLeague) {
        const pk = normKey;
        const leagueElo = elos[pk]?.league !== undefined ? Math.round(elos[pk].league) : 1000;
        const overallElo = elos[pk]?.overall !== undefined ? Math.round(elos[pk].overall) : 1000;
        str += ` [🏆 ${leagueElo} \vert{} 🌍 ${overallElo}]`;
      }
      return `• ${str}`;
    });
    
    let fullRosterDisplay = [...mentionsList, ...guestsList].join('\n');
    if (!fullRosterDisplay || fullRosterDisplay.trim() === '') {
       fullRosterDisplay = '\u200B'; 
    }

    const cleanHostName = hostDisplayName.replace(/[^a-zA-Z0-9]/g, '') || 'Host';
    const prefixPattern = `${cleanHostName}-L`;
    let generatedMatchId = `${prefixPattern}1`;

    try {
      const { data: existingHostLobbies } = await supabase
        .from('active_async_matches')
        .select('match_id')
        .ilike('match_id', `${prefixPattern}%`);

      if (existingHostLobbies && existingHostLobbies.length > 0) {
        let maxNumber = 0;
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

    let initialCopyableContent = `🎮 Match ID: \`${generatedMatchId}\``;
    if (password !== 'None') {
      initialCopyableContent += `\n🔑 Lobby Password: \`${password}\` *(Tap to copy)*`;
    }

    let actualChannelId = interaction.channelId;
    let targetMessage;
    let targetMessageId;

    if (isLeague && interaction.channelId !== LEAGUE_CHANNEL_ID) {
      const leagueChannel = await interaction.client.channels.fetch(LEAGUE_CHANNEL_ID).catch(() => null);
      if (!leagueChannel) {
        return interaction.editReply({ content: `❌ Could not find target channel <#${LEAGUE_CHANNEL_ID}>.` });
      }
      targetMessage = await leagueChannel.send({ content: initialCopyableContent, embeds: [embed] });
      targetMessageId = targetMessage.id;
      actualChannelId = LEAGUE_CHANNEL_ID;

      await interaction.editReply({ content: `✅ League match successfully posted in <#${LEAGUE_CHANNEL_ID}>!` });
    } else {
      const response = await interaction.editReply({ content: initialCopyableContent, embeds: [embed] });
      targetMessageId = response.id;
      targetMessage = await interaction.channel.messages.fetch(targetMessageId);
    }

    // Insert to DB using clean plain strings (no raw emojis) and valid message_id
    const { data: insertedMatch, error: insertError } = await supabase
      .from('active_async_matches')
      .insert({
        message_id: targetMessageId,
        match_id: generatedMatchId,
        channel_id: actualChannelId,
        guild_id: interaction.guildId,
        host_id: host.id,
        player_ids: playerIds,
        notify_user_ids: [],
        guest_players: guestPlayers,
        message_text: notes,
        lobby_password: password !== 'None' ? password : null,
        board_type: dbBoardType,
        expansions: dbExpansions,
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

    if (insertError) {
      console.error('Failed to insert lobby into Supabase:', insertError);
      return;
    }

    const numericLobbyId = insertedMatch.id;
    const finalizedContent = `${initialCopyableContent}\n🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${numericLobbyId}`;
    await targetMessage.edit({ content: finalizedContent });

    try {
      const customJoinEmoji = guild.emojis.cache.find((e) => e.name === 'LiveDune');
      if (customJoinEmoji) {
        await targetMessage.react(customJoinEmoji).catch(() => {});
      } else {
        await targetMessage.react('⚔️').catch(() => {});
      }
      await targetMessage.react('🎮').catch(() => {});
      await targetMessage.react('❌').catch(() => {});
      await targetMessage.react('🥾').catch(() => {});
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
