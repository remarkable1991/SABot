const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const LFG_ADMIN_ROLE = '1557469534133162045';
const LEAGUE_LFG_CHANNEL_ID = '1557473551227818024';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Instantly host an official Live League match (Buttons + Modal test version)'),

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

    const playersToPop = (queueRecords || []).map(r => r.discord_user_id).filter(Boolean);
    const allToClear = [interaction.user.id, ...playersToPop];

    for (const pid of allToClear) {
      await supabase.from('matchmaking_queue').delete().eq('discord_user_id', pid);
    }
    if (updateQueueMessage) updateQueueMessage();

    const playerSet = new Set([interaction.user.id, ...playersToPop]);
    const targetMsg = await createQueueLobby(
      interaction.user.id,
      Array.from(playerSet),
      'live',
      false,
      true, // useButtons = true (Buttons + Modal version)
      'Official Ranked League Match!'
    );

    const jumpLink = targetMsg
      ? `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}/${targetMsg.id}`
      : `https://discord.com/channels/${interaction.guildId}/${LEAGUE_LFG_CHANNEL_ID}`;

    await interaction.editReply({
      content: `✅ Created your Live League match (Buttons Mode) in <#${LEAGUE_LFG_CHANNEL_ID}>!\n🔗 **[Jump to Lobby](${jumpLink})**`
    });

    setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
  }
};
