// POST { action, detail }: the page reports a page view or an action for the
// audit trail. Only the actions and fields in lib/audit.js are kept, and each
// IP may send at most RATE_LIMIT events a minute.
import { fail, isoAt, json, readJson } from '../../lib/http.js';
import { RATE_LIMIT, cleanEvent, logEvent, visitor } from '../../lib/audit.js';

export async function onRequestPost({ request, env, data }) {
  const event = cleanEvent(await readJson(request));
  if (!event) return fail(400, 'badEvent');
  try {
    const { ip } = visitor(request);
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE ip = ? AND at > ?').bind(ip, isoAt(-60000)).first();
    if ((recent?.n ?? 0) >= RATE_LIMIT) return fail(429, 'tooMany');
  } catch (err) {
    console.error('audit rate check', err);
  }
  await logEvent(env, request, data.user, event.action, event.detail);
  return json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
}
