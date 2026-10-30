# Badminton Tournament T&Cs 2026

An unofficial, searchable guide to Badminton England's **2026 Tournament Terms & Conditions** for players, parents and organisers. It shows who can enter which tournament, what each tier's rules are, and how a group (round robin) decides who goes through to the knockout.

**Live site: <https://badminton-tcs-2026.pages.dev>**

Available in English, 繁體中文, 日本語 and Français.

> Not affiliated with or endorsed by Badminton England. Everything here is transcribed from BE's published documents (see [Sources](#sources)). If anything differs, the original PDF and the BE regulations take precedence.

## What it does

| Page | What you can do |
|---|---|
| **Grades** | See at a glance which grades (A–K) can enter each tier, split by age group and birth year. Pick a grade to list every tier it can enter. |
| **Tiers** | Read every rule for one tier: sanction fee, match format, rest periods, grade restrictions, seeding, coaching and so on. |
| **Compare** | Compare one rule area across all tiers, with tiers that share the same rule grouped together. |
| **My players** | Save players (gender, date of birth plus singles, doubles and mixed grades) and see, side by side, which tiers and age groups each can enter, and why. You can share a player with a link. |
| **Groups** | Learn how a round-robin group is ranked and how ties are broken. Then work out a group yourself: drag in saved players (singles or doubles), enter scores game by game, and get the standings, a results grid, and an analysis of what each player needs, down to "C must score at least 4 points". Save up to six groups in the browser so they are still there after a reload. Or paste a tournament link from [badminfo.com](https://badminfo.com) to fill in a real group's pairs and results: it lists the groups your saved players are in ("WS Group A (Amy)"), and ↻ buttons update one match or the whole group as new results come in. |
| **Laws** | The basic Laws of Badminton in plain words, from the BWF: the court, scoring, serving, where to serve from, in or out, faults, lets and breaks, with diagrams. It also shows the new 15-point scoring that starts on 4 January 2027. |
| **Notes** | Read the general notes from the matrix and how this guide was put together. |

You can also search the rules in any of the four languages.

### Your data stays on your device

Saved players, saved groups and your language choice are stored only in your browser's `localStorage`. None of them are sent to a server, and the site has no accounts or tracking. As a result, saved players don't follow you to another device or browser.

The one exception is importing a group: the badminfo link you paste goes to this site's server, which fetches that tournament's results from badminfo and sends back only its round-robin groups. Nothing is stored.

## Sources

- [Badminton England 2026 Tournament Terms & Conditions](https://images.gc.badmintonenglandservices.co.uk/5e260d50-f15d-11f0-86c0-6b312a596c98.pdf). This matrix of rules per tier is the basis for almost everything on the site.
- [Badminton England General Regulations for Tournaments 2026](https://images.gc.badmintonenglandservices.co.uk/53012730-1ee3-11f1-a060-b1b720430faa.pdf), regulations 6.13–6.23 and 8.4–8.5, for group draws, ranking, tie-breaks, withdrawals and retirements.
- BWF General Competition Regulations, regulation 16.2 (ranking in groups). BE notes that its group rules match it.
- [badminfo.com](https://badminfo.com) for imported group results. It collects them from Badminton England's tournament pages; the official draw takes precedence.

Translations of the rule text are provided for convenience; the English wording of the PDF is the authority. Where the PDF is blank, the site shows it blank (for example, the Masters seeding cell).

### Assumptions

A few things the documents don't spell out, and how the site handles them:

- **Junior age groups.** U11, U13 and U15 follow the matrix's own definition of U17 ("born on or after 1 Jan 2010"): U*n* means born in 2026 − *n* + 1 or later.
- **Junior Silver.** Its grade bars are listed for U15 and U17 only, so U11 and U13 show no bar.
- **Masters.** The matrix sets no grade limits and doesn't define the Masters age groups, so the checker doesn't judge age for Masters.
- **Scoring presets.** Junior Gold U11 is "3 games to 15" with no mention of setting, so setting to 21 is assumed, as for the matrix's other 15-point games. Senior Tier 4 leaves the format to the organiser, so the calculator uses BE's recommended 3 games to 21.
- **11-point games.** Setting is capped at 15, which is common practice; the documents don't state it.
- **Imported groups.** badminfo doesn't say how a tournament is scored, so the calculator works it out from the scores: best of three if any match had two games, the highest of 21, 15 or 11 points that every game winner reached, and no setting only if a game ended at 21–20 (or 15–14, 11–10). A group lists only the entries that have played at least once, and matches won without a score (walkovers) are left blank.
- **Points thresholds** in the group analysis assume games end at the target score (no extended play) when working out how many points a player needs.

## Development

The site is plain HTML, CSS and JavaScript modules, hosted on Cloudflare Pages. There is no build step and the site has no npm dependencies; Wrangler (Cloudflare's CLI) is the only dev dependency. The only server code is one Cloudflare Pages Function, `functions/api/tournament.js`, which imports groups from badminfo; there is no database.

```sh
npm install       # once, to install Wrangler
npm test          # run every test (Node's built-in test runner; needs Node 22 or later)
npm run dev       # serve public/ and the API locally with Wrangler on port 8789, including the _headers file
npm run deploy    # publish public/ to Cloudflare Pages (needs access to the project)
```

To run a single test file, use `node --test tests/groups.test.js`. Any static file server also works for local viewing, for example `python -m http.server --directory public`, but without the import API.

### Layout

```
public/
  index.html          page shell; text is filled in per language by app.js
  app.js              hash router and every view (#/grades, #/tier, #/compare, #/check, #/groups, #/laws, #/notes)
  eligibility.js      age and grade rules per tier (pure functions, unit tested)
  groups.js           round-robin ranking, tie-breaks, scoring rules and the qualification analysis
  saved-groups.js     saved round-robin groups in localStorage
  imported-group.js   turns a group imported from badminfo into calculator state, and works out its scoring
  laws.js             the Laws of Badminton page and its diagrams
  profiles.js         saved players in localStorage
  i18n.js             language switching
  locales/*.js        UI strings: en, zh-Hant, ja, fr
  data/tc-2026.json   the whole T&Cs matrix, transcribed by hand
  data/tc-2026.*.json the rule text translated, keyed by the English sentence
  _headers            security headers (Content-Security-Policy and so on)
functions/api/
  tournament.js       GET /api/tournament?url=<badminfo link>: a tournament's round-robin groups
lib/
  badminfo.js         reads badminfo's tournament JSON (only the id is taken from the link)
  http.js             JSON responses for the API
tests/                node:test suites for all of the above
wrangler.jsonc        Cloudflare Pages project settings
```

### Keeping it accurate

- **Rule text** lives in `public/data/tc-2026.json`. Each rule lists the tiers and rule areas it covers, so a merged cell in the PDF is one entry. The tests check that every tier has exactly one rule for every area.
- **If you change any English rule text, update all three translation files.** The tests fail if a translation is missing or left over. They also fail if a UI string or `{placeholder}` doesn't match `locales/en.js`.
- **Entry rules** (grade bars, minimum grades, birth years) are tables in `public/eligibility.js`. The Grades chart and the My players checker both read them, so the two can't disagree.
- **Scoring per tier** (best of three or one game; 21, 15 or 11 points; setting) is `SCORING_PRESETS` in `public/groups.js`, taken from the matrix's Matches column.
- `app.js` has no unit tests, so after changing it, load every page and check that none is stuck on "Loading the rules…" or shows "Couldn’t load the rules".

For a new season, update the data file and its translations, the season year and birth-year limits in `eligibility.js`, the scoring presets if the Matches column changes, and the source links.
