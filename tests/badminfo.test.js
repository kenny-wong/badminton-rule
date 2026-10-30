import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apiUrl, badminfoId, playerApiUrl, summarize, summarizePlayer } from '../lib/badminfo.js';
import { onRequestGet } from '../functions/api/tournament.js';
import { onRequestGet as getPlayer } from '../functions/api/player.js';
import { ID, PLAYER, PLAYER_ID, SAMPLE, playerId } from './fixtures/badminfo-sample.js';

test('badminfoId takes the id from a badminfo tournament link and nothing else', () => {
  assert.equal(badminfoId(`https://badminfo.com/Tournament/${ID}?t=OD&s=g`), ID);
  assert.equal(badminfoId(`  https://www.badminfo.com/tournament/${ID.toUpperCase()}/  `), ID);
  assert.equal(badminfoId(`https://badminfo.com.evil.example/Tournament/${ID}`), null);
  assert.equal(badminfoId(`https://evil.example/?u=https://badminfo.com/Tournament/${ID}`), null);
  assert.equal(badminfoId(`https://be.tournamentsoftware.com/tournament/${ID}/draw/1`), null);
  assert.equal(badminfoId('https://badminfo.com/Tournament/not-a-guid'), null);
  assert.equal(badminfoId(`ftp://badminfo.com/Tournament/${ID}`), null);
  assert.equal(badminfoId('not a link'), null);
  assert.equal(badminfoId(null), null);
});

test('summarize keeps the round-robin groups with their teams and scores', () => {
  const s = summarize(SAMPLE, ID);
  assert.equal(s.name, 'Example Super Series');
  assert.equal(s.start, '2026-10-25');
  assert.equal(s.end, '2027-04-18');
  assert.equal(s.url, `https://badminfo.com/Tournament/${ID}`);
  // The elimination draw and the empty group are left out.
  assert.deepEqual(s.groups.map((g) => g.name), ['WD Example']);
  const [group] = s.groups;
  assert.deepEqual(group.teams, [['Amy', 'Bea'], ['Cat', 'Dee'], ['Eve', 'Fay']]);
  assert.deepEqual(group.ids, [[playerId(0), playerId(1)], [playerId(2), playerId(3)], [playerId(4), playerId(5)]]);
  assert.deepEqual(group.matches[0], { a: 0, b: 1, games: [[21, 15], [21, 11]], winner: 'a', note: null });
  assert.deepEqual(group.matches[1].games, [[22, 20], [17, 21], [22, 20]]);
  // The same pair in another order is the same team.
  assert.deepEqual(group.matches[2], { a: 2, b: 1, games: [], winner: 'b', note: 'Walkover' });
});

test('summarize rejects JSON that is not a tournament and tolerates bad values', () => {
  assert.equal(summarize(null, ID), null);
  assert.equal(summarize({ beTournament: null }, ID), null);
  const s = summarize({ beTournament: { events: [{ draws: [{ type: 'Round Robin', rubbers: [
    { team1PlayerIndexes: [1], team2PlayerIndexes: [2], games: [{ team1Score: 21, team2Score: 'x' }, null] },
    { team1PlayerIndexes: [1], team2PlayerIndexes: [1] },
    null,
  ] }] }] } }, ID);
  assert.deepEqual(s.groups[0].teams, [['?'], ['?']]);
  assert.deepEqual(s.groups[0].matches, [{ a: 0, b: 1, games: [], winner: null, note: null }]);
});

function stubFetch(t, response) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  });
  return calls;
}

const get = (link) => onRequestGet({ request: new Request(`https://example.test/api/tournament?url=${encodeURIComponent(link)}`) });

test('the API fetches only badminfo, by id, and returns the summary', async (t) => {
  const calls = stubFetch(t, new Response(JSON.stringify(SAMPLE), { status: 200 }));
  const res = await get(`https://badminfo.com/Tournament/${ID}?t=OD`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /max-age=/);
  const body = await res.json();
  assert.equal(body.groups[0].name, 'WD Example');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, apiUrl(ID));
  assert.equal(calls[0].init.redirect, 'manual');
});

test('the API answers 400 for a bad link without fetching anything', async (t) => {
  const calls = stubFetch(t, new Response('{}'));
  const res = await get('https://example.com/');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'badLink' });
  assert.equal(calls.length, 0);
});

test('the API reports a missing tournament and an unreachable badminfo', async (t) => {
  const link = `https://badminfo.com/Tournament/${ID}`;
  t.mock.method(console, 'error', () => {});
  stubFetch(t, new Response(null, { status: 204 }));
  assert.equal((await get(link)).status, 404);
  t.mock.restoreAll();
  t.mock.method(console, 'error', () => {});
  stubFetch(t, new Response('oops', { status: 500 }));
  assert.deepEqual(await (await get(link)).json(), { error: 'unavailable' });
  t.mock.restoreAll();
  t.mock.method(console, 'error', () => {});
  stubFetch(t, new Response('<html>', { status: 200 }));
  assert.equal((await get(link)).status, 502);
  t.mock.restoreAll();
  t.mock.method(console, 'error', () => {});
  stubFetch(t, new TypeError('network down'));
  assert.equal((await get(link)).status, 502);
});

test('badminfoId reads player links only when asked for a player', () => {
  assert.equal(badminfoId(`https://badminfo.com/Player/${PLAYER_ID}`, 'player'), PLAYER_ID);
  assert.equal(badminfoId(`https://badminfo.com/Player/${PLAYER_ID}`), null);
  assert.equal(badminfoId(`https://badminfo.com/Tournament/${ID}`, 'player'), null);
});

test('summarizePlayer keeps the latest grade in each discipline, the BE number and ratings', () => {
  assert.deepEqual(summarizePlayer(PLAYER, PLAYER_ID), {
    source: 'badminfo',
    id: PLAYER_ID,
    url: `https://badminfo.com/Player/${PLAYER_ID}`,
    name: 'Kim Example',
    beNumber: '1234567',
    grades: { singles: 'H', doubles: 'I', mixed: 'H' },
    ratings: { singles: 515, doubles: 463, mixed: 473 },
    ratingsDate: '2026-10-30',
  });
  const bare = summarizePlayer({ name: 'Lee', gradings: [{ key: 'Single', value: 'Z' }], beNumber: 'x', ratings: { singlesRating: -5 } }, PLAYER_ID);
  assert.deepEqual([bare.beNumber, bare.grades.singles, bare.ratings.singles, bare.ratingsDate], ['', '', null, null]);
  assert.equal(summarizePlayer(null, PLAYER_ID), null);
});

test('the player API fetches only badminfo, by id', async (t) => {
  const calls = stubFetch(t, new Response(JSON.stringify(PLAYER), { status: 200 }));
  const res = await getPlayer({ request: new Request(`https://example.test/api/player?url=${encodeURIComponent(`https://badminfo.com/Player/${PLAYER_ID}`)}`) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).beNumber, '1234567');
  assert.equal(calls[0].url, playerApiUrl(PLAYER_ID));
  const bad = await getPlayer({ request: new Request(`https://example.test/api/player?url=${encodeURIComponent(`https://badminfo.com/Tournament/${ID}`)}`) });
  assert.equal(bad.status, 400);
  assert.equal(calls.length, 1);
});
