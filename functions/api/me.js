// Who is logged in (or null), whether Google sign-in is switched on, and
// whether this account may read the audit trail.
import { json } from '../../lib/http.js';
import { googleEnabled } from '../../lib/google.js';
import { isAdmin, publicUser } from '../../lib/session.js';

export function onRequestGet({ env, data }) {
  return json({
    user: data.user ? publicUser(data.user) : null,
    google: googleEnabled(env),
    admin: isAdmin(env, data.user),
  }, 200, { 'Cache-Control': 'no-store' });
}
