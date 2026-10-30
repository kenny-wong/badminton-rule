// Saved player profiles. They live only in this browser's localStorage: nothing
// is sent anywhere, so storage may be missing (private mode, blocked site data)
// and every access is guarded.

import { DISCIPLINES, GRADES, parseDate } from './eligibility.js';

const KEY = 'badminton-tcs:profiles:v1';
export const MAX_PROFILES = 30;
const MAX_NAME = 60;
export const GENDERS = ['M', 'F']; // '' when not set

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// A player added from a badminfo link also keeps their badminfo id (the code in
// the link, also listed for each player in tournament draws), their BE number
// (used to spot a player added twice; never shown) and badminfo's ratings.
const NO_RATINGS = () => Object.fromEntries(DISCIPLINES.map((d) => [d, null]));

export function newProfile(name = '') {
  return {
    id: newId(), name, gender: '', dob: '', grades: Object.fromEntries(DISCIPLINES.map((d) => [d, ''])),
    badminfoId: '', beNumber: '', ratings: NO_RATINGS(), ratingsDate: '',
  };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const rating = (v) => (Number.isInteger(v) && v >= 0 && v < 10000 ? v : null);

/** Keeps only well-formed profiles, so a hand-edited or stale entry can't break the page. */
export function sanitizeProfiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === 'object')
    .slice(0, MAX_PROFILES)
    .map((p) => ({
      id: typeof p.id === 'string' && p.id ? p.id : newId(),
      name: typeof p.name === 'string' ? p.name.slice(0, MAX_NAME) : '',
      gender: GENDERS.includes(p.gender) ? p.gender : '',
      dob: typeof p.dob === 'string' && parseDate(p.dob) ? p.dob : '',
      grades: Object.fromEntries(DISCIPLINES.map((d) => [d, GRADES.includes(p.grades?.[d]) ? p.grades[d] : ''])),
      badminfoId: typeof p.badminfoId === 'string' && GUID.test(p.badminfoId) ? p.badminfoId : '',
      beNumber: typeof p.beNumber === 'string' && /^\d{1,10}$/.test(p.beNumber) ? p.beNumber : '',
      ratings: Object.fromEntries(DISCIPLINES.map((d) => [d, rating(p.ratings?.[d])])),
      ratingsDate: typeof p.ratingsDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.ratingsDate) ? p.ratingsDate : '',
    }));
}

// Even reading the localStorage property throws when site data is blocked, so it
// is looked up inside the try rather than as a default parameter.
export function loadProfiles(storage) {
  try {
    return sanitizeProfiles(JSON.parse((storage ?? globalThis.localStorage).getItem(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/** @returns {boolean} false when the browser refused to store them. */
export function saveProfiles(profiles, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}

// A name in a draw or a calculator slot often has more to it than the saved
// name ("Chloe" saved, "Chloe Wong" in the draw). Words are compared whole and
// without case, so "Ann" is not "Anna"; a hyphen splits words too.
const words = (name) => name.toLowerCase().split(/[\s-]+/).filter(Boolean);

/** Whether `name` is the saved player `saved`: it holds every word of the saved name, in any order. */
export function namesMatch(saved, name) {
  const have = words(name);
  const want = words(saved);
  return want.length > 0 && want.every((w) => have.includes(w));
}

/**
 * The saved profile a player refers to. With the player's badminfo `id` (from a
 * draw), the profile with that id comes first, and a profile tied to another
 * badminfo player is never matched by name alone: two players can share a
 * name. Otherwise an exact name (ignoring case and spacing), else a partial one.
 */
export function profileFor(profiles, name, id = '') {
  if (id) {
    const byId = profiles.find((p) => p.badminfoId === id);
    if (byId) return byId;
  }
  const key = words(name).join(' ');
  if (!key) return null;
  const candidates = id ? profiles.filter((p) => !p.badminfoId) : profiles;
  return candidates.find((p) => words(p.name).join(' ') === key) ?? candidates.find((p) => namesMatch(p.name, name)) ?? null;
}

/**
 * Adds a player fetched from badminfo (see summarizePlayer() in lib/badminfo.js),
 * or, when a saved player has the same BE number, updates only their ratings.
 * @returns {{ profiles: object[], profile: object|null, added: boolean, full: boolean }}
 *   `full`: no room for another player, so nothing was added.
 */
export function addFromBadminfo(profiles, player) {
  const existing = player.beNumber ? profiles.find((p) => p.beNumber === player.beNumber) : null;
  if (existing) {
    const profile = { ...existing, badminfoId: existing.badminfoId || player.id, ratings: { ...player.ratings }, ratingsDate: player.ratingsDate ?? '' };
    return { profiles: profiles.map((p) => (p === existing ? profile : p)), profile, added: false, full: false };
  }
  if (profiles.length >= MAX_PROFILES) return { profiles, profile: null, added: false, full: true };
  const profile = sanitizeProfiles([{
    ...newProfile(player.name), grades: player.grades, badminfoId: player.id, beNumber: player.beNumber,
    ratings: player.ratings, ratingsDate: player.ratingsDate ?? '',
  }])[0];
  return { profiles: [...profiles, profile], profile, added: true, full: false };
}

/** Updates a saved player's ratings from badminfo, matched by their badminfo id. */
export function updateRatings(profiles, player) {
  return profiles.map((p) => (p.badminfoId === player.id ? { ...p, ratings: { ...player.ratings }, ratingsDate: player.ratingsDate ?? '' } : p));
}
