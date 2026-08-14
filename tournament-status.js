const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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

function formatDiscordTimestamp(value) {
  if (!value) return 'Date Confirmed';
  const str = String(value).trim();
  // If it's already a Discord timestamp string, return directly without backticks
  if (str.startsWith('<t:')) return str;

  const unixSec = extractUnixSec(str);
  if (unixSec) {
    return `<t:${unixSec}:F> (<t:${unixSec}:R>)`;
  }
  return str;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament-status')
    .setDescription('View current status and schedule overview for a tournament')
    .addIntegerOption((option) =>
      option
        .setName('tournament_num')
        .setDescription('The tournament number to inspect (e.g. 18)')
        .setRequired(true)
    ),

  async execute(interaction, { supabase }) {
    await interaction.deferReply();

    const tNum = interaction.options.getInteger('tournament_num');

    try {
      const { data: schedules, error } = await supabase
        .from('tournament_match_schedules')
        .select('*')
        .eq('tournament_num', tNum);

      if (error) throw error;

      if (!schedules || schedules.length === 0) {
        return await interaction.editReply({
          content: `ℹ️ No match schedules found for **Tournament #${tNum}**.`
        });
      }

      const nowSec = Math.floor(Date.now() / 1000);

      const playedMatches = [];
      const overdueMatches = [];
      const upcomingMatches = [];
      const ongoingAsyncMatches = [];
      const pendingMatches = [];
      const conflictMatches = [];

      for (const match of schedules) {
        const title = `[${match.match_code}] ${match.round_type} ${match.table_identifier}`;
        const threadLink = match.thread_id ? `<#${match.thread_id}>` : title;

        if (match.status === 'played') {
          playedMatches.push(`• ✅ ${title}`);
        } else if (match.status === 'conflict') {
          conflictMatches.push(`• ⚠️ ${threadLink} — **All voted, no mutual slot!**`);
        } else if (match.status === 'ongoing' && match.mode === 'async') {
          const startedSec = extractUnixSec(match.confirmed_timestamp);
          const startedAt = startedSec ? `<t:${startedSec}:R>` : 'Active';
          ongoingAsyncMatches.push(`• 🎲 ${threadLink} — Started ${startedAt}`);
        } else if (match.status === 'confirmed') {
          const rawTime = match.confirmed_time_text || match.confirmed_timestamp;
          const unixSec = extractUnixSec(rawTime);

          if (unixSec && unixSec < nowSec) {
            overdueMatches.push(`• 🔴 ${threadLink} — Started <t:${unixSec}:R> (Awaiting Result)`);
          } else {
            upcomingMatches.push({
              text: `• 📅 ${threadLink} — ${formatDiscordTimestamp(rawTime)}`,
              timestamp: unixSec || 9999999999
            });
          }
        } else {
          const count = match.votes_count || 0;
          pendingMatches.push(`• ⏳ ${threadLink} — **${count}/4 Voted**`);
        }
      }

      upcomingMatches.sort((a, b) => a.timestamp - b.timestamp);

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Tournament #${tNum} Schedule & Status Overview`)
        .setColor(0xC9A24B)
        .setDescription(`Total Tables Tracked: **${schedules.length}**`)
        .setTimestamp();

      if (overdueMatches.length > 0) {
        embed.addFields({
          name: '🔴 In Progress / Awaiting Results',
          value: overdueMatches.join('\n').slice(0, 1024),
          inline: false
        });
      }

      if (upcomingMatches.length > 0) {
        embed.addFields({
          name: '📅 Confirmed Upcoming Matches',
          value: upcomingMatches.map(m => m.text).join('\n').slice(0, 1024),
          inline: false
        });
      }

      if (ongoingAsyncMatches.length > 0) {
        embed.addFields({
          name: '🎲 Ongoing Async Matches',
          value: ongoingAsyncMatches.join('\n').slice(0, 1024),
          inline: false
        });
      }

      if (conflictMatches.length > 0) {
        embed.addFields({
          name: '⚠️ Scheduling Conflicts (Needs Host Attention)',
          value: conflictMatches.join('\n').slice(0, 1024),
          inline: false
        });
      }

      if (pendingMatches.length > 0) {
        embed.addFields({
          name: '⏳ Not Yet Planned / Pending Votes',
          value: pendingMatches.join('\n').slice(0, 1024),
          inline: false
        });
      }

      if (playedMatches.length > 0) {
        embed.addFields({
          name: '✅ Completed Matches',
          value: playedMatches.join('\n').slice(0, 1024),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching tournament status:', error);
      await interaction.editReply({
        content: '⚠️ An error occurred while retrieving tournament status.'
      });
    }
  }
};
