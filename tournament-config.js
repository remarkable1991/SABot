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
  19: {
    registeredRoleId: 1551614208280494170, // TODO: T19's Registered role ID wasn't provided yet
    checkInRoleId: '1551614087098667180',
    checkInStartTimestamp: 1791115200,   // Oct 4, 2026 10:00 CEST
    tournamentStartTimestamp: 1791115200 // Oct 5, 2026 10:00 CEST
  }
};

module.exports = { TOURNAMENTS_CONFIG };
