// The audit trail: every page view and action, with the visitor's IP and, when
// logged in, their Google account. The page reports its own actions through
// POST /api/events; sign-in and sign-out are logged on the server. Each action
// may only carry the fields listed here, checked and trimmed, so the log can't
// be filled with arbitrary data. Players are logged by name, source (a badminfo
// link or typed in by hand), badminfo id and grades, never date of birth.
// No DOM code here, so it is unit tested in tests/audit.test.js.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GRADE = /^[A-K]$/;
const MAX_TEXT = 120;

const text = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : undefined);
const id = (v) => (typeof v === 'string' && GUID.test(v) ? v : undefined);
const oneOf = (...allowed) => (v) => (allowed.includes(v) ? v : undefined);
const route = (v) => (typeof v === 'string' && /^[a-z]{1,20}$/.test(v) ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
function grades(v) {
  if (!v || typeof v !== 'object') return undefined;
  const out = {};
  for (const d of ['singles', 'doubles', 'mixed']) out[d] = GRADE.test(v[d]) ? v[d] : '';
  return out;
}

const PLAYER = { name: text, source: oneOf('link', 'manual'), badminfoId: id, grades };
const GROUP = { tournament: id, group: text };

/** The actions the page may report, and the fields each may carry. */
export const EVENTS = {
  view: { route },
  player_add: PLAYER,
  player_edit: PLAYER,
  player_remove: PLAYER,
  player_update: PLAYER, // ratings and grades refreshed from badminfo
  player_favourite: { ...PLAYER, favourite: bool }, // starred or unstarred
  player_reorder: { name: text }, // dragged or moved with the arrow keys
  tournament_load: { tournament: id, name: text },
  group_import: GROUP,
  group_refresh: GROUP,
  match_refresh: GROUP,
  group_save: { group: text },
  group_delete: { group: text },
  example_load: { example: oneOf('two', 'circle', 'points') },
  analysis_load: { name: text, badminfoId: id }, // a player's Analysis page loaded from badminfo and BE
};

/** Logged by the server itself, never accepted from the page. */
export const SERVER_EVENTS = ['login', 'logout', 'login_failed'];

/**
 * A page-reported event, cleaned: `{ action, detail }` with only the allowed
 * fields, or null when the action isn't one the page may report.
 */
export function cleanEvent(body) {
  const fields = Object.hasOwn(EVENTS, body?.action) ? EVENTS[body.action] : null;
  if (!fields) return null;
  const detail = {};
  for (const [key, check] of Object.entries(fields)) {
    const value = check(body.detail?.[key]);
    if (value !== undefined && value !== '') detail[key] = value;
  }
  return { action: body.action, detail };
}

/** The visitor's address as Cloudflare saw it, with their country. */
export function visitor(request) {
  return {
    ip: (request.headers.get('CF-Connecting-IP') ?? '').slice(0, 64),
    country: String(request.cf?.country ?? '').slice(0, 8),
    userAgent: (request.headers.get('User-Agent') ?? '').slice(0, 200),
  };
}

export const RATE_LIMIT = 120; // events per IP per minute

/** Writes one event. Failures are logged, never shown: the audit trail must not break the page. */
export async function logEvent(env, request, user, action, detail = {}) {
  const v = visitor(request);
  try {
    await env.DB.prepare('INSERT INTO audit_log (ip, country, user_id, email, action, detail, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(v.ip, v.country, user?.id ?? null, user?.email ?? null, action, JSON.stringify(detail), v.userAgent).run();
  } catch (err) {
    console.error('audit', action, err);
  }
}

/**
 * What a User-Agent says about the visitor's device: { device: 'mobile' |
 * 'tablet' | 'desktop' | 'bot', os: 'iOS 18.1' | 'Android 14' | 'Windows 10/11'
 * | …, browser: 'Chrome 130' | 'Safari 18' | … }. Read when the audit trail is
 * shown, so older records are described too. Browsers now freeze parts of it
 * (Chrome on Android reports "Android 10", Windows 11 reports "NT 10.0").
 */
export function describeAgent(ua) {
  const s = String(ua ?? '');
  const find = (re) => re.exec(s);
  let device = 'desktop';
  let os = '';
  let x;
  if (/bot|crawl|spider|slurp|curl\/|wget|python-|headless/i.test(s)) device = 'bot';
  if ((x = find(/(iPhone|iPad|iPod)[^)]*? OS (\d+)[_.](\d+)/))) {
    os = `iOS ${x[2]}.${x[3]}`;
    if (device !== 'bot') device = x[1] === 'iPad' ? 'tablet' : 'mobile';
  } else if ((x = find(/Android (\d+(?:\.\d+)?)/))) {
    os = `Android ${x[1]}`;
    if (device !== 'bot') device = /Mobile/.test(s) ? 'mobile' : 'tablet';
  } else if ((x = find(/Windows NT (\d+\.\d+)/))) os = x[1] === '10.0' ? 'Windows 10/11' : `Windows NT ${x[1]}`;
  else if ((x = find(/Mac OS X (\d+)[_.](\d+)/))) os = `macOS ${x[1]}.${x[2]}`;
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';
  const browsers = [
    [/EdgiOS\/(\d+)|Edg(?:e|A)?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)|Opera\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/FxiOS\/(\d+)|Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+(?:\.\d+)?).*Safari/, 'Safari'],
  ];
  let browser = '';
  for (const [re, name] of browsers) {
    if ((x = find(re))) {
      browser = `${name} ${x.slice(1).find(Boolean)}`;
      break;
    }
  }
  return { device, os, browser };
}

/**
 * One visitor's devices without repeats, most recent first: identical ones
 * appear once, and one that says less (a bare "bot", or no browser) is dropped
 * when another of the same kind says the same and more.
 */
export function mergeDevices(agents) {
  const covers = (b, a) => a.device === b.device && (!a.os || a.os === b.os) && (!a.browser || a.browser === b.browser);
  const out = [];
  for (const a of agents) {
    if (out.some((b) => covers(b, a))) continue;
    for (let i = out.length - 1; i >= 0; i--) if (covers(a, out[i])) out.splice(i, 1);
    out.push(a);
  }
  return out;
}
