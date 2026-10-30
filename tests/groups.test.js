import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CAPS, SCORING_PRESETS, exampleScores, gameWinner, matchWinner, openGameCount, pairings, qualification, rankGroup, shortNames } from '../public/groups.js';
import { readFileSync } from 'node:fs';

const players = (...ids) => ids.map((id) => ({ id, name: id }));
const m = (a, b, ...games) => ({ a, b, games });
const order = (result) => result.standings.map((s) => s.id).join('');
const by = (result) => Object.fromEntries(result.standings.map((s) => [s.id, s.by]));

test('matchWinner needs two games in best of three and one game otherwise', () => {
  assert.equal(matchWinner([[21, 15], [21, 18]], 'bestOf3'), 'a');
  assert.equal(matchWinner([[21, 15], [18, 21]], 'bestOf3'), null);
  assert.equal(matchWinner([[21, 15], [18, 21], [19, 21]], 'bestOf3'), 'b');
  assert.equal(matchWinner([[15, 21]], 'oneGame'), 'b');
  assert.equal(matchWinner([[21, 21]], 'oneGame'), null);
});

test('most matches won ranks first, with no ties', () => {
  const r = rankGroup(players('A', 'B', 'C'), [
    m('A', 'B', [21, 10], [21, 10]),
    m('A', 'C', [21, 10], [21, 10]),
    m('B', 'C', [21, 10], [21, 10]),
  ], 'bestOf3');
  assert.equal(order(r), 'ABC');
  assert.deepEqual(r.steps.map((s) => s.key), ['expl.noTies']);
});

test('two players level on wins are split by their own match', () => {
  // A and B both win 2; C and D both win 1.
  const r = rankGroup(players('A', 'B', 'C', 'D'), [
    m('A', 'B', [21, 19], [21, 19]),
    m('A', 'C', [21, 19], [21, 19]),
    m('A', 'D', [10, 21], [10, 21]),
    m('B', 'C', [21, 5], [21, 5]),
    m('B', 'D', [21, 5], [21, 5]),
    m('C', 'D', [21, 19], [21, 19]),
  ], 'bestOf3');
  // B has the far better games and points, but head-to-head comes first for two.
  assert.equal(order(r), 'ABCD');
  assert.equal(by(r).A, 'headToHead');
});

test('three level on wins go to overall games difference, not head-to-head', () => {
  // Circle: A beat B 2-0, B beat C 2-1, C beat A 2-1; everyone beat D 2-0.
  const r = rankGroup(players('A', 'B', 'C', 'D'), [
    m('A', 'B', [21, 15], [21, 15]),
    m('B', 'C', [21, 15], [15, 21], [21, 15]),
    m('C', 'A', [21, 15], [15, 21], [21, 15]),
    m('A', 'D', [21, 10], [21, 10]),
    m('B', 'D', [21, 10], [21, 10]),
    m('C', 'D', [21, 10], [21, 10]),
  ], 'bestOf3');
  // Games difference: A +3, C +2, B +1.
  assert.equal(order(r), 'ACBD');
  assert.equal(by(r).A, 'gamesDiff');
  assert.equal(by(r).B, 'gamesDiff');
});

test('after points difference, the last two level go back to head-to-head', () => {
  const r = rankGroup(players('A', 'B', 'C', 'D'), [
    m('A', 'B', [21, 15], [19, 21], [21, 18]),
    m('B', 'C', [21, 17], [18, 21], [21, 19]),
    m('C', 'A', [21, 19], [15, 21], [21, 16]),
    m('A', 'D', [21, 10], [21, 12]),
    m('B', 'D', [21, 10], [21, 11]),
    m('C', 'D', [21, 12], [21, 11]),
  ], 'bestOf3');
  // Games all +2; points A +26, B +17, C +17; B beat C.
  assert.equal(order(r), 'ABCD');
  assert.equal(by(r).A, 'pointsDiff');
  assert.equal(by(r).B, 'headToHead');
  assert.deepEqual(r.steps.map((s) => s.key), ['expl.tiedMatches', 'expl.gamesDiff', 'expl.pointsDiff', 'expl.headToHead']);
});

test('one-game groups skip games difference and use points', () => {
  const r = rankGroup(players('A', 'B', 'C', 'D'), [
    m('A', 'B', [21, 18]),
    m('B', 'C', [21, 15]),
    m('C', 'A', [21, 19]),
    m('A', 'D', [21, 10]),
    m('B', 'D', [21, 12]),
    m('C', 'D', [21, 16]),
  ], 'oneGame');
  // Points: A +12, B +12, C +1; A beat B.
  assert.equal(order(r), 'ABCD');
  assert.equal(by(r).C, 'pointsDiff');
  assert.equal(by(r).A, 'headToHead');
  assert.ok(!r.steps.some((s) => s.key === 'expl.gamesDiff'));
});

test('three still level on everything are left to the referee to draw lots', () => {
  const r = rankGroup(players('A', 'B', 'C'), [
    m('A', 'B', [21, 19]),
    m('B', 'C', [21, 19]),
    m('C', 'A', [21, 19]),
  ], 'oneGame');
  assert.ok(r.standings.every((s) => s.by === 'lots'));
  assert.equal(r.steps.at(-1).key, 'expl.lots');
});

test('a withdrawn player goes bottom and their results are discounted', () => {
  const r = rankGroup([...players('A', 'B', 'C'), { id: 'D', name: 'D', withdrew: true }], [
    m('A', 'B', [21, 10], [21, 10]),
    m('A', 'C', [21, 10], [21, 10]),
    m('B', 'C', [21, 10], [21, 10]),
    m('D', 'A', [21, 10], [21, 10]), // D beat A before withdrawing: doesn't count
  ], 'bestOf3');
  assert.equal(order(r), 'ABCD');
  assert.equal(r.standings[0].lost, 0);
  assert.equal(by(r).D, 'withdrew');
});

test('games typed after a best-of-three was decided are ignored', () => {
  const r = rankGroup(players('A', 'B'), [m('A', 'B', [21, 10], [21, 10], [5, 21])], 'bestOf3');
  assert.equal(r.standings[0].gamesLost, 0);
});

test('pairings lists every match once', () => {
  assert.equal(pairings(4).length, 6);
  assert.equal(pairings(6).length, 15);
});

test('one-game matches count only the first game, even if later games hold old scores', () => {
  assert.equal(matchWinner([[21, 15], [10, 21], [10, 21]], 'oneGame'), 'a');
  const r = rankGroup(players('A', 'B'), [m('A', 'B', [21, 15], [10, 21], [10, 21])], 'oneGame');
  assert.equal(r.unfinished, 0);
  assert.equal(r.standings[0].id, 'A');
  assert.equal(r.standings[0].won, 1);
  assert.equal(r.standings[0].pointsWon, 21);
});

test('every example tells the same story in both formats and at 21, 15 and 11 points', () => {
  const group = players('A', 'B', 'C', 'D');
  for (const g of [21, 15, 11]) for (const format of ['bestOf3', 'oneGame']) {
    const run = (id) => {
      const scores = exampleScores(id, format, g);
      for (const games of Object.values(scores)) {
        for (const [x, y] of games) {
          assert.ok(Math.max(x, y) === g && Math.min(x, y) >= 0 && Math.min(x, y) <= g - 2, `${id}/${format}/${g}: ${x}-${y}`);
        }
      }
      return rankGroup(group, pairings(4).map(([i, j]) => ({ a: group[i].id, b: group[j].id, games: scores[`${i}-${j}`] })), format, { rules: { points: g } });
    };
    const two = run('two');
    assert.equal(order(two), 'ABCD', `two/${format}`);
    assert.equal(by(two).A, 'headToHead');
    assert.equal(by(two).C, 'headToHead');

    const circle = run('circle');
    assert.equal(order(circle), 'ACBD', `circle/${format}`);
    assert.equal(by(circle).A, format === 'oneGame' ? 'pointsDiff' : 'gamesDiff');

    const points = run('points');
    assert.equal(order(points), 'ABCD', `points/${format}`);
    assert.equal(by(points).B, 'headToHead');
    assert.ok(points.steps.some((s) => s.key === 'expl.pointsDiff'), `points/${format} reaches points difference`);
    assert.equal(points.unfinished + two.unfinished + circle.unfinished, 0);
  }
});

test('qualification: already through when no one can catch up', () => {
  const q = qualification(players('A', 'B', 'C'), [
    m('A', 'B', [21, 15], [21, 15]),
    m('A', 'C', [21, 15], [21, 15]),
    m('B', 'C'),
  ], 'bestOf3', 'A', 1);
  assert.equal(q.status, 'through');
});

test('qualification: already out when the places are taken', () => {
  const q = qualification(players('A', 'B', 'C'), [
    m('A', 'B', [15, 21], [15, 21]),
    m('A', 'C', [15, 21], [15, 21]),
    m('B', 'C'),
  ], 'bestOf3', 'A', 2);
  assert.equal(q.status, 'out');
});

test('qualification: rows follow the entry\'s own results; a three-way tie depends on games or points', () => {
  const q = qualification(players('A', 'B', 'C'), [
    m('A', 'B', [21, 15], [21, 15]),
    m('A', 'C'),
    m('B', 'C'),
  ], 'bestOf3', 'A', 1);
  assert.equal(q.status, 'open');
  const [win, lose] = q.rows;
  assert.deepEqual(win.outcomes, [{ winner: 'A', loser: 'C' }]);
  assert.equal(win.result, 'yes');
  assert.deepEqual(lose.outcomes, [{ winner: 'C', loser: 'A' }]);
  assert.equal(lose.result, 'maybe');
  // C beating B too puts C top; B beating C makes a three-way tie on one win each.
  assert.ok(lose.reasons.includes('others'));
  assert.ok(lose.reasons.some((r) => r === 'games' || r === 'points'));
});

test('qualification: one-game groups leave three-way ties to points', () => {
  const q = qualification(players('A', 'B', 'C'), [
    m('A', 'B', [21, 10]),
    m('A', 'C'),
    m('B', 'C'),
  ], 'oneGame', 'A', 1);
  const lose = q.rows.find((r) => r.outcomes[0].winner === 'C');
  assert.equal(lose.result, 'maybe');
  assert.deepEqual(lose.reasons, ['others', 'points']);
});

test('qualification: top two is easier than first place', () => {
  const games = [m('A', 'B', [21, 15], [21, 15]), m('A', 'C'), m('B', 'C')];
  const q = qualification(players('A', 'B', 'C'), games, 'bestOf3', 'A', 2);
  // With a win already, A can't finish below 2nd in a group of three... unless a three-way tie.
  assert.equal(q.rows.find((r) => r.outcomes[0].winner === 'A').result, 'yes');
});

test('qualification: too many open matches, all played, or withdrawn', () => {
  const six = players('A', 'B', 'C', 'D', 'E', 'F');
  const none = pairings(6).map(([i, j]) => m(six[i].id, six[j].id));
  assert.equal(qualification(six, none, 'bestOf3', 'A', 2).status, 'tooMany');
  const done = [m('A', 'B', [21, 1], [21, 1])];
  assert.equal(qualification(players('A', 'B'), done, 'bestOf3', 'A', 1).status, 'done');
  const gone = [{ id: 'A', name: 'A', withdrew: true }, ...players('B', 'C')];
  assert.equal(qualification(gone, [m('B', 'C')], 'bestOf3', 'A', 2).status, 'out');
});

test('a game only counts once it is finished under the scoring rules', () => {
  const finished = (score, rules) => gameWinner(score, rules);
  // Games to 21 with setting: win by two, up to 30.
  assert.equal(finished([21, 19]), 'a');
  assert.equal(finished([21, 20]), null); // still going: 21-20 needs another point
  assert.equal(finished([22, 20]), 'a');
  assert.equal(finished([20, 22]), 'b');
  assert.equal(finished([23, 20]), null); // can't happen
  assert.equal(finished([29, 27]), 'a');
  assert.equal(finished([30, 29]), 'a');
  assert.equal(finished([30, 28]), 'a');
  assert.equal(finished([31, 29]), null);
  assert.equal(finished([10, 8]), null); // in progress
  // Games to 15 with setting: up to 21.
  assert.equal(finished([16, 14], { points: 15 }), 'a');
  assert.equal(finished([21, 20], { points: 15 }), 'a');
  assert.equal(finished([21, 15], { points: 15 }), null); // a 21-point score in a 15-point match
  // No setting: first to the target wins, even from 20 all.
  assert.equal(finished([21, 20], { setting: false }), 'a');
  assert.equal(finished([15, 14], { points: 15, setting: false }), 'a');
  assert.equal(finished([22, 20], { setting: false }), null);
});

test('unfinished games do not count towards a match or the standings', () => {
  assert.equal(matchWinner([[21, 15], [21, 20]], 'bestOf3'), null);
  assert.equal(matchWinner([[21, 15], [21, 20]], 'bestOf3', { setting: false }), 'a');
  const r = rankGroup(players('A', 'B'), [m('A', 'B', [21, 15], [21, 20])], 'bestOf3');
  assert.equal(r.unfinished, 1);
  assert.equal(r.standings[0].pointsWon, 0);
});

test('every tier in the matrix has a scoring preset, and the default is the BWF standard', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/tc-2026.json', import.meta.url), 'utf8'));
  for (const tier of data.tiers) assert.ok(SCORING_PRESETS[tier.id], `no preset for ${tier.id}`);
  assert.deepEqual(SCORING_PRESETS.bwf, { format: 'bestOf3', points: 21, setting: true });
  for (const [id, preset] of Object.entries(SCORING_PRESETS)) {
    assert.ok(['bestOf3', 'oneGame'].includes(preset.format), id);
    assert.ok(preset.points in CAPS, id);
  }
  assert.equal(SCORING_PRESETS['junior-silver'].points, 15);
  assert.equal(SCORING_PRESETS['junior-bronze'].format, 'oneGame');
});

test('games count in order: a later game can\'t count while an earlier one is unfinished', () => {
  assert.equal(matchWinner([null, [21, 15], [21, 15]], 'bestOf3'), null);
  assert.equal(matchWinner([[21, 20], [21, 15], [21, 15]], 'bestOf3'), null); // game 1 still going
  assert.equal(matchWinner([[21, 15], [15, 21], [21, 19]], 'bestOf3'), 'a');
});

test('only the next game can be entered, and nothing after the match is won', () => {
  assert.equal(openGameCount([], 'bestOf3'), 1);
  assert.equal(openGameCount([[21, 18]], 'bestOf3'), 2);
  assert.equal(openGameCount([[21, 20]], 'bestOf3'), 1); // game 1 not finished with setting
  assert.equal(openGameCount([[21, 18], [21, 15]], 'bestOf3'), 2); // 2-0: no third game
  assert.equal(openGameCount([[21, 18], [15, 21]], 'bestOf3'), 3);
  assert.equal(openGameCount([[21, 18], [15, 21], [21, 19]], 'bestOf3'), 3);
  assert.equal(openGameCount([[21, 20]], 'bestOf3', { setting: false }), 2);
  assert.equal(openGameCount([], 'oneGame'), 1);
  assert.equal(openGameCount([[21, 10]], 'oneGame'), 1);
});

test('shortNames keeps surnames, the reader\u2019s own players in full, and tells shared surnames apart', () => {
  const shown = shortNames(['Sam Carter', 'Al Reed', 'Kim Example', 'Ned Ward', 'Jay Moss', 'Joe Moss', 'Jo Moss', 'Madonna', ''],
    (n) => n === 'Kim Example');
  assert.equal(shown.get('Sam Carter'), 'Carter');
  assert.equal(shown.get('Al Reed'), 'Reed');
  assert.equal(shown.get('Kim Example'), 'Kim Example');
  assert.equal(shown.get('Madonna'), 'Madonna');
  // Three Mosses: Jay and Joe would both be "J. Moss", so they stay in full.
  assert.equal(shown.get('Jay Moss'), 'Jay Moss');
  assert.equal(shown.get('Joe Moss'), 'Joe Moss');
  assert.equal(shown.get('Jo Moss'), 'Jo Moss');
  const two = shortNames(['Amy Lee', 'Ben Lee']);
  assert.deepEqual([two.get('Amy Lee'), two.get('Ben Lee')], ['A. Lee', 'B. Lee']);
  assert.equal(shortNames(['Amy  Lee']).get('Amy  Lee'), 'Lee');
});
