// JSON responses for the API routes in functions/api/.

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

/** An error the page can show: `error` is a short code it looks up in its own language. */
export const fail = (status, error) => json({ error }, status, { 'Cache-Control': 'no-store' });
