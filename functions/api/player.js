// GET /api/player?url=<badminfo player link>: the player's name, BE number,
// grades and ratings, for the My players page. Only the player id is taken
// from the link, and only badminfo's own API is ever fetched.

import { badminfoId, getJson, playerApiUrl, summarizePlayer } from '../../lib/badminfo.js';
import { fail, json } from '../../lib/http.js';

const CACHE_SECONDS = 300; // grades and ratings change at most daily

export async function onRequestGet({ request }) {
  const id = badminfoId(new URL(request.url).searchParams.get('url'), 'player');
  if (!id) return fail(400, 'badLink');
  const got = await getJson(playerApiUrl(id), CACHE_SECONDS);
  if (got.error) return fail(got.status, got.error);
  const player = summarizePlayer(got.json, id);
  if (!player) return fail(404, 'notFound');
  return json(player, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
}
