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
| **My players** | Save players (gender, date of birth plus singles, doubles and mixed grades) and see, side by side, which tiers and age groups each can enter, and why. Add a player from their [badminfo.com](https://badminfo.com) link with their grades and badminfo ratings ("↻ Update rating" refreshes the ratings and grades later and says what changed, such as "Singles: since 30 Oct 2026, up from I to H"). Drag ⠿ to put your players in order, and star ☆ favourites: they stay at the top and are starred ★ on the Groups page. Optionally, sign in with Google to keep your saved players on all your devices. |
| **Groups** | Learn how a round-robin group is ranked and how ties are broken. Then work out a group yourself: drag in saved players (singles or doubles), enter scores game by game, and get the standings, a results grid, and an analysis of what each player needs, down to "C must score at least 4 points". Save up to six groups in the browser so they are still there after a reload. Or paste a tournament link from [badminfo.com](https://badminfo.com) to fill in a real group's pairs and results: it lists the groups your saved players are in ("WS Group A (Chloe Wong)"; a player saved as just "Chloe" finds every Chloe), and "↻ Update" beside the matches brings in new results for the whole group. Under each match: when it is due or started, how long it took and the court (from Badminton England's own pages), and roughly when a new score was seen. Players added from badminfo can be picked to list their tournaments (the next few, or past ones too) and open one without its link. |
| **Laws** | The basic Laws of Badminton in plain words, from the BWF: the court, scoring, serving, where to serve from, in or out, faults, lets and breaks, with diagrams. It also shows the new 15-point scoring that starts on 4 January 2027. |
| **Notes** | Read the general notes from the matrix and how this guide was put together. |

You can also search the rules in any of the four languages.

### Your data and privacy

Saved players, saved groups and your language choice are stored in your browser's `localStorage`. Without signing in, nothing else is needed: your players stay in that browser.

**Signing in is optional.** If you sign in with Google on the My players page, your saved players are also kept on the site's server under your account (your Google email and name), so they appear on your other devices. On the first sign-in in a browser, the players already saved there join the ones in your account. Signing out leaves them in the browser.

**Audit trail.** To see how the site is used and to stop misuse, the server records each page visit and action (adding, editing or removing a player, loading a tournament, importing, refreshing or saving a group, signing in and out) with the time, the visitor's IP address and country, browser, and Google email when signed in. For players it records the name, whether it came from a badminfo link or was typed in, the badminfo id and the grades, never the date of birth. Only the site's owners can see the records (the Audit trail page, for accounts listed in `ADMIN_EMAILS`, which also shows the kind of device, system and browser read from each visit), and they are kept until deleted.

**badminfo.** A tournament or player link you paste goes to this site's server, which fetches that tournament's groups or that player's name, grades, ratings and BE number from badminfo and sends them back. A player added this way keeps their badminfo id and BE number, gets a link to their badminfo.com page, so adding them again only updates their ratings and grades, and imported draws find them by id even if their name is spelled differently.

## Sources

- [Badminton England 2026 Tournament Terms & Conditions](https://images.gc.badmintonenglandservices.co.uk/5e260d50-f15d-11f0-86c0-6b312a596c98.pdf). This matrix of rules per tier is the basis for almost everything on the site.
- [Badminton England General Regulations for Tournaments 2026](https://images.gc.badmintonenglandservices.co.uk/53012730-1ee3-11f1-a060-b1b720430faa.pdf), regulations 6.13–6.23 and 8.4–8.5, for group draws, ranking, tie-breaks, withdrawals and retirements.
- BWF General Competition Regulations, regulation 16.2 (ranking in groups). BE notes that its group rules match it.
- [badminfo.com](https://badminfo.com) for imported group results. It collects them from Badminton England's tournament pages; the official draw takes precedence.
- Badminton England's tournament pages ([be.tournamentsoftware.com](https://be.tournamentsoftware.com)) for when each imported match is due to start; the page marks it on time or delayed from when its score appears. The site's server reads them accepting only necessary cookies.

Translations of the rule text are provided for convenience; the English wording of the PDF is the authority. Where the PDF is blank, the site shows it blank (for example, the Masters seeding cell).

### Assumptions

A few things the documents don't spell out, and how the site handles them:

- **Junior age groups.** U11, U13 and U15 follow the matrix's own definition of U17 ("born on or after 1 Jan 2010"): U*n* means born in 2026 − *n* + 1 or later.
- **Junior Silver.** Its grade bars are listed for U15 and U17 only, so U11 and U13 show no bar.
- **Masters.** The matrix sets no grade limits and doesn't define the Masters age groups, so the checker doesn't judge age for Masters.
- **Scoring presets.** Junior Gold U11 is "3 games to 15" with no mention of setting, so setting to 21 is assumed, as for the matrix's other 15-point games. Senior Tier 4 leaves the format to the organiser, so the calculator uses BE's recommended 3 games to 21.
- **11-point games.** Setting is capped at 15, which is common practice; the documents don't state it.
- **Imported groups.** The scoring comes from the tournament's tier when its name (or badminfo's level) shows one: for example a U15 Silver event is Junior Silver, 3 games to 15 with setting to 21. For open or restricted tournaments the calculator works it out from the scores: best of three if any match had two games, the highest of 21, 15 or 11 points that every game winner reached, and no setting only if a game ended at 21–20 (or 15–14, 11–10). A group lists only the entries that have played at least once, and matches won without a score (walkovers) are left blank.
- **Points thresholds** in the group analysis assume games end at the target score (no extended play) when working out how many points a player needs.

## Development

The site is plain HTML, CSS and JavaScript modules, hosted on Cloudflare Pages. There is no build step and the site has no npm dependencies; Wrangler (Cloudflare's CLI) is the only dev dependency. The server code is Cloudflare Pages Functions in `functions/api/`: reading tournaments and players from badminfo, the optional Google sign-in, saved players for signed-in accounts, and the audit trail, kept in a Cloudflare D1 (SQLite) database whose schema is in `migrations/`.

```sh
npm install       # once, to install Wrangler
npm test          # run every test (Node's built-in test runner; needs Node 22 or later)
npm run dev       # serve public/ and the API locally with Wrangler on port 8789, including the _headers file
npm run db:migrate:local  # create the local D1 tables (once, and after each new migration)
npm run db:migrate        # apply new migrations to the live database (before deploying them)
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
  _middleware.js      blocks cross-site writes; looks up the signed-in account (optional everywhere)
  auth/               Google sign-in (auth/google, auth/google/callback) and sign-out (auth/logout)
  me.js               who is signed in, and whether they may read the audit trail
  players.js          GET / PUT the signed-in account's saved players
  events.js           POST a page view or action for the audit trail (allowlisted, rate-limited)
  admin/audit.js      the audit trail, for ADMIN_EMAILS only
  tournament.js       GET /api/tournament?url=<badminfo link>: a tournament's round-robin groups
  player.js           GET /api/player?url=<badminfo player link>: a player's grades, ratings and BE number
lib/
  badminfo.js         reads badminfo's tournament and player JSON (only the id is taken from the link)
  http.js             JSON responses, cookies and small helpers for the API
  audit.js            which actions and fields the audit trail keeps, and writing them
  google.js           Google sign-in (OAuth code flow; id_token claims checked)
  session.js          sessions: a random cookie token, only its SHA-256 stored
  crypto.js           random tokens and hashing
migrations/           D1 schema: users, sessions, player_lists, audit_log
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
