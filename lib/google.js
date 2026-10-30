// "Sign in with Google" (OAuth 2.0 authorization code flow).

export const GOOGLE_STATE_COOKIE = 'g_state';

export const googleEnabled = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const redirectUri = request => `${new URL(request.url).origin}/api/auth/google/callback`;

export function googleAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const { id_token: idToken } = await res.json();
  if (!idToken) throw new Error('Google sent no id_token');
  return idToken;
}

// The id_token comes straight from Google's token endpoint over TLS, so its signature
// needn't be re-checked, but its claims still must be (OpenID Connect Core 3.1.3.7).
export function readIdToken(idToken, clientId, nowSeconds = Date.now() / 1000) {
  const part = String(idToken).split('.')[1];
  if (!part) throw new Error('Malformed id_token');
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new Error('Wrong issuer');
  if (claims.aud !== clientId) throw new Error('Wrong audience');
  if (!(claims.exp > nowSeconds)) throw new Error('Expired id_token');
  if (!claims.sub || !claims.email) throw new Error('Missing account details');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('Google email not verified');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: String(claims.name || '') };
}
