const { SlashCommandBuilder, EmbedBuilder, userMention } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fix')
    .setDescription('Modify an active lobby roster by adding or removing players')
    .addStringOption(option =>
      option.setName('match_id')
        .setDescription('The unique identifier of the match (e.g., ReQuestValor-482)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Choose whether to add or remove targets')
        .setRequired(true)
        .addChoices(
          { name: 'Add Players/Guests', value: 'add' },
          { name: 'Remove Player/Guest', value: 'remove' }
        )
    )
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Tag a user, enter guest names, or a number (1 or 2) to add; or type the name to remove')
        .setRequired(true)
    ),

  async execute(interaction, { supabase }) {
    const matchId = interaction.options.getString('match_id').trim();
    const action = interaction.options.getString('action');
    const targetInput = interaction.options.getString('target').trim();

    // 1. Look up the active lobby
    const { data: lobby, error: fetchErr } = await supabase
      .from('active_async_matches')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();

    if (fetchErr || !lobby) {
      return interaction.reply({ content: `❌ Could not find an active lobby with Match ID \`${matchId}\`.`, ephemeral: true });
    }

    if (lobby.status !== 'searching') {
      return interaction.reply({ content: `❌ This lobby has already been ${lobby.status} and cannot be modified.`, ephemeral: true });
    }

    // Helper functions for fuzzy matching
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
    let logMessage = '';

    // --- HANDLE ADD ACTION ---
    if (action === 'add') {
      const currentTotal = players.length + guestPlayers.length;
      if (currentTotal >= 4) {
        return interaction.reply({ content: `❌ This lobby is already completely full (4/4).`, ephemeral: true });
      }
      const spaceLeft = 4 - currentTotal;

      // Check for Discord mentions
      const mentionRegex = /<@!?(\d+)>/g;
      let match;
      const parsedMentions = [];
      while ((match = mentionRegex.exec(targetInput)) !== null) {
        parsedMentions.push(match[1]);
      }

      if (parsedMentions.length > 0) {
        const toAdd = parsedMentions.slice(0, spaceLeft);
        let addedCount = 0;
        for (const id of toAdd) {
          if (!players.includes(id)) {
            players.push(id);
            addedCount++;
          }
        }
        logMessage = addedCount > 0 ? `✅ Added registered Discord users to the roster.` : `ℹ️ No new players were added (already in lobby).`;
      } else {
        // Integer Check: STRICTLY only allow 1 or 2. Ignore everything else completely.
        if (/^\d+$/.test(targetInput)) {
          const numberVal = parseInt(targetInput, 10);
          if (numberVal === 1 || numberVal === 2) {
            const count = Math.min(numberVal, spaceLeft);
            for (let i = 0; i < count; i++) {
              guestPlayers.push(`Friend of ${interaction.user.username}`);
            }
            logMessage = `✅ Added ${count} guest slot(s) to the roster.`;
          } else {
            return interaction.reply({ content: `❌ Invalid format. Numeric entry must be exactly 1 or 2.`, ephemeral: true });
          }
        } else {
          // Add as raw string names separated by comma
          const rawNames = targetInput.split(',').map(n => n.trim()).filter(Boolean);
          const toAddNames = rawNames.slice(0, spaceLeft);
          for (const name of toAddNames) {
            guestPlayers.push(name);
          }
          logMessage = `✅ Added custom guest name(s) to the roster.`;
        }
      }
    }

    // --- HANDLE REMOVE ACTION ---
    if (action === 'remove') {
      const mentionMatch = targetInput.match(/<@!?(\d+)>/);
      let targetId = mentionMatch ? mentionMatch[1] : null;

      if (targetId) {
        if (targetId === lobby.host_id) {
          return interaction.reply({ content: `❌ The host cannot be removed from the lobby. Use the ❌ reaction or cancel flows instead.`, ephemeral: true });
        }
        if (players.includes(targetId)) {
          players = players.filter(id => id !== targetId);
          notifications = notifications.filter(id => id !== targetId);
          logMessage = `✅ Removed player <@${targetId}> from the lobby.`;
        } else {
          return interaction.reply({ content: `❌ That player is not present in this lobby.`, ephemeral: true });
        }
      } else {
        // Run Fuzzy matching verification loops over all present occupants
        let bestMatch = null;
        let bestScore = 0;
        let bestTargetType = ''; // 'player' or 'guest'

        // Scan Discord Users (fetching cached name values)
        for (const pid of players) {
          if (pid === lobby.host_id) continue;
          const cachedUser = interaction.guild.members.cache.get(pid)?.user;
          const namePool = [cachedUser?.username, cachedUser?.globalName].filter(Boolean);
          for (const name of namePool) {
            const score = calculateSimilarity(targetInput, name);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = pid;
              bestTargetType = 'player';
            }
          }
        }

        // Scan Guest String Names
        for (let i = 0; i < guestPlayers.length; i++) {
          const score = calculateSimilarity(targetInput, guestPlayers[i]);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = i; // Store array index configuration coordinate
            bestTargetType = 'guest';
          }
        }

        // Threshold evaluation limit criteria checking
        if (bestScore >= 0.60) {
          if (bestTargetType === 'player') {
            players = players.filter(id => id !== bestMatch);
            notifications = notifications.filter(id => id !== bestMatch);
            logMessage = `✅ Fuzzy match success (${Math.floor(bestScore * 100)}%): Removed <@${bestMatch}>.`;
          } else if (bestTargetType === 'guest') {
            const removedName = guestPlayers[bestMatch];
            guestPlayers.splice(bestMatch, 1); // Pops out exactly the first instance found
            logMessage = `✅ Fuzzy match success (${Math.floor(bestScore * 100)}%): Removed guest "${removedName}".`;
          }
        } else {
          return interaction.reply({ content: `❌ Could not confidently match "${targetInput}" to any player or guest in this lobby.`, ephemeral: true });
        }
      }
    }

    // 2. Persist updated changes to Supabase database columns
    const totalCount = players.length + guestPlayers.length;
    await supabase
      .from('active_async_matches')
      .update({ player_ids: players, guest_players: guestPlayers, notify_user_ids: notifications })
      .eq('id', lobby.id);

    // 3. Re-fetch original Discord parent message context to refresh embed markup UI layout frames
    try {
      const channel = await interaction.guild.channels.fetch(lobby.channel_id).catch(() => null);
      if (channel) {
        const targetMessage = await channel.messages.fetch(lobby.message_id).catch(() => null);
        if (targetMessage && targetMessage.embeds[0]) {
          const embed = EmbedBuilder.from(targetMessage.embeds[0]);
          
          const mentionsList = players.map(id => `• <@${id}>${notifications.includes(id) ? ' 🔔' : ''}`);
          const guestsList = guestPlayers.map(name => `• ${name} 👥`);
          const fullRosterDisplay = [...mentionsList, ...guestsList].join('\n');

          embed.setFields(
            { name: targetMessage.embeds[0].fields[0].name, value: targetMessage.embeds[0].fields[0].value, inline: false },
            { name: '🔑 Password', value: lobby.lobby_password ? `\`${lobby.lobby_password}\`` : 'Check chat for more info', inline: false },
            { name: `👥 Players (${totalCount}/4)`, value: fullRosterDisplay, inline: false },
            { name: targetMessage.embeds[0].fields[3].name, value: targetMessage.embeds[0].fields[3].value, inline: false }
          );

          await targetMessage.edit({ embeds: [embed] });
        }
      }
    } catch (err) {
      console.error('Failed to dynamically update target lobby embed fields via /fix execution:', err);
    }

    return interaction.reply({ content: `${logMessage} Lobby layout updated successfully.`, ephemeral: true });
  }
};
