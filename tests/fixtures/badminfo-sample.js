export const ID = 'c7fa0c7e-1adb-412f-a229-190bd893db4f';

// The shape of badminfo's tournament JSON, cut down, with made-up players.
export const SAMPLE = {
  beTournament: {
    id: ID,
    beId: 'ca88e186-d31b-4e88-b01a-b7f64d301760',
    name: 'Example Super Series',
    startDate: '2026-10-25T00:00:00',
    endDate: '2027-04-18T00:00:00',
    players: ['Amy', 'Bea', 'Cat', 'Dee', 'Eve', 'Fay', 'Gil', 'Hal'].map((playerEntryName, index) => ({ index, playerEntryName })),
    events: [
      {
        name: 'WD Example',
        draws: [{
          type: 'Round Robin',
          name: 'WD Example',
          rubbers: [
            { team1PlayerIndexes: [0, 1], team2PlayerIndexes: [2, 3], winningTeam: 1, games: [{ team1Score: 21, team2Score: 15 }, { team1Score: 21, team2Score: 11 }] },
            { team1PlayerIndexes: [0, 1], team2PlayerIndexes: [4, 5], winningTeam: 1, games: [{ team1Score: 22, team2Score: 20 }, { team1Score: 17, team2Score: 21 }, { team1Score: 22, team2Score: 20 }] },
            // Listed the other way round from the first match.
            { team1PlayerIndexes: [5, 4], team2PlayerIndexes: [3, 2], winningTeam: 2, scoreText: 'Walkover', games: [] },
          ],
        }],
      },
      {
        name: 'OD Example',
        draws: [
          { type: 'Elimination', name: 'OD Example - Main', rubbers: [{ team1PlayerIndexes: [6], team2PlayerIndexes: [7], winningTeam: 1, games: [{ team1Score: 21, team2Score: 3 }] }] },
          { type: 'Round Robin', name: 'OD Ex - Group A', rubbers: [] },
        ],
      },
      { name: 'XD Example', draws: [] },
    ],
  },
};
