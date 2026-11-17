# Store development plan

10 Nov 2026. This plan covers only the code for the online store: the shop, team orders and the 3D editor. Production, factory and logistics work is left out and comes after the store is ready. Relabelled from weeks to milestones on 11 Nov 2026; the tasks and "Done when" lines are unchanged. Changed on 17 Nov 2026 (founder): the organizer enters the whole team list in the editor; the player link is left out for now (M2, M3 and E4 below).

Inputs: plan.md and the founder decisions in critiques/DECISIONS.md.

## What we are building first

A store for **teams and clubs** in **Pakistan, the UK, the UAE and the US**, selling three products: **jersey, T-shirt and jacket**. Ordering works like this:

1. The organizer designs the kit and opens a team order.
2. The organizer enters the team list in the editor: each player's name, number and size. Players get no link and pay nothing.
3. The organizer signs off one roster proof showing every name, number and size.
4. The organizer pays a **50% deposit**, then **50% before shipping**.
5. We promise **delivery within 15 days of proof approval**, or 10 days with paid rush.

Single pieces can be bought **in Pakistan only**. Other markets have a minimum quantity.

## Milestones

Work is planned by milestone, not by week (founder's choice, 11 Nov 2026). A milestone is finished when its "Done when" line is met, whatever the date. The work stops at the end of each milestone for a summary to the founder, and the next one starts on the founder's yes.

| Milestone | What |
| --- | --- |
| M0 | Setup |
| M1 | Basic store |
| M2 | Team orders, backend |
| M3 | Team orders, storefront and payments |
| E1 to E5 | The 3D editor, in five steps |
| M4 | Integration and hardening |

- **Order:** M0, M1, M2, M3, then M4.
- **The editor steps** run alongside M1 to M3, in order from E1 to E5. M4 starts when both M3 and E5 are done.
- **Older names:** M0 to M3 were called Sprint 0 to Sprint 3. Task numbers such as S0-12, and notes written before 11 Nov 2026, keep those names.

## Team

| Code | Role (from plan.md) | Owns |
| --- | --- | --- |
| BE | Full-stack developer, leaning backend | Medusa backend, custom modules, payments, admin |
| FE | Full-stack developer, leaning frontend | Next.js storefront, team-order pages, checkout |
| 3D | Frontend 3D developer (Three.js) | Design editor, proof renders |
| PL | Product lead | Scope, acceptance testing, placeholder data |

## Placeholders, so nothing blocks the developers

| Real input | Placeholder until it arrives | Owner of the real input |
| --- | --- | --- |
| 3D models and pattern pieces for the 3 products | A sample 3D model (GLB file) of a jersey, with a simple UV layout | 3D garment artist and pattern maker |
| Payment gateway (Stripe or PayPal via the UAE company; JazzCash and Easypaisa in Pakistan) | Medusa's manual payment provider, or Stripe in test mode | Founders |
| Duty-paid prices per market | A sample price table in PKR, GBP, AED and USD | Founders, after the real quotes |
| Templates, fonts and clipart | 5 sample templates and 3 free fonts | Graphic designer |
| Tax rates per market | Fill in from the accountant's figures. Until then, mark every price "tax not final" | Founders and accountant |

**Rule:** every placeholder must be stored as data (a seed file or admin setting), never hard-coded, so the real version can be dropped in without code changes.

## M0 Setup (was Sprint 0). Owner: BE, with FE helping

- [ ] Monorepo with three parts:

  | Folder | Contents |
  | --- | --- |
  | `backend/` | Medusa v2 |
  | `storefront/` | Next.js, starting from the official Medusa Next.js starter |
  | `packages/editor/` | The 3D editor, as its own package so it can be developed in isolation |
- [ ] `docker-compose.yml` that runs PostgreSQL and Redis. Add MinIO as local S3-compatible file storage for uploads and proof images.
- [ ] Seed script that creates:
  - **4 regions with currencies:** Pakistan in PKR, UK in GBP, UAE in AED, US in USD.
  - **3 products, each with size variants:** a jersey, a T-shirt and a jacket. Sizes run youth to 3XL; the real list comes from the size charts.
  - **Extra products:** a fit kit and a rush add-on.
  - **A sample price list for each region.**
- [ ] Continuous integration (CI) that runs lint, type-checking and tests on every push.
- [ ] Settle three choices in M0:
  - **Email provider**, used for team-link invites, reminders and proof emails.
  - **Hosting target.**
  - **PDF library**, used for the roster proof.

**Done when:** a new developer can run `docker compose up` plus one command, and see the storefront with the 3 products in all 4 regions.

## M1 Basic store (was Sprint 1). FE leads, BE supports

- [ ] **Region selection.** The region is detected from the visitor's country and can be switched by hand. Prices show in the local currency.
- [ ] **Product pages** with the size chart. Show it as a garment-measurement table stored on the product, not a body chart.
- [ ] **Cart and checkout** using the placeholder payment.
- [ ] **Minimum quantity per region.** Pakistan's minimum is 1. The UK, UAE and US use a placeholder of 10. Store the rule in region settings, and enforce it in a cart validation step on the backend, not only in the UI.
- [ ] **Cash on delivery in Pakistan only**, and only below a total limit stored in admin settings.
- [ ] **Delivery promise at checkout:** "Delivered by [date]", worked out as proof approval + 15 days, or + 10 with rush. Use a simple rule now. A real capacity calendar comes later.
- [ ] **Duty-paid shipping options for export regions.** The price includes duties, shown as one line, "Shipping & duties included".
- [ ] **Customer accounts:** sign-up, login and order history.

**Done when:**
- A Pakistan customer can buy 1 T-shirt with cash on delivery.
- A UK customer is blocked below the minimum and can check out at 10 or more.

## M2 Team orders backend (was Sprint 2). BE leads

Build a custom Medusa module, `team-order`, with three models:

| Model | Fields |
| --- | --- |
| TeamOrder | organizer (customer), team name, design version, product and colorway, region, need-by date, status, which fields the design prints (name, number) |
| RosterEntry | team order, player name, number, size, product, position in the list, count (1 to 10 of this shirt), no name on this shirt, no number on this shirt, locked |
| ProofApproval | team order, design version, roster snapshot (stored copy plus hash), signed by, signed at, IP address |

**Status flow:** `draft → proof_sent → approved → deposit_paid → in_production → balance_due → shipped`. The team list is edited in `draft`; there is no open or closed step, because no players enter anything. Production is handled outside the store for now. Admin sets `in_production` and `shipped` by hand.

Tasks:
- [ ] **Need-by date.** Work out the latest proof-approval date backwards from the need-by date, using the 15-day promise. Reject or warn when the need-by date can't be met, and offer rush.
- [ ] **Team list entered by the organizer.** Only the signed-in organizer can read or change the list: add, edit, remove and reorder lines, saved as they go. There is no public link and no player login (founder, 17 Nov 2026; a player link may come later).
- [ ] **Roster checks on the server:**
  - No duplicate numbers.
  - No blank required fields.
  - Allowed characters and a maximum length per field. The length limit comes from the editor's font metrics; use a fixed number until then.
  - A pasted list or a CSV upload from the organizer goes through the same checks.
- [ ] **Lock edits** at proof approval. Any change after that creates a new proof version.
- [ ] **Late joiners.** The organizer can add a player after the proof is signed. The number is checked against numbers already used, and the addition becomes a linked add-on order.
- [ ] **Reorders.** The organizer reorders from a past team order with the same design version. They choose players, sizes and quantities.
- [ ] **Admin extension:** a team orders list and detail page, with buttons to change status and view the roster and proof.
- [ ] **Emails, all to the organizer:** reminder 3 days and 1 day before the latest date to sign the proof, proof ready, payment due.

**Done when:** a test team of 20 can go from a new team order, to a full team list, to a signed proof, using API tests only.

## M3 Team orders storefront and payments (was Sprint 3). FE leads; BE owns payments

- [ ] **Team list in the editor.** The organizer adds each player's name, number and size in one list, by typing or by pasting a list. Mobile first. Choosing a line shows that player's name and number on the design (editor step E4), and a failed check shows beside its line as they type. The storefront saves the list to the team order.
- [ ] **Organizer's team-order page.** Shows the order's state: how many lines are complete, which lines have no size or a failed check, and the latest date to sign the proof for the need-by date, with a button back into the editor.
- [ ] **Roster proof page and PDF.** One page with every player's name as printed, number, size and garment measurement, plus front and back thumbnails. The organizer signs by typing their name and ticking a box, and the time is stored.
- [ ] **Deposit and balance (spike first, about 2 days).** Confirm how Medusa v2 can take two payments on one order: either two payment collections, or an order with an outstanding amount.
  - If neither works cleanly, use the fallback: one draft order with a payment link for the deposit, and a second payment link for the balance.
  - Record the outcome in `docs/decisions/`.
- [ ] **Balance-due email** with a payment link. Admin can't mark the order shipped until the balance is paid.
- [ ] **Fit kit as a refundable deposit.** It is a product. Admin has a "kit returned → refund" action.
- [ ] **Free design-help request form** for teams. It feeds a design-request queue in admin with these statuses: new, in progress, proof sent, done.

**Done when:** a PL test team goes through the whole flow in the browser on a phone:
1. create
2. the organizer enters 20 players in the editor
3. proof signed
4. deposit
5. balance
6. marked shipped

## 3D editor track: steps E1 to E5, alongside M1 to M3. 3D leads

Stack: React with Three.js (react-three-fiber), in `packages/editor`. The storefront embeds it on the product page and the team-order page.

**Most important rule: the design is saved as data, not as an image.**
- A design JSON holds the product, colour zones, layers (text, numbers, logos and clipart, with position, size and rotation in pattern-piece coordinates), fonts and a palette reference.
- Renders and proofs are generated from the JSON.
- Production files are generated from the same JSON later, so it must keep vector data and never flatten it.

| Step | Deliverable |
| --- | --- |
| E1 | Load the GLB model and orbit the camera. Map 2D SVG pattern panels to the 3D model as textures. Change colour per zone. |
| E2 | Text, numbers and logo upload. Upload checks: file type, resolution, transparency, and a warning below a minimum DPI. Undo and redo. |
| E3 | **Palette:** customers pick print-tested colours. A custom HEX value snaps to the nearest palette colour, with a visible warning that shows both colours. **Templates:** load a template and change its text and colours. Built in two parts to the interface specification, docs/design/06-editor.md (decision 009): **E3a** the new interface, templates, team colours and the palette; **E3b** handles on the model, logos, free text and the Done panel. |
| E4 | Team list and roster preview: the organizer enters each player's name, number and size in a list inside the editor, and switches the 3D view between players, showing each name and number. The editor hands the list to its host, which saves it. Font metrics give a real maximum length per field, which the roster checks then use. |
| E5 | Proof renders: front, back and side PNGs from the JSON, uploaded to storage and attached to the proof. Measure performance on a mid-range Android phone. |

- [ ] Save the design JSON through a backend `design` module with versions. Every save creates a new version, and proofs refer to a version.
- [ ] Share link for a design, read-only.

**Done when:**
- A coach builds a team design from a template and previews 3 players without help, in a user test.
- The proof PNG matches the 3D view.

## M4 Integration and hardening, after M3 and E5 (all developers)

- [ ] Replace placeholders as the real inputs arrive: the real 3D models, the real gateway(s), the real prices and the real templates.
- [ ] Payment providers:
  - Stripe or PayPal under the UAE company, once approved.
  - JazzCash and Easypaisa for Pakistan. Check for existing Medusa plugins first; otherwise write custom payment providers.
- [ ] Load and security pass: rate-limit the public read-only design link, and run a malware scan on file uploads.
- [ ] Analytics events: design started, team order started, team list completed, proof signed, deposit paid.

## Not in this plan (comes after the store is ready)

- Sending orders to factories: job files, nesting, cut lists, quality-check scans.
- Live order status fed by factory stages, and WhatsApp updates.
- The claims and remake flow behind the 7-day guarantee. Until then admin handles claims by hand.
- Company accounts, AI design assist, storefronts for creators and brands, fundraising.

## Inputs the developers need from others, and for which milestone

| Needed at the start of | What | From |
| --- | --- | --- |
| M1 | Size list and garment-measurement chart per product, even if draft | Pattern maker |
| E1 | One real jersey GLB model with UV-mapped pattern panels | 3D artist and pattern maker |
| M2 | Sample prices per region and the minimum quantity for export | Founders |
| M3 | Gateway status for the UAE company: approved, pending or refused | Founders |
| E3 | Print-tested colour palette (HEX values) and 10 templates | Graphic designer |
| E5 | T-shirt and jacket GLB models | 3D artist |

Until an input arrives, work goes on with the placeholder listed above, and the milestone is not held up.
