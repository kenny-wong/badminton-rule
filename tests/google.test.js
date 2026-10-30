import test from 'node:test';
import assert from 'node:assert/strict';
import { googleAuthUrl, readIdToken } from '../lib/google.js';

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const token = claims => `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`;
const good = { iss: 'https://accounts.google.com', aud: 'client-1', exp: 2000, sub: '123', email: 'Mochi@Gmail.com', email_verified: true, name: 'Mochi' };

test('auth url carries client, redirect, scope and state', () => {
  const url = new URL(googleAuthUrl({ clientId: 'client-1', redirectUri: 'https://x.dev/api/auth/google/callback', state: 'st' }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), 'client-1');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://x.dev/api/auth/google/callback');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('state'), 'st');
});

test('a good id_token gives the account details', () => {
  assert.deepEqual(readIdToken(token(good), 'client-1', 1000), { sub: '123', email: 'mochi@gmail.com', name: 'Mochi' });
});

test('id_tokens for another app, expired, or unverified are refused', () => {
  assert.throws(() => readIdToken(token(good), 'client-2', 1000), /audience/);
  assert.throws(() => readIdToken(token(good), 'client-1', 3000), /Expired/);
  assert.throws(() => readIdToken(token({ ...good, iss: 'https://evil.example' }), 'client-1', 1000), /issuer/);
  assert.throws(() => readIdToken(token({ ...good, email_verified: false }), 'client-1', 1000), /verified/);
  assert.throws(() => readIdToken('garbage', 'client-1', 1000));
});
