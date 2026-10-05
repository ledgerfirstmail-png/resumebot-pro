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
