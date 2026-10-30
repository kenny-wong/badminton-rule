import { json, serverError } from '../../../lib/http.js';
import { endSession } from '../../../lib/session.js';
import { logEvent } from '../../../lib/audit.js';

export async function onRequestPost({ request, env, data }) {
  try {
    if (data.user) await logEvent(env, request, data.user, 'logout');
    return json({ ok: true }, 200, { 'Set-Cookie': await endSession(env.DB, request), 'Cache-Control': 'no-store' });
  } catch (err) {
    return serverError(err, 'logout');
  }
}
