import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { summarize } from '../lib/badminfo.js';
import { rankGroup } from '../public/groups.js';
import { findGroup, fitsCalculator, groupState, importLabels, mergeResults, savedPlayersIn, scoringFromScores, tournamentChoices, tournamentPreset, unscoredMatches } from '../public/imported-group.js';
import { SAMPLE } from './fixtures/badminfo-sample.js';

const match = (a, b, ...games) => ({ a, b, games, winner: null, note: null });
const ID1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const ID2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const ID3 = 'cccccccc-0000-0000-0000-000000000003';

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

test('importLabels shortens names to the event code and group letter', () => {
  const groups = [
    { event: 'MS Open', name: 'Group A' }, { event: 'MS Open', name: 'Group B' },
    { event: 'WD Open', name: 'Group A' }, { event: 'XD Open', name: 'XD Open' },
    { event: 'OD Chichester', name: 'OD Chi - Group A' },
  ];
  assert.deepEqual(importLabels(groups), ['MS Group A', 'MS Group B', 'WD Group A', 'XD Open', 'OD Group A']);
  // Two events with the same code: their full names tell the groups apart.
  assert.deepEqual(importLabels([{ event: 'WS Open', name: 'Group A' }, { event: 'WS U15', name: 'Group A' }]),
    ['WS Open Group A', 'WS U15 Group A']);
  // An event name that isn't a code is kept whole.
  assert.deepEqual(importLabels([{ event: 'Men’s Singles', name: 'Group A' }]), ['Men’s Singles Group A']);
});

test('savedPlayersIn lists the group’s saved players by their full names', () => {
  const group = { teams: [['Amy Lee', 'Bea Wu'], ['Chloe Wong', 'Dee Ho'], ['Chloe Lam', 'Eve']] };
  const saved = (...names) => names.map((name) => ({ name, badminfoId: '' }));
  assert.deepEqual(savedPlayersIn(group, saved('amy  lee', 'Dee Ho', 'Zoe', '')), ['Amy Lee', 'Dee Ho']);
  // A first name alone finds every player with it.
  assert.deepEqual(savedPlayersIn(group, saved('Chloe')), ['Chloe Wong', 'Chloe Lam']);
  assert.deepEqual(savedPlayersIn(group, saved('Chloe', 'chloe wong')), ['Chloe Wong', 'Chloe Lam']);
  assert.deepEqual(savedPlayersIn(group, []), []);
});

test('savedPlayersIn knows a player by badminfo id first', () => {
  const kim = { name: 'Kim Lee', badminfoId: ID1 };
  const group = { teams: [['Kimberley Lee', 'Bea Wu'], ['Kim Lee', 'Dee Ho']], ids: [[ID1, ''], [ID2, '']] };
  // The id finds Kimberley Lee; the other Kim Lee has a different id, so isn't her.
  assert.deepEqual(savedPlayersIn(group, [kim]), ['Kimberley Lee']);
});

test('groupState keeps the draw’s names and records the source', () => {
  const source = { link: 'https://badminfo.com/Tournament/x', event: 'WD Open', name: 'Group A' };
  const s = groupState({ teams: [['Amy Lee', 'Bea Wu'], ['Cat Ng', 'Dee Ho'], ['Eve', 'Fay']], matches: [] }, {}, { source });
  assert.deepEqual(s.entries[0], ['Amy Lee', 'Bea Wu']);
  assert.deepEqual(s.source, source);
  const withIds = groupState({ teams: [['Amy'], ['Bea'], ['Cat']], ids: [[ID1], ['not-an-id'], ['']], matches: [] });
  assert.deepEqual(withIds.ids.slice(0, 3), [[ID1, ''], ['', ''], ['', '']]);
});

test('findGroup finds the same draw in a refreshed tournament', () => {
  const tournament = { groups: [{ event: 'MS', name: 'Group A' }, { event: 'WS', name: 'Group A' }] };
  assert.equal(findGroup(tournament, { event: 'WS', name: 'Group A' }), tournament.groups[1]);
  assert.equal(findGroup(tournament, { event: 'XD', name: 'Group A' }), null);
});

describe('mergeResults', () => {
  // The calculator holds A, B, C in its own order, with a what-if score typed in for B v C.
  const state = groupState({ teams: [['A'], ['B'], ['C']], matches: [match(0, 1, [21, 10])] });
  state.scores['1-2'] = [[21, 19]];
  // badminfo now: A v B as before, C beat A, and D has played B.
  const latest = { teams: [['C'], ['A'], ['B'], ['D']], matches: [
    match(1, 2, [21, 10]), match(0, 1, [21, 17]), match(3, 2, [15, 21]), match(2, 0),
  ] };

  test('updates every match by name and adds entries that have played since', () => {
    const r = mergeResults(state, latest);
    assert.equal(r.changed, 2);
    assert.equal(r.added, 1);
    assert.equal(r.state.size, 4);
    assert.deepEqual(r.state.entries.slice(0, 4).map((e) => e[0]), ['A', 'B', 'C', 'D']);
    assert.deepEqual(r.state.scores, { '0-1': [[21, 10]], '0-2': [[17, 21]], '1-3': [[21, 15]], '1-2': [[21, 19]] });
  });

  test('with one match named, changes only that match', () => {
    const r = mergeResults(state, latest, '0-2');
    assert.equal(r.found, true);
    assert.equal(r.changed, 1);
    assert.equal(r.added, 0);
    assert.equal(r.state.size, 3);
    assert.deepEqual(r.state.scores, { '0-1': [[21, 10]], '0-2': [[17, 21]], '1-2': [[21, 19]] });
    // B v C has no result on badminfo yet: the typed score stays.
    const none = mergeResults(state, latest, '1-2');
    assert.equal(none.found, true);
    assert.equal(none.scored, false);
    assert.equal(none.changed, 0);
    // A v B is the same on badminfo as on screen.
    const same = mergeResults(state, latest, '0-1');
    assert.equal(same.scored, true);
    assert.equal(same.changed, 0);
    assert.deepEqual(none.state.scores['1-2'], [[21, 19]]);
  });

  test('reports a match it cannot find, for instance after a rename', () => {
    const renamed = { ...state, entries: [['A'], ['Bob'], ['C'], ...state.entries.slice(3)] };
    assert.equal(mergeResults(renamed, latest, '0-1').found, false);
  });

  test('matches entries by player id before names, and learns ids for entries found by name', () => {
    const imported = groupState({ teams: [['Amy'], ['Bea'], ['Cat']], ids: [[ID1], [ID2], ['']], matches: [] });
    // badminfo now spells Amy differently, and has Cat's id.
    const now = { teams: [['Amy Lee'], ['Bea'], ['Cat']], ids: [[ID1], [ID2], [ID3]], matches: [match(0, 2, [21, 9]), match(1, 2, [21, 8])] };
    const r = mergeResults(imported, now);
    assert.equal(r.added, 0);
    assert.deepEqual(r.state.scores, { '0-2': [[21, 9]], '1-2': [[21, 8]] });
    assert.equal(r.state.ids[2][0], ID3);
    // A different player with Bea's name (another id) is a new entry, not Bea.
    const other = { teams: [['Bea'], ['Amy']], ids: [['dddddddd-0000-0000-0000-000000000004'], [ID1]], matches: [match(0, 1, [21, 3])] };
    const r2 = mergeResults(imported, other);
    assert.equal(r2.added, 1);
    assert.deepEqual(r2.state.entries[3], ['Bea', '']);
  });

  test('stops adding entries at six', () => {
    const big = { teams: Array.from({ length: 8 }, (_, i) => [`P${i}`]), matches: Array.from({ length: 7 }, (_, i) => match(i, i + 1, [21, 5])) };
    const r = mergeResults(groupState({ teams: big.teams.slice(0, 3), matches: [] }), big);
    assert.equal(r.state.size, 6);
    assert.equal(r.added, 3);
  });
});

test('tournamentChoices lists the next few tournaments, and the past ones on request', () => {
  const tour = (n, start, end = start) => ({ id: `t${n}`, name: `T${n}`, start, end });
  const list = [
    tour(1, '2026-01-10'), tour(2, '2026-10-24'), tour(3, '2026-10-29', '2026-10-31'), // ends after today: still on
    tour(4, '2026-11-01'), tour(5, '2026-11-08'), tour(6, '2026-11-15'), tour(7, '2026-12-01'), tour(8, '2027-01-05'),
  ];
  const today = '2026-10-30';
  const shown = tournamentChoices(list, today);
  assert.deepEqual(shown.upcoming.map((t) => t.id), ['t3', 't4', 't5', 't6', 't7']);
  assert.deepEqual(shown.past, []);
  assert.equal(shown.pastCount, 2);
  const all = tournamentChoices(list, today, { past: true });
  assert.deepEqual(all.upcoming.map((t) => t.id), ['t3', 't4', 't5', 't6', 't7', 't8']);
  assert.deepEqual(all.past.map((t) => t.id), ['t2', 't1']);
  assert.deepEqual(tournamentChoices([], today), { upcoming: [], past: [], pastCount: 0 });
});

test('tournamentPreset reads the tier from the tournament and the age group from the event', () => {
  const t = (name, category = 4, ageGroup = 3) => ({ name, category, ageGroup });
  assert.equal(tournamentPreset(t('TheDKWay U15 Silver', 2, 1), 'OS U15'), 'junior-silver');
  assert.equal(tournamentPreset(t('Swindon Stars U15 Bronze October 2026', 1, 1), 'WS U15'), 'junior-bronze');
  // One tournament, two age groups: Gold U11 has its own scoring.
  assert.equal(tournamentPreset(t('Example U11 Gold & U15 Gold', 3, 1), 'BS U11'), 'junior-gold-u11');
  assert.equal(tournamentPreset(t('Example U11 Gold & U15 Gold', 3, 1), 'BS U15'), 'junior-gold');
  assert.equal(tournamentPreset(t('Example U19 Silver', 2, 1), 'MD U19'), 'u19-silver');
  assert.equal(tournamentPreset(t('Example Masters Bronze', 1, 2), 'MD 40+'), 'masters-bronze');
  assert.equal(tournamentPreset(t('Example Senior Gold', 3)), 'senior-gold');
  assert.equal(tournamentPreset(t('Example Tier 4 Open')), 'senior-tier4');
  // The category alone gives the level when the name doesn't.
  assert.equal(tournamentPreset(t('Example Junior Series', 1, 1), 'GS U13'), 'junior-bronze');
  // Open and restricted tournaments have no tier: the scores decide.
  assert.equal(tournamentPreset(t('Sussex Super Series - Chichester'), 'OD Chichester'), null);
  assert.equal(tournamentPreset(t('BJBA U14 & U19 2026 Restricted', 4, 1), 'OS U14'), null);
  assert.equal(tournamentPreset(null), null);
});

test('groupState takes the tournament\u2019s scoring before what the scores show', () => {
  const group = { teams: [['A'], ['B'], ['C']], matches: [match(0, 1, [21, 10])] };
  const s = groupState(group, {}, { preset: 'junior-silver' });
  assert.deepEqual([s.format, s.gamePoints, s.noSetting, s.preset], ['bestOf3', 15, false, 'junior-silver']);
  assert.equal(groupState(group, {}, { preset: 'nope' }).format, 'oneGame'); // unknown: the scores decide
});
