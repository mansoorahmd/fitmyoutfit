# M1 checkout contract

11 Nov 2026 · coordinator. Sections 1 to 7 are built and were confirmed by QA against a real backend on 11 Nov (task S1-1); section 8 is the next backend task. What the backend provides and what the storefront relies on for milestone M1 (basic store) in [dev-plan.md](../../dev-plan.md). The backend worker confirms each point against Medusa v2.22.6 or reports what has to change; the coordinator then updates this file. The storefront is built against this file, not against the backend's code.

Every value marked placeholder is seed data or a setting, never a constant in code. The founders replace the values later.

## 1. Settings

Store settings live in the Store's `metadata`, like `rush_percentage` today. The seed writes a setting only when it is missing; after that it is changed in the admin. Medusa replaces the Store's metadata as a whole on update, so whoever edits one key must send the others too. A Region's metadata is merged.

A setting may be stored as a number or as a numeric string. The days and the minimum must be whole numbers of 1 or more; `cod_max_total` is 0 or more.

| Key | Placeholder | Meaning |
| --- | --- | --- |
| `rush_percentage` | 20 | Already there. Not used by this contract |
| `cod_max_total` | 20000 | Largest cart total that can be paid by cash on delivery, in whole rupees (20000 means PKR 20,000). The total includes the delivery fee |
| `delivery_days_standard` | 15 | Days from proof approval to delivery |
| `delivery_days_rush` | 10 | The same, with paid rush |

Region settings live in the Region's `metadata`, next to `tax_final`.

| Key | Placeholder | Meaning |
| --- | --- | --- |
| `min_garment_quantity` | Pakistan 1; United Kingdom, United Arab Emirates and United States 10 | Fewest garment pieces in one order |

## 2. Size chart on the product

Each garment and the fit kit carries `metadata.size_chart`. It is a garment-measurement table (the garment laid flat), not a body chart.

```json
{
  "draft": true,
  "unit": "cm",
  "columns": [
    { "key": "chest", "label": "Chest width" },
    { "key": "length", "label": "Body length" }
  ],
  "rows": [
    { "size": "YS", "values": { "chest": 38, "length": 52 } }
  ]
}
```

- `rows` has one row per size, in the size order. The fit kit lists every size its sample garments come in (today all eleven).
- `columns` differ per product (the jersey has chest and length; the T-shirt and jacket add sleeve length). Render whatever `columns` lists.
- `draft: true` means placeholder measurements; the storefront then shows a "draft measurements" note.
- The seed adds the chart only to a product that has none, so a chart edited in the admin is kept.

## 3. Shipping

One stock location and one shipping option per region, created by the seed.

| Region | Option name | Amount (placeholder) | Marker |
| --- | --- | --- | --- |
| Pakistan | Delivery in Pakistan | PKR 250 | none |
| United Kingdom, United Arab Emirates, United States | Shipping & duties included | 0 | `data.ddp: true` |

The export option is the single duty-paid line. The storefront shows it as one line with that name and no separate duties line.

`GET /store/shipping-options?cart_id=` returns each option's `data` and `amount`. The duty-paid option has `data.ddp === true`; the Pakistan option has `data: {}`. `amount` is in whole currency units.

## 4. Payment

| Provider id | Regions | What it is |
| --- | --- | --- |
| `pp_system_default` | all four | Placeholder payment until a real gateway is approved |
| `pp_cod_cod` | Pakistan only | Cash on delivery |

Cash on delivery is refused by the backend when the region is not Pakistan, or when the cart total is above `cod_max_total`.

## 5. Rules

The rules are plain TypeScript modules in `backend/src/lib/rules/`, with no Medusa imports and with their own tests. Medusa code around them stays thin.

- **Minimum quantity.** Counts garment pieces across the whole cart. The fit kit (`metadata.kind` `fit_kit`) and the rush add-on (`rush_add_on`) do not count. A cart with no garment passes, so a fit kit can be bought alone in any region.
  - **As built in S1-1:** only a product whose kind is exactly `garment` counts, so a product an admin adds without a kind escapes the minimum (QA defect D1).
  - **Decided, task S1-1b:** every product counts unless its kind is `fit_kit` or `rush_add_on`. A missing or unknown kind counts as a garment.
- **Cash on delivery.** Available when the region contains the country `pk`, the cart currency is `pkr`, and the cart `total` is at or below `cod_max_total`. The total is the full order total: items, delivery and tax, less discounts. It rises when the delivery method is added (PKR 2,000 becomes PKR 2,250), so the storefront re-reads the rules after delivery is chosen.
- **Delivery promise.** Delivery date = base date + `delivery_days_standard` calendar days, or + `delivery_days_rush` with rush. In M1 the base date is today's date in Asia/Karachi, standing in for the proof-approval date, which arrives with team orders in M2.

## 6. Store API

`GET /store/carts/:id/checkout-rules` (publishable key, like every store route):

```json
{
  "minimum_quantity": { "required": 10, "counted": 4, "ok": false },
  "cash_on_delivery": { "available": false, "reason": "region", "limit": 20000, "limit_currency_code": "pkr" },
  "delivery_promise": {
    "based_on": "2026-11-11",
    "standard": { "days": 15, "date": "2026-11-26" },
    "rush": { "days": 10, "date": "2026-11-21" }
  }
}
```

- `cash_on_delivery.reason` is `null` when available, else `"region"` or `"over_limit"`.
- `cash_on_delivery.limit` is in whole currency units, like `cod_max_total`. The check uses the cart total including delivery, so a cart can pass in the cart view and go over the limit once delivery is added; the storefront re-reads the rules at checkout.
- Dates are `YYYY-MM-DD`.

Enforcement, on the backend and not only in the storefront:

- Completing a cart that is below the minimum fails. Nothing is charged and no order is created.
- Choosing or completing with cash on delivery when it is not available fails the same way.
- The failure is HTTP 400 with `{ "type": "not_allowed", "message": "..." }`. The storefront does not parse the message: it re-reads `checkout-rules` and explains from that.
- **When each check runs.** Cash on delivery is checked when it is chosen (`POST /store/payment-collections/:id/payment-sessions`) and again at completion. The minimum is checked at completion only, so a customer can choose a payment method before reaching the minimum.
- **After any cart change** (quantity, items, delivery, region) Medusa drops the payment session. The storefront must create the payment session again before completing.
- **Other answers.** An unknown cart: 404. A missing publishable key: 400. A missing or invalid setting: HTTP 500 with a message naming the key, on the rules route, when choosing payment and at completion. Checkout stops rather than guessing, in every region.

## 7. Proof, as API tests on the backend

1. Pakistan: a cart with 1 T-shirt completes with cash on delivery and becomes an order.
2. United Kingdom: a cart with 9 garment pieces cannot complete; with 10 it completes with the placeholder payment.
3. United Kingdom: cash on delivery is refused.
4. Pakistan: cash on delivery is refused for a cart above `cod_max_total`.
5. Any region: a cart with only a fit kit completes.

## 8. Additions after the page specification (11 Nov, backend follow-up task S1-1b)

These came from [05-m1-pages.md](../design/05-m1-pages.md), section 12. They are not part of the first backend task.

- **Which date applies.** `delivery_promise.applies` is `"standard"` or `"rush"`. It is always `"standard"` until the rush charge exists.
- **The date is kept on the order.** When a cart is completed, the order gets `metadata.delivery_promise` with `date`, `days`, `based_on` and `applies`, so the confirmation and account pages can show the date that was promised.
- **Minimum counts products with no kind.** See section 5 (QA defect D1).
- **Cash on delivery collected.** The courier gives a slip against the order number. Staff mark the payment as collected in the admin, and the slip reference is recorded with the order (see 8.1; not in its metadata since S1-1d).
- **Rush days.** `delivery_days_rush` must be lower than `delivery_days_standard`; otherwise the setting is invalid and is reported like any other invalid setting.
- **Completing twice.** Completing a cart that has already become an order returns that order and never creates a second one. QA saw this hold, including three completions at once; it needs a test of its own.

### 8.1 As built (S1-1b, corrected in S1-1c and S1-1d; accepted by QA; S1-1d merged on 12 Nov)

The storefront checkout (S1-4) and account pages (S1-5) are built against these. The reasons are in [decision 010](../decisions/010-order-metadata-and-cash-collection.md).

- **Rules route.** `delivery_promise` has `"applies": "standard"` (or `"rush"` once the rush charge exists). The storefront shows the date of the option named by `applies`.
- **The promised date of an order.** The server writes `metadata.delivery_promise` on the order after it is created. It is based on the order's creation date in Asia/Karachi plus the days setting at that moment, never on anything sent by the storefront. This happens for every order, however it was placed (the complete route, a payment provider's webhook, a converted draft order). Once kept, it does not change when the settings change. (One exception, in development databases only: an order whose cart carried a promise from before 12 Nov that equals the server's answer is worked out again on a later read.)

  `GET /store/orders/:id/delivery-promise` (publishable key) answers:

  ```json
  { "delivery_promise": { "date": "2026-11-26", "days": 15, "based_on": "2026-11-11", "applies": "standard" } }
  ```

  - The route makes sure the order has its promise before answering, so it can be called straight after completion and returns the date for a placed order. It returns a kept promise only if it is the order's own: based on the order's creation date in Asia/Karachi, for the date that applies, and not a copy of a promise its cart carried. Anything else is replaced by the server's answer first, also on the very first call.
  - An unknown order or a draft order: 404. If the server's answer is needed and the days settings are missing or invalid: HTTP 500 with a message naming the key (a promise the server cannot vouch for is then emptied, so it is not shown in the order list either). The storefront leaves the date line out on any failure; an order page never fails because of it.
  - As with Medusa's own `GET /store/orders/:id`, knowing the order id is what gives access. A signed-in customer's `GET /store/orders` also returns each order's `metadata`, including `delivery_promise`.
- **Completing a cart.** `POST /store/carts/:id/complete` needs nothing extra from the storefront. It is refused only by the checkout rules (HTTP 400 `not_allowed`) or a missing or invalid setting (HTTP 500), never because of the delivery date.
  - Medusa itself can answer HTTP 409 (`type: "conflict"`) when the same cart is already being completed. The storefront completes once more, and if that fails too it shows the "check my order" state.
  - Completing a cart that has already become an order returns that same order (`type: "order"`), also for several completions at once.
- **Cart metadata.** `POST /store/carts` and `POST /store/carts/:id` answer HTTP 400 (`type: "invalid_data"`) when `metadata` contains `delivery_promise` or any key starting with `cod_`, whatever the value (including `null`). The storefront never sends these keys. Completing a cart is never refused because of its metadata.
- **Cash on delivery collected (staff).** `GET` and `POST /admin/orders/:id/cash-collection` (admin sign-in only). Recording the courier's slip captures what is still open of the cash-on-delivery payment (all of it, or the rest when part was captured in Medusa's Payments section), then records the slip reference and the time (UTC) once. The record is kept in a table of its own (`cash_collection`), one per order, not in the order's metadata: for orders recorded since S1-1d a customer's `GET /store/orders` and `GET /store/orders/:id` return nothing about it, and Medusa's own order edits cannot remove it. Who captured is Medusa's own capture record. The storefront does not read any of it in M1. **Known gap:** an order recorded before S1-1d (development databases only) still carries `cod_slip_reference`, `cod_collected_at` and `cod_collected_by` in its metadata, and the customer's order list still returns them; the next backend task moves them into the table and removes the keys.
- **Open, for when a real gateway is connected (M3).** A payment provider's webhook completes the cart without the store route. QA saw it: a UK cart of 9 with an "authorized" webhook gives no order, and a later "captured" webhook still captures the money. The checks must pass before the payment is started, and a refused completion after payment needs a refund or an alert. Not decided yet. Cash on delivery and the placeholder payment have no webhook.

## 9. Rush charge (task S1-6; as built, checked sentence by sentence by QA on 16 Nov in PKR, GBP, AED and USD; the backend is not merged yet)

Reasons and the mechanism are in [decision 011](../decisions/011-rush-charge.md). The storefront half is built against this section.

- **What rush is in a cart.** One line of the seeded product "Rush Production" (product `metadata.kind` `rush_add_on`), quantity 1, priced only by the server. A cart holds rush or it does not; there is no other flag.
- **The charge.** The garment lines (every line whose kind is not `fit_kit` or `rush_add_on`) after item discounts (an order-wide discount is shared with the fit kit), before delivery and tax, times `rush_percentage` / 100, rounded half up to the currency's smallest unit (PKR 2,000 at 20% is PKR 400; GBP 220.00 at 20% is GBP 44.00). The rush line itself is never discounted. Its variant carries a placeholder price of 0 per currency that is never charged.
- **Adding and removing.** `POST /store/carts/:id/rush` adds it or leaves it; `DELETE /store/carts/:id/rush` removes it or does nothing. Both answer 200 with `{ "cart": … }`. Refusals:
  - no garment line, or a `rush_percentage` of 0 (rush is not offered): 400 `not_allowed`;
  - an unknown cart: 404;
  - `rush_percentage` missing or invalid, or the rush product missing: 500 with a message naming it;
  - the cart is being changed by another request at the same moment: 409 `conflict`, always with Medusa's generic message; nothing changed, send it again;
  - a completed cart: 400 `invalid_data` (except that `POST` on a completed cart that already holds rush answers 200 and changes nothing).
- **No other way in.** The rush product is refused with 400 `not_allowed` in the `items` of `POST /store/carts`, in `POST /store/carts/:id/line-items`, and for any `POST` on its line (quantity, metadata). A `unit_price` in a body is refused by Medusa's own validator with 400 `invalid_data`. Medusa's `DELETE /store/carts/:id/line-items/:line_id` on the rush line removes it (and answers in Medusa's own shape for that route).
- **Always the server's figure.** After every cart change through the store API (lines, quantities, region, address, sales channel, transfer to a customer, promotions through either route or `promo_codes`) the line is priced again before the answer is sent. When the last garment line goes, the rush line goes with it.
- **At completion** the line is priced once more, and no order is ever made with a rush line other than the rule's. The storefront must handle three answers by trying again:
  - 400 `invalid_data` "Payment sessions are required to complete cart": the price changed at that moment (a changed `rush_percentage`, or rush removed because the percentage became 0), so Medusa dropped the payment session. Create the session again and complete.
  - 409 `conflict`: another request changed the cart during completion. Complete again; that attempt may answer the 400 above first.
  - rarely 404 `not_found` naming a payment session (Medusa's own race, once in 150 rounds across two servers): create the session again and complete.
- **The rules route** (`GET /store/carts/:id/checkout-rules`) gains:

  ```json
  "rush": { "available": true, "in_cart": false, "percentage": 20, "amount": 400, "currency_code": "pkr" }
  ```

  - `amount` is the rule's figure for this cart, whether or not the line is there and even while the line still holds an older figure. It is in currency units like `cod_max_total` and can have decimals (GBP 0.53). `available` is false when the cart has no garment line or the percentage is 0; `amount` is then 0.
  - `delivery_promise.applies` is `"rush"` while the cart holds the line, else `"standard"`.
  - A missing or invalid `rush_percentage` makes the rules route, choosing cash on delivery, completion and (with rush in the cart) any cart change answer 500 naming the key, like every other setting. `DELETE /store/carts/:id/rush` still works then.
- **The other rules.** The rush line does not count towards the minimum quantity. The cash-on-delivery limit is checked against the cart total including the rush charge, when cash on delivery is chosen and at completion.
- **The order.** The promised date kept on an order with a rush line uses `delivery_days_rush` and `"applies": "rush"`. The promise is fixed when the order is placed; a later order edit by staff does not change it (being built in the fix round after QA's review).
- **Not covered:** a promotion with a cart-total rule (possible through the API only) is applied while counting the rush line and dropped at the next cart change; the rush line itself stays right. A cart completed by a payment provider's webhook with a stale rush price is refused after payment; this belongs with the open webhook item in 8.1.
- **What the storefront shows** is in [05-m1-pages.md](../design/05-m1-pages.md), section 4 ("Rush add-on": a line with no thumbnail, no stepper and no Remove of its own) and its delivery-date rules.

## 10. Not in this contract

- Customer accounts: Medusa's own store routes for sign-up, login and orders are used as they are.
- Team orders, deposits and balances (M2 and M3).
