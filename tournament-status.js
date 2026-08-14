const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament-status')
    .setDescription('View current status and schedule overview for a tournament')
    .addIntegerOption((option) =>
      option
        .setName('tournament_num')
        .setDescription('The tournament number to inspect (e.g. 15)')
        .setRequired(true)
    ),

  async execute(interaction, { supabase }) {
    await interaction.deferReply();

    const tNum = interaction.options.getInteger('tournament_num');

    try {
      // 1. Fetch all match schedules for this tournament
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

      const now = new Date();

      // Categorize matches
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
          const startedAt = match.confirmed_timestamp ? `<t:${Math.floor(new Date(match.confirmed_timestamp).getTime() / 1000)}:R>` : 'Active';
          ongoingAsyncMatches.push(`• 🎲 ${threadLink} — Started ${startedAt}`);
        } else if (match.status === 'confirmed') {
          const startTimestamp = match.confirmed_timestamp ? new Date(match.confirmed_timestamp) : null;
          const unixSec = startTimestamp ? Math.floor(startTimestamp.getTime() / 1000) : null;

          if (startTimestamp && startTimestamp < now) {
            overdueMatches.push(`• 🔴 ${threadLink} — Started <t:${unixSec}:R> (Awaiting Result)`);
          } else if (unixSec) {
            upcomingMatches.push({
              text: `• 📅 ${threadLink} — <t:${unixSec}:F> (<t:${unixSec}:R>)`,
              timestamp: startTimestamp.getTime()
            });
          } else {
            upcomingMatches.push({
              text: `• 📅 ${threadLink} — \`${match.confirmed_time_text || 'Date Confirmed'}\``,
              timestamp: 9999999999999
            });
          }
        } else {
          // pending_votes or published
          const count = match.votes_count || 0;
          pendingMatches.push(`• ⏳ ${threadLink} — **${count}/4 Voted**`);
        }
      }

      // Sort upcoming matches chronologically (soonest first)
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
