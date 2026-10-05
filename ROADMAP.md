# Tailorly — Audit: Missing, Updates & Upgrades

Status date: 2026-10-05. Verified this session: Convex push `exit 0`,
`tsc -b --noEmit` `exit 0`, lint (my files clean; 3 pre-existing template
errors remain), live AI smoke test (`ai:tailorResume` → `score: 90`).

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

Still open: B1, B2, B5–B8, C4, C5, C7, C8 (documented in README), D1–D7, E-list.


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
