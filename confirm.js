const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421';

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
    .setDescription('Host/Admin: Manually confirm a tournament match time (or start an Async match)')
    .addStringOption((option) =>
      option
        .setName('slot')
        .setDescription('Confirm an existing slot (e.g. A, B, C, or 🇦, 🇧)')
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('offset_minutes')
        .setDescription('Optional shift in minutes from the selected slot (e.g. 60 or -30)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('custom_time')
        .setDescription('Confirm a custom time or Discord timestamp (<t:...:F>)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('match_code')
        .setDescription('Match Code (e.g. 18GT or 19G1T3) - Optional if run inside the match thread')
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
            : `❌ No active match schedule found for this channel. Run this inside the match thread or specify \`match_code\`.`
        });
      }

      const isHost = member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID);
      const isAdmin = member.permissions.has('Administrator');
      const isParticipant = schedule.player_discord_ids && schedule.player_discord_ids.includes(interaction.user.id);

      let existingSlots = schedule.suggested_slots || [];
      if (typeof existingSlots === 'string') {
        try { existingSlots = JSON.parse(existingSlots); } catch (e) { existingSlots = []; }
      }

      const activeGuildId = DISCORD_GUILD_ID || interaction.guildId;
      const topPostLink = `https://discord.com/channels/${activeGuildId}/${schedule.thread_id}/${schedule.message_id}`;
      const playerMentions = schedule.player_discord_ids && schedule.player_discord_ids.length > 0
        ? schedule.player_discord_ids.map(id => `<@${id}>`).join(' ')
        : (schedule.player_names || []).map(name => `**${name}**`).join(', ');

      let threadChannel = interaction.channel;
      if (schedule.thread_id && schedule.thread_id !== interaction.channelId) {
        threadChannel = await discordClient.channels.fetch(schedule.thread_id).catch(() => interaction.channel);
      }

      // Allow Async participants (or Host/Admin) to mark an Async match as Ongoing if no time options are passed
      if (schedule.mode === 'async' && existingSlots.length === 0 && !rawSlotInput && !customTime) {
        if (!isHost && !isAdmin && !isParticipant) {
          return await interaction.editReply({ content: '❌ You do not have permission to start this async match.' });
        }

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
          .setDescription(`The game is now **Ongoing**! Turn timers are active. Good luck!\n\n🔗 **[Jump to Top Post](${topPostLink})**`)
          .setTimestamp();

        if (threadChannel.id !== interaction.channelId) {
          await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [asyncEmbed] }).catch(() => {});
        }

        return await interaction.editReply({ content: `👥 ${playerMentions}`, embeds: [asyncEmbed] });
      }

      // Live manual confirmation requires Tournament Host or Admin
      if (!isHost && !isAdmin) {
        return await interaction.editReply({
          content: `❌ Only Tournament Hosts (<@&${TOURNAMENT_HOST_ROLE_ID}>) or Admins can manually force-confirm a live match time. To propose a time for voting, use \`/time\`!`
        });
      }

      let calculatedTimeText = null;
      let calculatedTimestamp = null;
      let baseSlotFound = null;

      if (rawSlotInput) {
        const normalizedInput = normalizeSlotInput(rawSlotInput);
        const upperRaw = rawSlotInput.trim().toUpperCase();

        baseSlotFound = existingSlots.find(s => 
          s.label === normalizedInput ||
          s.label.toUpperCase().includes(upperRaw) ||
          normalizeSlotInput(s.label) === normalizedInput
        );

        if (!baseSlotFound) {
          return await interaction.editReply({
            content: `⚠️ Could not find slot **${rawSlotInput}** on match **${schedule.match_code}**.`
          });
        }
      }

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
          content: `⚠️ Please specify a \`slot\` (e.g. \`A\`, \`B\`), a \`slot\` + \`offset_minutes\`, or a \`custom_time\` to confirm.`
        });
      }

      await supabase
        .from('tournament_match_schedules')
        .update({
          mode: 'live',
          status: 'confirmed',
          confirmed_slot: baseSlotFound?.label || 'Manual',
          confirmed_time_text: calculatedTimeText,
          confirmed_timestamp: calculatedTimestamp,
          reminders_sent: [],
          updated_at: new Date().toISOString()
        })
        .eq('id', schedule.id);

      const matchTitle = `[${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`;
      const calUrl = calculatedTimestamp ? generateGoogleCalendarUrl(matchTitle, new Date(calculatedTimestamp)) : null;

      let tablePath = 'table';
      if (schedule.match_code && schedule.match_code.includes('G')) {
        tablePath = schedule.match_code.slice(schedule.match_code.indexOf('G'));
      }
      const webUrl = `https://dunestats.cc/tournament/${schedule.tournament_num}/${tablePath}`;

      const confirmEmbed = new EmbedBuilder()
        .setTitle(`📅 Match Time Confirmed by Host: ${matchTitle}`)
        .setColor(0x2ECC71)
        .setDescription(`Tournament Host locked in the match for **${calculatedTimeText}**.\n\n🔗 **[Jump to Voting Post](${topPostLink})** · **[Table Details & Map](${webUrl})**\n\nPlease let your opponents know on time if you need to reschedule.`)
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
        await threadChannel.send({ content: `👥 ${playerMentions}`, embeds: [confirmEmbed], components }).catch(() => {});
        return await interaction.editReply({
          content: `✅ Confirmed **${matchTitle}** for **${calculatedTimeText}** and posted the announcement in <#${threadChannel.id}>!`
        });
      }

      return await interaction.editReply({ content: `👥 ${playerMentions}`, embeds: [confirmEmbed], components });

    } catch (error) {
      console.error('Error executing /confirm command:', error);
      await interaction.editReply({ content: '⚠️ An error occurred while confirming the match schedule.' });
    }
  }
};
