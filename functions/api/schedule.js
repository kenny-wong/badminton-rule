// GET /api/schedule?be=<BE tournament id>&from=YYYY-MM-DD&to=YYYY-MM-DD: when
// each match is due (or was played), on which court and for how long, from
// Badminton England's tournament pages. Events longer than MAX_DAYS answer
// { matches: [], skipped: true }.

import { consentCookie, fetchDay, parseMatches, scheduleDays } from '../../lib/schedule.js';
import { fail, json } from '../../lib/http.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_SECONDS = 60;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const be = url.searchParams.get('be') ?? '';
  if (!GUID.test(be)) return fail(400, 'badLink');
  const days = scheduleDays(url.searchParams.get('from'), url.searchParams.get('to') || url.searchParams.get('from'));
  if (!days) return json({ matches: [], skipped: true }, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
  try {
    const cookie = await consentCookie();
    const pages = await Promise.all(days.map((d) => fetchDay(be.toLowerCase(), d, cookie)));
    const matches = pages.flatMap((html, i) => parseMatches(html, days[i]));
    return json({ matches }, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
  } catch (err) {
    console.error('schedule', be, err);
    return fail(502, 'unavailable');
  }
}
