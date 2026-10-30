// Saved player profiles. They live only in this browser's localStorage: nothing
// is sent anywhere, so storage may be missing (private mode, blocked site data)
// and every access is guarded.

import { DISCIPLINES, GRADES, parseDate } from './eligibility.js';

const KEY = 'badminton-tcs:profiles:v1';
const MAX_PROFILES = 30;
const MAX_NAME = 60;
export const GENDERS = ['M', 'F']; // '' when not set

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newProfile(name = '') {
  return { id: newId(), name, gender: '', dob: '', grades: Object.fromEntries(DISCIPLINES.map((d) => [d, ''])) };
}

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

/** The saved profile a name refers to: an exact match (ignoring case and spacing) first, else a partial one. */
export function profileFor(profiles, name) {
  const key = words(name).join(' ');
  if (!key) return null;
  return profiles.find((p) => words(p.name).join(' ') === key) ?? profiles.find((p) => namesMatch(p.name, name)) ?? null;
}
