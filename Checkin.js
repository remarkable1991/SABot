const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { TOURNAMENTS_CONFIG } = require('./tournament-config');

const TOURNAMENT_HOST_ROLE_ID = '1229360017581539421';
const CHECKIN_EMOJI_NAME = 'SA';
const CHECKIN_WINDOW_MS = 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkin')
    .setDescription('Open tournament check-in (Tournament Host only)')
    .addIntegerOption((option) =>
      option
        .setName('tournament_number')
        .setDescription('The tournament number to open check-in for')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('remove_after_24h')
        .setDescription('Automatically delete this message 24 hours after posting (default: No)')
        .setRequired(false)
    ),

  async execute(interaction, { supabase }) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const member = interaction.member;
    const isHost = member.roles.cache.has(TOURNAMENT_HOST_ROLE_ID);
    const isAdmin = member.permissions.has('Administrator');

    if (!isHost && !isAdmin) {
      return await interaction.editReply({
        content: `❌ You do not have permission to run this command. Only users with the <@&${TOURNAMENT_HOST_ROLE_ID}> role can open check-in.`
      });
    }

    const tNum = interaction.options.getInteger('tournament_number');
    const removeAfter24h = interaction.options.getBoolean('remove_after_24h') ?? false;

    const config = TOURNAMENTS_CONFIG[tNum];
    if (!config || !config.registeredRoleId || !config.checkInRoleId) {
      return await interaction.editReply({
        content: `❌ Tournament #${tNum} isn't fully configured for check-in yet (missing registered or check-in role ID in \`tournament-config.js\`).`
      });
    }

    const now = new Date();
    const closesAt = new Date(now.getTime() + CHECKIN_WINDOW_MS);
    const closesUnix = Math.floor(closesAt.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Tournament #${tNum} Check-In is OPEN!`)
      .setColor(0x2ECC71)
      .setDescription(
        `React with :${CHECKIN_EMOJI_NAME}: below to check in for **Tournament #${tNum}**!\n\n` +
        `⏳ Check-in closes <t:${closesUnix}:R> (<t:${closesUnix}:F>).\n\n` +
        `If you're registered, you'll automatically get the check-in role. If you're not registered yet, we'll post instructions in <#1084215380517605486> on how to fix that.`
      )
      .setFooter({
        text: removeAfter24h
          ? 'This message will auto-delete once check-in closes.'
          : 'This message will stay up (marked closed) once check-in closes.'
      })
      .setTimestamp(now);

    const message = await interaction.channel.send({
      content: `📢 <@&${config.registeredRoleId}> Check-in for **Tournament #${tNum}** is now open!`,
      embeds: [embed]
    });

    const guildEmoji = interaction.guild.emojis.cache.find((e) => e.name === CHECKIN_EMOJI_NAME);
    if (guildEmoji) {
      await message.react(guildEmoji).catch(() => {});
    } else {
      console.error(`Custom emoji :${CHECKIN_EMOJI_NAME}: not found in guild — falling back to ✅.`);
      await message.react('✅').catch(() => {});
    }

    const { error: insertErr } = await supabase.from('tournament_checkins').insert({
      tournament_num: tNum,
      message_id: message.id,
      channel_id: message.channel.id,
      guild_id: interaction.guild.id,
      created_at: now.toISOString(),
      expires_at: closesAt.toISOString(),
      remove_after_24h: removeAfter24h,
      notified_user_ids: []
    });

    if (insertErr) {
      console.error('Failed to record tournament_checkins row:', insertErr);
      return await interaction.editReply({
        content: `⚠️ Check-in message was posted, but I failed to save tracking data — reactions on it won't be processed. Check the logs.`
      });
    }

    await interaction.editReply({ content: `✅ Check-in opened for Tournament #${tNum} in ${message.channel}.` });
  }
};
