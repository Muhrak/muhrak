# 20-day build plan

Start: Tue 10 Nov 2026. Public launch: **Sun 6 Dec 2026** (moved from
Sun 29 Nov on 28 Nov: Days 13-18 were not done, and the launch changed to
cash on delivery). Calendar days.

Goal: an MVP to test the market. **Limited features, every one of them
working properly.** Web only, no mobile app. One seller type
(manufacturers, distributors and suppliers are all "seller").

**Launch with cash on delivery (developer decision, 28 Nov 2026; replaces
"payment inside the platform" of 13 Nov for the launch).** The buyer
confirms a quotation and pays the seller in cash when the parts arrive.
Muhrak does not hold buyers' money at launch; it records each order and
the commission the seller owes. **Online payment comes next** as a second
method, after launch (or inside these 20 days if the gateway is approved
in time): the Day 12 payment foundation (orders, fake gateway, webhooks,
ledger) stays in the code, switched off (`PAYMENT_PROVIDER=none`), and the
"Payment rules" below apply in full when it is switched on.

Rule for every day: finish by deploying to staging and checking the aim
there. If a day runs late, a feature moves to "After launch"; it is never
shipped half-done.

## The MVP loop

> Seller signs up → gets verified → adds products → buyer uploads a photo →
> AI identifies the part → matched sellers get a quote request → they chat →
> seller sends a quote → buyer confirms → **order is placed (cash on
> delivery)** → seller confirms and ships → **buyer pays the seller in cash
> on delivery** → seller marks it delivered and paid → buyer confirms →
> **Muhrak records the seller's commission**
>
> Later (phase 2): the buyer can pay online on Muhrak, and Muhrak pays the
> seller out after delivery.

## MVP scope

**In the MVP**
1. Buyer and seller accounts, password reset (done)
2. Seller verification and admin approval (done)
3. Products: add, edit, publish; manual and AI mode
4. Buyer photo search with editable AI results; plain text search
5. Seller matching, quote request, seller RFQ inbox
6. Messenger with quote request and quotation cards
7. Send quote; buyer confirms and places a **cash on delivery** order
8. Orders: seller confirms, packed, shipped, delivered and cash received;
   buyer confirms receipt or reports a problem; cancellations
9. Commission: what each seller owes Muhrak, recorded per order; admin
   records the seller's settlement
10. Emails for request, quote and order events
11. Admin: seller approval (done), orders, problem reports, commission,
    suspend user, AI switch
12. Landing pages (done); terms, privacy, cancellation policy, contact
13. Production: domain, backups, monitoring, rate limits

**Phase 2: online payment** (after launch, or earlier if the gateway is
approved in time; see "Phase 2" below): pay online, refunds, seller
payouts, daily reconciliation.

**After launch** (moved out to make room for payment)
- Sellers directory, public seller and product pages
- In-app notification bell and notification settings (email covers launch)
- Full dashboards with counts and charts (simple counts at launch)
- Admin AI cost dashboard, detailed usage analytics
- Arabic, Google and Apple sign-in, saved items and history
- Mobile app

## Cash on delivery rules (launch)

These come on top of the security standard in `CLAUDE.md`.

1. **Amounts come from the server.** The order total is the accepted
   quotation, copied by the API (as now). The client never sends an amount.
2. **State machine in one place.** Cash order: `placed → confirmed →
   packed → shipped → delivered → completed`, or `cancelled` (before
   shipping) or `refused` (the buyer refused at the door). Only the allowed
   side moves each step (seller: confirm or decline, pack, ship, delivered;
   buyer: confirm receipt, report a problem, cancel before shipping).
3. **"Delivered and cash received" is the seller's statement**, recorded
   with time and user. The buyer confirms receipt, or the order completes
   by itself N days after delivery unless the buyer reports a problem.
4. **Commission** is computed on the server (`PLATFORM_FEE_BP` of the
   items subtotal) when the order completes, and written as an
   append-only ledger row "owed by seller". Settlements are admin actions
   in the audit log with a reference. No edits, no deletes.
5. **Abuse tests:** wrong buyer or seller, wrong side, skipped steps,
   delivered twice, cancelling after shipping, commission on a cancelled
   or refused order, double submit, races.

## Payment rules (strict, for online payment in phase 2)

These come on top of the security standard in `CLAUDE.md`.

1. **No card data on our servers.** Use the gateway's hosted checkout
   page or its hosted card fields. Muhrak never sees a card number.
2. **The amount comes from the server.** The charge is the accepted
   quotation (unit price × quantity + shipping), in its currency, computed
   by the API. The client never sends an amount.
3. **Only the gateway's signed webhook marks a payment paid.** The
   browser's return from the checkout page only shows a "checking" screen.
   Every webhook signature is verified; every event is stored once (unique
   gateway event id), so a retried webhook changes nothing.
4. **One payment per order.** A database constraint allows one successful
   payment per order. Paying twice is refunded automatically and flagged.
5. **State machines in one place.** Order: `awaiting_payment → paid →
   packed → shipped → delivered → completed`, or `cancelled`/`refunded`.
   Payment: `pending → succeeded | failed | expired`, then `refunded` or
   `partially_refunded`. Unpaid orders expire (worker job).
6. **Ledger.** Every money movement (charge, platform fee, refund, payout)
   is an append-only ledger row in the smallest currency unit (`bigint`).
   A seller's balance is the sum of their rows, never a stored number that
   gets edited. No deletes, ever.
7. **Payouts.** Only for orders that are delivered (or auto-confirmed),
   past the hold period, with no open problem report. Only to the seller's
   verified bank account; a bank change sends the seller back to
   verification (already enforced). Every payout is an admin action in the
   audit log with the bank reference.
8. **Refunds** never exceed what was captured, go back through the
   gateway, and are recorded in the ledger. Admin refunds are audited.
9. **Daily reconciliation.** A worker job compares the gateway's records
   with ours and alerts on any difference.
10. **Tests** for every abuse case: wrong buyer pays, tampered amount or
    currency, replayed or forged webhook, double payment, refund above
    the charge, payout before delivery, payout of a disputed order.

## Decisions needed from the developer

Decisions 1-3 are now needed for phase 2 (online payment), not for the
launch. Apply to the gateway anyway: approval can take 1-2 weeks.

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| 1 | **Payment gateway.** Must support the GCC countries we sell in, OMR (3 decimals), hosted checkout, webhooks, refunds; ideally marketplace payouts. Candidates: Tap Payments, Checkout.com, PayTabs, Thawani (Oman), Stripe (only with a UAE company). | Phase 2 (apply now) | Choose by country of the company and OMR support; ask each for marketplace terms |
| 2 | **Legal: may Muhrak hold buyers' money until delivery?** Holding funds for others can need a licence; some gateways offer a marketplace/escrow product that covers it. | Phase 2 | Ask the gateway and a local lawyer |
| 3 | **Payout method**: Muhrak pays sellers by bank transfer (admin records it), or the gateway splits the payment automatically. | Phase 2 | Bank transfer recorded by admin, if decision 2 allows it |
| 4 | **Commission** (percent per order) and who pays the gateway fee. | Tue 1 Dec | 5% of the items subtotal (Day 12 default) |
| 5 | **Hold period** after delivery before payout (phase 2). | Phase 2 | 3-day hold |
| 6 | **Cancellation policy** (who can cancel, until when). | Sun 29 Nov | Buyer cancels free before "shipped"; seller may decline before confirming; after shipping only through a problem report |
| 7 | **VAT on commission** and invoices. | Before launch | Ask an accountant |
| 8 | **Commission during the market test** (cash on delivery): charge it from day one, or free for the first sellers? How does the seller pay it? | Tue 1 Dec | Record it from day one (data for later); seller pays by monthly bank transfer; waive per seller if wanted |
| 9 | **Auto-complete**: days after "delivered" before the order completes if the buyer does nothing. | Mon 30 Nov | 3 days |
| 10 | **Cash orders**: must the seller confirm each order? A maximum order value? | Sun 29 Nov | Seller confirms or declines (with a reason); no maximum at launch |

**Launch gate:** the site opens when the cash on delivery loop works end
to end on production (Day 19).

## Done

- **Day 1, Tue 10 Nov:** accounts, sign-up and login.
- **Day 2, Wed 11 Nov:** sessions, password reset, dashboards shells, staging.
- **Day 3, Thu 12 Nov:** uploads, seller company profile, verification.
- **Day 4, Thu 12 Nov (a day early):** admin console, seller review, audit log.
- **Day 5, Sat 14 Nov:** categories and products (seller side), photo cleaning.
- **Day 8 (text half) and Day 9, Sun 15 Nov:** part search and matching
  (no AI), quote requests, buyer requests, seller RFQ inbox, expiry. Day 6
  (AI) was on hold for a Claude API key (developer, 15 Nov).
- **Day 6, Mon 16 Nov:** AI module on Google Gemini instead (developer
  decision, 16 Nov): API, job, limits, budget cap, tests. Prompt tuning on
  real photos waits for the developer's key and OK.
- **Day 10, Thu 19 Nov:** buyer–seller chat (Stream).
- **Day 11, Fri 20 Nov:** send quote, quotation PDF, buyer quote view.
- **Day 12, Sun 22 Nov (a day late):** payment foundation (orders, fake
  gateway, webhooks, ledger) and its web pages; it stays in the code for
  phase 2. Same day: admin on its own host, admin two-factor login, CSP
  with a per-request nonce.
- **Early:** buyer and seller landing pages.

Details in `docs/PROGRESS.md`.

## Week 2: products, AI, buyer loop

### Day 5, Sat 14 Nov
- Categories table with starting data.
- Products: name, part number, category, condition, price or "price on
  request" (money rules: integer + currency), stock, description, photos
  (metadata stripped), status.
- Add product form (manual), product list, edit, archive (no hard delete).
  Only verified sellers can publish.
- **Aim:** a verified seller publishes a product with photos.

### Day 6, Sun 15 Nov
- AI module: queue job, vision model behind an interface, fixed output
  fields with a confidence level each, Zod-validated.
- Safety: image checks, per-user daily limit, monthly budget cap, on/off
  switch, every job logged. Worker gets its own read-only S3 key.
- Run it on real part photos and adjust the prompt.
- **Aim:** sending a photo to the API returns the part's name, category,
  part number and fitment.

### Day 7, Mon 16 Nov
- AI mode on Add product: upload a photo, fields fill in, seller edits,
  publishes. Loading state; manual form if AI fails.
- **Aim:** a seller adds a product from one photo. **Checkpoint 1.**

### Day 8, Tue 17 Nov
- Buyer photo upload page and editable result page.
- Matching by part number, category and text; results with seller, price,
  stock and match label. Plain text search as the non-AI route.
- **Aim:** a buyer uploads a photo and sees matching sellers' products.

### Day 9, Wed 18 Nov
- Quote request: details, quantity, needed-by date, delivery city.
- Buyer "My requests"; seller RFQ inbox (All / New / Replied / Closed).
- RFQ expiry job; email the seller on a new request.
- **Aim:** a buyer's request appears in the right sellers' inboxes.

### Day 10, Thu 19 Nov
- Stream Chat: a conversation per request and seller; messenger page for
  both sides (list, thread, text, photo); quote request card in the thread.
- **Aim:** buyer and seller chat in real time with the request card.

### Day 11, Fri 20 Nov
- Seller "Send quote": unit price, quantity, shipping, delivery time,
  valid until, note. Quotation card in chat; buyer sees all quotes for a
  request. Email the buyer on a new quote.
- **Aim:** a buyer receives a quotation in chat and by email.

## Week 3: orders (cash on delivery)

### Day 12, Sat 21 Nov: payment foundation (done 22 Nov)
- `order` module: buyer accepts a quotation (still valid, not withdrawn)
  → order with the amounts copied from the quote and a delivery address.
  Order state machine in one place.
- `payment` module: gateway interface + a fake provider for local and test
  runs; payments table; webhook endpoint (signature check, stored once,
  idempotent); unpaid-order expiry job. Kept for phase 2.
- `ledger` module: append-only entries.
- **Aim:** with the fake provider, a confirmed quote becomes a paid order,
  and a replayed or forged webhook changes nothing.

### Original Days 13-20 (22-29 Nov): replaced

Days 13-18 were not done by Sat 28 Nov. The developer moved the launch to
cash on delivery (28 Nov); the new days follow. The online payment work
(old Day 13 gateway, Day 15 refunds and payouts, the reconciliation job of
Day 16) moved to "Phase 2".

### Day 13, Sun 29 Nov: cash on delivery orders
- Orders get a payment method; `cash_on_delivery` orders start `placed`
  (no payment step, no 24 h payment deadline). Online pay stays off.
- Seller confirms or declines (with a reason) a placed order; the buyer
  may cancel before it ships (the quotation becomes valid again, as now).
- Buyer "Confirm order" says "Pay in cash on delivery"; the Orders pages
  show the cash flow. Emails: new order (seller), confirmed or declined
  (buyer).
- Tests: the abuse cases in "Cash on delivery rules".
- **Aim:** a buyer confirms a quote and the seller confirms the cash order.

### Day 14, Mon 30 Nov: fulfilment
- Seller: packed, shipped (courier and tracking optional), delivered and
  cash received; "buyer refused" at the door.
- Buyer: order timeline; "Confirm receipt"; "Report a problem" (alerts the
  admin, stops auto-complete).
- Auto-complete job (decision 9). Order emails.
- **Aim:** one order goes from photo to completed, paid in cash.
  **Checkpoint 2: the full loop works.**

### Day 15, Tue 1 Dec: commission and admin
- Ledger: commission "owed by seller" when an order completes; seller
  Finance page "Commission" (owed, settled, history) in place of Payouts.
- Admin: orders list and detail, problem reports, commission per seller,
  record a settlement (reference, audit log), suspend user, AI on/off.
- **Aim:** an admin can follow every order and what each seller owes.

### Day 16, Wed 2 Dec: legal and finish
- Terms, privacy, cancellation and cash on delivery policy, contact pages;
  404 and error pages.
- Phone-width check of every buyer and seller screen.
- **Aim:** every page a visitor can reach is finished.

## Week 4: launch

### Day 17, Thu 3 Dec: security pass
- Security review of order, commission and admin code; try to break each
  (wrong user, wrong side, tampered ids and amounts, replay, double
  submit, races).
- Permission tests across all modules; rate limits on AI, messaging,
  uploads and order endpoints.
- **Aim:** no known hole. **Checkpoint 3.**

### Day 18, Fri 4 Dec: production
- Production environment (separate from staging): Railway, Vercel (site
  and admin host), S3 bucket, keys. Domain, HTTPS, Resend domain verified.
- Backups on, restore tested, nightly off-site copy. Error monitoring and
  uptime alerts. Admin accounts with two-factor login.
- **Aim:** production is live but not yet public.

### Day 19, Sat 5 Dec: real run
- Every flow on production with two buyers, two sellers and an admin: a
  cash order completed, one cancelled, one refused, a problem report, the
  commission recorded and settled. Emails reach the inbox, not spam.
- Fix what breaks. Load the first sellers' products.
- **Aim:** no blocking bugs. **Launch gate.**

### Day 20, Sun 6 Dec
- Final fixes, first sellers onboarded.
- Open the site; watch errors, orders and AI cost through the day.
- **Aim:** the site is public.

## Phase 2: online payment (after launch, or earlier)

Starts when the gateway is approved (decisions 1-3). About 4 to 5 days:
1. Real gateway provider (sandbox, then live): hosted checkout, webhook,
   status lookup; the buyer chooses "Pay online" or "Cash on delivery".
   Emails: payment received, new paid order.
2. Refunds (cancel before shipping, admin refunds) through the gateway,
   with ledger rows for each.
3. Seller payouts: balance pending, available, paid out; admin records
   payouts (bank reference, audit log). No payout while a new bank proof
   waits for review (`hasPendingBankProofUpdate`, developer decision
   21 Nov 2026).
4. Daily reconciliation job (gateway vs ledger) with an alert.
5. Security pass of the payment code and a real small payment on
   production before switching it on.

## If behind

- Never cut: the cash on delivery rules, Days 17-19, abuse tests.
- First to go: AI mode on Add product (manual form stays), then photo
  messages in chat (text only), then courier and tracking fields.
- Online payment is never switched on half-done: phase 2 ships complete
  (payments, refunds, payouts, reconciliation) or not at all.

## In parallel, not code (developer)

- **Now:** decisions 6, 8, 9 and 10; apply to the chosen gateway for
  phase 2 and start the legal question (decision 2).
- Recruit 20 to 30 sellers; collect product data and photos.
- By Tue 1 Dec: terms, privacy and cancellation policy text written.
- By Fri 4 Dec: domain bought; sellers' products loaded into production.

## After launch

Online payment (phase 2), sellers directory and public pages, notification
bell, full dashboards, admin AI cost view and analytics, Arabic, Google
and Apple sign-in, saved items, mobile app.

## Figma Link

https://www.figma.com/design/jdy81y47N6nxZ0LtdOz9ml/Muhrak?node-id=41-2411&t=XcoCwsXp5cONXnPI-1
