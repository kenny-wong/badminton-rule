// GET /api/tournament?url=<badminfo link>: the tournament's round-robin groups,
// for the group calculator to import. Only the tournament id is taken from the
// link, and only badminfo's own API is ever fetched.

import { apiUrl, badminfoId, getJson, summarize } from '../../lib/badminfo.js';
import { fail, json } from '../../lib/http.js';

const CACHE_SECONDS = 60; // the refresh buttons want fresh results; a minute still spares badminfo repeat requests

export async function onRequestGet({ request }) {
  const id = badminfoId(new URL(request.url).searchParams.get('url'));
  if (!id) return fail(400, 'badLink');
  const got = await getJson(apiUrl(id), CACHE_SECONDS);
  if (got.error) return fail(got.status, got.error);
  const tournament = summarize(got.json, id);
  if (!tournament) return fail(404, 'notFound');
  return json(tournament, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
}
