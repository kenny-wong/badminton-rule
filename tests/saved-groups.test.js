import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_GROUPS, groupKind, groupNames, loadGroups, newGroup, sanitizeState, sanitizeStore, saveGroups } from '../site/saved-groups.js';

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, String(v)) };
}

const GENDERS = { Amy: 'F', Bea: 'F', Cat: 'F', Dan: 'M', Eli: 'M', Fin: 'M', Gus: '' };
const genderOf = (name) => GENDERS[name] ?? '';

function state(event, names) {
  const entries = Array.from({ length: 6 }, (_, i) => (event === 'doubles' ? names[i] ?? ['', ''] : [names[i] ?? '', '']));
  return sanitizeState({ event, size: names.length, entries });
}

test('sanitizeState keeps good values and drops bad ones', () => {
  const s = sanitizeState({
    event: 'doubles', format: 'oneGame', gamePoints: 15, noSetting: true, preset: 'nope', size: 9,
    entries: [['Amy', 5]], withdrew: [true, 'yes'],
    scores: { '0-1': [[21, 15], 'x', [100, -1]], '1-0': [[1, 2]], '0-7': [[1, 2]], junk: [] },
  });
  assert.equal(s.event, 'doubles');
  assert.equal(s.format, 'oneGame');
  assert.equal(s.gamePoints, 15);
  assert.equal(s.noSetting, true);
  assert.equal(s.preset, 'custom');
  assert.equal(s.size, 4);
  assert.deepEqual(s.entries[0], ['Amy', '']);
  assert.equal(s.entries.length, 6);
  assert.deepEqual(s.withdrew, [true, false, false, false, false, false]);
  assert.deepEqual(s.scores, { '0-1': [[21, 15], null, [null, null]] });
});

test('sanitizeStore caps the number of groups and forgets an unknown active group', () => {
  const groups = Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, alias: 'x', state: {} }));
  const store = sanitizeStore({ active: 'g8', groups });
  assert.equal(store.groups.length, MAX_GROUPS);
  assert.equal(store.active, null);
  assert.equal(sanitizeStore({ active: 'g1', groups }).active, 'g1');
  assert.deepEqual(sanitizeStore(null), { active: null, groups: [] });
});

test('groups survive a save and load', () => {
  const storage = memoryStorage();
  const group = newGroup(state('singles', ['Amy', 'Bea', 'Cat']));
  group.state.scores = { '0-1': [[21, 19], [21, 17]] };
  assert.equal(saveGroups({ active: group.id, groups: [group] }, storage), true);
  assert.deepEqual(loadGroups(storage), { active: group.id, groups: [group] });
});

test('storage failures are reported, not thrown', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadGroups(broken), { active: null, groups: [] });
  assert.equal(saveGroups({ active: null, groups: [] }, broken), false);
});

test('groupKind names singles by the players’ genders', () => {
  assert.equal(groupKind(state('singles', ['Dan', 'Eli', 'Fin']), genderOf), 'ms');
  assert.equal(groupKind(state('singles', ['Amy', 'Bea', 'Cat']), genderOf), 'ws');
  assert.equal(groupKind(state('singles', ['Amy', 'Dan', 'Cat']), genderOf), 'singles');
  assert.equal(groupKind(state('singles', ['Amy', 'Bea', 'Gus']), genderOf), 'singles');
  assert.equal(groupKind(state('singles', ['Amy', 'Bea', '']), genderOf), 'ws'); // an empty slot doesn't count
  assert.equal(groupKind(state('singles', ['', '', '']), genderOf), 'singles');
});

test('groupKind names doubles by each pair’s genders', () => {
  assert.equal(groupKind(state('doubles', [['Dan', 'Eli'], ['Fin', 'Dan'], ['Eli', 'Fin']]), genderOf), 'md');
  assert.equal(groupKind(state('doubles', [['Amy', 'Bea'], ['Cat', 'Amy'], ['Bea', 'Cat']]), genderOf), 'wd');
  assert.equal(groupKind(state('doubles', [['Amy', 'Dan'], ['Eli', 'Bea'], ['Cat', 'Fin']]), genderOf), 'xd');
  assert.equal(groupKind(state('doubles', [['Amy', 'Dan'], ['Eli', 'Fin'], ['Cat', 'Fin']]), genderOf), 'doubles');
  assert.equal(groupKind(state('doubles', [['Amy', 'Gus'], ['Eli', 'Bea'], ['Cat', 'Fin']]), genderOf), 'doubles');
});

test('groupKind ignores slots not filled in yet', () => {
  assert.equal(groupKind(state('doubles', [['Amy', 'Dan'], ['', ''], ['', ''], ['', '']]), genderOf), 'xd');
  assert.equal(groupKind(state('doubles', [['Amy', ''], ['Eli', 'Bea'], ['Cat', 'Fin']]), genderOf), 'xd');
  assert.equal(groupKind(state('doubles', [['Dan', ''], ['Eli', 'Fin'], ['', '']]), genderOf), 'md');
  assert.equal(groupKind(state('doubles', [['Amy', ''], ['', ''], ['', '']]), genderOf), 'doubles'); // women's or mixed: can't tell yet
  assert.equal(groupKind(state('doubles', [['', ''], ['', ''], ['', '']]), genderOf), 'doubles');
});

test('groupNames letters groups that share a kind, and keeps aliases', () => {
  const g = (alias, s) => ({ alias, state: s });
  const singles = state('singles', ['Amy', 'Dan', 'Gus']);
  const men = state('singles', ['Dan', 'Eli', 'Fin']);
  assert.deepEqual(groupNames([g('', singles), g('', men), g('', singles), g(' Club night ', singles)], genderOf), [
    { kind: 'singles', letter: 'A' },
    { kind: 'ms', letter: '' },
    { kind: 'singles', letter: 'B' },
    { alias: 'Club night' },
  ]);
});
