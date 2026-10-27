// Group (round robin) standings, following Badminton England's General
// Regulations for Tournaments 2026, regulation 6.23, which matches BWF General
// Competition Regulations 16.2:
//
// Best of three games (or two games) per match:
//   i)   most matches won
//   ii)  two equal -> winner of the match between them
//   iii) three or more equal -> overall games difference
//   iv)  two still equal -> winner of the match between them
//   v)   three or more still equal -> overall points difference
//   vi)  two still equal -> winner of the match between them
//   vii) three or more still equal -> the referee draws lots
//
// One game per match: the same, with games in place of matches and without the
// games-difference step.
//
// A player who withdraws before finishing their group matches has all their
// results discounted and goes to the bottom (regulation 6.23.1).
//
// Explanations come back as { key, params } messages for the page to word.

export const FORMATS = ['bestOf3', 'oneGame'];

const msg = (key, params = {}) => ({ key, params });

// Scoring rules: games to `points` (21, 15 or 11). With setting (the default) a
// game at points-1 all goes on until someone leads by two, up to a cap (21 -> 30;
// 15 -> 21, as the BE matrix says "15 - with ext to 21"; 11 -> 15). With no
// setting, the first to `points` wins the game, even from points-1 all.
export const CAPS = { 21: 30, 15: 21, 11: 15 };

/** 'a' or 'b' for a finished game, or null while it's unfinished or not a possible score. */
export function gameWinner(game, { points = 21, setting = true } = {}) {
  if (!Array.isArray(game) || game.length !== 2) return null;
  const [x, y] = game;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x === y) return null;
  const [w, l] = x > y ? [x, y] : [y, x];
  const side = x > y ? 'a' : 'b';
  if (!setting) return w === points ? side : null;
  const cap = CAPS[points] ?? points + 9;
  if (w < points || w > cap) return null;
  if (w === points) return l <= points - 2 ? side : null;
  if (w === cap) return l >= cap - 2 ? side : null; // 30-29 or 30-28 both end a game
  return w - l === 2 ? side : null;
}

/**
 * The games that count, in order: game 1 first, stopping at the first game that
 * isn't finished (later ones can't have been played yet) and once the match is
 * decided (one game, or two wins in best of three).
 */
export function playedGames(games, format, rules = {}) {
  const counted = [];
  let a = 0;
  let b = 0;
  for (const game of games ?? []) {
    const side = gameWinner(game, rules);
    if (!side) break;
    counted.push(game);
    if (side === 'a') a += 1;
    else b += 1;
    if (format === 'oneGame' || a === 2 || b === 2) break;
  }
  return counted;
}

/** 'a', 'b', or null while the match isn't finished. Scores are from a's side. */
export function matchWinner(games, format, rules = {}) {
  const sides = playedGames(games, format, rules).map((g) => gameWinner(g, rules));
  const need = format === 'oneGame' ? 1 : 2;
  if (sides.filter((x) => x === 'a').length === need) return 'a';
  if (sides.filter((x) => x === 'b').length === need) return 'b';
  return null;
}

/**
 * How many games of a match can be entered so far: game 1, then each next game
 * once the one before is finished, until the match is decided.
 */
export function openGameCount(games, format, rules = {}) {
  const most = format === 'oneGame' ? 1 : 3;
  const played = playedGames(games, format, rules);
  if (matchWinner(games, format, rules)) return played.length;
  return Math.min(most, played.length + 1);
}

/**
 * @param {Array<{ id: string, name: string, withdrew?: boolean }>} players
 * @param {Array<{ a: string, b: string, games: number[][] }>} matches scores from a's side
 * @param {'bestOf3'|'oneGame'} format
 * @param {{ undecidedAt?: string[], rules?: { points?: number, setting?: boolean } }} options
 *   undecidedAt: criteria ('gamesDiff', 'pointsDiff') that can't be known yet; a tie
 *   that reaches one is left as an 'undecided' block, with a shared `block` number.
 *   rules: points per game and setting, which decide when a game is finished.
 */
export function rankGroup(players, matches, format, { undecidedAt = [], rules = {} } = {}) {
  const undecided = new Set(undecidedAt);
  let blocks = 0;
  const active = players.filter((p) => !p.withdrew);
  const activeIds = new Set(active.map((p) => p.id));
  const name = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const stats = Object.fromEntries(players.map((p) => [p.id, {
    played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0,
  }]));
  const winnerOf = new Map(); // "a|b" -> winner id, for head-to-head
  let unfinished = 0;

  for (const match of matches) {
    // Regulation 6.23.1: a withdrawn player's matches don't count for anyone.
    if (!activeIds.has(match.a) || !activeIds.has(match.b)) continue;
    const side = matchWinner(match.games, format, rules);
    if (!side) {
      unfinished += 1;
      continue;
    }
    const winner = side === 'a' ? match.a : match.b;
    const loser = side === 'a' ? match.b : match.a;
    winnerOf.set(`${match.a}|${match.b}`, winner);
    winnerOf.set(`${match.b}|${match.a}`, winner);
    for (const id of [match.a, match.b]) stats[id].played += 1;
    stats[winner].won += 1;
    stats[loser].lost += 1;
    for (const [pa, pb] of playedGames(match.games, format, rules)) {
      stats[match.a].pointsWon += pa;
      stats[match.a].pointsLost += pb;
      stats[match.b].pointsWon += pb;
      stats[match.b].pointsLost += pa;
      const gameWinner = pa > pb ? match.a : match.b;
      const gameLoser = pa > pb ? match.b : match.a;
      stats[gameWinner].gamesWon += 1;
      stats[gameLoser].gamesLost += 1;
    }
  }

  // In one-game groups "wins" are games won, which equals matches won.
  const wins = (id) => stats[id].won;
  const criteria = format === 'oneGame'
    ? [{ id: 'pointsDiff', value: (id) => stats[id].pointsWon - stats[id].pointsLost }]
    : [
      { id: 'gamesDiff', value: (id) => stats[id].gamesWon - stats[id].gamesLost },
      { id: 'pointsDiff', value: (id) => stats[id].pointsWon - stats[id].pointsLost },
    ];
  const steps = [];
  const names = (ids) => ids.map((id) => name[id]);

  function partition(ids, value) {
    const sorted = [...ids].sort((x, y) => value(y) - value(x));
    const groups = [];
    for (const id of sorted) {
      const last = groups.at(-1);
      if (last && value(last[0]) === value(id)) last.push(id);
      else groups.push([id]);
    }
    return groups;
  }

  // Orders a set of tied players, starting at criterion `level`.
  function resolve(ids, level) {
    if (ids.length === 2) {
      const winner = winnerOf.get(`${ids[0]}|${ids[1]}`);
      if (winner) {
        const loser = ids.find((id) => id !== winner);
        steps.push(msg('expl.headToHead', { winner: name[winner], loser: name[loser] }));
        return [{ id: winner, by: 'headToHead' }, { id: loser, by: 'headToHead' }];
      }
      // Their match hasn't been played yet: carry on down the list.
    }
    if (undecided.has(criteria[level]?.id) || (level >= criteria.length && undecided.size)) {
      const block = blocks++;
      return ids.map((id) => ({ id, by: 'undecided', block }));
    }
    if (level >= criteria.length) {
      steps.push(msg('expl.lots', { players: names(ids) }));
      return ids.map((id) => ({ id, by: 'lots' }));
    }
    const criterion = criteria[level];
    steps.push(msg(`expl.${criterion.id}`, {
      values: [...ids].sort((x, y) => criterion.value(y) - criterion.value(x)).map((id) => ({ name: name[id], value: criterion.value(id) })),
    }));
    return partition(ids, criterion.value).flatMap((group) =>
      (group.length === 1 ? [{ id: group[0], by: criterion.id }] : resolve(group, level + 1)));
  }

  const order = [];
  for (const group of partition(active.map((p) => p.id), wins)) {
    if (group.length === 1) {
      order.push({ id: group[0], by: 'wins' });
      continue;
    }
    steps.push(msg(format === 'oneGame' ? 'expl.tiedGames' : 'expl.tiedMatches', { players: names(group), wins: wins(group[0]) }));
    order.push(...resolve(group, 0));
  }
  const withdrawn = players.filter((p) => p.withdrew);
  if (withdrawn.length) steps.push(msg('expl.withdrew', { players: names(withdrawn.map((p) => p.id)) }));
  order.push(...withdrawn.map((p) => ({ id: p.id, by: 'withdrew' })));
  if (!steps.length && order.length) steps.push(msg('expl.noTies'));

  return {
    standings: order.map((entry, i) => ({ ...entry, position: i + 1, name: name[entry.id], ...stats[entry.id] })),
    steps,
    unfinished,
  };
}

/** Every pairing in a group of `size`, in the order players meet in a table. */
export function pairings(size) {
  const pairs = [];
  for (let i = 0; i < size; i += 1) for (let j = i + 1; j < size; j += 1) pairs.push([i, j]);
  return pairs;
}

// Worked examples for a group of four (A–D), written in games to 21. Every
// game's loser has at least 10 points, so exampleScores() can shift them to
// games to 15 or 11 by keeping each game's margin, which keeps every tie-break
// in the story the same.
//
// Worked examples for a group of four (A–D), each in both formats so choosing a
// format doesn't change which story the example tells. Keys are "i-j" pairings;
// scores are from player i's side.
export const EXAMPLES = {
  // Two pairs level on wins: each pair is split by the match between them.
  two: {
    bestOf3: {
      '0-1': [[21, 19], [21, 19]], '0-2': [[21, 19], [21, 19]], '0-3': [[10, 21], [10, 21]],
      '1-2': [[21, 10], [21, 10]], '1-3': [[21, 10], [21, 10]], '2-3': [[21, 19], [21, 19]],
    },
    oneGame: {
      '0-1': [[21, 19]], '0-2': [[21, 19]], '0-3': [[10, 21]],
      '1-2': [[21, 10]], '1-3': [[21, 10]], '2-3': [[21, 19]],
    },
  },
  // A beat B, B beat C, C beat A: head-to-head can't separate three, so the difference does.
  circle: {
    bestOf3: {
      '0-1': [[21, 15], [21, 15]], '0-2': [[15, 21], [21, 15], [15, 21]], '0-3': [[21, 10], [21, 10]],
      '1-2': [[21, 15], [15, 21], [21, 15]], '1-3': [[21, 10], [21, 10]], '2-3': [[21, 10], [21, 10]],
    },
    oneGame: {
      '0-1': [[21, 12]], '0-2': [[19, 21]], '0-3': [[21, 10]],
      '1-2': [[21, 17]], '1-3': [[21, 10]], '2-3': [[21, 10]],
    },
  },
  // Three level until points difference, then the last two by head-to-head.
  points: {
    bestOf3: {
      '0-1': [[21, 15], [19, 21], [21, 18]], '0-2': [[19, 21], [21, 15], [16, 21]], '0-3': [[21, 10], [21, 12]],
      '1-2': [[21, 17], [18, 21], [21, 19]], '1-3': [[21, 10], [21, 11]], '2-3': [[21, 12], [21, 11]],
    },
    oneGame: {
      '0-1': [[21, 18]], '0-2': [[19, 21]], '0-3': [[21, 10]],
      '1-2': [[21, 15]], '1-3': [[21, 12]], '2-3': [[21, 16]],
    },
  },
};

/**
 * What one entry needs from the matches still to play to finish in the top
 * `places`. Every unfinished match is given each possible winner (and, in best of
 * three, a 2-0 or 2-1 margin). Points can't be foreseen, so a tie that would come
 * down to points difference is reported as depending on points.
 *
 * Results are grouped by the outcomes of the entry's own remaining matches:
 * each row is 'yes' (goes through whatever else happens), 'no', or 'maybe' with
 * the reasons it is still open: 'others' (other results), 'games', 'points'.
 *
 * @returns {{ status: 'through'|'out'|'open'|'tooMany'|'done', rows: Array<{
 *   outcomes: Array<{ winner: string, loser: string }>, result: string, reasons: string[] }> }}
 */
export function qualification(players, matches, format, entryId, places, { maxOpen = 12, maxMargins = 5, rules = {} } = {}) {
  const active = new Set(players.filter((p) => !p.withdrew).map((p) => p.id));
  if (!active.has(entryId)) return { status: 'out', rows: [] };
  const open = matches.filter((m) => active.has(m.a) && active.has(m.b) && !matchWinner(m.games, format, rules));
  if (!open.length) return { status: 'done', rows: [] };
  if (open.length > maxOpen) return { status: 'tooMany', rows: [] };
  const settled = matches.filter((m) => !open.includes(m));
  const enumerateMargins = format === 'bestOf3' && open.length <= maxMargins;
  const undecidedAt = enumerateMargins || format === 'oneGame' ? ['pointsDiff'] : ['gamesDiff', 'pointsDiff'];
  const scoresFor = (aWins, close) => {
    const g = rules.points ?? 21;
    const w = [g, 0];
    const l = [0, g];
    if (format === 'oneGame') return [aWins ? w : l];
    if (!close) return aWins ? [w, w] : [l, l];
    return aWins ? [w, l, w] : [l, w, l];
  };

  // One outcome of every open match -> 'yes' | 'no' | 'games' | 'points'.
  function judge(winners, margins) {
    const played = open.map((m, i) => ({ a: m.a, b: m.b, games: scoresFor(winners[i], margins[i]) }));
    const { standings } = rankGroup(players, [...settled, ...played], format, { undecidedAt, rules });
    const me = standings.find((s) => s.id === entryId);
    const span = me.by === 'undecided' ? standings.filter((s) => s.by === 'undecided' && s.block === me.block) : [me];
    const best = Math.min(...span.map((s) => s.position));
    const worst = Math.max(...span.map((s) => s.position));
    if (worst <= places) return 'yes';
    if (best > places) return 'no';
    return enumerateMargins || format === 'oneGame' ? 'points' : 'games';
  }

  const own = open.map((m, i) => (m.a === entryId || m.b === entryId ? i : -1)).filter((i) => i >= 0);
  const rows = new Map(); // own outcome key -> { outcomes, verdicts: Set, reasons: Set }
  const count = open.length;
  for (let mask = 0; mask < 2 ** count; mask += 1) {
    const winners = open.map((_, i) => Boolean(mask & (1 << i))); // true: a wins
    const verdicts = new Set();
    const marginCount = enumerateMargins ? 2 ** count : 1;
    for (let mm = 0; mm < marginCount; mm += 1) {
      verdicts.add(judge(winners, open.map((_, i) => Boolean(mm & (1 << i)))));
    }
    // Within one set of winners, a yes/no split can only come from game margins.
    let verdict;
    if (verdicts.size === 1) verdict = [...verdicts][0];
    else verdict = verdicts.has('points') ? 'points' : 'games';
    const key = own.map((i) => (winners[i] ? 'a' : 'b')).join('');
    if (!rows.has(key)) {
      rows.set(key, {
        outcomes: own.map((i) => {
          const m = open[i];
          return winners[i] ? { winner: m.a, loser: m.b } : { winner: m.b, loser: m.a };
        }),
        verdicts: new Set(),
      });
    }
    rows.get(key).verdicts.add(verdict);
  }

  const result = [...rows.values()].map(({ outcomes, verdicts }) => {
    if (verdicts.size === 1 && (verdicts.has('yes') || verdicts.has('no'))) {
      return { outcomes, result: [...verdicts][0], reasons: [] };
    }
    // Different verdicts across the other matches' results means those results matter.
    const reasons = verdicts.size > 1 ? ['others'] : [];
    if (verdicts.has('games')) reasons.push('games');
    if (verdicts.has('points')) reasons.push('points');
    return { outcomes, result: 'maybe', reasons };
  });
  const wins = (row) => row.outcomes.filter((o) => o.winner === entryId).length;
  result.sort((x, y) => wins(y) - wins(x));
  const all = new Set(result.map((r) => r.result));
  const status = all.size === 1 && all.has('yes') ? 'through' : all.size === 1 && all.has('no') ? 'out' : 'open';
  return { status, rows: result };
}

// --- Detailed outlook -----------------------------------------------------------
//
// Like qualification(), but every open match is a variable and the answer is a
// short list of conditions covering all of them, e.g. "A beats D 2–0, B beats C"
// -> goes through. Where a place would come down to points difference and only
// one open match can change the tied players' points, that match's points margin
// is scanned to find the exact threshold.

const OUTCOMES = {
  exact: ['a20', 'a21', 'b21', 'b20'], // best of three, with the game score
  winLoss: ['a', 'b'],
};

// The winner's points margin (points won minus lost over the whole match) that
// each outcome allows when games are played to `g` points (21, 15 or 11):
// one game 2..g; a 2-0 win 4..2g; a 2-1 win 4-g..2g-2, since the winner can drop
// a game heavily and still win, so can be behind on points.
export function marginRange(value, g = 21) {
  if (value.length === 1) return [2, g];
  if (value.endsWith('20')) return [4, 2 * g];
  return [4 - g, 2 * g - 2];
}

const aWins = (value) => value[0] === 'a';

/**
 * Game scores from a's side for an outcome, giving the winner the points margin
 * asked for, in games to `g` points (no extended play).
 */
export function scoresWithMargin(value, format, margin, g = 21) {
  const flip = (games) => (aWins(value) ? games : games.map(([x, y]) => [y, x]));
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  if (format === 'oneGame') {
    const d = clamp(margin ?? Math.min(6, g), [2, g]);
    return flip([[g, g - d]]);
  }
  if (value.length === 1) return flip([[g, g - 2], [g, g - 2]]); // win/loss only: games unknown
  if (value.endsWith('20')) {
    const total = clamp(margin ?? 12, marginRange(value, g));
    const d1 = Math.min(g, total - 2);
    return flip([[g, g - d1], [g, g - (total - d1)]]);
  }
  // 2-1: the winner takes two games and drops one.
  const m = clamp(margin ?? 8, marginRange(value, g));
  if (m >= 2) {
    const won = m + 2;
    const d1 = Math.min(g, won - 2);
    return flip([[g, g - d1], [g - 2, g], [g, g - (won - d1)]]);
  }
  const lostBy = 4 - m;
  return flip([[g, g - 2], [g - lostBy, g], [g, g - 2]]);
}

/**
 * @returns {{ status: 'through'|'out'|'open'|'done'|'tooMany'|'tooManyRows', mode: 'exact'|'winLoss',
 *   open: Array<{ a: string, b: string }>,
 *   rows: Array<{ conditions: Array<{ match: number, values: string[] }>,
 *     result: { type: 'yes'|'no'|'margin'|'depends', match?: number, min?: number|null, max?: number|null, reasons?: string[] } }> }}
 *   Outcome values: 'a20' = a wins 2-0, 'a21', 'b21', 'b20'; or 'a' / 'b' when only the winner is tracked.
 */
export function qualificationDetail(players, matches, format, entryId, places, { maxOpen = 8, maxRows = 20, rules = {} } = {}) {
  const gamePoints = rules.points ?? 21;
  const active = new Set(players.filter((p) => !p.withdrew).map((p) => p.id));
  if (!active.has(entryId)) return { status: 'out', mode: 'winLoss', open: [], rows: [] };
  const open = matches.filter((m) => active.has(m.a) && active.has(m.b) && !matchWinner(m.games, format, rules));
  if (!open.length) return { status: 'done', mode: 'winLoss', open, rows: [] };
  const mode = format === 'bestOf3' && open.length <= 4 ? 'exact' : 'winLoss';
  if (open.length > maxOpen) return { status: 'tooMany', mode, open, rows: [] };
  const values = format === 'oneGame' ? OUTCOMES.winLoss : OUTCOMES[mode];
  const settled = matches.filter((m) => !open.includes(m));
  const gamesUnknown = format === 'bestOf3' && mode === 'winLoss';

  const withOutcomes = (combo, margins = {}) => [
    ...settled,
    ...open.map((m, i) => ({ a: m.a, b: m.b, games: scoresWithMargin(combo[i], format, margins[i], gamePoints) })),
  ];

  function verdict(combo) {
    const undecidedAt = gamesUnknown ? ['gamesDiff', 'pointsDiff'] : ['pointsDiff'];
    const { standings } = rankGroup(players, withOutcomes(combo), format, { undecidedAt, rules });
    const me = standings.find((s) => s.id === entryId);
    const block = me.by === 'undecided' ? standings.filter((s) => s.by === 'undecided' && s.block === me.block) : [me];
    const best = Math.min(...block.map((s) => s.position));
    const worst = Math.max(...block.map((s) => s.position));
    if (worst <= places) return { type: 'yes' };
    if (best > places) return { type: 'no' };
    if (gamesUnknown) return { type: 'depends', reasons: ['games'] };
    // Down to points. If one open match alone moves the tied players' points, find its threshold.
    const tied = new Set(block.map((s) => s.id));
    const affecting = open.map((m, i) => (tied.has(m.a) || tied.has(m.b) ? i : -1)).filter((i) => i >= 0);
    if (affecting.length !== 1) return { type: 'depends', reasons: ['points'] };
    const idx = affecting[0];
    const [lo, hi] = marginRange(combo[idx], gamePoints);
    const good = [];
    for (let v = lo; v <= hi; v += 1) {
      const { standings: full } = rankGroup(players, withOutcomes(combo, { [idx]: v }), format, { rules });
      const mine = full.find((s) => s.id === entryId);
      if (mine.position <= places && mine.by !== 'lots') good.push(v); // a draw of lots isn't a guarantee
    }
    if (!good.length) return { type: 'no' };
    if (good.length === hi - lo + 1) return { type: 'yes' };
    const min = good[0];
    const max = good.at(-1);
    if (max - min + 1 !== good.length) return { type: 'depends', reasons: ['points'] };
    return { type: 'margin', match: idx, outcome: combo[idx], winner: aWins(combo[idx]) ? 'a' : 'b', min: min === lo ? null : min, max: max === hi ? null : max };
  }

  // Every combination of outcomes and its verdict.
  const own = (i) => open[i].a === entryId || open[i].b === entryId;
  const verdicts = new Map(); // key -> verdict
  const combos = [];
  const total = values.length ** open.length;
  for (let n = 0; n < total; n += 1) {
    const combo = [];
    let rest = n;
    for (let i = 0; i < open.length; i += 1) {
      combo.push(values[rest % values.length]);
      rest = Math.floor(rest / values.length);
    }
    const v = verdict(combo);
    const key = JSON.stringify(v);
    verdicts.set(key, v);
    combos.push({ combo, key });
  }
  const types = new Set([...verdicts.values()].map((v) => v.type));
  if (types.size === 1 && types.has('yes')) return { status: 'through', mode, open, rows: [] };
  if (types.size === 1 && types.has('no')) return { status: 'out', mode, open, rows: [] };

  // A decision tree, the entry's own matches first: split on one match at a time,
  // and put that match's outcomes together when they lead to the same answers.
  // The rows partition every combination, so each case matches exactly one row.
  const order = [...open.keys()].sort((x, y) => own(y) - own(x));
  function tree(list, depth) {
    if (new Set(list.map((x) => x.key)).size === 1) return [{ conditions: [], key: list[0].key }];
    const match = order[depth];
    const branches = new Map(); // subtree signature -> { values, rows }
    for (const value of values) {
      const rows = tree(list.filter((x) => x.combo[match] === value), depth + 1);
      const signature = JSON.stringify(rows);
      if (!branches.has(signature)) branches.set(signature, { values: [], rows });
      branches.get(signature).values.push(value);
    }
    return [...branches.values()].flatMap(({ values: vs, rows }) => rows.map((row) => ({
      conditions: vs.length === values.length ? row.conditions : [{ match, values: vs }, ...row.conditions],
      key: row.key,
    })));
  }
  const rows = tree(combos, 0).map((row) => ({ conditions: row.conditions, result: verdicts.get(row.key) }));
  if (rows.length > maxRows) return { status: 'tooManyRows', mode, open, rows: [] };

  // Rows with more of the entry's own wins first, then better results.
  const ownWin = (c) => own(c.match) && c.values.every((x) => (open[c.match].a === entryId) === aWins(x));
  const rank = { yes: 0, margin: 1, depends: 2, no: 3 };
  rows.sort((x, y) => y.conditions.filter(ownWin).length - x.conditions.filter(ownWin).length
    || rank[x.result.type] - rank[y.result.type]);
  return { status: 'open', mode, open, rows };
}

/** An example's scores in games to `g` points: the winner on g, each margin unchanged. */
export function exampleScores(id, format, g = 21) {
  const shift = 21 - g;
  return Object.fromEntries(Object.entries(EXAMPLES[id][format]).map(([pair, games]) => [
    pair,
    games.map(([x, y]) => (x > y ? [g, y - shift] : [x - shift, g])),
  ]));
}

// Scoring for each tier, from the "Matches" column of the 2026 T&Cs matrix.
// 'bwf' is the BWF standard for adult events: best of three games to 21, with
// setting to 30. Tiers whose cell doesn't set a score (Para: "as per BE
// regulations"; Other: N/A) use it too. Notes on the less clear cells:
//   senior-tier4: format is the organiser's choice; BE recommends 3 games to 21.
//   junior-gold-u11: "U11: 3 games to 15", with no word on setting; setting to
//     21 is assumed, as for the matrix's other 15-point games.
const BWF = { format: 'bestOf3', points: 21, setting: true };
const TO_15 = { format: 'bestOf3', points: 15, setting: true };
export const SCORING_PRESETS = {
  bwf: BWF,
  'masters-gold': BWF,
  'masters-silver': BWF,
  'masters-bronze': BWF,
  'senior-gold': BWF,
  'senior-silver': BWF,
  'senior-bronze': BWF,
  'senior-tier4': BWF,
  'u19-gold': BWF,
  'u19-silver': BWF,
  'u19-bronze': TO_15, // "3 games to 15 with extended scoring"
  'junior-gold': BWF, // "3 games to 21 - ext to 30"
  'junior-gold-u11': TO_15, // "U11: 3 games to 15"
  'junior-silver': TO_15, // "3 games to 15 - with ext to 21"
  'junior-bronze': { format: 'oneGame', points: 21, setting: true }, // "1 game to 21 with extended play to 30"
  para: BWF,
  other: BWF,
};
