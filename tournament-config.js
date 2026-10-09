// Single source of truth for per-tournament Discord role IDs and timestamps.
// Add a tournament here once and it's picked up everywhere automatically:
//   - index.js derives TOURNAMENT_ROLE_MAP from this (registration role auto-sync)
//   - tournament.js's /tournament command displays whatever tournaments are keys here
//   - checkin.js's /checkin command uses registeredRoleId + checkInRoleId
//
// A tournament only needs `registeredRoleId` to get registration role-sync working.
// checkInRoleId / checkInStartTimestamp / tournamentStartTimestamp can be added later —
// /tournament and /checkin both degrade gracefully (skip what's missing) if they're null.

const TOURNAMENTS_CONFIG = {
  20: {
    registeredRoleId: '1558089230209646712', // TODO: T19's Registered role ID wasn't provided yet
    checkInRoleId: '1558089377094303794',
    checkInStartTimestamp: 1792764000,   // Oct 4, 2026 10:00 CEST
    tournamentStartTimestamp: 1792850400 // Oct 5, 2026 10:00 CEST
  }
};

module.exports = { TOURNAMENTS_CONFIG };
