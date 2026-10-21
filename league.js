const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const LFG_ADMIN_ROLE = '1557469534133162045';
const LEAGUE_LFG_CHANNEL_ID = '1557473551227818024';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('league')
    .setDescription('Host an official Live League match'),

  async execute(interaction, { supabase, createQueueLobby, updateQueueMessage }) {
    if (!interaction.member.roles.cache.has(LFG_ADMIN_ROLE) && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '❌ Only LFG Admins can host official League matches during the testing phase.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { data: queueRecords } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('mode', 'live')
      .order('joined_at', { ascending: true })
      .limit(3);

    const waitingQueue = (queueRecords || []).filter(r => r.discord_user_id && r.discord_user_id !== interaction.user.id);

    // If players are waiting in the queue, ask if the host wants to pull them or start fresh
    if (waitingQueue.length > 0) {
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

    // Queue is empty -> Create lobby immediately
    await supabase.from('matchmaking_queue').delete().eq('discord_user_id', interaction.user.id);
    if (updateQueueMessage) updateQueueMessage();

    const targetMsg = await createQueueLobby(
      interaction.user.id,
      [interaction.user.id],
      'live',
      false,
      false,
      null
    );

    const jumpLink = targetMsg
      ? `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}/${targetMsg.id}`
      : `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}`;

    await interaction.editReply({
      content: `✅ Created your Live League match in <#${LEAGUE_LFG_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**`
    });

    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
  }
};
