// Runs before every /api route: blocks cross-site writes and looks up who is
// logged in (data.user, or null). Signing in is optional; every route works
// without it.
import { fail } from '../../lib/http.js';
import { getSessionUser } from '../../lib/session.js';

export async function onRequest({ request, env, data, next }) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return fail(403, 'crossSite');
  }
  data.user = null;
  if (env.DB) {
    try {
      data.user = await getSessionUser(env.DB, request);
    } catch (err) {
      console.error('session lookup', err); // the page still works logged out
    }
  }
  const res = await next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
}
