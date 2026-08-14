require('dotenv').config();

const { REST, Routes } = require('discord.js');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const liveCommand = require('./live'); 
const fixCommand = require('./fix');
const tournamentCommand = require('./tournament');
const massThreadsCommand = require('./mass-threads');
const spCommand = require('./sp'); 
const confirmCommand = require('./confirm');
const tournamentStatusCommand = require('./tournament-status');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error('Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started registering application (/) commands...');
    
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
      { 
        body: [
          statsCommand.data.toJSON(), 
          asyncCommand.data.toJSON(),
          liveCommand.data.toJSON(), 
          fixCommand.data.toJSON(),
          tournamentCommand.data.toJSON(),
          massThreadsCommand.data.toJSON(),
          spCommand.data.toJSON(),
          confirmCommand.data.toJSON(),
          tournamentStatusCommand.data.toJSON()
        ] 
      }
    );

    console.log('Successfully registered all 9 commands: /stats, /async, /live, /fix, /tournament, /mass-threads, /sp, /confirm, and /tournament-status.');
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
