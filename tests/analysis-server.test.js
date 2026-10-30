import assert from 'node:assert/strict';
import { test } from 'node:test';

import { playerHistory } from '../lib/analysis.js';
import { beProfile, parseRanking, parseWinLoss } from '../lib/be-profile.js';
import { playerApiUrl } from '../lib/badminfo.js';
import { onRequestGet } from '../functions/api/analysis.js';
import { BE_ID, BE_OVERVIEW, BE_RANKING, HISTORY, ME } from './fixtures/badminfo-history-sample.js';
import { playerId } from './fixtures/badminfo-sample.js';

test('playerHistory lists the player’s matches oldest first, from their side', () => {
  const h = playerHistory(HISTORY, ME);
  assert.equal(h.name, 'Alex Example');
  assert.equal(h.beId, BE_ID);
  assert.deepEqual(h.ratings, { singles: 540, doubles: 480, mixed: null });
  assert.equal(h.matches.length, 7, 'someone else’s match is skipped');
  assert.deepEqual(h.matches.map((m) => m.date), ['2026-02-28', '2026-04-25', '2026-04-25', '2026-10-17', '2026-10-17', '2026-10-17', '2026-10-17']);
  const [league, group, final] = h.matches;
  assert.equal(league.level, 'league');
  assert.equal(league.tournament, 'County League');
  assert.equal(league.won, false);
  assert.deepEqual(league.games, [[21, 15], [17, 21], [18, 21]], 'scores turned to the player’s side');
  assert.deepEqual(league.partners, [{ name: 'Di', id: playerId(3), rating: 470 }]);
  assert.deepEqual(group.opponents, [{ name: 'Flo', id: playerId(5), rating: 450 }]);
  assert.equal(group.level, 1);
  assert.equal(group.knockout, false);
  assert.equal(final.knockout, true);
  assert.equal(final.won, true);
  assert.equal(final.ratingBefore, 504);
  assert.equal(final.ratingChange, 16);
  assert.equal(final.winChance, 0.7);
  const unplayed = h.matches.at(-1);
  assert.equal(unplayed.won, null);
  assert.equal(unplayed.note, 'Not played');
  assert.equal(unplayed.ratingChange, null);
});

test('playerHistory keeps valid grades, the period’s prediction and medals', () => {
  const h = playerHistory(HISTORY, ME);
  assert.deepEqual(h.gradeHistory.map((g) => `${g.discipline} ${g.grade} ${g.since}`), ['doubles I 2025-10-28', 'singles H 2026-06-26', 'singles G 2026-10-30']);
  assert.deepEqual(h.periods.current.singles, { from: 'H', best: 'G', worst: 'G', matches: 1, won: 1 });
  assert.deepEqual(h.periods.current.doubles, { from: 'I', best: 'H', worst: 'I', matches: 1, won: 0 });
  assert.equal(h.periods.previous, null);
  assert.deepEqual(h.trophies.map((t) => [t.place, t.event, t.date]), [['runnerUp', 'OD', '2026-10-17'], ['winner', 'OS', '2026-04-25']]);
  assert.equal(h.trophies[0].partner, 'Di');
});

test('playerHistory rejects what isn’t a player and tolerates bad values', () => {
  assert.equal(playerHistory(null, ME), null);
  assert.equal(playerHistory({ name: 5 }, ME), null);
  const h = playerHistory({ name: 'X', competitionsWithRubbers: 'no', gradings: [{}], trophies: [null] }, ME);
  assert.deepEqual(h.matches, []);
  assert.deepEqual(h.gradeHistory, []);
  assert.deepEqual(h.trophies, []);
  const odd = playerHistory({ name: 'X', competitionsWithRubbers: [{ tournament: { startDate: '2026-01-01' }, rubbers: [
    { discipline: 0, winningTeam: 1, team1Players: [{ id: ME, previousRating: 0 }], team2Players: [{ name: 'Y' }], games: [{ team1Score: 'a' }],
      ratingsEffect: { rubberProcessingStatus: 0, thisPlayerRatingChange: 'x', thisPlayerWinChance: 0 } },
  ] }] }, ME);
  assert.deepEqual(odd.matches[0].games, []);
  assert.equal(odd.matches[0].ratingBefore, null);
  assert.equal(odd.matches[0].ratingChange, null);
  assert.equal(odd.matches[0].winChance, null, 'a win chance of exactly 0 (an unrated first match) is unknown');
});

test('BE profile pages give win-loss, ranking and qualifying matches', () => {
  assert.deepEqual(parseWinLoss(BE_OVERVIEW), {
    total: { career: { won: 12, lost: 8 }, year: { won: 10, lost: 5 } },
    singles: { career: { won: 9, lost: 3 }, year: { won: 8, lost: 2 } },
    doubles: { career: { won: 3, lost: 5 }, year: { won: 2, lost: 3 } },
  });
  assert.deepEqual(parseRanking(BE_RANKING), {
    week: '43-2026',
    rankings: [{ event: 'OS', rank: 473, points: 4529, rating: 540 }, { event: "Men's XD", rank: 1259, points: 395, rating: 456 }],
    grading: [{ event: 'OS', won: 14, lost: 2 }],
  });
  assert.deepEqual(parseWinLoss('<p>404</p>'), {});
  assert.deepEqual(parseRanking('<p>404</p>'), { week: '', rankings: [], grading: [] });
});

/** Answers each fetch by its address, recording the calls. */
function stubFetch(t, answer) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    return answer(String(url));
  });
  return calls;
}

const consent = () => new Response('', { status: 302, headers: { 'Set-Cookie': 'st=abc; path=/' } });

test('beProfile reads both pages with the necessary-cookies consent, and gives up quietly', async (t) => {
  const calls = stubFetch(t, (url) => (url.endsWith('/cookiewall/Save') ? consent() : new Response(url.endsWith('/ranking') ? BE_RANKING : BE_OVERVIEW)));
  const be = await beProfile(BE_ID);
  assert.equal(be.url, `https://be.tournamentsoftware.com/player-profile/${BE_ID}`);
  assert.equal(be.winLoss.total.career.won, 12);
  assert.equal(be.rankings[0].rank, 473);
  assert.equal(calls.length, 3);
  assert.ok(calls.slice(1).every((c) => c.init.headers.Cookie === 'st=abc'));
  assert.equal(await beProfile('not-an-id'), null);
  t.mock.restoreAll();
  t.mock.method(console, 'error', () => {});
  stubFetch(t, () => new Response('down', { status: 503 }));
  assert.equal(await beProfile(BE_ID), null);
});

const get = (id) => onRequestGet({ request: new Request(`https://example.test/api/analysis?id=${encodeURIComponent(id)}`) });

test('the API returns the history with BE’s part, fetching only badminfo and BE', async (t) => {
  const calls = stubFetch(t, (url) => {
    if (url === playerApiUrl(ME)) return new Response(JSON.stringify(HISTORY));
    if (url.endsWith('/cookiewall/Save')) return consent();
    return new Response(url.endsWith('/ranking') ? BE_RANKING : BE_OVERVIEW);
  });
  const res = await get(ME.toUpperCase());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /max-age=/);
  const body = await res.json();
  assert.equal(body.matches.length, 7);
  assert.equal(body.url, `https://badminfo.com/Player/${ME}`);
  assert.equal(body.be.grading[0].won, 14);
  assert.ok(calls.every((c) => c.url.startsWith('https://badstats.azurewebsites.net/') || c.url.startsWith('https://be.tournamentsoftware.com/')));
});

test('the API answers 400 for a bad id and passes on badminfo’s errors; BE failing leaves be null', async (t) => {
  const calls = stubFetch(t, () => new Response('{}'));
  assert.equal((await get('https://badminfo.com/Player/x')).status, 400);
  assert.equal(calls.length, 0);
  t.mock.restoreAll();
  stubFetch(t, () => new Response(null, { status: 204 }));
  assert.deepEqual(await (await get(ME)).json(), { error: 'notFound' });
  t.mock.restoreAll();
  t.mock.method(console, 'error', () => {});
  stubFetch(t, (url) => (url === playerApiUrl(ME) ? new Response(JSON.stringify(HISTORY)) : new Response('down', { status: 503 })));
  const body = await (await get(ME)).json();
  assert.equal(body.be, null);
  assert.equal(body.matches.length, 7);
});
