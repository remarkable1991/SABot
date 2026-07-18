const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');

const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421'; 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mass-threads')
    .setDescription('Create match threads from a pre-processed CSV')
    .addAttachmentOption((option) =>
      option.setName('csv').setDescription('Upload the bot-ready CSV').setRequired(true)
    ),

  async execute(interaction, { discordClient }) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const member = interaction.member;
    if (!member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID) && !member.permissions.has('Administrator')) {
      return await interaction.editReply({ content: `❌ Permission denied.` });
    }

    const attachment = interaction.options.getAttachment('csv');
    try {
      const response = await fetch(attachment.url);
      const csvText = await response.text();
      const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

      const parentChannel = interaction.channel;
      const guild = interaction.guild;
      let createdCount = 0;

      for (let i = 1; i < lines.length; i++) {
        // Splits by commas not inside quotes, removes surrounding quotes
        const columns = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
        if (columns.length < 2) continue;

        const threadTitle = columns[0];
        const rawPings = columns[1];
        
        // Handle optional time slots (columns 2, 3, 4)
        const slots = [columns[2], columns[3], columns[4]].filter(s => s && s !== 'No Backup Slot Secured');

        // Resolve Discord Mentions
        const resolvedPings = rawPings.split(',').map(p => p.trim()).map(item => {
          if (item.startsWith('@')) {
            const parts = item.split(' ');
            return `\`${parts[0]}\` ${parts.slice(1).join(' ')}`;
          }
          return item;
        });

        // 1. Create Private Thread
        const thread = await parentChannel.threads.create({
          name: threadTitle,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          reason: 'Mass Matchmaking'
        });

        // 2. Draft Rules Embed
        const rulesEmbed = new EmbedBuilder()
          .setTitle(`🏆 Match Coordination: ${threadTitle}`)
          .setDescription(`Welcome! Please coordinate your match below.`)
          .setColor(0xC9A24B);

        // Add Time Slots if they exist
        if (slots.length > 0) {
          const labels = ['🇦', '🇧', '🇨'];
          const slotText = slots.map((s, idx) => `${labels[idx]} ${s}`).join('\n');
          rulesEmbed.addFields({ name: '📅 Suggested Time Slots', value: slotText, inline: false });
        }

        rulesEmbed.addFields(
          { name: '🎮 Table Setup', value: 'Coordinate who will host and share lobby password.', inline: false },
          { name: '📸 Reporting', value: 'Upload result screenshot to [dunestats.cc](https://dunestats.cc/tournament).', inline: false }
        );

        // 3. Send Message
        const message = await thread.send({
          content: `👥 **Participants:** ${resolvedPings.join(' | ')}\n🛡️ **Support:** <@&${TOURNAMENT_HOST_ROLE_ID}>`,
          embeds: [rulesEmbed]
        });

        // 4. Add Emojis as Reactions
        if (slots.length > 0) {
          const labels = ['🇦', '🇧', '🇨'];
          for (let idx = 0; idx < slots.length; idx++) {
            await message.react(labels[idx]);
          }
        }

        createdCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await interaction.followUp({ content: `✅ Created **${createdCount}** threads.`, flags: [MessageFlags.Ephemeral] });
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '⚠️ Error generating threads.' });
    }
  }
};
