import assert from 'node:assert/strict';
import { test } from 'node:test';

import { playerHistory } from '../lib/analysis.js';
import { analyse, gradeOutlook, ratingChange, ratingSeries, record, streak } from '../public/analysis.js';
import { HISTORY, ME } from './fixtures/badminfo-history-sample.js';

const TODAY = '2026-10-30';
const history = playerHistory(HISTORY, ME);
const a = analyse(history, TODAY);

test('records count only matches with a result', () => {
  assert.deepEqual(a.overall, { won: 4, lost: 2, played: 6, pct: 67 });
  assert.deepEqual(record([]), { won: 0, lost: 0, played: 0, pct: null });
  assert.equal(a.disciplines.singles.pct, 75);
  assert.equal(a.disciplines.doubles.played, 2);
  assert.equal(a.disciplines.mixed, undefined, 'no matches and no rating');
});

test('the rating series is the rating going into each day, then today’s', () => {
  assert.deepEqual(a.series.singles, [{ date: '2026-04-25', rating: 500 }, { date: '2026-10-17', rating: 520 }, { date: TODAY, rating: 540 }]);
  assert.deepEqual(a.series.doubles.map((p) => p.rating), [460, 470, 480]);
  assert.equal(a.disciplines.singles.change90, 40, 'from the last point at least 90 days back');
  assert.equal(a.disciplines.doubles.changeAll, 20);
  assert.deepEqual(a.disciplines.singles.peak, { date: TODAY, rating: 540 });
  assert.equal(ratingChange([{ date: TODAY, rating: 5 }]), null);
  const later = ratingSeries({ ...history, ratingsDate: '2027-01-01' }, TODAY);
  assert.equal(later.singles.at(-1).date, TODAY, 'a ratings date in the future is clamped to today');
});

test('form, streak and results against the ratings’ expectations', () => {
  assert.deepEqual(a.form.map((m) => m.won), [false, true, true, true, false, true]);
  assert.deepEqual(a.streak, { won: true, n: 1 });
  assert.equal(streak([]), null);
  assert.deepEqual(a.expectation, { matches: 6, expected: 3.1, actual: 4, diff: 0.9 });
  assert.deepEqual(a.chance.underdog, { won: 2, lost: 0, played: 2, pct: 100 });
  assert.deepEqual(a.chance.even, { won: 0, lost: 2, played: 2, pct: 0 });
  assert.deepEqual(a.surprises.wins.map((m) => m.winChance), [0.3, 0.35]);
  assert.deepEqual(a.surprises.losses, []);
});

test('close matches, games and points', () => {
  assert.deepEqual(a.close.deciding, { won: 1, lost: 2, played: 3, pct: 33 });
  assert.deepEqual(a.close.tight, { won: 3, lost: 2 });
  assert.deepEqual(a.close.games, { won: 10, lost: 5 });
  assert.equal(a.close.points.won, (21 + 17 + 18) + (21 + 21) + (22 + 19 + 21) + (21 + 23) + (21 + 18 + 19) + (21 + 21));
});

test('results by level, year and stage; partners, rivals and tournaments', () => {
  assert.deepEqual(a.levels.map((l) => [l.key, l.won, l.lost]), [['bronze', 2, 0], ['silver', 2, 1], ['league', 0, 1]]);
  assert.deepEqual(a.years.map((y) => y.key), ['2026']);
  assert.deepEqual(a.stages.map((s) => [s.key, s.won, s.lost]), [['group', 3, 0], ['knockout', 1, 1], ['league', 0, 1]]);
  assert.deepEqual(a.partners.map((p) => [p.names.join('/'), p.played, p.won, p.disciplines.join()]), [['Di', 2, 1, 'doubles']]);
  assert.deepEqual(a.rivals.map((r) => [r.names.join('/'), r.played, r.won]), [['Flo', 3, 2], ['Gus/Hu', 2, 1]]);
  const [autumn, spring, league] = a.tournaments;
  assert.equal(autumn.name, 'Autumn Silver');
  assert.deepEqual([autumn.won, autumn.lost, autumn.level], [2, 1, 'silver']);
  assert.deepEqual(autumn.change, { singles: 4, doubles: 10 });
  assert.deepEqual(autumn.events, ['OS U15', 'OD U15']);
  assert.equal(spring.level, 'bronze');
  assert.equal(league.level, 'league');
});

test('grades: the timeline, and a prediction already in effect counts as done', () => {
  assert.deepEqual(a.grades.timeline.singles.map((g) => g.grade), ['H', 'G']);
  assert.deepEqual(a.grades.current, { singles: 'G', doubles: 'I', mixed: '' });
  assert.equal(a.grades.outlook.disciplines.singles.move, 'done');
  assert.equal(a.grades.outlook.disciplines.doubles.move, 'maybe');
  assert.equal(gradeOutlook({ singles: { from: 'H', best: 'G', worst: 'G' } }).disciplines.singles.move, 'up');
  assert.equal(gradeOutlook({ singles: { from: 'H', best: 'H', worst: 'H' } }).disciplines.singles.move, 'same');
  assert.equal(gradeOutlook(null), null);
  assert.deepEqual([a.medals.winner, a.medals.runnerUp], [1, 1]);
});

test('insights pick out what stands out, most telling first', () => {
  assert.deepEqual(a.insights, [
    { key: 'analysis.in.ratingUp', params: { discipline: 'singles', n: 40 } },
    { key: 'analysis.in.ratingUp', params: { discipline: 'doubles', n: 20 } },
    { key: 'analysis.in.gradeRecent', params: { discipline: 'singles', from: 'H', to: 'G', date: TODAY } },
    { key: 'analysis.in.gradeMaybe', params: { discipline: 'doubles', from: 'I', to: 'H' } },
    { key: 'analysis.in.deciding', params: { won: 1, played: 3 } },
    { key: 'analysis.in.titles', params: { n: 1, year: '2026' } },
  ]);
  assert.deepEqual(analyse({ ...history, matches: [], trophies: [], gradeHistory: [], periods: {} }, TODAY).insights, [], 'nothing to say from today’s ratings alone');
});
