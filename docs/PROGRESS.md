# Progress and handoff

Read this first in every new session, then `CLAUDE.md`, `docs/PLAN.md` and
`docs/ARCHITECTURE.md`. Update it whenever a piece of work is committed.

Last updated: Thu 19 Nov 2026 (Day 10: buyer–seller chat on Stream). Branch `develop`.

## Status

Days 1 to 5 are done (Day 5 on Sat 14 Nov, after the restructuring of the
same day), and the landing pages are done early. Maintenance mode in the
admin console was added on Sun 15 Nov at the developer's request (outside
the day plan).

**Mon 16 Nov (developer decision): Day 6 (AI) is built on Google Gemini**
instead of waiting for a Claude key; another provider can replace it later
(one file in `modules/ai/providers`). See "AI module (Day 6)" below.

**Sun 15 Nov (developer decision): Day 6 (AI) was on hold** until the
company had a Claude API key and had settled its payment procedures. Done
instead the same day: the non-AI half of Day 8 (part search by text and
matching) and all of Day 9 (quote requests, buyer "Inquiries & RFQs",
seller "RFQ Inbox", expiry, email to the seller). Still to do from Days
6-8: the AI module, AI fill on Add product, and the buyer photo upload.

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

### Seller profile header made compact (Mon 16 Nov, developer request)
- The Figma 600 px top band left about 300 px of empty gradient above the
  company card. Developer decision: the identity block now follows the nav
  (band as tall as its content, about 315 px at 1440), with a soft fade
  into the page. Phone layout unchanged apart from less top space.

### Public Sellers directory and seller profile (Sat 14 Nov, early)
- Developer decisions: "Manufacturers" renamed "Sellers" (nav -> `/sellers`,
  page title, footer: one "Sellers" link replaces Manufacturers and
  Distributors). Figma "Buyer – Manufacturers v2" (244:6812) and "Buyer –
  Manufacturer Profile v2" (245:6812) are dark only: built LIGHT with the
  buyer palette (landing aurora and dome, ink text, white cards), layout
  and sizes from the frames. Profile shows only Overview and Products tabs;
  no "Established" / "Replies within" lines, no Send inquiry / How to order
  (they come with quote requests); only a "New" label (verified or
  published in the last 30 days), no "Top supplier" yet.
- API `storefront` module (public, no sign-in, 300 requests / 5 min per
  IP): `GET /v1/sellers` (search by company, brand, machine model or part
  number; category tabs with seller counts; sort A–Z or newest; 8 per
  page, numbered pages), `GET /v1/sellers/:id`, `GET /v1/sellers/:id/products`.
  It owns no tables: verified sellers come from the seller module, live
  products from the catalog. Only VERIFIED sellers and PUBLISHED products;
  an unverified or unknown seller is a 404, products included; never
  email, phone, website, CR or VAT (buyers deal through Muhrak).
- Seller logos are now public too, so they are re-encoded like product
  photos (metadata dropped, 512 px WebP, transparency kept) into
  `public/logos/`. Logos uploaded before today are converted the first time
  a public page needs them.
- Index `seller_profiles_status_name_idx` (migration `0009`).
- Company profile "Preview store" now opens the seller's public page.
- Tested: 7 storefront service tests (404 for unverified, no private
  fields, filters only among verified sellers, New label) and a browser run
  with 12 checks (nav/footer rename, directory, search by part number,
  category tab, profile, overview, 404s, no private data), desktop and
  phone. The bucket's `public/` folder answers publicly now (photos load).

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

### Day 8 (text half): part search (Sun 15 Nov)
- Public `GET /v1/parts?q=&category=&page=` (storefront module; 120
  requests / 5 min per IP; 20 per page, up to 50 pages). Only PUBLISHED
  products of VERIFIED sellers; seller shown by public name and place only.
- Matching (catalog repository, one parameterised query), strongest first,
  then newest: **Exact match** (main part number, punctuation ignored),
  **Cross reference** (another part number, or one starting with the
  search), **Fits your machine** (make + model contains it), **Related
  part** (every word in the name, brand or machines). LIKE wildcards in
  the search are escaped. Machine matching per word needs 3+ characters.
- Index `products_status_published_idx` (migration `0011`). Word and
  machine matches are substring searches that read all live products of
  verified sellers: fine for the market test; add a trigram index (needs
  the `pg_trgm` extension, ask first) when the catalogue grows.
- Web `/search` (public): hero like the Sellers page, results in the row
  style of Figma "Muhrak AI – Results v2" › "Recommended sellers"
  (248:6895), dark only, converted to light. The landing "Find a part" and
  the buyer dashboard "Browse parts" now open `/search`; "Ask Muhrak AI"
  still opens the Coming soon page (photo route, after the AI module).
- Fixed in passing: the Sellers directory's brand search escaped `%` and
  `_` wrongly (it searched for a literal placeholder text instead).

### Day 8 (photo half): Muhrak AI photo search (Wed 18 Nov)
- **API.** New upload purpose `part_photo` (buyer only; JPG/PNG/WebP up to
  10 MB). Re-encoded like product photos (GPS and other metadata dropped)
  but kept PRIVATE at `files/part_photo/<id>.webp`, never under `public/`.
  Migration `0013` only adds the enum value.
- `/v1/buyer/ai` router (buyer role): `status`, `POST identifications`,
  `GET identifications/:id`, and `GET identifications/:id/photo` (a
  10-minute signed link to the buyer's own photo, `no-store`). Each side
  can only send its own photo kind (`getOwnedPhotoForAi(user, upload,
  purpose)`); limits and budget are shared with the seller side.
- Part search (`GET /v1/parts`) also takes `partNumber` and `machine`
  (photo search: each matched only as itself; a machine match then also
  needs the part name). `category` now narrows name and machine matches
  only: a part-number match shows whatever its category.
- **Web `/ai` (Muhrak AI), redesigned the same day at the developer's
  request** from `refs/muhrak ai/muhrak ai design .jpeg` (the dark Figma
  "Muhrak AI – Upload/Results v2" frames are no longer used). A standalone
  full-screen page: no site nav or footer; its own slim bar (logo → `/`,
  Home / Sellers / My requests, account button, phone menu). Serif question
  (Gloock), Manrope text, chips, a bottom input pill + round camera button,
  soft glow in the buyer blues only (the reference's pink/green were not used).
- Chat-like flow on one page: the buyer's photo (or typed text) on the
  right; one status line under it with the Muhrak mark turning like a
  ratchet (`public/ai/muhrak-mark.svg`, `.ai-mark` / `.ai-shimmer` in
  globals.css) whose text changes: Uploading your photo → Identifying the
  part → Finding matching sellers. Then the identified part (name,
  confidence, part no. / fits / category), "Edit details" in a modal, and
  the matching parts; a part opens the quote request modal. AI guesses
  marked "low" are left out, as on Add product.
- State in the URL (`?id=` photo search, `?q=` typed search, edited
  details, page, `quote`), so reload, Back and "log in, then come back"
  work (`afterLoginPath` allows `/ai`). `/buyer/find-part` redirects to
  `/ai`. Landing "Find a part" (hero and bottom banner), "Try Muhrak AI",
  the nav/footer "Muhrak AI" and the dashboard "Ask Muhrak AI" open `/ai`.
- No "sellers notified" (one seller per quote request, 15 Nov decision).
- Tested: 275 API tests (new: buyer photo kind, private storage, photo
  link ownership, search field mapping, query schema); live abuse checks
  with temporary accounts (seller on buyer routes 403 and back; wrong
  photo kind or someone else's photo 404; cleaned photo not publicly
  readable); one real photo by the developer (AC compressor, high
  confidence). Result, edit modal and progress checked on screen, desktop
  and phone.
- Not checked on screen: a result list with real matches (the local
  database has no published products of verified sellers).
- Two small test files from the abuse check stay in the staging bucket
  (`pending/b6531a02…` and `files/part_photo/b6531a02….webp`; the API
  cannot delete). Remove in the AWS console if wanted.

### Buyer landing in the Muhrak AI theme (Wed 18 Nov, developer request)
- `/` (buyer landing only) now looks like the Muhrak AI page: white page
  (not grey) and the soft blue glow (`components/landing/soft-glow.tsx`)
  rising from the lower edges, instead of the aurora arcs, in the hero,
  under the "What's in it for you?" cards and in the bottom banner. Buyer
  blues only. The seller landing (`/sell`) and other pages are unchanged:
  the shared sections take a `soft` prop that only the buyer landing sets.
- Desktop hero fills the window (`max(720px, 100svh)`), so the glow
  reaches the bottom edge; the stats strip has thin lines above and below.
- Glass parts (white on black) are inverted and multiplied on the white
  page, so they read as clear glass.
- Sparkles twinkle around "What's in it for you?" (`twinkles.tsx`): 2 to 4
  copies of the star at random spots every 1.8 s, fading in and out; none
  for reduced motion.
- This departs from the Figma "Buyer – Landing v2 (Light)" frame on
  purpose (developer request).
- Phone fixes (same day): footer uses the soft glow (the strong mobile
  band drew a grey edge on white) and stacks icons + copyright on the
  left; glass parts use ready-made see-through copies
  (`public/landing/glass-*-light.png`, no CSS blend modes, which failed on
  phones); the bearing has its own phone spot (`GlassObject.phone`); the
  glow under the cards fades out; even phone spacing between sections;
  stars on phones only above the heading and at the edges.
- Phone menu (`nav-actions.tsx`) is opaque now (a see-through panel let
  the page show through): white with the soft glow on the buyer side,
  solid canvas with the orange bands on the seller side.

### Seller dashboard with real data (Wed 18 Nov, developer report)
- The "Finish setting up your store" checklist now ticks "Add your first
  product" when the seller has any product (draft included) and is hidden
  once all three steps are done.
- Stat cards: live (published) products and open quote requests from the
  API ("Store views" stays 0 until views are counted). The two panels list
  the newest 4 quote requests and products (`useSellerRfqsPreview`,
  `useProductsPreview`, cached under the list keys so changes refresh them).
- Seller Centre pages at 85% on `lg`+ like the Buyer Centre (`portal-shell.tsx`).
  Neither Centre may get pop-up dialogs inside the zoomed page.
- The seller's name and email sit in a black welcome card with "View my
  store" and "Add product"; the "Seller account" tag is gone (like the
  Buyer Centre welcome card).

### Sellers pages in the Muhrak AI style (Wed 18 Nov, developer request)
- `/sellers` and `/sellers/[id]` redesigned (replaces the Figma
  "Manufacturers v2" / "Manufacturer Profile v2" layouts): white page, soft
  glow, Gloock headings, Manrope text, grey chips, white rounded cards
  (`features/storefront/soft.tsx`). The nav is the landing nav (the search
  box moved from the nav into the page, the AI page's search pill).
- Seller cards lead with the company logo (initials without one), not a
  product photo; verified mark, place, main category, product count.
- Seller page: identity card (logo, serif name, verified mark, about,
  live products / verified since / on Muhrak since), Products and About
  chips; product cards show the product photo.
- Landing: headline is now "Any part. Found." (was "find any Spares.");
  nav links are centred on the page (they sat ~70 px right because the
  logo is wider than the account button), except when the nav carries a
  search box.

### Fix: Back on a Muhrak AI result showed "Identifying" again (Thu 19 Nov, developer report)
- Cause: the page kept the "photo being sent" state in memory; Back to an
  earlier `/ai` entry (e.g. a typed search) showed it as still identifying.
  No AI call was made (the API keeps one identification per photo and the
  page only asks the AI on a new photo), but the screen looked stuck.
- Fix (`muhrak-ai-page.tsx`, `features/ai/api.ts`): Back/Forward drops the
  in-memory run; a finished identification is never fetched again
  (`staleTime: Infinity`) and is kept for the tab in sessionStorage, so
  Forward and reloads show it at once; the local photo preview is kept per
  identification. A result opened from a link with nothing cached says
  "Loading your result" (a plain fetch), not "Identifying the part".
- Checked in a real browser, desktop and phone: open → Back → Forward →
  reload: no identification request after the first load, no AI call.

### Buyer dashboard with real data (Thu 19 Nov, Day 9 follow-up)
- "Open requests" and "Quotes received" come from the buyer's own quote
  requests; the "My requests" panel lists the newest 4 (part, reference,
  seller, quantity, status) and opens each in `/buyer/requests`.
  `useBuyerRfqsPreview`, kept under the buyer request key so sending or
  cancelling refreshes it. "Orders in progress" stays 0 until orders exist
  (Day 12). The list panel and row moved to `components/dashboard/parts.tsx`
  (shared with the seller dashboard).
- Checked on screen with a temporary buyer, seller and two requests
  (deleted afterwards).

### "Request quote" on a seller's page (Thu 19 Nov, Day 9 follow-up)
- Each product card on `/sellers/[id]` has "Request quote", opening the
  same request form as search and Muhrak AI (`QuoteRequestDialog`, whose
  input is now `QuoteTarget`: only the fields it shows and sends). Visitors
  (and a seller signed in, who is a visitor here) go to the buyer login and
  come back with the form open (`?quote=`; `afterLoginPath` allows
  `/sellers/<id>`). Only a product of that seller on the current page can
  be opened (a tampered `?quote=` opens nothing).
- Public product cards (`GET /v1/sellers/:id/products`) now carry the first
  machine (`fitment`, pre-fills "Fits") and stock / availability / lead
  time (shown on the card and in the form). Additive schema change, copied
  to the web app; 2 new catalog tests.
- Checked in a real browser, desktop and phone: visitor → login → back
  with the form open and pre-filled → sent (RQ-…) → saved with the right
  seller and product; a second request for the same part is refused
  ("You already have an open request…"). Test data removed.

### Day 10: buyer–seller chat (Thu 19 Nov)
- Developer decisions (19 Nov): **Stream Chat** kept (Stream app "Muhrak",
  app id 1734996; keys in `apps/api/.env` as `STREAM_APP_ID`,
  `STREAM_API_KEY`, `STREAM_API_SECRET`); web dependency `stream-chat`
  9.54.4 (exact; the 10.x major was 2 days old); **photos through our own
  private uploads**; **warn** (not block) on phone numbers / emails /
  messenger names. The secret was pasted in chat: rotate it before launch.
- API module `chat` (Stream over plain REST, no SDK). One conversation per
  quote request (channel id = request id) with exactly that buyer and
  seller, opened by a background job (`chat` queue) queued in the same
  transaction as the request; the card is posted from the buyer with only
  `{ type: "muhrak_rfq", rfq_id }`. Older requests get their conversation
  when their user connects. `rfqs.chat_opened_at`, `chat_photos` table,
  upload purpose `chat_photo` (buyer and seller; cleaned, private
  `files/chat_photo/`). Migration `0015`, additive.
- Security: Muhrak's own Stream channel type `rfq` (set up by the API):
  normal users cannot create conversations, add members, upload files or
  post attachments; members can read, write, react, reply, flag and mute.
  Uploads and link previews off, 2,000 characters max. Each side gets its
  own 1-hour chat token for its own user (`/v1/{buyer|seller}/chat/token`);
  buyer and seller use separate chat clients. Photos: `POST
  /v1/{side}/chat/:rfqId/photos` (owner's ready chat photo, used once, tied
  to that request; the API posts it), links `GET .../photos/:uploadId` only
  for that request's buyer or seller and only for its own photos. Names on
  screen come from our API (Stream names can be changed by their owner).
- Web: `/buyer/messages` and `/seller/messages` (Figma "Buyer – Messenger
  (Dark)" 380:690 and the flow frames, converted to light): All / Unread,
  search, conversation list with unread counts, thread with the quote
  request card (from the API), text, photos, the contact-details warning
  bar (no pop-ups in the zoomed Centres), "View request". Phones: list and
  thread swap; the thread scrolls inside. "Go to messenger" on the Request
  sent screen; "Open chat with …" in the RFQ inbox and My requests. CSP
  allows `chat.stream-io-api.com` (https and wss).
- Tested: 299 API tests (new: token for own user only, wrong side, chat off,
  job opens the conversation with exactly the two members and posts the card
  once, refused vs. retried failures, photos from outside the conversation
  or of another conversation = 404, unusable upload refused, contact
  pattern). Live in two real browsers against the Stream app: a real request
  opened its conversation by itself; text both ways live (~2 s); a seller
  photo through our uploads reached the buyer; the warning showed and "Send
  anyway" delivered; desktop and phone. Test data removed (our DB and Stream).
- Fixed while testing: Stream's client gives up after 3 s by default (the
  first load timed out); now 15 s. The messenger pages needed
  `instant = false` like the other Centre pages.
- Railway (service `muhrak`): `STREAM_APP_ID`, `STREAM_API_KEY`,
  `STREAM_API_SECRET` set on 19 Nov (developer OK); staging redeployed with
  migrations 0014 and 0015. Not tested end to end on staging yet (no staging
  buyer/seller accounts while sign-up emails need a verified Resend domain).
- Fix (19 Nov, developer report from staging: "Could not load your
  conversations" next to "All 1", conversation only after ~10 s): requests
  sent before chat existed get their conversation when the user connects,
  but Stream does not send "added to channel" for conversations created
  with their members, and a slow first load overwrote the newer result.
  Now: the token says how many conversations are still being opened
  (`pending`) and the list checks again every 2 s (up to 30 s); only the
  newest load counts; the chat profile is sent once per API process (token
  endpoint ~1.2 s -> ~10 ms); the list loads only the last message per
  conversation (a thread loads its history when opened); the Stream setup
  runs at API startup. Local: list ~8 s -> ~4 s; old conversation appears
  by itself; thread history 0.26 s. The rest is the distance to Stream's
  servers (see "Open items").
- Not built: a sidebar unread badge for chat (it would need a chat
  connection on every Centre page); Muhrak support conversations.

### Day 9 finished: the buyer's photo on a request + end-to-end check (Thu 19 Nov)
- A request started from a Muhrak AI result can carry the buyer's OWN
  photo (developer decision, 19 Nov 2026: shared only with that request's
  seller, cleaned copy, short-lived link, buyer can untick it). Form: "Share
  my photo with <seller>" (on by default). API: `identificationId` on
  `POST /v1/buyer/rfqs`; the AI module checks it is the buyer's own finished
  photo search (`getIdentificationPhotoUpload`, else 404 and nothing
  saved). Column `rfqs.buyer_photo_upload_id` (migration `0014`, additive).
  `hasBuyerPhoto` on every request; `buyerPhotoUrl` (10-minute link) only
  on a single request (GET by id) for its own buyer or seller, never in
  lists. Seller inbox: "Buyer's photo of the part"; buyer: "Your photo,
  shared with the seller". 7 new tests (284 API tests).
- End-to-end in a real browser (temporary accounts, a real photo through
  the normal upload, a copy of a real AI answer; no AI call): Muhrak AI
  result → matching part listed (first time on screen with a real match) →
  request sent with the photo (RQ-…) → seller dashboard and sidebar show
  1 unread → inbox shows the request and the buyer's photo, marks it seen →
  seller declines with a reason → buyer sees "Declined", the reason and
  their photo (phone) → buyer dashboard open requests back to 0. Test
  data removed (the uploaded test photo stays private in the staging bucket).
- Day 9 is complete. Remaining outside code: staging emails need a
  verified Resend domain.

### Day 9: quote requests (Sun 15 Nov)
- Developer decisions (15 Nov): **one seller per request** (Figma "Request
  sent to Korvex Hydraulics"; to ask three sellers the buyer sends three
  requests) and **7-day expiry** for unanswered requests.
- API module `rfq`, table `rfqs` (migration `0011`, additive only).
  Reference `RQ-<number>` (identity from 1001). Status machine in
  `RFQ_TRANSITIONS` (rfq.service.ts): open -> quoted (Day 11) / declined
  (seller) / cancelled (buyer) / expired (sweep); every change is a
  conditional update scoped to the owner and refused after expiry.
- Create (`POST /v1/buyer/rfqs`): buyer only; seller, product and unit
  come from the LIVE product of a VERIFIED seller on the server (the client
  sends only the product id); fields part, part number, machine, quantity
  (1-100,000), needed by, delivery city + GCC country, note (1,000).
  Idempotent: the browser makes a `requestKey` when the form opens, unique
  per buyer, so a double click or retry returns the first request (tested
  with two simultaneous submits). One OPEN request per buyer and product
  (partial unique index); 50 open per buyer; 20 sends an hour and 60 a day
  per buyer.
- The seller's "New quote request" email is queued in the SAME transaction
  as the request (`enqueueJob` now takes an optional transaction), so it
  exists only if the request does; dedupe key `rfq-new-<id>`.
- Expiry: the worker closes open requests past `expires_at` once a minute
  (`FOR UPDATE SKIP LOCKED`, batches of 500; index `rfqs_open_expires_idx`).
  Until the sweep runs, an open request past its time already shows and
  acts as expired. The sweep also runs when no email key is set.
- Buyer endpoints `/v1/buyer/rfqs` (list with tabs All/Open/Quoted/Closed
  and counts, keyset pages; get; cancel). Seller endpoints
  `/v1/seller/rfqs` (list with tabs and an unseen count; get, which marks
  it seen; decline with an optional reason). Another user's request is a
  404. The seller sees the buyer's NAME only; the buyer sees the seller's
  public name and place only. Maintenance gate: `/buyer*` and `/parts*`
  belong to the buyer side.
- Web: quote form and "sent" dialog on `/search` (Figma "Request quote –
  Review v2" 249:7023 and "Sent v2" 249:8013, converted to light; AI chips
  left out; added delivery city/country and a note; "Go to messenger"
  became "See my requests" until Day 10). A visitor (or a seller signed in,
  who counts as a visitor on the buyer side) goes to the buyer login and
  comes back with the form open (`/search` is now an allowed return page
  for buyer login). Buyer `/buyer/requests` (Figma "Buyer – Inquiries &
  RFQs (Dark)" 304:12, light) and seller `/seller/rfq-inbox` (Figma
  "Seller – RFQ Inbox (Dark)" 177:731, light) with an orange unread count
  on the sidebar. On desktop the inbox opens the newest request, which
  marks it read. Not built yet: the "Send quote" fields (Day 11), the buyer
  photo (AI route), "Condition" (requests do not ask for one).
- Tested: 21 rfq service tests + 2 search tests (abuse cases: other buyer
  or seller, wrong side, tampered seller/unit/status, draft or unverified
  product, double submit and race, request key reused, illegal and racing
  transitions, expired, tampered cursor; no emails in responses); live API
  run of 35 checks; search checks (part number with punctuation, cross
  reference, machine, words, `%` and `_`, injection text, page past the
  end); browser run of 25 checks at 1440 and 390 px (search, login on the
  way, form, sent, my requests, seller badge, inbox, decline, buyer sees
  the reason, both sessions kept). Test accounts and data removed from the
  local database afterwards.
- Fixed while testing: a maintenance test failed from 15 Nov 11:00 UTC on
  (it used a fixed end time); it now uses an open-ended window.

### Maintenance mode (Sun 15 Nov, developer request)
- Admin console `/admin/maintenance`, from Figma "Admin – Maintenance Mode
  (Dark)" (414:5122) converted to light. Turn on now (optional end time),
  schedule a window (start/end in Gulf time), end, cancel; what goes
  offline: Whole site, Buyer app or Seller Centre; message shown to users;
  preview; past windows (paged). Left out (developer, 15 Nov): "Payments
  only", "Pause payouts" (no payments yet), "Email sellers 24 h before"
  (the site banner warns everyone), theme toggle, "Super admin" badge.
  "Admins can still log in" is always on, not a toggle.
- API module `maintenance` (table `maintenance_windows`, migration `0010`,
  additive only). One open window at a time, enforced under a Postgres
  advisory lock; end/cancel are conditional updates (double click or two
  admins: one wins, the other gets 409). Windows are never deleted. Times
  checked on the server: no past start, 5 min to 72 h long, at most 90
  days ahead. Every change needs the admin's password again
  (`confirmPassword` in auth: 403 `password_incorrect`, 5 wrong per
  admin per 15 min then 429, every attempt counted before the check) and
  is audit logged in the same transaction (`maintenance.started`,
  `.scheduled`, `.ended`, `.cancelled`); 30 changes per admin per 15 min.
- Gate (`maintenance.gate.ts`) before every `/v1` route: 503 `maintenance`
  with the admin's message and Retry-After to the part of the site the
  window covers. Always open: `/admin/*`, `/status`, `/auth/logout`, admin
  login/refresh, and requests with a valid admin token (signature
  checked). Side of a request: path first (`/seller*` seller, `/sellers*`
  buyer, `/catalog*` shared), then the login side, then the token. Paths
  compared lower-cased without trailing slash, as Express routes them.
  Open windows cached in memory for 5 s, cleared at once on a change; a
  read that started before a change never stores the old state; if the
  database cannot be read, the last known state is kept (stays in
  maintenance).
- Public `GET /v1/status` (no ids, no admin names). Web: an overlay next
  to every page (root layout) shows "We will be right back" over the
  covered side (page underneath `inert`, scroll locked) and a sticky
  warning bar within 24 h of a scheduled window. It re-checks every
  minute, on tab focus, and at once when any API call answers 503
  `maintenance`. A 503 never signs anyone out (refresh keeps the session).
  Background jobs (emails) keep running during maintenance.
- Tested: 38 new API tests (service rules, gate per scope and side, case
  and trailing-slash tricks, forged tokens, races, stale cache, DB down,
  password confirmation and lock-out); 51 live API checks + lock-out
  check; 33 headless-browser checks (desktop 1440 and phone 390: turn on
  with a wrong then right password, buyer and seller pages covered, admin
  login never covered, turn off, schedule a Seller Centre window, warning
  bar only on the seller side, preview, cancel). Test admin and its data
  removed from the local database afterwards.
- **Rule for later days:** payment-gateway webhooks (Days 12-16) must be
  added to the gate's always-open list: they report money that already
  moved and must never get a 503.
- Not built: emails before a window, payments-only scope, payout pause,
  maintenance across several API copies faster than the 5 s cache.

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

### AI module (Day 6, Mon 16 Nov, Google Gemini)
- Provider: Google Gemini over REST with plain fetch (no SDK, no new
  dependency), behind `AiProvider` (`modules/ai/ai-provider.ts`); swapping
  provider = one new file in `modules/ai/providers`. Key in a header, never
  in the URL or logs. 45 s timeout. Model and prices from env.
- API (seller side): `GET /v1/seller/ai/status` ({available}),
  `POST /v1/seller/ai/identifications` {uploadId} (202, queued),
  `GET /v1/seller/ai/identifications/:id` (polled). Answer: name, brand,
  part numbers, category, fitments, description, each with a confidence,
  plus `isPart`. Errors with code `ai_unavailable` mean "show the manual form".
- The model call is a job on the `ai` queue (worker in the API, 2 at a
  time, 3 tries for rate limits and outages only).
- Safety: off unless `AI_ENABLED=true` and a key; on `GEMINI_TIER=free`
  only the user ids in `AI_TEST_USER_IDS` may use it (Google may use
  free-tier data: never real users' photos). Only the owner's own READY
  product photo; the model gets the cleaned WebP (no metadata), never the
  raw upload. One identification per photo (double submit returns the
  first). Per-user limit per 24 h (`AI_DAILY_LIMIT_PER_USER`, 30). Hard
  monthly cap (`AI_MONTHLY_BUDGET_USD`, US$5): calls still running count at
  their highest cost, checked and inserted under one advisory lock, so
  parallel requests cannot overshoot. Answer validated with Zod
  (`aiModelOutputSchema`), text clipped to the form's limits, unknown
  category dropped; text in the photo is treated as data. The model never
  saves or publishes anything.
- Log and ledger: table `ai_identifications` (migration 0012): status,
  validated result, server-side error, provider, model, tokens, cost in
  micro US dollars (integer), duration. Every billed call is costed, even
  an unusable answer. Never deleted.
- `pnpm ai:try --yes <photos>` (apps/api): tries real photos with the
  real categories, prints answer, tokens and cost. NOT counted in the
  in-app budget; real calls only with the developer's OK.
- Tests: service (switch off, free tier, someone else's photo or result,
  daily limit, budget with calls in flight, double submit, bad and hostile
  answers, retries, cost recording), Gemini provider (fake fetch), upload
  ownership for AI. No real call was made.
- **Done Wed 18 Nov (paid tier):** real photo (bearing stamped 6020/F4):
  name, part number 6020/F4, category Bearings & Bushings, all "high";
  1.6k in / 0.2k out tokens, **about US$0.004 per photo**, 5 s. Prompt
  change: the description describes the product, not the condition of the
  item in the photo (it said "grease residue and surface wear" while the
  form's Condition was "New").

### Day 7: AI fill on Add product (Mon 16 Nov; tested on screen Wed 18 Nov)
- `/seller/products/new`: a "Fill in from a photo" card above the form,
  shown only when `GET /v1/seller/ai/status` says AI is available. No
  Figma frame exists; built in the Add product card style, seller palette.
- Phones and tablets (coarse pointer): "Take photo" (rear camera,
  `capture="environment"`) and "Choose from gallery". Computers: "Browse a
  photo". The photo is uploaded as a normal product photo and becomes the
  cover; the form polls the identification (every 1.5 s, up to 75 s).
- Fills only EMPTY fields (never overwrites the seller's typing); part
  numbers, category and machines are skipped when the AI only guessed
  ("low"). Filled fields show "Filled in from your photo" (": check it"
  when not sure). Not a part, failure, limit or AI off: a short message,
  the manual form stays as it was.
- Gemini: `gemini-2.5-flash` is closed to new accounts (404), so the
  default model is now `gemini-3.8-flash`, priced at its January 2027
  rates ($1.50 in / $7.50 out per million tokens, higher than the
  introductory rates, so the budget never under-counts), "low" thinking,
  90 s timeout.
- Real test on 16 Nov did NOT get an answer: `gemini-3.8-flash` on the
  free tier answered 503 "high demand" or timed out. US$0 billed. Retry on
  the paid tier (17 Nov), 1 photo at a time (developer's rule).
- **Tested Wed 18 Nov** (local, headless Chrome, 1 real photo): desktop
  shows "Browse a photo", phone (touch) "Take photo" + "Choose from
  gallery"; photo became the cover; 5 fields filled (name, part number,
  category, description, other part number "6020") with "Filled in from
  your photo" under each; brand left empty (not on the part); nothing
  saved. About 20 s from pick to filled (upload, cleaning, queue, model).
  Logged in `ai_identifications` with its cost.
- Fix 18 Nov (developer report): a second photo left the first photo's
  AI details in the form (the "only empty fields" rule). Now picking a new
  photo first clears what the AI filled in and the seller has not changed
  (fields, added part numbers, machines); the seller's own typing stays.
  Tested with two photos in a row (bearing, then relay AUX2024+L).
- **Gemini budget (developer, 18 Nov): US$5 of credit must last to Day 20.**
  Caps: local `AI_MONTHLY_BUDGET_USD=1`, staging `2.50` (+ 10 photos per
  user per day), leaving ~US$1.50 for `pnpm ai:try` (not counted in the
  in-app cap). At ~US$0.004 a photo that is over 1,000 photos. Real calls
  stay 1 photo at a time.
- Railway `muhrak` (staging): AI variables set 18 Nov (`AI_ENABLED`,
  `GEMINI_API_KEY`, `GEMINI_TIER=paid`, `GEMINI_MODEL`, budget, daily
  limit); redeployed fine. The prompt change reaches staging with the next push.
- Railway warns that `railway.json` (Config as Code) stops working on
  1 Dec 2026; migrate with `railway config migrate` before production.

### Buyer Centre zoomed out (Mon 16 Nov, developer request, NOT checked on screen yet)
- On `lg` and up, the buyer Centre page content (not the sidebar) is shown
  at 85% (`zoom: 0.85` on `<main>` in `portal-shell.tsx`), like a
  zoomed-out browser. Buyer Centre pages have no pop-up dialogs (a zoomed
  parent would misplace them); keep it that way or revisit.

### Sellers page arranged like a shop listing (Tue 17 Nov, developer request)
- `/sellers`: the aurora hero, shortened to 320 px on desktop by squashing
  the aurora to 68% height (`AuroraBand` `decorClassName`), so the whole
  signature shape stays; "Sellers" centred at 88 px (56/72 px smaller)
  and no label; the search is a
  rectangle in the nav on desktop (`SiteNav` `search` slot, only this
  page uses it) and under the title below `lg`. Page padding = nav
  padding (`sm:px-12`). Smaller cards: 2 / 3 / 4 / 5 / 6 per row (phone,
  sm, lg, xl, 1600 px+).
- Site nav, signed in (all landing pages): the round avatar only, no
  first name or chevron.
- Buyer dashboard: a white welcome card (name, email, Browse parts, Ask
  Muhrak AI) and the black Muhrak AI card share one row (half each from
  `lg`); the "Buyer account" badge is gone (17 Nov, developer request).
- After login, buyers land on `/` and sellers on `/sell` even when the
  login came from logging out on the dashboard (`afterLoginPath` ignores
  a `next` that is the side's dashboard). The Muhrak logo in the buyer
  and seller Centres (sidebar and phone top bar) opens the landing page
  (`LANDING_PATH`), not the dashboard.

### Logo loader and toasts (Tue 17 Nov, developer request)
- `components/ui/logo-loader.tsx` (`LogoLoader`): the Muhrak logo as a CSS
  mask with a white reflection sweeping across (`.logo-shine` in
  globals.css; static for reduced motion). Replaces every "Loading…" text:
  Centre/admin page gate (156 px), lists, details, search, seller pages.
  "Load more" buttons keep their text.
- `components/ui/toast.tsx` (`ToastProvider` in `app/providers.tsx`,
  `useToast().success/error/info(title, description?)`): dark card,
  tone icon, bottom centre on phones, bottom right from `sm`, max 3,
  4 s (errors 6 s), paused on hover, dismiss button. Form errors stay
  inline; toasts are for results of actions. Used for: product saved /
  published / unpublished / archived / restored (list and form; replaces
  the green "?saved=" banner and the "Saved" text), company profile
  saved (info + review note when an approved seller's change sends them
  back to review), verification sent, RFQ cancelled (buyer) / declined
  (seller), admin approve/reject, maintenance start/schedule/end/cancel,
  and logout. The quote request dialog keeps its own "sent" screen.

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

- Stream Chat region: connecting and the first query each take ~1–3 s from
  here, mostly network distance to the Stream app's region. A region closer
  to the Gulf would need a new Stream app (new keys); decide before launch.

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

## Next up, see `docs/PLAN.md`

- Day 8 is done (text and photo search). Next: Day 10 (Stream Chat; needs
  a Stream account) or Day 11 (Send quote; no outside service, the `quote`
  transition already exists in `RFQ_TRANSITIONS`).
- Staging: migration `0013` runs on the next deploy (start command runs
  migrations).
- Before launch: a PAID Gemini key (`GEMINI_TIER=paid`); set the AI
  variables on Railway.
- Without the key, Day 11 (Send quote; the `quote` transition already
  exists in `RFQ_TRANSITIONS`) needs no outside service. Day 10 (Stream
  Chat) needs a Stream account.
- Local note: a `pnpm dev` left running since 14 Nov (port 4000) shares the
  local job queue and uses the real Resend key; stop it before local tests
  so it does not take test emails.

**Developer actions, payment (start now):** choose and apply to a payment
gateway (merchant approval can take 1-2 weeks), and ask the gateway and a
lawyer whether Muhrak may hold buyers' money until delivery. See
"Decisions needed" in `docs/PLAN.md`.
