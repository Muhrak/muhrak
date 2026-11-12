# Progress and handoff

Read this first in every new session, then `CLAUDE.md`, `docs/PLAN.md` and
`docs/ARCHITECTURE.md`. Update it whenever a piece of work is committed.

Last updated: Thu 12 Nov 2026. Branch `develop`.

## Status

About 12% of the 20-day plan. Days 1 and 2 are done, and the landing pages
planned for later (P1) are done early. Next is Day 3.

## Done

### Day 1: accounts
- API `auth` module: register, login, refresh (single-use refresh tokens,
  reuse revokes every session), logout, `GET /me`.
- Web: buyer sign-up (individual and company), login.

### Day 2: sessions, password reset, dashboards, staging
- Web session: stored in `localStorage` and synced across tabs; access token
  refreshes automatically, serialised across tabs with a Web Lock
  (`features/auth/authed-request.ts`); logout signs out every tab.
- Route guards (`features/auth/guards.tsx`): `/buyer/*` and `/seller/*` need
  that role. Logged-out users go to login and come back via `?next=`; the
  wrong role goes to its own area.
- Password reset: `POST /v1/auth/forgot-password` (always 202) and
  `/reset-password`. One-time hashed tokens, 30 min, 60 s cooldown, newest
  link only, all sessions signed out on reset. 9 service tests.
- Email: `notification` module puts jobs on the BullMQ `email` queue; the
  worker renders the template and sends through Resend (prints to the
  terminal locally when `RESEND_API_KEY` is not set).
- Seller login and sign-up pages (one seller type, no sub-type switch).
- Buyer Centre and Seller Centre shells: sidebars from Figma, empty
  dashboards, mobile drawer, "Coming soon" pages for menu items not built.
- Staging on Railway (API, worker, Postgres, EU West) and Vercel (web).

### Landing pages (P1, done early)
- Buyer landing `/` from Figma "Buyer – Landing v2 (Light)" (423:1138).
- Seller landing `/sell` from Figma "Seller – Landing" (285:12), built light.
- Shared sections in `apps/web/src/components/landing/sections.tsx`.
- Nav: logged out shows Sign in; logged in shows a profile button that opens
  the dashboard. Full-screen hamburger menu below `lg`.
- Buyers land on `/` after login or sign-up, sellers on `/sell`, unless they
  were sent to login from a protected page (then they go back there).
- Seller hero email box opens seller sign-up with the email filled in.
- Mobile has its own hero style (developer reference `refs/mobile view ref.jpg`).

### Bug fixes (Thu 12 Nov)
- Signed-in users no longer see the login or sign-up form (typed URL, link
  or Back). `SignedOutOnly` in `features/auth/guards.tsx` keeps the form
  invisible until the session is read; signed-in users see "You're signed
  in. Taking you to your account…" and are redirected. Buyer and seller.
- Buyer and seller are now fully isolated (developer's strict rule): one
  session per side in `features/auth/session.ts`, every auth helper takes
  the side, login sends `role` and the API refuses an account from the
  other side with 403 ("This is a buyer account. Log in on the buyer
  side."). Both can be signed in at once in one browser; logging out of
  one leaves the other. 5 new service tests (`login.test.ts`). The old
  shared session key is dropped, so everyone logs in once more.

## Decisions and rules (the developer set these; do not change without asking)

Design:
- **Light theme everywhere.** Use Figma "(Light)" frames. If a frame exists
  only in dark, ask (the seller landing was converted to light).
- **Desktop must match Figma exactly.** Measure the rendered page against the
  Figma numbers (headless Chrome script) and compare screenshots before
  calling it done. Check phone width (390 px) too.
- **Palette, buyer side** (landing, buyer login/sign-up, buyer dashboard):
  blue from `refs/new ref blue.jpg`: periwinkle `#577FBA` (`#6C89BD` edge),
  blue `#4A88C1`, azure `#519ED2`, sky `#63B6E2`, light sky `#84C9E8`, glass
  edge `#D2E6E7`. Tokens `--color-sky-*`, `--color-glass-edge`.
- **Palette, seller side**: orange `#FF8A3D`, `#FF5A1F`, burnt orange
  `#C2410C`, blue `#2B7BD8` (Figma "06 · Seller Centre"; the older blue
  "Seller – Dashboard (Light)" frame is outdated).
- **Never add a colour** (no cyan, no peach/orange on the buyer side) or a
  saturation boost without asking. No grain texture.
- **No duplicate calls to action**: the hero has "Find a part" / "Start
  selling now", so the nav does not.
- Fonts: Geist (landing, auth), Albert Sans (buyer and seller centres).

Accounts:
- **Buyer and seller are fully isolated. Strict rule.** Separate sessions,
  separate logins, no effect on each other. Details in `CLAUDE.md`
  (Security rules).

Product and code: see `CLAUDE.md` (monorepo, modules, money, security,
one seller type, AI through the worker, etc.).

## Environment

- Windows, no Docker, no `gh`. Native PostgreSQL 17 on localhost:5432.
  Skip `pnpm db:up`.
- Redis: hosted Upstash. `REDIS_URL` (`rediss://…`) in `apps/api/.env` and
  `apps/worker/.env`. Never commit `.env`.
- Run locally: `pnpm --filter @muhrak/api dev`, `pnpm --filter @muhrak/worker dev`,
  `pnpm --filter @muhrak/web dev`.
- GitHub: `github.com/Muhrak/muhrak` (remote `https://Muhrak@github.com/Muhrak/muhrak.git`).
  Commits must use the Muhrak account email, or Vercel (Hobby plan) blocks
  the build.

## Staging

Details in `docs/DEPLOY.md`.
- Web: https://muhrak.vercel.app (Vercel; production branch must be `develop`).
- API: https://muhrak-production.up.railway.app (`/health/ready`).
- Railway project `charismatic-inspiration`: services `muhrak` (API),
  `worker`, `Postgres`, all EU West. Each service picks its app with the
  `RAILPACK_START_CMD` variable (the `railway.json` config-file path never
  applied). The API start command runs migrations first.
- Every push to `develop` redeploys. The Railway CLI on the dev machine is
  linked (`railway logs`, `railway variables`).

## Open items

- Resend has no verified domain, so emails only reach the Resend account
  owner. Needs a domain (for example `muhrak.om`) before real users.
- Placeholder numbers to replace before launch: buyer "2,481+ verified"
  manufacturers, seller "12,940 members" and "185 requests".
- FAQ answers 2 to 5 on both landing pages were written by Claude; the
  developer should review them.
- Pages not built yet show "Coming soon" or plain text: Garage, Resources,
  About, Contact, Careers, legal pages, the theme toggle (dark not built).
- `refs/` (design references) is kept locally and not committed.

## Next up: Day 3 (Thu 12 Nov), see `docs/PLAN.md`

Waiting on the developer's storage choice (recommended: Cloudflare R2 via
the S3 client). The developer also mentioned Day 4 and 5; parts of those
that do not need storage could go first.

- File upload module (direct to storage). Needs a storage provider choice.
- Seller company profile: name, country, city, description, logo.
- Verification documents (CR, VAT certificate, owner ID, bank proof);
  status pending, approved or rejected.
- Aim: a seller completes the profile and submits documents for review.
