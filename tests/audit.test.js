import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EVENTS, SERVER_EVENTS, cleanEvent, visitor } from '../lib/audit.js';
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
