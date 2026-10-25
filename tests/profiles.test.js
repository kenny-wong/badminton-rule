import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadProfiles, newProfile, sanitizeProfiles, saveProfiles } from '../site/profiles.js';

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
