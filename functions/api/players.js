// An account's saved players, so they follow the reader to another device.
// GET: the list (null before the first save); PUT { players }: replace it.
// The list is checked with the same sanitizeProfiles() the page uses.
import { fail, json, readJson, serverError, unauthorized } from '../../lib/http.js';
import { sanitizeProfiles } from '../../public/profiles.js';

const MAX_BYTES = 200_000;

export async function onRequestGet({ env, data }) {
  if (!data.user) return unauthorized();
  try {
    const row = await env.DB.prepare('SELECT data, updated_at FROM player_lists WHERE user_id = ?').bind(data.user.id).first();
    return json({ players: row ? sanitizeProfiles(JSON.parse(row.data)) : null, updatedAt: row?.updated_at ?? null }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return serverError(err, 'players get');
  }
}

export async function onRequestPut({ request, env, data }) {
  if (!data.user) return unauthorized();
  const body = await readJson(request);
  if (!Array.isArray(body?.players)) return fail(400, 'badPlayers');
  const players = sanitizeProfiles(body.players);
  const text = JSON.stringify(players);
  if (text.length > MAX_BYTES) return fail(400, 'tooBig');
  try {
    await env.DB.prepare(`INSERT INTO player_lists (user_id, data, updated_at) VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(data.user.id, text).run();
    return json({ ok: true, count: players.length }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return serverError(err, 'players put');
  }
}
