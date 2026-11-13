# Progress and handoff

Read this first in every new session, then `CLAUDE.md`, `docs/PLAN.md` and
`docs/ARCHITECTURE.md`. Update it whenever a piece of work is committed.

Last updated: Fri 13 Nov 2026. Branch `develop`.

## Status

Days 1 to 4 are done (Day 4 on Thu 12 Nov, a day early, because Fri 13 Nov
is off), and the landing pages are done early. Next is Day 5 (categories
and products).

**Replanned on Fri 13 Nov 2026 (developer decisions):**
- MVP = limited features, each working properly. Scope and the "after
  launch" list are in `docs/PLAN.md`.
- **Payment inside the platform, strict.** Buyer pays Muhrak online, the
  order goes live on the gateway's confirmed payment, Muhrak pays sellers
  out after delivery. Days 12-16 are payment, orders, refunds, payouts
  and admin. The gateway is not chosen; decisions 1-3 in `docs/PLAN.md`
  are due Tue 17 Nov. Launch waits for a working live gateway.
- Architecture stays as it is (no merge into one app); production stays
  on Railway + Vercel.

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

### Day 3: uploads, company profile, verification (Thu 12 Nov)
- Storage: private Amazon S3 bucket (setup and variables in
  `docs/DEPLOY.md`). `upload` module: signed 5-minute PUT links with type
  and size in the signature; after the upload the API checks the real file
  type from its bytes (`file-type`) and copies exactly that version from
  `pending/` to `files/`. An upload is attached once, by its owner, for its
  purpose only. PDF, JPG, PNG; documents 10 MB, logo 2 MB.
- `seller` module: company profile (name, GCC country, city, phone,
  website, about, brands, VAT registered, logo; no cover photo, the
  developer dropped it) and documents (CR,
  VAT certificate only if VAT registered, owner ID, bank proof). Documents
  are never deleted: a new file marks the old one superseded.
- Verification state machine in `seller.service.ts`: draft → pending →
  approved / rejected; approved → pending when the company name, country,
  VAT status or a document changes; rejected → pending on resubmit. Every
  change is recorded in `seller_verification_events`. While pending, the
  documents and those fields are locked (checked again under a row lock).
- Web: `/seller/company-profile` and `/seller/verification` from Figma
  "Seller – Company Profile" (179:797) and "Seller – Verification"
  (396:6512), both dark only, converted to light. Status chips use the
  Figma tint with dark text and a coloured dot (green text on white was
  unreadable). The dashboard step "Complete company profile" turns done
  once a profile exists. "Why verify" text changed: the Figma item "Faster
  payouts" does not apply (no online payment), and the UAE trade licence
  row is left out (not one of the agreed documents).
- Tests: 18 seller and 10 upload service tests (abuse cases included), 5
  schema tests, and a 40-check run against the real bucket (another
  seller's files, reused uploads, renamed .exe, wrong size or type at S3,
  buyer on seller endpoints, locked fields).
- `drizzle-orm` upgraded to 0.45 (SQL injection advisory in identifier
  escaping; Muhrak never passed user input there, fixed anyway).

### Day 4: admin console and seller review (Thu 12 Nov, a day early)
- `apps/admin`: separate Next.js app (port 3002), same security headers as
  the web app plus `X-Robots-Tag: noindex`, its own `/api` proxy, so the
  admin session cookie (`muhrak_rt_admin`) lives on the admin domain only.
  Pages: `/login`, `/sellers` (Figma "Admin – Sellers" 405:1892, light),
  `/sellers/[id]` (review page, no Figma frame; same style). Other Figma
  sidebar items open "Coming soon".
- First admin: `pnpm --filter @muhrak/api admin` asks for email, name and
  password (hidden, 14+ characters). The same script sets a new password
  and signs that admin out everywhere. There is no admin sign-up, and admin
  passwords cannot be reset by email.
- API `admin` module (`/v1/admin/*`, admin role only, per-user rate
  limits): seller stats, paginated lists (keyset cursors; queue oldest
  first), seller detail with history, document links, review.
- Review rules (`reviewSeller` in `seller.service.ts`): only while
  pending, under a row lock (a double click or two admins cannot decide
  twice: tested, exactly one of two simultaneous reviews succeeds); the
  admin must decide on exactly the current documents, else 409; approve
  needs every document approved; reject needs a message and a reason per
  rejected document. Documents, status, history and the audit row are one
  transaction; the email is queued after it ("You're verified" or "Changes
  needed" with the reasons; a failed email never undoes a decision).
- `audit` module and `audit_log` table (append only): `seller.approved`,
  `seller.rejected`, and `seller.document_viewed` (every time an admin
  opens a seller's document), each with admin, seller, details and IP.
- Admin list timestamps on `seller_profiles` are stored to the millisecond
  so page cursors are exact.
- Opening a document: if the browser blocks the new tab, a link appears
  instead (the page is never replaced, so a half-done review is not lost).
  Same fix on the seller Verification page.
- Tests: 7 review tests (abuse cases), 27-check API run (wrong side, wrong
  role, tampered cursor, stale review, race), browser run of the console.

### Landing pages (P1, done early)
- Buyer landing `/` from Figma "Buyer – Landing v2 (Light)" (423:1138).
- Seller landing `/sell` from Figma "Seller – Landing" (285:12), built light.
- Shared sections in `apps/web/src/components/landing/sections.tsx`.
- Nav: logged out shows Sign in; logged in shows a profile button that opens
  the dashboard. Full-screen hamburger menu below `lg`.
- Buyer nav links: Manufacturers, Muhrak AI, Garage. "Distributors" was
  removed on 13 Nov 2026 at the developer's request (it is still in the footer).
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

Security (STRICT, 12 Nov 2026):
- **Maximum security in every aspect; real money flows through Muhrak.**
  Every feature must pass the checklist in `CLAUDE.md` ("Security
  standard") before it is called done, abuse cases tested, remaining risks
  reported. No financial risk or data loss for buyers, sellers or the
  platform.

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

Security hardening (12 Nov 2026), done and tested (see docs/DEPLOY.md):
- Rate limits on every auth endpoint and a site-wide per-IP ceiling (Redis,
  in-memory fallback). Failed logins: 5 per email+IP per 15 min, 20 per
  email per hour. Reset emails: 5 per address per hour.
- No user enumeration by timing (login dummy hash; forgot-password answers
  before working).
- Refresh token in an httpOnly, Secure, SameSite=Strict cookie per side via
  the web app's same-origin `/api` proxy; access token in memory; nothing
  secret in localStorage. CSRF origin check on login/sign-up/refresh/logout.
- Web security headers + CSP; SRI; ESLint bans `dangerouslySetInnerHTML`
  and eval; auth forms are `method="post"` (a password can never land in a
  URL, even if scripts fail). API: 100 kb body limit, clean 413/400.
- Staging API: `TRUST_PROXY_HOPS=2` (measured: Railway replaces any
  client-sent X-Forwarded-For, so direct calls cannot fake their IP).

Still open (security):
- **Developer action:** set the same `API_PROXY_SECRET` (32+ random chars)
  on Railway (service `muhrak`) and Vercel (then redeploy both). Until then
  every visitor coming through the website shares one per-IP limit (the API
  sees Vercel's IP), so one attacker could slow logins for everyone for 15
  minutes. Per-email limits work regardless.
- **Developer action:** enable backups on the Railway Postgres volume
  (dashboard, volume, Backups). Plan: also a nightly `pg_dump` job from the
  worker to private storage once the storage provider exists (Day 3).
- CSP allows inline scripts (`'unsafe-inline'`): Next.js streams page data
  in inline scripts; removing it needs per-request nonces, which turns off
  static pages. Revisit before launch. Mitigated: React escaping, lint ban
  on raw HTML, `connect-src 'self'`, httpOnly refresh cookie.
- Access tokens stay valid up to 15 min after logout or password reset
  (stateless JWT). Consider a per-user token version check for money
  actions.
- Sign-up says "email already exists" (enumeration via sign-up), limited
  by the 10/hour per-IP limit. Revisit with email verification.
- CAPTCHA (e.g. Cloudflare Turnstile) after repeated failures: needs a
  provider account; ask the developer.

Still open (Day 3 files):
- **Developer action:** on Vercel set `STORAGE_ORIGIN` (see DEPLOY.md);
  without it the CSP blocks uploads on the website. Also put the four AWS
  variables in `apps/worker/.env` (only the API has them locally).
- Replaced logos and documents stay in the bucket (the API has no
  delete permission, on purpose). Fine for now; a cleanup job can come later.
- Images are not re-encoded, so photo metadata (e.g. GPS in an ID photo)
  stays in the file. Documents are private; strip metadata before any image
  becomes public (store pages, Day 5 product photos).
- No virus scanning of uploads. Only PDF, JPG and PNG are accepted (checked
  by content), and files are served from the S3 domain, never ours.

Other:

- Resend has no verified domain, so emails only reach the Resend account
  owner. Needs a domain (for example `muhrak.om`) before real users.
- Placeholder numbers to replace before launch: buyer "2,481+ verified"
  manufacturers, seller "12,940 members" and "185 requests".
- FAQ answers 2 to 5 on both landing pages were written by Claude; the
  developer should review them.
- Pages not built yet show "Coming soon" or plain text: Garage, Resources,
  About, Contact, Careers, legal pages, the theme toggle (dark not built).
- `refs/` (design references) is kept locally and not committed.

Still open (Day 4 admin):
- **Developer action:** deploy the admin app as a second Vercel project and
  add its URL to `CORS_ORIGINS` on Railway; create the first admin on
  staging with the script (steps in `docs/DEPLOY.md`, "Admin console").
- There is one admin level (no "super admin" or roles yet). Every admin can
  approve and reject. The Figma "Admin Users & Roles" page is for later.
- Admin sessions use the same 30-day refresh cookie as buyers and sellers.
  Consider shorter admin sessions and two-factor login before launch.
- No admin page shows the audit log yet ("Activity Logs" is Coming soon);
  the rows are in the `audit_log` table.
- The worker uses the API's AWS key it does not need yet. On Day 6 give it
  its own read-only IAM user (s3:GetObject only), then remove the shared key.

## Next up: Day 5 (Sat 14 Nov), see `docs/PLAN.md`

- Categories table with starting data.
- Products: name, part number, category, condition, price or "price on
  request", stock, description, photos, status.
- Add product form (manual), product list, edit and archive (no hard
  delete). Only verified sellers can publish. Strip photo metadata.
- Aim: a verified seller publishes a product with photos.

**Developer actions, payment (start now):** choose and apply to a payment
gateway (merchant approval can take 1-2 weeks), and ask the gateway and a
lawyer whether Muhrak may hold buyers' money until delivery. See
"Decisions needed" in `docs/PLAN.md`.
