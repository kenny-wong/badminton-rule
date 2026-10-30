// A player's own pages on Badminton England's site (tournamentsoftware), for
// the Analysis page: career and this year's win-loss per discipline from the
// profile overview, and the national ranking and grading-period qualifying
// matches from its Ranking tab. badminfo gives each player's BE id (`beId`).
// The pages are read like the match times in schedule.js, accepting only the
// necessary cookies. No DOM code here, so it is unit tested in
// tests/analysis-server.test.js.

import { consentCookie, decode, fetchPage, ORIGIN } from './schedule.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAT_TABS = { Total: 'total', Singles: 'singles', Doubles: 'doubles', Mixed: 'mixed' };
const PERIODS = { Career: 'career', 'This year': 'year' };

export const profileUrl = (beId) => `${ORIGIN}/player-profile/${beId}`;

const int = (s) => {
  const n = Number(String(s).replace(/[^\d]/g, ''));
  return Number.isSafeInteger(n) && String(s).trim() !== '' ? n : null;
};

/** Win-loss from the overview's Statistics box: { total|singles|doubles|mixed: { career|year: { won, lost } } }. */
export function parseWinLoss(html) {
  const out = {};
  const tabs = [...html.matchAll(/<div id="tabStats(Total|Singles|Doubles|Mixed)"/g)];
  tabs.forEach((m, i) => {
    const block = html.slice(m.index, tabs[i + 1]?.index ?? m.index + 20000);
    const stats = {};
    for (const x of block.matchAll(/<dt class="list__label">([^<]*)<\/dt>\s*<dd[^>]*>[\s\S]*?<span class="list__value-start">\s*(\d+)\s*\/\s*(\d+)\s*\(\d+\)/g)) {
      const key = PERIODS[decode(x[1])];
      if (key) stats[key] = { won: Number(x[2]), lost: Number(x[3]) };
    }
    if (Object.keys(stats).length) out[STAT_TABS[m[1]]] = stats;
  });
  return out;
}

/** The rows of the table whose caption names `title`, as arrays of cell texts (the row heading first), and its week tag. */
function table(html, title) {
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const t = m[0];
    const caption = /<caption[\s\S]*?<\/caption>/.exec(t)?.[0] ?? '';
    if (!caption.includes(title)) continue;
    const week = decode(/class="tag tag--soft">([^<]*)</.exec(caption)?.[1] ?? '');
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(t)?.[1] ?? '';
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => decode(c[1].replace(/<[^>]+>/g, ' '))));
    return { week, rows };
  }
  return { week: '', rows: [] };
}

/**
 * The Ranking tab: national ranking per event ({ event, rank, points, rating })
 * and the grading period's qualifying matches won and lost per event, each
 * with the week they were published ("43-2026").
 */
export function parseRanking(html) {
  const ranking = table(html, 'National Rankings');
  const grading = table(html, 'Player Grading');
  return {
    week: ranking.week || grading.week,
    rankings: ranking.rows.filter((r) => r.length >= 5 && int(r[1]) !== null)
      .map((r) => ({ event: r[0].slice(0, 20), rank: int(r[1]), points: int(r[2]), rating: int(r[4]) })),
    grading: grading.rows.filter((r) => r.length >= 3 && int(r[1]) !== null)
      .map((r) => ({ event: r[0].slice(0, 20), won: int(r[1]), lost: int(r[2]) })),
  };
}

/**
 * Both pages for one player, or null when the id isn't valid or the site can't
 * be read (the Analysis page then shows badminfo's part alone).
 */
export async function beProfile(beId) {
  if (!GUID.test(beId ?? '')) return null;
  try {
    const cookie = await consentCookie();
    const [overview, ranking] = await Promise.all([
      fetchPage(`/player-profile/${beId}`, cookie),
      fetchPage(`/player-profile/${beId}/ranking`, cookie),
    ]);
    return { url: profileUrl(beId), winLoss: parseWinLoss(overview), ...parseRanking(ranking) };
  } catch (err) {
    console.error('BE profile', beId, err);
    return null;
  }
}
