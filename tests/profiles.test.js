import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadProfiles, namesMatch, newProfile, profileFor, sanitizeProfiles, saveProfiles } from '../public/profiles.js';

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, String(v)) };
}

test('sanitizeProfiles drops bad grades and dates but keeps the profile', () => {
  const [p] = sanitizeProfiles([{ id: 'a', name: 'Amy', gender: 'X', dob: '2013-02-30x', grades: { singles: 'D', doubles: 'Z', mixed: 5 } }]);
  assert.deepEqual(p, { id: 'a', name: 'Amy', gender: '', dob: '', grades: { singles: 'D', doubles: '', mixed: '' } });
});

test('sanitizeProfiles ignores non-arrays and junk entries', () => {
  assert.deepEqual(sanitizeProfiles({}), []);
  assert.equal(sanitizeProfiles([null, 3, { name: 'Ben' }]).length, 1);
});

test('profiles survive a save and load', () => {
  const storage = memoryStorage();
  const amy = { ...newProfile(1), name: 'Amy', gender: 'F', dob: '2014-06-06', grades: { singles: 'H', doubles: 'G', mixed: '' } };
  assert.equal(saveProfiles([amy], storage), true);
  assert.deepEqual(loadProfiles(storage), [amy]);
});

test('storage failures are reported, not thrown', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadProfiles(broken), []);
  assert.equal(saveProfiles([], broken), false);
});

test('a browser that blocks localStorage itself does not break loading or saving', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.deepEqual(loadProfiles(), []);
    assert.equal(saveProfiles([]), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('namesMatch finds a saved name inside a longer one, by whole words', () => {
  assert.equal(namesMatch('Chloe', 'Chloe Wong'), true);
  assert.equal(namesMatch('chloe  WONG', 'Chloe Wong'), true);
  assert.equal(namesMatch('Wong Chloe', 'Chloe Wong'), true);
  assert.equal(namesMatch('Ann', 'Chloe-Ann Wong'), true);
  assert.equal(namesMatch('Ann', 'Anna Lee'), false);
  assert.equal(namesMatch('Chloe Lam', 'Chloe Wong'), false);
  assert.equal(namesMatch('', 'Chloe Wong'), false);
});

test('profileFor prefers an exact name, then a partial one', () => {
  const chloe = { name: 'Chloe', gender: 'F' };
  const chloeWong = { name: 'chloe wong', gender: 'F' };
  const ben = { name: 'Ben', gender: 'M' };
  assert.equal(profileFor([chloe, chloeWong, ben], 'Chloe Wong'), chloeWong);
  assert.equal(profileFor([chloe, ben], 'Chloe Wong'), chloe);
  assert.equal(profileFor([chloe, ben], 'Zoe'), null);
  assert.equal(profileFor([chloe], '  '), null);
});
