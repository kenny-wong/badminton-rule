// UI language support. UI strings live in locales/<id>.js; the rule text from the
// PDF is translated in data/tc-2026.<id>.json, keyed by the English sentence, and
// falls back to English for anything missing.

import en from './locales/en.js';
import fr from './locales/fr.js';
import ja from './locales/ja.js';
import zhHant from './locales/zh-Hant.js';

export const LOCALES = [
  { id: 'en', label: 'English', catalog: en },
  { id: 'zh-Hant', label: '繁體中文', catalog: zhHant },
  { id: 'ja', label: '日本語', catalog: ja },
  { id: 'fr', label: 'Français', catalog: fr },
];

const STORAGE_KEY = 'badminton-tcs:lang';

let current = 'en';
let catalog = en;
let dataStrings = {};

export function currentLocale() {
  return current;
}

/** Fills {name} placeholders; unknown keys fall back to English, then to the key itself. */
export function t(key, params = {}) {
  const template = catalog[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Like t(), but placeholder values may be DOM nodes (links, <strong>), so it
 * returns an array of strings and nodes to append.
 */
export function tParts(key, params = {}) {
  const template = catalog[key] ?? en[key] ?? key;
  return template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name && name in params ? params[name] : part;
  });
}

/** Translates a sentence from the rules data, keyed by its English text. */
export function td(english) {
  return dataStrings[english] || english;
}

export function pickLocale(stored, browserLanguages = []) {
  if (LOCALES.some((l) => l.id === stored)) return stored;
  for (const lang of browserLanguages) {
    const lower = lang.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-Hant'; // the only Chinese offered
    const match = LOCALES.find((l) => lower === l.id || lower.startsWith(`${l.id}-`));
    if (match) return match.id;
  }
  return 'en';
}

export function initialLocale() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: fall back to the browser's languages.
  }
  return pickLocale(stored, globalThis.navigator?.languages ?? []);
}

/**
 * Switches the UI strings at once (before the first await, so callers can label
 * the page straight away), then loads the rule-text translation.
 */
export async function setLocale(id, { remember = true } = {}) {
  const locale = LOCALES.find((l) => l.id === id) ?? LOCALES[0];
  current = locale.id;
  catalog = locale.catalog;
  document.documentElement.lang = locale.id;
  let strings = {};
  if (locale.id !== 'en') {
    try {
      const response = await fetch(`data/tc-2026.${locale.id}.json`);
      if (response.ok) strings = await response.json();
    } catch {
      // Rule text stays in English if its translation can't load.
    }
  }
  dataStrings = strings;
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, locale.id);
    } catch {
      // Not remembered across visits; the choice still applies now.
    }
  }
}
