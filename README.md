# Discord ELO Announcement Bot

This bot listens for new rows in the `game_results` Supabase table and posts a formatted
announcement to a Discord channel, including per-player ELO changes (Overall + game mode)
and the match screenshot.

## Setup

1. Install dependencies:
   npm install

2. Copy `.env.example` to `.env` and fill in your real values (locally only, never commit `.env`).

3. Run locally to test:
   npm start

## Deploying to Railway

1. Push this folder to a new GitHub repository.
2. In Railway, create a New Project -> Deploy from GitHub repo, and select this repo.
3. In Railway's project settings, go to Variables and add:
   - DISCORD_BOT_TOKEN
   - DISCORD_CHANNEL_ID
   - SUPABASE_URL
   - SUPABASE_SECRET_KEY
4. Railway will detect the Node.js project and run `npm install` then `npm start` automatically.
5. Check the Deploy Logs for "Logged in as ..." and "Supabase realtime subscription status: SUBSCRIBED"
   to confirm it's running correctly.

## Notes

- The bot uses Supabase Realtime, so Realtime must be enabled for the `game_results` table
  (Database -> Replication in the Supabase dashboard, toggle the table on).
- Screenshots are stored in a private bucket (`match-screenshots`), so the bot generates a
  short-lived signed URL (60 seconds) each time it announces a game.
- A 2-second buffer is used after the first row of a game_id arrives, to make sure all
  players' rows have been inserted before posting the announcement.
