const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const EMOJI_GUIDE_LINK = 'https://discord.com/channels/747212662483583069/1561400611348553810';
const ASYNC_ROLE_ID = '1219666516644204554';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('async')
    .setDescription('Look for opponents for an async game')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Any extra details or notes for this match')
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
    .addIntegerOption(option =>
      option.setName('hours')
        .setDescription('How many hours before the lobby expires? (Defaults to 15 hours)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase, buildRosterDisplay, resolveHostIgn, promptUnknownHostIgn }) {
    await interaction.deferReply();

    const rawCustomText = interaction.options.getString('text')?.trim() || null;
    const dbMessageText = rawCustomText || 'Looking for an async match!';
    const password = interaction.options.getString('password') || 'None';
    const playersInput = interaction.options.getString('players');
    const board = interaction.options.getString('board');
    let expansion = interaction.options.getString('expansion');
    const selectedMode = interaction.options.getString('mode');
    const customHours = interaction.options.getInteger('hours');
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
    const asyncDuneEmoji = getCustomEmoji('AsyncDune', '<:AsyncDune:1232048177390289097>');
    
    const hoursToExpiry = customHours ? Math.max(customHours, 1) : 15;
    const expirationMs = hoursToExpiry * 60 * 60 * 1000;
    const expiresAtISO = new Date(Date.now() + expirationMs).toISOString();

    const asyncRole = guild?.roles.cache.find(r => r.name === 'DuneASYNC');
    const targetRoleId = asyncRole ? asyncRole.id : ASYNC_ROLE_ID;
    const roleMention = `<@&${targetRoleId}>`;

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

    const { display: fullRosterDisplay, count: totalSlotCount } = buildRosterDisplay
      ? await buildRosterDisplay({
          player_ids: playerIds,
          guest_players: guestPlayers,
          web_player_names: [],
          web_player_ids: [],
          notify_user_ids: [],
          is_league: false
        })
      : { display: playerIds.map(id => `• <@${id}>`).join('\n'), count: playerIds.length + guestPlayers.length };

    const hostIgnInfo = resolveHostIgn ? await resolveHostIgn(host.id) : { ign: null, isKnown: false };
    const lobbyNameLine = hostIgnInfo.isKnown
      ? `🎮 In-Game Lobby: **${hostIgnInfo.ign}'s game**`
      : `🎮 In-Game Lobby: *(Waiting for host IGN...)*`;

    // --- SEQUENTIAL HOST MATCH ID CREATION ENGINE (HostName-A#) ---
    const cleanHostName = (hostIgnInfo.ign || host.username).replace(/[^a-zA-Z0-9]/g, '') || 'Host';
    const prefixPattern = `${cleanHostName}-A`;
    let generatedMatchId = `${prefixPattern}1`;

    try {
      const { data: existingHostLobbies } = await supabase
        .from('active_async_matches')
        .select('match_id')
        .ilike('match_id', `${prefixPattern}%`);

      if (existingHostLobbies && existingHostLobbies.length > 0) {
        let maxNumber = 0;
        const numberRegex = new RegExp(`^${cleanHostName}-A(\\d+)$`, 'i');

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
      console.error('Error generating host-based match ID:', idErr);
    }

    const descLines = [];
    if (rawCustomText) descLines.push(`"${rawCustomText}"\n`);
    descLines.push(formatLine);
    descLines.push(lobbyNameLine);

    const footerGuideBlock = `${asyncDuneEmoji} • **Join / Leave** the lobby\n📖 **[Emoji Controls Guide](${EMOJI_GUIDE_LINK})**`;

    const embed = new EmbedBuilder()
      .setTitle(`${asyncDuneEmoji} New Async Match Open!`)
      .setDescription(descLines.join('\n'))
      .setColor(0xC9A24B)
      .addFields(
        { name: `👥 Players (${totalSlotCount}/4)\n\u200B`, value: `${fullRosterDisplay}\n\n${footerGuideBlock}`, inline: false }
      )
      .setTimestamp();

    let initialCopyableContent = '🎮 Generating lobby link...';
    if (password !== 'None') {
      initialCopyableContent = `🔑 Lobby Password: \`${password}\` *(Tap to copy)*`;
    }

    const response = await interaction.editReply({ content: initialCopyableContent, embeds: [embed] });
    const targetMessageId = response.id;
    const targetMessage = await interaction.channel.messages.fetch(targetMessageId);

    const { data: insertedMatch, error: insertError } = await supabase
      .from('active_async_matches')
      .insert({
        message_id: targetMessageId,
        match_id: generatedMatchId,
        channel_id: interaction.channelId,
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
        mode: 'async',
        is_league: false,
        season_id: null,
        league_status: null,
        expected_player_keys: [],
        discord_usernames: []
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Failed to insert async lobby into Supabase:', insertError);
      return;
    }

    const numericLobbyId = insertedMatch.id;
    const finalizedLines = [];
    if (password !== 'None') finalizedLines.push(`🔑 Lobby Password: \`${password}\` *(Tap to copy)*`);
    finalizedLines.push(`🔗 **Manage Lobby & Submit:** https://dunestats.cc/LFG/${numericLobbyId}`);
    await targetMessage.edit({ content: finalizedLines.join('\n') });

    try {
      const customJoinEmoji = guild.emojis.cache.find((e) => e.name === 'AsyncDune');
      await targetMessage.react(customJoinEmoji ? customJoinEmoji.id : '1232048177390289097').catch(() => {});
      await targetMessage.react('🙋').catch(() => {});
      await targetMessage.react('🎮').catch(() => {});
      await targetMessage.react('❌').catch(() => {});
      await targetMessage.react('🥾').catch(() => {});
      await targetMessage.react('🔔').catch(() => {});
      await targetMessage.react('📢').catch(() => {});
    } catch (reactErr) { console.error(reactErr); }

    const allSeatedTags = playerIds.map(id => `<@${id}>`).join(' ');
    const customPingSentence = `<@${host.id}> is looking for async players ${roleMention} for ${formatLine}. ${allSeatedTags}`.trim();

    const pingMessage = await targetMessage.channel.send({
      content: customPingSentence,
      allowedMentions: { roles: [targetRoleId], users: playerIds }
    });

    setTimeout(() => {
      pingMessage.delete().catch(() => {});
    }, 1500);

    if (!hostIgnInfo.isKnown && promptUnknownHostIgn) {
      promptUnknownHostIgn(insertedMatch, host, targetMessage.channel);
    }
  }
};
