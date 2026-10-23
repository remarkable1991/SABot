const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('Propose a new time slot or shift an existing slot in this match thread')
    .addStringOption((option) =>
      option
        .setName('slot')
        .setDescription('Select an existing suggested slot to shift (e.g. A, B, C, or 🇦, 🇧)')
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
        .setDescription('Propose a brand new custom time or Discord timestamp (<t:...:F>)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase }) {
    await interaction.deferReply();

    const member = interaction.member;
    const channelId = interaction.channelId;
    const rawSlotInput = interaction.options.getString('slot');
    const offsetMinutes = interaction.options.getInteger('offset_minutes');
    const customTime = interaction.options.getString('custom_time')?.trim();

    try {
      const { data: schedule, error } = await supabase
        .from('tournament_match_schedules')
        .select('*')
        .eq('thread_id', channelId)
        .maybeSingle();

      if (error || !schedule) {
        return await interaction.editReply({
          content: `❌ No active match schedule found for this channel. Please run \`/time\` directly inside your tournament match thread.`
        });
      }

      const isHost = member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID);
      const isAdmin = member.permissions.has('Administrator');
      const isParticipant = schedule.player_discord_ids && schedule.player_discord_ids.includes(interaction.user.id);

      if (!isHost && !isAdmin && !isParticipant) {
        return await interaction.editReply({
          content: `❌ Only participants of this match (or Tournament Hosts) can propose time slots.`
        });
      }

      const playerMentions = schedule.player_discord_ids && schedule.player_discord_ids.length > 0
        ? schedule.player_discord_ids.map(id => `<@${id}>`).join(' ')
        : (schedule.player_names || []).map(name => `**${name}**`).join(', ');

      const activeGuildId = DISCORD_GUILD_ID || interaction.guildId;
      const topPostLink = `https://discord.com/channels/${activeGuildId}/${schedule.thread_id}/${schedule.message_id}`;

      let existingSlots = schedule.suggested_slots || [];
      if (typeof existingSlots === 'string') {
        try { existingSlots = JSON.parse(existingSlots); } catch (e) { existingSlots = []; }
      }

      let calculatedTimeText = null;
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
            content: `⚠️ Could not find slot **${rawSlotInput}** on this match. Available slots: ${existingSlots.map(s => s.label).join(', ') || 'None'}.`
          });
        }
      }

      if (baseSlotFound && offsetMinutes) {
        const baseUnix = extractUnixSec(baseSlotFound.time_text);
        if (baseUnix) {
          const newUnix = baseUnix + (offsetMinutes * 60);
          calculatedTimeText = `<t:${newUnix}:F>`;
        }
      } else if (baseSlotFound && !offsetMinutes) {
        return await interaction.editReply({
          content: `⚠️ Please include \`offset_minutes\` (e.g. \`60\` or \`-30\`) when shifting an existing slot, or react directly to **${baseSlotFound.label}** on the [voting post](${topPostLink})!`
        });
      } else if (customTime) {
        const unix = extractUnixSec(customTime);
        if (unix) {
          calculatedTimeText = `<t:${unix}:F>`;
        } else {
          calculatedTimeText = customTime;
        }
      }

      if (!calculatedTimeText) {
        return await interaction.editReply({
          content: `⚠️ Please specify either a slot with an offset (e.g. \`slot: B\` + \`offset_minutes: 60\`) or a \`custom_time\` (e.g. \`<t:1792850400:F>\`).`
        });
      }

      const nextEmojiIndex = existingSlots.length;
      const nextEmoji = REGIONAL_EMOJIS[nextEmojiIndex] || `Option ${nextEmojiIndex + 1}`;

      const newSlotEntry = {
        label: nextEmoji,
        time_text: calculatedTimeText
      };

      const updatedSlots = [...existingSlots, newSlotEntry];

      // Auto-cast proposer's vote for their own suggestion
      const currentVotes = schedule.votes || {};
      if (isParticipant) {
        const userVotes = currentVotes[interaction.user.id] || [];
        if (!userVotes.includes(nextEmoji)) {
          userVotes.push(nextEmoji);
        }
        currentVotes[interaction.user.id] = userVotes;
      }

      const votesCount = Object.keys(currentVotes).length;

      await supabase
        .from('tournament_match_schedules')
        .update({
          mode: 'live',
          suggested_slots: updatedSlots,
          votes: currentVotes,
          votes_count: votesCount,
          status: 'pending_votes',
          reminders_sent: [],
          updated_at: new Date().toISOString()
        })
        .eq('id', schedule.id);

      // Update pinned message embed and add reaction
      try {
        const fetchedMsg = await interaction.channel.messages.fetch(schedule.message_id);
        if (fetchedMsg && fetchedMsg.embeds.length > 0) {
          const originalEmbed = fetchedMsg.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed);

          const slotLines = updatedSlots.map(s => {
            const votersForSlot = (schedule.player_discord_ids || []).filter(
              id => currentVotes[id] && currentVotes[id].includes(s.label)
            );
            const voterMentions = votersForSlot.length > 0 ? ` — ${votersForSlot.map(id => `<@${id}>`).join(' ')}` : '';
            return `${s.label} ${s.time_text}${voterMentions}`;
          });

          const totalPlayersCount = (schedule.player_discord_ids && schedule.player_discord_ids.length) ? schedule.player_discord_ids.length : 4;
          const nonVoterIds = (schedule.player_discord_ids || []).filter(id => !currentVotes[id] || currentVotes[id].length === 0);
          const votedCountCalc = totalPlayersCount - nonVoterIds.length;
          const nonVoterDisplay = nonVoterIds.length > 0
            ? `\n\n**⏳ Did not vote yet (${votedCountCalc}/4):**\n${nonVoterIds.map(id => `<@${id}>`).join(', ')}`
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
        console.error('Failed to update guidelines message UI on /time proposal:', uiErr);
      }

      const proposalEmbed = new EmbedBuilder()
        .setTitle(`💡 New Time Slot Proposed: ${nextEmoji}`)
        .setColor(0xF1C40F)
        .setDescription(`<@${interaction.user.id}> proposed a new time slot and voted for it:\n\n**${nextEmoji} ${calculatedTimeText}**\n\n👉 **[Jump to Voting Post to React](${topPostLink})**`)
        .setTimestamp();

      return await interaction.editReply({ content: `👥 ${playerMentions}`, embeds: [proposalEmbed] });

    } catch (error) {
      console.error('Error executing /time command:', error);
      await interaction.editReply({ content: '⚠️ An error occurred while proposing the time slot.' });
    }
  }
};
