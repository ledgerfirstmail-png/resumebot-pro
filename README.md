## Overview

**Tailorly** — a single-user resume tailoring studio. Paste a job posting, get
back a resume rewritten in the job's own language (never inventing experience),
an honest 0–100 match score with a per-category breakdown, a gap checklist, and
a one-click "boost toward 90" re-tailor. Styled with a Claymorphism theme.

Routes:
- `/` — landing page
- `/auth` — sign in (user name + password), create account, and email-based
  password reset
- `/dashboard` — the Resume Studio (protected by `RequireAuth`): 3-step wizard
  → generator → result → saved collection. Signed-out visitors are redirected
  to `/auth?returnTo=/dashboard`.
- `/settings` — account settings (protected): integrations (LLM / email /
  Telegram connections with one-click live tests), change password, and a
  type-to-confirm **Delete account** card (wipes profiles, resumes, jobs,
  watches + the auth rows).
- `/tracker` (protected) — Applications tracker: every radar listing by
  pipeline stage (new → tailored → applied → interview → rejected) with
  counts, applied dates, and manual stage moves (`lib/tracker` holds the
  pure grouping/sorting; `convex/jobs.listTracker` the query).
- `/r/<slug>` — public, read-only view of a shared resume.

Tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Convex (for backend & database)
- `@vly-ai/integrations` (AI completions, called from the `ai:tailorResume` Convex action)
- Framer Motion (for animations)
- Sonner (toasts)

All relevant files live in the 'src' directory.

Use bun for the package manager.

Key source files:
- `src/convex/ai.ts` — tailoring + application-kit + job-URL import actions (account-gated, per-account daily budget, input-capped, one retry)
- `src/convex/aiUsage.ts` — daily per-account AI budget + structured AI run log
- `src/convex/integrations.ts` — connections status + live tests for the LLM gateway, Resend email, and Telegram (feeds the `/settings` Connections card)
- `src/convex/accountDeletion.ts` — irreversible delete-account mutation: owned rows (profiles, tailored resumes, radar matches, watches) + the ConvexAuth cascade (sessions → refresh tokens/verifiers → verification codes → accounts → user)
- `src/convex/jobSearch.ts` — Job Radar search: 13 key-free sources, US-focus filter, deterministic scoring, radius scan (geocoded distance filter), hourly watch sweep
- `src/lib/tracker.ts` + `src/components/clay/TrackerBoard.tsx` — pipeline tracker logic and UI (`/tracker`)
- `src/lib/geo.ts` — radius-chip parsing, haversine, Nominatim response parsing (pure; vitest-covered)
- `src/convex/auth/usernamePassword.ts` — Tailorly's user name + password auth provider (sign up / sign in / email reset)
- `src/convex/resumes.ts` — per-user profile upsert + saved resumes (de-duplicating save)
- `src/pages/Auth.tsx` — sign in / create account / password reset page
- `src/components/RequireAuth.tsx` — route guard (preserves `returnTo`)
- `src/components/clay/ResumeWizard.tsx` — the wizard (drafts autosave to localStorage)
- `src/components/clay/ResumeResult.tsx` — score, gap checklist, boost, job posting view
- `ROADMAP.md` — audit of what's missing / next upgrades

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

## Environment Variables

The project is set up with project specific CONVEX_DEPLOYMENT and VITE_CONVEX_URL environment variables on the client side.

The convex server has a separate set of environment variables that are accessible by the convex backend.

Currently, these variables include auth-specific keys: JWKS, JWT_PRIVATE_KEY, and SITE_URL.


# Authentication

Tailorly ships **user name + password authentication** via Convex Auth:

- `/auth` (src/pages/Auth.tsx) has four modes: sign in (user name + password),
  create account (user name + email + password), reset via email, and enter the
  emailed 6-digit code + new password. On success it returns to `returnTo`
  (default `/dashboard`).
- `src/convex/auth/usernamePassword.ts` is a ConvexAuth `ConvexCredentials`
  provider (the documented way to do username logins): accounts are keyed by
  normalized user name, passwords hashed with lucia Scrypt, and password
  resets reuse the template's `emailOtp` transport through a dedicated
  `password-reset` email provider. Failed sign-ins are rate-limited by the
  library; wrong user name and wrong password return the same message.
- `src/convex/auth.ts` only gained the new provider in its `providers` array
  (the file header explicitly allows adding providers). `emailOtp.ts`,
  `auth.config.ts`, the `authTables`/`users` schema, and `ConvexAuthProvider`
  in `main.tsx` are untouched.
- **Inert template scaffolding (why it's still here):** `users.ts`,
  `auth.config.ts`, the auth tables in the schema, and the
  `ConvexAuthProvider` wrapper in `main.tsx` come from the platform template
  and are marked do-not-modify — Tailorly's username/password provider is the
  only active sign-in path, so these pieces sit unused-but-loaded. They are
  left exactly as shipped (removing them risks platform-managed behavior);
  nothing in the app depends on them being configured.
- `/settings` (protected) — account page: a **Connections** card (see below)
  and the change-password form (verifies the current one, re-hashes with the
  same scrypt scheme, signs out all other sessions).
- `/dashboard` is wrapped in `RequireAuth` (src/components/RequireAuth.tsx),
  which preserves the intended path as `/auth?returnTo=...`.
- All resume data is **scoped per signed-in user** (`userId` on
  `resumeProfiles`/`tailoredResumes`, enforced in `src/convex/resumes.ts`);
  signed-out queries return null/[] and mutations throw.
- The per-account daily AI budget in `src/convex/aiUsage.ts` (25 runs/day,
  keyed server-side to the signed-in user — not a client-supplied id)
  still applies on top of auth.

Note: reset emails go through `auth.freebuff.app` (configured by the platform).
That service rejected reserved test domains (`example.com`) with an HTTP 500,
so verify delivery with a real inbox; failures surface as a friendly error.

# Connections & Integrations

Tailorly talks to three external services. Keys live in the platform **Keys
tab** (never in the client); the `/settings` Connections card shows live
status and runs one-click tests against each:

- **AI (LLM)** — the managed `VLY_INTEGRATION_KEY` gateway
  (`vly.ai.completion`, `gpt-4o-mini`). The platform provisions the key, so
  there is nothing to paste; "Test LLM" runs one real completion and shows
  the reply. The daily 25-run session budget applies to tailoring, not the
  test (which is a single call).
- **Email (Resend)** — watch-alert delivery via `RESEND_API_KEY` (optional
  `RESEND_FROM` overrides the sender). "Send test" delivers a real email to
  the typed address and surfaces Resend's error verbatim on failure.
- **Telegram** — `TELEGRAM_BOT_TOKEN`; "Check token" proves it via
  `getUpdates` (the same resolver the radar watch form's "Find ID" uses).

# Job Radar — radius scan

The radar scans 15 key-free feeds and keeps **USA listings only**
(`isUsFocusedPosting` in `src/lib/matchScore.ts` is strict): postings from
US-only sources (Taco Bell, WinCo, the Workday US career sites including
Meijer) pass as-is; every other row must carry US evidence in its location —
a US state name or abbreviation, a ZIP code, or a USA term ("United States",
"USA", "US-only"). Everything else is dropped, including unlabeled rows:
bare "Remote" / "Anywhere in the World" / "Worldwide" labels, "Unspecified",
"Hybrid", and foreign-sounding city names without US evidence ("London",
"Toronto", "Paris"). Shared names survive only with US evidence ("Paris,
TX", "Perth Amboy, NJ"). Boards whose feeds are predominantly non-US
(Arbeitnow) are not scanned at all. The three feed layers:

- **Career pages** — direct company career sites via the key-free Workday
  CXS API (Walmart, Home Depot, Lowe's, Target, Chipotle, Dollar Tree,
  Meijer), detail-fetched per row for the real store location.
- **Job listings** — five key-free boards, text-searched and US-filtered.
- **Local listings** — store-level feeds for Taco Bell (WordPress/JSON-LD),
  WinCo (iCims), and the Workday retailers' store locations.

**Local scans are enhanced at three layers**: The Muse's index is queried
server-side with the searched place (`location=Columbus, OH` — an ~8k-row
local pool instead of the 400k-row worldwide index, two pages deep), the
Workday/WinCo fetch caps are widened so sparse store roles survive the
cross-board dedupe, and rows sourced from the local feeds that sit in the
searched place get a **+4 score bonus** (radius-kept neighboring towns +2,
labeled "nearby town" in matched keywords) — pushing genuine local hits to
the top of the results board.

Results show **only the relevant search location**: a multi-place posting
("Columbus, OH; Dallas, TX", "Remote - Columbus, OH") displays just the
place the scan asked for (`relevantLocation` in `src/lib/matchScore.ts`);
single-place and unmatched-by-segment strings keep their original label.
Location handling:

- Plain chips ("Remote", "Ohio", "43215") use any-of text matching
  (`src/lib/matchScore.ts`): state names and abbreviations are
  interchangeable, remote/worldwide postings always pass.
- Radius chips ("Columbus, OH within 35mi") add a **distance filter**:
  the server geocodes the place once (Nominatim via the `geoCache` table,
  7-day TTL, shared across users), then keeps postings whose location
  measures inside the radius (haversine). Posting locations that missed the
  cache are geocoded too — bounded to ~12 new lookups per scan, only for
  postings the filter would otherwise drop, and persisted so every later
  scan/sweep measures for free. Unmeasured postings that *name* the place
  still pass commute-sized radii (≤35 mi) — state-aware, so "Columbus, GA"
  never matches a "Columbus, OH" chip; wider radii require real
  coordinates. Remote/anywhere postings no longer auto-pass a radius chip
  (add a plain Remote chip to include them). If the geocoder is unreachable
  the scan degrades to name matching — it never fails. Radius chips ride
  along in saved watches, so the hourly sweep sweeps the same 35-mile
  circle.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.


## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```


## Common Convex Mistakes To Avoid

When using convex, make sure:
- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.
- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.
