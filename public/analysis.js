// The Analysis page's numbers: a player's progress worked out from their match
// history (GET /api/analysis). Ratings, win chances and grades are badminfo's;
// this only adds them up. Messages are { key, params } for the page to word in
// the reader's language. No DOM code here, so it is unit tested in
// tests/analysis.test.js.

export const DISCIPLINES = ['singles', 'doubles', 'mixed'];
export const LEVELS = ['bronze', 'silver', 'gold', 'other', 'league'];
const LEVEL_OF = { 1: 'bronze', 2: 'silver', 3: 'gold' }; // badminfo's category; 4 and unknown are 'other'
export const FORM_LENGTH = 10;
const TREND_DAYS = 90;
const UNDERDOG = 0.4; // badminfo's win chance below this: the player was expected to lose
const FAVOURITE = 0.6;
const TIGHT_GAME = 2; // a game won or lost by this many points or fewer

export const levelOf = (m) => (m.level === 'league' ? 'league' : LEVEL_OF[m.level] ?? 'other');

/** Won, lost and the share won (0–100, null with nothing decided) of matches with a result. */
export function record(matches) {
  const won = matches.filter((m) => m.won === true).length;
  const lost = matches.filter((m) => m.won === false).length;
  return { won, lost, played: won + lost, pct: won + lost ? Math.round((100 * won) / (won + lost)) : null };
}

const daysBefore = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/**
 * Each discipline's rating over time: the rating going into the first match of
 * each day the player played, then today's rating from badminfo. Oldest first.
 * @returns {{ [discipline: string]: { date: string, rating: number }[] }}
 */
export function ratingSeries(history, today) {
  const out = {};
  for (const d of DISCIPLINES) {
    const points = [];
    for (const m of history.matches) {
      if (m.discipline !== d || m.ratingBefore === null) continue;
      if (points.at(-1)?.date !== m.date) points.push({ date: m.date, rating: m.ratingBefore });
    }
    const now = history.ratings?.[d];
    if (now !== null && now !== undefined) {
      const day = history.ratingsDate && history.ratingsDate <= today ? history.ratingsDate : today;
      if (points.at(-1)?.date === day) points.at(-1).rating = now;
      else if (!points.length || points.at(-1).date < day) points.push({ date: day, rating: now });
    }
    if (points.length) out[d] = points;
  }
  return out;
}

/** How much the rating moved since `days` before the last point (from the first point when the series is shorter). */
export function ratingChange(points, days = null) {
  if (!points?.length) return null;
  const last = points.at(-1);
  let from = points[0];
  if (days !== null) {
    const since = daysBefore(last.date, days);
    from = points.findLast((p) => p.date <= since) ?? points[0];
  }
  return from === last ? null : last.rating - from.rating;
}

const peakOf = (points) => points.reduce((best, p) => (p.rating > best.rating ? p : best), points[0]);

/** The run of identical results the player is on: { won, n }, or null with no results. */
export function streak(matches) {
  const decided = matches.filter((m) => m.won !== null);
  if (!decided.length) return null;
  const won = decided.at(-1).won;
  let n = 0;
  for (let i = decided.length - 1; i >= 0 && decided[i].won === won; i--) n++;
  return { won, n };
}

/** Matches won against the matches badminfo's ratings expected them to win (the sum of their win chances). */
export function expectation(matches) {
  const rated = matches.filter((m) => m.winChance !== null && m.won !== null);
  const expected = rated.reduce((s, m) => s + m.winChance, 0);
  const actual = rated.filter((m) => m.won).length;
  return { matches: rated.length, expected: Math.round(expected * 10) / 10, actual, diff: Math.round((actual - expected) * 10) / 10 };
}

/** Results by how badminfo rated the player's chance: underdog, even or favourite. */
export function byChance(matches) {
  const band = (m) => (m.winChance < UNDERDOG ? 'underdog' : m.winChance > FAVOURITE ? 'favourite' : 'even');
  const rated = matches.filter((m) => m.winChance !== null);
  return Object.fromEntries(['underdog', 'even', 'favourite'].map((b) => [b, record(rated.filter((m) => band(m) === b))]));
}

/** The best wins (lowest win chance) and the most surprising losses (highest), `n` of each. */
export function surprises(matches, n = 3) {
  const rated = matches.filter((m) => m.winChance !== null);
  return {
    wins: rated.filter((m) => m.won === true && m.winChance < 0.5).sort((a, b) => a.winChance - b.winChance).slice(0, n),
    losses: rated.filter((m) => m.won === false && m.winChance > 0.5).sort((a, b) => b.winChance - a.winChance).slice(0, n),
  };
}

/** Deciding games, tight games, and games and points won and lost. */
export function closeness(matches) {
  const scored = matches.filter((m) => m.games.length && m.won !== null);
  const deciding = scored.filter((m) => m.games.length === 3);
  const games = scored.flatMap((m) => m.games);
  const tight = games.filter(([a, b]) => Math.abs(a - b) <= TIGHT_GAME);
  const points = games.reduce((s, [a, b]) => [s[0] + a, s[1] + b], [0, 0]);
  return {
    deciding: record(deciding),
    tight: { won: tight.filter(([a, b]) => a > b).length, lost: tight.filter(([a, b]) => a < b).length },
    games: { won: games.filter(([a, b]) => a > b).length, lost: games.filter(([a, b]) => a < b).length },
    points: { won: points[0], lost: points[1], pct: points[0] + points[1] ? Math.round((100 * points[0]) / (points[0] + points[1])) : null },
  };
}

/** Records grouped by a key, in the given order (keys with no matches left out). */
function groupBy(matches, keyOf, order) {
  const groups = new Map();
  for (const m of matches) {
    const k = keyOf(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const keys = order ? order.filter((k) => groups.has(k)) : [...groups.keys()];
  return keys.map((key) => ({ key, ...record(groups.get(key)) })).filter((g) => g.played);
}

const teamKey = (people) => people.map((p) => p.id || p.name.toLowerCase()).sort().join('+');

/** Doubles and mixed partners, most matches first. */
export function partners(matches, n = 6) {
  const byKey = new Map();
  for (const m of matches) {
    if (!m.partners.length || m.won === null) continue;
    const key = teamKey(m.partners);
    const p = byKey.get(key) ?? { names: m.partners.map((x) => x.name), disciplines: new Set(), matches: [] };
    p.disciplines.add(m.discipline);
    p.matches.push(m);
    byKey.set(key, p);
  }
  return [...byKey.values()]
    .map((p) => ({ names: p.names, disciplines: DISCIPLINES.filter((d) => p.disciplines.has(d)), ...record(p.matches) }))
    .sort((a, b) => b.played - a.played || b.won - a.won)
    .slice(0, n);
}

/** Opponents (a player or a pair) met at least twice, most meetings first. */
export function rivals(matches, n = 6) {
  const byKey = new Map();
  for (const m of matches) {
    if (m.won === null) continue;
    const key = `${m.discipline}:${teamKey(m.opponents)}`;
    const r = byKey.get(key) ?? { names: m.opponents.map((x) => x.name), discipline: m.discipline, matches: [] };
    r.matches.push(m);
    byKey.set(key, r);
  }
  return [...byKey.values()]
    .map((r) => ({ names: r.names, discipline: r.discipline, last: r.matches.at(-1).date, ...record(r.matches) }))
    .filter((r) => r.played >= 2)
    .sort((a, b) => b.played - a.played || b.last.localeCompare(a.last))
    .slice(0, n);
}

/** Each tournament (or league) played, newest first, with its record and rating change per discipline. */
export function tournaments(matches) {
  const byKey = new Map();
  for (const m of matches) {
    const key = `${m.date}|${m.tournamentId || m.tournament}`;
    const t = byKey.get(key) ?? { date: m.date, name: m.tournament, id: m.tournamentId, level: levelOf(m), matches: [] };
    t.matches.push(m);
    byKey.set(key, t);
  }
  return [...byKey.values()].reverse().map((t) => {
    const change = {};
    for (const m of t.matches) {
      if (m.ratingChange !== null) change[m.discipline] = (change[m.discipline] ?? 0) + m.ratingChange;
    }
    const events = [...new Set(t.matches.map((m) => m.event).filter(Boolean))];
    return { date: t.date, name: t.name, id: t.id, level: t.level, events, change, ...record(t.matches) };
  });
}

/** Each discipline's grades in order, oldest first: [{ grade, since }]. */
export function gradeTimeline(history) {
  return Object.fromEntries(DISCIPLINES.map((d) => [d, history.gradeHistory.filter((g) => g.discipline === d).map(({ grade, since }) => ({ grade, since }))]));
}

const better = (a, b) => Boolean(a && b && a < b); // A is the highest grade

/**
 * The grading period's prediction per discipline: { from, best, worst, matches,
 * won, move: 'up'|'maybe'|'same'|'done' }. 'done' means the player already
 * holds the predicted grade (`current`, per discipline), so the change has
 * taken effect.
 */
export function gradeOutlook(period, current = {}) {
  if (!period) return null;
  const out = { start: period.start, end: period.end, disciplines: {} };
  for (const d of DISCIPLINES) {
    const p = period[d];
    if (!p || !p.from) continue;
    let move = better(p.worst, p.from) ? 'up' : better(p.best, p.from) ? 'maybe' : 'same';
    if (move !== 'same' && current[d] && !better(p.best, current[d])) move = 'done';
    out.disciplines[d] = { ...p, move };
  }
  return Object.keys(out.disciplines).length ? out : null;
}

/** The headline findings, most telling first, as messages for the page to word. */
export function insights(a) {
  const out = [];
  for (const d of DISCIPLINES) {
    const s = a.disciplines[d];
    if (s?.change90 && Math.abs(s.change90) >= 10) out.push({ key: s.change90 > 0 ? 'analysis.in.ratingUp' : 'analysis.in.ratingDown', params: { discipline: d, n: Math.abs(s.change90) } });
  }
  const recent = daysBefore(a.today, TREND_DAYS);
  for (const d of DISCIPLINES) {
    const [prev, last] = a.grades.timeline[d].slice(-2);
    if (prev && last && last.since >= recent && better(last.grade, prev.grade)) {
      out.push({ key: 'analysis.in.gradeRecent', params: { discipline: d, from: prev.grade, to: last.grade, date: last.since } });
    }
  }
  for (const [d, g] of Object.entries(a.grades.outlook?.disciplines ?? {})) {
    if (g.move === 'up') out.push({ key: 'analysis.in.gradeUp', params: { discipline: d, from: g.from, to: g.worst === g.best ? g.best : `${g.worst}/${g.best}` } });
    else if (g.move === 'maybe') out.push({ key: 'analysis.in.gradeMaybe', params: { discipline: d, from: g.from, to: g.best } });
  }
  if (a.expectation.matches >= 5 && Math.abs(a.expectation.diff) >= 1.5) {
    out.push({ key: a.expectation.diff > 0 ? 'analysis.in.above' : 'analysis.in.below', params: { n: Math.abs(a.expectation.diff), matches: a.expectation.matches } });
  }
  const strong = DISCIPLINES.filter((d) => a.disciplines[d]?.played >= 8);
  if (strong.length >= 2) {
    const best = strong.reduce((x, y) => (a.disciplines[y].pct > a.disciplines[x].pct ? y : x));
    out.push({ key: 'analysis.in.best', params: { discipline: best, pct: a.disciplines[best].pct } });
  }
  if (a.chance.underdog.played >= 3) out.push({ key: 'analysis.in.underdog', params: { won: a.chance.underdog.won, played: a.chance.underdog.played } });
  if (a.close.deciding.played >= 3) out.push({ key: 'analysis.in.deciding', params: { won: a.close.deciding.won, played: a.close.deciding.played } });
  if (a.streak?.n >= 3) out.push({ key: a.streak.won ? 'analysis.in.streakWon' : 'analysis.in.streakLost', params: { n: a.streak.n } });
  const year = a.today.slice(0, 4);
  const medals = a.medals.list.filter((m) => m.date.startsWith(year) && m.place === 'winner').length;
  if (medals) out.push({ key: 'analysis.in.titles', params: { n: medals, year } });
  return out;
}

/** Everything the Analysis page shows, from the player's history. */
export function analyse(history, today = new Date().toISOString().slice(0, 10)) {
  const matches = history.matches;
  const series = ratingSeries(history, today);
  const disciplines = {};
  for (const d of DISCIPLINES) {
    const ms = matches.filter((m) => m.discipline === d);
    const points = series[d];
    if (!ms.length && !points) continue;
    disciplines[d] = {
      ...record(ms),
      rating: history.ratings?.[d] ?? null,
      peak: points ? peakOf(points) : null,
      change90: ratingChange(points, TREND_DAYS),
      changeAll: ratingChange(points),
      since: points?.[0].date ?? null,
      expectation: expectation(ms),
    };
  }
  const timeline = gradeTimeline(history);
  const current = Object.fromEntries(DISCIPLINES.map((d) => [d, timeline[d].at(-1)?.grade ?? '']));
  const a = {
    today,
    overall: record(matches),
    disciplines,
    series,
    form: matches.filter((m) => m.won !== null).slice(-FORM_LENGTH),
    streak: streak(matches),
    expectation: expectation(matches),
    chance: byChance(matches),
    surprises: surprises(matches),
    close: closeness(matches),
    levels: groupBy(matches, levelOf, LEVELS),
    years: groupBy(matches, (m) => m.date.slice(0, 4)).sort((x, y) => y.key.localeCompare(x.key)),
    stages: groupBy(matches, (m) => (m.level === 'league' ? 'league' : m.knockout ? 'knockout' : 'group'), ['group', 'knockout', 'league']),
    partners: partners(matches),
    rivals: rivals(matches),
    tournaments: tournaments(matches),
    grades: { timeline, current, outlook: gradeOutlook(history.periods?.current, current), previous: gradeOutlook(history.periods?.previous) },
    medals: {
      winner: history.trophies.filter((t) => t.place === 'winner').length,
      runnerUp: history.trophies.filter((t) => t.place === 'runnerUp').length,
      list: history.trophies,
    },
  };
  a.insights = insights(a);
  return a;
}
