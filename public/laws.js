// The Laws page: a plain-language summary of the BWF Laws of Badminton. The
// diagrams are drawn here as SVG rather than taken from elsewhere, so their
// labels follow the chosen language and their colours follow the theme.

import { currentLocale, t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null && value !== false) el.setAttribute(key, value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

// Court measurements in metres, from the Laws (Law 1, Diagram A). The court is
// drawn upright: across is x, along is y, and the net runs across the middle.
const LENGTH = 13.4;
const WIDTH = 6.1;
const SINGLES_INSET = 0.46; // singles side line, inside the doubles one
const SHORT = 1.98; // short service line, from the net
const LONG_INSET = 0.76; // doubles long service line, inside the back line
const NET = LENGTH / 2;
const K = 50; // drawing units per metre
const u = (m) => m * K;

const metres = (m) => `${new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 2 }).format(m)} m`;

// The page remembers its toggles while it is open.
const state = { rally: 'doubles', serveEvent: 'singles', serveScore: 'even' };

function area(x1, y1, x2, y2, cls) {
  return s('rect', { class: cls, x: u(x1), y: u(y1), width: u(x2 - x1), height: u(y2 - y1) });
}

function line(x1, y1, x2, y2) {
  return s('line', { x1: u(x1), y1: u(y1), x2: u(x2), y2: u(y2) });
}

function courtLines() {
  return s('g', { class: 'court-lines' },
    area(0, 0, WIDTH, LENGTH, null),
    line(SINGLES_INSET, 0, SINGLES_INSET, LENGTH),
    line(WIDTH - SINGLES_INSET, 0, WIDTH - SINGLES_INSET, LENGTH),
    line(0, NET - SHORT, WIDTH, NET - SHORT),
    line(0, NET + SHORT, WIDTH, NET + SHORT),
    line(0, LONG_INSET, WIDTH, LONG_INSET),
    line(0, LENGTH - LONG_INSET, WIDTH, LENGTH - LONG_INSET),
    line(WIDTH / 2, 0, WIDTH / 2, NET - SHORT),
    line(WIDTH / 2, NET + SHORT, WIDTH / 2, LENGTH));
}

/** The net, with its posts on the doubles side lines. */
function net() {
  return s('g', { class: 'court-net' },
    s('line', { x1: -8, y1: u(NET), x2: u(WIDTH) + 8, y2: u(NET) }),
    s('circle', { cx: 0, cy: u(NET), r: 5 }),
    s('circle', { cx: u(WIDTH), cy: u(NET), r: 5 }));
}

/** A measurement: a line with end ticks and its label beside it, in drawing units. */
function dimension(x1, y1, x2, y2, label, side = -1) {
  const vertical = x1 === x2;
  const tick = (x, y) => (vertical ? s('line', { x1: x - 6, y1: y, x2: x + 6, y2: y }) : s('line', { x1: x, y1: y - 6, x2: x, y2: y + 6 }));
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const text = vertical
    ? s('text', { x: mx + side * 10, y: my, transform: `rotate(-90 ${mx + side * 10} ${my})`, 'text-anchor': 'middle', 'dominant-baseline': side < 0 ? 'auto' : 'hanging' }, label)
    : s('text', { x: mx, y: my + side * 10, 'text-anchor': 'middle', 'dominant-baseline': side < 0 ? 'auto' : 'hanging' }, label);
  return s('g', { class: 'dimension' }, s('line', { x1, y1, x2, y2 }), tick(x1, y1), tick(x2, y2), text);
}

function marker(x, y, n) {
  return s('g', { class: 'marker' }, s('circle', { cx: u(x), cy: u(y), r: 13 }), s('text', { x: u(x), y: u(y), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, n));
}

// Numbered lines on the court diagram, matched by the key beside it.
const LINE_KEYS = ['laws.lineNet', 'laws.lineShort', 'laws.lineLong', 'laws.lineBack', 'laws.lineCentre', 'laws.lineSingles', 'laws.lineDoubles'];
const LINE_MARKERS = [
  [WIDTH * 0.25, NET], [WIDTH * 0.75, NET + SHORT], [WIDTH * 0.75, LENGTH - LONG_INSET], [WIDTH * 0.25, LENGTH],
  [WIDTH / 2, NET + SHORT + 2.4], [WIDTH - SINGLES_INSET, NET - 3.2], [0, NET - 3.2],
];

function courtDiagram() {
  const ml = 64;
  const mt = 52;
  const singles = state.rally === 'singles';
  // In singles the strips outside the singles side lines are out: striped.
  const out = (x1, x2) => s('rect', { x: u(x1), y: 0, width: u(x2 - x1), height: u(LENGTH), fill: 'url(#out-stripes)' });
  return s('svg', { class: 'law-svg court-svg', viewBox: `0 0 ${ml + u(WIDTH) + 76} ${mt + u(LENGTH) + 56}`, role: 'img', 'aria-label': t('laws.courtAlt') },
    s('defs', {}, s('pattern', { id: 'out-stripes', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 10, height: 10, class: 'out-shade' }), s('line', { x1: 0, y1: 0, x2: 0, y2: 10, class: 'out-line' }))),
    s('g', { transform: `translate(${ml} ${mt})` },
      area(0, 0, WIDTH, LENGTH, 'court-surface'),
      singles ? [out(0, SINGLES_INSET), out(WIDTH - SINGLES_INSET, WIDTH)] : null,
      courtLines(),
      net(),
      LINE_MARKERS.map(([x, y], i) => marker(x, y, i + 1))),
    dimension(ml, mt - 22, ml + u(WIDTH), mt - 22, metres(WIDTH)),
    dimension(ml + u(SINGLES_INSET), mt + u(LENGTH) + 22, ml + u(WIDTH - SINGLES_INSET), mt + u(LENGTH) + 22, metres(WIDTH - 2 * SINGLES_INSET), 1),
    dimension(ml - 22, mt, ml - 22, mt + u(LENGTH), metres(LENGTH)),
    dimension(ml + u(WIDTH) + 22, mt + u(NET), ml + u(WIDTH) + 22, mt + u(NET + SHORT), metres(SHORT), 1),
    dimension(ml + u(WIDTH) + 22, mt + u(LENGTH - LONG_INSET), ml + u(WIDTH) + 22, mt + u(LENGTH), metres(LONG_INSET), 1));
}

/**
 * Where the server and receiver stand. The server is in the near half, facing
 * the net, so their right service court is on the right of the picture; the
 * receiver faces them, so theirs is diagonally opposite.
 */
function serviceDiagram() {
  const doubles = state.serveEvent === 'doubles';
  const even = state.serveScore === 'even';
  const side = doubles ? 0 : SINGLES_INSET;
  const back = doubles ? LONG_INSET : 0;
  // Even score: the server's court is the right half; odd: the left half.
  const [sx1, sx2] = even ? [WIDTH / 2, WIDTH - side] : [side, WIDTH / 2];
  const [rx1, rx2] = even ? [side, WIDTH / 2] : [WIDTH / 2, WIDTH - side];
  const server = [(sx1 + sx2) / 2, NET + SHORT + 1.1];
  const receiver = [(rx1 + rx2) / 2, NET - SHORT - 1.3];
  const person = ([x, y], letter, cls) => s('g', { class: `person ${cls}` },
    s('circle', { cx: u(x), cy: u(y), r: 17 }), s('text', { x: u(x), y: u(y), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, letter));
  const m = 24;
  const landing = [receiver[0], NET - SHORT - 0.9];
  return s('svg', { class: 'law-svg service-svg', viewBox: `0 0 ${u(WIDTH) + 2 * m} ${u(LENGTH) + 2 * m}`, role: 'img', 'aria-label': t(even ? 'laws.serveEven' : 'laws.serveOdd') },
    s('defs', {}, s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
      s('path', { d: 'M0 0 L10 5 L0 10 z', class: 'arrow-head' }))),
    s('g', { transform: `translate(${m} ${m})` },
      area(0, 0, WIDTH, LENGTH, 'court-surface'),
      area(sx1, NET + SHORT, sx2, LENGTH - back, 'court-from'),
      area(rx1, back, rx2, NET - SHORT, 'court-hl'),
      courtLines(),
      net(),
      s('path', { class: 'serve-path', d: `M${u(server[0])} ${u(server[1]) - 18} Q${u(WIDTH / 2)} ${u(NET) - 40} ${u(landing[0])} ${u(landing[1])}`, 'marker-end': 'url(#arrow)' }),
      doubles ? [person([(WIDTH - server[0]), LENGTH - 2], t('laws.partnerShort'), 'partner'), person([(WIDTH - receiver[0]), 2], t('laws.partnerShort'), 'partner')] : null,
      person(server, t('laws.serverShort'), 'server'),
      person(receiver, t('laws.receiverShort'), 'receiver')));
}

/** Side view: the whole shuttle must be below 1.15 m when the server hits it. */
function heightDiagram() {
  const floor = 200;
  const limit = floor - 115; // 1 m = 100 units
  const shuttle = (x, y, ok) => s('g', { class: `shuttle ${ok ? 'ok' : 'bad'}` },
    s('path', { d: `M${x - 13} ${y - 30} L${x + 13} ${y - 30} L${x + 6} ${y - 4} L${x - 6} ${y - 4} Z`, class: 'skirt' }),
    s('circle', { cx: x, cy: y + 2, r: 7, class: 'cork' }),
    // the racket, swinging up from below
    s('ellipse', { cx: x - 30, cy: y + 18, rx: 14, ry: 22, transform: `rotate(-50 ${x - 30} ${y + 18})`, class: 'racket' }),
    s('line', { x1: x - 44, y1: y + 33, x2: x - 80, y2: y + 62, class: 'racket' }),
    s('text', { x, y: floor + 26, 'text-anchor': 'middle', class: 'verdict' }, `${ok ? '✓' : '✕'} ${t(ok ? 'laws.legal' : 'laws.fault')}`));
  return s('svg', { class: 'law-svg height-svg', viewBox: '0 0 460 240', role: 'img', 'aria-label': t('laws.heightAlt') },
    s('line', { class: 'floor', x1: 10, y1: floor, x2: 450, y2: floor }),
    s('line', { class: 'limit', x1: 70, y1: limit, x2: 450, y2: limit }),
    dimension(40, limit, 40, floor, metres(1.15)),
    shuttle(200, limit + 50, true),
    shuttle(370, limit - 4, false));
}

/** Close-up of a boundary line: a shuttle landing on the line is in. */
function inOutDiagram() {
  const lineX = 230;
  const base = (x, ok) => s('g', { class: `landing ${ok ? 'ok' : 'bad'}` },
    s('circle', { cx: x, cy: 70, r: 15, class: 'cork' }),
    s('text', { x, y: 122, 'text-anchor': 'middle', class: 'verdict' }, `${ok ? '✓' : '✕'} ${t(ok ? 'laws.in' : 'laws.out')}`));
  return s('svg', { class: 'law-svg inout-svg', viewBox: '0 0 460 140', role: 'img', 'aria-label': t('laws.inOutAlt') },
    s('rect', { class: 'court-surface', x: 10, y: 20, width: lineX - 10, height: 80 }),
    s('rect', { class: 'outside', x: lineX + 20, y: 20, width: 440 - lineX - 20, height: 80 }),
    s('rect', { class: 'boundary', x: lineX, y: 20, width: 20, height: 80 }),
    s('text', { x: 20, y: 38, class: 'area-label on-court' }, t('laws.inside')),
    s('text', { x: 440, y: 38, class: 'area-label', 'text-anchor': 'end' }, t('laws.outside')),
    base(130, true), base(lineX + 18, true), base(360, false));
}

export function renderLaws(view, { h, fill, setTitle }) {
  setTitle(t('laws.docTitle'));
  const toggle = (key, value, label, redraw) => h('button', {
    type: 'button', class: 'chip-button', 'aria-pressed': String(state[key] === value),
    onclick: () => { state[key] = value; redraw(); },
  }, label);
  const list = (keys) => h('ul', {}, keys.map((k) => h('li', {}, t(k))));
  const figure = (id, ...children) => h('figure', { class: 'law-figure', id }, ...children);

  const courtBox = h('div');
  const drawCourt = () => fill(courtBox,
    h('div', { class: 'law-toggles' },
      toggle('rally', 'singles', t('disc.singles'), drawCourt), toggle('rally', 'doubles', t('disc.doubles'), drawCourt)),
    courtDiagram(),
    h('figcaption', {}, t(state.rally === 'singles' ? 'laws.rallySingles' : 'laws.rallyDoubles')),
    h('ol', { class: 'line-key' }, LINE_KEYS.map((k, i) => h('li', {}, h('span', { class: 'key-num', 'aria-hidden': 'true' }, i + 1), t(k)))));
  drawCourt();

  const serveBox = h('div');
  const drawServe = () => fill(serveBox,
    h('div', { class: 'law-toggles' },
      toggle('serveEvent', 'singles', t('disc.singles'), drawServe), toggle('serveEvent', 'doubles', t('disc.doubles'), drawServe)),
    h('div', { class: 'law-toggles' },
      toggle('serveScore', 'even', t('laws.even'), drawServe), toggle('serveScore', 'odd', t('laws.odd'), drawServe)),
    serviceDiagram(),
    h('figcaption', {}, t(state.serveScore === 'even' ? 'laws.serveEven' : 'laws.serveOdd')),
    h('p', { class: 'muted law-legend' },
      h('span', { class: 'legend-swatch from' }), t('laws.legendFrom'), ' ',
      h('span', { class: 'legend-swatch to' }), t('laws.legendTo'), ' ',
      t(state.serveEvent === 'doubles' ? 'laws.legendPeopleDoubles' : 'laws.legendPeople')));
  drawServe();

  const row = (label, now, next) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, now), h('td', {}, next));
  const all = (n) => t('laws.allScore', { n });

  fill(view,
    h('h2', { class: 'section-title' }, t('laws.title')),
    h('p', { class: 'lede-small' }, t('laws.lede')),
    h('p', { class: 'callout' }, h('strong', {}, t('laws.change2027Title')), ' ', t('laws.change2027')),

    h('section', { class: 'law-section law-split' },
      h('div', { class: 'prose' },
        h('h3', { class: 'sub-title' }, t('laws.courtTitle')),
        list(['laws.court1', 'laws.court2', 'laws.court3'])),
      figure('law-court', courtBox)),

    h('section', { class: 'law-section' },
      h('h3', { class: 'sub-title' }, t('laws.scoringTitle')),
      h('div', { class: 'prose' }, list(['laws.score1', 'laws.score2', 'laws.score3', 'laws.score4', 'laws.score5', 'laws.score6']),
        h('p', { class: 'score-example' }, t('laws.scoreExample'))),
      h('div', { class: 'table-scroll law-table' }, h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), h('th', { scope: 'col' }, t('laws.colNow')), h('th', { scope: 'col' }, t('laws.colNew')))),
        h('tbody', {},
          row(t('laws.rowPoints'), '21', '15'),
          row(t('laws.rowSetting'), all(20), all(14)),
          row(t('laws.rowCap'), t('laws.capValue', { all: all(29), n: 30 }), t('laws.capValue', { all: all(20), n: 21 })),
          row(t('laws.rowInterval'), t('laws.leaderReaches', { n: 11 }), t('laws.leaderReaches', { n: 8 })),
          row(t('laws.rowEnds'), t('laws.sideReaches', { n: 11 }), t('laws.sideReaches', { n: 8 })),
          row(t('laws.rowBetween'), t('laws.upTo', { n: 120 }), t('laws.upTo', { n: 120 }))))),
      h('p', { class: 'muted law-note' }, t('laws.beNote'))),

    h('section', { class: 'law-section law-split' },
      h('div', { class: 'prose' },
        h('h3', { class: 'sub-title' }, t('laws.serviceTitle')),
        list(['laws.serve1', 'laws.serve2', 'laws.serve3', 'laws.serve4', 'laws.serve5', 'laws.serve6', 'laws.serve7'])),
      figure('law-height', heightDiagram(), h('figcaption', {}, t('laws.heightCaption')))),

    h('section', { class: 'law-section law-split' },
      h('div', { class: 'prose' },
        h('h3', { class: 'sub-title' }, t('laws.courtsTitle')),
        list(['laws.courts1', 'laws.courts2', 'laws.courts3']),
        h('h4', {}, t('laws.singlesTitle')),
        list(['laws.singles1', 'laws.singles2']),
        h('h4', {}, t('laws.doublesTitle')),
        list(['laws.doubles1', 'laws.doubles2', 'laws.doubles3', 'laws.doubles4'])),
      figure('law-serve', serveBox)),

    h('section', { class: 'law-section law-split' },
      h('div', { class: 'prose' },
        h('h3', { class: 'sub-title' }, t('laws.inOutTitle')),
        list(['laws.inOut1', 'laws.inOut2'])),
      figure('law-inout', inOutDiagram())),

    h('section', { class: 'law-section prose' },
      h('h3', { class: 'sub-title' }, t('laws.faultsTitle')),
      h('p', {}, t('laws.faultsIntro')),
      list(['laws.fault1', 'laws.fault2', 'laws.fault3', 'laws.fault4', 'laws.fault5', 'laws.fault6', 'laws.fault7', 'laws.fault8']),
      h('h3', { class: 'sub-title' }, t('laws.letsTitle')),
      h('p', {}, t('laws.letsIntro')),
      list(['laws.let1', 'laws.let2', 'laws.let3', 'laws.let4', 'laws.let5', 'laws.let6']),
      h('h3', { class: 'sub-title' }, t('laws.endsTitle')),
      list(['laws.ends1', 'laws.ends2', 'laws.ends3'])),

    h('section', { class: 'sources' },
      h('h4', {}, t('laws.sourcesTitle')),
      h('ul', {},
        h('li', {}, h('a', { href: 'https://corporate.bwfbadminton.com/statutes/', rel: 'noopener' }, t('laws.source1'))),
        h('li', {}, h('a', { href: 'https://corporate.bwfbadminton.com/news-single/2026/05/08/members-forum-2026-bwf-agm-2026-follow-up-agm-decisions-agm-voting-record/', rel: 'noopener' }, t('laws.source2')))),
      h('p', { class: 'muted' }, t('laws.sourceNote'))));
}
