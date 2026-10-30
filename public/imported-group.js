// Turns a round-robin group fetched from /api/tournament (see lib/badminfo.js)
// into the group calculator's state: its entries, scores and scoring. The
// scoring isn't stated anywhere in the data, so it is worked out from the
// scores themselves. No DOM code here, so it is unit tested.

import { SCORING_PRESETS } from './groups.js';
import { profileFor } from './profiles.js';
import { sanitizeState } from './saved-groups.js';

export const MIN_ENTRIES = 3;
export const MAX_ENTRIES = 6;

/** Whether the calculator can hold the group (3 to 6 entries, singles or doubles). */
export function fitsCalculator(group) {
  return group.teams.length >= MIN_ENTRIES && group.teams.length <= MAX_ENTRIES && group.teams.every((t) => t.length <= 2);
}

/**
 * The scoring the group's scores show, or null when no game has been played:
 * best of three once any match has two games; games to the highest of 21, 15
 * or 11 that every winning score reaches; and no setting only when a game was
 * won from one point behind the target (21-20), otherwise setting.
 */
export function scoringFromScores(matches) {
  const games = matches.flatMap((m) => m.games);
  if (!games.length) return null;
  const lowestWin = Math.min(...games.map((g) => Math.max(...g)));
  const points = [21, 15, 11].find((p) => p <= lowestWin);
  if (!points) return null;
  const format = matches.some((m) => m.games.length >= 2) ? 'bestOf3' : 'oneGame';
  const noSetting = games.some(([a, b]) => Math.max(a, b) === points && Math.min(a, b) === points - 1);
  const bwf = SCORING_PRESETS.bwf;
  const preset = format === bwf.format && points === bwf.points && !noSetting === bwf.setting ? 'bwf' : 'custom';
  return { format, gamePoints: points, noSetting, preset };
}

// When refreshing, an entry is found by its players' badminfo ids when both
// sides know them all, and otherwise by its names, ignoring case and extra
// spaces, so "Amy  lee" typed in a slot is badminfo's "Amy Lee".
const norm = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const nameKey = (names) => names.map(norm).filter(Boolean).sort().join('|');
const idKey = (ids) => (ids.length && ids.every(Boolean) ? [...ids].sort().join('|') : '');

/**
 * The group's players who are saved players, as the group spells them. A
 * player's badminfo id decides first (see profileFor()); otherwise a saved name
 * matches partly too, so a saved "Chloe" finds "Chloe Wong" (and any other
 * Chloe), and the full names show the reader which group is whose.
 */
export function savedPlayersIn(group, profiles) {
  const found = group.teams.flatMap((team, t) => team.filter((name, k) => profileFor(profiles, name, group.ids?.[t]?.[k] ?? '')));
  return [...new Set(found)];
}

/**
 * A short name for each group: the event's code and the group's letter, such as
 * "WS Group A" for event "WS Open", draw "WS Op - Group A". The code is the
 * event's first word when that is a code like WS or XD. If two groups would get
 * the same name (say WS Open and WS U15 both have a Group A), the whole event
 * name is used, then the draw's full name.
 */
export function importLabels(groups) {
  const letter = (g) => /\bgroup\s+\S+$/i.exec(g.name)?.[0];
  const code = (g) => /^[A-Z]{2,3}(?=\s|$)/.exec(g.event)?.[0];
  const ways = [
    (g) => (letter(g) && (code(g) || g.event) ? `${code(g) || g.event} ${letter(g)}` : g.name),
    (g) => (g.event && letter(g) ? `${g.event} ${letter(g)}` : g.name),
    (g) => (g.event && !g.name.includes(g.event) ? `${g.event} · ${g.name}` : g.name),
  ];
  for (const way of ways) {
    const labels = groups.map(way);
    if (new Set(labels).size === labels.length) return labels;
  }
  return groups.map((g, i) => `${ways[2](g)} (${i + 1})`);
}

/** The group a calculator's `source` points to, in a freshly fetched tournament. */
export const findGroup = (tournament, source) =>
  tournament.groups.find((g) => g.event === source.event && g.name === source.name) ?? null;

/** Matches with a winner but no score, such as a walkover: they are left blank. */
export const unscoredMatches = (group) => group.matches.filter((m) => m.winner && !m.games.length).length;

/**
 * The calculator state for the group, keeping `current`'s scoring when no game
 * has been played. Each match's games are turned round where needed, since the
 * calculator keeps a match under "i-j" with i < j and entry i's points first.
 * `source` records where the group came from, for refreshing, and `ids` the
 * players' badminfo ids, so saved players are known by id.
 */
export function groupState(group, current = {}, { source = null, preset = null } = {}) {
  const doubles = group.teams.some((t) => t.length > 1);
  const scores = {};
  for (const { a, b, games } of group.matches) {
    if (!games.length) continue;
    const [i, j] = a < b ? [a, b] : [b, a];
    scores[`${i}-${j}`] = games.map((g) => (a < b ? [...g] : [g[1], g[0]]));
  }
  // The tournament's own rules first (tournamentPreset()), then what the scores show, then the calculator's.
  const rules = SCORING_PRESETS[preset];
  const scoring = (rules && { format: rules.format, gamePoints: rules.points, noSetting: !rules.setting, preset })
    ?? scoringFromScores(group.matches)
    ?? { format: current.format, gamePoints: current.gamePoints, noSetting: current.noSetting, preset: current.preset };
  return sanitizeState({
    ...scoring,
    event: doubles ? 'doubles' : 'singles',
    size: group.teams.length,
    entries: group.teams.map((t) => [t[0] ?? '', doubles ? t[1] ?? '' : '']),
    ids: group.teams.map((t, i) => [group.ids?.[i]?.[0] ?? '', doubles ? group.ids?.[i]?.[1] ?? '' : '']),
    scores,
    source,
  });
}

/**
 * Brings badminfo's latest results for the same group into the calculator.
 * Entries are matched by player id or name rather than by place, so the calculator's order
 * and any scores typed in for matches badminfo has no result for stay as they
 * are. With `only` ("i-j") just that match is updated. Otherwise every match
 * is, and entries that have played since the import (badminfo lists only
 * entries that have played) are added to the empty places, up to six.
 * @returns {{ state: object, changed: number, added: number, found: boolean, scored: boolean }}
 *   `found`: whether badminfo has the match `only` names; `scored`: whether it has a score yet.
 */
export function mergeResults(state, group, only = null) {
  const width = state.event === 'doubles' ? 2 : 1;
  const entries = state.entries.map((e) => [...e]);
  const ids = state.ids.map((e) => [...e]);
  let size = state.size;
  const sameTeam = (i, names, teamIds) => {
    const mine = idKey(ids[i].slice(0, width));
    const theirs = idKey(teamIds);
    return mine && theirs ? mine === theirs : nameKey(entries[i].slice(0, width)) === nameKey(names);
  };
  let added = 0;
  const entryOf = (t) => {
    const names = group.teams[t];
    const teamIds = (group.ids?.[t] ?? []).slice(0, names.length);
    let i = Array.from({ length: size }, (_, k) => k).find((k) => sameTeam(k, names, teamIds)) ?? -1;
    if (i < 0 && !only && size < MAX_ENTRIES && names.length === width) {
      i = size++;
      entries[i] = [names[0], width === 2 ? names[1] : ''];
      ids[i] = ['', ''];
      added++;
    }
    // An entry found by name learns its players' ids.
    if (i >= 0 && teamIds.every(Boolean) && !idKey(ids[i].slice(0, width))) ids[i] = [teamIds[0] ?? '', width === 2 ? teamIds[1] ?? '' : ''];
    return i;
  };
  const scores = JSON.parse(JSON.stringify(state.scores));
  let changed = 0;
  let found = false;
  let scored = false;
  for (const m of group.matches) {
    const a = entryOf(m.a);
    const b = entryOf(m.b);
    if (a < 0 || b < 0 || a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (only && key !== only) continue;
    found = true;
    if (!m.games.length) continue;
    scored = true;
    const games = m.games.map((g) => (a < b ? [...g] : [g[1], g[0]]));
    if (JSON.stringify(scores[key]) !== JSON.stringify(games)) {
      scores[key] = games;
      changed++;
    }
  }
  return { state: sanitizeState({ ...state, entries, ids, size, scores }), changed, added, found, scored };
}

/**
 * A player's tournaments to offer (from /api/player): the next few that haven't
 * ended by `today` (YYYY-MM-DD), soonest first, and, when `past` is asked for,
 * every upcoming one plus the past ones, latest first.
 * @returns {{ upcoming: object[], past: object[], pastCount: number }}
 */
export function tournamentChoices(tournaments, today, { past = false, next = 5 } = {}) {
  const ended = (t) => (t.end ?? t.start ?? '') < today;
  const upcoming = tournaments.filter((t) => !ended(t)).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const before = tournaments.filter(ended).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  return { upcoming: past ? upcoming : upcoming.slice(0, next), past: past ? before : [], pastCount: before.length };
}

const LEVELS = { 1: 'bronze', 2: 'silver', 3: 'gold' };

/**
 * The scoring preset (see SCORING_PRESETS) for a tournament and one of its
 * events, from the tournament's name and badminfo's category: "TheDKWay U15
 * Silver" with event "OS U15" is Junior Silver. The level is Gold, Silver or
 * Bronze from the name, else from the category; the age group comes from the
 * event's name ("WS U11"), else the tournament's. U11 to U17 are Junior (Gold
 * U11 has its own scoring), U19 is U19, Masters and Para by name, otherwise
 * Senior; "Tier 4" is Senior Tier 4. Null when the level isn't known (open or
 * restricted tournaments), so the scores decide.
 */
export function tournamentPreset(tournament, eventName = '') {
  const name = tournament?.name ?? '';
  if (/\btier\s*4\b/i.test(name)) return 'senior-tier4';
  if (/\bpara\b/i.test(name)) return 'para';
  const level = /\b(gold|silver|bronze)\b/i.exec(name)?.[1].toLowerCase() ?? LEVELS[tournament?.category] ?? null;
  if (!level) return null;
  const age = Number((/\bU\s?(\d{2})\b/i.exec(eventName) ?? /\bU\s?(\d{2})\b/i.exec(name))?.[1]);
  let preset;
  if (/\bmasters?\b/i.test(name)) preset = `masters-${level}`;
  else if (age === 19) preset = `u19-${level}`;
  else if (age >= 11 && age <= 17) preset = level === 'gold' && age === 11 ? 'junior-gold-u11' : `junior-${level}`;
  else if (tournament?.ageGroup === 1) preset = `junior-${level}`;
  else preset = `senior-${level}`;
  return Object.hasOwn(SCORING_PRESETS, preset) ? preset : null;
}
