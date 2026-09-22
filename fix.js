const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fix')
    .setDescription('Modify an active lobby roster, settings, password, or expansions')
    .addStringOption(option =>
      option.setName('match_id')
        .setDescription('The unique identifier of the match (e.g., ReQuestValor-482)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Choose whether to add or remove targets')
        .setRequired(false)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
    )
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Tag a user, enter guest names, or a number (1 or 2) to add/remove')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('password')
        .setDescription('Update the lobby password (type "None" to remove)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('board')
        .setDescription('Update game base variant')
        .setRequired(false)
        .addChoices(
          { name: 'Base Game', value: 'Base' },
          { name: 'Uprising', value: 'Uprising' }
        )
    )
    .addStringOption(option =>
      option.setName('expansion')
        .setDescription('Update expansion packages')
        .setRequired(false)
        .addChoices(
          { name: 'Rise of Ix', value: 'Ix' },
          { name: 'Immortality', value: 'Immortality' },
          { name: 'Ix + Immortality', value: 'Ix_Immo' }
        )
    )
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Update additional game variants/modes')
        .setRequired(false)
        .addChoices(
          { name: 'Epic Mode', value: 'Epic' },
          { name: 'Base Leaders', value: 'BaseLeaders' },
          { name: 'CHOAM Module', value: 'CHOAM' },
          { name: 'Base Leaders + CHOAM', value: 'Leaders_CHOAM' }
        )
    )
    .addStringOption(option =>
      option.setName('notes')
        .setDescription('Update the lobby notes/message')
        .setRequired(false)
    ),

  async execute(interaction, { supabase }) {
    const matchId = interaction.options.getString('match_id').trim();
    const action = interaction.options.getString('action');
    const targetInput = interaction.options.getString('target')?.trim();
    const password = interaction.options.getString('password');
    const board = interaction.options.getString('board');
    let expansion = interaction.options.getString('expansion');
    const selectedMode = interaction.options.getString('mode');
    const notes = interaction.options.getString('notes');

    if (!action && !targetInput && !password && !board && !expansion && !selectedMode && !notes) {
      return interaction.reply({ content: '❌ You must specify at least one setting or roster change to apply.', flags: MessageFlags.Ephemeral });
    }

    if (targetInput && !action) {
      return interaction.reply({ content: '❌ You must select an `action` (Add/Remove) when providing a `target`.', flags: MessageFlags.Ephemeral });
    }

    const { data: lobby, error: fetchErr } = await supabase
      .from('active_async_matches')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();

    if (fetchErr || !lobby) {
      return interaction.reply({ content: `❌ Could not find an active lobby with Match ID \`${matchId}\`.`, flags: MessageFlags.Ephemeral });
    }

    if (lobby.status !== 'searching') {
      return interaction.reply({ content: `❌ This lobby has already been ${lobby.status} and cannot be modified.`, flags: MessageFlags.Ephemeral });
    }

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

    let players = [...(lobby.player_ids || [])];
    let guestPlayers = [...(lobby.guest_players || [])];
    let notifications = [...(lobby.notify_user_ids || [])];
    let logMessages = [];
    const currentTotal = players.length + guestPlayers.length + (lobby.web_player_names?.length || 0);

    // --- ROSTER MODIFICATIONS ---
    if (action && targetInput) {
      if (action === 'add') {
        if (currentTotal >= 4) return interaction.reply({ content: `❌ Lobby full (4/4).`, flags: MessageFlags.Ephemeral });

        const mentionRegex = /<@!?(\d+)>/g;
        let match;
        const parsedMentions = [];
        while ((match = mentionRegex.exec(targetInput)) !== null) parsedMentions.push(match[1]);

        if (parsedMentions.length > 0) {
          for (const id of parsedMentions.slice(0, 2)) {
            if (players.length + guestPlayers.length + (lobby.web_player_names?.length || 0) >= 4) break;
            if (!players.includes(id)) { players.push(id); logMessages.push(`Added <@${id}>.`); }
          }
        } else if (/^\d+$/.test(targetInput)) {
          const num = parseInt(targetInput, 10);
          if (num === 1 || num === 2) {
            const limit = Math.min(num, 4 - currentTotal);
            for (let i = 0; i < limit; i++) guestPlayers.push(`Friend of ${interaction.user.username}`);
            logMessages.push(`Added ${limit} guest(s).`);
          } else {
            return interaction.reply({ content: `❌ Numeric guest entry must be 1 or 2.`, flags: MessageFlags.Ephemeral });
          }
        } else {
          const rawNames = targetInput.split(',').map(n => n.trim()).filter(Boolean);
          for (const name of rawNames.slice(0, 2)) {
            if (players.length + guestPlayers.length + (lobby.web_player_names?.length || 0) >= 4) break;
            let bestDbMatch = null;
            let bestScore = 0;
            try {
              const { data: dbRows } = await supabase.from('player_discord_map')
                .select('discord_user_id, display_name, discord_username, player_key')
                .or(`display_name.ilike.%${name}%,discord_username.ilike.%${name}%`)
                .limit(5);
              for (const row of dbRows || []) {
                if (!row.discord_user_id) continue;
                const sc = Math.max(calculateSimilarity(name, row.display_name), calculateSimilarity(name, row.discord_username), calculateSimilarity(name, row.player_key));
                if (sc > bestScore) { bestScore = sc; bestDbMatch = row.discord_user_id; }
              }
            } catch (e) {}

            if (bestDbMatch && bestScore >= 0.72) {
              if (!players.includes(bestDbMatch)) { players.push(bestDbMatch); logMessages.push(`Added matched player <@${bestDbMatch}>.`); }
            } else {
              guestPlayers.push(name); logMessages.push(`Added guest "${name}".`);
            }
          }
        }
      }

      if (action === 'remove') {
        const mentionMatch = targetInput.match(/<@!?(\d+)>/);
        if (mentionMatch) {
          const tId = mentionMatch[1];
          if (tId === lobby.host_id) return interaction.reply({ content: `❌ The host cannot be removed.`, flags: MessageFlags.Ephemeral });
          if (players.includes(tId)) {
            players = players.filter(id => id !== tId);
            notifications = notifications.filter(id => id !== tId);
            logMessages.push(`Removed <@${tId}>.`);
          }
        } else {
          let bestMatch = null, bestScore = 0, targetType = '';
          for (const pid of players) {
            if (pid === lobby.host_id) continue;
            const u = interaction.guild.members.cache.get(pid)?.user;
            for (const n of [u?.username, u?.globalName].filter(Boolean)) {
              const sc = calculateSimilarity(targetInput, n);
              if (sc > bestScore) { bestScore = sc; bestMatch = pid; targetType = 'player'; }
            }
          }
          for (let i = 0; i < guestPlayers.length; i++) {
            const sc = calculateSimilarity(targetInput, guestPlayers[i]);
            if (sc > bestScore) { bestScore = sc; bestMatch = i; targetType = 'guest'; }
          }
          if (bestScore >= 0.60) {
            if (targetType === 'player') {
              players = players.filter(id => id !== bestMatch);
              notifications = notifications.filter(id => id !== bestMatch);
              logMessages.push(`Removed <@${bestMatch}>.`);
            } else {
              logMessages.push(`Removed guest "${guestPlayers[bestMatch]}".`);
              guestPlayers.splice(bestMatch, 1);
            }
          } else {
            logMessages.push(`Could not match "${targetInput}" to a Discord/Guest player.`);
          }
        }
      }
    }

    // --- GAME SETTINGS MODIFICATIONS ---
    let newBoardText = lobby.board_type || 'Base Game';
    let newExpansions = lobby.expansions || [];
    let newPassword = password !== undefined ? (password === 'None' ? null : password) : lobby.lobby_password;
    let newNotes = notes !== null ? notes : lobby.message_text;

    if (board || expansion || selectedMode) {
      const ixEmoji = getCustomEmoji('Ix', '');
      const immoEmoji = getCustomEmoji('Immo', '');
      const epicEmoji = getCustomEmoji('Epic', '');
      const uprisingEmoji = getCustomEmoji('Uprising', '');
      const choamEmoji = getCustomEmoji('CHOAM', '');

      const isUprising = board === 'Uprising' || (!board && String(lobby.board_type).includes('Uprising'));
      let activeMode = selectedMode;
      let activeExpansion = expansion;

      if (!activeExpansion) {
        if (newExpansions.some(e => e.includes('Rise of IX'))) activeExpansion = 'Ix';
        if (newExpansions.some(e => e.includes('Immortality'))) activeExpansion = activeExpansion ? 'Ix_Immo' : 'Immortality';
      }
      if (!activeMode) {
        if (newExpansions.some(e => e.includes('Epic'))) activeMode = 'Epic';
        if (newExpansions.some(e => e.includes('Base Leaders'))) activeMode = 'BaseLeaders';
        if (newExpansions.some(e => e.includes('CHOAM'))) activeMode = activeMode ? 'Leaders_CHOAM' : 'CHOAM';
      }

      if (activeMode === 'Epic' && activeExpansion !== 'Ix' && activeExpansion !== 'Ix_Immo') {
        activeExpansion = activeExpansion === 'Immortality' ? 'Ix_Immo' : 'Ix';
      }
      if ((activeMode === 'BaseLeaders' || activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') && !isUprising) activeMode = null; 

      newExpansions = [];
      if (activeExpansion === 'Ix' || activeExpansion === 'Ix_Immo') newExpansions.push(`${ixEmoji} Rise of IX`.trim());
      if (activeExpansion === 'Immortality' || activeExpansion === 'Ix_Immo') newExpansions.push(`${immoEmoji} Immortality`.trim());
      if (activeMode === 'Epic') newExpansions.push(`${epicEmoji} Epic Mode`.trim());
      if (activeMode === 'BaseLeaders' || activeMode === 'Leaders_CHOAM') newExpansions.push('Base Leaders');
      if (activeMode === 'CHOAM' || activeMode === 'Leaders_CHOAM') newExpansions.push(`${choamEmoji} CHOAM Module`.trim());

      if (board === 'Uprising') newBoardText = `${uprisingEmoji} Uprising`.trim();
      else if (board === 'Base') newBoardText = 'Base Game';

      logMessages.push(`Updated game modes/board.`);
    }

    if (password !== null) logMessages.push(password === 'None' ? `Removed password.` : `Updated password.`);
    if (notes !== null) logMessages.push(`Updated lobby notes.`);

    // --- APPLY UPDATES TO DB & LET REALTIME HANDLE EMBED ---
    const newTotalCount = players.length + guestPlayers.length + (lobby.web_player_names?.length || 0);
    let updatePayload = { 
      player_ids: players, 
      guest_players: guestPlayers, 
      notify_user_ids: notifications,
      lobby_password: newPassword,
      board_type: newBoardText,
      expansions: newExpansions,
      message_text: newNotes
    };

    let channelMsgToPost = null;

    if (newTotalCount === 4 && !lobby.auto_start_at) {
      const startTargetDate = new Date(Date.now() + 15 * 60 * 1000);
      updatePayload.auto_start_at = startTargetDate.toISOString();
      channelMsgToPost = `⏳ **Lobby full!** Match will automatically begin <t:${Math.floor(startTargetDate.getTime() / 1000)}:R>. Set up your in-game rooms now!`;
    } else if (newTotalCount < 4 && lobby.auto_start_at) {
      updatePayload.auto_start_at = null;
      channelMsgToPost = `⚠️ **Roster drop verified.** Automated match countdown for lobby \`${lobby.match_id}\` aborted.`;
    }

    await supabase.from('active_async_matches').update(updatePayload).eq('id', lobby.id);

    try {
      const channel = await interaction.guild.channels.fetch(lobby.channel_id).catch(() => null);
      if (channel && channelMsgToPost) {
        await channel.send({ content: channelMsgToPost }).catch(() => {});
      }
    } catch (err) {}

    return interaction.reply({ content: logMessages.length > 0 ? logMessages.join('\n') : '✅ Re-synced lobby settings cleanly.', flags: MessageFlags.Ephemeral });
  }
};
