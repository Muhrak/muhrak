# 20-day build plan

Start: Tue 10 Nov 2026. Public launch: Sun 29 Nov 2026. Calendar days.

Goal: a working website to test the market. Web only, no mobile app, no online
payment. One seller type (manufacturers, distributors and suppliers are all
"seller").

Rule for every day: finish by deploying to staging and checking the aim there.

## Priorities

**P0: must have**
1. Sign-up and login for buyer and seller
2. Seller verification and admin approval
3. Add product, manual and AI mode
4. Buyer photo search with editable AI results
5. Seller matching and quote request
6. Messenger with quote request and quotation cards
7. RFQ inbox and send quote
8. Confirm order and order status (payment outside the platform)
9. Email for new RFQ and new quote
10. Production deploy, rate limits, error monitoring

**P1: should have**
- Sellers directory, seller profile and product pages
- Buyer and seller dashboards
- Landing pages for buyers and sellers
- Password reset
- Terms, privacy and contact pages
- Admin lists for users, RFQs and orders; AI on/off and cost view
- Usage tracking

**P2: cut first if behind**
- Arabic translation (keep the structure, ship English)
- Light theme
- Saved items and history
- Buyer payments page, seller company-profile extras
- Google and Apple sign-in

## Week 1: accounts, sellers, products

### Day 1, Tue 10 Nov
- Install and run the scaffold: database up, migration applied, auth endpoints tested.
- Create the Next.js web app and put the repo on GitHub.
- Build the sign-up page (buyer or seller choice) and the login page, connected to the API.
- **Aim:** a user can sign up and log in with email and password.

### Day 2, Wed 11 Nov
- Session handling on the web: store tokens, auto-refresh, logout, routes protected by role.
- Password reset by email (sets up the email provider).
- Buyer and seller page shells with sidebars from Figma; colours and fonts as design tokens.
- Deploy API, web and database to staging.
- **Aim:** on the staging URL, a buyer and a seller each log in and land on their own empty dashboard.

### Day 3, Thu 12 Nov
- File upload module (direct to storage).
- Seller company profile: name, country, city, description, logo.
- Verification: upload commercial registration, VAT certificate, owner ID and bank proof; status is pending, approved or rejected.
- **Aim:** a seller completes the profile and submits documents for review.

### Day 4, Fri 13 Nov
- Create the admin app with admin login (first admin created by a script).
- Sellers list and verification queue; approve, or reject with a reason.
- Email the seller the decision; record the admin action in an audit log.
- **Aim:** an admin approves a seller and the seller sees "Verified".

### Day 5, Sat 14 Nov
- Categories table with starting data.
- Products: name, part number, category, condition, price or "price on request", stock, description, photos, status.
- Add product form (manual), product list, edit and delete. Only verified sellers can publish.
- **Aim:** a verified seller publishes a product with photos.

### Day 6, Sun 15 Nov
- AI module: queue job, vision model behind an interface, fixed output fields with a confidence level each.
- Safety: image checks, per-user daily limit, monthly budget cap, on/off switch, every job logged.
- Run it on real part photos and adjust the prompt.
- **Aim:** sending a photo to the API returns the part's name, category, part number and fitment.

### Day 7, Mon 16 Nov
- AI mode on Add product: toggle, upload a photo, fields fill in, seller edits, publish.
- Loading state, and fallback to the manual form if AI fails.
- Save what the seller corrected.
- **Aim:** a seller adds a product from one photo. **Checkpoint 1.**

## Week 2: the buyer loop

### Day 8, Tue 17 Nov
- Buyer photo upload page with drag and drop.
- Result page: part name, confidence, category, part number, fits; all editable.
- **Aim:** a buyer uploads a photo and sees the identified part.

### Day 9, Wed 18 Nov
- Match the identified part to products by part number, category and text.
- Results list with seller, price, stock and a match label (exact, high, alternative).
- A plain text search box as the non-AI route.
- **Aim:** results show real sellers' products for the uploaded part.

### Day 10, Thu 19 Nov
- Quote request: review and edit details, quantity, needed-by date, delivery city.
- Buyer's "My requests" list.
- Seller RFQ inbox with list, detail and All / New / Replied / Closed tabs.
- Email the seller on a new request.
- **Aim:** a buyer's request appears in the right sellers' inboxes.

### Day 11, Fri 20 Nov
- Stream setup; a conversation is created between buyer and seller for each request.
- Messenger page for both sides: conversation list, thread, text and photo.
- Quote request card shown in the chat.
- **Aim:** buyer and seller chat in real time, with the request card in the thread.

### Day 12, Sat 21 Nov
- Seller "Send quote": unit price, quantity, shipping cost, delivery time, valid until, note.
- Quotation card in chat; buyer's view of all quotes for a request, sorted by price.
- Seller's quotations list; email the buyer on a new quote.
- **Aim:** a buyer receives a quotation in chat and by email.

### Day 13, Sun 22 Nov
- Buyer "Confirm order" on a quotation, with delivery address.
- Order statuses: confirmed, packed, shipped, delivered, cancelled, with the allowed moves enforced in one place.
- Seller orders list: update status, add tracking number, mark as paid.
- Buyer orders list with timeline and "Confirm delivery".
- **Aim:** one order goes from photo to delivered. **Checkpoint 2: the full loop works.**

### Day 14, Mon 23 Nov
- Finish notifications: events, queue, email templates for request, quote, order and status changes.
- In-app notification bell and the user's notification settings.
- Buyer and seller dashboards with counts and recent items.
- **Aim:** every key event sends an email and shows in the bell.

## Week 3: public site, admin, launch

### Day 15, Tue 24 Nov
- Sellers directory with search, category filter and pagination.
- Seller profile page with product catalogue; product detail page with "Request quote".
- **Aim:** a visitor browses sellers and products without logging in.

### Day 16, Wed 25 Nov
- Buyer and seller landing pages from Figma; header and footer with "Sellers".
- Terms, privacy and contact pages; 404 and error pages.
- Check public pages and the buyer flow on a phone screen.
- **Aim:** the public site is complete.

### Day 17, Thu 26 Nov
- Admin: users list with suspend, product moderation, read-only RFQ and order lists.
- Admin AI page: jobs, success rate, cost, on/off switches.
- Usage tracking for searches, requests, quotes and orders.
- **Aim:** an admin sees all activity and can switch AI off. **Checkpoint 3.**

### Day 18, Fri 27 Nov
- Rate limits on login, sign-up, AI and messages.
- Permission tests: no user can read another user's requests, quotes or orders.
- Error monitoring, database backups, production environment, domain and email DNS.
- **Aim:** production is live but not yet public.

### Day 19, Sat 28 Nov
- Run every flow on production with two buyers, two sellers and an admin, using real photos.
- Fix what breaks. Check that emails reach the inbox, not spam.
- Load the first sellers' products.
- **Aim:** no blocking bugs.

### Day 20, Sun 29 Nov
- Final fixes, admin accounts created, first sellers onboarded.
- Open the site and watch errors and AI cost through the day.
- **Aim:** the site is public.

## If behind

- Miss Checkpoint 1 (Day 7): drop password reset polish, the light theme and Arabic translation.
- Miss Checkpoint 2 (Day 13): drop the in-app bell and dashboards from Day 14; keep email only.
- Miss Checkpoint 3 (Day 17): drop the admin lists and usage tracking; keep seller approval and the AI switch.
- Never cut Days 18 and 19.

## In parallel, not code

- From Day 1: recruit 20 to 30 sellers and collect their product data and photos.
- Week 1: gather real part photos for AI testing; apply for the payment gateway account.
- By Day 15: terms and privacy text written.
- By Day 18: sellers' products loaded into production.

## After launch

Online payment with holds and payouts (modules `payment`, `ledger`, `payout`,
`dispute`), buyer mobile app, Arabic, light theme, and the deferred Seller
Centre and Admin screens.
