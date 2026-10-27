import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LOCALES, pickLocale } from '../public/i18n.js';
import en from '../public/locales/en.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const data = readJson('../public/data/tc-2026.json');
const dataStrings = new Set([
  ...data.areas.map((a) => a.label),
  ...data.circuits.map((c) => c.label),
  ...data.rules.flatMap((r) => r.text),
  ...data.notes,
]);

for (const { id, catalog } of LOCALES.filter((l) => l.id !== 'en')) {
  test(`${id} UI strings match the English keys and placeholders`, () => {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort());
    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(value.trim(), `${id} ${key} is empty`);
      assert.deepEqual(placeholders(value), placeholders(en[key]), `${id} ${key} placeholders differ`);
    }
  });

  test(`${id} translates every sentence of the rules`, () => {
    const translations = readJson(`../public/data/tc-2026.${id}.json`);
    for (const english of dataStrings) {
      assert.ok(translations[english]?.trim(), `${id} has no translation for: ${english}`);
    }
    for (const key of Object.keys(translations)) {
      assert.ok(dataStrings.has(key), `${id} translates a sentence that isn't in the rules: ${key}`);
    }
  });
}

test('pickLocale prefers the stored choice, then the browser languages', () => {
  assert.equal(pickLocale('ja', ['fr-FR']), 'ja');
  assert.equal(pickLocale(null, ['fr-CA', 'en']), 'fr');
  assert.equal(pickLocale(null, ['zh-TW']), 'zh-Hant');
  assert.equal(pickLocale(null, ['zh-CN']), 'zh-Hant');
  assert.equal(pickLocale('xx', ['de-DE']), 'en');
});
