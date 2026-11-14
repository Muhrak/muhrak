# Muhrak: project instructions

Muhrak is an AI-powered spare parts marketplace for the GCC (heavy equipment
and vehicle parts). Buyers upload a photo of a part, AI identifies it, matched
sellers receive a quote request, and buyer and seller agree a quotation in
chat. Prices are in OMR by default.

**Start every session by reading `docs/PROGRESS.md`**: what is built, the
developer's design and colour rules, staging, open items and what is next.
Update it whenever work is committed.

Read `docs/PLAN.md` for the 20-day build plan and `docs/ARCHITECTURE.md` for
the folder structure and rules before making changes.

## Current goal

An MVP for a market test, built in 20 days starting Tue 10 Nov 2026:
limited features, every one working properly (cut scope, never quality).
Web only. No mobile app.

**Payment is inside the platform (strict, set by the developer on 13 Nov
2026; replaces "no online payment").** The buyer pays Muhrak through a
payment gateway (not chosen yet; it sits behind a provider interface),
the order is live only once the gateway's signed webhook confirms payment,
and Muhrak pays the seller out after delivery. Follow the "Payment rules"
in `docs/PLAN.md`: no card data on our servers, server-computed amounts,
idempotent webhooks, one payment per order, append-only ledger, audited
refunds and payouts, daily reconciliation.

The architecture below stays as it is (confirmed by the developer on
13 Nov 2026; on 14 Nov 2026 the developer moved the admin console into
the web app for the start). Do not propose further merges or splits.

## Decisions already made (do not reopen without asking the developer)

- Monorepo: pnpm workspaces + Turborepo. Apps in `apps/`, shared code in `packages/`.
- Backend: Express 5 + TypeScript, one modular monolith, REST under `/v1`.
- Database: PostgreSQL with Drizzle. Redis + BullMQ for background jobs.
- Frontend: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query,
  React Hook Form + Zod.
- Chat: Stream Chat. Email: Resend. AI: Claude API (vision), always through the
  `ai` module and a queue job.
- Roles: `buyer`, `seller`, `admin`. There is ONE seller type. Manufacturers,
  distributors and suppliers are all `seller`. Do not add seller sub-types.
- Admin is part of the web app (`apps/web`, pages under `/admin`), not a
  separate app (developer decision, 14 Nov 2026; replaces the separate
  `apps/admin` of 12 Nov). It is a third, fully isolated side: own login,
  own session note, own refresh cookie (`muhrak_rt_admin`), no sign-up.
- Design source: Figma file "Muhrak" (Buyer Side, Seller Side, Platform Admin).
  Light theme and English first (changed from dark on 11 Nov 2026 by the
  developer). Use the Figma "(Light)" frames; where a screen exists only in
  dark, convert it using the "Seller – Dashboard (Light)" palette.

## Architecture rules

1. All business logic lives in `apps/api`. Web and admin only call the API.
2. Every API module follows the shape of `apps/api/src/modules/auth`:
   - `x.routes.ts`: HTTP only. Validate, call the service, respond.
   - `x.service.ts`: business rules. No `req`/`res`, no SQL.
   - `x.repository.ts`: database queries only. No business rules.
   - `index.ts`: the only file other modules may import from.
3. A module queries only its own tables. Other modules use its exported
   functions or events.
4. Request and response shapes are Zod schemas in `packages/schemas`.
5. Outside services (AI, chat, storage, email) sit behind a small interface
   with implementations in a `providers/` folder.
6. Slow or retryable work (AI calls, emails, RFQ expiry) is a BullMQ job in
   `apps/worker`, never inline in a request.
7. Every list endpoint is paginated. Every query used in a list has an index.
8. Orders and RFQs are state machines; allowed transitions are defined in one
   place in the service.

## Money rules

- Amounts are whole numbers in the smallest unit, stored with their currency.
  OMR, KWD and BHD have three decimals. Use `packages/schemas/src/money.ts`.
- Never use floats for money. Database columns for money are `bigint`.

## Security rules

- Never log passwords, tokens or API keys. Never commit `.env`.
- **Buyer and seller are fully isolated (strict rule, set by the developer
  on 12 Nov 2026).** They never share a session or affect each other. The
  web app keeps a separate session per side (`muhrak.session.buyer`,
  `muhrak.session.seller`, and `admin` for the console under `/admin`);
  every auth helper takes the side explicitly;
  a buyer signed in counts as a visitor on the seller side and the other
  way round; logging out of one side leaves the other alone. Login sends
  the side and the API refuses an account from another side (403). Any
  new auth, session, nav or data-fetching code must keep this.
- Every endpoint that returns user data checks ownership: a buyer sees only
  their own RFQs, quotes and orders; a seller only theirs.
- AI: per-user daily limits, a monthly budget cap, an on/off switch, validated
  uploads, and Zod-validated model output. The model fills fields; it never
  takes actions. If AI fails, fall back to the manual form.
- Rate-limit login, sign-up, AI and messaging endpoints before any public deploy.

## Security standard (STRICT, set by the developer on 12 Nov 2026)

Muhrak moves real money between buyers, sellers and the platform. Build
with the maximum security available in every aspect. Every line of code
and every feature must pass this checklist before it is called done; no
loopholes, no financial risk, no data loss for buyers, sellers or the
company. Actively try to break each feature (wrong user, wrong side,
tampered IDs and amounts, replay, double submit, races), not only the
happy path, and report any remaining risk honestly.

1. **Authentication and sessions:** every protected endpoint requires a
   valid token; short-lived access tokens; refresh tokens single use and
   revocable; logout and password reset end sessions.
2. **Authorisation:** check role AND ownership on the server for every
   read and write (a buyer sees only their RFQs, quotes, orders; a seller
   only theirs). Never trust IDs, roles or prices sent by the client.
   Admin actions need the admin role and go in the audit log.
3. **Buyer/seller isolation:** separate sessions and logins per side (see
   Security rules). No feature may let one side act as the other.
4. **Input:** validate every request body, query and param with Zod;
   limit lengths and sizes; parameterised queries only (Drizzle), never
   string-built SQL.
5. **Money and orders:** integer amounts with currency, never floats;
   amounts and totals computed on the server; state-machine transitions
   only from the allowed list; database transactions for multi-step
   writes; idempotency for anything that must not happen twice; row locks
   or conditional updates against races.
6. **Abuse:** rate limits on login, sign-up, password reset, AI,
   messaging and uploads; same error for "no such user" and "wrong
   password"; no user enumeration.
7. **Uploads:** type and size checked on the server, private storage with
   short-lived signed URLs, random file names, no executable content.
8. **Web:** escape all user content (no `dangerouslySetInnerHTML` with user
   data); no open redirects; security headers (CSP, HSTS, frame-ancestors,
   nosniff); CORS limited to our own origins.
9. **Secrets and logs:** no secrets in code or the repo; never log
   passwords, tokens, keys or full personal data; generic error messages
   to clients, details only in server logs.
10. **Data safety:** no hard deletes of business records (orders, quotes,
    payments, audit log); migrations reviewed for data loss; database
    backups on.
11. **Dependencies:** ask before adding one; prefer well-maintained
    packages; check for known vulnerabilities.
12. **Tests:** service tests include the abuse cases (forbidden access,
    wrong side, invalid transition), not only the success path.

## How to work in this repo

- Build one module or one screen at a time. Run it and test it before starting
  the next.
- Add or update tests for service-layer logic.
- After changing `apps/api/src/db/schema.ts`, run `pnpm db:generate` then
  `pnpm db:migrate`.
- Ask the developer before adding a new dependency, changing a decision listed
  above, or building anything outside the current day's scope in `docs/PLAN.md`.

## Git branches

- `main` is production; `develop` is development (staging). Commit and push
  to `develop` (or a `feature/*` branch off it). Never commit to `main`
  directly; releases are a pull request `develop` → `main`.

## Commands

```bash
pnpm install
pnpm db:up            # Postgres + Redis in Docker
pnpm db:generate      # create a migration from schema changes
pnpm db:migrate       # apply migrations
pnpm test
pnpm typecheck
pnpm --filter @muhrak/api dev      # API on http://localhost:4000
pnpm --filter @muhrak/worker dev
```

## Known state of the scaffold

The initial scaffold was written without running `pnpm install`. Dependency
versions in the `package.json` files are unverified. First task: run
`pnpm install`, `pnpm typecheck` and `pnpm test`, fix whatever fails, and
commit the lockfile. (Done. The separate `apps/admin` of 12 Nov 2026 was
moved into `apps/web` under `/admin` on 14 Nov 2026.)
