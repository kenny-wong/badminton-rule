import assert from 'node:assert/strict';
import { test } from 'node:test';

import { consentCookie, parseMatches, scheduleDays } from '../lib/schedule.js';
import { onRequestGet as getSchedule } from '../functions/api/schedule.js';

// The shape of one day's match list on Badminton England's tournament pages, cut down, with made-up players.
const player = (id, name) => `<div class="match__row-title-value"><span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=x&amp;player=${id}" data-player-id="${id}" data-club-id="" class="nav-link"><span class="nav-link__value">${name}</span>
</a></span></div>`;
const match = ({ draw, round, aside, court, a, b, won, games }) => `<li class="match-group__item">
<div class="match match--list">
    <div class="match__header">
          <ul class="match__header-title">
              <li class="match__header-title-item">
      <a href="/sport/draw.aspx" class="nav-link"><span class="nav-link__value">${draw}</span></a>
              </li>
              <li class="match__header-title-item">
      <span title="${round}" class="nav-link"><span class="nav-link__value">${round}</span></span>
              </li>
          </ul>
              <div class="match__header-aside">
      <span class="nav-link btn--primary btn match__header-aside-block has-tooltip--wide" title="${aside}" data-toggle="tooltip">
<span class="nav-link__value"></span></span>
        </div>
    </div>
  <div class="match__body">
    <div class="match__row-wrapper">
<div class="match__row ${won === 1 ? 'has-won' : ''}"><div class="match__row-title">${a.map((n, i) => player(10 + i, n)).join('')}</div></div>
<div class="match__row ${won === 2 ? 'has-won' : ''}"><div class="match__row-title">${b.map((n, i) => player(20 + i, n)).join('')}</div></div>
    </div>
      <div class="match__result">
${games.map(([x, y]) => `<ul class="points"><li class="points__cell points__cell--won"> ${x}
          </li><li class="points__cell "> ${y}
          </li></ul>`).join('')}
      </div>
  </div>
    <div class="match__footer"><ul class="match__footer-list"><li class="match__footer-list-item">
      <span class="nav-link"><span class="nav-link__value">${court}</span></span>
    </li></ul></div>
</div>
</li>`;
const PAGE = `<ol class="match-group"><li class="match-group__item"><div class="match-group__wrapper">
<h5 class="sticky is-sticky match-group__header"> 9:00 </h5><ol class="match-group">
${match({ draw: 'XD U15 - Group A', round: 'Round 1', aside: 'Duration: 12m | Example School - 3', court: 'Example School - 3', a: ['Amy Lee [1]', 'Ben Ng'], b: ['Cat Ho', 'Dan Wu [3/4]'], won: 1, games: [[21, 13]] })}
${match({ draw: 'OS U15 - Group B', round: 'Round 2', aside: 'Duration: 25m | Example School - 4', court: 'Example School - 4', a: ['Eli Ma'], b: ['Fin O&#39;Neil'], won: 2, games: [[19, 21], [21, 15], [12, 21]] })}
</ol></div></li><li class="match-group__item"><div class="match-group__wrapper">
<h5 class="sticky is-sticky match-group__header"> 14:45 </h5><ol class="match-group">
${match({ draw: 'XD U15', round: 'Final', aside: 'Example School - 1', court: 'Example School - 1', a: ['Amy Lee', 'Ben Ng'], b: ['Gus Yu', 'Hal Li'], won: 0, games: [] })}
</ol></div></li></ol>`;

test('parseMatches reads the time, draw, court, duration, players and games of each match', () => {
  const m = parseMatches(PAGE, '20261024');
  assert.equal(m.length, 3);
  assert.deepEqual(m[0], {
    date: '2026-10-24', time: '09:00', draw: 'XD U15 - Group A', round: 'Round 1', court: 'Example School - 3',
    duration: 12, teams: [['Amy Lee', 'Ben Ng'], ['Cat Ho', 'Dan Wu']], games: [[21, 13]], winner: 1,
  });
  assert.deepEqual([m[1].time, m[1].teams, m[1].games, m[1].winner, m[1].duration], ['09:00', [['Eli Ma'], ["Fin O'Neil"]], [[19, 21], [21, 15], [12, 21]], 2, 25]);
  // Not played yet: a time and court, no games, no duration.
  assert.deepEqual([m[2].time, m[2].draw, m[2].games, m[2].winner, m[2].duration, m[2].court], ['14:45', 'XD U15', [], null, null, 'Example School - 1']);
  assert.deepEqual(parseMatches('<html>nothing</html>', '20261024'), []);
});

test('scheduleDays lists each day of a short event, and skips long ones', () => {
  assert.deepEqual(scheduleDays('2026-10-24'), ['20261024']);
  assert.deepEqual(scheduleDays('2026-10-31', '2026-11-02'), ['20261031', '20261101', '20261102']);
  assert.equal(scheduleDays('2026-10-25', '2027-04-18'), null); // a season-long series
  assert.equal(scheduleDays('2026-10-25', '2026-10-24'), null);
  assert.equal(scheduleDays('soon'), null);
  assert.equal(scheduleDays(null), null);
});

function stubFetch(t, handler) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); });
  return calls;
}

test('consentCookie accepts only the necessary cookies and keeps the consent cookie', async (t) => {
  const calls = stubFetch(t, () => new Response(null, { status: 302, headers: [['Set-Cookie', 'ASP.NET_SessionId=abc; path=/'], ['Set-Cookie', 'st=l=2057&c=1; expires=Sat, 30-Oct-2027 16:15:57 GMT; path=/; secure']] }));
  assert.equal(await consentCookie(), 'st=l=2057&c=1');
  assert.match(calls[0].url, /\/cookiewall\/Save$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.doesNotMatch(calls[0].init.body, /CookiePurposes/); // no optional purposes
});

test('the schedule route reads each day and answers the matches', async (t) => {
  const calls = stubFetch(t, (url) => (url.endsWith('/cookiewall/Save')
    ? new Response(null, { status: 302, headers: { 'Set-Cookie': 'st=ok; path=/' } })
    : new Response(PAGE, { status: 200 })));
  const be = 'b997c3c5-38fb-4caf-a402-009664189ad6';
  const res = await getSchedule({ request: new Request(`https://x.test/api/schedule?be=${be}&from=2026-10-24&to=2026-10-25`) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.matches.length, 6); // two days of the same page
  assert.deepEqual(calls.map((c) => c.url.split('/').slice(-2).join('/')), ['cookiewall/Save', 'matches/20261024', 'matches/20261025']);
  assert.equal(calls[1].init.headers.Cookie, 'st=ok');
  // Bad id: nothing fetched. A season-long event: skipped.
  assert.equal((await getSchedule({ request: new Request('https://x.test/api/schedule?be=../x&from=2026-10-24') })).status, 400);
  assert.deepEqual(await (await getSchedule({ request: new Request(`https://x.test/api/schedule?be=${be}&from=2026-10-25&to=2027-04-18`) })).json(), { matches: [], skipped: true });
  assert.equal(calls.length, 3);
});

test('the schedule route answers 502 when the pages can’t be read', async (t) => {
  t.mock.method(console, 'error', () => {});
  stubFetch(t, () => new Response('', { status: 302, headers: { Location: '/cookiewall' } }));
  const res = await getSchedule({ request: new Request('https://x.test/api/schedule?be=b997c3c5-38fb-4caf-a402-009664189ad6&from=2026-10-24') });
  assert.equal(res.status, 502);
});
