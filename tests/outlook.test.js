import assert from 'node:assert/strict';
import { test } from 'node:test';

import { marginRange, matchWinner, qualificationDetail, scoresWithMargin } from '../site/groups.js';

const players = (...ids) => ids.map((id) => ({ id, name: id }));
const m = (a, b, ...games) => ({ a, b, games });
const margin = (games) => games.reduce((sum, [x, y]) => sum + x - y, 0);

test('scoresWithMargin gives the winner exactly the margin asked for', () => {
  const ranges = { a20: [4, 42], a21: [-17, 40], b20: [4, 42], b21: [-17, 40] };
  for (const [value, [lo, hi]] of Object.entries(ranges)) {
    for (let v = lo; v <= hi; v += 1) {
      const games = scoresWithMargin(value, 'bestOf3', v);
      const winner = value[0];
      assert.equal(matchWinner(games, 'bestOf3'), winner, `${value} ${v}`);
      assert.equal(games.length, value.endsWith('20') ? 2 : 3, `${value} ${v} game count`);
      assert.equal((winner === 'a' ? 1 : -1) * margin(games) + 0, v, `${value} ${v}`); // + 0 turns -0 into 0
      assert.ok(games.flat().every((p) => p >= 0 && p <= 21), `${value} ${v} scores ${JSON.stringify(games)}`);
    }
  }
  for (let v = 2; v <= 21; v += 1) {
    const games = scoresWithMargin('b', 'oneGame', v);
    assert.equal(matchWinner(games, 'oneGame'), 'b');
    assert.equal(0 - margin(games), v);
  }
});

test('a tie on points becomes an exact margin to aim for', () => {
  // One game per match. B beat C 21-15, C beat A 21-19; A v B still to play.
  // If A wins by v: A -2+v, B +6-v, C -4. A tops the group when v >= 4
  // (at 4, A and B are level and A has beaten B).
  const q = qualificationDetail(players('A', 'B', 'C'), [
    m('A', 'B'),
    m('B', 'C', [21, 15]),
    m('C', 'A', [21, 19]),
  ], 'oneGame', 'A', 1);
  assert.equal(q.status, 'open');
  const win = q.rows.find((r) => r.conditions[0].values[0] === 'a');
  assert.deepEqual(win.result, { type: 'margin', match: 0, outcome: 'a', winner: 'a', min: 4, max: null });
  const lose = q.rows.find((r) => r.conditions[0].values[0] === 'b');
  assert.equal(lose.result.type, 'no');
});

test('rows cover every combination of the open matches exactly once', () => {
  // A beat B, C beat A, B beat D, C beat D; A v D and B v C still to play.
  const group = players('A', 'B', 'C', 'D');
  const games = [
    m('A', 'B', [21, 15], [21, 15]),
    m('A', 'C', [15, 21], [21, 15], [15, 21]),
    m('A', 'D'),
    m('B', 'C'),
    m('B', 'D', [21, 10], [21, 10]),
    m('C', 'D', [21, 10], [21, 10]),
  ];
  for (const places of [1, 2]) {
    const q = qualificationDetail(group, games, 'bestOf3', 'A', places);
    assert.equal(q.mode, 'exact');
    if (q.status !== 'open') continue;
    const values = ['a20', 'a21', 'b21', 'b20'];
    for (const x of values) {
      for (const y of values) {
        const combo = [x, y];
        const hits = q.rows.filter((r) => r.conditions.every((c) => c.values.includes(combo[c.match])));
        assert.equal(hits.length, 1, `top ${places}: ${combo} matched ${hits.length} rows`);
      }
    }
    // A's own match is listed first wherever it appears.
    for (const r of q.rows) {
      const ownAt = r.conditions.findIndex((c) => q.open[c.match].a === 'A' || q.open[c.match].b === 'A');
      assert.ok(ownAt <= 0);
    }
  }
});

test('already through or out needs no rows', () => {
  const through = qualificationDetail(players('A', 'B', 'C'), [
    m('A', 'B', [21, 15], [21, 15]), m('A', 'C', [21, 15], [21, 15]), m('B', 'C'),
  ], 'bestOf3', 'A', 1);
  assert.equal(through.status, 'through');
  const out = qualificationDetail(players('A', 'B', 'C'), [
    m('A', 'B', [15, 21], [15, 21]), m('A', 'C', [15, 21], [15, 21]), m('B', 'C'),
  ], 'bestOf3', 'A', 2);
  assert.equal(out.status, 'out');
});

test('a result that does not matter is left out of the conditions', () => {
  // A has beaten B and C. With A v D and B v C open, A tops the group whenever A beats D.
  const q = qualificationDetail(players('A', 'B', 'C', 'D'), [
    m('A', 'B', [21, 15], [21, 15]),
    m('A', 'C', [21, 15], [21, 15]),
    m('A', 'D'),
    m('B', 'C'),
    m('B', 'D', [21, 15], [21, 15]),
    m('C', 'D', [15, 21], [15, 21]),
  ], 'bestOf3', 'A', 1);
  assert.equal(q.status, 'open');
  const yes = q.rows.filter((r) => r.result.type === 'yes');
  assert.ok(yes.some((r) => r.conditions.length === 1 && r.conditions[0].values.join() === 'a20,a21'),
    JSON.stringify(q.rows.map((r) => [r.conditions, r.result])));
});

test('margins follow the points per game: 21, 15 or 11', () => {
  for (const g of [21, 15, 11]) {
    for (const value of ['a20', 'a21', 'b21', 'b20']) {
      const [lo, hi] = marginRange(value, g);
      for (let v = lo; v <= hi; v += 1) {
        const games = scoresWithMargin(value, 'bestOf3', v, g);
        assert.equal(matchWinner(games, 'bestOf3', { points: g }), value[0], `${g} ${value} ${v}`);
        assert.equal((value[0] === 'a' ? 1 : -1) * margin(games) + 0, v, `${g} ${value} ${v}`);
        assert.ok(games.flat().every((p) => p >= 0 && p <= g), `${g} ${value} ${v}: ${JSON.stringify(games)}`);
      }
    }
    assert.deepEqual(marginRange('a', g), [2, g]);
    assert.deepEqual(scoresWithMargin('a', 'oneGame', g, g), [[g, 0]]);
  }
});

test('the points threshold is found within the shorter game', () => {
  // Same tie as above, in games to 15: B beat C 15-9, C beat A 15-13; A v B to play.
  // A -2+v, B +6-v, C -4: A first when v >= 4, now out of a possible 2..15.
  const q = qualificationDetail(players('A', 'B', 'C'), [
    m('A', 'B'), m('B', 'C', [15, 9]), m('C', 'A', [15, 13]),
  ], 'oneGame', 'A', 1, { rules: { points: 15 } });
  const win = q.rows.find((r) => r.conditions[0].values[0] === 'a');
  assert.deepEqual(win.result, { type: 'margin', match: 0, outcome: 'a', winner: 'a', min: 4, max: null });
});
