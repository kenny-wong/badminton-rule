import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MAX_PROFILES, addFromBadminfo, loadProfiles, namesMatch, newProfile, profileFor, sanitizeProfiles, saveProfiles, updateRatings } from '../public/profiles.js';

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, String(v)) };
}

test('sanitizeProfiles drops bad grades and dates but keeps the profile', () => {
  const [p] = sanitizeProfiles([{ id: 'a', name: 'Amy', gender: 'X', dob: '2013-02-30x', grades: { singles: 'D', doubles: 'Z', mixed: 5 } }]);
  assert.deepEqual(p, {
    id: 'a', name: 'Amy', gender: '', dob: '', grades: { singles: 'D', doubles: '', mixed: '' },
    badminfoId: '', beNumber: '', ratings: { singles: null, doubles: null, mixed: null }, ratingsDate: '',
  });
});

test('sanitizeProfiles keeps a badminfo player’s id, BE number and ratings when well formed', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const [good] = sanitizeProfiles([{ name: 'Kim', badminfoId: id, beNumber: '1234567', ratings: { singles: 515, doubles: 463, mixed: 473 }, ratingsDate: '2026-10-30' }]);
  assert.equal(good.badminfoId, id);
  assert.equal(good.beNumber, '1234567');
  assert.deepEqual(good.ratings, { singles: 515, doubles: 463, mixed: 473 });
  assert.equal(good.ratingsDate, '2026-10-30');
  const [bad] = sanitizeProfiles([{ name: 'Kim', badminfoId: '../x', beNumber: '12a', ratings: { singles: -1, doubles: 'x' }, ratingsDate: 'soon' }]);
  assert.deepEqual([bad.badminfoId, bad.beNumber, bad.ratings, bad.ratingsDate], ['', '', { singles: null, doubles: null, mixed: null }, '']);
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

test('profileFor puts the badminfo id first, and never matches another badminfo player by name', () => {
  const kim = { name: 'Kim Lee', badminfoId: 'aaaaaaaa-0000-0000-0000-000000000001' };
  const chloe = { name: 'Chloe', badminfoId: '' };
  // The draw spells the name differently: the id still finds Kim.
  assert.equal(profileFor([chloe, kim], 'Kimberley Lee', kim.badminfoId), kim);
  // Another Kim Lee in the draw, with a different id, is not the saved Kim.
  assert.equal(profileFor([kim], 'Kim Lee', 'bbbbbbbb-0000-0000-0000-000000000002'), null);
  // Without ids, names decide as before.
  assert.equal(profileFor([kim], 'Kim Lee'), kim);
  assert.equal(profileFor([chloe, kim], 'Chloe Wong', 'bbbbbbbb-0000-0000-0000-000000000002'), chloe);
});

describe('addFromBadminfo', () => {
  const player = {
    id: '11111111-2222-4333-8444-555555555555', name: 'Kim Example', beNumber: '1234567',
    grades: { singles: 'H', doubles: 'I', mixed: 'H' }, ratings: { singles: 515, doubles: 463, mixed: 473 }, ratingsDate: '2026-10-30',
  };

  test('adds a new player with grades, ratings, id and BE number', () => {
    const r = addFromBadminfo([], player);
    assert.equal(r.added, true);
    assert.equal(r.profiles.length, 1);
    assert.equal(r.profile.name, 'Kim Example');
    assert.deepEqual(r.profile.grades, player.grades);
    assert.deepEqual(r.profile.ratings, player.ratings);
    assert.equal(r.profile.badminfoId, player.id);
    assert.equal(r.profile.beNumber, '1234567');
  });

  test('updates only the ratings of a player saved with the same BE number', () => {
    const saved = { ...newProfile('Kimmy'), gender: 'M', dob: '2012-03-04', grades: { singles: 'I', doubles: 'I', mixed: 'I' },
      badminfoId: player.id, beNumber: '1234567', ratings: { singles: 400, doubles: 400, mixed: 400 } };
    const other = newProfile('Kim Example'); // same name, no BE number: not the same player
    const r = addFromBadminfo([saved, other], player);
    assert.equal(r.added, false);
    assert.equal(r.profiles.length, 2);
    assert.deepEqual(r.profile.ratings, player.ratings);
    assert.equal(r.profile.ratingsDate, '2026-10-30');
    assert.equal(r.profile.name, 'Kimmy');
    assert.deepEqual(r.profile.grades, saved.grades);
    assert.equal(r.profile.dob, '2012-03-04');
    assert.equal(r.profiles[1], other);
  });

  test('adds nothing when the list is full', () => {
    const many = Array.from({ length: MAX_PROFILES }, (_, i) => newProfile(`P${i}`));
    const r = addFromBadminfo(many, player);
    assert.equal(r.full, true);
    assert.equal(r.profiles, many);
  });

  test('updateRatings changes the ratings of the player with that badminfo id only', () => {
    const kin = { ...newProfile('Kim Example'), badminfoId: player.id };
    const amy = newProfile('Amy');
    const [a, b] = updateRatings([kin, amy], player);
    assert.deepEqual(a.ratings, player.ratings);
    assert.equal(b, amy);
  });
});
