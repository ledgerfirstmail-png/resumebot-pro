# Tailorly — Audit: Missing, Updates & Upgrades

Status date: 2026-10-05. Latest verification: Convex push `exit 0`,
`tsc -b --noEmit` `exit 0`, `bun run lint` `exit 0` (0 errors, 17 pre-existing
warnings), live AI smoke tests (`ai:tailorResume` → `score: 95`,
`ai:generateApplicationKit` → 4 grounded answers, `ai:extractJobPosting` →
real Greenhouse posting extracted + friendly failure on a non-job page).

## Resolved in the second pass (2026-10-05)

- **A1 ✅** — per-session daily budget (25 runs/day/browser) in `aiUsage.ts`,
  checked *before* the AI call; verified live that it records counts and blocks
  with a friendly error once the cap is hit.
- **A2 ✅** — caps enforced client (zod) + server: job posting ≤ 20k chars,
  profile JSON ≤ 60k, boost keywords bounded.
- **A3 ✅** — one automatic retry on unparsable AI output, `maxTokens` 3000 →
  4000, and actionable error messages instead of raw parser failures.
- **A4 ✅** — wizard drafts autosave (debounced) to localStorage and restore on
  refresh; cleared after a successful generation.
- **A5 ✅** — the original job posting is shown collapsibly on the result view,
  including for saved resumes.
- **A7 ✅** — saving the same job title + company upserts instead of duplicating.
- **A8 ✅** — `ScoreLabel` single-sourced from the schema validator; frontend and
  action re-export it.
- **B3 + B4 ✅** — the AI now returns `missingKeywords`; the result view shows a
  gap checklist and a one-click **Boost toward 90** re-tailor that feeds the gaps
  back into the prompt (honest: it only works in terms the profile supports).
- **C1 ✅** README rewritten for the no-login app · **C2 ✅** manifest → Tailorly /
  clay palette · **C3 ✅** "See how it works" scrolls to the section, billing
  copy removed · **C9 ✅** Open Graph + Twitter tags.
- **C6 (partial) ✅** — score gauge has `role="img"` + aria-label, wizard steps
  use `aria-current="step"`.

## Resolved in the third pass (2026-10-05)

- **B1 ✅ / E1 — Application auto-fill kit**: new `ai:generateApplicationKit`
  action (same honesty rules, same daily budget, same retry/caps) returns a
  cover letter, a "why this role" answer, and answers to the four questions
  application forms always ask. Rendered on the result view with per-block
  Copy buttons + Copy all; persisted on the saved resume
  (`applicationKit` field) so saved views can regenerate/update too — the save
  button now reads "Update saved copy" while viewing a saved resume, relying
  on the A7 upsert.
- **D3 ✅ — `bun run lint` exits 0** (first time): fixed the three template
  errors at the root — `carousel.tsx` now reads scroll state through
  `useSyncExternalStore` instead of setState-in-effect (and no longer leaks its
  `reInit` listener), `sidebar.tsx` skeleton width derives from `useId()`
  instead of `Math.random()` in render (pure + stable across re-renders), and
  `use-mobile.ts` seeds its value in the state initializer and only subscribes
  in the effect. Behavior improved, nothing suppressed.
- Verified live: kit generation returned the 4 exact questions with
  profile-grounded answers, and the shared budget counter incremented (2 → 3).

## Resolved in the fourth pass (2026-10-05)

- **B7 ✅ — score trend chart**: `ScoreTrend` (recharts, already installed)
  plots every saved resume's score over time on the studio home, with an
  average chip and an `role="img"` aria-label summarizing the series. Colors
  flow through `currentColor` so the chart follows the clay palette + dark
  mode automatically.
- **B8 ✅ — before/after comparison**: `BeforeAfterDiff` matches original
  experience entries to the tailored ones (company+title, positional
  fallback) and shows each rewrite side by side — original bullet ("Yours")
  vs tailored bullet, plus summary rewords and skills added/set-aside chips.
  Collapsed by default on the result view; renders nothing when the tailoring
  changed nothing. This makes the "honest by design" claim verifiable.
- **D7 ✅ — per-section error boundary**: `SectionBoundary` wraps the wizard
  and result views independently, so if one throws, the studio (header, saved
  collection, navigation) stays usable and the failed section offers a retry.
- **C4 ✅ — dark mode toggle**: `useTheme` keeps `.dark` on `<html>`, persists
  to `localStorage` (`tailorly_theme`), and `applyStoredTheme()` runs before
  first paint in `main.tsx` so a stored dark preference never flashes light.
  Moon/Sun toggle added to the app header (aria-label + title).
- **C5 ✅ — reduced motion respected**: the whole app is wrapped in
  `<MotionConfig reducedMotion="user">`, so every framer-motion animation
  (and anything reading motion config) honors `prefers-reduced-motion`.

Still open: B2's board-feed/saved-job-list half, B5, B6, C7, C8 (documented
in README), D1, D2, D4, D5, and E-list items 3 (pipeline tracker), 4, 5,
7 (usage dashboard surface), 9 (C6 a11y remainder), 10, 11, 12.

## Resolved in the fifth pass (2026-10-05)

- **B2 (partial) ✅ — job posting URL import**: new `ai:extractJobPosting`
  action fetches the posting page (10s timeout, body streamed and capped at
  600KB, basic SSRF guard rejecting private/localhost and non-http targets),
  strips HTML to readable text, and has the AI pull out job title / company /
  full posting (≤20k chars, shared retry loop). The wizard's job step gained
  an **Import from a URL** field that autofills all three fields, with
  friendly errors when a site blocks readers or the page isn't a single
  posting. Still open from B2: board feeds and the saved job list / pipeline.
- **D6 ✅ — structured AI run logging**: new `aiRuns` table records every AI
  run — kind (`tailor`/`kit`/`extract`), success flag, failure reason, score,
  tokens in/out, credits when reported, and duration. All three actions log
  through `aiUsage.logRun`, which never throws (logging can't mask the real
  result); inspect with `bunx convex run aiUsage:recentRuns`. While wiring
  this, the duplicated budget + retry logic in the two existing actions was
  consolidated into shared `enforceDailyBudget` and `completeToJson`
  helpers, so all three actions behave identically.

Live-verified this pass: extract failure path (non-job page → friendly error,
logged with reason), extract success path (real Greenhouse posting →
title/company/posting, logged with 1464/815 tokens), SSRF guards (localhost
and `ftp:` rejected *before* any budget consumption), and the refactored
`ai:tailorResume` end-to-end (→ `score: 95`, logged with tokens/duration).

## Resolved in the sixth pass (2026-10-05) — auth shipped

- **Login (user name + password)**: new `/auth` page (sign in / create
  account / forgot-password / enter-code modes, clay-themed) backed by a
  ConvexAuth `ConvexCredentials` provider
  (`src/convex/auth/usernamePassword.ts`) keyed by user name, Scrypt-hashed
  (lucia). Wrong user name and wrong password return one message; the
  library's built-in failed-attempt rate limit applies. `auth.ts` only gained
  the provider in its `providers` array (its header explicitly permits
  adding providers); `emailOtp.ts` / `auth.config.ts` / auth schema / the
  `ConvexAuthProvider` wrapper are untouched.
- **Sign up + email password reset**: sign-up captures user name + email +
  password (both uniqueness-checked with friendly errors). Reset emails a
  single-use, hashed, 15-minute 6-digit code via the template's existing
  `auth.freebuff.app` transport (dedicated `password-reset` email provider —
  the default email-match check is skipped because accounts are keyed by
  user name; the code itself is the secret). Unknown emails get the same
  response as known ones (no account enumeration); wrong/expired codes share
  one message; a successful reset sets the new password, signs the user in,
  and invalidates other sessions.
- **Protected routes + per-user data**: `RequireAuth` preserves the intended
  path (`/auth?returnTo=…`), the auth page returns to it after sign-in, and
  every resume query/mutation in `resumes.ts` is now scoped by `userId`
  (schema: `userId` + `by_user` indexes) — accounts actually isolate data.
  Header shows the signed-in name + Sign out.

Live-verified via `convex run` (full flows, real tokens returned): sign-up →
session, sign-in → session, wrong password → friendly error, duplicate
user name / duplicate email → friendly errors, reset request → code created
(mail sender rejected the reserved `example.com` test domain with 500 →
surfaced as a friendly client error + logged server-side), reset-verification
with that code → password changed + signed in, old password rejected after,
wrong code rejected, signed-out `getProfile` → null, signed-out
`saveProfile` → "signed out" error.

Still open from auth: verify reset-email **delivery** with a real inbox
(platform mailer rejected example.com), optional email verification on
sign-up, and session management UI (change password from settings).

## Resolved in the seventh pass (2026-10-05)

- **D1 ✅ — tests**: Vitest installed with a `bun run test` script and its own
  `vitest.config.ts` (kept separate — `vite.config.ts` is platform-owned).
  35 tests over the pure logic the roadmap called out: `extractJson`
  (plain/fenced/prose/unparsable), `clampScore` (clamping, coercion,
  fallbacks), `assertPublicHttpUrl` (public http(s) allowed; localhost,
  loopback, `10.*`, `192.168.*`, `172.16–31.*`, `169.254.*`, `*.local` and
  non-http schemes rejected), `htmlToText` (script/style stripping, entity
  decoding in one pass incl. `&amp;lt;`, whitespace collapsing), the wizard's
  zod schemas (`jobSchema` 120/20,000 limits, `profileSchema` required
  fields), `profileToFormValues` (bullet join), and `buildDiff` (company+title
  matching, positional fallback, dropped bullets, unchanged filtering, skill
  adds/removes, summary change). To make these testable, the helpers moved
  out of Convex/React into `src/lib/aiParse.ts`, `src/lib/resumeSchemas.ts`,
  and `src/lib/bulletDiff.ts` — `ai.ts`, `ResumeWizard.tsx`, and
  `BeforeAfterDiff.tsx` now import them (single source of truth, no
  behavior change).
- **D2 ✅ — CI**: `.github/workflows/ci.yml` runs on pushes to `main` and
  every PR: `bun install` → `bunx convex codegen` → `bun tsc -b --noEmit` →
  `bun run lint` → `bun run test`. Codegen comes first because
  `src/convex/_generated` is gitignored; verified it exits 0 without Convex
  authentication (empty `HOME`, no deployment env vars). Lint is safe as a
  gate: it exits 0 today (0 errors, 17 pre-existing warnings).
- **D4 ✅ — lint warnings (17 → 0)**: fixed at the cause rather than
  suppressed globally. The four `src/convex/_generated/**` "unused
  eslint-disable" warnings came from linting machine-generated code — that
  directory is now in the eslint ignores (it's gitignored and recreated by
  codegen). The two `main.tsx` warnings were real (route helper components
  defined in a file with no exports): `RouteLoading` and `RouteSyncer` moved
  to `src/components/RouteSupport.tsx`. The remaining 11
  `react-refresh/only-export-components` warnings are inherent to files the
  rule mis-fires on — shadcn/ui building blocks (cva variant maps exported
  beside components, by shadcn design) and the platform-owned
  `vly-toolbar-readonly.tsx` — so the rule is scoped off for exactly those
  paths and stays on everywhere else in app code. The lint script now runs
  `eslint . --max-warnings=0`, so CI enforces warning-free stays fixed.

Still open from the D-list: **D5** (one production build —
kept off by the platform rule against `bun run build`).

## Resolved in the eighth pass (2026-10-05) — Job Radar

Four product features, shipped together as the **Job radar** workspace tab
(Studio / Job radar switcher in the dashboard header):

- **1 · Find employers hiring + match scoring**: `jobSearch:searchJobs`
  aggregates three key-free boards (Remotive, RemoteOK, Arbeitnow — all
  verified reachable with the field shapes the parsers expect), dedupes,
  filters by query/location, and scores every posting against the owner's
  profile with a new **pure matcher** (`src/lib/matchScore.ts`: 45 term
  coverage + 35 skills signal + 20 title fit → 0–100, plus matched/missing
  keyword lists). Results persist in the new `jobMatches` table and render
  with score chips, matched-skill chips, gap chips, and a live match
  threshold slider. Search costs **zero AI credits** — only tailoring does.
- **2 · Convert the resume to lift the score**: "Tailor to this job" on any
  radar card runs the existing AI tailor pass (feeding the matcher's
  `missingKeywords` in as boosts), records the AI score on the card via
  `jobs:markTailored`, opens the result in the Studio, and quietly re-scans
  the board in the background so refreshed employers keep rolling in.
- **3 · Auto-apply**: select cards → `ai:autoApply` (capped at 3 per click so
  one click can't drain the daily AI budget) runs the shared tailor pass per
  job, saves each tailored resume into the owner's collection
  (`resumes:insertResume`, same de-dupe as manual saves), and marks the
  listing `applied` with its score and a link out to the posting. The
  platform cannot submit forms on third-party boards — the flow ends with an
  "Open posting" handoff, stated plainly in the UI.
- **4 · Email watch + Telegram alerts**: `jobWatches` saved searches sweep
  hourly via `crons.ts` (55 min interval, 50 min per-watch debounce through
  the internal `jobSearch:sweepDueWatches`), score fresh listings, and push
  digests through `notify.ts` — Resend email (`RESEND_API_KEY`) and/or a
  Telegram bot message (`TELEGRAM_BOT_TOKEN`), with a "Find my chat ID"
  helper (`getUpdates`). Every path returns a status string, so a missing key
  degrades to a recorded `skipped:` reason instead of failing the sweep.
  Client "Run now" reuses the same pipeline with an owner check.

Also: landing page gained two feature cards (radar + auto-apply/watch) and a
radar-aware CTA. New tests: `matchScore.test.ts` (13 cases) — suite now 45.

Still open: alert **delivery** is unverified until `RESEND_API_KEY` and
`TELEGRAM_BOT_TOKEN` are pasted into the Keys tab; live authenticated search
from `convex run` can't be exercised (requires a signed-in session), though
all three board APIs were verified directly and the sweep ran end-to-end
against the deployment.

## Resolved in the ninth pass (2026-10-05) — import, pipeline, usage

- **B5 ✅ — resume paste-import**: new `ai:parseResumeText` action parses
  pasted plain-text resume content straight into the wizard's step-1 form
  shape — shares the daily budget, retry loop, and the run log (new `parse`
  kind; 30k-char input cap, fails fast with a friendly error below 120
  chars). Two new pure helpers in `src/lib/resumeSchemas.ts`:
  `normalizeParsedResume` (trims/caps every field, de-dupes skills, accepts
  bullets as an array **or** pre-joined `bulletsText`, drops content-free
  rows, returns `null` when there's no usable resume) and `mergeFormValues`
  (fills only empty fields — anything the user already typed wins).
  Wizard step 1 gained a dashed **“Paste to autofill”** panel. Live-verified
  end-to-end: a full sample resume parsed with every field correct
  (469/230 tokens, 6.8s, logged `kind: "parse"`, `ok: true`); undersized
  input rejected before any budget spend.
- **E3 remainder ✅ — real pipeline statuses**: `jobMatches.status` now
  includes `interview` and `rejected`; new owner-checked
  `jobs:setJobStatus` mutation drives **Interview / Reject / Restore**
  buttons on radar cards (with a confirming toast). Re-scans only ever
  patch listing content — never `status` — so manual progress survives the
  next sweep, and the 150-row prune still only touches plain `new` rows.
  Tailor + auto-apply are disabled once a card is applied/interviewing/
  rejected.
- **E7 remainder ✅ — usage visibility**: new public
  `aiUsage:usageSummary` query (calls used vs. the 25/day limit, runs and
  failures, tokens + credits over 24h via a new `aiRuns.by_session_time`
  index) surfaced as an **“AI today: N/25 runs · tokens · credits”** line
  under the dashboard greeting whenever there is usage today.
- **Tooling**: `src/convex/tsconfig.json` gained the app's `@/*` path alias
  so shared `src/lib` modules typecheck inside the Convex project (their
  `@/` imports previously failed Convex's own `tsc` pass).

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0 errors,
0 warnings under `--max-warnings=0`), **53/53 tests** (8 new —
normalize/merge coverage), plus the live parse smoke test above.

Still open: **D5** (production build — platform rule), C1/C2/C9
(docs, manifest, OG metadata), C6/C7 (a11y + mobile visual passes), B6
(true PDF export), E-list 11/12 (shareable link, multi-profile), and
alert delivery keys.

## Resolved in the tenth pass (2026-10-05) — listings show on open

- **Job listings visible immediately**: the radar no longer opens on an
  empty list. On first mount with a profile it quietly runs a silent
  **auto-scan with an empty query** (latest postings across all three
  boards — no AI credits), and the empty state reads “Pulling the latest
  listings…” while it runs. Results now have a **“Job listings” header**
  (`N of M saved · sorted by match`), and the Scan-boards button
  spins/disables during both manual and automatic scans. Loading state is
  derived (`searching`) rather than set synchronously in the effect, so the
  `react-hooks/set-state-in-effect` rule stays clean — a warning toast only
  fires if the boards couldn't be reached.

Verified: `tsc -b --noEmit` 0, lint 0 (0 errors/0 warnings), tests 53/53.

## Resolved in the eleventh pass (2026-10-05) — "I don't see the list of jobs"

Root-caused with real deployment data (`convex data jobMatches`): the
auto-scan HAD worked (71 listings stored ~9 min earlier) but **the default
`minScore = 40` threshold hid every one of them** (score distribution
0–19). Two quality bugs were also found in that data:

- **Visibility**: default match threshold 40 → **0** so saved listings
  always render (slider still filters up); results keep the "Job listings"
  header with `N of M · sorted by match`.
- **Entity-escaped markup** (Arbeitnow returns `&lt;div&gt;`-escaped HTML):
  `htmlToText` stripped tags *before* decoding, so decoded markup leaked
  into descriptions — the matcher then tokenized `h2`/`li`/`ul` as keywords.
  Fixed with a post-decode tag-shaped strip pass in `src/lib/aiParse.ts`
  (+test); verified live against the same posting.
- **German filler flooding the scorer**: Arbeitnow's German postings let
  non-stopword filler (`und`, `die`, `der`, `mit`…) dominate the top-26
  terms — depressing coverage scores and filling gap chips with noise.
  `src/lib/matchScore.ts` STOPWORDS gained a curated German function-word
  list (umlaut-free forms only — `tokenize` splits on non-ASCII; ambiguous
  English words like `an/am/war/man` deliberately excluded) plus markup
  residue tokens (`amp`, `nbsp`, `ll`, `lt`…). Live re-probe: German filler
  in missing-keywords = none.
- **Stale rows self-heal**: `jobMatches` gained `scoredAt` (set on insert
  and every upsert patch); the radar's mount effect now re-scans when the
  freshest score is older than 30 min, so parser/scoring fixes reach
  stored listings without a manual scan.

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**54/54 tests**, live probes on real board data (escaped markup stripped ✓,
German filler gone ✓, relevance ordering preserved).

## Resolved in the twelfth pass (2026-10-06) — "Add locations"

- **Multi-location scan**: the radar's single free-text Location field became
  a **chip input** — type a place and hit Enter/comma (or paste
  "Berlin, London") to add it, ×/Backspace removes, capped at 8 with
  case-insensitive de-dupe. A **quick-pick row** under the scan form offers
  Remote / Worldwide / Europe / USA / Germany / United Kingdom plus the most
  common locations from the user's own saved board (derived client-side),
  with a Clear action that also resets the results filter.
- **Any-of server filter**: new pure helpers `locationTerms` +
  `matchesLocation` in `src/lib/matchScore.ts` — the comma/semicolon string
  splits into normalized terms and a posting passes when it mentions **any**
  requested term or is open to the whole world (remote/worldwide/anywhere/
  global/intl). `gatherPostings` now uses them, so saved watches can carry
  several locations and sweep the same way.
- **Results location filter**: the "Job listings" header gained a select
  listing every location actually saved on the board with counts
  ("All locations · Remote · 42 · Berlin · 12 …"), grouped case-insensitively;
  it filters the visible grid exactly and the empty state explains when a
  location has no saved listings.
- **Watch rows** show their location chip (MapPin) beside the query, so a
  saved alert reads query + location + threshold at a glance.

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**61/61 tests** (7 new — `locationTerms`/`matchesLocation` coverage).

## Resolved in the thirteenth pass (2026-10-06) — B6 true PDF export

- **One-click PDF download** (roadmap **B6**): new `src/lib/resumePdf.ts`
  builds a real, text-selectable, ATS-friendly A4 PDF client-side with jsPDF
  (`jspdf@4.2.1` added), from the same structured data `ResumeDocument`
  renders — rose-accent section headings, contact rule, wrapped summary and
  skills, hanging-indent bullets with drawn bullet dots, right-aligned date
  ranges, education lines, and page-number footers only when the resume
  spills past one page. Every write passes through `ensure()`, so page breaks
  are computed per line — bullet-level pagination, no CSS print hacks (this
  also covers **A6**'s unverified multi-page print).
- **Byte-safe text + filename**: `toPdfText` folds typographic punctuation
  (curly quotes, dashes, ellipsis, bullet → Latin-1 middle dot), keeps
  WinAnsi-safe Latin-1, and drops anything outside it so the core fonts can't
  corrupt the stream (live byte-verified: `é` emitted as a single WinAnsi
  byte, no UTF-8 leakage). `pdfFilename` yields filesystem-safe
  `Resume_<Company>.pdf` (NFKD-folded ASCII, collapsed separators, ≤60-char
  base, `Resume.pdf` fallback).
- **UI**: ResumeResult — both fresh results and saved views — gained a
  **Download PDF** button beside Print / PDF; the filename comes from the
  job's company (falling back to the role), with a success toast and a
  friendly error fallback pointing at Print / PDF.

Verified: `tsc -b --noEmit` 0, lint 0 (0/0), **70/70 tests** (9 new —
sanitizer, filenames, valid-PDF + multi-page pagination + empty resume),
live probes: a 12-job resume paginates to 3 pages with correct bytes, and
the browser ESM build (`jspdf.es.min.js`, the entry Vite bundles) constructs
and emits a valid PDF.

Still open: **D5** (production build — platform rule; jsPDF now lands in the
client graph, so it's flagged for the eventual one-time build).

## Resolved in the fourteenth pass (2026-10-06) — USA listings by state & local hiring

- **Two US-focused boards** added to `gatherPostings` (now five key-free
  sources, all `Promise.allSettled`): **The Muse** (`/api/public/jobs`) and
  **Jobicy** (`/api/v2/remote-jobs`). These are the local-hiring sources —
  Muse publishes duty locations per job ("Dearborn, MI", "Austin, TX"),
  Jobicy's `jobGeo` carries US regions. Both were probed live against the
  real endpoints before wiring; names array is
  `["remotive","remoteok","arbeitnow","muse","jobicy"]`.
- **US-aware location matching** in `src/lib/matchScore.ts`: exported
  `US_STATES` (50 states + DC, name ↔ abbreviation), `US_STATE_NAMES`
  (alphabetical display names for the picker), `USA_TERMS`, plus
  `stateAliases()`/`namesUsPlace()` inside a rewritten `matchesLocation()` —
  a state name matches "Austin, TX" and vice versa, short codes ("ME",
  "CA") only match **whole tokens** (never inside "Melbourne"/
  "Games"), and a USA term ("USA", "United States"…) matches any US
  place while foreign cities stay out. Remote/worldwide listings still pass
  every filter.
- **State picker + city/state/town entry**: the radar's location chip input
  placeholder now reads "City, state or town", and the quick-pick row gained
  a **+ State…** select listing all 51 names — pick one and it becomes a
  normal removable chip, so a scan can target any US state or any local
  city/town by name.
- **By-location grouping** in results: a **By match / By location** toggle
  in the results header (aria-pressed) buckets the grid by the listing's
  exact location — largest group first — with a MapPin group heading
  ("{n} hiring") before each run of cards, so the scan reads like a list of
  businesses hiring per city/state/town. Header subtitle flips between
  "grouped by city/state" and "sorted by match".

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**75/75 tests** (5 new — state name↔city/ST, whole-token codes, USA term vs
foreign, anywhere pass, 51-name picker).

Still open: **D5** (production build — platform rule).

## Resolved in the fifteenth pass (2026-10-06) — local retail & food employers

- **Direct scans of named chains** ("include food outlets like Walmart, Big
  Lots, Home Depot, Lowe's, Taco Bell, WinCo, Starbucks… scan all local
  listings in the area"): new `src/lib/localEmployers.ts` registry + fetchers
  in `gatherPostings` — every source probed live before wiring:
  - **Workday career sites (6, JSON)**: Walmart (`wd504/WalmartExternal`),
    Home Depot (`CareerDepot`), Lowe's (`LWS_External_CS`), Target
    (`targetcareers`), Chipotle, Dollar Tree — list POST + per-job detail GET
    for the real location, full description, and `startDate` (the list view
    only has a vague `locationsText` and a relative `postedOn`).
  - **Taco Bell** — WordPress site with a server-rendered JSON-LD ItemList;
    job URL slugs carry title + city + state (`manager-in-training-or/
    the-dalles-or/955703939` → "Manager In Training, The Dalles, OR").
  - **WinCo Foods** — iCims list view (cookie-gated server render): rows give
    title/snippet, detail pages give city-state + posted date + description.
- **Location-first employer search**: `buildWorkdaySearchText` prefers the
  scan's location chips (Workday matches location text — "austin tx" returns
  Walmart's 59 Austin openings), else the query with brand words stripped
  ("walmart cashier" → "cashier"), else newest. Local query/location filters
  still run over everything afterwards, and each source fails independently
  (`Promise.allSettled`, errors surfaced in the existing error list).
- **Employers chip row** in Job Radar: ten toggleable brand chips (Walmart,
  Big Lots, Home Depot, Lowe's, Taco Bell, WinCo Foods, Starbucks, Target,
  Chipotle, Dollar Tree) below Locations — clicking adds/removes the brand
  token in the search box (so watches store it too), `aria-pressed`, active
  state syncs with manually typed brand names. Brands without a key-free feed
  (Starbucks' SSO portal, Big Lots' UKG board) ride the five aggregators'
  full-text search.
- **Pure, tested helpers**: alias/misspelling matching ("lows" → Lowe's,
  "star bucks" → Starbucks, whole-word only), query add/remove/strip,
  Workday relative-date parsing ("Posted 30+ Days Ago" → ms), and the three
  HTML/JSON parsers.

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**93/93 tests** (18 new — registry/chips, searchText, postedOn, Taco Bell/
WinCo parsers), plus a live smoke against today's pages: Taco Bell 23 jobs
parsed, WinCo list 20 rows + detail ("Logan, Utah", posted date), Walmart
list/detail (Austin, TX + 13 KB description).

Still open: **D5** (production build — platform rule).

## Resolved in the sixteenth pass (2026-10-06) — E11 shareable read-only resume link

- **Public read-only share links**: a saved resume can now be shared at
  `/r/<slug>` for recruiters/hiring managers to read without an account —
  roadmap **E-list 11**.
  - **Schema**: `tailoredResumes.shareSlug` (optional) + `by_share_slug`
    index. Set = shared, cleared = link stops resolving.
  - **Backend (`resumes.ts`)**: `createShareLink` (owner-checked; mints a
    random 10-char slug with collision retry, idempotent) and
    `revokeShareLink` (owner-checked; clears the slug) — both require a
    signed-in owner. `getSharedResume` is the public query: it validates the
    slug shape, resolves through the index (case-normalized), and returns a
    **sanitized payload** — resume + score/breakdown + the profile's contact
    block, with the original job posting, application kit, gap notes, and
    owner id deliberately excluded (live-verified: seeded a synthetic shared
    doc, confirmed the payload omitted two planted `SECRET …` strings, then
    deleted the doc and the seed mutations).
  - **Pure helpers (`src/lib/shareLink.ts`)**: `makeShareSlug` (Web Crypto,
    no-lookalike alphabet), `isValidShareSlug` (4–32 lowercase alnum — rejects
    traversal/injection-shaped input), `shareUrl` (origin-trimming
    `/r/<slug>` joiner).
  - **UI**: a **Share link** button on the saved-resume result view mints the
    slug and copies the URL in one click (toasts + “Link copied!” state);
    once shared it becomes **Copy share link** + **Stop sharing** (with a
    confirming toast). Wired through `Dashboard` state (`viewingSavedId` →
    the viewed doc's `shareSlug`).
  - **Public page `src/pages/SharedResume.tsx`** (`/r/:slug`, lazy, outside
    `RequireAuth`): loading spinner, friendly dead-end for unknown/revoked
    slugs, score-gauge header with a “Shared resume · read-only” chip, the
    resume sheet with Print + Download PDF (reuses `resumePdf`), theme
    toggle, and CTAs into `/dashboard` (which routes signed-out visitors to
    `/auth?returnTo=…`).

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**101/101 tests** (8 new — slug length/charset/uniqueness, validation
rejections, URL joining), plus live probes: invalid slug → null, unknown slug
→ null, seeded slug → sanitized payload (case-insensitive), seed cleaned up.

Still open: **D5** (production build — platform rule); share-link happy path
through the UI awaits a saved resume (the deployment has none yet).

## Resolved in the seventeenth pass (2026-10-06) — E4 resume file upload

- **Upload a PDF or DOCX to autofill the wizard** (roadmap **E4**, closes the
  file half of B5 — paste already shipped in pass 9):
  - **New Convex Node action `extractResume:extractResumeText`** reads the
    file server-side (`{fileBase64, filename}` → `{text, kind, charCount}`)
    so the parsers never enter the client bundle. No AI credits — it's pure
    extraction; the text then flows through the existing `ai:parseResumeText`
    pass (same budget/retry/run log) exactly as if pasted.
  - **PDF**: `pdf-parse@2` (pdf.js). Two real deployment-environment problems
    were found by pushing and **fixed at the cause**: (1) pdf.js touches
    `DOMMatrix` at module scope and its Node fallback needs the native
    `@napi-rs/canvas`, which can't ship inside Convex's JS bundle →
    `src/lib/renderShims.ts` installs identity render stubs before pdf.js
    first evaluates (text extraction never renders); (2) pdf.js then failed
    "Setting up fake worker" because `pdf.worker.mjs` isn't on disk in the
    bundle → `src/lib/pdfText.ts` statically imports the worker module, which
    self-registers `globalThis.pdfjsWorker` (pdf.js's documented in-process
    mode). pdf-parse is imported dynamically, after the shims, so Convex's
    module analysis of the action never evaluates pdf.js.
  - **DOCX**: new `src/lib/docxText.ts` — fflate unzip of `word/document.xml`
    (a zip, not a Word binary, so legacy `.doc` is rejected with a friendly
    message), paragraph/line/tab mapping, field-code and deleted-text
    stripping, single-pass entity decoding (`&amp;lt;` → `&lt;`, numeric
    entities → real characters).
  - **Shared guards (`src/lib/resumeFile.ts`)**: extension **and** magic-byte
    agreement (`%PDF` / `PK\x03\x04`), 5 MB cap checked before and after
    decode, portable `bytesToBase64`, `normalizeExtractedText` (newline
    normalization, control-character strip, and removal of pdf-parse's own
    `-- 1 of 1 --` page markers), and the 120-char floor that distinguishes
    real text from scanned images.
  - **Wizard step 1**: the import panel now has a **drop zone + file picker**
    (“Drop your PDF or DOCX here, or browse”, accepts `.pdf`/`.docx`, up to
    5 MB) under the “Paste or upload” toggle. Extraction only fills the
    review textarea — **the AI still runs only when the user clicks
    Autofill**, so every import is visible/editable before it costs a credit.
- **Friendly failure modes** (client + server, live-verified): unsupported
  extension, extension/magic mismatch, corrupt zip, zip without
  `word/document.xml`, password-protected PDF, unreadable/corrupt PDF, and
  no-text/blank PDF (“may be a scanned image — paste the text instead”).

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**124/124 tests** (23 new — magic detection, base64 chunk round-trips,
normalization incl. page markers, DOCX XML/entity mapping + real-zip
extraction, PDF extraction through pdf-parse on jsPDF-built PDFs).
Live-verified on the deployment: PDF extracted (290 chars, correct order,
marker stripped), DOCX extracted (entities/tabs/field codes handled), all six
error paths friendly, and a real **extract → `ai:parseResumeText`** round trip
produced the correct form JSON (name, email, location, role, bullets,
education).

Still open: **D5** (production build — platform rule); share-link UI happy
path awaits a saved resume.

## Resolved in the eighteenth pass (2026-10-06) — E12 multi-profile support

- **Named resume profiles**: an account can keep several master profiles
  (e.g. "Engineering" and "Management") and tailor each against different
  jobs — roadmap **E12**.
  - **Schema**: `resumeProfiles.name` (optional string).
  - **Backend (`resumes.ts`)**: `saveProfile` gained an owner-checked
    `profileId` arg (targets that profile explicitly; absent = legacy
    newest-profile upsert, so nothing changed for existing users),
    `createProfile` (never upserts — mints a fresh profile), `listProfiles`
    (owner's profiles, creation order for stable switcher labels), and
    `deleteProfile` (owner-checked; **refuses while any tailored resume still
    points at the profile** — they'd lose their contact block, application
    context, and share links). Profile names are trimmed/collapsed/capped
    (60 chars, `normalizeProfileName`) at both ends.
  - **Wizard**: explicit target mode (header chip "<Profile> · edits update
    this profile"), blank-start **create mode** with an optional name field
    on step 1, and the right mutation per mode (`saveProfile` with
    `profileId` / `createProfile`).
  - **Dashboard**: a **profile chip switcher** under the workspace tabs
    (active chip highlighted, per-chip × delete with a confirming modal, and
    a **New profile** action that opens the wizard in create mode).
    Switching profiles clears any fresh result (so nothing is ever saved
    into the wrong profile), keeps the saved-resume collection visible, and
    the wizard remounts per target so its draft state never leaks between
    profiles. Boost/kit/saves/`viewingSavedId` all key off the generating
    profile (`resultProfile`), not "newest".
- **Pure helpers + tests**: `normalizeProfileName`/`profileLabel` ("Default
  profile" fallback) in `src/lib/resumeSchemas.ts`.

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**130/130 tests** (6 new — name normalization, capping, unicode, default
label fallback). Live: `listProfiles` returns `[]` signed-out, `saveProfile`
still enforces auth (`"signed out"`), existing profile rows are untouched
(legacy users keep working exactly as before).

Still open: **D5** (production build — platform rule); share-link UI happy
path awaits a saved resume.

## Resolved in the nineteenth pass (2026-10-06) — change-password settings

- **`/settings` account page (protected)**: shows the signed-in user name +
  email, and a change-password form (current / new / confirm, show/hide
  toggles, live mismatch hints). A **new `accounts:changePassword` action**
  verifies the current password with the same lucia-Scrypt scheme the
  credentials provider uses, re-hashes and stores the new one via
  `modifyAccountCredentials`, and calls `invalidateSessions` keeping the
  current session — other devices are signed out, stated plainly in the UI
  (pass-6 follow-up: session management UI).
  - Verifying directly with Scrypt (rather than the provider's
    `retrieveAccount`) intentionally skips the sign-in failed-attempt rate
    limiter: the action only runs for an authenticated user changing their
    own password, who can always reset via email anyway (commented in code).
  - Friendly failures live-verified signed-out: "You're signed out — sign in
    to change your password."; also handled: wrong current password,
    same-password rejection, under-8-char new password, and accounts without
    a password (anonymous/email sign-ins).
- **C8 ✅ — README** now documents the inert template scaffolding (`users.ts`,
  `auth.config.ts`, auth tables, `ConvexAuthProvider`): why it stays
  (platform-owned, do-not-modify) and that nothing depends on it, plus the
  `/settings` and `/r/<slug>` routes in the routes list.

Verified: `convex dev --once` 0, `tsc -b --noEmit` 0, lint 0 (0/0),
**130/130 tests**, signed-out live probe above. The signed-in happy path
reuses the exact primitives live-proven in the sixth pass (Scrypt hash/verify,
`modifyAccountCredentials`, `invalidateSessions`); the UI flow itself awaits
a manual click-through like the rest of the auth surface.

Still open: **D5** (production build — platform rule); share-link UI happy
path awaits a saved resume; reset-email delivery needs a real inbox.


---

## Resolved in the twentieth pass (2026-10-06) — connections settings, 35-mile local scan, refresh button

- **Connections settings ("connect emails and LLMs")**: new
  **`convex/integrations.ts`** module surfaced as a *Connections* card on
  `/settings` above the password form:
  - **AI (LLM)**: status reads the platform-provisioned
    `VLY_INTEGRATION_KEY` (no key to paste — the gateway is managed by the
    deployment); the **Test LLM** button runs one real `vly.ai.completion`
    round-trip and shows the model's reply. Chosen over a model picker
    because `vly.ai.completion`'s contract here exposes `model` but the
    platform bills/provisions one managed gateway — `gpt-4o-mini` stays the
    supported model (same one every tailor/kit/extract/parse run uses).
  - **Email (Resend)**: status shows whether `RESEND_API_KEY` is present in
    the Keys tab; typing an address and hitting **Send test** delivers a
    real Resend email (same `RESEND_FROM` fallback as watch alerts) and
    surfaces the API's error verbatim on failure — exactly what a watch
    digest will do.
  - **Telegram**: status shows token presence + API reachability;
    **Check token** reuses the existing `notify.resolveTelegramChat` to
    prove the token works via `getUpdates`.
  - A **Refresh** button re-reads all statuses; keys themselves stay in the
    platform Keys tab (never client-visible), matching how `notify.ts`
    already gates delivery.
- **35-mile local scan**: location chips now carry a radius — type a place
  and use the new **"within…"** select (10/25/35/50/100 mi) or the
  **"within 35 mi (local)"** quick chip; radius chips render highlighted
  with the Radar icon and travel with saved watches.
  - **Server-side distance filter** in `jobSearch.gatherPostings`: chips are
    parsed by `lib/geo.parseLocationChips` (comma fragments re-joined, so
    "Columbus, OH within 35mi" survives the joined param); each chip's
    origin is geocoded once via a new **`geoCache`** table
    (`convex/geo.ts`, internal lookup/save, 7-day TTL) backed by
    **OpenStreetMap Nominatim** — live-probed first: ZIPs (`postalcode`),
    "City, ST", and small towns all resolve (Open-Meteo mishandles ZIPs, so
    it was rejected). Postings then pass when their location string is
    cached and haversine-measures inside the radius, or — commute-sized
    radii (≤35 mi) only — when they name the chip's place but were never
    geocoded (`mentionsPlace` fallback). Remote/anywhere postings always
    pass; plain chips still apply any-of.
  - **Graceful degradation**: geocoder down or a >35 mi chip without cached
    coordinates falls back to the ordinary location matcher — a scan never
    fails because of Nominatim (its 1 req/s policy is respected by the
    cache: one row per place, shared across all users and the hourly watch
    sweep, which sweeps radius watches the same way).
- **Search refresh button**: a **Refresh** button (RefreshCw icon) next to
  "Scan boards" re-runs the exact same search — upserts refresh scores,
  descriptions, and locations in place (existing statuses untouched), so
  "no listings came back" and stale boards are recoverable in one click.

Verified: `convex dev --once` 0 (schema + 3 new modules pushed),
`tsc -b --noEmit` 0, lint 0 (0/0), **143/143 tests** (13 new `geo.test.ts`
cases: token/clamp parsing, comma-fragment rejoining, haversine sanity
(Columbus→Cleveland ≈126 mi), Nominatim payload shape, fallback matcher).
Live `convex run` smoke: `geo:lookup` miss → `geo:save` → hit returns cached
coordinates; `searchJobs` correctly auth-gates from the CLI. Signed-in scan
clicks (radius chip, refresh, connections tests) await browser use like the
rest of the radar surface.

Still open: **D5** (production build — platform rule); test-email delivery
needs `RESEND_API_KEY` in the Keys tab; LLM test spends one completion
(well inside the 25/day budget).


---

## A. Correctness & robustness — fix first

| # | Item | Detail |
|---|------|--------|
| A1 | **No abuse/rate protection on the AI action** | Login was removed, so `ai.tailorResume` is callable by anyone with the deployment URL and burns `VLY_INTEGRATION_KEY` credits. Add a Convex rate limiter (e.g. max N calls/day) or a per-session token bucket. Highest-priority item. |
| A2 | **No input size cap on `jobDescription`** | Zod enforces `min(120)` but no max — a giant paste inflates the prompt and can exceed context or stall. Cap ~20k chars client + server side. |
| A3 | **AI failure modes** | No timeout, no retry, no fallback model. `maxTokens: 3000` can truncate long profiles → `extractJson` throws the raw "unparsable" message to the user. Raise token budget, retry once, and show an actionable toast ("shorten the job posting / trim a role"). |
| A4 | **Wizard state lost on refresh** | react-hook-form `defaultValues` only; pasting a long JD then refreshing loses everything. Persist draft to `localStorage` (or a Convex draft doc) with debounce. |
| A5 | **Saved resume view hides the job posting** | `jobDescription` is now stored (fixed this session) but `ResumeResult` never receives/renders it. Show the original JD (collapsible) on the result/saved view. |
| A6 | **Multi-page print untested** | Print CSS uses a `visibility` + absolute-position hack; verified only single-page. Test a 2-page resume (long experience) and, if clipped, print the node into a dedicated `@media print` container. |
| A7 | **No save de-duplication** | Same job can be saved repeatedly with no grouping. Consider upsert-per-(jobTitle+company) or a "versions" list per job. |
| A8 | **`breakdown` labels duplicated in 3 places** | `ai.ts` inline union, `schema.ts` `scoreLabelValidator`, `types/resume.ts` `ScoreLabel`. Consolidate on the schema-exported type to prevent drift. |

## B. Missing vs. the original product promise

Scope v1 was "match resume to job listings + wizard + generator", so these were
deferred — they are the headline gaps vs. the original prompt.

| # | Item | Detail |
|---|------|--------|
| B1 | **"Automatically fills out job application" — not built** | The original prompt's #1 feature. Options: (a) generated application answers (short-answer questions, "why this role", availability) shown copy-ready next to the resume — cheapest; (b) browser extension autofill — bigger lift. |
| B2 | **"Job finder" — no listing ingestion** | Paste-only today. Add URL import (extract JD text from a job URL) and/or board feed via public Greenhouse/Lever/Ashby JSON endpoints; keep a saved job list. |
| B3 | **Missing-keyword gap analysis** | Result shows only matched keywords. Extract the posting's keywords **not** in the resume → a checklist that directly drives the 90% goal. |
| B4 | **No "boost to 90" loop** | If score < 90, one-click re-tailor feeding the gap checklist back into the prompt ("work these in if truthful") until target reached. |
| B5 | **No resume import** | Users must type everything. Accept PDF/DOCX/paste-plain-text → prefill the wizard (extract with an AI parse pass). |
| B6 | **No real PDF export** | Print dialog only. `react-pdf`/`jsPDF` (or server render) for a one-click download with filename `Resume_<Company>.pdf`. |
| B7 | **No score history / trend** | `recharts` is already installed; saved resumes have scores + dates — chart progress over time on the studio home. |
| B8 | **No before/after comparison** | Show original bullet vs tailored bullet so the user trusts the rewrite (the "honest by design" claim). |

## C. Updates — polish & consistency

| # | Item | Detail |
|---|------|--------|
| C1 | **README is stale/wrong** | Still documents `RequireAuth`, `use-auth`, `/auth` page, "Convex Auth (for authentication)", Three.js — all removed/never used. Rewrite for the no-login single-user app. |
| C2 | **`manifest.webmanifest` generic** | name/description still "freebuff.com application", colors `#ffffff/##000000` (not clay palette). Update name → Tailorly, theme → `#faf3ec`/berry. |
| C3 | **Landing anchors missing** | "See how it works" navigates to `/dashboard` instead of scrolling to the how-it-works section; "Free to try · no card needed" implies billing that doesn't exist. |
| C4 | **Dark mode has no toggle** | `.dark` tokens fully themed in `index.css` but nothing ever adds the class. Add a small clay theme switch in the header (persist in `localStorage`). |
| C5 | **Reduced motion ignored** | framer-motion animations + clay hovers run unconditionally. Wrap transitions with `useReducedMotion()` / respect `prefers-reduced-motion`. |
| C6 | **Accessibility gaps** | Score gauge lacks `role="img"`/`aria-label`; animated score needs `aria-live`; stepper steps need `aria-current`; pastel-on-pastel contrast (muted-foreground on butter) needs a check. |
| C7 | **Mobile verification** | Stepper labels hidden `< sm` (fine) but forms/job textarea at 320–390px never visually tested this session; verify the result grid stacks cleanly. |
| C8 | **Dead auth scaffolding** | `ConvexAuthProvider` in `main.tsx`, `users.ts`, auth tables/config remain (template says do-not-modify — leave, but document in README why they're inert). |
| C9 | **SEO/OG metadata** | `index.html` has title + description (fixed) but no Open Graph/Twitter tags or theme-colored favicon set. |

## D. Engineering quality

| # | Item | Detail |
|---|------|--------|
| D1 | **Zero tests** | No test runner installed, 0 test files. Start with pure logic: `extractJson`, `clampScore`, breakdown mapping (ai.ts), zod schemas, `profileToFormValues`. Vitest fits the Vite stack. |
| D2 | **No CI** | No `.github/`. Add workflow: `tsc --noEmit` + `eslint` + tests on PR. |
| D3 | **3 pre-existing lint errors** | `ui/carousel.tsx:96`, `ui/sidebar.tsx:611`, `hooks/use-mobile.ts:14` (template shadcn/react-hooks rules). Fix or baseline so `bun run lint` passes and CI can enforce it. |
| D4 | **17 lint warnings** | Mostly `react-refresh/only-export-components` in `main.tsx` / `vly-toolbar-readonly.tsx`; harmless but cleanable. |
| D5 | **No production build verification** | `bun run build` deliberately not run (platform rule). Run it once before shipping to catch bundling issues (e.g. `@vly-ai/integrations` in client graph). |
| D6 | **No structured logging for AI failures** | Failures only hit `console.error` + toast. Log failure reason + token usage (response includes `usage`) to a Convex table for visibility. |
| D7 | **No error boundary around wizard/result** | Root boundary catches full-page crashes; a per-section boundary would keep the studio usable if the result view throws. |

## E. Upgrades — v2 candidates (priority order)

1. **Application auto-fill kit (B1)** — generated short answers + cover letter alongside the tailored resume; closest to the original prompt.
2. **Gap checklist + boost-to-90 loop (B3/B4)** — directly serves "score 90 percent on what businesses are looking for".
3. **Job URL import + job list with pipeline status (B2)** — applied/interview/rejected tracker.
4. **Resume upload/import (B5)** — removes the biggest onboarding friction.
5. **True PDF export (B6)** and **filename-versioned downloads**.
6. **Score trend chart (B7)** using installed `recharts`.
7. **Rate-limit + usage dashboard (A1)** — surface `usage.credits` from the AI response.
8. **Before/after bullet diff (B8)** — trust & wow factor.
9. **Theme toggle (C4)** + **reduced motion (C5)** + **a11y pass (C6)**.
10. **PWA polish** — manifest is wired in `index.html`; add offline draft support and install prompt.
11. **Shareable read-only resume link** (public Convex query with a slug).
12. **Multi-profile support** (frontend vs. PM resumes) — schema change: named profiles.

---

### Already verified working
- Convex schema push + codegen (`exit 0`)
- Typecheck `tsc -b --noEmit` (`exit 0`)
- Lint clean for all app files written this session
- Live AI tailoring end-to-end → valid JSON, breakdown sums, `score: 90`
- No-login flow: landing → studio → wizard → result → save → view/delete
- Print path wired (`.resume-print`), copy-as-text, saved collection with scores
