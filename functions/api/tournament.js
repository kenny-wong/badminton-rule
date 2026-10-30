// GET /api/tournament?url=<badminfo link>: the tournament's round-robin groups,
// for the group calculator to import. Only the tournament id is taken from the
// link, and only badminfo's own API is ever fetched.

import { apiUrl, badminfoId, summarize } from '../../lib/badminfo.js';
import { fail, json } from '../../lib/http.js';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;
const CACHE_SECONDS = 300; // results change during the day; five minutes is fresh enough

export async function onRequestGet({ request }) {
  const id = badminfoId(new URL(request.url).searchParams.get('url'));
  if (!id) return fail(400, 'badLink');

  let upstream;
  try {
    upstream = await fetch(apiUrl(id), {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
  } catch (err) {
    console.error('badminfo fetch failed', id, err);
    return fail(502, 'unavailable');
  }
  // badminfo answers an unknown id with 204 No Content.
  if (upstream.status === 204 || upstream.status === 404) return fail(404, 'notFound');
  if (!upstream.ok) {
    console.error('badminfo answered', upstream.status, id);
    return fail(502, 'unavailable');
  }

  try {
    const body = await upstream.text();
    if (body.length > MAX_BYTES) return fail(502, 'unavailable');
    const tournament = summarize(JSON.parse(body), id);
    if (!tournament) return fail(404, 'notFound');
    return json(tournament, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
  } catch (err) {
    console.error('badminfo answer unreadable', id, err);
    return fail(502, 'unavailable');
  }
}
