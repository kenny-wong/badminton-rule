// GET /api/admin/audit?q=<ip or email>: the audit trail for the site's owners
// (ADMIN_EMAILS). Totals, visitors grouped by IP and account (visits while not
// signed in are a row of their own), page views per page, and the
// latest events, optionally only those of one IP or account.
import { fail, json, serverError } from '../../../lib/http.js';
import { isAdmin } from '../../../lib/session.js';
import { describeAgent, mergeDevices } from '../../../lib/audit.js';

const LIMIT = 300;

export async function onRequestGet({ request, env, data }) {
  if (!isAdmin(env, data.user)) return fail(data.user ? 403 : 401, data.user ? 'notAdmin' : 'login');
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  const db = env.DB;
  try {
    const [totals, visitors, pages, events, agents] = await db.batch([
      db.prepare(`SELECT COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT user_id) AS accounts, SUM(action = 'view') AS views, COUNT(*) AS events,
        SUM(action = 'view' AND at >= strftime('%Y-%m-%dT00:00:00Z', 'now')) AS viewsToday FROM audit_log`),
      db.prepare(`SELECT ip, email, MAX(country) AS country, SUM(action = 'view') AS views,
        COUNT(*) AS events, MIN(at) AS firstAt, MAX(at) AS lastAt FROM audit_log GROUP BY ip, email ORDER BY lastAt DESC LIMIT ?`).bind(LIMIT),
      db.prepare(`SELECT json_extract(detail, '$.route') AS route, COUNT(*) AS views, COUNT(DISTINCT ip) AS ips
        FROM audit_log WHERE action = 'view' GROUP BY route ORDER BY views DESC`),
      q
        ? db.prepare('SELECT at, ip, country, email, action, detail, user_agent FROM audit_log WHERE ip = ?1 OR email = ?1 ORDER BY id DESC LIMIT ?2').bind(q, LIMIT)
        : db.prepare('SELECT at, ip, country, email, action, detail, user_agent FROM audit_log ORDER BY id DESC LIMIT ?').bind(LIMIT),
      db.prepare('SELECT ip, email, user_agent FROM audit_log GROUP BY ip, email, user_agent ORDER BY MAX(id) DESC LIMIT 2000'),
    ]);
    // Each visitor's (IP and account's) devices, described once each.
    const visitor = (v) => `${v.ip}
${v.email ?? ''}`;
    const devices = new Map();
    for (const row of agents.results) {
      const list = devices.get(visitor(row)) ?? [];
      list.push(describeAgent(row.user_agent));
      devices.set(visitor(row), list);
    }
    for (const [key, list] of devices) devices.set(key, mergeDevices(list));
    return json({
      totals: totals.results[0],
      visitors: visitors.results.map((v) => ({ ...v, devices: devices.get(visitor(v)) ?? [] })),
      pages: pages.results,
      events: events.results.map(({ user_agent: ua, ...e }) => ({ ...e, detail: JSON.parse(e.detail || '{}'), agent: describeAgent(ua) })),
    }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return serverError(err, 'admin audit');
  }
}
