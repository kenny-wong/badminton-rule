// The Analysis page (#/analysis/<badminfo id>): a saved player's progress,
// from their badminfo match history and Badminton England's player page
// (GET /api/analysis). The numbers come from analysis.js; this lays them out,
// with the rating chart drawn here as SVG. Only players added from a badminfo
// link can be analysed, so the tab shows only when there is one.

import { DISCIPLINES, analyse } from './analysis.js';
import { currentLocale, t, tParts } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null && value !== false) el.setAttribute(key, value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const loaded = new Map(); // badminfo id -> the API's answer, kept for this visit
let shown = null; // the id the page is showing (a slow answer for another player is dropped)

const locale = () => (currentLocale() === 'en' ? 'en-GB' : currentLocale());
const day = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' }) : '');
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const wl = (r) => `${r.won}–${r.lost}`;
const pct = (n) => (n === null || n === undefined ? '–' : `${n}%`);
const chance = (p) => `${Math.round(p * 100)}%`;
const names = (people) => people.map((p) => p.name).join(' / ');
const scoreText = (m) => (m.games.length ? m.games.map(([a, b]) => `${a}–${b}`).join(', ') : m.note ?? '');
const beDiscipline = (event) => (/XD/i.test(event) ? 'mixed' : /S$/i.test(event) ? 'singles' : /D$/i.test(event) ? 'doubles' : null);

/** Draws the page for `id` (or the first analysable player), loading their history when needed. */
export function renderAnalysis(view, { h, fill, setTitle, players, id, track }) {
  setTitle(t('analysis.title'));
  const chosen = id || players[0]?.badminfoId || '';
  shown = chosen;
  const body = h('div', { class: 'analysis' });
  const picker = players.length > 1 || (chosen && !players.some((p) => p.badminfoId === chosen))
    ? h('label', { class: 'analysis-pick' }, t('analysis.player'), ' ',
      h('select', { onchange: (e) => { location.hash = `#/analysis/${e.target.value}`; } },
        players.map((p) => h('option', { value: p.badminfoId, selected: p.badminfoId === chosen }, p.name || p.badminfoId)),
        players.some((p) => p.badminfoId === chosen) ? null : h('option', { value: chosen, selected: true }, t('analysis.linkedPlayer'))))
    : null;
  fill(view,
    h('h2', { class: 'section-title' }, t('analysis.title')),
    h('p', { class: 'lede-small' }, t('analysis.lede')),
    picker,
    body);
  if (!chosen) {
    fill(body, h('p', { class: 'empty' }, tParts('analysis.none', { link: h('a', { href: '#/check' }, t('tab.check')) })));
    return;
  }
  const draw = (answer) => {
    if (shown !== chosen) return;
    if (answer.error) {
      fill(body, h('p', { class: 'empty' }, t(`analysis.error.${answer.error}`) || t('analysis.error.unavailable')),
        h('button', { type: 'button', class: 'small-button', onclick: () => load(true) }, t('analysis.retry')));
      return;
    }
    drawPlayer(body, answer, { h, fill, reload: () => load(true) });
  };
  const load = async (fresh = false) => {
    if (!fresh && loaded.has(chosen)) return draw(loaded.get(chosen));
    fill(body, h('p', { class: 'loading' }, t('analysis.loading')));
    let answer;
    try {
      const res = await fetch(`/api/analysis?id=${encodeURIComponent(chosen)}`, fresh ? { cache: 'no-cache' } : {});
      answer = await res.json();
      if (!res.ok && !answer.error) answer = { error: 'unavailable' };
    } catch {
      answer = { error: 'unavailable' };
    }
    if (!answer.error) {
      loaded.set(chosen, answer);
      track('analysis_load', { name: answer.name, badminfoId: chosen });
    }
    draw(answer);
  };
  load();
}

function drawPlayer(body, history, { h, fill, reload }) {
  const a = analyse(history);
  const be = history.be;
  const section = (title, ...children) => (children.flat().some(Boolean) ? h('section', { class: 'analysis-part' }, h('h3', { class: 'part-title' }, title), ...children) : null);
  const table = (cls, head, rows) => h('div', { class: 'table-scroll' },
    h('table', { class: `data-table ${cls}` },
      h('thead', {}, h('tr', {}, head.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows)));
  const num = (v) => h('td', { class: 'num' }, v);
  const disc = (d) => t(`disc.${d}`);
  const discs = DISCIPLINES.filter((d) => a.disciplines[d]);
  const rankOf = (d) => be?.rankings?.find((r) => beDiscipline(r.event) === d);

  // Who, and where the numbers come from.
  const head = h('div', { class: 'analysis-head' },
    h('div', {},
      h('p', { class: 'analysis-name' }, history.name),
      h('p', { class: 'muted' }, [history.county, history.ratingsDate ? t('analysis.ratingsOn', { date: day(history.ratingsDate) }) : null].filter(Boolean).join(' · '))),
    h('div', { class: 'analysis-links' },
      h('a', { class: 'link-button', href: history.url, target: '_blank', rel: 'noopener' }, 'badminfo ↗'),
      be ? h('a', { class: 'link-button', href: be.url, target: '_blank', rel: 'noopener' }, t('analysis.beLink')) : null,
      h('button', { type: 'button', class: 'small-button', onclick: reload }, h('span', { 'aria-hidden': 'true' }, '↻ '), t('analysis.refresh'))));

  if (!history.matches.length) {
    fill(body, head, h('p', { class: 'empty' }, t('analysis.noMatches')));
    return;
  }

  // One card per discipline: grade, rating and how it has moved, record, national rank.
  const trend = (n) => (n === null ? h('span', { class: 'muted' }, '–')
    : h('span', { class: n > 0 ? 'up' : n < 0 ? 'down' : '' }, n > 0 ? '▲ ' : n < 0 ? '▼ ' : '', signed(n)));
  const tiles = h('div', { class: 'analysis-tiles' }, discs.map((d) => {
    const x = a.disciplines[d];
    const rank = rankOf(d);
    return h('div', { class: 'analysis-tile' },
      h('p', { class: 'tile-title' }, h('span', { class: `disc-swatch sw-${d}`, 'aria-hidden': 'true' }), disc(d),
        a.grades.current[d] ? h('span', { class: 'tile-grade' }, t('grade.n', { grade: a.grades.current[d] })) : null),
      h('p', { class: 'tile-rating' }, x.rating ?? '–', h('span', { class: 'tile-unit' }, t('analysis.rating'))),
      h('dl', { class: 'tile-facts' },
        h('dt', {}, t('analysis.last90')), h('dd', {}, trend(x.change90)),
        h('dt', {}, t('analysis.sinceStart', { date: day(x.since, { month: 'short', year: 'numeric' }) })), h('dd', {}, trend(x.changeAll)),
        x.peak ? [h('dt', {}, t('analysis.peak')), h('dd', {}, `${x.peak.rating} · ${day(x.peak.date)}`)] : null,
        h('dt', {}, t('analysis.record')), h('dd', {}, x.played ? `${wl(x)} (${pct(x.pct)})` : '–'),
        rank ? [h('dt', {}, t('analysis.nationalRank')), h('dd', {}, `#${rank.rank}`)] : null));
  }));

  const insights = a.insights.length
    ? h('ul', { class: 'analysis-insights' }, a.insights.map((m) => h('li', {}, t(m.key, wordParams(m.params)))))
    : null;

  const form = h('div', { class: 'analysis-form' },
    h('p', { class: 'form-chips' }, a.form.map((m) => h('span', {
      class: `form-chip ${m.won ? 'win' : 'loss'}`,
      title: `${day(m.date)} · ${m.tournament} · ${m.event} ${m.round} · ${t('analysis.vs', { names: names(m.opponents) })} · ${scoreText(m)}`,
    }, t(m.won ? 'analysis.w' : 'analysis.l')))),
    h('p', { class: 'muted' },
      a.streak?.n >= 2 ? [t(a.streak.won ? 'analysis.streakWon' : 'analysis.streakLost', { n: a.streak.n }), ' · '] : null,
      t('analysis.overall', { record: wl(a.overall), pct: pct(a.overall.pct) })));

  // Against badminfo's own expectations: its win chance before each match.
  const expRow = (label, e) => h('tr', {}, h('th', { scope: 'row' }, label), num(e.matches), num(e.expected), num(e.actual),
    h('td', { class: `num ${e.diff > 0 ? 'up' : e.diff < 0 ? 'down' : ''}` }, signed(e.diff)));
  const expectation = a.expectation.matches ? [
    h('p', { class: 'muted' }, t('analysis.expectationNote')),
    table('analysis-exp', [t('analysis.discipline'), t('analysis.matches'), t('analysis.expected'), t('analysis.actual'), t('analysis.difference')],
      [...discs.filter((d) => a.disciplines[d].expectation.matches).map((d) => expRow(disc(d), a.disciplines[d].expectation)), expRow(t('analysis.total'), a.expectation)]),
    table('analysis-bands', [t('analysis.when'), t('analysis.record'), t('analysis.won')],
      ['underdog', 'even', 'favourite'].filter((b) => a.chance[b].played).map((b) => h('tr', {},
        h('th', { scope: 'row' }, t(`analysis.band.${b}`)), num(wl(a.chance[b])), num(pct(a.chance[b].pct))))),
  ] : null;

  const surpriseList = (list, empty) => (list.length ? h('ul', { class: 'analysis-list' }, list.map((m) => h('li', {},
    h('strong', {}, t('analysis.vs', { names: names(m.opponents) })), ' ', h('span', { class: 'score' }, scoreText(m)),
    h('br'), h('span', { class: 'muted' }, `${day(m.date)} · ${m.tournament} · ${m.event} ${m.round} · ${t('analysis.chance', { pct: chance(m.winChance) })}`))))
    : h('p', { class: 'muted' }, empty));
  const surprises = h('div', { class: 'analysis-grid' },
    h('div', {}, h('h4', { class: 'sub-title' }, t('analysis.bestWins')), surpriseList(a.surprises.wins, t('analysis.noUpsets'))),
    h('div', {}, h('h4', { class: 'sub-title' }, t('analysis.toughLosses')), surpriseList(a.surprises.losses, t('analysis.noShocks'))));

  const c = a.close;
  const close = h('dl', { class: 'analysis-facts' },
    h('dt', {}, t('analysis.deciding')), h('dd', {}, c.deciding.played ? `${wl(c.deciding)} (${pct(c.deciding.pct)})` : '–'),
    h('dt', {}, t('analysis.tight')), h('dd', {}, `${wl(c.tight)}`),
    h('dt', {}, t('analysis.games')), h('dd', {}, `${wl(c.games)}`),
    h('dt', {}, t('analysis.points')), h('dd', {}, c.points.won + c.points.lost ? `${c.points.won}–${c.points.lost} (${pct(c.points.pct)})` : '–'));

  const splitTable = (title, rows, label) => (rows.length > 1 ? h('div', {},
    h('h4', { class: 'sub-title' }, title),
    table('analysis-split', ['', t('analysis.record'), t('analysis.won')],
      rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, label(r.key)), num(wl(r)), num(pct(r.pct)))))) : null);
  const splits = h('div', { class: 'analysis-grid three' },
    splitTable(t('analysis.byLevel'), a.levels, (k) => t(`analysis.level.${k}`)),
    splitTable(t('analysis.byStage'), a.stages, (k) => t(`analysis.stage.${k}`)),
    splitTable(t('analysis.byYear'), a.years, (k) => k));

  // Grades: the history from badminfo, and the grading period's prediction beside BE's qualifying matches.
  const timeline = h('ul', { class: 'analysis-list' }, DISCIPLINES.filter((d) => a.grades.timeline[d].length).map((d) => h('li', {},
    h('strong', {}, disc(d)), ': ',
    a.grades.timeline[d].map((g, i) => [i ? ' → ' : '', h('span', { class: 'grade-step' }, g.grade), ' ', h('span', { class: 'muted' }, `(${day(g.since)})`)]))));
  const outlook = a.grades.outlook;
  const qm = (d) => be?.grading?.find((g) => beDiscipline(g.event) === d);
  const gradeTable = outlook ? [
    h('p', { class: 'muted' }, t('analysis.period', { from: day(outlook.start), to: day(outlook.end) })),
    table('analysis-period', [t('analysis.discipline'), t('analysis.gradeFrom'), t('analysis.predicted'), t('analysis.qualifying'), be?.grading?.length ? t('analysis.beQualifying') : null].filter(Boolean),
      DISCIPLINES.filter((d) => outlook.disciplines[d]).map((d) => {
        const g = outlook.disciplines[d];
        const q = qm(d);
        return h('tr', {},
          h('th', { scope: 'row' }, disc(d)),
          num(g.from),
          h('td', { class: `num ${g.move === 'same' ? '' : 'up'}` }, g.best === g.worst ? g.best : `${g.worst}–${g.best}`, ' ', h('span', { class: 'muted' }, t(`analysis.move.${g.move}`))),
          num(g.matches ? t('analysis.wonOf', { won: g.won, played: g.matches }) : '0'),
          be?.grading?.length ? num(q ? wl(q) : '–') : null);
      })),
    h('p', { class: 'muted small' }, t('analysis.gradeNote')),
  ] : null;

  const beBlock = be ? [
    be.rankings?.length ? [
      h('h4', { class: 'sub-title' }, t('analysis.ranking', { week: be.week })),
      table('analysis-ranking', [t('analysis.event'), t('analysis.rank'), t('analysis.rankPoints'), t('analysis.ratingHead')],
        be.rankings.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.event), num(`#${r.rank}`), num(r.points ?? '–'), num(r.rating ?? '–')))),
    ] : null,
    Object.keys(be.winLoss ?? {}).length ? [
      h('h4', { class: 'sub-title' }, t('analysis.beWinLoss')),
      table('analysis-split', ['', t('analysis.career'), t('analysis.thisYear')],
        ['total', ...DISCIPLINES].filter((k) => be.winLoss[k]).map((k) => h('tr', {},
          h('th', { scope: 'row' }, k === 'total' ? t('analysis.total') : disc(k)),
          num(be.winLoss[k].career ? wl(be.winLoss[k].career) : '–'),
          num(be.winLoss[k].year ? wl(be.winLoss[k].year) : '–')))),
    ] : null,
  ] : history.beId ? h('p', { class: 'muted' }, t('analysis.beUnavailable')) : null;

  const partners = a.partners.length ? table('analysis-people', [t('analysis.partner'), t('analysis.discipline'), t('analysis.matches'), t('analysis.record'), t('analysis.won')],
    a.partners.map((p) => h('tr', {}, h('th', { scope: 'row' }, p.names.join(' / ')), h('td', {}, p.disciplines.map(disc).join(', ')),
      num(p.played), num(wl(p)), num(pct(p.pct))))) : null;
  const rivals = a.rivals.length ? table('analysis-people', [t('analysis.opponent'), t('analysis.discipline'), t('analysis.matches'), t('analysis.record'), t('analysis.lastMet')],
    a.rivals.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.names.join(' / ')), h('td', {}, disc(r.discipline)),
      num(r.played), num(wl(r)), h('td', {}, day(r.last))))) : null;

  const medals = a.medals.list.length ? [
    h('p', {}, t('analysis.medalCount', { winner: a.medals.winner, runnerUp: a.medals.runnerUp })),
    table('analysis-medals', [t('analysis.date'), t('analysis.tournament'), t('analysis.event'), t('analysis.place')],
      a.medals.list.map((m) => h('tr', {}, h('td', {}, day(m.date)), h('td', {}, m.tournament),
        h('td', {}, m.partner ? `${m.event} (${m.partner})` : m.event),
        h('td', {}, h('span', { class: `medal medal-${m.place}`, 'aria-hidden': 'true' }), t(`analysis.place.${m.place}`))))),
  ] : null;

  const changeText = (change) => DISCIPLINES.filter((d) => d in change).map((d) => `${t(`analysis.short.${d}`)} ${signed(change[d])}`).join(' · ');
  const tournaments = table('analysis-tournaments', [t('analysis.date'), t('analysis.tournament'), t('analysis.levelHead'), t('analysis.record'), t('analysis.ratingChange')],
    a.tournaments.map((x) => h('tr', {},
      h('td', { class: 'nowrap' }, day(x.date)),
      h('td', {}, x.id ? h('a', { href: `https://badminfo.com/Tournament/${x.id}`, target: '_blank', rel: 'noopener' }, x.name) : x.name,
        x.events.length ? h('span', { class: 'muted small' }, ` · ${x.events.join(', ')}`) : null),
      h('td', {}, t(`analysis.level.${x.level}`)),
      num(x.played ? wl(x) : '–'),
      h('td', { class: 'nowrap' }, changeText(x.change) || '–'))));

  fill(body,
    head,
    tiles,
    section(t('analysis.findings'), insights),
    section(t('analysis.ratingOverTime'), ratingChart(a.series, h)),
    section(t('analysis.form'), form),
    section(t('analysis.vsExpectation'), expectation),
    section(t('analysis.surprises'), surprises),
    section(t('analysis.closeMatches'), close, h('p', { class: 'muted small' }, t('analysis.tightNote'))),
    section(t('analysis.splits'), splits),
    section(t('analysis.grades'), timeline, gradeTable),
    section(t('analysis.be'), beBlock),
    section(t('analysis.partners'), partners),
    section(t('analysis.rivals'), rivals),
    section(t('analysis.medals'), medals),
    section(t('analysis.tournaments'), tournaments),
    h('p', { class: 'muted small analysis-sources' }, t('analysis.sources')));
}

/** Turns an insight's parameters into words: disciplines named, dates written out. */
function wordParams(params) {
  const out = { ...params };
  if (out.discipline) out.discipline = t(`discIn.${out.discipline}`);
  if (out.date) out.date = day(out.date);
  if ('pct' in out) out.pct = pct(out.pct);
  return out;
}

/**
 * Each discipline's rating over time, as an SVG line chart with the latest
 * value labelled at each line's end, a legend, and a crosshair that shows every
 * discipline's rating on the date under the pointer.
 */
function ratingChart(series, h) {
  const discs = DISCIPLINES.filter((d) => series[d]?.length);
  if (!discs.length) return null;
  // Drawn narrower on phones, so the labels keep a readable size when the chart is scaled to fit.
  const narrow = window.matchMedia('(max-width: 599px)').matches;
  const W = narrow ? 360 : 640, H = narrow ? 240 : 260, L = 36, R = narrow ? 82 : 92, T = 14, B = 30;
  const ms = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const all = discs.flatMap((d) => series[d]);
  let x0 = Math.min(...all.map((p) => ms(p.date)));
  let x1 = Math.max(...all.map((p) => ms(p.date)));
  if (x1 - x0 < 30 * 86400000) { x0 -= 15 * 86400000; x1 += 15 * 86400000; }
  const lo = Math.min(...all.map((p) => p.rating));
  const hi = Math.max(...all.map((p) => p.rating));
  const step = [5, 10, 20, 25, 50, 100, 200].find((st) => (hi - lo) / st <= 5) ?? 500;
  const y0 = Math.floor((lo - 1) / step) * step;
  const y1 = Math.ceil((hi + 1) / step) * step;
  const X = (iso) => L + ((ms(iso) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);

  const grid = [];
  for (let v = y0; v <= y1; v += step) {
    grid.push(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'chart-grid' }),
      s('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'chart-axis' }, String(v)));
  }
  // Month ticks, thinned to at most six labels.
  const ticks = [];
  const start = new Date(x0);
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); d.getTime() <= x1; d.setUTCMonth(d.getUTCMonth() + 1)) ticks.push(d.toISOString().slice(0, 10));
  const every = Math.max(1, Math.ceil(ticks.length / (narrow ? 4 : 6)));
  const xTicks = ticks.filter((_, i) => i % every === 0).map((iso) => s('text', { x: X(iso), y: H - 8, 'text-anchor': 'middle', class: 'chart-axis' },
    day(iso, { month: 'short', year: '2-digit' })));

  const lines = discs.map((d) => s('path', {
    d: series[d].map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p.rating).toFixed(1)}`).join(''),
    class: `chart-line line-${d}`,
  }));
  // End labels: nudged apart so close ratings don't overlap.
  const ends = discs.map((d) => ({ d, p: series[d].at(-1), y: Y(series[d].at(-1).rating) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15);
  const labels = ends.map(({ d, p, y }) => [
    s('circle', { cx: X(p.date), cy: Y(p.rating), r: 4, class: `chart-dot line-${d}` }),
    s('text', { x: W - R + 10, y: y + 4, class: 'chart-label' }, `${t(`disc.${d}`)} ${p.rating}`),
  ]);

  const cross = s('line', { y1: T, y2: H - B, class: 'chart-cross', visibility: 'hidden' });
  const marks = discs.map((d) => s('circle', { r: 4, class: `chart-dot line-${d}`, visibility: 'hidden' }));
  const hit = s('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'chart-hit' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rating-chart', role: 'img',
    'aria-label': t('analysis.chartLabel', { list: discs.map((d) => `${t(`disc.${d}`)} ${series[d][0].rating} → ${series[d].at(-1).rating}`).join(', ') }) },
  grid, xTicks, lines, labels, cross, marks, hit);
  const tip = h('div', { class: 'rating-tip', hidden: true });
  const dates = [...new Set(all.map((p) => p.date))].sort();
  const valueOn = (d, iso) => series[d].findLast((p) => p.date <= iso);

  const move = (e) => {
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const iso = dates.reduce((best, dt) => (Math.abs(X(dt) - x) < Math.abs(X(best) - x) ? dt : best), dates[0]);
    cross.setAttribute('x1', X(iso));
    cross.setAttribute('x2', X(iso));
    cross.setAttribute('visibility', 'visible');
    const rows = [];
    discs.forEach((d, i) => {
      const p = valueOn(d, iso);
      if (!p) { marks[i].setAttribute('visibility', 'hidden'); return; }
      marks[i].setAttribute('cx', X(iso));
      marks[i].setAttribute('cy', Y(p.rating));
      marks[i].setAttribute('visibility', 'visible');
      rows.push(h('p', {}, h('span', { class: `disc-swatch sw-${d}`, 'aria-hidden': 'true' }), `${t(`disc.${d}`)} `, h('strong', {}, p.rating)));
    });
    tip.replaceChildren(h('p', { class: 'tip-date' }, day(iso)), ...rows);
    tip.hidden = false;
    const left = (X(iso) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left, 70), box.width - 70)}px`;
  };
  const leave = () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    marks.forEach((m) => m.setAttribute('visibility', 'hidden'));
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);

  return h('div', { class: 'rating-box' },
    h('p', { class: 'chart-legend' }, discs.map((d) => h('span', {}, h('span', { class: `disc-swatch sw-${d}`, 'aria-hidden': 'true' }), t(`disc.${d}`)))),
    h('div', { class: 'chart-wrap' }, svg, tip),
    h('p', { class: 'muted small' }, t('analysis.chartNote')));
}
