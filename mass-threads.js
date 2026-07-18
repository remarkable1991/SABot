const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');

// True Dune Tournament Host / Admin role ID
const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421'; 

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

  async execute(interaction, { discordClient }) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const member = interaction.member;

    // Security Check
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

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error('Failed to download file from Discord CDN');
      const csvText = await response.text();

      const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length <= 1) {
        return await interaction.editReply({ content: '❌ The CSV file appears to be empty or contains only headers.' });
      }

      await interaction.editReply({ content: `⚙️ Parsing file and launching private threads. Please wait...` });

      const parentChannel = interaction.channel;
      const guild = interaction.guild;
      let createdCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
        if (columns.length < 2) continue;

        const threadTitle = columns[0];
        const rawPings = columns[1];
        const slots = [columns[2], columns[3], columns[4]].filter(s => s && s !== 'No Backup Slot Secured');

        const resolvedPings = [];
        const items = rawPings.split(',').map(p => p.trim());

        for (const item of items) {
          if (item.startsWith('@')) {
            const parts = item.split(' ');
            const username = parts[0].slice(1);
            const ign = parts.slice(1).join(' ');

            try {
              const members = await guild.members.search({ query: username, limit: 1 });
              const matchedMember = members.first();
              if (matchedMember) {
                // Using toString() ensures the Discord system renders a functional mention
                resolvedPings.push(`${matchedMember.toString()} (${ign})`);
              } else {
                resolvedPings.push(`\`@${username}\` (${ign})`);
              }
            } catch {
              resolvedPings.push(`\`@${username}\` (${ign})`);
            }
          } else {
            resolvedPings.push(item);
          }
        }

        const thread = await parentChannel.threads.create({
          name: threadTitle,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          reason: 'Mass Matchmaking Setup'
        });

        const rulesEmbed = new EmbedBuilder()
          .setTitle(`🏆 Match Coordination: ${threadTitle}`)
          .setDescription(`Welcome to your tournament matchup! Please read the rules below carefully:`)
          .setColor(0xC9A24B)
          .setTimestamp();

        if (slots.length > 0) {
          const labels = ['🇦', '🇧', '🇨'];
          const slotText = slots.map((s, idx) => `${labels[idx]} ${s}`).join('\n');
          rulesEmbed.addFields({ name: '📅 Suggested Time Slots', value: slotText, inline: false });
        }

        rulesEmbed.addFields(
          { name: '🎮 Table Setup', value: 'Any player can host this table. Please coordinate who will host, create the match in-game, and share the lobby password directly in this thread.', inline: false },
          { name: '💤 Player Non-Responsiveness', value: 'Tag your opponents if they do not respond. If a player fails to respond or make a move for **over 24 hours**—*especially during initial setup before the game starts, or during active play*—tag our tournament support team listed in the pin above.', inline: false },
          { name: '⏳ Turn Pings', value: 'Tag the next player when it is their turn to keep the match moving.', inline: false },
          { name: '📸 Reporting Results', value: 'Once the game concludes, upload your final screenshot to:\n🔗 **[dunestats.cc/tournament](https://dunestats.cc/tournament)**', inline: false }
        );

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

        createdCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await interaction.followUp({ content: `✅ Successfully created **${createdCount}** private threads and posted the match guidelines!`, flags: [MessageFlags.Ephemeral] });

    } catch (error) {
      console.error('Failed processing the CSV or creating threads:', error);
      await interaction.editReply({ content: '⚠️ An error occurred while parsing the CSV or generating the threads.' });
    }
  }
};
