const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const EMOJI_GUIDE_LINK = 'https://discord.com/channels/747212662483583069/1561400611348553810';

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

  async execute(interaction, { supabase, buildRosterDisplay, resolveHostIgn, promptUnknownHostIgn }) {
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

    const rawCustomText = interaction.options.getString('text')?.trim() || null;
    const dbMessageText = rawCustomText || (isLeague ? 'Official Ranked League Match!' : 'Looking for a live match!');
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

    const formatParts = [];
    if (board === 'Uprising') formatParts.push(`${uprisingEmoji} **Uprising**`.trim());
    else formatParts.push(`**Base Game**`);

    if (expansion === 'Ix' || expansion === 'Ix_Immo') formatParts.push(`${ixEmoji} **Rise of IX**`.trim());
    if (expansion === 'Immortality' || expansion === 'Ix_Immo') formatParts.push(`${immoEmoji} **Immortality**`.trim());
    if (activeMode === 'Epic') formatParts.push(`${epicEmoji} **Epic Mode**`.trim());
    if (activeMode === 'BaseLeaders' || activeMode === 'Leaders_CHOAM') formatParts.push(`**Base Leaders**`);
    if (activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') formatParts.push(`${choamEmoji} **CHOAM Module**`.trim());

    const formatLine = formatParts.join(' + ');
    const liveDuneEmoji = getCustomEmoji('LiveDune', '<:LiveDune:1232049130151346216>');
    
    const minutesToExpiry = customMinutes ? Math.max(customMinutes, 5) : 180;
    const expirationMs = minutesToExpiry * 60 * 1000;
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

    let currentSeasonId = 2;
    try {
      if (isLeague) {
        const nowIso = new Date().toISOString();
        const { data: seasonData } = await supabase.from('sp_seasons').select('id').lte('starts_at', nowIso).gt('ends_at', nowIso).maybeSingle();
        if (seasonData?.id) currentSeasonId = seasonData.id;
      }
    } catch (e) {}

    const { display: fullRosterDisplay, count: totalSlotCount } = buildRosterDisplay
      ? await buildRosterDisplay({
          player_ids: playerIds,
          guest_players: guestPlayers,
          web_player_names: [],
          web_player_ids: [],
          notify_user_ids: [],
          is_league: isLeague,
          season_id: currentSeasonId
        })
      : { display: playerIds.map(id => `• <@${id}>`).join('\n'), count: playerIds.length + guestPlayers.length };

    const hostIgnInfo = resolveHostIgn ? await resolveHostIgn(host.id) : { ign: null, isKnown: false };
    const lobbyNameLine = hostIgnInfo.isKnown
      ? `🎮 In-Game Lobby: **${hostIgnInfo.ign}'s game**`
      : `🎮 In-Game Lobby: *(Waiting for host IGN...)*`;

    const cleanHostName = (hostIgnInfo.ign || host.username).replace(/[^a-zA-Z0-9]/g, '') || 'Host';
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
    } catch (idErr) {}

    const embedTitle = isLeague 
      ? `🏆 Ranked League Match Open!`
      : `${liveDuneEmoji} New Live Match Open!`;
    const embedColor = isLeague ? 0xF1C40F : 0xe74c3c;

    const descLines = [];
    if (rawCustomText) descLines.push(`"${rawCustomText}"\n`);
    descLines.push(formatLine);
    descLines.push(lobbyNameLine);

    const footerGuideBlock = `${liveDuneEmoji} • **Join / Leave** the lobby\n📖 **[Emoji Controls Guide](${EMOJI_GUIDE_LINK})**`;

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setDescription(descLines.join('\n'))
      .setColor(embedColor) 
      .addFields(
        { name: `👥 Players (${totalSlotCount}/4)\n\u200B`, value: `${fullRosterDisplay}\n\n${footerGuideBlock}`, inline: false }
      )
      .setTimestamp();

    let initialCopyableContent = '🎮 Generating lobby link...';
    if (password !== 'None') {
      initialCopyableContent = `🔑 Lobby Password: \`${password}\` *(Tap to copy)*`;
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

      const jumpLink = `https://discord.com/channels/${interaction.guildId}/${LEAGUE_CHANNEL_ID}/${targetMessageId}`;
      await interaction.editReply({ content: `✅ League match successfully posted in <#${LEAGUE_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
    } else {
      const response = await interaction.editReply({ content: initialCopyableContent, embeds: [embed] });
      targetMessageId = response.id;
      targetMessage = await interaction.channel.messages.fetch(targetMessageId);
    }

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
        message_text: dbMessageText,
        lobby_password: password,
        board_type: dbBoardType,
        expansions: dbExpansions,
        status: 'searching',
        expires_at: expiresAtISO,
        mode: 'live',
        is_league: isLeague,
        season_id: isLeague ? currentSeasonId : null,
        league_status: isLeague ? 'open' : null,
        expected_player_keys: [],
        discord_usernames: []
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Failed to insert lobby into Supabase:', insertError);
      return;
    }

    const numericLobbyId = insertedMatch.id;
    const finalizedLines = [];
    if (password !== 'None') finalizedLines.push(`🔑 Lobby Password: \`${password}\` *(Tap to copy)*`);
    finalizedLines.push(`🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${numericLobbyId}`);
    await targetMessage.edit({ content: finalizedLines.join('\n') });

    try {
      const customJoinEmoji = guild.emojis.cache.find((e) => e.name === 'LiveDune');
      await targetMessage.react(customJoinEmoji ? customJoinEmoji.id : '1232049130151346216').catch(() => {});
      await targetMessage.react('🎮').catch(() => {});
      await targetMessage.react('❌').catch(() => {});
      await targetMessage.react('🥾').catch(() => {});
      await targetMessage.react('🔔').catch(() => {});
      await targetMessage.react('📢').catch(() => {});
    } catch (reactErr) { console.error(reactErr); }

    const allSeatedTags = playerIds.map(id => `<@${id}>`).join(' ');
    const customPingSentence = `<@${host.id}> is looking for live players${roleMention} for ${formatLine}.${allSeatedTags}`.trim();

    const pingMessage = await targetMessage.channel.send({
      content: customPingSentence,
      allowedMentions: { roles: ['1219666679764877424'], users: playerIds } 
    });

    setTimeout(() => {
      pingMessage.delete().catch(() => {});
    }, 1500);

    if (!hostIgnInfo.isKnown && promptUnknownHostIgn) {
      promptUnknownHostIgn(insertedMatch, host, targetMessage.channel);
    }
  }
};
