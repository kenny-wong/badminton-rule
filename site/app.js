import { DISCIPLINES, GRADES, JUNIOR_AGE_GROUPS, SEASON, checkEligibility, gradeChartRows, juniorAgeGroup, parseDate } from './eligibility.js';
import { LOCALES, currentLocale, initialLocale, setLocale, t, tParts, td } from './i18n.js';
import { CAPS, SCORING_PRESETS, exampleScores, gameWinner, matchWinner, openGameCount, pairings, qualification, qualificationDetail, rankGroup } from './groups.js';
import { loadProfiles, newProfile, saveProfiles } from './profiles.js';

const view = document.getElementById('view');
const searchInput = document.getElementById('search');

const STATUS_ICONS = { yes: '✓', partial: '◐', no: '✕', info: 'i' };

let data;
let tierById;
let groupsByArea; // areaId -> rules with identical wording merged, in tier order
let lastBrowseRoute = '#/grades';
let profiles = loadProfiles();

const nodes = (children) => children.flat(Infinity).filter((c) => c != null && c !== false);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...nodes(children));
  return el;
}

function fill(el, ...children) {
  el.replaceChildren(...nodes(children));
}

/** "A, B and C" (or "A、B 及 C"): separators between items, the conjunction before the last. */
function joinList(items, conjunction = 'list.and') {
  if (items.length < 2) return items.join('');
  return items.slice(0, -1).join(t('list.sep')) + t(conjunction) + items.at(-1);
}

function setTitle(first) {
  document.title = `${first} · ${t('site.docSuffix')}`;
}

/** Words an eligibility message ({ key, params }) in the current language. */
function say(message) {
  if (!message) return '';
  const params = { ...message.params };
  if ('grade' in params) params.gradeLabel = params.grade ? t('grade.n', { grade: params.grade }) : t('grade.ungraded');
  if (params.disciplines) params.disciplines = joinList(params.disciplines.map((d) => t(`discIn.${d}`)), 'list.or');
  if (params.groups) params.range = params.groups.length > 1 ? t('range', { from: params.groups[0], to: params.groups.at(-1) }) : params.groups[0];
  return t(message.key, params);
}

function translatedNote() {
  return currentLocale() === 'en' ? null : h('p', { class: 'translated-note' }, t('site.translated'));
}

// The PDF sometimes repeats the same wording in separate cells (e.g. entry fees),
// so tiers are grouped by identical text rather than by merged cell.
function buildGroups() {
  const tierOrder = (id) => data.tiers.findIndex((t) => t.id === id);
  return new Map(data.areas.map((area) => {
    const groups = new Map();
    for (const rule of data.rules.filter((r) => r.areas.includes(area.id))) {
      const key = rule.text.join('\n');
      const group = groups.get(key) ?? { text: rule.text, tiers: [], areas: rule.areas };
      group.tiers.push(...rule.tiers);
      groups.set(key, group);
    }
    const sorted = [...groups.values()];
    sorted.forEach((g) => g.tiers.sort((a, b) => tierOrder(a) - tierOrder(b)));
    sorted.sort((a, b) => tierOrder(a.tiers[0]) - tierOrder(b.tiers[0]));
    return [area.id, sorted];
  }));
}

function ruleFor(tierId, areaId) {
  return groupsByArea.get(areaId).find((g) => g.tiers.includes(tierId));
}

function areaLabel(areaId) {
  return td(data.areas.find((a) => a.id === areaId).label);
}

function circuitLabel(circuit) {
  return td(circuit.label);
}

function tierPill(tierId, current) {
  const tier = tierById.get(tierId);
  return h('a', { class: `pill c-${tier.circuit}`, href: `#/tier/${tier.id}`, 'aria-current': tierId === current ? 'page' : null }, tier.name);
}

function ruleText(rule, highlight) {
  if (!rule.text.length) return h('p', { class: 'muted' }, t('rule.blank'));
  return rule.text.map((line) => h('p', {}, highlight ? highlight(td(line)) : td(line)));
}

function tierList(rule, tierId) {
  const others = rule.tiers.filter((t) => t !== tierId);
  const excluded = data.tiers.map((t) => t.id).filter((t) => !rule.tiers.includes(t));
  if (!excluded.length) return t('shared.every');
  if (excluded.length < others.length) return tParts('shared.except', { tiers: excluded.map((t) => tierPill(t)) });
  return others.length ? tParts('shared.same', { tiers: others.map((t) => tierPill(t)) }) : null;
}

function combinedNote(rule) {
  if (rule.areas.length < 2) return null;
  const labels = rule.areas.map(areaLabel).map((l) => (currentLocale() === 'en' ? l.toLowerCase() : l));
  return t('shared.combined', { areas: joinList(labels) });
}

function sharedNote(rule, tierId) {
  const notes = [tierList(rule, tierId), combinedNote(rule)].filter(Boolean);
  return notes.length ? h('div', { class: 'shared' }, notes.map((n) => h('span', {}, n))) : null;
}

function tierHeader(tierId) {
  const tier = tierById.get(tierId);
  return h('a', { href: `#/tier/${tier.id}` }, tier.name);
}

function table(className, headings, rows) {
  return h('div', { class: 'table-scroll' },
    h('table', { class: `data-table ${className}` },
      h('thead', {}, h('tr', {}, headings)),
      h('tbody', {}, rows)));
}

const CELL_ICONS = { allowed: '✓', conditional: '!', barred: '✕' };

function cellExplanation(row, grade) {
  const state = row.cells[grade];
  if (state === 'allowed') return t('cellTip.allowed', { grade });
  if (state === 'conditional') return t('cellTip.conditional', { grade, min: row.minimum });
  const worst = GRADES.filter((g) => row.cells[g] === 'barred').at(-1);
  return t('cellTip.barred', { grade, worst });
}

function rowName(row) {
  return row.note ? `${row.label} (${say(row.note)})` : row.label;
}

let tooltip;

// One floating tooltip for the whole chart, driven by event delegation.
function attachTooltip(chart) {
  tooltip ??= document.body.appendChild(h('div', { class: 'chart-tip', role: 'tooltip', hidden: true }));
  chart.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('td[data-tip]');
    if (!cell) return;
    tooltip.textContent = cell.dataset.tip;
    tooltip.hidden = false;
    const box = cell.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, box.left + box.width / 2 - tip.width / 2), window.innerWidth - tip.width - 8);
    const top = box.top - tip.height - 8 < 8 ? box.bottom + 8 : box.top - tip.height - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });
  chart.addEventListener('mouseleave', () => (tooltip.hidden = true));
}

function gradeSummary(rows, grade) {
  const groups = Object.keys(CELL_ICONS).map((state) => ({ state, rows: rows.filter((r) => r.cells[grade] === state) }));
  return h('section', { class: 'grade-summary', 'aria-live': 'polite' },
    h('h3', {}, t('grade.n', { grade })),
    groups.filter((g) => g.rows.length).map((g) =>
      h('div', { class: 'summary-group' },
        h('p', { class: 'summary-head' }, h('span', { class: `swatch cell-${g.state}`, 'aria-hidden': 'true' }, CELL_ICONS[g.state]), h('span', {}, t(`cell.${g.state}`), h('span', { class: 'count' }, ` (${g.rows.length})`))),
        h('ul', {}, g.rows.map((r) => h('li', {}, h('a', { href: `#/tier/${r.tier}` }, r.label), r.note ? h('span', { class: 'muted' }, ` · ${say(r.note)}`) : null))))));
}

function renderGrades(selected) {
  const grade = GRADES.includes(selected) ? selected : null;
  const rows = gradeChartRows();
  setTitle(grade ? t('grade.n', { grade }) : t('grades.docTitle'));

  const legend = h('ul', { class: 'legend', 'aria-label': t('grades.legendLabel') }, Object.entries(CELL_ICONS).map(([state, icon]) =>
    h('li', {}, h('span', { class: `swatch cell-${state}`, 'aria-hidden': 'true' }, icon), t(`cell.${state}`))));

  const picker = h('nav', { class: 'chips grade-picker', 'aria-label': t('grades.pickerLabel') },
    h('a', { href: '#/grades', 'aria-current': grade ? null : 'page' }, t('grades.all')),
    GRADES.map((g) => h('a', { href: `#/grades/${g}`, 'aria-current': g === grade ? 'page' : null }, g)));

  const body = data.circuits.map((c) => [
    h('tr', { class: 'group-row' }, h('th', { scope: 'colgroup', colspan: GRADES.length + 1 }, circuitLabel(c))),
    rows.filter((r) => r.circuit === c.id).map((r) => h('tr', { class: `c-${r.circuit}` },
      h('th', { scope: 'row' }, h('a', { href: `#/tier/${r.tier}` }, r.label), r.note ? h('span', { class: 'row-note' }, say(r.note)) : null),
      GRADES.map((g) => {
        const state = r.cells[g];
        return h('td', { class: `cell cell-${state}${grade && g !== grade ? ' dim' : ''}`, 'data-tip': `${rowName(r)} · ${cellExplanation(r, g)}` },
          h('span', { 'aria-hidden': 'true' }, CELL_ICONS[state]),
          h('span', { class: 'visually-hidden' }, t('cellSr', { grade: g, state: t(`cell.${state}`) })));
      }))),
  ]);

  const chart = h('table', { class: 'grade-chart' },
    h('caption', { class: 'visually-hidden' }, t('grades.title')),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'label-col' }, t('grades.tierCol')),
      GRADES.map((g) => h('th', { scope: 'col', class: g === grade ? 'selected' : null }, h('a', { href: `#/grades/${g === grade ? '' : g}` }, g))))),
    h('tbody', {}, body));
  attachTooltip(chart);

  fill(view,
    h('h2', { class: 'section-title' }, t('grades.title')),
    h('p', { class: 'lede-small' }, t('grades.lede')),
    picker,
    grade ? gradeSummary(rows, grade) : null,
    legend,
    h('div', { class: 'chart-box' }, chart),
    h('p', { class: 'muted chart-foot' }, tParts('grades.foot', { link: h('a', { href: '#/check' }, t('tab.check')) })));
}

function tierSelect(currentId) {
  const select = h('select', { id: 'tier-select', onchange: (e) => (location.hash = `#/tier/${e.target.value}`) },
    data.circuits.map((c) => h('optgroup', { label: circuitLabel(c) },
      data.tiers.filter((t) => t.circuit === c.id).map((t) => h('option', { value: t.id, selected: t.id === currentId }, t.name)))));
  return h('div', { class: 'tier-select' }, h('label', { for: 'tier-select' }, t('tier.label')), select);
}

function renderTier(tierId) {
  const tier = tierById.get(tierId) ?? data.tiers[0];
  const circuit = data.circuits.find((c) => c.id === tier.circuit);
  setTitle(tier.name);

  const nav = h('nav', { class: 'tier-nav', 'aria-label': t('tier.navLabel') },
    data.circuits.map((c) => h('div', { class: 'tier-group' },
      h('h2', {}, circuitLabel(c)),
      h('ul', {}, data.tiers.filter((t) => t.circuit === c.id).map((t) =>
        h('li', {}, h('a', { href: `#/tier/${t.id}`, class: `c-${t.circuit}`, 'aria-current': t.id === tier.id ? 'page' : null }, t.name)))))));

  const rows = data.areas.map((area) => {
    const rule = ruleFor(tier.id, area.id);
    return h('tr', { id: `area-${area.id}` },
      h('th', { scope: 'row' }, h('a', { href: `#/compare/${area.id}`, title: t('tier.compareTitle', { area: areaLabel(area.id) }) }, areaLabel(area.id))),
      h('td', {}, ruleText(rule), sharedNote(rule, tier.id)));
  });

  fill(view, h('div', { class: 'split' }, nav,
    h('section', { class: 'detail', 'aria-labelledby': 'tier-title' },
      tierSelect(tier.id),
      h('header', { class: `tier-head c-${tier.circuit}` },
        h('p', { class: 'eyebrow' }, circuitLabel(circuit)),
        h('h2', { id: 'tier-title' }, tier.name)),
      translatedNote(),
      table('rules', [h('th', { scope: 'col' }, t('tier.ruleArea')), h('th', { scope: 'col' }, t('tier.rule'))], rows))));
}

function renderCompare(areaId) {
  const area = data.areas.find((a) => a.id === areaId) ?? data.areas[0];
  setTitle(areaLabel(area.id));
  const rules = groupsByArea.get(area.id);
  const combined = (rule) => combinedNote(rule) && h('div', { class: 'shared' }, combinedNote(rule));

  fill(view,
    h('nav', { class: 'chips', 'aria-label': t('compare.navLabel') }, data.areas.map((a) =>
      h('a', { href: `#/compare/${a.id}`, 'aria-current': a.id === area.id ? 'page' : null }, areaLabel(a.id)))),
    h('h2', { class: 'section-title' }, areaLabel(area.id)),
    h('p', { class: 'muted' }, rules.length === 1 ? t('compare.one') : t('compare.many', { n: rules.length, total: data.tiers.length })),
    translatedNote(),
    table('compare', [h('th', { scope: 'col' }, t('compare.tiers')), h('th', { scope: 'col' }, t('tier.rule'))],
      rules.map((rule) => h('tr', {},
        h('td', { class: 'tiers-cell' }, rule.tiers.length === data.tiers.length ? h('span', { class: 'pill' }, t('compare.everyTier')) : rule.tiers.map((t) => tierPill(t))),
        h('td', {}, ruleText(rule), combined(rule))))));
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

// Tokens match at the start of a word; one- and two-character tokens (a grade
// letter, "KO") must be the whole word, so "E" finds "grade E" but not "fee".
// Chinese and Japanese have no spaces between words, so those tokens match anywhere.
function tokenSource(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (CJK.test(token)) return escaped;
  const end = token.length <= 2 ? '(?![\\p{L}\\p{N}])' : '';
  return `(?<![\\p{L}\\p{N}])${escaped}${end}`;
}

function highlighter(tokens) {
  if (!tokens.length) return null;
  const pattern = new RegExp(`(${tokens.map(tokenSource).join('|')})`, 'giu');
  return (text) => text.split(pattern).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

function renderSearch(query) {
  setTitle(t('search.docTitle'));
  const tokens = query.split(/\s+/).filter(Boolean);
  const patterns = tokens.map((t) => new RegExp(tokenSource(t), 'iu'));
  // A combined medals/prize rule appears under both areas; list it once.
  const unique = [...groupsByArea.values()].flat()
    .filter((g, i, all) => all.findIndex((o) => o.text === g.text && o.tiers.join() === g.tiers.join()) === i);
  // Search both the shown translation and the English original.
  const matches = unique.filter((rule) => {
    const haystack = [
      ...rule.text, ...rule.text.map(td),
      ...rule.areas.map((a) => data.areas.find((x) => x.id === a).label), ...rule.areas.map(areaLabel),
      ...rule.tiers.map((t) => tierById.get(t).name),
    ].join(' ');
    return patterns.every((p) => p.test(haystack));
  });
  const mark = highlighter(tokens);

  fill(view,
    h('h2', { class: 'section-title' }, matches.length === 1 ? t('search.countOne', { q: query })
      : matches.length ? t('search.countMany', { n: matches.length, q: query }) : t('search.none', { q: query })),
    matches.length ? translatedNote() : h('p', { class: 'muted' }, t('search.tip')),
    matches.length ? table('compare search', [h('th', { scope: 'col' }, t('tier.ruleArea')), h('th', { scope: 'col' }, t('compare.tiers')), h('th', { scope: 'col' }, t('tier.rule'))],
      matches.map((rule) => h('tr', {},
        h('th', { scope: 'row' }, rule.areas.map((a, i) => [i ? ' & ' : '', h('a', { href: `#/compare/${a}` }, areaLabel(a))])),
        h('td', { class: 'tiers-cell' }, rule.tiers.length === data.tiers.length ? h('span', { class: 'pill' }, t('compare.everyTier')) : rule.tiers.map((t) => tierPill(t))),
        h('td', {}, ruleText(rule, mark))))) : null);
}

function gradeOptions(selected) {
  return [
    h('option', { value: '' }, t('grade.ungraded')),
    GRADES.map((g) => h('option', { value: g, selected: selected === g }, t('grade.n', { grade: g }))),
  ];
}

function statusBadge(status) {
  return h('span', { class: `status s-${status}` }, h('span', { 'aria-hidden': 'true' }, STATUS_ICONS[status]), ` ${t(`status.${status}`)}`);
}

// A player opened from a shared #/check/<dob>/<singles>/<doubles>/<mixed> link.
// It joins the comparison but isn't saved unless the reader asks.
let linkedPlayer = null;

function shareHash(profile) {
  return `#/check/${profile.dob}/${DISCIPLINES.map((d) => profile.grades[d]).join('/')}`;
}

function sameAsSaved(candidate) {
  return profiles.some((p) => p.dob === candidate.dob && DISCIPLINES.every((d) => p.grades[d] === candidate.grades[d]));
}

function comparedPlayers() {
  return [...profiles, ...(linkedPlayer ? [linkedPlayer] : [])].filter((p) => parseDate(p.dob));
}

function persistProfiles() {
  const saved = saveProfiles(profiles);
  const warning = document.getElementById('save-warning');
  if (warning) warning.hidden = saved;
}

function profileName(profile) {
  if (profile.name) return profile.name;
  return profile === linkedPlayer ? t('players.fromLink') : t('players.unnamed');
}

function playerLine(profile) {
  const dob = parseDate(profile.dob);
  if (!dob) return t('players.needDob');
  const group = juniorAgeGroup(dob.year);
  return group ? t('players.bornGroup', { year: dob.year, group }) : t('players.born', { year: dob.year });
}

async function copyLink(profile, button) {
  const url = new URL(shareHash(profile), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = t('players.copied');
    setTimeout(() => (button.textContent = t('players.copyLink')), 2000);
  } catch {
    prompt(t('players.copyLink'), url); // clipboard blocked: let the reader copy it by hand
  }
}

function profileActions(profile) {
  if (profile === linkedPlayer) {
    return [
      h('span', { class: 'link-tag' }, t('players.fromLink')),
      h('button', { type: 'button', class: 'link-button', onclick: () => {
        profiles.push({ ...newProfile(profile.name || t('players.defaultName', { n: profiles.length + 1 })), dob: profile.dob, grades: { ...profile.grades } });
        linkedPlayer = null;
        persistProfiles();
        history.replaceState(null, '', '#/check');
        drawCheck();
      } }, t('players.save')),
      h('button', { type: 'button', class: 'link-button danger', onclick: () => {
        linkedPlayer = null;
        history.replaceState(null, '', '#/check');
        drawCheck();
      } }, t('players.remove')),
    ];
  }
  return [
    h('button', { type: 'button', class: 'link-button', onclick: (e) => copyLink(profile, e.currentTarget) }, t('players.copyLink')),
    h('button', { type: 'button', class: 'link-button danger', onclick: () => {
      if (!confirm(t('players.confirmRemove', { name: profile.name || t('players.thisPlayer') }))) return;
      profiles = profiles.filter((x) => x.id !== profile.id);
      persistProfiles();
      drawCheck();
    } }, t('players.remove')),
  ];
}

function profileRow(profile) {
  const linked = profile === linkedPlayer;
  const update = () => {
    if (linked) history.replaceState(null, '', shareHash(profile));
    else persistProfiles();
    renderPlayerComparison();
  };
  const label = (field) => t('players.fieldFor', { field, name: profile.name || t('players.thisPlayer') });
  return h('tr', { class: linked ? 'linked-row' : null },
    h('td', { class: 'f-name', 'data-label': t('players.name') }, h('input', { type: 'text', value: profile.name, maxlength: 60, 'aria-label': t('players.name'),
      placeholder: t('players.name'),
      oninput: (e) => { profile.name = e.target.value; update(); } })),
    h('td', { class: 'f-dob', 'data-label': t('check.dob') }, h('input', { type: 'date', value: profile.dob, min: '1920-01-01', max: `${SEASON}-12-31`, 'aria-label': label(t('check.dob')),
      oninput: (e) => { profile.dob = e.target.value; update(); } })),
    DISCIPLINES.map((d) => h('td', { 'data-label': t(`disc.${d}`) },
      h('select', { 'aria-label': label(t(`disc.${d}`)), onchange: (e) => { profile.grades[d] = e.target.value; update(); } },
        gradeOptions(profile.grades[d])))),
    h('td', { class: 'row-actions' }, profileActions(profile)));
}

function miniEvents(result) {
  if (!result.events || result.status === 'no') return null;
  return result.events.map((event) => h('div', { class: 'mini-events' },
    event.ageGroup ? h('span', { class: 'age' }, event.ageGroup) : null,
    DISCIPLINES.map((d) => {
      const { ok, reason } = event.disciplines[d];
      return h('span', { class: `mini ${ok ? 'ok' : 'barred'}`, title: `${t(`disc.${d}`)}: ${say(reason)}` },
        t(`discShort.${d}`), h('span', { 'aria-hidden': 'true' }, ok ? '✓' : '✕'),
        h('span', { class: 'visually-hidden' }, ` ${t(ok ? 'verdict.allowed' : 'verdict.barred')}`));
    })));
}

function renderPlayerComparison() {
  const box = document.getElementById('player-compare');
  if (!box) return;
  const ready = comparedPlayers();
  if (!ready.length) {
    fill(box, h('p', { class: 'empty' }, t(profiles.length || linkedPlayer ? 'players.addDob' : 'players.addFirst')));
    return;
  }
  const results = new Map(ready.map((p) => [p.id, new Map(checkEligibility(p).map((r) => [r.tier, r]))]));
  const enterable = (p) => [...results.get(p.id).values()].filter((r) => r.status === 'yes' || r.status === 'partial').length;
  const short = Object.fromEntries(DISCIPLINES.map((d) => [d[0], t(`discShort.${d}`)]));

  fill(box,
    h('div', { class: 'table-scroll compare-scroll' },
      h('table', { class: 'data-table player-compare' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', class: 'corner' }, t('tier.label')),
          ready.map((p) => h('th', { scope: 'col', class: p === linkedPlayer ? 'linked-col' : null },
            h('span', { class: 'player-name' }, profileName(p)),
            h('span', { class: 'player-line' }, playerLine(p)),
            h('span', { class: 'player-line' }, t('players.canEnter', { n: enterable(p) })))))),
        h('tbody', {}, data.circuits.map((c) => [
          h('tr', { class: `group-row c-${c.id}` }, h('th', { scope: 'colgroup', colspan: ready.length + 1 }, circuitLabel(c))),
          data.tiers.filter((t) => t.circuit === c.id).map((tier) => h('tr', {},
            h('th', { scope: 'row', class: `tier-cell c-${c.id}` }, tierHeader(tier.id)),
            ready.map((p) => {
              const r = results.get(p.id).get(tier.id);
              // Tiers with no age or grade limits (Masters, Para, Other) just get their note.
              if (r.status === 'info') return h('td', { class: 'verdict-cell v-info' }, h('p', { class: 'cell-note' }, say(r.summary)));
              return h('td', { class: `verdict-cell v-${r.status}` },
                statusBadge(r.status),
                miniEvents(r),
                h('p', { class: 'cell-note' }, say(r.summary)));
            }))),
        ])))),
    h('p', { class: 'muted chart-foot' }, t('players.shortKey', short)));
}

/** The combined page: saved players (plus one from a shared link) and what each can enter. */
function renderCheck(params) {
  if (params.length) {
    const candidate = {
      id: 'shared-link', name: '',
      dob: parseDate(params[0]) ? params[0] : '',
      grades: Object.fromEntries(DISCIPLINES.map((d, i) => [d, GRADES.includes(params[i + 1]) ? params[i + 1] : ''])),
    };
    linkedPlayer = candidate.dob && !sameAsSaved(candidate) ? candidate : null;
  } else {
    linkedPlayer = null;
  }
  drawCheck();
}

// Redraws the page without re-reading the URL, so an unsaved linked player keeps its edits.
function drawCheck() {
  setTitle(t('check.title'));
  const rows = [...profiles, ...(linkedPlayer ? [linkedPlayer] : [])];
  const groups = JUNIOR_AGE_GROUPS.map((group) => t('check.groupBorn', { group, year: SEASON - Number(group.slice(1)) + 1 })).join(', ');

  fill(view,
    h('h2', { class: 'section-title' }, t('check.title')),
    h('p', { class: 'lede-small' }, tParts('players.lede', { strong: h('strong', {}, t('players.savedLocal')) })),
    h('p', { id: 'save-warning', class: 'warning', hidden: true }, t('players.saveWarning')),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table players-edit' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, t('players.name')), h('th', { scope: 'col' }, t('check.dob')),
          DISCIPLINES.map((d) => h('th', { scope: 'col' }, t(`disc.${d}`))),
          h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, t('players.actions'))))),
        h('tbody', {}, rows.length ? rows.map(profileRow)
          : h('tr', {}, h('td', { colspan: 6, class: 'muted' }, t('players.none')))))),
    h('button', { type: 'button', class: 'button', onclick: () => {
      profiles.push(newProfile(t('players.defaultName', { n: profiles.length + 1 })));
      persistProfiles();
      drawCheck();
      view.querySelector(`.players-edit tbody tr:nth-child(${profiles.length}) input`)?.select();
    } }, t('players.add')),
    h('h2', { class: 'section-title compare-title' }, t('players.compareTitle')),
    h('div', { id: 'player-compare', 'aria-live': 'polite' }),
    h('details', { class: 'assumptions' },
      h('summary', {}, t('check.how')),
      h('ul', {},
        h('li', {}, t('check.how1')),
        h('li', {}, t('check.how2')),
        h('li', {}, t('check.how3', { groups })),
        h('li', {}, t('check.how4')),
        h('li', {}, t('check.how5')))));
  renderPlayerComparison();
}

// --- Groups: how a round robin is ranked, with a calculator --------------------

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// The calculator's state. `example` names the worked example on screen, so that
// switching format can swap in that example's version for the new format; any
// edit to the scores clears it. Each entry holds one name (singles) or two
// (doubles); `picked` is a saved player chosen by tap, waiting for a slot.
const calc = {
  format: 'bestOf3',
  event: 'singles',
  entries: GROUP_LETTERS.map(() => ['', '']),
  withdrew: GROUP_LETTERS.map(() => false),
  picked: null,
  outlook: { entry: null, places: 1 }, // goal defaults to finishing 1st
  gamePoints: 21, // points per game: decides when a game is finished, and projects unplayed matches
  noSetting: false, // true: first to the target wins the game, even from 20 all
  preset: 'bwf', // which tournament's scoring is applied; 'custom' once changed by hand
};

/** Saved players' names: entries holding any of them count as the reader's own. */
function ownNames() {
  return new Set(profiles.map((p) => p.name.trim()).filter(Boolean));
}

function isOwnEntry(i) {
  const own = ownNames();
  return calc.entries[i].slice(0, slotsPerEntry()).some((n) => own.has(n.trim()));
}

/** Loads an example's scores; names already placed in the group stay put. */
function loadExample(id) {
  calc.example = id;
  calc.size = 4;
  calc.withdrew = GROUP_LETTERS.map(() => false);
  calc.scores = exampleScores(id, calc.format, calc.gamePoints); // in the chosen points per game
}

loadExample('circle'); // open on a worked example rather than an empty form

function signed(n) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

function sayGroupStep(step) {
  const p = { ...step.params };
  if (p.players) p.players = joinList(p.players);
  if (p.values) p.values = p.values.map((v) => `${v.name} ${signed(v.value)}`).join(', ');
  return t(step.key, p);
}

function slotsPerEntry() {
  return calc.event === 'doubles' ? 2 : 1;
}

function entryName(i) {
  const names = calc.entries[i].slice(0, slotsPerEntry()).map((n) => n.trim()).filter(Boolean);
  return names.length ? names.join(' / ') : GROUP_LETTERS[i];
}

function calcPlayers() {
  return GROUP_LETTERS.slice(0, calc.size).map((letter, i) => ({ id: letter, name: entryName(i), withdrew: calc.withdrew[i] }));
}

/** Names currently sitting in a visible slot. */
function placedNames() {
  return new Set(calc.entries.slice(0, calc.size).flatMap((e) => e.slice(0, slotsPerEntry())).map((n) => n.trim()).filter(Boolean));
}

/** Puts a player in slot "entry-position", moving them if they were already placed. */
function placePlayer(name, slot) {
  const [i, k] = slot.split('-').map(Number);
  calc.entries.forEach((entry) => entry.forEach((n, pos) => { if (n.trim() === name) entry[pos] = ''; }));
  calc.entries[i][k] = name;
  calc.picked = null;
  drawGroupInputs();
  drawGroupResult();
}

function pickPlayer(name) {
  calc.picked = calc.picked === name ? null : name;
  drawGroupInputs();
}

function slotAt(x, y) {
  return document.elementFromPoint(x, y)?.closest('[data-slot]') ?? null;
}

// Dragging uses pointer events rather than HTML drag-and-drop, which phones
// don't support reliably, so a finger works as well as a mouse. A press that
// doesn't move is a tap: it picks the player for tap-a-slot placement.
function startDrag(e, name) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const chip = e.currentTarget;
  const start = { x: e.clientX, y: e.clientY };
  let ghost = null;
  let over = null;
  try {
    chip.setPointerCapture(e.pointerId); // keep receiving moves while the finger leaves the chip
  } catch {
    // Pointer already released; the listeners below still work without capture.
  }
  const move = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      ghost = document.body.appendChild(h('div', { class: 'drag-ghost', 'aria-hidden': 'true' }, name));
    }
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
    const target = slotAt(ev.clientX, ev.clientY);
    if (target !== over) {
      over?.classList.remove('drop-target');
      target?.classList.add('drop-target');
      over = target;
    }
  };
  const end = (ev) => {
    chip.removeEventListener('pointermove', move);
    chip.removeEventListener('pointerup', end);
    chip.removeEventListener('pointercancel', end);
    over?.classList.remove('drop-target');
    if (ghost) {
      ghost.remove();
      if (ev.type === 'pointerup' && over) placePlayer(name, over.dataset.slot);
    } else if (ev.type === 'pointerup') {
      pickPlayer(name);
    }
  };
  chip.addEventListener('pointermove', move);
  chip.addEventListener('pointerup', end);
  chip.addEventListener('pointercancel', end);
}

function playerPalette() {
  const saved = [...new Set(profiles.map((p) => p.name.trim()).filter(Boolean))];
  if (!saved.length) {
    return h('p', { class: 'muted palette' }, tParts('groups.noSaved', { link: h('a', { href: '#/check' }, t('tab.check')) }));
  }
  const placed = placedNames();
  return h('div', { class: 'palette' },
    h('p', { class: 'palette-title' }, t('groups.savedPlayers')),
    h('div', { class: 'palette-chips' }, saved.map((name) => h('button', {
      type: 'button', class: `player-chip${placed.has(name) ? ' placed' : ''}`, 'aria-pressed': String(calc.picked === name),
      onpointerdown: (e) => startDrag(e, name),
      onclick: (e) => { if (e.detail === 0) pickPlayer(name); }, // keyboard: Enter / Space
    }, name))),
    h('p', { class: 'muted palette-hint', 'aria-live': 'polite' }, calc.picked ? t('groups.picked', { name: calc.picked }) : t('groups.dragHint')));
}

function slotInput(i, k) {
  const letter = GROUP_LETTERS[i];
  return h('input', {
    type: 'text', class: `slot-input${calc.picked ? ' awaiting' : ''}`, 'data-slot': `${i}-${k}`,
    value: calc.entries[i][k], maxlength: 30, placeholder: t('groups.slotEmpty'),
    'aria-label': `${t('players.name')} ${letter}${slotsPerEntry() > 1 ? ` (${k + 1})` : ''}`,
    onclick: () => { if (calc.picked) placePlayer(calc.picked, `${i}-${k}`); },
    oninput: (e) => { calc.entries[i][k] = e.target.value; drawGroupResult(); },
    onchange: () => drawGroupInputs(),
  });
}

/** The scoring rules the calculator's games are judged by. */
function scoringRules() {
  return { points: calc.gamePoints, setting: !calc.noSetting };
}

/** The games entered for pairing i v j that count in the current format. */
function pairGames(i, j) {
  const entered = calc.scores[`${i}-${j}`] ?? [];
  return Array.from({ length: calc.format === 'oneGame' ? 1 : 3 }, (_, k) => {
    const g = entered[k];
    return g && g.every((n) => Number.isInteger(n)) ? g : null;
  });
}

function calcMatches() {
  const players = calcPlayers();
  return pairings(calc.size).map(([i, j]) => ({ a: players[i].id, b: players[j].id, games: pairGames(i, j) }));
}

/** Shades the winner green and the loser red in each finished match, without redrawing the inputs. */
function markWinners() {
  document.querySelectorAll('.calc-matches th[data-pair]').forEach((th) => {
    const [i, j] = th.dataset.pair.split('-').map(Number);
    const winner = matchWinner(pairGames(i, j), calc.format, scoringRules());
    th.querySelector('.side-a').className = `side side-a${winner === 'a' ? ' win' : winner === 'b' ? ' loss' : ''}`;
    th.querySelector('.side-b').className = `side side-b${winner === 'b' ? ' win' : winner === 'a' ? ' loss' : ''}`;
    // Each game's boxes too, once that game is finished under the rules (so 21-20
    // with setting, or 10-8, stays plain): the game's winner green, loser red.
    // Games open one at a time: game 2 once game 1 is finished, and no game 3
    // after a 2-0. Locked boxes keep what was typed but don't count.
    const scores = calc.scores[`${i}-${j}`] ?? [];
    const open = openGameCount(pairGames(i, j), calc.format, scoringRules());
    th.parentElement.querySelectorAll('.score-input').forEach((input) => {
      const game = Number(input.dataset.game);
      input.disabled = game >= open;
      const gameSide = input.disabled ? null : gameWinner(scores[game] ?? [], scoringRules());
      const mySide = input.dataset.side === '0' ? 'a' : 'b';
      input.classList.toggle('win', gameSide === mySide);
      input.classList.toggle('loss', Boolean(gameSide) && gameSide !== mySide);
    });
  });
}

function scoreInput(i, j, game, side) {
  const players = calcPlayers();
  const current = calc.scores[`${i}-${j}`]?.[game]?.[side];
  return h('input', {
    type: 'number', inputmode: 'numeric', min: 0, max: 99, class: 'score-input', 'data-game': game, 'data-side': side,
    value: Number.isInteger(current) ? current : '',
    'aria-label': t('groups.scoreLabel', { player: players[side ? j : i].name, n: game + 1, a: players[i].name, b: players[j].name }),
    oninput: (e) => {
      const key = `${i}-${j}`;
      const games = calc.scores[key] ?? (calc.scores[key] = []);
      const pair = games[game] ?? (games[game] = [null, null]);
      const value = e.target.value === '' ? null : Number.parseInt(e.target.value, 10);
      pair[side] = Number.isInteger(value) ? value : null;
      calc.example = null;
      markExample();
      markWinners();
      drawGroupResult();
    },
  });
}

/** Shows which example (if any) is on screen without redrawing the form. */
function markExample() {
  document.querySelectorAll('.chip-button[data-example]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.example === calc.example)));
}

function drawGroupInputs() {
  const box = document.getElementById('calc-inputs');
  if (!box) return;
  const players = calcPlayers();
  const gameCount = calc.format === 'oneGame' ? 1 : 3;
  fill(box,
    playerPalette(),
    h('div', { class: 'calc-columns' },
      h('div', {},
        h('div', { class: 'calc-heading' },
          h('h4', {}, t(calc.event === 'doubles' ? 'groups.pairs' : 'groups.players')),
          h('button', { type: 'button', class: 'link-button', onclick: () => {
            calc.entries = GROUP_LETTERS.map(() => ['', '']);
            calc.picked = null;
            drawGroupInputs();
            drawGroupResult();
          } }, t('groups.clearNames'))),
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table calc-players' },
          h('tbody', {}, players.map((p, i) => h('tr', { class: isOwnEntry(i) ? 'own' : null },
            h('th', { scope: 'row' }, p.id),
            h('td', { class: 'slots' }, Array.from({ length: slotsPerEntry() }, (_, k) => slotInput(i, k))),
            h('td', {}, h('label', { class: 'check' },
              h('input', { type: 'checkbox', checked: calc.withdrew[i], onchange: (e) => { calc.withdrew[i] = e.target.checked; drawGroupResult(); } }),
              ` ${t('groups.withdrew')}`)))))))),
      h('div', {},
        h('div', { class: 'calc-heading' },
          h('h4', {}, t('groups.matches')),
          h('button', { type: 'button', class: 'link-button', onclick: () => {
            calc.scores = {};
            calc.example = null;
            markExample();
            drawGroupInputs();
            drawGroupResult();
          } }, t('groups.clear'))),
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table calc-matches' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''),
            Array.from({ length: gameCount }, (_, g) => h('th', { scope: 'col' }, gameCount > 1 ? t('groups.game', { n: g + 1 }) : '')))),
          h('tbody', {}, pairings(calc.size).map(([i, j]) => h('tr', { class: isOwnEntry(i) || isOwnEntry(j) ? 'own' : null },
            h('th', { scope: 'row', class: 'pair', 'data-pair': `${i}-${j}` },
              h('span', { class: 'side side-a' }, players[i].name), ' – ', h('span', { class: 'side side-b' }, players[j].name)),
            Array.from({ length: gameCount }, (_, g) => h('td', { class: 'game-cell', 'data-label': gameCount > 1 ? t('groups.game', { n: g + 1 }) : null },
              scoreInput(i, j, g, 0), h('span', { class: 'dash', 'aria-hidden': 'true' }, '–'), scoreInput(i, j, g, 1)))))))))));
  markWinners();
}

// Which entry the outlook is for: the chosen one, else the reader's own, else A.
function outlookEntry() {
  const players = calcPlayers();
  if (players.some((p) => p.id === calc.outlook.entry)) return calc.outlook.entry;
  const own = players.findIndex((_, i) => isOwnEntry(i));
  return players[own >= 0 ? own : 0].id;
}

/** "Can Amy finish in the top 2?" for groups with matches still to play. */
/** How one condition on an open match reads, e.g. "Amy beats D 2–0". */
function describeCondition(condition, open, nameOf) {
  const m = open[condition.match];
  const a = nameOf[m.a];
  const b = nameOf[m.b];
  const one = (value) => {
    const [winner, loser] = value[0] === 'a' ? [a, b] : [b, a];
    if (value.length === 1) return t('groups.beats', { winner, loser });
    return t(value.endsWith('20') ? 'groups.beats20' : 'groups.beats21', { winner, loser });
  };
  const v = condition.values.join(',');
  if (v === 'a20,a21' || v === 'a') return t('groups.beats', { winner: a, loser: b });
  if (v === 'b21,b20' || v === 'b') return t('groups.beats', { winner: b, loser: a });
  if (condition.values.length === 1) return one(condition.values[0]);
  if (v === 'a21,b21') return t('groups.threeGames', { a, b });
  if (v === 'a20,b20') return t('groups.twoGames', { a, b });
  if (condition.values.length === 3) {
    const missing = ['a20', 'a21', 'b21', 'b20'].find((x) => !condition.values.includes(x));
    return t('groups.except', { a, b, what: one(missing) });
  }
  return joinList(condition.values.map(one), 'list.or');
}

function marginText(result, open, nameOf) {
  const m = open[result.match];
  const [winner, loser] = result.winner === 'a' ? [nameOf[m.a], nameOf[m.b]] : [nameOf[m.b], nameOf[m.a]];
  if (result.max == null) return t('groups.marginAtLeast', { winner, loser, n: signed(result.min) });
  if (result.min == null) return t('groups.marginAtMost', { winner, loser, n: signed(result.max) });
  return t('groups.marginBetween', { winner, loser, min: signed(result.min), max: signed(result.max) });
}

/**
 * The same threshold in everyday words, from both sides of the match:
 * "Amy must win by at least 4 points in total, so B loses by 4 or more".
 */
function plainMargin(result, open, nameOf) {
  const m = open[result.match];
  const [winner, loser] = result.winner === 'a' ? [nameOf[m.a], nameOf[m.b]] : [nameOf[m.b], nameOf[m.a]];
  const { min, max } = result;
  if (max == null) {
    if (min > 0) return t('groups.plainWinAtLeast', { winner, loser, n: min });
    if (min === 0) return t('groups.plainNotBehind', { winner, loser });
    return t('groups.plainTrailAtMost', { winner, loser, n: -min }); // a 2-1 win can trail on points
  }
  if (min == null) {
    if (max > 0) return t('groups.plainWinAtMost', { winner, loser, n: max });
    return t('groups.plainTrailAtLeast', { winner, loser, n: -max });
  }
  if (min > 0) return t('groups.plainWinBetween', { winner, loser, min, max });
  return null; // a range crossing zero reads best as the margin itself
}

/**
 * The threshold as points the losing side must (or may) score, which reads more
 * naturally: "C must score at least 4 points" rather than "D's margin is +17 or
 * less". Only for a single game, or a 2-0 win, where the winner's games end at 21
 * so the loser's points follow from the margin; a 2-1 match has no single number.
 */
function loserPoints(result, open, nameOf) {
  const m = open[result.match];
  const loser = result.winner === 'a' ? nameOf[m.b] : nameOf[m.a];
  const g = calc.gamePoints;
  const base = calc.format === 'oneGame' ? g : result.outcome?.endsWith('20') ? 2 * g : null;
  if (!base) return null;
  const suffix = base === 2 * g ? '2' : '';
  const { min, max } = result;
  if (min == null) return t(`groups.loserAtLeast${suffix}`, { loser, n: base - max });
  if (max == null) return t(`groups.loserAtMost${suffix}`, { loser, n: base - min });
  return t(`groups.loserBetween${suffix}`, { loser, min: base - max, max: base - min });
}

function verdictBadge(type, text) {
  const icon = { yes: '✓', no: '✕' }[type] ?? '?';
  const cls = { yes: 's-yes', no: 's-no' }[type] ?? 's-partial';
  return h('span', { class: `status ${cls}` }, h('span', { 'aria-hidden': 'true' }, icon), ` ${text}`);
}

function dependsText(reasons) {
  return t('groups.dependsOn', { what: joinList(reasons.map((r) => t(`groups.reason${r[0].toUpperCase()}${r.slice(1)}`))) });
}

/** A points condition: the margin in the badge, then the same thing as the loser's points. */
function marginCell(result, open, nameOf) {
  const points = loserPoints(result, open, nameOf);
  const margin = marginText(result, open, nameOf);
  if (points) {
    return [
      verdictBadge('margin', t('groups.ifMargin', { condition: margin })),
      h('p', { class: 'plain-margin' }, t('groups.thatIs', { text: points })),
    ];
  }
  const plain = plainMargin(result, open, nameOf);
  return [
    verdictBadge('margin', t('groups.ifMargin', { condition: margin })),
    plain ? h('p', { class: 'plain-margin' }, t('groups.inOtherWords', { text: plain })) : null,
  ];
}

/** "Can Amy finish 1st?" for groups with matches still to play. */
function outlookPanel() {
  const players = calcPlayers();
  const entry = outlookEntry();
  const matches = calcMatches();
  const nameOf = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const name = nameOf[entry];
  const goal = t(calc.outlook.places === 1 ? 'groups.goalFirst' : 'groups.goalTop2');
  const detail = qualificationDetail(players, matches, calc.format, entry, calc.outlook.places, { rules: scoringRules() });
  if (detail.status === 'done') return null;

  let body;
  if (detail.status === 'through') body = h('p', { class: 'outlook-line' }, verdictBadge('yes', t('groups.outlookYes')), ' ', t('groups.outlookThrough', { name, goal }));
  else if (detail.status === 'out') body = h('p', { class: 'outlook-line' }, verdictBadge('no', t('groups.outlookNo')), ' ', t('groups.outlookOut', { name, goal }));
  else if (detail.status === 'open') {
    const own = (c) => detail.open[c.match].a === entry || detail.open[c.match].b === entry;
    const ownSide = (c) => (detail.open[c.match].a === entry ? 'a' : 'b');
    const condClass = (c) => {
      if (!own(c)) return 'other';
      if (c.values.every((x) => x[0] === ownSide(c))) return 'won';
      if (c.values.every((x) => x[0] !== ownSide(c))) return 'lost';
      return 'other';
    };
    body = [
      h('p', {}, t('groups.outlookOpen', { name, goal })),
      table('outlook-table', [h('th', { scope: 'col' }, t('groups.outlookIf')), h('th', { scope: 'col' }, t('groups.outlookResult'))],
        detail.rows.map((row) => h('tr', {},
          h('td', {}, row.conditions.length
            ? h('ul', { class: 'outcomes' }, row.conditions.map((c) => h('li', { class: condClass(c) }, describeCondition(c, detail.open, nameOf))))
            : t('groups.anyResult')),
          h('td', {}, row.result.type === 'yes' ? verdictBadge('yes', t('groups.outlookYes'))
            : row.result.type === 'no' ? verdictBadge('no', t('groups.outlookNo'))
              : row.result.type === 'margin' ? marginCell(row.result, detail.open, nameOf)
                : verdictBadge('depends', dependsText(row.result.reasons)))))),
      detail.rows.some((r) => r.result.type === 'margin') ? h('p', { class: 'muted outlook-note' }, t('groups.marginNote'), ' ', t('groups.scoreNote', { n: calc.gamePoints })) : null,
      detail.mode === 'winLoss' && calc.format === 'bestOf3' ? h('p', { class: 'muted outlook-note' }, t('groups.winLossNote')) : null,
    ];
  } else {
    // Too many combinations to list in full: summarise by the entry's own results.
    const q = qualification(players, matches, calc.format, entry, calc.outlook.places, { rules: scoringRules() });
    if (q.status === 'tooMany') body = h('p', { class: 'muted' }, t('groups.outlookTooMany'));
    else {
      body = [
        h('p', {}, t('groups.outlookOpen', { name, goal })),
        h('p', { class: 'muted outlook-note' }, t('groups.tooManyRows')),
        table('outlook-table', [h('th', { scope: 'col' }, t('groups.outlookIf')), h('th', { scope: 'col' }, t('groups.outlookResult'))],
          q.rows.map((row) => h('tr', {},
            h('td', {}, row.outcomes.length
              ? h('ul', { class: 'outcomes' }, row.outcomes.map((o) => h('li', { class: o.winner === entry ? 'won' : 'lost' },
                t('groups.beats', { winner: nameOf[o.winner], loser: nameOf[o.loser] }))))
              : t('groups.outlookOwnDone', { name })),
            h('td', {}, row.result === 'yes' ? verdictBadge('yes', t('groups.outlookYes'))
              : row.result === 'no' ? verdictBadge('no', t('groups.outlookNo'))
                : verdictBadge('depends', dependsText(row.reasons)))))),
      ];
    }
  }

  const entrySelect = h('select', { id: 'outlook-entry', onchange: (e) => { calc.outlook.entry = e.target.value; drawGroupResult(); } },
    players.filter((p) => !p.withdrew).map((p) => h('option', { value: p.id, selected: p.id === entry }, p.name)));
  const placesSelect = h('select', { id: 'outlook-places', onchange: (e) => { calc.outlook.places = Number(e.target.value); drawGroupResult(); } },
    h('option', { value: 1, selected: calc.outlook.places === 1 }, t('groups.targetFirst')),
    h('option', { value: 2, selected: calc.outlook.places === 2 }, t('groups.targetTop2')));

  return h('section', { class: 'outlook' },
    h('h4', {}, t('groups.outlookTitle')),
    h('div', { class: 'calc-controls' },
      h('label', { for: 'outlook-entry' }, t('groups.outlookFor')), entrySelect,
      h('label', { for: 'outlook-places' }, t('groups.outlookTarget')), placesSelect),
    body,
    h('p', { class: 'muted outlook-note' }, t('groups.outlookNote')));
}

/**
 * The round-robin grid: each row is a player, each column an opponent, and each
 * cell the row player's scores against them, green for a win and red for a loss.
 */
function crossTable(result) {
  const players = calcPlayers();
  const rules = scoringRules();
  const byId = Object.fromEntries(result.standings.map((s) => [s.id, s]));
  const gamesFor = (r, c) => (r < c ? pairGames(r, c) : pairGames(c, r).map((g) => (g ? [g[1], g[0]] : null)));
  const cell = (r, c) => {
    if (r === c) return h('td', { class: 'self', 'aria-hidden': 'true' });
    const games = gamesFor(r, c);
    const winner = matchWinner(games, calc.format, rules);
    const scores = games.filter(Boolean).map(([x, y]) => `${x}–${y}`);
    return h('td', { class: winner === 'a' ? 'win' : winner === 'b' ? 'loss' : null },
      scores.length ? scores.map((sc, k) => [k ? h('br') : null, sc]) : h('span', { class: 'muted' }, '—'));
  };
  return [
    h('div', { class: 'calc-heading' }, h('h4', {}, t('groups.crossTitle'))),
    h('p', { class: 'muted cross-hint' }, t('groups.crossHint')),
    h('div', { class: 'table-scroll' }, h('table', { class: 'data-table cross' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'corner' }, ''),
        players.map((p) => h('th', { scope: 'col' }, p.name)),
        h('th', { scope: 'col', class: 'num group-start' }, `${t('groups.colWon')}–${t('groups.colLost')}`),
        h('th', { scope: 'col', class: 'num' }, t('groups.colPos')))),
      h('tbody', {}, players.map((p, r) => h('tr', { class: [p.withdrew ? 'withdrawn' : '', isOwnEntry(r) ? 'own' : ''].join(' ').trim() || null },
        h('th', { scope: 'row', class: 'player' }, p.name),
        players.map((_, c) => cell(r, c)),
        h('td', { class: 'num group-start' }, `${byId[p.id].won}–${byId[p.id].lost}`),
        h('td', { class: 'num pos' }, byId[p.id].position)))))),
  ];
}

function drawGroupResult() {
  const box = document.getElementById('calc-result');
  if (!box) return;
  const result = rankGroup(calcPlayers(), calcMatches(), calc.format, { rules: scoringRules() });
  const bestOf3 = calc.format === 'bestOf3';
  fill(box,
    crossTable(result),
    h('h4', {}, t('groups.standings')),
    calcPlayers().some((_, i) => isOwnEntry(i)) ? h('p', { class: 'muted own-hint' }, h('span', { class: 'own-swatch', 'aria-hidden': 'true' }), t('groups.ownHint')) : null,
    result.unfinished ? h('p', { class: 'muted' }, result.unfinished === 1 ? t('groups.unfinishedOne') : t('groups.unfinishedMany', { n: result.unfinished })) : null,
    h('div', { class: 'table-scroll' }, h('table', { class: 'data-table calc-standings' },
      h('thead', {},
        h('tr', {},
          h('th', { scope: 'col', rowspan: 2, class: 'pos' }, t('groups.colPos')),
          h('th', { scope: 'col', rowspan: 2, class: 'player' }, t('groups.colPlayer')),
          h('th', { scope: 'colgroup', colspan: 2, class: 'group-start' }, t('groups.colWL')),
          bestOf3 ? h('th', { scope: 'colgroup', colspan: 3, class: 'group-start' }, t('groups.colGames')) : null,
          h('th', { scope: 'colgroup', colspan: 3, class: 'group-start' }, t('groups.colPoints')),
          h('th', { scope: 'col', rowspan: 2, class: 'group-start' }, t('groups.colDecided'))),
        h('tr', {},
          h('th', { scope: 'col', class: 'num group-start' }, t('groups.colWon')), h('th', { scope: 'col', class: 'num' }, t('groups.colLost')),
          bestOf3 ? [h('th', { scope: 'col', class: 'num group-start' }, t('groups.colWon')), h('th', { scope: 'col', class: 'num' }, t('groups.colLost')),
            h('th', { scope: 'col', class: 'num' }, t('groups.colDiff'))] : null,
          h('th', { scope: 'col', class: 'num group-start' }, t('groups.colFor')), h('th', { scope: 'col', class: 'num' }, t('groups.colAgainst')),
          h('th', { scope: 'col', class: 'num' }, t('groups.colDiff')))),
      h('tbody', {}, result.standings.map((s) => h('tr', { class: [s.by === 'withdrew' ? 'withdrawn' : '', isOwnEntry(GROUP_LETTERS.indexOf(s.id)) ? 'own' : ''].join(' ').trim() || null },
        h('td', { class: 'pos' }, s.position),
        h('th', { scope: 'row', class: 'player' }, s.name),
        h('td', { class: 'num group-start' }, s.won), h('td', { class: 'num' }, s.lost),
        bestOf3 ? [h('td', { class: 'num group-start' }, s.gamesWon), h('td', { class: 'num' }, s.gamesLost),
          h('td', { class: 'num diff' }, signed(s.gamesWon - s.gamesLost))] : null,
        h('td', { class: 'num group-start' }, s.pointsWon), h('td', { class: 'num' }, s.pointsLost),
        h('td', { class: 'num diff' }, signed(s.pointsWon - s.pointsLost)),
        h('td', { class: 'group-start' }, h('span', { class: `by by-${s.by}` }, t(`by.${s.by}`)))))))),
    h('h4', {}, t('groups.how')),
    h('ol', { class: 'calc-steps' }, result.steps.map((step) => h('li', {}, sayGroupStep(step)))),
    outlookPanel());
}

function ladder(keys) {
  return h('ol', { class: 'ladder' }, keys.map((key, i) => {
    // Steps alternate: "two level" (head-to-head) and "three or more level" (a difference).
    const kind = i === 0 ? 'first' : i === keys.length - 1 ? 'last' : i % 2 ? 'two' : 'many';
    return h('li', { class: `step-${kind}` }, t(key));
  }));
}

/** "Best of three games · 15 points · setting to 21" */
function scoringSummary() {
  return [
    t(calc.format === 'oneGame' ? 'groups.oneGameTitle' : 'groups.bestOf3Title'),
    t('groups.pointsN', { n: calc.gamePoints }),
    calc.noSetting ? t('groups.noSetting') : t('groups.withSetting', { cap: CAPS[calc.gamePoints] }),
  ].join(' · ');
}

/** After a hand change to the scoring, the tournament choice becomes "Custom". */
function markCustom() {
  const preset = SCORING_PRESETS[calc.preset];
  const matches = preset && preset.format === calc.format && preset.points === calc.gamePoints && preset.setting === !calc.noSetting;
  if (!matches) calc.preset = 'custom';
  const select = document.getElementById('calc-preset');
  if (select) select.value = calc.preset;
  const summary = document.getElementById('preset-summary');
  if (summary) summary.textContent = scoringSummary();
}

function renderGroups() {
  setTitle(t('groups.docTitle'));
  const formatSelect = h('select', { id: 'calc-format', onchange: (e) => {
    calc.format = e.target.value;
    markCustom();
    if (calc.example) loadExample(calc.example); // same example, in the new format
    drawGroupInputs();
    drawGroupResult();
  } },
    h('option', { value: 'bestOf3', selected: calc.format === 'bestOf3' }, t('groups.bestOf3Title')),
    h('option', { value: 'oneGame', selected: calc.format === 'oneGame' }, t('groups.oneGameTitle')));
  // The tournament sets format, points per game and setting together.
  const presetOption = (id, label) => h('option', { value: id, selected: calc.preset === id }, label);
  const presetSelect = h('select', { id: 'calc-preset', onchange: (e) => {
    const preset = SCORING_PRESETS[e.target.value];
    if (!preset) return;
    calc.preset = e.target.value;
    calc.format = preset.format;
    calc.gamePoints = preset.points;
    calc.noSetting = !preset.setting;
    if (calc.example) loadExample(calc.example); // same example, in the new scoring
    renderGroups();
  } },
    presetOption('bwf', t('groups.presetBwf')),
    data.circuits.map((c) => h('optgroup', { label: circuitLabel(c) },
      data.tiers.filter((tier) => tier.circuit === c.id).flatMap((tier) => [
        presetOption(tier.id, tier.name),
        tier.id === 'junior-gold' ? presetOption('junior-gold-u11', `${tier.name} U11`) : null,
      ]))),
    presetOption('custom', t('groups.presetCustom')));
  const eventSelect = h('select', { id: 'calc-event', onchange: (e) => { calc.event = e.target.value; drawGroupInputs(); drawGroupResult(); } },
    ['singles', 'doubles'].map((ev) => h('option', { value: ev, selected: calc.event === ev }, t(`disc.${ev}`))));
  const pointsSelect = h('select', { id: 'calc-points', onchange: (e) => {
    calc.gamePoints = Number(e.target.value);
    markCustom();
    markWinners();
    if (calc.example) {
      loadExample(calc.example); // same example, rescored to the new points per game
      drawGroupInputs();
    }
    drawGroupResult();
  } },
    [21, 15, 11].map((n) => h('option', { value: n, selected: calc.gamePoints === n }, t('groups.pointsN', { n }))));
  const sizeSelect = h('select', { id: 'calc-size', onchange: (e) => { calc.size = Number(e.target.value); calc.example = null; markExample(); drawGroupInputs(); drawGroupResult(); } },
    [3, 4, 5, 6].map((n) => h('option', { value: n, selected: calc.size === n }, n)));
  // Examples keep the chosen format: each has a best-of-three and a one-game version.
  const example = (id, key) => h('button', { type: 'button', class: 'chip-button', 'data-example': id, 'aria-pressed': String(calc.example === id),
    onclick: () => { loadExample(id); renderGroups(); document.getElementById('calc')?.scrollIntoView({ block: 'start' }); } }, t(key));

  fill(view,
    h('h2', { class: 'section-title' }, t('groups.title')),
    h('p', { class: 'lede-small' }, t('groups.lede')),
    h('section', { class: 'prose groups-section' },
      h('h3', {}, t('groups.basicsTitle')),
      h('ul', {}, ['groups.basics1', 'groups.basics2', 'groups.basics3'].map((k) => h('li', {}, t(k))))),
    h('section', { class: 'groups-section' },
      h('h3', {}, t('groups.laddersTitle')),
      h('p', { class: 'callout' }, t('groups.keyIdea')),
      h('div', { class: 'ladders' },
        h('article', { class: 'ladder-card' },
          h('h4', {}, t('groups.bestOf3Title')), h('p', { class: 'muted' }, t('groups.bestOf3Note')),
          ladder(['ladder.b1', 'ladder.b2', 'ladder.b3', 'ladder.b4', 'ladder.b5', 'ladder.b6', 'ladder.b7'])),
        h('article', { class: 'ladder-card' },
          h('h4', {}, t('groups.oneGameTitle')), h('p', { class: 'muted' }, t('groups.oneGameNote')),
          ladder(['ladder.o1', 'ladder.o2', 'ladder.o3', 'ladder.o4', 'ladder.o5'])))),
    h('section', { class: 'prose groups-section' },
      h('h3', {}, t('groups.withdrawTitle')),
      h('ul', {}, h('li', {}, t('groups.withdraw1')), h('li', {}, t('groups.withdraw2')))),
    h('section', { class: 'groups-section calc', id: 'calc' },
      h('h3', {}, t('groups.calcTitle')),
      h('p', { class: 'lede-small' }, t('groups.calcLede')),
      h('div', { class: 'calc-controls' },
        h('span', { class: 'muted' }, t('groups.examples')),
        example('two', 'groups.exTwo'), example('circle', 'groups.exCircle'),
        example('points', 'groups.exPoints')),
      h('div', { class: 'calc-controls' },
        h('label', { for: 'calc-preset' }, t('groups.preset')), presetSelect,
        h('span', { id: 'preset-summary', class: 'muted preset-summary' }, scoringSummary())),
      h('div', { class: 'calc-controls' },
        h('label', { for: 'calc-event' }, t('groups.event')), eventSelect,
        h('label', { for: 'calc-format' }, t('groups.format')), formatSelect,
        h('label', { for: 'calc-size' }, t('groups.size')), sizeSelect,
        h('label', { for: 'calc-points' }, t('groups.gamePoints')), pointsSelect,
        h('label', { class: 'check', title: t('groups.noSettingHint', { deuce: `${calc.gamePoints - 1}–${calc.gamePoints - 1}` }) },
          h('input', { type: 'checkbox', id: 'calc-nosetting', checked: calc.noSetting,
            onchange: (e) => { calc.noSetting = e.target.checked; markCustom(); markWinners(); drawGroupResult(); } }),
          ` ${t('groups.noSetting')}`)),
      h('div', { id: 'calc-inputs' }),
      h('div', { id: 'calc-result', 'aria-live': 'polite' })),
    h('section', { class: 'prose groups-section' },
      h('h3', {}, t('groups.sourcesTitle')),
      h('ul', {},
        h('li', {}, h('a', { href: 'https://images.gc.badmintonenglandservices.co.uk/53012730-1ee3-11f1-a060-b1b720430faa.pdf', rel: 'noopener' }, t('groups.source1'))),
        h('li', {}, h('a', { href: 'https://www.badminton.org.au/wp-content/uploads/2024/01/Section-5.1-General-Competition-Regulations-11-November-2023-V4.0-1.pdf', rel: 'noopener' }, t('groups.source2')))),
      h('p', { class: 'muted' }, t('groups.sourceNote'))));
  drawGroupInputs();
  drawGroupResult();
}

function renderNotes() {
  setTitle(t('notes.docTitle'));
  fill(view, h('div', { class: 'prose' },
    h('h2', { class: 'section-title' }, t('notes.title')),
    h('p', {}, t('notes.intro')),
    h('ul', {}, data.notes.map((n) => h('li', {}, td(n)))),
    h('h2', { class: 'section-title' }, t('notes.about')),
    h('p', {}, t('notes.p1')),
    h('p', {}, t('notes.p2')),
    h('p', {}, t('notes.translations')),
    h('p', {}, tParts('notes.p3', { link: h('a', { href: data.source, rel: 'noopener' }, t('notes.sourceLink')) }))));
}

// Text that lives in index.html, re-applied whenever the language changes.
function renderStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  const source = document.getElementById('source-link').getAttribute('href');
  fill(document.getElementById('footer-text'),
    tParts('site.footer', { link: h('a', { id: 'source-link', href: source, rel: 'noopener' }, t('site.footerLink')) }),
    currentLocale() === 'en' ? null : [' ', t('site.translated')]);
  document.getElementById('lang-select').value = currentLocale();
}

function setActiveTab(name) {
  document.querySelectorAll('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === name ? 'page' : 'false'));
}

function route({ focus = true } = {}) {
  const [, section = 'grades', arg = '', ...rest] = location.hash.split('/');
  // Players used to be its own tab; it is now part of Can I enter?
  if (section === 'players') return location.replace('#/check');
  const param = decodeURIComponent(arg);
  if (section !== 'search') {
    lastBrowseRoute = location.hash || '#/grades';
    if (searchInput.value) searchInput.value = '';
  }
  setActiveTab(section);
  if (tooltip) tooltip.hidden = true;
  if (section === 'grades') renderGrades(param);
  else if (section === 'compare') renderCompare(param);
  else if (section === 'check') renderCheck(arg ? [param, ...rest] : []);
  else if (section === 'notes') renderNotes();
  else if (section === 'groups') renderGroups();
  else if (section === 'search') {
    if (searchInput.value !== param) searchInput.value = param;
    renderSearch(param);
  } else renderTier(param);
  if (focus) view.focus({ preventScroll: true });
}

const langSelect = document.getElementById('lang-select');
fill(langSelect, LOCALES.map((l) => h('option', { value: l.id, lang: l.id }, l.label)));
langSelect.addEventListener('change', async () => {
  await setLocale(langSelect.value);
  renderStatic();
  if (data) route({ focus: false });
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  location.replace(q ? `#/search/${encodeURIComponent(q)}` : lastBrowseRoute);
});
document.getElementById('search-form').addEventListener('submit', (e) => e.preventDefault());
window.addEventListener('hashchange', () => route({ focus: !location.hash.startsWith('#/search/') }));

// Label the header in the reader's language right away, and fetch the rules and
// their translation together rather than one after the other.
const localeReady = setLocale(initialLocale(), { remember: false });
renderStatic();
const rulesRequest = fetch('data/tc-2026.json');
try {
  const response = await rulesRequest;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  data = await response.json();
  await localeReady;
  tierById = new Map(data.tiers.map((t) => [t.id, t]));
  groupsByArea = buildGroups();
  route({ focus: false });
} catch (error) {
  fill(view, h('p', { class: 'empty' }, t('site.loadError', { error: error.message })));
}
