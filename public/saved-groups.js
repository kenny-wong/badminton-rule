// Saved groups for the group calculator: up to six, each with its names, scores
// and scoring settings. Like player profiles they live only in this browser's
// localStorage, so storage may be missing and every access is guarded.

import { SCORING_PRESETS } from './groups.js';

const KEY = 'badminton-tcs:groups:v1';
export const MAX_GROUPS = 6;
const MAX_ALIAS = 40;
const MAX_NAME = 30;
const SLOTS = 6;

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newGroup(state) {
  return { id: newId(), alias: '', state: sanitizeState(state) };
}

const score = (v) => (Number.isInteger(v) && v >= 0 && v <= 99 ? v : null);

/** Where an imported group came from (badminfo's tournament page and the draw), so its results can be refreshed. */
function sanitizeSource(raw) {
  const text = (v, max) => typeof v === 'string' && v.length <= max;
  if (!raw || typeof raw !== 'object' || !text(raw.link, 300) || !/^https:\/\/badminfo\.com\//.test(raw.link)) return null;
  return text(raw.event, 60) && text(raw.name, 60) && raw.name ? { link: raw.link, event: raw.event, name: raw.name } : null;
}

/** Keeps only well-formed calculator state, so a hand-edited or stale entry can't break the page. */
export function sanitizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const scores = {};
  if (s.scores && typeof s.scores === 'object') {
    for (const [key, games] of Object.entries(s.scores)) {
      const m = /^(\d)-(\d)$/.exec(key);
      if (!m || Number(m[1]) >= Number(m[2]) || Number(m[2]) >= SLOTS || !Array.isArray(games)) continue;
      scores[key] = games.slice(0, 3).map((g) => (Array.isArray(g) ? [score(g[0]), score(g[1])] : null));
    }
  }
  return {
    event: s.event === 'doubles' ? 'doubles' : 'singles',
    format: s.format === 'oneGame' ? 'oneGame' : 'bestOf3',
    gamePoints: [21, 15, 11].includes(s.gamePoints) ? s.gamePoints : 21,
    noSetting: s.noSetting === true,
    preset: s.preset in SCORING_PRESETS ? s.preset : 'custom',
    size: [3, 4, 5, 6].includes(s.size) ? s.size : 4,
    entries: Array.from({ length: SLOTS }, (_, i) => [0, 1].map((k) => {
      const name = s.entries?.[i]?.[k];
      return typeof name === 'string' ? name.slice(0, MAX_NAME) : '';
    })),
    withdrew: Array.from({ length: SLOTS }, (_, i) => s.withdrew?.[i] === true),
    scores,
    source: sanitizeSource(s.source),
  };
}

/** The store: the saved groups, and which one (if any) the calculator has open. */
export function sanitizeStore(raw) {
  const groups = (Array.isArray(raw?.groups) ? raw.groups : [])
    .filter((g) => g && typeof g === 'object')
    .slice(0, MAX_GROUPS)
    .map((g) => ({
      id: typeof g.id === 'string' && g.id ? g.id : newId(),
      alias: typeof g.alias === 'string' ? g.alias.slice(0, MAX_ALIAS) : '',
      state: sanitizeState(g.state),
    }));
  return { active: groups.some((g) => g.id === raw?.active) ? raw.active : null, groups };
}

// Even reading the localStorage property throws when site data is blocked, so it
// is looked up inside the try rather than as a default parameter.
export function loadGroups(storage) {
  try {
    return sanitizeStore(JSON.parse((storage ?? globalThis.localStorage).getItem(KEY) ?? '{}'));
  } catch {
    return { active: null, groups: [] };
  }
}

/** @returns {boolean} false when the browser refused to store them. */
export function saveGroups(store, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/**
 * The event a group is, from its players' genders: 'ms' / 'ws' (men's or women's
 * singles), 'md' / 'wd' / 'xd' (men's, women's or mixed doubles), or just
 * 'singles' / 'doubles' when a player's gender isn't known or they don't agree.
 * Slots not filled in yet don't count, so one mixed pair in a group of four
 * already makes it mixed doubles. `genderOf(name)` gives 'M', 'F' or ''.
 */
export function groupKind(state, genderOf) {
  const doubles = state.event === 'doubles';
  const genders = state.entries.slice(0, state.size)
    .map((e) => e.slice(0, doubles ? 2 : 1).map((n) => n.trim()).filter(Boolean).map(genderOf))
    .filter((g) => g.length);
  if (!genders.length || genders.flat().includes('')) return doubles ? 'doubles' : 'singles';
  if (!doubles) {
    if (genders.every(([g]) => g === 'M')) return 'ms';
    if (genders.every(([g]) => g === 'F')) return 'ws';
    return 'singles';
  }
  // Each pair narrows the possible events; a pair with one player so far leaves two.
  let kinds = ['md', 'wd', 'xd'];
  for (const [a, b] of genders) {
    let fits = [a === 'M' ? 'md' : 'wd', 'xd'];
    if (b) fits = [a !== b ? 'xd' : fits[0]];
    kinds = kinds.filter((k) => fits.includes(k));
  }
  return kinds.length === 1 ? kinds[0] : 'doubles';
}

/**
 * Each saved group's name: its alias if it has one, otherwise its kind, with a
 * letter when several groups share that kind ("Singles A", "Singles B").
 * @returns {{ alias?: string, kind?: string, letter?: string }[]}
 */
export function groupNames(groups, genderOf) {
  const kinds = groups.map((g) => (g.alias.trim() ? null : groupKind(g.state, genderOf)));
  const seen = {};
  return groups.map((g, i) => {
    const kind = kinds[i];
    if (!kind) return { alias: g.alias.trim() };
    seen[kind] = (seen[kind] ?? 0) + 1;
    const shared = kinds.filter((k) => k === kind).length > 1;
    return { kind, letter: shared ? String.fromCharCode(64 + seen[kind]) : '' };
  });
}
