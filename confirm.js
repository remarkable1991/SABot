let timeDisplay = finalTimeText;
      if (finalTimeText.startsWith('<t:')) {
        timeDisplay = finalTimeText;
      } else if (finalTimestamp) {
        const unixSec = Math.floor(new Date(finalTimestamp).getTime() / 1000);
        timeDisplay = `<t:${unixSec}:F> (<t:${unixSec}:R>)`;
      }

      const liveEmbed = new EmbedBuilder()
        .setTitle(`📅 Match Time Confirmed: [${schedule.match_code}] ${schedule.round_type} ${schedule.table_identifier}`)
        .setColor(0x2ECC71)
        .setDescription(`Match time locked in for ${timeDisplay}!\n\nPlease let your opponents know on time if you need to reschedule.`)
        .setTimestamp();
