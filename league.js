const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const LFG_ADMIN_ROLE = '1557469534133162045';
const LEAGUE_LFG_CHANNEL_ID = '1557473551227818024';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('league')
    .setDescription('Host an official Live League match')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Optional custom note or message for this lobby')
        .setRequired(false)
    ),

  async execute(interaction, { supabase, discordClient, createQueueLobby, updateQueueMessage, resolveHostIgn, promptUnknownHostIgn, pendingLeagueNotes }) {
    if (!interaction.member.roles.cache.has(LFG_ADMIN_ROLE) && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '❌ Only LFG Admins can host official League matches during the testing phase.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Require linked IGN before hosting a League match
    if (resolveHostIgn) {
      const hostIgnCheck = await resolveHostIgn(interaction.user.id);
      if (!hostIgnCheck.isKnown) {
        const leagueChannel = interaction.channel || (discordClient ? await discordClient.channels.fetch(LEAGUE_LFG_CHANNEL_ID).catch(() => null) : null);
        if (promptUnknownHostIgn) {
          await promptUnknownHostIgn(null, interaction.user.id, leagueChannel);
        }
        await interaction.editReply({
          content: '❌ You need to link your **Dune: Imperium Digital In-Game Name** before hosting a match! Please run **`/ign`** first.'
        }).catch(() => {});
        setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
        return;
      }
    }

    const customNote = interaction.options.getString('text')?.trim() || null;

    const { data: queueRecords } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('mode', 'live')
      .order('joined_at', { ascending: true })
      .limit(3);

    const waitingQueue = (queueRecords || []).filter(r => r.discord_user_id && r.discord_user_id !== interaction.user.id);

    // If players are waiting in the queue, store the customNote and ask if the host wants to pull them
    if (waitingQueue.length > 0) {
      if (pendingLeagueNotes) {
        pendingLeagueNotes.set(interaction.user.id, customNote);
      }

      const namesList = waitingQueue.map(r => `<@${r.discord_user_id}>`).join(', ');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('league_cmd_pull_yes')
          .setLabel(`Pull Queue Players (${waitingQueue.length})`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('league_cmd_pull_no')
          .setLabel('Start Fresh (Just Me)')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        content: `👥 There ${waitingQueue.length === 1 ? 'is **1 player**' : `are **${waitingQueue.length} players**`} currently waiting in the queue (${namesList}).\nWould you like to pull them into your new League lobby?`,
        components: [row]
      });

      setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
      return;
    }

    // Queue is empty -> Create lobby immediately with customNote
    await supabase.from('matchmaking_queue').delete().eq('discord_user_id', interaction.user.id);
    if (updateQueueMessage) updateQueueMessage();

    const targetMsg = await createQueueLobby(
      interaction.user.id,
      [interaction.user.id],
      'live',
      false,
      false,
      customNote
    );

    if (!targetMsg) {
      await interaction.editReply({
        content: '❌ Could not create lobby. Please make sure your In-Game Name is linked using **`/ign`**.'
      }).catch(() => {});
      setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
      return;
    }

    const jumpLink = `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}/${targetMsg.id}`;

    await interaction.editReply({
      content: `✅ Created your Live League match in <#${LEAGUE_LFG_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**`
    });

    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
  }
};
