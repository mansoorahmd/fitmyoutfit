# FitMyOutfit

Custom apparel store where teams and clubs design jerseys, T-shirts and jackets in 3D and order them. Medusa v2 backend, Next.js storefront, and a 3D editor package. Project context is in [CLAUDE.md](CLAUDE.md), the plan in [dev-plan.md](dev-plan.md).

| Folder | Contents |
| --- | --- |
| `backend/` | Medusa v2 (`@fitmyoutfit/backend`) |
| `storefront/` | Next.js storefront (`@fitmyoutfit/storefront`) |
| `packages/editor/` | 3D editor (`@fitmyoutfit/editor`) |
| `scripts/` | Root setup and dev scripts (plain Node, work on Windows and Linux) |

## Prerequisites

- Node 22 or newer and npm 10 or newer (`engines` says `>=22`; we develop and run CI on Node 22, and `npm run test:scripts` needs Node 21 or newer)
- Docker with Compose v2 (Docker Desktop on Windows and macOS)
- Free host ports: 9000 (backend), 8000 (storefront), 5433 (PostgreSQL), 6379 (Redis), 9100 and 9101 (MinIO)

## Quick start

```
docker compose up -d     # PostgreSQL, Redis, MinIO. Wait until `docker compose ps` shows them healthy
npm install
npm run setup            # safe to run again
npm run dev              # backend on :9000, storefront on :8000 (see Ports to change them)
```

`npm run quickstart` runs `setup` and then `dev`.

`npm run setup` does this, and skips whatever is already done:

1. Creates `.env`, `backend/.env` and `storefront/.env.local` from the `.env.example` files, if missing. It never overwrites an existing file.
2. Runs the database migrations.
3. Seeds the placeholder store data and the local admin user (see below). The seed only creates what is missing and does not change a value that is set, but a re-run does put back some things that were deleted: see "What a re-run puts back" below.
4. Writes the publishable API key into `storefront/.env.local` (only that one line; if `storefront/` does not exist yet it warns and skips).

## Ports

| Service | Host port | Notes |
| --- | --- | --- |
| Medusa backend and API | 9000 | Admin at <http://localhost:9000/app> |
| Storefront | 8000 | |
| PostgreSQL | 5433 | Not 5432, so it does not clash with a PostgreSQL already on your machine |
| Redis | 6379 | |
| MinIO S3 API | 9100 | Bucket `fitmyoutfit-dev`, created automatically |
| MinIO console | 9101 | <http://localhost:9101>, login `minioadmin` / `minioadmin` |

To change a host port, set it in the root `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`), update the matching URL in `backend/.env` (`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_FILE_URL`), then run `docker compose up -d` again.

To move the backend or the storefront:

| Variable | Default | Port of | Where to set it |
| --- | --- | --- | --- |
| `PORT` | 9000 | Backend, API and admin | In the shell, or in `backend/.env` (a value in the shell wins) |
| `STOREFRONT_PORT` | 8000 | Storefront | In the shell (not read from any `.env` file) |

`PORT` in `backend/.env` counts for every way of starting the backend, not only `npm run dev`: Medusa's CLI loads `backend/.env` before it reads `PORT`, so a plain `medusa develop` or `medusa start` in `backend/` follows it too. `STOREFRONT_PORT` is read by the storefront's own `npm run dev` and `npm run start` (`storefront/scripts/next-with-port.mjs`), from the environment only.

`npm run dev` hands each part its port (the storefront gets `STOREFRONT_PORT` and not `PORT`) and prints both URLs; `npm run setup` prints the admin URL with the backend's port. The two parts find each other through settings that do **not** follow these variables, so when you change either port, change these to match:

- `storefront/.env.local`: `MEDUSA_BACKEND_URL` (the backend's URL) and `NEXT_PUBLIC_BASE_URL` (the storefront's).
- `backend/.env`: `STORE_CORS` (the storefront's URL), `ADMIN_CORS` (the backend's) and `AUTH_CORS` (both).

Then restart `npm run dev`.

## Local admin login (dev only)

<http://localhost:9000/app> (or the port in `PORT`) with the email and password from `backend/.env`. The defaults are:

- Email: `admin@fitmyoutfit.local`
- Password: `dev-admin-password`

These are throwaway development values. Never use them anywhere else.

## What the seed creates

All of it is placeholder data, kept in `backend/src/scripts/seed-data/` (one file per kind, each marked `placeholder: true` with a note on what the real input is). Replace the data, not the code.

- 4 regions: Pakistan (PKR), United Kingdom (GBP), United Arab Emirates (AED), United States (USD). Region metadata `tax_final: false` is the data behind the "tax not final" label, and `min_garment_quantity` is the minimum order (Pakistan 1, the other three 10; see "Checkout rules" below).
- Payment providers per region (`payment_providers` in `regions.ts`): Medusa's placeholder `pp_system_default` in all four, and cash on delivery `pp_cod_cod` in Pakistan only.
- Store currencies: those four, PKR as default. A currency added in the admin is kept on a re-run; only Medusa's starter currency `eur` is removed, and only while no region uses it.
- Products: `jersey`, `t-shirt`, `jacket` (11 size variants each, in the `garments` collection), plus `fit-kit` and `rush-add-on` (one variant each, no collection). Each has `metadata.kind` (`garment`, `fit_kit`, `rush_add_on`). A product added in the admin needs no kind: without one it counts as a garment toward the minimum (see "Checkout rules"). Inventory is not managed (made to order).
- Placeholder product images, as web URLs in `products.ts` (`images.urls`, marked `placeholder: true`): stand-in photos from spized.com for the jersey, T-shirt, jacket and fit kit, and a Medusa demo photo for the rush add-on. The seed sets the first URL as the thumbnail and all of them as the product's images, only when the product has no thumbnail and no images, so a photo set in the admin is never replaced. Nothing is downloaded or uploaded, and no image file is kept in the repo. **These photos belong to another store: local development only.** They must be replaced by our own product photos before anything is deployed where the public can see it. To change a picture, edit the URL in `products.ts` (on an existing database, remove the product's images in the admin first, or reset the database).
- Sample prices in all four currencies for `jersey`, `t-shirt`, `jacket` and `fit-kit`. Amounts are in major units (3500 means Rs 3,500), as Medusa v2 stores them. Which products have fixed prices is data too (`has_fixed_prices` in `products.ts`).
- Rush: `rush-add-on` has **no fixed prices**: the server prices its cart line as a percentage of the garments (see "Rush" under "Checkout rules"), held in the store setting `rush_percentage` (placeholder `20`, in `seed-data/settings.ts`; `0` switches rush off). The seed writes it into the Store's metadata only when it is missing, so after the first run the value lives in the database: change it in the admin under **Settings > Store > Metadata**. Code reads it with `readRushPercentage` (`backend/src/lib/settings/rush-percentage.ts`). Its one variant has a **placeholder price of 0** in each store currency, because Medusa puts a variant in a cart (and keeps it when the cart moves to another region) only when it has a price in the cart's currency; the 0 is never charged, the server sets the line's price in the same step. The product is in no collection, so the storefront's garment listings never show it.
- Store settings for checkout, in the Store's metadata like `rush_percentage`: `cod_max_total` 20000, `delivery_days_standard` 15, `delivery_days_rush` 10 (see "Checkout rules" below).
- Size charts: a draft garment-measurement chart (the garment laid flat, in cm, all eleven sizes) in `metadata.size_chart` of the jersey, T-shirt, jacket and fit kit (`seed-data/size-charts.ts`, marked `draft: true`; the fit kit carries the jersey's chart). Written only on a product that has none, so a chart edited in the admin is kept.
- Shipping (`seed-data/shipping.ts`): one stock location, "Lahore hub", linked to Medusa's manual fulfillment provider and the default sales channel; one shipping fulfillment set on it with a service zone per region (the region's countries); and one shipping option per zone: "Delivery in Pakistan" PKR 250, and "Shipping & duties included" at 0 with `data.ddp: true` in the UK, UAE and US (the one duty-paid line). Amounts are in major units. An option renamed or re-priced in the admin is kept.
- The default sales channel and a publishable API key linked to it.
- The local admin user (only when `NODE_ENV` is unset, `development` or `test`).
- The store's name, `FitMyOutfit` (only while the store still has Medusa's default name, so a name set in the admin is kept).
- Minimum extras Medusa needs: the default shipping profile (created by Medusa's own migration). No tax regions yet.

The products are listed in the order of `products.ts` (jersey, t-shirt, jacket, fit-kit, rush-add-on) when no other order is asked for. Regions are recognised by their country code, so you can rename them in the admin.

**An interrupted seed is repaired by the next run.** Medusa writes a product, its variants, prices, size order and links in separate steps, so a seed stopped half-way can leave a product without prices or with sizes out of order, or an admin user without a login. Each run checks those parts on their own and fills in what is missing. It does not change a value that is set (an edited price, name, metadata value or photo stays as it is). The run's last log line lists everything it repaired. What it cannot repair safely (for example a size value that another variant already has) it leaves alone and names in a warning. The rush add-on gets its placeholder price of 0 in each store currency it has no price in (a store seeded before 12 Nov has none, and its next `npm run setup` adds them once, listed as `rush-add-on: prices`); a price set in the admin is kept.

**What a re-run puts back.** "Missing" includes things an admin deleted on purpose. A re-run of `npm run setup` (or `npm run seed --prefix backend`) puts back:

- a price in one of the four seed currencies that was deleted from a seed variant (its other prices are left as they are);
- a seed variant's lost size value, and the size order when it is incomplete;
- the four seed currencies (PKR, GBP, AED, USD) in the store, with PKR as the only default;
- and it removes Medusa's starter currency `eur` from the store, while no region uses it.

It also re-creates a deleted seed product (by handle), seed region (by country code), the `garments` collection, the default sales channel, a deleted store setting (`rush_percentage`, `cod_max_total`, `delivery_days_standard`, `delivery_days_rush`), a deleted region metadata key (`tax_final`, `min_garment_quantity`), a seed payment provider removed from its region (for example cash on delivery from Pakistan; a provider an admin added is kept), the size chart of a product that has none, the stock location (when there is none at all), its links to the manual fulfillment provider and the default sales channel, the shipping fulfillment set, a region's service zone (matched by country) and a zone's shipping option (when the zone has none), the placeholder photos of a product that has no photo left, and, in development, the local admin user; and it renames a store still called "Medusa Store". To keep a deletion, remove the item from the seed data in `backend/src/scripts/seed-data/` as well.

The run's last log line (`Seed done. Created: ... Repaired: ...`) lists what it wrote: `settings` and `regionSettings` are settings that were missing, `sizeCharts`, `serviceZones` and `shippingOptions` what it added; a payment provider linked to an existing region counts as repaired. A second run lists nothing.

Check it: with the backend running,

```
curl -H "x-publishable-api-key: <key from storefront/.env.local>" http://localhost:9000/store/regions
```

## Checkout rules (M1)

The contract is [docs/contracts/m1-checkout.md](docs/contracts/m1-checkout.md). Every value below is a placeholder setting, kept in the database after the first seed run; change it in the admin, not in code:

| Setting | Where (admin) | Placeholder | Meaning |
| --- | --- | --- | --- |
| `cod_max_total` | Settings > Store > Metadata | 20000 | Largest cart total, in PKR (major units: 20000 = Rs 20,000), payable by cash on delivery |
| `delivery_days_standard` | Settings > Store > Metadata | 15 | Calendar days from proof approval to delivery |
| `delivery_days_rush` | Settings > Store > Metadata | 10 | The same, with paid rush. Must be lower than `delivery_days_standard` |
| `min_garment_quantity` | Settings > Regions > the region > Metadata | Pakistan 1, others 10 | Fewest garment pieces in one order |

A number typed as text ("20000") is accepted. The days and the minimum are whole numbers of 1 or more, `cod_max_total` is 0 or more, and `delivery_days_rush` must be lower than `delivery_days_standard` (10 and 15 is fine; 15 and 15, or 16 and 15, is not). A missing or invalid value makes the checkout-rules route, cart completion and choosing cash on delivery fail with HTTP 500 and a message naming the key or keys and where to set them (checkout stops rather than guessing a rule). The Store's metadata is saved as a whole, so keep the other keys when you edit one.

- **The rules** are plain TypeScript in `backend/src/lib/rules/` (minimum quantity, cash on delivery, delivery promise, what an order keeps, cash collected), with the setting readers in `backend/src/lib/settings/`. The minimum counts the pieces of every product except those whose `metadata.kind` is exactly `fit_kit` or `rush_add_on`; a product with no kind, or a kind written another way (`Garment`), counts as a garment. A cart with nothing that counts (a fit kit alone) passes. Cash on delivery is available when the region has the country `pk` and the cart total is at or below `cod_max_total`. The delivery promise counts calendar days from today's date in Asia/Karachi; `applies` says which of the two dates is promised: `rush` when the cart (or order) holds the rush line, else `standard`.
- **`GET /store/carts/:id/checkout-rules`** (publishable key) returns the results as JSON for the storefront: the minimum, cash on delivery, the delivery promise and `rush` (`available`, `in_cart`, `percentage`, `amount` in whole currency units, `currency_code`).
- **Rush** (contract section 9, decision 011). Rush is one cart line of the `rush-add-on` product, quantity 1, priced by the server: the garment lines (every line but the fit kit and rush), after item discounts and before delivery and tax, times `rush_percentage` / 100, rounded half up to the currency's smallest unit (its decimal digits come from Medusa's currency data). The rule is `backend/src/lib/rules/rush-charge.ts` (exact arithmetic in `exact-amount.ts`). `POST /store/carts/:id/rush` adds it (or leaves it) and `DELETE /store/carts/:id/rush` removes it (or does nothing); both answer `{ cart }` like Medusa's cart routes. Refused: a cart with no garment line or a percentage of 0 (400 `not_allowed`), an unknown cart (404), a missing or invalid `rush_percentage` or a missing rush product (500 naming it), and a cart that other requests are changing at the same moment (409 `conflict`: try again). Medusa's own routes refuse the rush product (`POST /store/carts` with it in `items`, `POST /store/carts/:id/line-items` with its variant, and any `POST` on its line: 400 `not_allowed`); `DELETE /store/carts/:id/line-items/:line_id` removes it. **The line is priced again after every cart change:** a handler on Medusa's `refreshCartItemsWorkflow` hook `beforeRefreshingPaymentCollection` (`backend/src/workflows/hooks/refresh-cart-items-rush.ts`), which every store change to a cart's lines, region, promotion codes sent with the cart, shipping method or customer runs inside the cart's lock, before the payment collection takes the new total; and our own handler for `POST`/`DELETE /store/carts/:id/promotions` (`backend/src/api/store/carts/[id]/promotions/route.ts`), because Medusa's promotions workflow does not refresh the items. The rush line goes with the last garment line. Before `POST /store/carts/:id/complete` it is priced once more (a middleware); if that changes the total, Medusa drops the payment session as for any change, and the completion asks for one again. The completion hook then checks the very data the order is made from: if the rush line there differs from the rule (another server changed the cart in that instant), no order is made and the answer is Medusa's 409 `conflict`; completing again works. The rush line does not count toward the minimum; the cash-on-delivery limit is checked against the total with rush.
- **Enforced in the backend:** completing a cart below the minimum, or with cash on delivery when it is not available, is refused with HTTP 400 (`type: "not_allowed"`) before any order or payment is made (a `completeCartWorkflow` validate hook, `backend/src/workflows/hooks/`). Choosing cash on delivery is refused the same way (a middleware on `POST /store/payment-collections/:id/payment-sessions`, `backend/src/api/middlewares.ts`). Medusa allows one handler per workflow hook, so every later completion check goes into `complete-cart-checkout-rules.ts`.
- **The promised date is kept on the order** as `metadata.delivery_promise` (`date`, `days`, `based_on`, `applies`), written by the server on the order, never taken from the cart. It is worked out from the order's own creation date in Asia/Karachi plus the days setting at that moment (`delivery_days_rush` and `applies: "rush"` when the order has a rush line), by a subscriber on Medusa's `order.placed` event (`backend/src/subscribers/`), so every order gets it however it was placed: the store's complete route, a payment provider's webhook (which completes the cart without the store route) or a converted draft order. Completing a cart is never refused because of the promise. Medusa's own `GET /store/orders/:id` does not return metadata, so pages read it from **`GET /store/orders/:id/delivery-promise`** (publishable key); that route works the promise out first if the order has none yet, so it answers at once after completion. The route returns a kept promise only if it is the order's own: based on the order's creation date in Asia/Karachi, for the date that applies, and not a copy of a promise its cart carried (a customer could write one before the reserved-key refusal); the days may differ from today's setting. That promise is never rewritten, also when the days setting changes later. Anything else is replaced by the server's answer before the route answers, also on the very first read. If that is needed and the days settings are missing or invalid, the route answers HTTP 500 naming the key (and empties a copied promise so it is never shown); it never invents a date.
- **Keys a customer cannot write.** `POST /store/carts` and `POST /store/carts/:id` answer HTTP 400 (`type: "invalid_data"`) when the body's `metadata` contains `delivery_promise` or any key starting with `cod_` (reserved for staff), whatever the value, `null` included (a middleware in `backend/src/api/middlewares.ts`; these are the only store routes that write a cart's metadata, which Medusa copies into the order). Completing a cart is not refused for its metadata: a `cod_` key that reached a cart some other way records nothing, because cash collection is not kept in metadata (below).
- **Completing a cart twice** returns the same order and never creates a second one, also for several completions at once (an API test holds this).
- **Cash on delivery** is a payment provider in `backend/src/modules/cod`, registered in `backend/src/lib/config/build-config.ts`; Medusa names it `pp_cod_cod`. A session is authorized at once, and the payment is captured when staff record the cash as collected (below). Which regions offer it is seed data (`payment_providers` in `regions.ts`), but the rule refuses it outside Pakistan even if an admin links it to another region.

### Cash on delivery collected (staff)

The courier collects the cash and hands over a slip against the order number. Then, in the admin:

1. Open **Orders** and the order with that number.
2. In the **Cash on delivery** panel in the right-hand column (below Customer and Activity), type the slip's reference into **Courier slip reference** and press **Mark cash as collected**.
3. The payment is captured first (the order's payment status becomes Captured); then the reference is recorded and the panel shows it, when it was recorded, and who captured the payment and when. It cannot be recorded a second time.

What the panel shows:

| Panel badge | Meaning | What to do |
| --- | --- | --- |
| Not collected | The payment is open | Type the reference, press **Mark cash as collected** |
| Partly captured | Part of the amount was captured in the order's Payments section | Type the reference, press **Mark cash as collected**: this captures the rest (the panel says how much), because the courier's slip is for the whole order. Medusa's own **Capture payment** button cannot do this: it always asks for the full amount, which Medusa refuses once part is captured |
| Captured, no slip | The payment was captured with Medusa's own **Capture payment** button (or the reference could not be saved after the capture) | Type the reference, press **Record slip reference**; the payment is not captured again |
| Collected | The reference is recorded | Nothing; it cannot be changed here |
| Collected, then canceled and refunded (or: then canceled, partly refunded / not refunded; then refunded; partly refunded) | The reference was recorded, and the order was canceled or the payment refunded afterwards. A note under it gives the figures | If it says "not refunded" or "partly refunded" on a canceled order, refund what the customer is owed in the order's Payments section |
| Canceled, not collected / Payment canceled, not collected / Refunded, not collected | The order is canceled, or its payment canceled or refunded, and no slip was recorded | Nothing can be recorded on it |

**A warning in red** appears in the panel when the order's payment history (its capture transactions) does not add up to the payment's own captures, with both figures. It is a known Medusa fault when two captures of one payment run at the same moment (QA saw 8 of 40 rounds of "mark collected" against a part capture with Medusa's button, and 9 of 32 with Medusa's routes alone): the order then shows more paid than was captured. Do not refund or chase payment from the order's paid figure; tell the developer, with the order number. The comparison is `captureMismatch` in `backend/src/lib/rules/cash-collection.ts`.

The panel shows only on an order paid by cash on delivery; an order paid another way shows no panel. A reference is 1 to 64 characters (counted as typed, so an Urdu letter is one) with at least one letter or digit; spaces at the ends are dropped and runs of spaces become one. The field does not cut a longer reference: the backend refuses it and the panel shows why. Letters, digits, spaces, punctuation and mathematical and currency signs are allowed. Refused, not removed (type the reference again by hand), with a message that starts by saying what is allowed: line breaks, tabs and control characters; invisible characters a paste can bring along (the right-to-left override, the zero-width space and joiner, and every other character Unicode marks as default-ignorable, such as variation selectors and the Hangul fillers); other symbols (emoji, boxes, and placeholders that show as a box or blank, such as U+FFFC and the Braille blank); private-use and unassigned characters; an accent or vowel mark that is not on a letter or digit; and a mark of one writing system on a Latin letter or a digit. Urdu and Arabic text with its vowel marks is accepted, and so is the zero-width non-joiner between two Arabic-script letters, where Urdu and Persian spelling uses it (some keyboards type it); anywhere else it is refused.

**Where it is kept.** The record (the slip reference and when it was recorded, UTC) is a row of its own in the table `cash_collection` (module `backend/src/modules/cash-collection`, created by the migrations that `npm run setup` runs), one row per order: the database refuses a second one. It is not in the order's metadata, so Medusa's own order edits (which save the metadata as a whole) cannot remove it, and a signed-in customer's `GET /store/orders` does not show it. Who captured is Medusa's own capture record. Before S1-1d the record was kept in the order's metadata as `cod_slip_reference`, `cod_collected_at` and `cod_collected_by` (only developers' databases have such orders). **A migration script moves them** (`backend/src/migration-scripts/move-cod-metadata-to-cash-collection.ts`): Medusa runs it once per database during `medusa db:migrate`, so during `npm run setup` and at deploy. For each order with `cod_` keys it creates the record from the slip reference and time if the order has none (a record made since is kept), and then removes every `cod_` key from the order's metadata; who recorded it is not moved (Medusa's capture record says who captured). Running it again changes nothing. The store's order routes (`GET /store/orders`, `GET /store/orders/:id`, the order-transfer routes and the completion's answer) also leave every `cod_` key out of an order's metadata, and the order-placed subscriber removes any that a cart carried into a new order (Medusa copies a cart's metadata into its order; the store routes refuse such keys on a cart, so they can only come from a cart written some other way). If an order is deleted (Medusa marks it deleted), the panel and the route answer 404 for it, and its record stays, like Medusa's own payment and capture: it is the record of cash received, and it shows again if the order is restored.

If two staff press at once, even on two servers, the payment is captured once and one reference is kept; the other press is usually told that the payment was captured by another request at the same moment, and when it got as far as the record, that the cash is already recorded. Nothing is recorded on a canceled order or on a canceled or refunded payment: the last check runs at the insert itself, under the order's and the payment's row locks, which Medusa's cancel and refund also take, so a cancel or refund at the same moment either comes first (the press is told so and records nothing) or after the record (the panel then says "Collected, then canceled..." or "then refunded"). If the capture fails, nothing is recorded and the panel says so; press again. If the reference cannot be saved after the capture, the payment stays captured (with the order's payment transaction, so nothing shows as outstanding) and the panel shows Captured, no slip: record the reference again; the payment is not captured a second time. Error messages are sentences for staff; the underlying error is in the backend's log. The same action is `POST /admin/orders/:id/cash-collection` with `{ "slip_reference": "..." }` (admin login); `GET` on the same path returns the panel's state. The rule is in `backend/src/lib/rules/cash-collection.ts`, the steps in `backend/src/workflows/cash-collection/`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Env files, migrations, seed, publishable key (idempotent) |
| `npm run dev` | Backend and storefront together (a missing part is skipped). If either one exits by itself, with any exit code, dev stops the other and exits non-zero, naming the one that ended; Ctrl+C stops both and exits 0 |
| `npm run lint` | ESLint in the backend, storefront and editor, and in `scripts/` |
| `npm run typecheck` | `tsc --noEmit` in the backend, storefront and editor |
| `npm run test` | Tests in the backend, storefront and editor, plus `scripts/` tests |
| `npm run build` | Production build of the backend, storefront and editor (needs `npm run setup` and a running backend, see below) |

**`npm run build` needs a set-up store and a running backend.** The storefront build stops at once without `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `storefront/.env.local`, which `npm run setup` writes, and while it builds it reads the regions and products from the backend at `MEDUSA_BACKEND_URL` to pre-render their pages. So run `npm run setup` once, start the backend (`npm run dev`, or `npm run dev --prefix backend` for the backend alone) and leave it running, then run `npm run build` in a second terminal. The backend and editor builds alone need neither: `npm run build --prefix backend`, `npm run build -w packages/editor`.

Backend only: `npm run <script> --prefix backend` (`dev`, `build`, `migrate`, `seed`, `test:unit`, `test:integration:http`). Storefront or editor only: `npm run <script> -w storefront` or `-w packages/editor`.

## Installing and adding dependencies

The backend is **not** an npm workspace. Medusa's admin runs on React 18 and the storefront and editor on React 19; in one shared install npm put React 18 at the root, where the storefront's libraries picked it up (see `docs/decisions/006-react-and-tool-versions.md`). So there are two installs, each with its own lockfile:

| Folder | Lockfile | Contains |
| --- | --- | --- |
| repo root | `package-lock.json` | the workspaces `storefront` and `packages/editor` |
| `backend/` | `backend/package-lock.json` | the backend only |

A root `npm install` (or `npm ci`) does both: when the root install finishes, its `postinstall` script (`scripts/install-backend.mjs`) runs `npm install` (or `npm ci`) in `backend/`. `npm run install:backend` runs only the backend part.

To add a dependency:

```
npm install <package> --prefix backend      # backend (updates backend/package-lock.json)
npm install <package> -w storefront         # storefront (updates the root package-lock.json)
npm install <package> -w packages/editor    # editor (updates the root package-lock.json)
```

The root `package.json` has two `overrides` entries. Neither reaches the backend, whose install is separate.

- `@medusajs/ui`: lets it (it declares React 18 as its peer) use the storefront's React 19, as Medusa's own storefront starter does. Keep its version equal to the storefront's `react`.
- `next` > `postcss`: Next.js 15 pins `postcss` 8.4.31, which `npm audit` reports as high (GHSA-qx2v-qp2m-jg93 and others, fixed after 8.5.22). The override gives Next.js the same `postcss` as the rest of the storefront (8.5.32). Remove it once a Next.js release depends on a fixed `postcss` itself.

npm 10 does not apply a new or changed override to a package that is already in the lockfile (it keeps the old nested copy). To make it take effect, have npm resolve that package again, for example `npm uninstall next -w storefront --package-lock-only` and then `npm install next@<the same version> --save-exact -w storefront --package-lock-only`, and check with `npm ls postcss` that nothing is marked `invalid`.

Backend integration tests create and drop temporary databases on the PostgreSQL server (host `localhost`, port 5433 by default, user `medusa`). Each test file's backend listens on a free port of its own, whatever `PORT` says in `backend/.env` or the shell (`backend/integration-tests/setup.js`), so the tests run while a dev backend holds its port. They never touch the `medusa` development database. Start `docker compose up -d` first. To point them elsewhere set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, as the CI workflow does. Medusa also reads `backend/.env` in tests, so with `REDIS_URL` set there the tests use Redis, which makes them several times slower; CI has no `backend/.env` and sets no `REDIS_URL`, so there they use Medusa's in-memory modules. The tests use no network: image tests check the stored URLs only.

**Production start.** With any `NODE_ENV` other than `development` or `test` (or unset), so `production`, `prod` (Medusa's own production mode), `staging` and anything else, in any case, the backend refuses to start, lists every problem and exits (`backend/src/lib/config/build-config.ts`; which `NODE_ENV` counts as what is in `node-env.ts` next to it). It refuses:

- `JWT_SECRET`, `COOKIE_SECRET`, `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` missing.
- `JWT_SECRET`, `COOKIE_SECRET` or `S3_SECRET_ACCESS_KEY` shorter than 16 characters. A self-hosted MinIO accepts a secret key of 8 characters; in production the backend needs 16 or more.
- Any of these, or `MEDUSA_ADMIN_PASSWORD`, that is or contains a dev value from `backend/.env.example`, of any variable: the dev JWT secret given as `COOKIE_SECRET` counts too, and so does a dev value with something added before or after. Compared ignoring case and surrounding spaces. (A dev value shorter than 8 characters would count only as the whole value, so a long random secret is never refused because a short word happens to be inside it; today every dev value is 10 characters or longer.)
- `DATABASE_URL` unset, empty or only spaces. Without it Medusa would take the database from `MEDUSA_DATABASE_URL`, a per-module `<MODULE>_DATABASE_URL` (such as `PRODUCT_DATABASE_URL`) or the `PG*` variables, none of which these checks read, so in production `DATABASE_URL` itself must be set. Development and test still start without it.
- A `DATABASE_URL` with a `#` in it. Write a `#` in the password as `%23`.
- A `DATABASE_URL` that does not name its database server: one with no host after the `@` (`postgres://user:pw@/db`, where `pg` would take the server from `PGHOST` or its default; or `postgres://user:pw@:5433/db`, with a port but no host, which `pg` cannot read at all), one with a `host` or `hostaddr` query parameter (which would choose the server in place of the host after the `@`), and a string that is not a `postgres://` or `postgresql://` URL (a socket path, or libpq's `host=... user=...` form). Write `postgres://<user>:<password>@<host>:<port>/<database>`, with special characters in the user or password percent-encoded. The login is checked either way; this makes sure the server it is checked for is the one in the URL.
- The dev database login `medusa` / `medusa`, wherever the PostgreSQL driver (`pg`) would take it from: the user and password in `DATABASE_URL`, its `user` and `password` query parameters (which win over them), and `PGUSER` / `PGPASSWORD` (`backend/src/lib/config/database-login.ts`). `DATABASE_URL` is checked as given and also as Medusa rewrites it before `pg` sees it (Medusa removes its own `ssl_mode` parameter; a unit test checks that our copy of that rewrite still matches the installed Medusa).
- The dev database user `medusa` with no password in `DATABASE_URL` or `PGPASSWORD`. `pg` would then take the password from a pgpass file (`PGPASSFILE`, `~/.pgpass`, or on Windows `%APPDATA%\postgresql\pgpass.conf` even with no variable set), which is not checked. Give the password explicitly, or use a different database user.

Medusa's `supersecret` fallback is used only in development and test. The seed creates the dev admin user only in development and test.

`medusa start` (and so `npm run start --prefix backend`) sets `NODE_ENV=production` itself when it is unset, and loads `backend/.env`, so with the dev `backend/.env` it refuses to start: that is intended. For local work use `npm run dev`.

## Reset the database

Drop and recreate only the Medusa database, keeping Redis and MinIO data:

```
docker compose exec postgres psql -U medusa -d postgres -c "DROP DATABASE medusa WITH (FORCE)" -c "CREATE DATABASE medusa"
npm run setup
```

Stop the backend first. The compose project is shared by every git worktree, so this resets the database for all of them.

**Databases seeded before 10 Nov 2026** still have fixed prices on `rush-add-on` (PKR 500, GBP 4, AED 15, USD 5), and products that already have images keep them (for example Medusa's demo photos): the seed does not delete prices or replace images, so a re-run only adds the `rush_percentage` setting, images on products that have none, and whatever an interrupted run left out. Their products also stay in a random order in the store (the order of `products.ts` comes from the product ids, which are chosen only when a product is created) until the database is reset. (The rush line's price never comes from those fixed prices: the server sets it.) Reset it as above to get the current data (products in seed order, rush with only the placeholder price 0, the spized.com stand-in photos):

```
docker compose exec postgres psql -U medusa -d postgres -c "DROP DATABASE medusa WITH (FORCE)" -c "CREATE DATABASE medusa"
npm run setup
```

Wipe everything (PostgreSQL, Redis and MinIO volumes) and start over:

```
docker compose down -v
docker compose up -d
npm run setup
```

## Notes

- **MinIO image.** MinIO no longer publishes official Docker images (`minio/minio` is gone from Docker Hub and Quay). `docker-compose.yml` uses the Chainguard build, `cgr.dev/chainguard/minio:latest`, for local development only.
- **File storage.** The backend uses Medusa's S3 file provider pointed at MinIO when the `S3_*` variables in `backend/.env` are set (path-style addressing is turned on automatically when `S3_ENDPOINT` is set). With them empty it falls back to local files in `backend/static`.
- **Redis.** The cache, event bus and workflow engine use `REDIS_URL`. To run without Redis (Medusa's in-memory versions), remove the `REDIS_URL` line from `backend/.env` or comment it out. Setting it empty in the shell (`REDIS_URL=`) is not enough on Windows: Windows drops empty environment variables, so the value in `backend/.env` is used.
- **CI.** `.github/workflows/ci.yml` runs `npm ci`, then root `lint`, `typecheck` and `test` on every push and pull request, with a PostgreSQL service container. The test job sets no `REDIS_URL` (with it the integration tests ran about eight times slower).
