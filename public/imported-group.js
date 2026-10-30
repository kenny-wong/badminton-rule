// Turns a round-robin group fetched from /api/tournament (see lib/badminfo.js)
// into the group calculator's state: its entries, scores and scoring. The
// scoring isn't stated anywhere in the data, so it is worked out from the
// scores themselves. No DOM code here, so it is unit tested.

import { SCORING_PRESETS } from './groups.js';
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

// Names are compared without case or extra spaces, so a saved "Amy  lee" is
// badminfo's "Amy Lee".
const norm = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const teamKey = (names) => names.map(norm).filter(Boolean).sort().join('|');

/** The saved players' names found in the group, spelled as they were saved. */
export function savedPlayersIn(group, savedNames) {
  const spelling = new Map(savedNames.filter((n) => n.trim()).map((n) => [norm(n), n.trim()]));
  return group.teams.flat().map((n) => spelling.get(norm(n))).filter(Boolean);
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
 * Names of saved players take their saved spelling, so the page knows them as
 * the reader's own. `source` records where the group came from, for refreshing.
 */
export function groupState(group, current = {}, { savedNames = [], source = null } = {}) {
  const doubles = group.teams.some((t) => t.length > 1);
  const spelling = new Map(savedNames.filter((n) => n.trim()).map((n) => [norm(n), n.trim()]));
  const spell = (n) => (n ? spelling.get(norm(n)) ?? n : '');
  const scores = {};
  for (const { a, b, games } of group.matches) {
    if (!games.length) continue;
    const [i, j] = a < b ? [a, b] : [b, a];
    scores[`${i}-${j}`] = games.map((g) => (a < b ? [...g] : [g[1], g[0]]));
  }
  const scoring = scoringFromScores(group.matches)
    ?? { format: current.format, gamePoints: current.gamePoints, noSetting: current.noSetting, preset: current.preset };
  return sanitizeState({
    ...scoring,
    event: doubles ? 'doubles' : 'singles',
    size: group.teams.length,
    entries: group.teams.map((t) => [spell(t[0]), doubles ? spell(t[1]) : '']),
    scores,
    source,
  });
}

/**
 * Brings badminfo's latest results for the same group into the calculator.
 * Entries are matched by name rather than by place, so the calculator's order
 * and any scores typed in for matches badminfo has no result for stay as they
 * are. With `only` ("i-j") just that match is updated. Otherwise every match
 * is, and entries that have played since the import (badminfo lists only
 * entries that have played) are added to the empty places, up to six.
 * @returns {{ state: object, changed: number, added: number, found: boolean, scored: boolean }}
 *   `found`: whether badminfo has the match `only` names; `scored`: whether it has a score yet.
 */
export function mergeResults(state, group, only = null) {
  const doubles = state.event === 'doubles';
  const entries = state.entries.map((e) => [...e]);
  const keys = entries.slice(0, state.size).map((e) => teamKey(e.slice(0, doubles ? 2 : 1)));
  let added = 0;
  const entryOf = (team) => {
    let i = keys.indexOf(teamKey(team));
    if (i < 0 && !only && keys.length < MAX_ENTRIES && team.length === (doubles ? 2 : 1)) {
      i = keys.push(teamKey(team)) - 1;
      entries[i] = [team[0], doubles ? team[1] : ''];
      added++;
    }
    return i;
  };
  const scores = JSON.parse(JSON.stringify(state.scores));
  let changed = 0;
  let found = false;
  let scored = false;
  for (const m of group.matches) {
    const a = entryOf(group.teams[m.a]);
    const b = entryOf(group.teams[m.b]);
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
  return { state: sanitizeState({ ...state, entries, size: keys.length, scores }), changed, added, found, scored };
}
