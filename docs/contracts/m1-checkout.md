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
- **Cash on delivery collected.** The courier gives a slip against the order number. Staff mark the payment as collected in the admin, and the slip reference is kept on the order (`metadata.cod_slip_reference`).
- **Rush days.** `delivery_days_rush` must be lower than `delivery_days_standard`; otherwise the setting is invalid and is reported like any other invalid setting.
- **Completing twice.** Completing a cart that has already become an order returns that order and never creates a second one. QA saw this hold, including three completions at once; it needs a test of its own.

### 8.1 As built in S1-1b (in QA review on 11 Nov, not merged yet)

The storefront checkout (task S1-4) is built against these. If QA changes any of them, this section is corrected first.

- **Rules route.** `delivery_promise` gains `"applies": "standard"` (or `"rush"` once the rush charge exists). The storefront shows the date of the option named by `applies`.
- **The promised date of an order.** `GET /store/orders/:id/delivery-promise` (publishable key) answers:

  ```json
  { "delivery_promise": { "date": "2026-11-26", "days": 15, "based_on": "2026-11-11", "applies": "standard" } }
  ```

  - `delivery_promise` is `null` for an order placed before the date was kept. An unknown order: 404.
  - As with Medusa's own `GET /store/orders/:id`, knowing the order id is what gives access.
  - It is a route of its own because Medusa's `GET /store/orders/:id` and the complete route do not return the order's `metadata`.
- **Completing a cart.** `POST /store/carts/:id/complete` writes the promise into the cart just before the order is created; the storefront sends nothing extra.
  - HTTP 409 with `type: "conflict"` means "complete again": the cart was changed, or was already being completed, at that moment. The storefront completes once more, and if that fails too it shows the "check my order" state. Medusa replaces the message with a generic one, so the storefront does not show it.
  - Completing a cart that has already become an order returns that same order (`type: "order"`), also for several completions at once.
- **Order metadata written by staff.** `cod_slip_reference`, `cod_collected_at` (UTC time) and `cod_collected_by` are written when staff mark the cash as collected (`GET` and `POST /admin/orders/:id/cash-collection`, admin sign-in only). A cart cannot carry these keys into an order. The storefront does not read them in M1.

## 9. Not in this contract

- The rush charge in the cart (a later M1 task).
- Customer accounts: Medusa's own store routes for sign-up, login and orders are used as they are.
- Team orders, deposits and balances (M2 and M3).
