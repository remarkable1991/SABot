require('dotenv').config();

const { REST, Routes } = require('discord.js');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const tournamentCommand = require('./tournament'); // 1. Import the new command module

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
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
      { 
        body: [
          statsCommand.data.toJSON(), 
          asyncCommand.data.toJSON(),
          tournamentCommand.data.toJSON() // 2. Add the JSON body data here
        ] 
      }
    );

    console.log('Registered /stats, /async, and /tournament commands.');
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
