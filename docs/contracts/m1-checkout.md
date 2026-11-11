# M1 checkout contract

11 Nov 2026 · coordinator. What the backend provides and what the storefront relies on for milestone M1 (basic store) in [dev-plan.md](../../dev-plan.md). The backend worker confirms each point against Medusa v2.22.6 or reports what has to change; the coordinator then updates this file. The storefront is built against this file, not against the backend's code.

Every value marked placeholder is seed data or a setting, never a constant in code. The founders replace the values later.

## 1. Settings

Store settings live in the Store's `metadata`, like `rush_percentage` today. The seed writes a setting only when it is missing; after that it is changed in the admin.

| Key | Placeholder | Meaning |
| --- | --- | --- |
| `rush_percentage` | 20 | Already there. Not used by this contract |
| `cod_max_total` | 20000 | Largest cart total, in PKR, that can be paid by cash on delivery |
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

- `rows` has one row per size the product sells, in the product's size order.
- `draft: true` means placeholder measurements; the storefront then shows a "draft measurements" note.
- The seed adds the chart only to a product that has none, so a chart edited in the admin is kept.

## 3. Shipping

One stock location and one shipping option per region, created by the seed.

| Region | Option name | Amount (placeholder) | Marker |
| --- | --- | --- | --- |
| Pakistan | Delivery in Pakistan | PKR 250 | none |
| United Kingdom, United Arab Emirates, United States | Shipping & duties included | 0 | `data.ddp: true` |

The export option is the single duty-paid line. The storefront shows it as one line with that name and no separate duties line.

## 4. Payment

| Provider id | Regions | What it is |
| --- | --- | --- |
| `pp_system_default` | all four | Placeholder payment until a real gateway is approved |
| `pp_cod_cod` | Pakistan only | Cash on delivery |

Cash on delivery is refused by the backend when the region is not Pakistan, or when the cart total is above `cod_max_total`.

## 5. Rules

The rules are plain TypeScript modules in `backend/src/lib/rules/`, with no Medusa imports and with their own tests. Medusa code around them stays thin.

- **Minimum quantity.** Counts the pieces of products whose `metadata.kind` is `garment`, across the whole cart. The fit kit and the rush add-on do not count. A cart with no garment passes, so a fit kit can be bought alone in any region.
- **Cash on delivery.** Available when the region is Pakistan and the cart total is at or below `cod_max_total`.
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
- Dates are `YYYY-MM-DD`.

Enforcement, on the backend and not only in the storefront:

- Completing a cart that is below the minimum fails. Nothing is charged and no order is created.
- Choosing or completing with cash on delivery when it is not available fails the same way.
- The failure is an HTTP 4xx with Medusa's usual error body (`type`, `message`). The storefront does not parse the message: it re-reads `checkout-rules` and explains from that.

## 7. Proof, as API tests on the backend

1. Pakistan: a cart with 1 T-shirt completes with cash on delivery and becomes an order.
2. United Kingdom: a cart with 9 garment pieces cannot complete; with 10 it completes with the placeholder payment.
3. United Kingdom: cash on delivery is refused.
4. Pakistan: cash on delivery is refused for a cart above `cod_max_total`.
5. Any region: a cart with only a fit kit completes.

## 8. Not in this contract

- The rush charge in the cart (a later M1 task).
- Customer accounts: Medusa's own store routes for sign-up, login and orders are used as they are.
- Team orders, deposits and balances (M2 and M3).
