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
  17: {
    registeredRoleId: '1546458221928124426',
    checkInRoleId: '1546458821231116349',
    checkInStartTimestamp: 1788775200,   // Sep 7, 2026 12:00 CEST
    tournamentStartTimestamp: 1788861600 // Sep 8, 2026 12:00 CEST
  },
  18: {
    registeredRoleId: '1546458472554569728',
    checkInRoleId: '1551613867157749780',
    checkInStartTimestamp: 1790251200,   // Sep 24, 2026 14:00 CEST
    tournamentStartTimestamp: 1790337600 // Sep 25, 2026 14:00 CEST
  },
  19: {
    registeredRoleId: null, // TODO: T19's Registered role ID wasn't provided yet
    checkInRoleId: '1551614087098667180',
    checkInStartTimestamp: 1791100800,   // Oct 4, 2026 10:00 CEST
    tournamentStartTimestamp: 1791187200 // Oct 5, 2026 10:00 CEST
  }
};

module.exports = { TOURNAMENTS_CONFIG };
