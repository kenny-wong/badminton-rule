import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EVENTS, SERVER_EVENTS, cleanEvent, describeAgent, mergeDevices, visitor } from '../lib/audit.js';
import { isAdmin } from '../lib/session.js';
import { onRequestPost as postEvent } from '../functions/api/events.js';
import { onRequestGet as getPlayers, onRequestPut as putPlayers } from '../functions/api/players.js';
import { onRequestGet as getAudit } from '../functions/api/admin/audit.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';

const ID = '11111111-2222-4333-8444-555555555555';

test('cleanEvent keeps only the fields each action may carry', () => {
  assert.deepEqual(cleanEvent({ action: 'view', detail: { route: 'groups', extra: 'x' } }), { action: 'view', detail: { route: 'groups' } });
  // A player: name, source, badminfo id and grades; never the date of birth.
  const p = cleanEvent({ action: 'player_add', detail: {
    name: '  Kim Example ', source: 'link', badminfoId: ID, grades: { singles: 'H', doubles: 'Z', mixed: 'I' }, dob: '2012-01-01', gender: 'F',
  } });
  assert.deepEqual(p, { action: 'player_add', detail: { name: 'Kim Example', source: 'link', badminfoId: ID, grades: { singles: 'H', doubles: '', mixed: 'I' } } });
  assert.deepEqual(cleanEvent({ action: 'player_edit', detail: { source: 'typed', badminfoId: '../etc' } }).detail, {});
  assert.equal(cleanEvent({ action: 'view', detail: { route: 'x'.repeat(30) } }).detail.route, undefined);
  assert.equal(cleanEvent({ action: 'player_add', detail: { name: 'x'.repeat(500) } }).detail.name.length, 120);
});

test('cleanEvent refuses unknown actions and the ones only the server logs', () => {
  assert.equal(cleanEvent({ action: 'drop_tables' }), null);
  assert.equal(cleanEvent({ action: 'toString' }), null);
  for (const action of SERVER_EVENTS) {
    assert.equal(Object.hasOwn(EVENTS, action), false);
    assert.equal(cleanEvent({ action }), null);
  }
  assert.equal(cleanEvent(null), null);
});

test('visitor reads the address and country Cloudflare passes on', () => {
  const request = new Request('https://x.test/', { headers: { 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'UA' } });
  Object.defineProperty(request, 'cf', { value: { country: 'GB' } });
  assert.deepEqual(visitor(request), { ip: '203.0.113.7', country: 'GB', userAgent: 'UA' });
  assert.deepEqual(visitor(new Request('https://x.test/')), { ip: '', country: '', userAgent: '' });
});

test('isAdmin matches the account email against ADMIN_EMAILS', () => {
  const env = { ADMIN_EMAILS: ' Owner@Example.com , second@example.com' };
  assert.equal(isAdmin(env, { email: 'owner@example.com' }), true);
  assert.equal(isAdmin(env, { email: 'second@example.com' }), true);
  assert.equal(isAdmin(env, { email: 'someone@example.com' }), false);
  assert.equal(isAdmin(env, null), false);
  assert.equal(isAdmin({}, { email: 'owner@example.com' }), false);
});

const post = (body) => new Request('https://x.test/api/events', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

test('the events route refuses bad events before touching the database', async () => {
  const res = await postEvent({ request: post({ action: 'nope' }), env: {}, data: {} });
  assert.equal(res.status, 400);
});

test('the players and audit routes need a signed-in account', async () => {
  assert.equal((await getPlayers({ env: {}, data: { user: null } })).status, 401);
  assert.equal((await putPlayers({ request: post({ players: [] }), env: {}, data: { user: null } })).status, 401);
  const audit = (user) => getAudit({ request: new Request('https://x.test/api/admin/audit'), env: { ADMIN_EMAILS: 'owner@example.com' }, data: { user } });
  assert.equal((await audit(null)).status, 401);
  assert.equal((await audit({ id: 'u', email: 'someone@example.com' })).status, 403);
});

test('the middleware blocks writes from another site', async () => {
  const request = new Request('https://x.test/api/events', { method: 'POST', headers: { Origin: 'https://evil.example' } });
  const res = await middleware({ request, env: {}, data: {}, next: () => new Response('ok') });
  assert.equal(res.status, 403);
  const same = new Request('https://x.test/api/events', { method: 'POST', headers: { Origin: 'https://x.test' } });
  const data = {};
  const ok = await middleware({ request: same, env: {}, data, next: () => new Response('ok') });
  assert.equal(ok.status, 200);
  assert.equal(data.user, null);
});

test('describeAgent names the device, system and browser', () => {
  const cases = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      { device: 'mobile', os: 'iOS 18.1', browser: 'Safari 18.1' }],
    ['Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
      { device: 'tablet', os: 'iOS 17.4', browser: 'Chrome 130' }],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      { device: 'mobile', os: 'Android 10', browser: 'Chrome 130' }],
    ['Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36',
      { device: 'tablet', os: 'Android 14', browser: 'Samsung Internet 26' }],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68',
      { device: 'desktop', os: 'Windows 10/11', browser: 'Edge 130' }],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      { device: 'desktop', os: 'macOS 10.15', browser: 'Safari 18.0' }],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', { device: 'desktop', os: 'Linux', browser: 'Firefox 131' }],
    ['curl/8.4.0', { device: 'bot', os: '', browser: '' }],
    ['', { device: 'desktop', os: '', browser: '' }],
  ];
  for (const [ua, expected] of cases) assert.deepEqual(describeAgent(ua), expected, ua);
});

test('mergeDevices drops repeats and devices another one already describes', () => {
  const pc = { device: 'desktop', os: 'Windows 10/11', browser: 'Chrome 156' };
  const botPc = { device: 'bot', os: 'Windows 10/11', browser: 'Chrome 156' };
  const bot = { device: 'bot', os: '', browser: '' };
  const phone = { device: 'mobile', os: 'iOS 27.0', browser: 'Chrome 156' };
  assert.deepEqual(mergeDevices([botPc, pc, bot, phone, { ...pc }]), [botPc, pc, phone]);
  assert.deepEqual(mergeDevices([bot, botPc]), [botPc]);
  assert.deepEqual(mergeDevices([{ device: 'mobile', os: 'iOS 27.0', browser: '' }, phone, { device: 'mobile', os: 'Android 10', browser: 'Chrome 156' }]),
    [phone, { device: 'mobile', os: 'Android 10', browser: 'Chrome 156' }]);
});

test('favourites and reordering are logged with their own fields', () => {
  assert.deepEqual(cleanEvent({ action: 'player_favourite', detail: { name: 'Kim', source: 'manual', favourite: true, dob: 'x' } }).detail,
    { name: 'Kim', source: 'manual', favourite: true });
  assert.deepEqual(cleanEvent({ action: 'player_favourite', detail: { favourite: false } }).detail, { favourite: false });
  assert.deepEqual(cleanEvent({ action: 'player_reorder', detail: { name: 'Kim', grades: {} } }).detail, { name: 'Kim' });
});
