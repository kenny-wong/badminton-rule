import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const data = JSON.parse(readFileSync(new URL('../public/data/tc-2026.json', import.meta.url), 'utf8'));

test('every tier has exactly one rule for every area', () => {
  for (const area of data.areas) {
    for (const tier of data.tiers) {
      const matches = data.rules.filter((r) => r.areas.includes(area.id) && r.tiers.includes(tier.id));
      assert.equal(matches.length, 1, `${tier.id} × ${area.id} has ${matches.length} rules`);
    }
  }
});

test('rules only reference known tiers and areas', () => {
  const tiers = new Set(data.tiers.map((t) => t.id));
  const areas = new Set(data.areas.map((a) => a.id));
  for (const rule of data.rules) {
    rule.tiers.forEach((t) => assert.ok(tiers.has(t), `unknown tier ${t}`));
    rule.areas.forEach((a) => assert.ok(areas.has(a), `unknown area ${a}`));
  }
});

test('every tier belongs to a known circuit', () => {
  const circuits = new Set(data.circuits.map((c) => c.id));
  data.tiers.forEach((t) => assert.ok(circuits.has(t.circuit), `${t.id} has unknown circuit ${t.circuit}`));
});
