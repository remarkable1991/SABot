const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const LFG_ADMIN_ROLE = '1557469534133162045';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/^[.\s]+|[.\s]+$/g, '').replace(/[^a-z0-9]/g, '');
}

function similarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
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
}

// Strips Dire Wolf / Discord tags like #1234 or +1234
function cleanScreenshotName(rawInput) {
  if (!rawInput) return { cleaned: '', hadTag: false };
  const trimmed = String(rawInput).trim();
  const tagRegex = /\s*[#+]\d{3,6}$/;
  const hadTag = tagRegex.test(trimmed);
  const cleaned = trimmed.replace(tagRegex, '').trim();
  return { cleaned, hadTag };
}

async function getDuplicateHolders(supabase, discordUserId, playerKey) {
  try {
    const { data: existingHolders } = await supabase
      .from('player_discord_map')
      .select('discord_user_id, discord_username, display_name')
      .eq('player_key', playerKey)
      .neq('discord_user_id', discordUserId);

    return (existingHolders || []).filter(r => r.discord_user_id);
  } catch (err) {
    return [];
  }
}

function buildStatsSentence(matchedRating) {
  if (matchedRating && Number(matchedRating.games_played) > 0) {
    return `📊 **Leaderboard Stats:** **${Number(matchedRating.elo).toFixed(1)} ELO** (${matchedRating.games_played} games played on record).`;
  }
  return `📊 **Leaderboard Stats:** No completed games recorded under this name yet—your future matches will track here automatically!`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ign')
    .setDescription('Check or register your Dune: Imperium Digital In-Game Name (as shown on match screenshots)')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Your exact In-Game Name on the end-of-game scoreboard (NO #1234 numbers)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase, saveDiscordPlayerMap }) {
    // Public reply so everyone can see when /ign is used
    await interaction.deferReply();

    const discordId = interaction.user.id;
    const rawInput = interaction.options.getString('name');
    const { cleaned: cleanedInput, hadTag } = cleanScreenshotName(rawInput);

    const { data: existingMap } = await supabase
      .from('player_discord_map')
      .select('id, player_key, display_name, claimed_by')
      .eq('discord_user_id', discordId)
      .limit(1)
      .maybeSingle();

    const { data: allRatings } = await supabase
      .from('player_ratings')
      .select('player_key, display_name, elo, games_played')
      .eq('game_version', 'overall');

    const ratingsList = allRatings || [];

    // =========================================================================
    // CASE A: User ALREADY has a linked IGN
    // =========================================================================
    if (existingMap && existingMap.player_key) {
      const oldRating = ratingsList.find(r => r.player_key === existingMap.player_key);
      const oldDisplay = oldRating?.display_name || existingMap.display_name || existingMap.player_key;
      const oldProfileUrl = `https://dunestats.cc/players/${encodeURIComponent(oldDisplay)}`;
      const oldStatsLine = buildStatsSentence(oldRating);

      // Subcase A1: They just ran `/ign` (or typed the exact same name they already have)
      if (!cleanedInput || normalizeName(cleanedInput) === existingMap.player_key) {
        const embed = new EmbedBuilder()
          .setTitle('🎮 Linked In-Game Name')
          .setColor(0x2ECC71)
          .setDescription(
            `<@${discordId}> is registered as **[${oldDisplay}](${oldProfileUrl})**.\n` +
            `${oldStatsLine}\n\n` +
            `💡 *Need to fix or change your linked name? Run \`/ign name: YourNewName\` (only use the exact name shown on the end-of-game scoreboard screenshot, without \`#1234\` numbers).*`
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // Subcase A2: They ran `/ign name: NewName` -> Ask for 1-click confirmation before overwriting & tagging admin
      const newNormKey = normalizeName(cleanedInput);
      const newRating = ratingsList.find(r => r.player_key === newNormKey);
      const newDisplay = newRating?.display_name || cleanedInput;
      const newProfileUrl = `https://dunestats.cc/players/${encodeURIComponent(newDisplay)}`;
      const newStatsLine = buildStatsSentence(newRating);

      const tagWarning = hadTag
        ? `\n⚠️ *Stripped \`#/+numbers\` from \`${rawInput}\` -> **\`${newDisplay}\`** (friend code numbers don't appear on screenshots).*`
        : '';

      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirm In-Game Name Overwrite')
        .setColor(0xF39C12)
        .setDescription(
          `<@${discordId}>, your Discord is currently linked to **[${oldDisplay}](${oldProfileUrl})**.\n\n` +
          `Are you sure you want to overwrite your In-Game Name to **[${newDisplay}](${newProfileUrl})**?${tagWarning}\n` +
          `${newStatsLine}\n\n` +
          `*Note: Overwriting an existing IGN will notify the LFG Admins to keep player records clean.*`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ign_confirm_overwrite')
          .setLabel(`Confirm Change to "${newDisplay}"`.slice(0, 80))
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId('ign_cancel_overwrite')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✖️')
      );

      const replyMsg = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
      const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async (btnInt) => {
        if (btnInt.user.id !== discordId) {
          return btnInt.reply({ content: '❌ Only the player who ran `/ign` can click this button.', ephemeral: true }).catch(() => {});
        }

        if (btnInt.customId === 'ign_cancel_overwrite') {
          await btnInt.update({
            content: `✖️ <@${discordId}> cancelled the IGN change (still linked to **[${oldDisplay}](${oldProfileUrl})**).`,
            embeds: [],
            components: []
          }).catch(() => {});
          collector.stop();
          return;
        }

        if (btnInt.customId === 'ign_confirm_overwrite') {
          const dupHolders = await getDuplicateHolders(supabase, discordId, newNormKey);
          await saveDiscordPlayerMap({
            discordUserId: discordId,
            discordUsername: interaction.user.username,
            displayName: newDisplay,
            playerKey: newNormKey
          });
          await supabase.from('discord_guild_members').update({ suggested_player_key: newNormKey, has_verified_map: true }).eq('discord_user_id', discordId);

          let adminAlertText = `🔔 <@&${LFG_ADMIN_ROLE}> **IGN Overwrite:** <@${discordId}> changed their linked In-Game Name from **[${oldDisplay}](<${oldProfileUrl}>)** ➡️ **[${newDisplay}](<${newProfileUrl}>)**.\n${newStatsLine}`;
          if (dupHolders.length > 0) {
            const otherMentions = dupHolders.map(r => `<@${r.discord_user_id}>`).join(', ');
            adminAlertText += `\n⚠️ **Duplicate IGN Notice:** **${newDisplay}** is also linked to ${otherMentions}—please clarify if this is an alt or mix-up!`;
          }

          await btnInt.update({
            content: adminAlertText,
            embeds: [],
            components: [],
            allowedMentions: { roles: [LFG_ADMIN_ROLE], users: [discordId, ...dupHolders.map(u => u.discord_user_id)] }
          }).catch(() => {});
          collector.stop();
        }
      });
      return;
    }

    // =========================================================================
    // CASE B: User has NO linked IGN yet
    // =========================================================================

    // Subcase B1: They provided a name (`/ign name: MyName`) -> Register immediately!
    if (cleanedInput) {
      const normKey = normalizeName(cleanedInput);
      const matchedRating = ratingsList.find(r => r.player_key === normKey);
      const finalDisplay = matchedRating?.display_name || cleanedInput;
      const profileUrl = `https://dunestats.cc/players/${encodeURIComponent(finalDisplay)}`;
      const statsLine = buildStatsSentence(matchedRating);

      const dupHolders = await getDuplicateHolders(supabase, discordId, normKey);
      await saveDiscordPlayerMap({
        discordUserId: discordId,
        discordUsername: interaction.user.username,
        displayName: finalDisplay,
        playerKey: normKey
      });
      await supabase.from('discord_guild_members').update({ suggested_player_key: normKey, has_verified_map: true }).eq('discord_user_id', discordId);

      const tagNote = hadTag ? `\n*(Note: Stripped \`#/+numbers\` from \`${rawInput}\` -> **\`${finalDisplay}\`**)*` : '';
      let contentMsg = `✅ <@${discordId}> registered their In-Game Name to **[${finalDisplay}](<${profileUrl}>)**!${tagNote}\n${statsLine}`;

      if (dupHolders.length > 0) {
        const otherMentions = dupHolders.map(r => `<@${r.discord_user_id}>`).join(', ');
        contentMsg += `\n\n⚠️ <@&${LFG_ADMIN_ROLE}> **Duplicate IGN Notice:** **${finalDisplay}** is also linked to ${otherMentions}—please clarify!`;
      }

      return interaction.editReply({
        content: contentMsg,
        allowedMentions: { roles: [LFG_ADMIN_ROLE], users: [discordId, ...dupHolders.map(u => u.discord_user_id)] }
      });
    }

    // Subcase B2: They ran `/ign` with NO name and aren't linked yet -> Show fuzzy guesses + instructions
    const candidateNames = [
      interaction.member?.nickname,
      interaction.member?.displayName,
      interaction.user.globalName,
      interaction.user.username
    ].filter(Boolean);

    const scoredMatches = [];
    for (const r of ratingsList) {
      let maxScore = 0;
      for (const cand of candidateNames) {
        const s = Math.max(similarity(cand, r.display_name), similarity(cand, r.player_key));
        if (s > maxScore) maxScore = s;
      }
      if (maxScore >= 0.60) {
        scoredMatches.push({ ...r, score: maxScore });
      }
    }
    scoredMatches.sort((a, b) => b.score - a.score);
    const topSuggestions = scoredMatches.slice(0, 3);

    let desc = `<@${discordId}>, you don't have a Dune: Imperium Digital **In-Game Name (IGN)** linked yet!\n\n` +
      `📸 **What is your IGN?**\n` +
      `It is the **exact name shown on the end-of-game scoreboard screenshot** (without any \`#1234\` or \`+1234\` friend code numbers).\n\n` +
      `👉 **To register your name:** Type **\`/ign name: YourExactInGameName\`**`;

    const components = [];
    if (topSuggestions.length > 0) {
      desc += `\n\n🔍 **Or click a button below if one of these leaderboard profiles is you:**\n`;
      const row = new ActionRowBuilder();
      topSuggestions.forEach((s, i) => {
        const pUrl = `https://dunestats.cc/players/${encodeURIComponent(s.display_name)}`;
        desc += `• **[${s.display_name}](${pUrl})** — **${Number(s.elo).toFixed(1)} ELO** (${s.games_played || 0} games)\n`;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ign_quickclaim_${s.player_key}`)
            .setLabel(`Link "${s.display_name}"`.slice(0, 80))
            .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Primary)
            .setEmoji('✅')
        );
      });
      components.push(row);
    }

    const embed = new EmbedBuilder()
      .setTitle('🎮 Link Your Dune: Imperium Digital IGN')
      .setColor(0xF1C40F)
      .setDescription(desc);

    const replyMsg = await interaction.editReply({ embeds: [embed], components });
    if (components.length === 0) return;

    const collector = replyMsg.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async (btnInt) => {
      if (btnInt.user.id !== discordId) {
        return btnInt.reply({ content: '❌ Only the player who ran `/ign` can click this button.', ephemeral: true }).catch(() => {});
      }

      if (btnInt.customId.startsWith('ign_quickclaim_')) {
        const pk = btnInt.customId.replace('ign_quickclaim_', '');
        const matchedRating = ratingsList.find(r => r.player_key === pk);
        const finalDisplay = matchedRating?.display_name || pk;
        const profileUrl = `https://dunestats.cc/players/${encodeURIComponent(finalDisplay)}`;
        const statsLine = buildStatsSentence(matchedRating);

        const dupHolders = await getDuplicateHolders(supabase, discordId, pk);
        await saveDiscordPlayerMap({
          discordUserId: discordId,
          discordUsername: interaction.user.username,
          displayName: finalDisplay,
          playerKey: pk
        });
        await supabase.from('discord_guild_members').update({ suggested_player_key: pk, has_verified_map: true }).eq('discord_user_id', discordId);

        let contentMsg = `✅ <@${discordId}> registered their In-Game Name to **[${finalDisplay}](<${profileUrl}>)**!\n${statsLine}`;
        if (dupHolders.length > 0) {
          const otherMentions = dupHolders.map(r => `<@${r.discord_user_id}>`).join(', ');
          contentMsg += `\n\n⚠️ <@&${LFG_ADMIN_ROLE}> **Duplicate IGN Notice:** **${finalDisplay}** is also linked to ${otherMentions}—please clarify!`;
        }

        await btnInt.update({
          content: contentMsg,
          embeds: [],
          components: [],
          allowedMentions: { roles: [LFG_ADMIN_ROLE], users: [discordId, ...dupHolders.map(u => u.discord_user_id)] }
        }).catch(() => {});
        collector.stop();
      }
    });
  }
};
