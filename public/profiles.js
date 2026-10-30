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
 * What badminfo's latest data changes for a saved player: each discipline's
 * rating (before and after, the same when unchanged) and each grade badminfo
 * now gives differently, with the date it took effect and whether it went up
 * (towards A), down, or was set where there was none.
 * @returns {{ ratings: object[], grades: object[], changed: boolean }}
 */
export function playerChanges(profile, player) {
  const ratings = DISCIPLINES.filter((d) => Number.isInteger(player.ratings?.[d]))
    .map((d) => ({ d, from: profile.ratings?.[d] ?? null, to: player.ratings[d] }));
  const grades = DISCIPLINES.filter((d) => GRADES.includes(player.grades?.[d]) && player.grades[d] !== profile.grades?.[d])
    .map((d) => {
      const from = profile.grades?.[d] || '';
      const to = player.grades[d];
      const direction = !from ? 'set' : GRADES.indexOf(to) < GRADES.indexOf(from) ? 'up' : 'down';
      return { d, from, to, direction, since: player.gradeDates?.[d] || player.ratingsDate || '' };
    });
  return { ratings, grades, changed: grades.length > 0 || ratings.some((r) => r.from !== r.to) };
}

/** A saved player with badminfo's latest ratings and grades; name, gender and date of birth stay. */
function updated(profile, player) {
  const grades = Object.fromEntries(DISCIPLINES.map((d) => [d, GRADES.includes(player.grades?.[d]) ? player.grades[d] : profile.grades[d]]));
  return { ...profile, badminfoId: profile.badminfoId || player.id, grades, ratings: { ...player.ratings }, ratingsDate: player.ratingsDate ?? '' };
}

/**
 * Adds a player fetched from badminfo (see summarizePlayer() in lib/badminfo.js),
 * or, when a saved player has the same BE number, updates their ratings and
 * grades only, and says what changed.
 * @returns {{ profiles: object[], profile: object|null, added: boolean, full: boolean, changes?: object }}
 *   `full`: no room for another player, so nothing was added.
 */
export function addFromBadminfo(profiles, player) {
  const existing = player.beNumber ? profiles.find((p) => p.beNumber === player.beNumber) : null;
  if (existing) {
    const profile = updated(existing, player);
    return { profiles: profiles.map((p) => (p === existing ? profile : p)), profile, added: false, full: false, changes: playerChanges(existing, player) };
  }
  if (profiles.length >= MAX_PROFILES) return { profiles, profile: null, added: false, full: true };
  const profile = sanitizeProfiles([{
    ...newProfile(player.name), grades: player.grades, badminfoId: player.id, beNumber: player.beNumber,
    ratings: player.ratings, ratingsDate: player.ratingsDate ?? '',
  }])[0];
  return { profiles: [...profiles, profile], profile, added: true, full: false };
}

/** Updates the ratings and grades of the saved player with that badminfo id. */
export function updateFromBadminfo(profiles, player) {
  return profiles.map((p) => (p.badminfoId === player.id ? updated(p, player) : p));
}

const sameName = (a, b) => words(a).join(' ') === words(b).join(' ');

/**
 * One list from two: every player of `primary`, then those of `extra` that
 * aren't already there (the same badminfo id, BE number or name). Used when a
 * reader first signs in on a device: the account's players come first, and
 * the ones saved only in this browser join them.
 */
export function mergeProfiles(primary, extra) {
  const out = [...primary];
  for (const p of extra) {
    if (out.length >= MAX_PROFILES) break;
    const dup = out.some((q) => (p.badminfoId && q.badminfoId === p.badminfoId)
      || (p.beNumber && q.beNumber === p.beNumber)
      || (p.name.trim() && sameName(p.name, q.name)));
    if (!dup) out.push(p);
  }
  return out;
}

// Which account this browser's saved players belong to. When it is the account
// that signs in, the account's copy is the latest; when it isn't (a first
// sign-in here), the two lists are merged.
const SYNC_KEY = 'badminton-tcs:sync:v1';

export function loadSyncOwner(storage) {
  try {
    return JSON.parse((storage ?? globalThis.localStorage).getItem(SYNC_KEY) ?? 'null')?.userId ?? null;
  } catch {
    return null;
  }
}

export function saveSyncOwner(userId, storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    if (userId) s.setItem(SYNC_KEY, JSON.stringify({ userId }));
    else s.removeItem(SYNC_KEY);
    return true;
  } catch {
    return false;
  }
}
