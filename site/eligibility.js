// Entry eligibility for the 2026 BE tournament matrix, read literally from its
// Grade Restrictions column. Grades are per discipline; A is the highest.

export const SEASON = 2026;
export const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
export const DISCIPLINES = ['singles', 'doubles', 'mixed'];

// U(n) means under n on 31 December of the season, which matches the matrix's
// own definitions: U17 = born on or after 1 Jan 2010, U19 = born 2008 onwards.
export const JUNIOR_AGE_GROUPS = ['U11', 'U13', 'U15', 'U17'];

// Highest grade still barred (A down to this grade may not enter).
const BARRED_FROM = {
  'senior-bronze': 'C',
  'senior-tier4': 'E',
  'u19-silver': 'C',
  'u19-bronze': 'D',
};

const JUNIOR_BARRED_FROM = {
  'junior-gold': {},
  'junior-silver': { U17: 'E', U15: 'F' },
  'junior-bronze': { U17: 'F', U15: 'G', U13: 'G', U11: 'H' },
};

// Players born in this year or later need this grade or better in one discipline.
const MINIMUM_FOR_YOUNGER = {
  'senior-gold': { bornFrom: 2010, grade: 'D' },
  'senior-silver': { bornFrom: 2010, grade: 'E' },
};

const U19_BORN = { from: 2008, to: 2013 };
const SENIOR_MIN_AGE_ON_1_JAN = 16;

/** Parses 'YYYY-MM-DD' without going through Date, so time zones can't shift it. */
export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function ageOn(dob, on) {
  const beforeBirthday = on.month < dob.month || (on.month === dob.month && on.day < dob.day);
  return on.year - dob.year - (beforeBirthday ? 1 : 0);
}

/** The player's own junior age group, or null if they are too old for U17. */
export function juniorAgeGroup(birthYear, season = SEASON) {
  const ageAtYearEnd = season - birthYear;
  return JUNIOR_AGE_GROUPS.find((group) => ageAtYearEnd < Number(group.slice(1))) ?? null;
}

function rank(grade) {
  return grade ? GRADES.indexOf(grade) : GRADES.length; // ungraded sits below K
}

// Results carry message keys and parameters rather than English sentences, so
// the page can word them in the reader's language (see locales/en.js).
const msg = (key, params = {}) => ({ key, params });

function checkBar(grade, barredFrom) {
  if (barredFrom && rank(grade) <= rank(barredFrom)) {
    return { ok: false, reason: msg('reason.barred', { grade, worst: barredFrom }) };
  }
  return { ok: true, reason: msg(barredFrom ? 'reason.allowed' : 'reason.noBar', { grade }) };
}

function checkDisciplines(grades, barredFrom) {
  return Object.fromEntries(DISCIPLINES.map((d) => [d, checkBar(grades[d], barredFrom)]));
}

function statusOf(disciplineSets) {
  const results = disciplineSets.flatMap((set) => Object.values(set));
  if (results.every((r) => r.ok)) return 'yes';
  if (results.some((r) => r.ok)) return 'partial';
  return 'no';
}

function barSummary(status, worst) {
  return { yes: msg('sum.barNone', { worst }), partial: msg('sum.barSome'), no: msg('sum.barAll', { worst }) }[status];
}

function seniorWithAgeLimit(tier, dob, grades) {
  const age = ageOn(dob, { year: SEASON, month: 1, day: 1 });
  if (age < SENIOR_MIN_AGE_ON_1_JAN) {
    return { tier, status: 'no', summary: msg('sum.tooYoung', { season: SEASON, age: Math.max(age, 0) }) };
  }
  const disciplines = checkDisciplines(grades, BARRED_FROM[tier]);
  const status = statusOf([disciplines]);
  return { tier, status, summary: barSummary(status, BARRED_FROM[tier]), events: [{ disciplines }] };
}

function seniorWithMinimum(tier, dob, grades) {
  const { bornFrom, grade } = MINIMUM_FOR_YOUNGER[tier];
  if (dob.year < bornFrom) {
    return { tier, status: 'yes', summary: msg('sum.olderFree', { year: bornFrom }) };
  }
  const qualifying = DISCIPLINES.filter((d) => rank(grades[d]) <= rank(grade));
  if (qualifying.length === 0) {
    return { tier, status: 'no', summary: msg('sum.youngNeeds', { year: bornFrom, grade }) };
  }
  return { tier, status: 'yes', summary: msg('sum.youngMust', { year: bornFrom, grade, disciplines: qualifying }) };
}

function u19(tier, dob, grades) {
  if (dob.year < U19_BORN.from || dob.year > U19_BORN.to) {
    return { tier, status: 'no', summary: msg('sum.u19Born', U19_BORN) };
  }
  const barredFrom = BARRED_FROM[tier];
  if (!barredFrom) {
    return { tier, status: 'yes', summary: msg('sum.noRestrictions') };
  }
  const disciplines = checkDisciplines(grades, barredFrom);
  const status = statusOf([disciplines]);
  return { tier, status, summary: barSummary(status, barredFrom), events: [{ disciplines }] };
}

function junior(tier, dob, grades) {
  const own = juniorAgeGroup(dob.year);
  if (!own) {
    return { tier, status: 'no', summary: msg('sum.juniorTooOld', { year: SEASON - 16 }) };
  }
  const start = JUNIOR_AGE_GROUPS.indexOf(own);
  const groups = JUNIOR_AGE_GROUPS.slice(start, start + 3);
  const bars = JUNIOR_BARRED_FROM[tier];
  const events = groups.map((ageGroup) => ({ ageGroup, disciplines: checkDisciplines(grades, bars[ageGroup]) }));
  const status = statusOf(events.map((e) => e.disciplines));
  const key = { yes: 'sum.juniorYes', partial: 'sum.juniorPartial', no: 'sum.juniorNo' }[status];
  return { tier, status, summary: msg(key, { own, groups }), events };
}

const CHECKS = {
  'masters-gold': masters,
  'masters-silver': masters,
  'masters-bronze': masters,
  'senior-gold': seniorWithMinimum,
  'senior-silver': seniorWithMinimum,
  'senior-bronze': seniorWithAgeLimit,
  'senior-tier4': seniorWithAgeLimit,
  'u19-gold': u19,
  'u19-silver': u19,
  'u19-bronze': u19,
  'junior-gold': junior,
  'junior-silver': junior,
  'junior-bronze': junior,
  para: (tier) => ({ tier, status: 'info', summary: msg('sum.para') }),
  other: (tier) => ({ tier, status: 'info', summary: msg('sum.other') }),
};

function masters(tier) {
  return { tier, status: 'info', summary: msg('sum.masters') };
}

/**
 * @param {{ dob: string, grades: { singles?: string, doubles?: string, mixed?: string } }} player
 *   dob as 'YYYY-MM-DD'; a missing or empty grade means ungraded.
 * @returns {Array<{ tier: string, status: 'yes'|'partial'|'no'|'info', summary: Message,
 *   events?: Array<{ ageGroup?: string, disciplines: Record<string, { ok: boolean, reason: Message }> }> }>}
 *   where Message is { key, params } naming a string in locales/en.js.
 */
export function checkEligibility({ dob, grades = {} }) {
  const date = parseDate(dob);
  if (!date) return [];
  const normalised = Object.fromEntries(DISCIPLINES.map((d) => [d, GRADES.includes(grades[d]) ? grades[d] : null]));
  return Object.entries(CHECKS).map(([tier, check]) => check(tier, date, normalised));
}

/**
 * One row per tier (or tier age group / birth band) with each grade's state:
 * 'allowed', 'barred', or 'conditional' (Senior Gold/Silver: below the minimum,
 * a younger player may play this grade's discipline only alongside one that meets it).
 * Built from the same tables as checkEligibility so the chart can't drift from it.
 * Labels are tier names, which stay in English; notes are messages.
 */
export function gradeChartRows() {
  const every = (state) => Object.fromEntries(GRADES.map((g) => [g, state]));
  const barredTo = (worst) => Object.fromEntries(GRADES.map((g) => [g, worst && rank(g) <= rank(worst) ? 'barred' : 'allowed']));
  const minimum = (min) => Object.fromEntries(GRADES.map((g) => [g, rank(g) <= rank(min) ? 'allowed' : 'conditional']));
  const u19 = msg('note.bornRange', U19_BORN);
  const sixteen = msg('note.sixteen', { season: SEASON });

  const rows = [
    { circuit: 'masters', tier: 'masters-gold', label: 'Masters Gold, Silver & Bronze', note: msg('note.noRestrictions'), cells: every('allowed') },
  ];
  for (const tier of ['senior-gold', 'senior-silver']) {
    const { bornFrom, grade } = MINIMUM_FOR_YOUNGER[tier];
    const name = tier === 'senior-gold' ? 'Senior Gold' : 'Senior Silver';
    rows.push(
      { circuit: 'senior', tier, label: name, note: msg('note.bornBy', { year: bornFrom - 1 }), cells: every('allowed') },
      { circuit: 'senior', tier, label: name, note: msg('note.youngMin', { year: bornFrom, grade }), minimum: grade, cells: minimum(grade) });
  }
  rows.push(
    { circuit: 'senior', tier: 'senior-bronze', label: 'Senior Bronze', note: sixteen, cells: barredTo(BARRED_FROM['senior-bronze']) },
    { circuit: 'senior', tier: 'senior-tier4', label: 'Senior Tier 4', note: sixteen, cells: barredTo(BARRED_FROM['senior-tier4']) },
    { circuit: 'u19', tier: 'u19-gold', label: 'U19 Gold', note: u19, cells: every('allowed') },
    { circuit: 'u19', tier: 'u19-silver', label: 'U19 Silver', note: u19, cells: barredTo(BARRED_FROM['u19-silver']) },
    { circuit: 'u19', tier: 'u19-bronze', label: 'U19 Bronze', note: u19, cells: barredTo(BARRED_FROM['u19-bronze']) },
    { circuit: 'junior', tier: 'junior-gold', label: 'Junior Gold', note: msg('note.allAges'), cells: every('allowed') });
  for (const tier of ['junior-silver', 'junior-bronze']) {
    const name = tier === 'junior-silver' ? 'Junior Silver' : 'Junior Bronze';
    for (const ageGroup of [...JUNIOR_AGE_GROUPS].reverse()) {
      const worst = JUNIOR_BARRED_FROM[tier][ageGroup];
      rows.push({ circuit: 'junior', tier, label: `${name} ${ageGroup}`, note: worst ? null : msg('note.noBar'), cells: barredTo(worst) });
    }
  }
  rows.push(
    { circuit: 'para', tier: 'para', label: 'Para Gold & Bronze', note: msg('note.para'), cells: every('allowed') },
    { circuit: 'other', tier: 'other', label: 'Other tournaments', note: msg('note.other'), cells: every('allowed') });
  return rows;
}
