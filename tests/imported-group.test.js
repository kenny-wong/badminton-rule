import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarize } from '../lib/badminfo.js';
import { rankGroup } from '../public/groups.js';
import { fitsCalculator, groupState, importLabels, scoringFromScores, unscoredMatches } from '../public/imported-group.js';
import { SAMPLE } from './fixtures/badminfo-sample.js';

const match = (a, b, ...games) => ({ a, b, games, winner: null, note: null });

test('scoringFromScores reads the format, points and setting from the scores', () => {
  assert.deepEqual(scoringFromScores([match(0, 1, [21, 15], [21, 11]), match(0, 2, [22, 20], [17, 21], [22, 20])]),
    { format: 'bestOf3', gamePoints: 21, noSetting: false, preset: 'bwf' });
  assert.deepEqual(scoringFromScores([match(0, 1, [21, 10]), match(1, 2, [28, 26])]),
    { format: 'oneGame', gamePoints: 21, noSetting: false, preset: 'custom' });
  assert.equal(scoringFromScores([match(0, 1, [15, 9], [16, 14])]).gamePoints, 15);
  assert.equal(scoringFromScores([match(0, 1, [11, 4], [11, 9])]).gamePoints, 11);
  // 21-20 can only end a game without setting.
  assert.equal(scoringFromScores([match(0, 1, [21, 20], [21, 5])]).noSetting, true);
  assert.equal(scoringFromScores([match(0, 1), match(1, 2)]), null);
  // A game stopped early (a retirement) doesn't reach any target.
  assert.equal(scoringFromScores([match(0, 1, [6, 2])]), null);
});

test('groupState fills the calculator, turning scores round to match its order', () => {
  const [group] = summarize(SAMPLE, 'x').groups;
  assert.ok(fitsCalculator(group));
  assert.equal(unscoredMatches(group), 1);
  const s = groupState(group);
  assert.equal(s.event, 'doubles');
  assert.equal(s.size, 3);
  assert.deepEqual(s.entries.slice(0, 4), [['Amy', 'Bea'], ['Cat', 'Dee'], ['Eve', 'Fay'], ['', '']]);
  assert.deepEqual(s.scores, { '0-1': [[21, 15], [21, 11]], '0-2': [[22, 20], [17, 21], [22, 20]] });
  assert.equal(s.format, 'bestOf3');
  assert.equal(s.preset, 'bwf');

  const reversed = groupState({ teams: [['Gil'], ['Hal'], ['Ivy']], matches: [match(2, 0, [21, 3]), match(1, 2, [21, 19])] });
  assert.equal(reversed.event, 'singles');
  assert.deepEqual(reversed.scores, { '0-2': [[3, 21]], '1-2': [[21, 19]] });
  assert.equal(reversed.format, 'oneGame');
});

test('groupState keeps the current scoring when no game has been played', () => {
  const s = groupState({ teams: [['A'], ['B'], ['C']], matches: [] }, { format: 'oneGame', gamePoints: 15, noSetting: true, preset: 'custom' });
  assert.equal(s.format, 'oneGame');
  assert.equal(s.gamePoints, 15);
  assert.equal(s.noSetting, true);
});

test('an imported group ranks in the calculator', () => {
  const s = groupState({ teams: [['A'], ['B'], ['C'], ['D']], matches: [
    match(0, 1, [21, 10]), match(2, 3, [21, 14]), match(0, 2, [21, 13]),
    match(1, 3, [21, 5]), match(0, 3, [21, 13]), match(1, 2, [21, 14]),
  ] });
  const players = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id }));
  const matches = Object.entries(s.scores).map(([key, games]) => {
    const [i, j] = key.split('-').map(Number);
    return { a: players[i].id, b: players[j].id, games };
  });
  const result = rankGroup(players, matches, s.format, { rules: { points: s.gamePoints, setting: !s.noSetting } });
  assert.deepEqual(result.standings.map((r) => r.id), ['A', 'B', 'C', 'D']);
});

test('fitsCalculator takes groups of 3 to 6 entries', () => {
  const teams = (n) => Array.from({ length: n }, (_, i) => [`P${i}`]);
  assert.equal(fitsCalculator({ teams: teams(2) }), false);
  assert.equal(fitsCalculator({ teams: teams(6) }), true);
  assert.equal(fitsCalculator({ teams: teams(7) }), false);
});

test('importLabels adds the events once group names repeat across events', () => {
  const groups = [
    { event: 'MS Open', name: 'Group A' }, { event: 'MS Open', name: 'Group B' },
    { event: 'WD Open', name: 'Group A' }, { event: 'XD Open', name: 'XD Open' },
  ];
  assert.deepEqual(importLabels(groups), ['MS Open · Group A', 'MS Open · Group B', 'WD Open · Group A', 'XD Open']);
  // Names that are already different stay as they are.
  const distinct = [{ event: 'OD Chichester', name: 'OD Chi - Group A' }, { event: 'XD Chichester', name: 'XD Chi - Group A' }];
  assert.deepEqual(importLabels(distinct), ['OD Chi - Group A', 'XD Chi - Group A']);
});
