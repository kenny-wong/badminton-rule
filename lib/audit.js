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
  tournament_load: { tournament: id, name: text },
  group_import: GROUP,
  group_refresh: GROUP,
  match_refresh: GROUP,
  group_save: { group: text },
  group_delete: { group: text },
  example_load: { example: oneOf('two', 'circle', 'points') },
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
