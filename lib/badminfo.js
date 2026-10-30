// Reading a tournament from badminfo.com for the group calculator. badminfo's
// pages are a web app that loads each tournament as JSON from its own API; that
// API answers only badminfo.com's pages (CORS), so /api/tournament fetches it on
// the server and passes on just the round-robin groups. No DOM code here, so it
// is unit tested in tests/badminfo.test.js.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINK = 300;
const MAX_NAME = 60;
const MAX_GROUPS = 200;

/**
 * The tournament id in a badminfo link such as
 * https://badminfo.com/Tournament/c7fa0c7e-1adb-412f-a229-190bd893db4f?t=OD&s=g,
 * or null when the text isn't one. Only the id is ever used, so the server
 * can't be pointed at any other address.
 */
export function badminfoId(link) {
  if (typeof link !== 'string' || link.length > MAX_LINK) return null;
  let url;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!/^(www\.)?badminfo\.com$/i.test(url.hostname)) return null;
  const m = /^\/tournament\/([^/]+)\/?$/i.exec(url.pathname);
  return m && GUID.test(m[1]) ? m[1].toLowerCase() : null;
}

export const apiUrl = (id) => `https://badstats.azurewebsites.net/api/tournaments/${id}`;
export const pageUrl = (id) => `https://badminfo.com/Tournament/${id}`;

const text = (v, max = MAX_NAME) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const score = (v) => (Number.isInteger(v) && v >= 0 && v <= 99 ? v : null);

/**
 * The parts of badminfo's tournament JSON the calculator needs: the name, dates
 * and every round-robin group with its teams (one name for singles, two for
 * doubles) and matches. Each match's `a` and `b` are indexes into `teams`, and
 * each game is [a's points, b's points]. Teams are listed in the order they
 * first appear, so a team that hasn't played yet isn't known.
 * @returns {object|null} null when the JSON isn't a tournament.
 */
export function summarize(json, id) {
  const t = json?.beTournament;
  if (!t || typeof t !== 'object' || !Array.isArray(t.events)) return null;
  const names = new Map((Array.isArray(t.players) ? t.players : []).map((p) => [p?.index, text(p?.playerEntryName)]));
  const groups = [];
  for (const event of t.events) {
    for (const draw of Array.isArray(event?.draws) ? event.draws : []) {
      if (draw?.type !== 'Round Robin' || !Array.isArray(draw.rubbers)) continue;
      const teams = [];
      const keys = [];
      const teamIndex = (indexes) => {
        if (!Array.isArray(indexes) || !indexes.length) return -1;
        const key = [...indexes].sort((x, y) => x - y).join(',');
        let i = keys.indexOf(key);
        if (i < 0) {
          i = keys.push(key) - 1;
          teams.push(indexes.map((ix) => names.get(ix) || '?'));
        }
        return i;
      };
      const matches = [];
      for (const r of draw.rubbers) {
        const a = teamIndex(r?.team1PlayerIndexes);
        const b = teamIndex(r?.team2PlayerIndexes);
        if (a < 0 || b < 0 || a === b) continue;
        const games = (Array.isArray(r.games) ? r.games : [])
          .slice(0, 3)
          .map((g) => [score(g?.team1Score), score(g?.team2Score)])
          .filter((g) => g.every((n) => n !== null));
        // A walkover or retirement has a winner but no (or too few) games to show it.
        const winner = r.winningTeam === 1 ? 'a' : r.winningTeam === 2 ? 'b' : null;
        matches.push({ a, b, games, winner, note: text(r.scoreText) || null });
      }
      if (teams.length >= 2) groups.push({ event: text(event.name), name: text(draw.name) || text(event.name), teams, matches });
      if (groups.length >= MAX_GROUPS) break;
    }
  }
  return {
    source: 'badminfo',
    id,
    url: pageUrl(id),
    name: text(t.name, 120),
    start: date(t.startDate),
    end: date(t.endDate),
    groups,
  };
}
