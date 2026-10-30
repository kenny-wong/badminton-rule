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

/**
 * A name for each group that tells it apart from the others. Draws are often
 * just "Group A" in every event, so when any name is used twice, every group
 * whose name doesn't already say its event gets it in front: "MS Open · Group A".
 */
export function importLabels(groups) {
  const names = groups.map((g) => g.name);
  if (new Set(names).size === names.length) return names;
  return groups.map((g) => (g.event && !g.name.includes(g.event) ? `${g.event} · ${g.name}` : g.name));
}

/** Matches with a winner but no score, such as a walkover: they are left blank. */
export const unscoredMatches = (group) => group.matches.filter((m) => m.winner && !m.games.length).length;

/**
 * The calculator state for the group, keeping `current`'s scoring when no game
 * has been played. Each match's games are turned round where needed, since the
 * calculator keeps a match under "i-j" with i < j and entry i's points first.
 */
export function groupState(group, current = {}) {
  const doubles = group.teams.some((t) => t.length > 1);
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
    entries: group.teams.map((t) => [t[0] ?? '', doubles ? t[1] ?? '' : '']),
    scores,
  });
}
