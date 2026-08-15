const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421';

// Regional indicator emojis map
const REGIONAL_EMOJIS = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];

function extractUnixSec(value) {
  if (!value) return null;
  const str = String(value).trim();
  const matchDiscord = str.match(/<t:(\d+)/);
  if (matchDiscord) return parseInt(matchDiscord[1], 10);
  if (/^\d{10}$/.test(str)) return parseInt(str, 10);
  if (/^\d{13}$/.test(str)) return Math.floor(parseInt(str, 10) / 1000);
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return Math.floor(parsed / 1000);
  return null;
}

function normalizeSlotInput(input) {
  if (!input) return '';
  const clean = input.trim().toUpperCase();
  const letterMap = {
    'A': '🇦', 'B': '🇧', 'C': '🇨', 'D': '🇩', 'E': '🇪',
    'F': '🇫', 'G': '🇬', 'H': '🇭', 'I': '🇮', 'J': '🇯'
  };
  return letterMap[clean] || clean;
}

function generateGoogleCalendarUrl(title, startDate, durationHours = 2) {
  if (!startDate || isNaN(startDate.getTime())) return null;
  const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const formatUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const dates = `${formatUtc(startDate)}/${formatUtc(endDate)}`;
  const text = encodeURIComponent(title);
  const details = encodeURIComponent('Strategy Arena Tournament Match.');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirm match start (Async), lock in a time, or propose a new live time slot')
    .addStringOption((option) =>
      option
        .setName('match_code')
        .setDescription('Match Code (e.g. 15G1T6) - Optional if run inside the match thread')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('slot')
        .setDescription('Select an existing suggested slot (e.g. A, B, C, or 🇦, 🇧)')
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('offset_minutes')
        .setDescription('Shift the selected slot by minutes (e.g. 60 for +1h, -30 for -30m)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('custom_time')
        .setDescription('Propose a brand new custom time or Unix timestamp')
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('force_lock')
        .setDescription('Admin/Host only: Immediately force-confirm without waiting for votes')
        .setRequired(false)
    ),

  async execute(interaction, { supabase, discordClient }) {
    await interaction.deferReply();

    const member = interaction.member;
    const channelId = interaction.channelId;
    const inputMatchCode = interaction.options.getString('match_code')?.trim().toUpperCase();
    const rawSlotInput = interaction.options.getString('slot');
    const offsetMinutes = interaction.options.getInteger('offset_minutes');
    const customTime = interaction.options.getString('custom_time')?.trim();
    const forceLock = interaction.options.getBoolean('force_lock') || false;

    try {
      let query = supabase.from('tournament_match_schedules').select('*');
      if (inputMatchCode) {
        query = query.eq('match_code', inputMatchCode);
      } else {
        query = query.eq('thread_id', channelId);
      }

      const { data: schedule, error } = await query.maybeSingle();
      if (error || !schedule) {
        return await interaction.editReply({
          content: inputMatchCode
            ? `❌ Could not find a match with code **${inputMatchCode}**.`
            : `❌ No active match schedule found for this channel. Please specify \`match_code\` if outside the thread.`
        });
      }

      const isHost = member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID);
      const isAdmin = member.permissions.has('Administrator');
      const isParticipant = schedule.player_discord_ids && schedule.player_discord_ids.includes(interaction.user.id);

      if (!isHost && !isAdmin && !isParticipant) {
        return await interaction.editReply({
          content: `❌ You do not have permission to adjust this match schedule.`
        });
      }

      let threadChannel = interaction.channel;
      if (schedule.thread_id && schedule.thread_id !== interaction.channelId) {
        threadChannel = await discordClient.channels.fetch(schedule.thread_id).catch(() => interaction.channel);
      }

      const playerMentions = schedule.player_discord_ids && schedule.player_discord_ids.length > 0
        ? schedule.player_discord_ids.map(id => `<@${id}>`).join(' ')
        : (schedule.player_names || []).map(name => `**${name}**`).join(', ');

      // --- ASYNC MATCH HANDLING ---
      if (schedule.mode === 'async') {
        const nowISO = new Date().toISOString();
        await supabase
          .from('tournament_match_schedules')
          .update({
            status: 'ongoing',
            confirmed_timestamp: nowISO,
            updated_at: nowISO
          })
          .eq('id', schedule.id);

        const asyncEmbed = new EmbedBuilder()
          .setTitle(`🚀 Match Started: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`)
          .setColor(0x2ECC71)
          .setDescription(`The game is now **Ongoing**! Turn timers are active. Good luck!`)
          .setTimestamp();

        if (threadChannel.id !== interaction.channelId) {
          await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [asyncEmbed] }).catch(() => {});
        }

        return await interaction.editReply({ content: `👥 ${playerMentions}`, embeds: [asyncEmbed] });
      }

      // --- LIVE MATCH HANDLING ---
      let existingSlots = schedule.suggested_slots || [];
      let calculatedTimeText = null;
      let calculatedTimestamp = null;
      let baseSlotFound = null;

      // Normalize slot search (supports 'B' matching '🇧')
      if (rawSlotInput) {
        const normalizedInput = normalizeSlotInput(rawSlotInput);
        const upperRaw = rawSlotInput.trim().toUpperCase();

        baseSlotFound = existingSlots.find(s => 
          s.label === normalizedInput ||
          s.label.toUpperCase().includes(upperRaw) ||
          normalizeSlotInput(s.label) === normalizedInput
        );
      }

      // Calculate time based on base slot + offset or custom_time
      if (baseSlotFound && offsetMinutes) {
        const baseUnix = extractUnixSec(baseSlotFound.time_text);
        if (baseUnix) {
          const newUnix = baseUnix + (offsetMinutes * 60);
          calculatedTimestamp = new Date(newUnix * 1000).toISOString();
          calculatedTimeText = `<t:${newUnix}:F>`;
        }
      } else if (baseSlotFound && !offsetMinutes) {
        calculatedTimeText = baseSlotFound.time_text;
        const unix = extractUnixSec(baseSlotFound.time_text);
        if (unix) calculatedTimestamp = new Date(unix * 1000).toISOString();
      } else if (customTime) {
        const unix = extractUnixSec(customTime);
        if (unix) {
          calculatedTimestamp = new Date(unix * 1000).toISOString();
          calculatedTimeText = `<t:${unix}:F>`;
        } else {
          calculatedTimeText = customTime;
        }
      }

      if (!calculatedTimeText) {
        return await interaction.editReply({
          content: `⚠️ Please specify a valid slot (e.g. \`slot: B\`), a slot with offset (e.g. \`slot: B\` + \`offset_minutes: 60\`), or a \`custom_time\`.`
        });
      }

      // 1. ADMIN FORCE LOCK OPTION
      if (forceLock && (isAdmin || isHost)) {
        await supabase
          .from('tournament_match_schedules')
          .update({
            status: 'confirmed',
            confirmed_slot: baseSlotFound?.label || 'Manual',
            confirmed_time_text: calculatedTimeText,
            confirmed_timestamp: calculatedTimestamp,
            updated_at: new Date().toISOString()
          })
          .eq('id', schedule.id);

        const matchTitle = `[${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`;
        const calUrl = calculatedTimestamp ? generateGoogleCalendarUrl(matchTitle, new Date(calculatedTimestamp)) : null;

        const forceEmbed = new EmbedBuilder()
          .setTitle(`📅 Match Time Confirmed by Host: ${matchTitle}`)
          .setColor(0x2ECC71)
          .setDescription(`Tournament Host locked in the match for **${calculatedTimeText}**.\n\nPlease let your opponents know on time if you need to reschedule.`)
          .setTimestamp();

        const components = [];
        if (calUrl) {
          components.push(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel('Add to Google Calendar')
                .setStyle(ButtonStyle.Link)
                .setURL(calUrl)
                .setEmoji('📅')
            )
          );
        }

        if (threadChannel.id !== interaction.channelId) {
          await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [forceEmbed], components }).catch(() => {});
        }

        return await interaction.editReply({ content: `👥 ${playerMentions}`, embeds: [forceEmbed], components });
      }

      // 2. PROPOSE NEW OPTION (Adds D, E, F... and opens voting)
      const nextEmojiIndex = existingSlots.length;
      const nextEmoji = REGIONAL_EMOJIS[nextEmojiIndex] || `Option ${nextEmojiIndex + 1}`;

      const newSlotEntry = {
        label: nextEmoji,
        time_text: calculatedTimeText
      };

      const updatedSlots = [...existingSlots, newSlotEntry];

      // Reset confirmation if already confirmed so table votes on new option
      await supabase
        .from('tournament_match_schedules')
        .update({
          suggested_slots: updatedSlots,
          status: 'pending_votes',
          updated_at: new Date().toISOString()
        })
        .eq('id', schedule.id);

      // 3. UPDATE THE PINNED EMBED IN THREAD & ADD REACTION
      let fetchedMsg = null;
      try {
        fetchedMsg = await threadChannel.messages.fetch(schedule.message_id);
        if (fetchedMsg && fetchedMsg.embeds.length > 0) {
          const originalEmbed = fetchedMsg.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed);

          const slotLines = updatedSlots.map(s => {
            const votersForSlot = (schedule.player_discord_ids || []).filter(
              id => schedule.votes && schedule.votes[id] && schedule.votes[id].includes(s.label)
            );
            const voterMentions = votersForSlot.length > 0 ? ` — ${votersForSlot.map(id => `<@${id}>`).join(' ')}` : '';
            return `${s.label} ${s.time_text}${voterMentions}`;
          });

          const nonVoterCount = (schedule.player_discord_ids || []).filter(id => !schedule.votes || !schedule.votes[id] || schedule.votes[id].length === 0);
          const nonVoterDisplay = nonVoterCount.length > 0
            ? `\n\n**⏳ Did not vote yet (${(schedule.player_discord_ids?.length || 4) - nonVoterCount.length}/4):**\n${nonVoterCount.map(id => `<@${id}>`).join(', ')}`
            : `\n\n**✅ All players voted!**`;

          const updatedFields = originalEmbed.fields.filter(f => !f.name.includes('Suggested Time Slots'));
          updatedFields.push({
            name: '📅 Suggested Time Slots & Votes',
            value: `${slotLines.join('\n')}${nonVoterDisplay}`,
            inline: false
          });

          updatedEmbed.setFields(updatedFields);
          await fetchedMsg.edit({ embeds: [updatedEmbed] });
          await fetchedMsg.react(nextEmoji).catch(() => {});
        }
      } catch (uiErr) {
        console.error('Failed to update guidelines message UI on /confirm proposal:', uiErr);
      }

      const proposalEmbed = new EmbedBuilder()
        .setTitle(`💡 New Time Slot Proposed: ${nextEmoji}`)
        .setColor(0xF1C40F)
        .setDescription(`<@${interaction.user.id}> proposed a new time slot:\n\n**${nextEmoji} ${calculatedTimeText}**\n\nPlease react with ${nextEmoji} on the table post above if you can play at this time!`)
        .setTimestamp();

      if (threadChannel.id !== interaction.channelId) {
        await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [proposalEmbed] }).catch(() => {});
      }

      return await interaction.editReply({ content: `👥 ${playerMentions}`, embeds: [proposalEmbed] });

    } catch (error) {
      console.error('Error executing /confirm command:', error);
      await interaction.editReply({ content: '⚠️ An error occurred while adjusting the match schedule.' });
    }
  }
};
