# Progress and handoff

Read this first in every new session, then `CLAUDE.md`, `docs/PLAN.md` and
`docs/ARCHITECTURE.md`. Update it whenever a piece of work is committed.

Last updated: Sat 14 Nov 2026. Branch `develop`.

## Status

Days 1 to 5 are done (Day 5 on Sat 14 Nov, after the restructuring of the
same day), and the landing pages are done early. Next is Day 6 (AI module).

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

**Sat 14 Nov 2026 (developer decision):** the admin console is no longer a
separate app. It moved from `apps/admin` into the web app under `/admin`
(see "Admin console moved into the web app" below). The worker is no
longer a separate app either: the background jobs run inside the API
(see "Worker moved into the API" below). Then the repo was split into two
standalone apps, all frontend in `apps/web`, all backend in `apps/api`
(see "Two standalone apps" below).

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
  (Since 14 Nov the worker runs inside the API; see below.)

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
- Built as a separate app `apps/admin` (port 3002); moved into the web app
  under `/admin` on 14 Nov 2026 (see below). Admin session cookie
  `muhrak_rt_admin`, `X-Robots-Tag: noindex`.
  Pages: `/login`, `/sellers` (Figma "Admin – Sellers" 405:1892, light),
  `/sellers/[id]` (review page, no Figma frame; same style). Other Figma
  sidebar items open "Coming soon".
- First admin: `pnpm admin` (in `apps/api`) asks for email, name and
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

### Day 5: categories and products (Sat 14 Nov)
- Fields shaped by real buyer requests (developer's WhatsApp examples):
  buyers ask by machine ("Kobelco 380", "Doosan 300") and by part number
  ("6020/F4", "AL2528SEG"), in many units ("5 carton", "4 set"), and care
  about lead time. So a product has: name, category, part numbers (main +
  alternatives, matched ignoring punctuation), brand, genuine/aftermarket,
  condition (new/used/refurbished), price in OMR or "price on request",
  unit, stock, availability (in stock / on order + days), description,
  machines it fits (make + model), up to 6 photos (first = cover).
- 17 starting categories (migration `0008`), incl. Bearings, Belts & Hoses,
  Fasteners, Welding & Cutting, Workshop Tools & Safety.
- API `catalog` module: `GET /v1/catalog/categories` (public),
  `/v1/seller/products` list (tabs All/Live/Draft/Out of stock/Archived,
  search by name or part number, keyset pages), create, get, update,
  `POST /:id/status` (publish/unpublish/archive/restore). Rules: own
  products only (another seller's = 404); drafts for every seller, publish
  only when verified and with at least one photo; status transitions in
  one table (`STATUS_TRANSITIONS`); never deleted, archived; edits carry
  the version they started from (stale edit = 409); price typed as text
  and converted to integer baisa on the server (OMR only); category and
  photos checked; 5,000 products per seller cap; per-user rate limits.
- Photos: new upload purpose `product_photo` (JPG/PNG/WebP, 10 MB). On
  upload check the API re-encodes the pixels with `sharp` 0.35.5 (new
  dependency, approved; patched version, audit clean): EXIF/GPS/camera
  data dropped, rotation applied, 1600 px + 480 px WebP, 50 MP limit
  against decompression bombs, too-small and broken files refused. Only
  these copies are written to `public/products/` in the bucket.
- Web: `/seller/products` (Figma "Seller – Products", dark, converted to
  light; no Import CSV, theme toggle or Views column),
  `/seller/products/new` and `/seller/products/[id]` (Figma "Seller – Add
  product (Light)" card exactly, plus a "Details buyers search by" card in
  the same style). Unverified sellers can save drafts; Publish is
  disabled with a link to verification.
- Tested: 33 new API tests (abuse cases: other seller, unverified, no
  photo, illegal transitions, stale edit and race, double click, tampered
  price/category/photo, cursor) plus 6 photo tests on real images (GPS
  removed, rotation, resize, not-an-image, tiny, truncated); browser + API
  run with 29 checks (upload → publish → list; every abuse case); the
  stored public copy verified free of metadata.
- **Developer action:** allow public reads of `public/*` only (steps in
  `docs/DEPLOY.md`, "Public product photos"). Until then photos upload and
  save fine, but their URLs answer 403 (broken thumbnails).
- Not built yet (later days): buyer-side product pages and search (Day 8),
  AI fill from a photo (Day 7), product views count, CSV import.

### Bug fix: login stuck after logout (Sat 14 Nov)
- After logging out (buyer, seller or admin), the login page showed
  "Logging in…" forever, with the email and password still filled in.
  Cause: Next.js (`cacheComponents`) keeps visited pages alive, and the
  login form's state sat above `SignedOutOnly`, so it survived sign-out.
- Fix: the form and its state now live inside `SignedOutOnly`
  (`LoginFormBody` in `features/auth/login-form.tsx` and
  `features/admin/login-form.tsx`); each sign-in or sign-out remounts an
  empty form. Sign-up forms already worked this way.
- Tested in the browser on all three sides: log in → move around without
  reloading → log out → empty form, working button → log in again.
- Rule for new forms: keep state that must not outlive a session inside
  the auth gate, not above it.

### Two standalone apps (Sat 14 Nov)
- Removed `packages/schemas`, `pnpm-workspace.yaml`, `turbo.json`, the root
  `package.json` and lockfile, `tsconfig.base.json` and `docker-compose.yml`.
  The repo root now holds only `apps/`, `docs/`, `CLAUDE.md`, `README.md`,
  `.gitignore` (and the local, uncommitted `refs/`).
- Each app has its own `package.json` (with `packageManager` and
  `engines`), `pnpm-lock.yaml` and tsconfig. Direct dependency versions are
  exactly the ones locked before the split.
- Schemas: `apps/api/src/schemas` is the source (with the money and seller
  schema tests); `apps/web/src/schemas` is an exact copy. The API test
  `web-copy.test.ts` fails if they differ (checked by changing a copy).
- Commands now run inside each app folder (`pnpm dev`, `pnpm test`, ...).
- Tested: API typecheck and 87 tests; web typecheck, lint, production build;
  both apps run from their own folders and the full admin browser test
  passes (login, isolation, review, document link, emails via the queue).
- **Deploy change (developer, before or right after the push):** Railway
  service `muhrak` → Settings → Root Directory `apps/api`, and variable
  `RAILPACK_START_CMD=pnpm db:migrate && pnpm start`. Vercel is unchanged
  (Root Directory `apps/web`); its first build after the push should be
  checked.

### Email verification by code (Sat 14 Nov)
- Developer decision: buyers and sellers cannot sign in until they enter
  the 6-digit code from the verification email (strict; admins are created
  verified from the command line). A first version sent a link; the
  developer switched to a code the same day.
- Sign-up answers `202` with no body, the same for a new or an existing
  email, before doing the work (no enumeration, also by timing). New email:
  unverified account + code. Existing email: nothing changes; the owner
  gets "You already have a Muhrak account" (log in / reset links).
- After sign-up the same page asks for the code. A right code verifies the
  email and signs in on that side (buyer/seller isolation kept: the code
  works only with the account's own side). Logging in before verifying
  (right password) switches the login form to the code step and sends a
  fresh code (none if one went out under a minute ago).
- Codes: `crypto.randomInt`, 10 minutes (`EMAIL_CODE_TTL_MINUTES`), stored
  only as an HMAC (server key derived from JWT_SECRET) bound to the user,
  single use, only the newest works, 5 wrong guesses kill it. Limits: 15
  code checks per address per 15 min, 1 new code a minute and 5 sign-up
  emails an hour per address, plus per-IP limits. Every failure (wrong,
  expired, used, unknown email, other side, already verified) gets the
  same answer.
- A completed password reset also verifies the email (the link proves the
  inbox). This is how a real owner recovers an email that someone else
  signed up with first (that account could never sign in).
- Migrations: `0005` (`users.email_verified_at`, table
  `email_verification_tokens`; existing accounts marked verified) and
  `0007` (codes: `attempts`, hash no longer unique).
- Tested: 29 service tests (enumeration, guessing, wrong side, expired and
  used codes, double submit, per-address limits, flooding, admin never
  emailed, reset verifies); browser run: seller sign-up → code step → wrong
  code refused → right code signs in; buyer sign-up, later login → code
  step → signed in; used code refused.
- Staging note: until a Resend domain is verified, codes only reach
  `teammuhrak@gmail.com`, which is the staging ADMIN's email (an admin is
  never emailed from sign-up), so no new sign-up can be completed there.

### Redis removed; job queue in PostgreSQL (Sat 14 Nov)
- The free Upstash plan ran out (500,000 requests a month): the always-on
  BullMQ worker polled it day and night, local and staging shared it, and
  staging stopped sending emails. Developer decision: no Redis for now.
- Background jobs now use the PostgreSQL `jobs` table (`shared/jobs.ts`,
  migration `0006`): unique dedupe key, claimed with FOR UPDATE SKIP LOCKED
  (several API copies never take the same job), retries with backoff
  (10 s, 20 s, 40 s, ... up to 5 attempts), permanent errors stop at once,
  jobs left running by a stopped process are released after 5 minutes,
  payload (it can hold one-time links) cleared when done or failed. The
  worker wakes when a job is added and polls every 5 s. Resend's
  idempotency key is the job id, so a retry after a crash never sends twice.
- Rate limits: in-memory counters only (exact with the one staging API
  copy; a restart resets them). Need a shared store before several copies.
- `bullmq` and `ioredis` removed; `REDIS_URL` and `QUEUE_PREFIX` no longer
  read (delete them on Railway when convenient).
- Tested: 12-check queue run against the local database (parallel claims
  never overlap, dedupe, retry and backoff, permanent failure, payload
  cleared, stale release); all API tests.

### Worker moved into the API (Sat 14 Nov)
- `apps/worker` is gone. Its code is in `apps/api/src/worker` (email
  templates, Resend and console providers, the send-email job). `server.ts`
  starts the workers after the API listens and closes them on shutdown
  (running jobs finish first). Still BullMQ: requests only add jobs; retries,
  backoff and idempotent job ids are unchanged.
- New API variables: `RESEND_API_KEY` (unset locally: emails print to the
  terminal; unset in production: emails wait in the queue, never printed),
  `EMAIL_FROM`, `QUEUE_PREFIX`.
- **Found and fixed:** local development and staging use the SAME Upstash
  Redis, so they shared one email queue. The staging worker had been
  sending local test emails (they failed at Resend's sandbox, 403), and
  with workers in every API a local API could have taken a staging user's
  email. Queues now have a per-environment prefix: `bull` in production
  (unchanged, so queued staging jobs stay), `muhrak-dev` locally. Tested:
  a local reset email went through the `muhrak-dev` queue and printed.
- Note: `apps/api/.env` has a real `RESEND_API_KEY`, so local emails now
  go to Resend (sandbox: only to the account owner). Empty it locally to
  print emails instead.

### Admin console moved into the web app (Sat 14 Nov)
- `apps/admin` is gone. Pages: `/admin/login`, `/admin/sellers`,
  `/admin/sellers/[id]`, `/admin/soon/[slug]`; `/admin` redirects to
  `/admin/sellers`. Same look as before (screenshots compared, desktop and
  390 px). Code in `apps/web/src/features/admin/`.
- Admin is a third side in the web auth layer (`AuthSide` in
  `features/auth/paths.ts`): own note `muhrak.signedIn.admin`, own cookie
  `muhrak_rt_admin`, own refresh lock, admin role only. Buyer and seller
  are unchanged. Buyer, seller and admin can be signed in at once in one
  browser; logging out of one leaves the others.
- `/admin` pages send `X-Robots-Tag: noindex, nofollow` and robots meta.
- Tested in the browser: signed-out and buyer-signed-in visits go to
  `/admin/login`; a seller account is refused (403); `next=https://evil…`
  is ignored; list, review, document link (S3), approve, reject (reasons
  required), logout; buyer session survives admin logout; no console or
  CSP errors. Typecheck, lint, build and all 78 tests pass.
- Risk to know: the console now shares an origin with the public site, so
  an XSS bug anywhere on the site could reach an admin's session in that
  browser (before, the separate domain isolated it). Mitigations stay
  (React escaping, lint ban on raw HTML, CSP connect-src 'self'). Before
  launch, consider serving `/admin` from its own subdomain, shorter admin
  sessions and two-factor login.

### Landing pages (P1, done early)
- Buyer landing `/` from Figma "Buyer – Landing v2 (Light)" (423:1138).
- Seller landing `/sell` from Figma "Seller – Landing" (285:12), built light.
- Shared sections in `apps/web/src/components/landing/sections.tsx`.
- Nav: logged out shows Sign in; logged in shows a profile button that opens
  the dashboard. Full-screen hamburger menu below `lg`.
- Buyer nav links: Manufacturers, Muhrak AI, Garage. "Distributors" was
  removed on 13 Nov 2026 at the developer's request (it is still in the footer).
- No light/dark theme toggle anywhere: the site is light only (developer
  decision, 13 Nov 2026; the Figma moon button is left out).
- Buyers land on `/` after login or sign-up, sellers on `/sell`, unless they
  were sent to login from a protected page (then they go back there).
- Seller hero email box opens seller sign-up with the email filled in.
  A signed-in seller sees "Signed in as <name>" and "Go to Seller Centre"
  in the same pill instead (14 Nov 2026; phone shows just the name). A
  signed-in buyer still sees the email box (visitor on the seller side).
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

Product and code: see `CLAUDE.md` (two standalone apps, modules, money, security,
one seller type, AI through the worker, etc.).

## Environment

- Windows, no Docker, no `gh`. Native PostgreSQL 17 on localhost:5432.
  (No Docker setup in the repo any more.)
- No Redis (removed 14 Nov 2026). Never commit `.env`. To print emails
  locally instead of sending them, start the API with `RESEND_API_KEY=`
  empty (the local `.env` has a real key).
- Run locally: `pnpm dev` in `apps/api` (API + background workers) and
  `pnpm dev` in `apps/web`.
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
- Rate limits on every auth endpoint and a site-wide per-IP ceiling
  (in-memory since 14 Nov; was Redis). Failed logins: 5 per email+IP per 15 min, 20 per
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
- (Fixed 14 Nov: sign-up no longer reveals existing emails; see "Email
  verification".)
- CAPTCHA (e.g. Cloudflare Turnstile) after repeated failures: needs a
  provider account; ask the developer.

Still open (Day 3 files):
- **Developer action:** on Vercel set `STORAGE_ORIGIN` (see DEPLOY.md);
  without it the CSP blocks uploads on the website.
- Replaced logos and documents stay in the bucket (the API has no
  delete permission, on purpose). Fine for now; a cleanup job can come later.
- Seller logos and documents are not re-encoded, so their metadata stays
  (they are private). Product photos ARE re-encoded (Day 5). Re-encode
  logos too before store pages become public.
- No virus scanning of uploads. Only PDF, JPG and PNG are accepted (checked
  by content), and files are served from the S3 domain, never ours.

Other:

- Resend has no verified domain, so emails only reach the Resend account
  owner. Needs a domain (for example `muhrak.om`) before real users. With
  email verification this now BLOCKS every new sign-up on staging (the
  owner address is the admin's).
- Placeholder numbers to replace before launch: buyer "2,481+ verified"
  manufacturers, seller "12,940 members" and "185 requests".
- FAQ answers 2 to 5 on both landing pages were written by Claude; the
  developer should review them.
- Pages not built yet show "Coming soon" or plain text: Garage, Resources,
  About, Contact, Careers, legal pages, the theme toggle (dark not built).
- `refs/` (design references) is kept locally and not committed.

Still open (Day 4 admin):
- **Developer action (14 Nov):** the admin console is now
  `https://muhrak.vercel.app/admin`. Delete the `muhrak-admin` Vercel
  project (its builds fail now) and remove its URL from `CORS_ORIGINS` on
  Railway (steps in `docs/DEPLOY.md`, "Admin console").
- There is one admin level (no "super admin" or roles yet). Every admin can
  approve and reject. The Figma "Admin Users & Roles" page is for later.
- Admin sessions use the same 30-day refresh cookie as buyers and sellers.
  Consider shorter admin sessions and two-factor login before launch.
- No admin page shows the audit log yet ("Activity Logs" is Coming soon);
  the rows are in the `audit_log` table.
- The workers now run inside the API and share its AWS key (one IAM user,
  PutObject + GetObject only). The plan for a separate read-only key for
  the worker no longer applies.

## Next up: Day 6 (Sun 15 Nov), see `docs/PLAN.md`

- AI module: queue job, vision model behind an interface, fixed output
  fields with a confidence level each, Zod-validated.
- Safety: image checks, per-user daily limit, monthly budget cap, on/off
  switch, every job logged.
- Aim: sending a photo to the API returns the part's name, category, part
  number and fitment (the Day 5 fields).

**Developer actions, payment (start now):** choose and apply to a payment
gateway (merchant approval can take 1-2 weeks), and ask the gateway and a
lawyer whether Muhrak may hold buyers' money until delivery. See
"Decisions needed" in `docs/PLAN.md`.
