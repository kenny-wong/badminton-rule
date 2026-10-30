// GET /api/analysis?id=<badminfo player id>: everything the Analysis page needs
// about one player: their match history, grades and medals from badminfo, and,
// when badminfo knows their Badminton England id, their win-loss, national
// ranking and qualifying matches from BE's own pages (`be`, null when those
// can't be read). Only badminfo's API and BE's player pages are ever fetched.

import { getJson, playerApiUrl, playerPageUrl } from '../../lib/badminfo.js';
import { playerHistory } from '../../lib/analysis.js';
import { beProfile } from '../../lib/be-profile.js';
import { fail, json } from '../../lib/http.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_SECONDS = 600; // results and ratings change at most a few times a day

export async function onRequestGet({ request }) {
  const id = (new URL(request.url).searchParams.get('id') ?? '').toLowerCase();
  if (!GUID.test(id)) return fail(400, 'badLink');
  const got = await getJson(playerApiUrl(id), CACHE_SECONDS);
  if (got.error) return fail(got.status, got.error);
  const history = playerHistory(got.json, id);
  if (!history) return fail(404, 'notFound');
  const be = history.beId ? await beProfile(history.beId) : null;
  return json({ ...history, url: playerPageUrl(id), be }, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
}
