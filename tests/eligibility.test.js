import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GRADES, ageOn, checkEligibility, gradeChartRows, juniorAgeGroup, parseDate } from '../public/eligibility.js';

const result = (player, tier) => checkEligibility(player).find((r) => r.tier === tier);
const grades = (singles, doubles, mixed) => ({ singles, doubles, mixed });

test('parseDate rejects malformed input', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('2010-13-01'), null);
  assert.deepEqual(parseDate('2010-01-01'), { year: 2010, month: 1, day: 1 });
});

test('ageOn counts the birthday itself', () => {
  const jan1 = { year: 2026, month: 1, day: 1 };
  assert.equal(ageOn(parseDate('2010-01-01'), jan1), 16);
  assert.equal(ageOn(parseDate('2010-01-02'), jan1), 15);
});

test('junior age groups match the matrix definition of U17 (born 2010 or later)', () => {
  assert.equal(juniorAgeGroup(2009), null);
  assert.equal(juniorAgeGroup(2010), 'U17');
  assert.equal(juniorAgeGroup(2012), 'U15');
  assert.equal(juniorAgeGroup(2015), 'U13');
  assert.equal(juniorAgeGroup(2016), 'U11');
  assert.equal(juniorAgeGroup(2019), 'U11');
});

test('Senior Gold needs D or above in one discipline for players born 2010 or later', () => {
  assert.equal(result({ dob: '2009-12-31', grades: {} }, 'senior-gold').status, 'yes');
  assert.equal(result({ dob: '2010-01-01', grades: grades('E', 'E', 'E') }, 'senior-gold').status, 'no');
  const ok = result({ dob: '2011-05-05', grades: grades('F', 'D', '') }, 'senior-gold');
  assert.equal(ok.status, 'yes');
  assert.equal(ok.summary.key, 'sum.youngMust');
  assert.deepEqual(ok.summary.params.disciplines, ['doubles']);
});

test('Senior Silver needs E or above for players born 2010 or later', () => {
  assert.equal(result({ dob: '2010-06-01', grades: grades('E') }, 'senior-silver').status, 'yes');
  assert.equal(result({ dob: '2010-06-01', grades: grades('F', 'G') }, 'senior-silver').status, 'no');
  assert.equal(result({ dob: '2010-06-01', grades: {} }, 'senior-silver').status, 'no');
});

test('Senior Bronze bars A–C per discipline and needs 16+ on 1 Jan', () => {
  assert.equal(result({ dob: '2010-01-02', grades: {} }, 'senior-bronze').status, 'no');
  assert.equal(result({ dob: '2010-01-01', grades: {} }, 'senior-bronze').status, 'yes');
  const mixed = result({ dob: '1990-01-01', grades: grades('C', 'D', 'K') }, 'senior-bronze');
  assert.equal(mixed.status, 'partial');
  assert.equal(mixed.events[0].disciplines.singles.ok, false);
  assert.equal(mixed.events[0].disciplines.doubles.ok, true);
});

test('Tier 4 bars A–E', () => {
  assert.equal(result({ dob: '1990-01-01', grades: grades('E', 'E', 'E') }, 'senior-tier4').status, 'no');
  assert.equal(result({ dob: '1990-01-01', grades: grades('F', 'F', 'F') }, 'senior-tier4').status, 'yes');
});

test('U19 tiers need birth year 2008–2013', () => {
  assert.equal(result({ dob: '2007-12-31', grades: {} }, 'u19-gold').status, 'no');
  assert.equal(result({ dob: '2008-01-01', grades: grades('A') }, 'u19-gold').status, 'yes');
  assert.equal(result({ dob: '2014-01-01', grades: {} }, 'u19-gold').status, 'no');
  assert.equal(result({ dob: '2009-01-01', grades: grades('D', 'D', 'D') }, 'u19-silver').status, 'yes');
  assert.equal(result({ dob: '2009-01-01', grades: grades('D', 'D', 'D') }, 'u19-bronze').status, 'no');
});

test('juniors may play up to two age groups above their own', () => {
  const u11 = result({ dob: '2017-03-03', grades: {} }, 'junior-gold');
  assert.deepEqual(u11.events.map((e) => e.ageGroup), ['U11', 'U13', 'U15']);
  const u15 = result({ dob: '2012-03-03', grades: {} }, 'junior-gold');
  assert.deepEqual(u15.events.map((e) => e.ageGroup), ['U15', 'U17']);
  assert.equal(result({ dob: '2009-03-03', grades: {} }, 'junior-gold').status, 'no');
});

test('Junior Bronze bars depend on the age group entered', () => {
  // A U13 player can enter U13–U17. U13 and U15 bar A–G; U17 bars only A–F.
  const r = result({ dob: '2014-06-06', grades: grades('H', 'G', '') }, 'junior-bronze');
  const byGroup = Object.fromEntries(r.events.map((e) => [e.ageGroup, e.disciplines]));
  assert.equal(byGroup.U13.singles.ok, true);
  assert.equal(byGroup.U13.doubles.ok, false);
  assert.equal(byGroup.U17.doubles.ok, true);
  assert.equal(r.status, 'partial');
});

test('Junior Silver lists no bar for U13', () => {
  const r = result({ dob: '2014-06-06', grades: grades('A') }, 'junior-silver');
  const byGroup = Object.fromEntries(r.events.map((e) => [e.ageGroup, e.disciplines]));
  assert.equal(byGroup.U13.singles.ok, true);
  assert.equal(byGroup.U15.singles.ok, false);
});

test('invalid date of birth returns no results', () => {
  assert.deepEqual(checkEligibility({ dob: 'nonsense' }), []);
});

test('grade chart rows agree with the matrix bars', () => {
  const rows = gradeChartRows();
  const row = (label, noteKey) => rows.find((r) => r.label === label && (!noteKey || r.note?.key === noteKey));
  const barred = (r) => GRADES.filter((g) => r.cells[g] === 'barred').join('');
  assert.equal(barred(row('Senior Bronze')), 'ABC');
  assert.equal(barred(row('Senior Tier 4')), 'ABCDE');
  assert.equal(barred(row('U19 Bronze')), 'ABCD');
  assert.equal(barred(row('Junior Silver U17')), 'ABCDE');
  assert.equal(barred(row('Junior Silver U13')), '');
  assert.equal(barred(row('Junior Bronze U11')), 'ABCDEFGH');
  const young = row('Senior Gold', 'note.youngMin');
  assert.equal(young.cells.D, 'allowed');
  assert.equal(young.cells.E, 'conditional');
  assert.equal(row('Senior Silver', 'note.youngMin').cells.E, 'allowed');
});

test('every message key used by the rules exists in the English strings', async () => {
  const { default: en } = await import('../public/locales/en.js');
  const keys = new Set();
  const collect = (m) => m && keys.add(m.key);
  for (const dob of ['1985-01-01', '2009-06-01', '2010-06-01', '2012-06-01', '2016-06-01']) {
    for (const g of [[], ['A', 'A', 'A'], ['D', 'F', ''], ['K', 'K', 'K']]) {
      for (const r of checkEligibility({ dob, grades: grades(...g) })) {
        collect(r.summary);
        r.events?.forEach((e) => Object.values(e.disciplines).forEach((d) => collect(d.reason)));
      }
    }
  }
  gradeChartRows().forEach((r) => collect(r.note));
  for (const key of keys) assert.ok(key in en, `missing English string for ${key}`);
});
