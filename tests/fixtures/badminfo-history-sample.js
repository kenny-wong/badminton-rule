// The shape of badminfo's player JSON with match history, cut down, with a
// made-up player and opponents; and Badminton England's player pages, cut down.

import { playerId } from './badminfo-sample.js';

export const ME = playerId(100);
export const BE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const me = (previousRating) => ({ id: ME, name: 'Alex  Example', previousRating });
const other = (n, name, previousRating) => ({ id: playerId(n), name, previousRating });
const games = (...g) => g.map(([team1Score, team2Score]) => ({ team1Score, team2Score }));
const effect = (thisPlayerRatingChange, thisPlayerWinChance) => ({ rubberProcessingStatus: 0, thisPlayerRatingChange, thisPlayerWinChance });

export const HISTORY = {
  id: ME,
  beId: BE_ID,
  name: 'Alex  Example',
  county: 'Exampleshire',
  gradings: [
    { key: 'Single', value: 'G', firstSeenUtc: '2026-10-30T13:15:00Z' },
    { key: 'Single', value: 'H', firstSeenUtc: '2026-06-26T10:00:00Z' },
    { key: 'Double', value: 'I', firstSeenUtc: '2025-10-28T10:00:00Z' },
    { key: 'Mixed', value: 'Z', firstSeenUtc: '2025-10-28T10:00:00Z' },
  ],
  ratings: { ratingsDate: '2026-10-30T00:00:00Z', singlesRating: 540, doublesRating: 480, mixedRating: null },
  upcomingGradeChange: {
    gradePeriodStartDate: '2026-06-26T00:00:00',
    gradePeriodEndDate: '2026-10-30T00:00:00',
    singles: { previousGrade: 'H', predictedNewGradeBestCase: 'G', predictedNewGradeWorstCase: 'G',
      qualifyingRubbers: [{ winningTeam: 1, team1Players: [me(500)], team2Players: [other(1, 'Bo', 520)] }] },
    doubles: { previousGrade: 'I', predictedNewGradeBestCase: 'H', predictedNewGradeWorstCase: 'I',
      qualifyingRubbers: [{ winningTeam: 1, team1Players: [other(2, 'Cy', 470)], team2Players: [me(470), other(3, 'Di', 480)] }] },
  },
  previousGradeChange: null,
  trophies: [
    { trophyType: 0, disciplineShortTitle: 'OS', category: 1, tournamentStartDate: '2026-04-25T00:00:00', tournamentName: 'Spring Bronze', tournamentId: playerId(900) },
    { trophyType: 1, disciplineShortTitle: 'OD', category: 2, tournamentStartDate: '2026-10-17T00:00:00', tournamentName: 'Autumn Silver', tournamentId: playerId(901), partnerName: 'Di' },
  ],
  competitionsWithRubbers: [
    // Newest first, as badminfo lists them; each one's matches in the order they were played.
    {
      tournament: { id: playerId(901), name: 'Autumn Silver', startDate: '2026-10-17T00:00:00', category: 2 },
      rubbers: [
        { roundText: 'Group A', discipline: 0, eventName: 'OS U15', winningTeam: 2, team1Players: [other(4, 'Ed', 560)], team2Players: [me(520)],
          games: games([19, 21], [21, 23]), ratingsEffect: effect(8, 0.35) },
        { roundText: 'Final', eliminationRound: 3, discipline: 0, eventName: 'OS U15', winningTeam: 2, team1Players: [me(528)], team2Players: [other(5, 'Flo', 530)],
          games: games([21, 15], [18, 21], [19, 21]), ratingsEffect: effect(-4, 0.48) },
        { roundText: 'Group B', discipline: 1, eventName: 'OD U15', winningTeam: 1, team1Players: [me(470), other(3, 'Di', 480)], team2Players: [other(6, 'Gus', 500), other(7, 'Hu', 490)],
          games: games([21, 12], [21, 9]), ratingsEffect: effect(10, 0.3) },
        { roundText: 'Group B', discipline: 1, eventName: 'OD U15', winningTeam: 0, team1Players: [me(480), other(3, 'Di', 480)], team2Players: [other(8, 'Ivy', 400), other(9, 'Jo', 400)],
          games: [], scoreText: 'Not played', ratingsEffect: null },
      ],
    },
    { league: { name: 'County League', startDate: '2025-09-01T00:00:00' }, leagueMatch: { date: '2026-02-28T00:00:00' }, tournament: null,
      rubbers: [
        { roundText: '', discipline: 1, eventName: 'Shires', winningTeam: 1, team1Players: [other(6, 'Gus', 500), other(7, 'Hu', 490)], team2Players: [me(460), other(3, 'Di', 470)],
          games: games([15, 21], [21, 17], [21, 18]), ratingsEffect: effect(-3, 0.45) },
      ] },
    {
      tournament: { id: playerId(900), name: 'Spring Bronze', startDate: '2026-04-25T00:00:00', category: 1 },
      rubbers: [
        { roundText: 'Group C', discipline: 0, eventName: 'OS U15', winningTeam: 1, team1Players: [me(500)], team2Players: [other(5, 'Flo', 450)],
          games: games([21, 10], [21, 8]), ratingsEffect: effect(4, 0.82) },
        { roundText: 'Final', eliminationRound: 2, discipline: 0, eventName: 'OS U15', winningTeam: 2, team1Players: [other(5, 'Flo', 455)], team2Players: [me(504)],
          games: games([20, 22], [21, 19], [11, 21]), ratingsEffect: effect(16, 0.7) },
        // Someone else's match, which badminfo shouldn't list but the reader must skip.
        { roundText: 'Group C', discipline: 0, winningTeam: 1, team1Players: [other(1, 'Bo', 500)], team2Players: [other(2, 'Cy', 500)], games: games([21, 0]) },
      ],
    },
  ],
};

const statTab = (name, career, year) => `<div id="tabStats${name}" class="module"><ul class="list">
<div class="list__item">
  <dt class="list__label">Career</dt>
  <dd class="list__value"><div class="flex-container"><span class="list__value-start">
        ${career}
      </span></div></dd>
</div>
<div class="list__item">
  <dt class="list__label">This year</dt>
  <dd class="list__value"><div class="flex-container"><span class="list__value-start">
        ${year}
      </span></div></dd>
</div></ul></div>`;

export const BE_OVERVIEW = `<main>${statTab('Total', '12 / 8 (20)', '10 / 5 (15)')}${statTab('Singles', '9 / 3 (12)', '8 / 2 (10)')}${statTab('Doubles', '3 / 5 (8)', '2 / 3 (5)')}</main>`;

const caption = (title, week) => `<caption class="module-divider"><div class="flex-container">
  <div class="module-divider__body"><a href="/ranking/ranking.aspx?rid=87">${title}</a></div>
  <div class="module-divider__aside"><span class="tag tag--soft">${week}</span></div></div></caption>`;

export const BE_RANKING = `<table class="table--new">${caption('Badminton England National Rankings', '43-2026')}
 <thead><tr><th>Category</th><th>Rank</th><th>Points</th><th>Total points</th><th>Rating</th></tr></thead>
 <tbody>
  <tr><th scope="row" class="th__title"><a href="/ranking/player.aspx?id=1">OS</a></th><td class="text--right">473</td><td>4,529</td><td>27174</td><td>540</td></tr>
  <tr><th scope="row" class="th__title"><a href="/ranking/player.aspx?id=1">Men&#39;s XD</a></th><td class="text--right">1259</td><td>395</td><td>2369</td><td>456</td></tr>
 </tbody></table>
<table class="table--new">${caption('Badminton England Player Grading', '43-2026')}
 <thead><tr><th>Category</th><th>QM Won</th><th>QM Lost</th><th>W/L Ratio</th></tr></thead>
 <tbody><tr><th scope="row">OS</th><td>14</td><td>2</td><td>88%</td></tr></tbody></table>`;
