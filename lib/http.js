// JSON responses for the API routes in functions/api/.

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

/** An error the page can show: `error` is a short code it looks up in its own language. */
export const fail = (status, error) => json({ error }, status, { 'Cache-Control': 'no-store' });

export const unauthorized = () => fail(401, 'login');

/** Logs the error and answers 500, without showing the page any details. */
export function serverError(err, where) {
  console.error(where, err);
  return fail(500, 'server');
}

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export const cookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/** ISO-8601 UTC without milliseconds, matching the database's strftime defaults. */
export const isoAt = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString().replace(/\.\d{3}Z$/, 'Z');
