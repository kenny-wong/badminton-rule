import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the version in the page heading matches package.json', () => {
  const { version } = JSON.parse(read('../package.json'));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(read('../site/index.html').match(/class="version">v([^<]+)</)?.[1], version);
});
