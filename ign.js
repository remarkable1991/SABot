const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');

const LFG_ADMIN_ALERT_CHANNEL_ID = '937921061180309505';
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

function cleanScreenshotName(rawInput) {
  if (!rawInput) return { cleaned: '', hadTag: false };
  const trimmed = String(rawInput).trim();
  const tagRegex = /\s*[#+]\d{3,6}$/;
  const hadTag = tagRegex.test(trimmed);
  const cleaned = trimmed.replace(tagRegex, '').trim();
  return { cleaned, hadTag };
}

async function checkAndAlertDuplicateIgn(supabase, discordClient, newDiscordUserId, playerKey, displayName) {
  try {
    const { data: existingHolders } = await supabase
      .from('player_discord_map')
      .select('discord_user_id, discord_username, display_name')
      .eq('player_key', playerKey)
      .neq('discord_user_id', newDiscordUserId);

    const otherDiscordUsers = (existingHolders || []).filter(r => r.discord_user_id);
    if (otherDiscordUsers.length > 0) {
      const otherMentions = otherDiscordUsers.map(r => `<@${r.discord_user_id}> (${r.discord_username || r.display_name || 'User'})`).join(', ');
      const alertChannel = await discordClient.channels.fetch(LFG_ADMIN_ALERT_CHANNEL_ID).catch(() => null);
      if (alertChannel) {
        await alertChannel.send({
          content: `⚠️ <@&${LFG_ADMIN_ROLE}> **Duplicate IGN Linked — Clarification Needed:**\n<@${newDiscordUserId}> just linked the In-Game Name **\`${displayName}\`** (\`${playerKey}\`), which is also linked to ${otherMentions}. Both accounts currently share this IGN—please check if this is an alt account or a mix-up!`,
          allowedMentions: { roles: [LFG_ADMIN_ROLE], users: [newDiscordUserId, ...otherDiscordUsers.map(u => u.discord_user_id)] }
        }).catch(() => {});
      }
      return true;
    }
  } catch (err) {
    console.error('Error checking duplicate IGN:', err);
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ign')
    .setDescription('Check or link your Dune: Imperium Digital In-Game Name (as shown on match screenshots)')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Optional: Your exact In-Game Name on the end-of-game scoreboard (NO #1234 numbers)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase, discordClient, saveDiscordPlayerMap }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

    // CASE A: Already linked
    if (existingMap && existingMap.player_key) {
      const matchedRating = ratingsList.find(r => r.player_key === existingMap.player_key);
      const currentDisplay = matchedRating?.display_name || existingMap.display_name || existingMap.player_key;
      const profileUrl = `https://dunestats.cc/players/${encodeURIComponent(currentDisplay)}`;
      const statsStr = matchedRating
        ? `**${Number(matchedRating.elo).toFixed(1)} ELO** (${matchedRating.games_played || 0} games tracked)`
        : `*No completed matches recorded under this name yet*`;

      const embed = new EmbedBuilder()
        .setTitle('🔒 Your In-Game Name is Linked')
        .setColor(0x2ECC71)
        .setDescription(
          `Your Discord account (<@${discordId}>) is currently locked to:\n` +
          `### 🎮 **[${currentDisplay}](${profileUrl})**\n` +
          `📊 **Stats:** ${statsStr}\n\n` +
          `⚠️ **Why is this locked?**\n` +
          `Your In-Game Name connects your Discord account to your ELO history, League rank, and automated screenshot verification. You should **only** change this if you linked the wrong profile or permanently changed your name inside Dune: Imperium Digital.\n\n` +
          `📸 *Remember: Your IGN is the name shown on the **end-of-game scoreboard screenshot** (without any \`#1234\` or \`+1234\` friend code numbers).*`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ign_unlock_request_${cleanedInput ? encodeURIComponent(cleanedInput) : 'NONE'}`)
          .setLabel('🔓 Unlock & Change IGN')
          .setStyle(ButtonStyle.Danger)
      );

      const replyMsg = await interaction.editReply({ embeds: [embed], components: [row] });
      return this.attachCollector(replyMsg, interaction, { supabase, discordClient, ratingsList, existingMap, saveDiscordPlayerMap });
    }

    // CASE B: Not linked yet
    const candidateNames = [
      cleanedInput,
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

    let desc = `You don't have a Dune: Imperium Digital **In-Game Name (IGN)** linked to your Discord yet!\n\n` +
      `📸 **Important — What is your IGN?**\n` +
      `It is the **exact name displayed on the end-of-game scoreboard screenshot**.\n` +
      `• ❌ **DO NOT** include \`#1234\` or \`+1234\` friend code numbers.\n` +
      `• ✅ **DO** match the exact spelling shown on the victory screen.\n\n`;

    if (hadTag) {
      desc += `⚠️ *Note: We automatically stripped the \`#/+numbers\` from \`${rawInput}\` -> **\`${cleanedInput}\`**.*\n\n`;
    }

    const components = [];
    const buttonRow = new ActionRowBuilder();

    if (topSuggestions.length > 0) {
      desc += `🔍 **We found existing player profile(s) on the leaderboard that match your name:**\n`;
      topSuggestions.forEach((s, i) => {
        desc += `${i + 1}. **[${s.display_name}](https://dunestats.cc/players/${encodeURIComponent(s.display_name)})** — ${Number(s.elo).toFixed(1)} ELO (${s.games_played || 0} games)\n`;
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ign_claim_${s.player_key}`)
            .setLabel(`Link "${s.display_name}"`)
            .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Primary)
            .setEmoji('✅')
        );
      });
      desc += `\n*If one of these is you, click its button below! Otherwise, click **Enter Different IGN**.*`;
    } else if (cleanedInput) {
      desc += `🆕 No existing leaderboard profile matched **\`${cleanedInput}\`**.\nClick below to link **\`${cleanedInput}\`** as your new In-Game Name!`;
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ign_setcustom_${encodeURIComponent(cleanedInput)}`)
          .setLabel(`Link "${cleanedInput}"`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );
    } else {
      desc += `🔍 We couldn't automatically guess your IGN from the current leaderboard. Click **Enter My IGN** below to type it in!`;
    }

    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('ign_open_modal_new')
        .setLabel(topSuggestions.length > 0 || cleanedInput ? 'Enter Different IGN' : 'Enter My IGN')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️')
    );

    components.push(buttonRow);

    const embed = new EmbedBuilder()
      .setTitle('🎮 Link Your Dune: Imperium Digital IGN')
      .setColor(0xF1C40F)
      .setDescription(desc);

    const replyMsg = await interaction.editReply({ embeds: [embed], components });
    return this.attachCollector(replyMsg, interaction, { supabase, discordClient, ratingsList, existingMap: null, saveDiscordPlayerMap });
  },

  attachCollector(replyMsg, interaction, { supabase, discordClient, ratingsList, existingMap, saveDiscordPlayerMap }) {
    if (!replyMsg) return;
    const collector = replyMsg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (btnInt) => {
      if (btnInt.user.id !== interaction.user.id) return;
      const cid = btnInt.customId;

      if (cid.startsWith('ign_claim_')) {
        const pk = cid.replace('ign_claim_', '');
        const rating = ratingsList.find(r => r.player_key === pk);
        const disp = rating?.display_name || pk;

        const isDuplicate = await checkAndAlertDuplicateIgn(supabase, discordClient, interaction.user.id, pk, disp);
        await saveDiscordPlayerMap({
          discordUserId: interaction.user.id,
          discordUsername: interaction.user.username,
          displayName: disp,
          playerKey: pk
        });
        await supabase.from('discord_guild_members').update({ suggested_player_key: pk, has_verified_map: true }).eq('discord_user_id', interaction.user.id);

        const dupNote = isDuplicate ? `\n\n⚠️ *Note: Another Discord account is also linked to **${disp}**. An admin has been notified to verify.*` : '';
        await btnInt.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ In-Game Name Linked!')
              .setColor(0x2ECC71)
              .setDescription(`Your Discord account is now linked to **[${disp}](https://dunestats.cc/players/${encodeURIComponent(disp)})**!${dupNote}`)
          ],
          components: []
        }).catch(() => {});
        collector.stop();
        return;
      }

      if (cid.startsWith('ign_setcustom_')) {
        const rawCustom = decodeURIComponent(cid.replace('ign_setcustom_', ''));
        const { cleaned } = cleanScreenshotName(rawCustom);
        const normKey = normalizeName(cleaned);

        const isDuplicate = await checkAndAlertDuplicateIgn(supabase, discordClient, interaction.user.id, normKey, cleaned);
        await saveDiscordPlayerMap({
          discordUserId: interaction.user.id,
          discordUsername: interaction.user.username,
          displayName: cleaned,
          playerKey: normKey
        });
        await supabase.from('discord_guild_members').update({ suggested_player_key: normKey, has_verified_map: true }).eq('discord_user_id', interaction.user.id);

        const dupNote = isDuplicate ? `\n\n⚠️ *Note: Another Discord account is also linked to **${cleaned}**. An admin has been notified to verify.*` : '';
        await btnInt.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ In-Game Name Linked!')
              .setColor(0x2ECC71)
              .setDescription(`Your Discord account is now linked to **${cleaned}**!${dupNote}`)
          ],
          components: []
        }).catch(() => {});
        collector.stop();
        return;
      }

      if (cid === 'ign_open_modal_new' || cid.startsWith('ign_unlock_request_')) {
        const isLocked = cid.startsWith('ign_unlock_request_');
        const prefillRaw = isLocked ? decodeURIComponent(cid.replace('ign_unlock_request_', '')) : '';
        const prefill = prefillRaw !== 'NONE' ? prefillRaw : '';

        const modal = new ModalBuilder()
          .setCustomId(`ign_modal_submit_${isLocked ? 'locked' : 'new'}`)
          .setTitle(isLocked ? '⚠️ Unlock & Change Linked IGN' : 'Set Your Dune In-Game Name');

        const ignInput = new TextInputBuilder()
          .setCustomId('ign_value')
          .setLabel('Exact Name on Scoreboard Screenshot (No #1234)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. PaulAtreides (NO #1234 or +1234 numbers!)')
          .setValue(prefill)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(ignInput));

        if (isLocked) {
          const confirmInput = new TextInputBuilder()
            .setCustomId('ign_confirm_word')
            .setLabel('Type CONFIRM to overwrite your linked profile')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type CONFIRM in all caps')
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(confirmInput));
        }

        await btnInt.showModal(modal).catch(() => {});

        try {
          const modalSubmit = await btnInt.awaitModalSubmit({
            filter: (m) => m.user.id === interaction.user.id && m.customId.startsWith('ign_modal_submit_'),
            time: 120000
          });

          if (isLocked) {
            const confirmWord = modalSubmit.fields.getTextInputValue('ign_confirm_word')?.trim();
            if (confirmWord !== 'CONFIRM') {
              await modalSubmit.reply({
                content: '❌ Change cancelled. You must type `CONFIRM` in all caps to overwrite an existing linked IGN.',
                flags: MessageFlags.Ephemeral
              }).catch(() => {});
              return;
            }
          }

          const enteredRaw = modalSubmit.fields.getTextInputValue('ign_value')?.trim();
          const { cleaned, hadTag } = cleanScreenshotName(enteredRaw);
          const normKey = normalizeName(cleaned);

          if (!normKey) {
            await modalSubmit.reply({ content: '❌ Invalid In-Game Name.', flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
          }

          const matchedRating = ratingsList.find(r => r.player_key === normKey);
          const finalDisplay = matchedRating?.display_name || cleaned;

          const isDuplicate = await checkAndAlertDuplicateIgn(supabase, discordClient, interaction.user.id, normKey, finalDisplay);
          await saveDiscordPlayerMap({
            discordUserId: interaction.user.id,
            discordUsername: interaction.user.username,
            displayName: finalDisplay,
            playerKey: normKey
          });
          await supabase.from('discord_guild_members').update({ suggested_player_key: normKey, has_verified_map: true }).eq('discord_user_id', interaction.user.id);

          await modalSubmit.deferUpdate().catch(() => {});
          const tagNotice = hadTag ? `\n*(Note: Stripped \`#/+numbers\` from \`${enteredRaw}\` -> **\`${finalDisplay}\`**)*` : '';
          const dupNote = isDuplicate ? `\n\n⚠️ *Note: Another Discord account is also linked to **${finalDisplay}**. An admin has been notified to verify.*` : '';
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('✅ In-Game Name Updated!')
                .setColor(0x2ECC71)
                .setDescription(`Your Discord account (<@${interaction.user.id}>) is now linked to **${finalDisplay}**!${tagNotice}${dupNote}`)
            ],
            components: []
          }).catch(() => {});
          collector.stop();
        } catch (modalTimeout) {}
      }
    });
  }
};
