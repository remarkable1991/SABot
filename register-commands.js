require('dotenv').config();

const { REST, Routes } = require('discord.js');
const statsCommand = require('./stats');
const asyncCommand = require('./async'); 
const liveCommand = require('./live'); 
const tournamentCommand = require('./tournament');
const massThreadsCommand = require('./mass-threads');
const spCommand = require('./sp'); // Imported the new SP command module

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
          tournamentCommand.data.toJSON(),
          massThreadsCommand.data.toJSON(),
          spCommand.data.toJSON() // Added SP command JSON body data here
        ] 
      }
    );

    console.log('Successfully registered all commands: /stats, /async, /live, /tournament, /mass-threads, and /sp.');
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
