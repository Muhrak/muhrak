# 20-day build plan

Start: Tue 10 Nov 2026. Public launch: Sun 29 Nov 2026. Calendar days.

Goal: an MVP to test the market. **Limited features, every one of them
working properly.** Web only, no mobile app. One seller type
(manufacturers, distributors and suppliers are all "seller").

**Payment happens inside the platform (strict, set by the developer on
13 Nov 2026).** The buyer pays Muhrak through a payment gateway; the order
is live only when the gateway confirms the payment; Muhrak pays the seller
out after delivery. The gateway is not chosen yet (see "Decisions needed").

Rule for every day: finish by deploying to staging and checking the aim
there. If a day runs late, a feature moves to "After launch"; it is never
shipped half-done.

## The MVP loop

> Seller signs up → gets verified → adds products → buyer uploads a photo →
> AI identifies the part → matched sellers get a quote request → they chat →
> seller sends a quote → buyer confirms → **buyer pays on Muhrak** → order is
> created → seller ships → buyer confirms delivery → **Muhrak pays the seller**

## MVP scope

**In the MVP**
1. Buyer and seller accounts, password reset (done)
2. Seller verification and admin approval (done)
3. Products: add, edit, publish; manual and AI mode
4. Buyer photo search with editable AI results; plain text search
5. Seller matching, quote request, seller RFQ inbox
6. Messenger with quote request and quotation cards
7. Send quote; buyer confirms and **pays online**
8. Orders: status, tracking, buyer confirms delivery
9. Refunds and cancellations; seller payouts after delivery
10. Emails for request, quote, payment, order and payout events
11. Admin: seller approval (done), orders and payments, refunds, payouts,
    suspend user, AI switch
12. Landing pages (done); terms, privacy, refund policy, contact
13. Production: domain, backups, monitoring, rate limits, live gateway

**After launch** (moved out to make room for payment)
- Sellers directory, public seller and product pages
- In-app notification bell and notification settings (email covers launch)
- Full dashboards with counts and charts (simple counts at launch)
- Admin AI cost dashboard, detailed usage analytics
- Arabic, Google and Apple sign-in, saved items and history
- Mobile app

## Payment rules (strict)

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

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| 1 | **Payment gateway.** Must support the GCC countries we sell in, OMR (3 decimals), hosted checkout, webhooks, refunds; ideally marketplace payouts. Candidates: Tap Payments, Checkout.com, PayTabs, Thawani (Oman), Stripe (only with a UAE company). | **Tue 17 Nov** (apply now; merchant approval can take 1-2 weeks) | Choose by country of the company and OMR support; ask each for marketplace terms |
| 2 | **Legal: may Muhrak hold buyers' money until delivery?** Holding funds for others can need a licence; some gateways offer a marketplace/escrow product that covers it. | Tue 17 Nov | Ask the gateway and a local lawyer |
| 3 | **Payout method**: Muhrak pays sellers by bank transfer (admin records it), or the gateway splits the payment automatically. | Tue 17 Nov | Bank transfer recorded by admin for the MVP, if decision 2 allows it |
| 4 | **Commission** (percent per order) and who pays the gateway fee. | Sun 22 Nov | |
| 5 | **Hold period** after delivery before payout, and **auto-confirm** delivery after N days if the buyer does nothing. | Sun 22 Nov | 3-day hold; auto-confirm 7 days after "shipped" |
| 6 | **Cancellation and refund policy** (who can cancel, until when). | Tue 24 Nov | Buyer cancels free before "shipped"; after that only through a problem report |
| 7 | **VAT on commission** and invoices. | Before launch | Ask an accountant |

**Launch gate:** the site does not open to the public until the live
gateway works end to end on production (Day 19). If the gateway is not
approved in time, launch moves; payment is not skipped.

## Done

- **Day 1, Tue 10 Nov:** accounts, sign-up and login.
- **Day 2, Wed 11 Nov:** sessions, password reset, dashboards shells, staging.
- **Day 3, Thu 12 Nov:** uploads, seller company profile, verification.
- **Day 4, Thu 12 Nov (a day early):** admin console, seller review, audit log.
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
- **Gateway decision due (decisions 1-3).**
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

## Week 3: payment, orders, payouts

### Day 12, Sat 21 Nov: payment foundation
- `order` module: buyer accepts a quotation (still valid, not withdrawn)
  → order in `awaiting_payment` with the amounts copied from the quote and
  a delivery address. Order state machine in one place.
- `payment` module: gateway interface + a fake provider for local and test
  runs; payments table; webhook endpoint (signature check, stored once,
  idempotent); unpaid-order expiry job.
- `ledger` module: append-only entries; charge, fee and seller-credit
  rows written in one transaction when a payment succeeds.
- Tests: every payment abuse case listed above.
- **Aim:** with the fake provider, a confirmed quote becomes a paid order,
  and a replayed or forged webhook changes nothing.

### Day 13, Sun 22 Nov: real gateway (sandbox)
- Gateway provider implementation (sandbox keys): hosted checkout,
  webhook, status lookup. OMR/KWD/BHD 3-decimal amounts mapped exactly.
- Buyer "Pay" page, "checking payment" return page, success and failure
  screens; retry payment on failure.
- Emails: payment received (buyer), new paid order (seller).
- **Aim:** a buyer pays a quote with a sandbox card and the seller sees
  the paid order.

### Day 14, Mon 23 Nov: fulfilment
- Seller orders list and detail: packed, shipped (tracking number).
- Buyer orders list with timeline; "Confirm delivery"; "Report a problem"
  (holds the payout and alerts the admin).
- Auto-confirm delivery job. Order emails.
- **Aim:** one order goes from photo to delivered, paid online.
  **Checkpoint 2: the full loop works.**

### Day 15, Tue 24 Nov: refunds and payouts
- Cancel before shipping → full refund through the gateway; admin refund
  (full or partial) for problem reports. Ledger rows for every refund.
- Seller "Payouts" page: balance pending, available, paid out, history.
- Admin payouts: list of sellers with available balance, record a payout
  (bank reference), audit log. (Or gateway split, per decision 3.)
- **Aim:** a refund and a payout both reconcile to zero in the ledger.

### Day 16, Wed 25 Nov: admin and legal
- Admin: orders and payments list and detail, problem reports, refunds,
  payouts, suspend user, AI on/off switch.
- Daily reconciliation job (gateway vs ledger) with an alert.
- Terms, privacy, refund policy and contact pages; 404 and error pages.
- **Aim:** an admin can follow every order and every rial.

## Week 4: launch

### Day 17, Thu 26 Nov: security pass
- Security review of payment, order, ledger and payout code; try to break
  each (wrong user, wrong side, tampered ids and amounts, replay, double
  submit, races).
- Permission tests across all modules; rate limits on AI, messaging,
  uploads, payment endpoints.
- Phone-width check of every buyer and seller screen.
- **Aim:** no known hole. **Checkpoint 3.**

### Day 18, Fri 27 Nov: production
- Production environment (separate from staging): Railway, Vercel web and
  admin, S3 bucket, Redis, keys. Domain, HTTPS, Resend domain verified.
- Live gateway keys and production webhook. Backups on, restore tested,
  nightly off-site copy. Error monitoring and uptime alerts.
- **Aim:** production is live but not yet public.

### Day 19, Sat 28 Nov: real run
- Every flow on production with two buyers, two sellers and an admin:
  a real small payment, a refund, a payout. Check the ledger and the
  gateway dashboard agree. Emails reach the inbox, not spam.
- Fix what breaks. Load the first sellers' products.
- **Aim:** no blocking bugs. **Launch gate.**

### Day 20, Sun 29 Nov
- Final fixes, admin accounts created, first sellers onboarded.
- Open the site; watch errors, payments and AI cost through the day.
- **Aim:** the site is public.

## If behind

- Never cut: payment rules, Days 17-19, abuse tests.
- First to go: AI mode on Add product (manual form stays), then photo
  messages in chat (text only), then partial refunds (full refunds stay).
- If the gateway is late: build and test everything on the fake provider
  and sandbox; launch waits for the live gateway.

## In parallel, not code (developer)

- **Now:** apply to the chosen gateway(s); start the legal question
  (decision 2).
- From Day 1: recruit 20 to 30 sellers; collect product data and photos
  and their bank details for payouts (through verification).
- Week 2: gather real part photos for AI testing.
- By Day 15: terms, privacy and refund policy text written.
- By Day 18: domain bought; sellers' products loaded into production.

## After launch

Sellers directory and public pages, notification bell, full dashboards,
admin AI cost view and analytics, Arabic, Google and Apple sign-in, saved
items, mobile app, automated payouts (if not at launch).

## Figma Link

https://www.figma.com/design/jdy81y47N6nxZ0LtdOz9ml/Muhrak?node-id=41-2411&t=XcoCwsXp5cONXnPI-1
