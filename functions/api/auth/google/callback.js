// Google sends the browser back here after sign-in. A first sign-in creates the account.
import { cookie, getCookie } from '../../../../lib/http.js';
import { newId, timingSafeEqual } from '../../../../lib/crypto.js';
import { GOOGLE_STATE_COOKIE, exchangeCode, googleEnabled, readIdToken, redirectUri } from '../../../../lib/google.js';
import { createSession } from '../../../../lib/session.js';
import { logEvent } from '../../../../lib/audit.js';

function back(request, hash, setCookies = []) {
  const headers = new Headers({ Location: `${new URL(request.url).origin}/${hash}`, 'Cache-Control': 'no-store' });
  for (const c of [cookie(GOOGLE_STATE_COOKIE, '', 0), ...setCookies]) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return back(request, '#/check'); // the reader cancelled
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!googleEnabled(env) || !code || !state || !timingSafeEqual(state, getCookie(request, GOOGLE_STATE_COOKIE))) {
    return back(request, '?login=failed#/check');
  }
  try {
    const idToken = await exchangeCode({ code, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri(request) });
    const g = readIdToken(idToken, env.GOOGLE_CLIENT_ID);
    const db = env.DB;
    let user = await db.prepare('SELECT id FROM users WHERE google_sub = ?').bind(g.sub).first();
    if (user) {
      // Follow Google email changes, unless another account already uses that address.
      await db.prepare('UPDATE users SET email = ?1, name = ?2 WHERE id = ?3 AND NOT EXISTS (SELECT 1 FROM users WHERE email = ?1 AND id != ?3)')
        .bind(g.email, g.name.slice(0, 80), user.id).run();
    } else {
      // A different Google account once had this email (Google lets addresses be reused): don't hand that account over.
      if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(g.email).first()) return back(request, '?login=failed#/check');
      user = { id: newId() };
      await db.prepare('INSERT INTO users (id, email, name, google_sub) VALUES (?, ?, ?, ?)').bind(user.id, g.email, g.name.slice(0, 80), g.sub).run();
    }
    await logEvent(env, request, { id: user.id, email: g.email }, 'login');
    return back(request, '#/check', [await createSession(db, user.id)]);
  } catch (err) {
    console.error('google callback', err);
    await logEvent(env, request, null, 'login_failed');
    return back(request, '?login=failed#/check');
  }
}
