const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');

const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421'; 

function extractMatchCode(tournamentNum, roundType, tableIdentifier) {
  const roundNum = roundType.replace(/\D/g, '') || '1';
  const tableNum = tableIdentifier.replace(/\D/g, '') || '1';
  return `${tournamentNum}G${roundNum}T${tableNum}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mass-threads')
    .setDescription('Create match threads and ping groups from a pre-processed bot-ready CSV')
    .addAttachmentOption((option) =>
      option
        .setName('csv')
        .setDescription('Upload the pre-processed bot-ready CSV file')
        .setRequired(true)
    ),

  async execute(interaction, { supabase, discordClient }) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const member = interaction.member;
    const isHost = member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID);
    const isAdmin = member.permissions.has('Administrator');

    if (!isHost && !isAdmin) {
      return await interaction.editReply({
        content: `❌ You do not have permission to run this command. Only users with the <@&${TOURNAMENT_HOST_ROLE_ID}> role can execute mass thread creation.`
      });
    }

    const attachment = interaction.options.getAttachment('csv');
    if (!attachment || !attachment.name.endsWith('.csv')) {
      return await interaction.editReply({ content: '❌ Please upload a valid `.csv` file.' });
    }

    const fileName = attachment.name.toLowerCase();
    const tNumMatch = fileName.match(/t(\d+)/i);
    const roundMatch = fileName.match(/round_?(\d+)/i);
    const isLiveFile = fileName.includes('live');
    const mode = isLiveFile ? 'live' : 'async';

    const defaultTournamentNum = tNumMatch ? parseInt(tNumMatch[1], 10) : 15;
    const defaultRoundNum = roundMatch ? parseInt(roundMatch[1], 10) : 1;

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error('Failed to download file from Discord CDN');
      const csvText = await response.text();

      const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length <= 1) {
        return await interaction.editReply({ content: '❌ The CSV file appears to be empty or contains only headers.' });
      }

      await interaction.editReply({ content: `⚙️ Parsing **${mode.toUpperCase()}** file and launching private threads for Tournament #${defaultTournamentNum}. Please wait...` });

      const parentChannel = interaction.channel;
      const guild = interaction.guild;
      let createdCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
        if (columns.length < 2) continue;

        const threadTitle = columns[0];
        const rawPings = columns[1];
        const slots = [columns[2], columns[3], columns[4]].filter(s => s && s !== 'No Backup Slot Secured' && s !== '');

        const roundType = `Game ${defaultRoundNum}`;
        const tableIdentifierMatch = threadTitle.match(/Table\s*\d+/i);
        const tableIdentifier = tableIdentifierMatch ? tableIdentifierMatch[0] : threadTitle;
        const matchCode = extractMatchCode(defaultTournamentNum, roundType, tableIdentifier);

        const resolvedPings = [];
        const playerDiscordIds = [];
        const playerNames = [];
        const items = rawPings.split(',').map(p => p.trim());

        for (const item of items) {
          if (item.startsWith('@')) {
            const parts = item.split(' ');
            const username = parts[0].slice(1);
            const ign = parts.slice(1).join(' ').replace(/[()]/g, '');

            playerNames.push(ign || username);

            try {
              const members = await guild.members.search({ query: username, limit: 1 });
              const matchedMember = members.first();
              if (matchedMember) {
                resolvedPings.push(`${matchedMember.toString()} (${ign})`);
                playerDiscordIds.push(matchedMember.id);
              } else {
                resolvedPings.push(`\`@${username}\` (${ign})`);
              }
            } catch {
              resolvedPings.push(`\`@${username}\` (${ign})`);
            }
          } else {
            const rawName = item.replace(/\*\*/g, '').trim();
            playerNames.push(rawName);
            resolvedPings.push(item);
          }
        }

        const formattedThreadName = `🏆 [${matchCode}] ${threadTitle}`;

        const thread = await parentChannel.threads.create({
          name: formattedThreadName,
          autoArchiveDuration: 10080,
          type: ChannelType.PrivateThread,
          reason: `Matchmaking Setup ${matchCode}`
        });

        const rulesEmbed = new EmbedBuilder()
          .setTitle(`🏆 Match Coordination: ${threadTitle} [${matchCode}]`)
          .setColor(0xC9A24B)
          .setTimestamp();

        const suggestedSlotsPayload = [];

        if (slots.length > 0) {
          // --- LIVE MODE BRANCH ---
          rulesEmbed.setDescription(`Welcome to your tournament matchup! Please read the rules below carefully:`);

          const labels = ['🇦', '🇧', '🇨'];
          slots.forEach((s, idx) => {
            suggestedSlotsPayload.push({ label: labels[idx], time_text: s });
          });

          // Rules fields first
          rulesEmbed.addFields(
            { 
              name: '⏳ First 24 hours after the tag!', 
              value: 'Vote for which time slots suits you best. Once it is agreed by all 4, the bot will automatically lock in the earliest date.\n\nThese times are decided based on what you submitted on the website. If you believe this to be wrong, contact an admin ASAP!\n\nIf you selected times but now cannot play on any of them, use `/confirm` to submit an agreed alternative time.', 
              inline: false 
            },
            { 
              name: '🔄 Rescheduling', 
              value: 'If you agreed to a time but need to change, let your opponents and an admin know ASAP at least 24 hours before.', 
              inline: false 
            },
            { 
              name: '💤 Player Non-Responsiveness', 
              value: 'Tag your opponents if they do not respond. If a player fails to respond for over 24 hours, tag our tournament support team.', 
              inline: false 
            },
            { 
              name: '🎮 Table Setup', 
              value: 'Any player can host this table. Coordinate who hosts, create the match in-game, and share the password directly in this thread.', 
              inline: false 
            },
            { 
              name: '📸 Reporting Results', 
              value: 'Once the game concludes, upload your final screenshot to:\n🔗 **[dunestats.cc/tournament](https://dunestats.cc/tournament)**', 
              inline: false 
            }
          );

          // Suggested Slots placed at the bottom
          const slotText = suggestedSlotsPayload.map(s => `${s.label} ${s.time_text}`).join('\n');
          const nonVoterTags = playerDiscordIds.length > 0
            ? playerDiscordIds.map(id => `<@${id}>`).join(', ')
            : 'All Players';

          rulesEmbed.addFields({
            name: '📅 Suggested Time Slots & Votes',
            value: `${slotText}\n\n**⏳ Did not vote yet (0/4):**\n${nonVoterTags}`,
            inline: false
          });

        } else {
          // --- ASYNC MODE BRANCH ---
          rulesEmbed.setDescription(`Welcome to your tournament matchup! Please read the rules below carefully:`);
          rulesEmbed.addFields(
            { 
              name: '🚀 Starting the Match', 
              value: 'When you are ready to begin, run `/confirm` directly in this thread to mark the game as **Ongoing**.', 
              inline: false 
            },
            { 
              name: '🎮 Table Setup', 
              value: 'Any player can host this table. Coordinate who hosts, create the match in-game, and share the password directly in this thread.', 
              inline: false 
            },
            { 
              name: '💤 Turn Pings & Timers', 
              value: 'Tag the next player when it is their turn. If a player takes over 24 hours without notice, tag Tournament Support.', 
              inline: false 
            },
            { 
              name: '📸 Reporting Results', 
              value: 'Once the game concludes, upload your final screenshot to:\n🔗 **[dunestats.cc/tournament](https://dunestats.cc/tournament)**', 
              inline: false 
            }
          );
        }

        const message = await thread.send({
          content: `👥 **Participants:** ${resolvedPings.join(' | ')}\n🛡️ **Support:** <@&${TOURNAMENT_HOST_ROLE_ID}>`,
          embeds: [rulesEmbed]
        });

        if (slots.length > 0) {
          const labels = ['🇦', '🇧', '🇨'];
          for (let idx = 0; idx < slots.length; idx++) {
            await message.react(labels[idx]);
          }
        }

        // Insert schedule record
        await supabase
          .from('tournament_match_schedules')
          .upsert({
            tournament_num: defaultTournamentNum,
            round_type: roundType,
            table_identifier: tableIdentifier,
            match_code: matchCode,
            mode: mode,
            thread_id: thread.id,
            message_id: message.id,
            player_discord_ids: playerDiscordIds,
            player_names: playerNames,
            suggested_slots: suggestedSlotsPayload,
            status: isLiveFile ? 'pending_votes' : 'published',
            updated_at: new Date().toISOString()
          }, { onConflict: 'tournament_num,round_type,table_identifier' });

        createdCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await interaction.followUp({ content: `✅ Successfully created **${createdCount}** ${mode.toUpperCase()} private threads!`, flags: [MessageFlags.Ephemeral] });

    } catch (error) {
      console.error('Failed processing the CSV or creating threads:', error);
      await interaction.editReply({ content: '⚠️ An error occurred while parsing the CSV or generating the threads.' });
    }
  }
};
