const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirm that an async match has started or lock in a live match time')
    .addStringOption((option) =>
      option
        .setName('match_code')
        .setDescription('Match Code (e.g. 15G1T6) - Optional if run inside the match thread')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('slot')
        .setDescription('For Live: Select a suggested slot (A, B, or C)')
        .setRequired(false)
        .addChoices(
          { name: '🇦 Slot A', value: '🇦' },
          { name: '🇧 Slot B', value: '🇧' },
          { name: '🇨 Slot C', value: '🇨' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('custom_time')
        .setDescription('For Live: Custom agreed date/time or Unix timestamp (if not using suggested slots)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase, discordClient }) {
    await interaction.deferReply();

    const member = interaction.member;
    const channelId = interaction.channelId;
    const inputMatchCode = interaction.options.getString('match_code')?.trim().toUpperCase();
    const chosenSlot = interaction.options.getString('slot');
    const customTime = interaction.options.getString('custom_time')?.trim();

    try {
      // 1. Fetch match record (by thread_id if inside thread, or by match_code)
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
            : `❌ No active match schedule found for this channel. If you're outside the thread, please specify the \`match_code\` parameter (e.g. \`/confirm match_code:15G1T6\`).`
        });
      }

      // 2. Permission Validation (Host, Admin, or one of the table's registered players)
      const isHost = member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID);
      const isAdmin = member.permissions.has('Administrator');
      const isParticipant = schedule.player_discord_ids && schedule.player_discord_ids.includes(interaction.user.id);

      if (!isHost && !isAdmin && !isParticipant) {
        return await interaction.editReply({
          content: `❌ You do not have permission to confirm this match. Only table participants or Tournament Hosts can run this command.`
        });
      }

      // Build player tags string for announcements
      const playerMentions = schedule.player_discord_ids && schedule.player_discord_ids.length > 0
        ? schedule.player_discord_ids.map(id => `<@${id}>`).join(' ')
        : (schedule.player_names || []).map(name => `**${name}**`).join(', ');

      // Target thread channel to send confirmation
      let threadChannel = interaction.channel;
      if (schedule.thread_id && schedule.thread_id !== interaction.channelId) {
        threadChannel = await discordClient.channels.fetch(schedule.thread_id).catch(() => interaction.channel);
      }

      // 3. ASYNC MODE CONFIRMATION
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
          .setDescription(`The game is now **Ongoing**! Turn timers are active.\n\nGood luck to all players!`)
          .setTimestamp();

        if (threadChannel.id !== interaction.channelId) {
          await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [asyncEmbed] }).catch(() => {});
        }

        return await interaction.editReply({
          content: `👥 ${playerMentions}`,
          embeds: [asyncEmbed]
        });
      }

      // 4. LIVE MODE CONFIRMATION
      let finalTimestamp = null;
      let finalTimeText = '';
      let confirmedSlotLabel = null;

      if (chosenSlot) {
        confirmedSlotLabel = chosenSlot;
        const matchedSlot = (schedule.suggested_slots || []).find(s => s.label === chosenSlot);
        if (matchedSlot) {
          finalTimeText = matchedSlot.time_text;
          const parsed = Date.parse(matchedSlot.time_text);
          if (!isNaN(parsed)) {
            finalTimestamp = new Date(parsed).toISOString();
          }
        } else {
          finalTimeText = `Slot ${chosenSlot}`;
        }
      } else if (customTime) {
        confirmedSlotLabel = 'Manual';
        finalTimeText = customTime;

        // Check if customTime is numeric unix timestamp or ISO string
        if (/^\d{10}$/.test(customTime)) {
          finalTimestamp = new Date(parseInt(customTime, 10) * 1000).toISOString();
        } else {
          const parsed = Date.parse(customTime);
          if (!isNaN(parsed)) finalTimestamp = new Date(parsed).toISOString();
        }
      } else {
        return await interaction.editReply({
          content: `⚠️ For Live matches, please specify either a suggested slot (\`slot: A/B/C\`) or an agreed custom time (\`custom_time: ...\`).`
        });
      }

      const updateData = {
        status: 'confirmed',
        confirmed_slot: confirmedSlotLabel,
        confirmed_time_text: finalTimeText,
        updated_at: new Date().toISOString()
      };
      if (finalTimestamp) updateData.confirmed_timestamp = finalTimestamp;

      await supabase
        .from('tournament_match_schedules')
        .update(updateData)
        .eq('id', schedule.id);

      const unixSec = finalTimestamp ? Math.floor(new Date(finalTimestamp).getTime() / 1000) : null;
      const timeDisplay = unixSec
        ? `<t:${unixSec}:F> (<t:${unixSec}:R>)`
        : `\`${finalTimeText}\``;

      const liveEmbed = new EmbedBuilder()
        .setTitle(`📅 Match Time Confirmed: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`)
        .setColor(0x2ECC71)
        .setDescription(`Match time locked in for **${timeDisplay}**!\n\nPlease let your opponents know on time if you need to reschedule.`)
        .setTimestamp();

      if (threadChannel.id !== interaction.channelId) {
        await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [liveEmbed] }).catch(() => {});
      }

      return await interaction.editReply({
        content: `👥 ${playerMentions}`,
        embeds: [liveEmbed]
      });

    } catch (error) {
      console.error('Error executing /confirm command:', error);
      await interaction.editReply({
        content: '⚠️ An error occurred while confirming the match status.'
      });
    }
  }
};
