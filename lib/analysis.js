// A player's history for the Analysis page, from badminfo's player JSON: every
// match they have played (with the badminfo rating before it, the change it
// caused and the chance badminfo gave them of winning), their grade history,
// the grading period's predicted grades, and their medals. The page works out
// the analysis itself (public/analysis.js); this only picks out and checks the
// fields. No DOM code here, so it is unit tested in tests/analysis-server.test.js.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MATCHES = 600;
const MAX_NAME = 60;

const text = (v, max = MAX_NAME) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const guid = (v) => (typeof v === 'string' && GUID.test(v) ? v.toLowerCase() : '');
const score = (v) => (Number.isInteger(v) && v >= 0 && v <= 99 ? v : null);
const rating = (v) => (Number.isInteger(v) && v > 0 && v < 10000 ? v : null); // 0 marks a match badminfo hasn't rated
const change = (v) => (Number.isFinite(v) && Math.abs(v) < 1000 ? Math.round(v) : null);
const chance = (v) => (Number.isFinite(v) && v > 0 && v < 1 ? Math.round(v * 1000) / 1000 : null);
const grade = (v) => (typeof v === 'string' && /^[A-K]$/.test(v) ? v : '');

const DISCIPLINES = ['singles', 'doubles', 'mixed']; // badminfo's discipline 0, 1, 2
const GRADE_KEYS = { Single: 'singles', Double: 'doubles', Mixed: 'mixed' };
const PLACES = { 0: 'winner', 1: 'runnerUp' }; // badminfo's trophyType

const person = (p) => ({ name: text(p?.name), id: guid(p?.id) });

/** One match from the player's side, or null when they aren't in it or it can't be read. */
function match(r, comp, playerId) {
  const team1 = Array.isArray(r?.team1Players) ? r.team1Players : [];
  const team2 = Array.isArray(r?.team2Players) ? r.team2Players : [];
  const onTeam = (team) => team.some((p) => guid(p?.id) === playerId);
  const side = onTeam(team1) ? 1 : onTeam(team2) ? 2 : 0;
  if (!side || !team1.length || !team2.length) return null;
  const mine = side === 1 ? team1 : team2;
  const theirs = side === 1 ? team2 : team1;
  const me = mine.find((p) => guid(p?.id) === playerId);
  const games = (Array.isArray(r.games) ? r.games : []).slice(0, 5)
    .map((g) => [score(g?.team1Score), score(g?.team2Score)])
    .filter((g) => g.every((n) => n !== null))
    .map(([a, b]) => (side === 1 ? [a, b] : [b, a]));
  const effect = r.ratingsEffect && r.ratingsEffect.rubberProcessingStatus === 0 ? r.ratingsEffect : null;
  const t = comp.tournament;
  const league = comp.league;
  return {
    date: date(t?.startDate) ?? date(comp.leagueMatch?.date) ?? date(league?.startDate),
    tournament: t ? text(t.name, 120) : text(league?.name, 120),
    tournamentId: guid(t?.id),
    level: t ? (Number.isInteger(t.category) ? t.category : null) : 'league',
    event: text(r.eventName),
    discipline: DISCIPLINES[r.discipline] ?? (mine.length > 1 ? 'doubles' : 'singles'),
    round: text(r.roundText),
    knockout: Number.isInteger(r.eliminationRound), // badminfo numbers knockout rounds; group matches have none
    partners: mine.filter((p) => p !== me).map((p) => ({ ...person(p), rating: rating(p?.previousRating) })),
    opponents: theirs.map((p) => ({ ...person(p), rating: rating(p?.previousRating) })),
    won: r.winningTeam === side ? true : r.winningTeam === 3 - side ? false : null,
    games,
    note: text(r.scoreText) || null,
    ratingBefore: rating(me?.previousRating),
    ratingChange: effect ? change(effect.thisPlayerRatingChange) : null,
    winChance: effect ? chance(effect.thisPlayerWinChance) : null,
  };
}

/** A grading period's prediction for one discipline. */
function period(p, playerId) {
  if (!p || typeof p !== 'object') return null;
  const out = { start: date(p.gradePeriodStartDate), end: date(p.gradePeriodEndDate) };
  for (const key of DISCIPLINES) {
    const d = p[key];
    if (!d) continue;
    const rubbers = Array.isArray(d.qualifyingRubbers) ? d.qualifyingRubbers : [];
    const won = rubbers.filter((r) => {
      const side = (r?.team1Players ?? []).some((x) => guid(x?.id) === playerId) ? 1 : 2;
      return r?.winningTeam === side;
    }).length;
    out[key] = {
      from: grade(d.previousGrade),
      best: grade(d.predictedNewGradeBestCase),
      worst: grade(d.predictedNewGradeWorstCase),
      matches: rubbers.length,
      won,
    };
  }
  return out;
}

/**
 * The player's history for the Analysis page.
 * @returns {object|null} null when the JSON isn't a player.
 */
export function playerHistory(json, id) {
  if (!json || typeof json !== 'object' || typeof json.name !== 'string') return null;
  const playerId = guid(id) || guid(json.id);
  const matches = [];
  for (const comp of Array.isArray(json.competitionsWithRubbers) ? json.competitionsWithRubbers : []) {
    for (const r of Array.isArray(comp?.rubbers) ? comp.rubbers : []) {
      const m = match(r, comp, playerId);
      if (m && m.date) matches.push(m);
    }
  }
  // Oldest first. badminfo lists competitions newest first but each one's matches in the order they were played.
  const order = matches.map((m, i) => [m, i]);
  order.sort(([a, i], [b, j]) => a.date.localeCompare(b.date) || i - j);
  const gradeHistory = (Array.isArray(json.gradings) ? json.gradings : [])
    .map((g) => ({ discipline: GRADE_KEYS[g?.key], grade: grade(g?.value), since: date(g?.firstSeenUtc) }))
    .filter((g) => g.discipline && g.grade && g.since)
    .sort((a, b) => a.since.localeCompare(b.since));
  const r = json.ratings ?? {};
  return {
    id: playerId,
    name: text(json.name),
    county: text(json.county),
    beId: guid(json.beId),
    ratings: { singles: rating(r.singlesRating), doubles: rating(r.doublesRating), mixed: rating(r.mixedRating) },
    ratingsDate: date(r.ratingsDate),
    gradeHistory,
    periods: { current: period(json.upcomingGradeChange, playerId), previous: period(json.previousGradeChange, playerId) },
    trophies: (Array.isArray(json.trophies) ? json.trophies : []).map((t) => ({
      place: PLACES[t?.trophyType] ?? 'other',
      event: text(t?.disciplineShortTitle, 8),
      level: Number.isInteger(t?.category) ? t.category : null,
      date: date(t?.tournamentStartDate),
      tournament: text(t?.tournamentName, 120),
      tournamentId: guid(t?.tournamentId),
      partner: text(t?.partnerName) || null,
    })).filter((t) => t.date).sort((a, b) => b.date.localeCompare(a.date)),
    matches: order.map(([m]) => m).slice(-MAX_MATCHES),
  };
}
