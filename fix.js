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

    if (action === 'add') {
      let currentTotal = players.length + guestPlayers.length;
      if (currentTotal >= 4) {
        return interaction.reply({ content: `❌ This lobby is already completely full (4/4).`, ephemeral: true });
      }

      const mentionRegex = /<@!?(\d+)>/g;
      let match;
      const parsedMentions = [];
      while ((match = mentionRegex.exec(targetInput)) !== null) {
        parsedMentions.push(match[1]);
      }

      if (parsedMentions.length > 0) {
        let addedCount = 0;
        for (const id of parsedMentions) {
          if (players.length + guestPlayers.length >= 4) break;
          if (!players.includes(id)) {
            players.push(id);
            addedCount++;
          }
        }
        logMessage = addedCount > 0 ? `✅ Added registered Discord users.` : `ℹ️ No new players were added.`;
      } else if (/^\d+$/.test(targetInput)) {
        const numberVal = parseInt(targetInput, 10);
        if (numberVal === 1 || numberVal === 2) {
          const count = Math.min(numberVal, 4 - (players.length + guestPlayers.length));
          for (let i = 0; i < count; i++) {
            guestPlayers.push(`Friend of ${interaction.user.username}`);
          }
          logMessage = `✅ Added ${count} guest slot(s).`;
        } else {
          return interaction.reply({ content: `❌ Invalid format. Numeric entry must be exactly 1 or 2.`, ephemeral: true });
        }
      } else {
        const rawNames = targetInput.split(',').map(n => n.trim()).filter(Boolean);
        let addedReal = 0;
        let addedGuest = 0;

        for (const name of rawNames) {
          if (players.length + guestPlayers.length >= 4) break;

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
            if (!players.includes(bestDbMatch)) {
              players.push(bestDbMatch);
              addedReal++;
            }
          } else {
            guestPlayers.push(name);
            addedGuest++;
          }
        }
        logMessage = `✅ Roster updated (Fuzzy Players: ${addedReal}, Guests: ${addedGuest}).`;
      }
    }

    if (action === 'remove') {
      const mentionMatch = targetInput.match(/<@!?(\d+)>/);
      let targetId = mentionMatch ? mentionMatch[1] : null;

      if (targetId) {
        if (targetId === lobby.host_id) {
          return interaction.reply({ content: `❌ The host cannot be removed from the lobby.`, ephemeral: true });
        }
        if (players.includes(targetId)) {
          players = players.filter(id => id !== targetId);
          notifications = notifications.filter(id => id !== targetId);
          logMessage = `✅ Removed player <@${targetId}>.`;
        } else {
          return interaction.reply({ content: `❌ That player is not present in this lobby.`, ephemeral: true });
        }
      } else {
        let bestMatch = null;
        let bestScore = 0;
        let bestTargetType = '';

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

        for (let i = 0; i < guestPlayers.length; i++) {
          const score = calculateSimilarity(targetInput, guestPlayers[i]);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = i;
            bestTargetType = 'guest';
          }
        }

        if (bestScore >= 0.60) {
          if (bestTargetType === 'player') {
            players = players.filter(id => id !== bestMatch);
            notifications = notifications.filter(id => id !== bestMatch);
            logMessage = `✅ Removed matched player <@${bestMatch}>.`;
          } else if (bestTargetType === 'guest') {
            const removedName = guestPlayers[bestMatch];
            guestPlayers.splice(bestMatch, 1);
            logMessage = `✅ Removed guest "${removedName}".`;
          }
        } else {
          return interaction.reply({ content: `❌ Could not confidently match "${targetInput}" to anyone in this lobby.`, ephemeral: true });
        }
      }
    }

    const totalCount = players.length + guestPlayers.length;
    await supabase
      .from('active_async_matches')
      .update({ player_ids: players, guest_players: guestPlayers, notify_user_ids: notifications })
      .eq('id', lobby.id);

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
      console.error(err);
    }

    return interaction.reply({ content: `${logMessage} Lobby updated.`, ephemeral: true });
  }
};
