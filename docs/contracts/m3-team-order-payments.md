# Contract: the deposit and the balance of a team order (M3-3), as built

Status: **as built in task M3-3, on `master` since 23 Nov 2026.** Written by the backend developer from the code and its integration tests (`backend/integration-tests/http/team-order-payments.spec.ts`, `team-order-payment-guards.spec.ts`), filed by the coordinator. The reasons are in [decision 016](../decisions/016-team-order-deposit-and-balance.md). For a storefront developer: nothing here needs the code.

**Section 0 of `m2-team-orders.md` applies unchanged**: the base `/store/...`, the publishable key and a signed-in customer (401 otherwise, Medusa's body), own data only (another customer's team order is 404 `team_order_not_found`, the same as an unknown id), snake_case, and the refusal shape `{ type, code, message, ...extra }` (400 for `invalid_data` and `not_allowed`, 404 `not_found`, 409 `conflict`; a missing setting is Medusa's 500 naming it).

## 1. What changes in the status flow

```
draft -> proof_sent -> approved -> deposit_paid -> in_production -> balance_due -> shipped
```

| Step | Made by | Since M3-3 |
| --- | --- | --- |
| `approved -> deposit_paid` | **the payment system**, when the deposit is captured; or an admin by hand | `POST .../payments/deposit/complete` (section 4); the admin's `deposit_by_hand` captures the placeholder payment (section 6). Recorded in `team_order_step` as `actor: "system"` (organizer's payment) or `actor: "admin", by_hand: true`. |
| `balance_due -> shipped` | admin | **only once the balance is paid**: the admin's `ship` is not offered before, and refused with `balance_not_paid`. |
| `approved -> draft` (reopen) | organizer | refused with `payment_in_progress` while money of the deposit is authorised, captured or with a gateway (section 5). |

A paid balance is recorded once at `balance_due` (no status change): `step_name: "balance_paid"` (system) or `"balance_received_by_hand"` (admin).

## 2. Money is Medusa's

- **One Medusa order per proof.** When a proof is made, the store prices it as a Medusa **draft order** made from the proof's snapshot; at signing it becomes an order (`metadata.team_order_id`), with **two Medusa payment collections**: the deposit's and the balance's. Staff see it in the admin's Orders (Draft orders while the proof is out), with Medusa's own payment status: `not_paid`, then `partially_captured` after the deposit, `captured` after the balance.
- **What it costs**: one line per size (the product's variant for that size, at the price Medusa's pricing gives for the region, times the pieces of that size in the proof), the region's delivery (Pakistan: "Delivery in Pakistan"; export: the one duty-paid line "Shipping & duties included", `duty_paid: true`), the **rush charge** when the order asks for rush (`rush_percentage` of the garments, rounded half up; nothing when the percentage is 0), tax as the store has it ("tax not final": `tax_final` is the region's setting), and the total. **Every amount is in currency units** (PKR 35742, GBP 220, GBP 11.01), like M1's `amount`.
- **The price that counts** is the one priced for the proof: the organizer reads it before signing (`cost.state: "quote"`), and a price changed in the admin afterwards does not change it. Changing the rush choice while the proof is out prices it again. Tax is recomputed by Medusa when the order is placed at signing.
- **The split**: the deposit is the store setting `team_order_deposit_percentage` (placeholder **50**) of the total, rounded **half up** to the currency's smallest unit (PKR whole rupees; GBP, AED, USD cents); the balance is the total less the deposit. They always add up to the total exactly (PKR 3,501 is 1,751 + 1,750; GBP 22.01 is 11.01 + 11.00).
- **Add-ons and reorders** are team orders: each has its own Medusa order, its own delivery line, rush and split.

## 3. Objects

```
cost {
  state: "quote" | "ordered",          // quote: the proof is out (not signed); ordered: signed, the order is placed
  proof_id,
  currency_code: "pkr"|"gbp"|"aed"|"usd",
  tax_final: boolean,                  // false: show "tax not final"
  lines: [{ size, quantity, unit_price, total }],   // one per size with pieces, in the product's size order
  pieces: number,                      // the sum of the quantities
  delivery: { name, amount, duty_paid: boolean } | null,
  rush: { amount, percentage } | null, // null: no rush
  subtotal, tax_total, total,          // Medusa's
  deposit_percentage: number           // the share the deposit is (or will be) split with
}

part {                                 // the deposit or the balance
  amount: number,
  state: "unpaid" | "started" | "awaiting" | "authorized" | "paid" | "refunded" | "canceled",
  due: boolean,                        // true: the organizer may pay it now (show "Pay")
  paid_at: string | null,              // ISO time of the capture, when paid
  by_hand: boolean | null,             // when paid: true if staff marked it by hand
  session: { id, provider_id, status } | null   // the payment started and not finished, if any
}

payments { deposit: part, balance: part, paid_total, outstanding, payment_status: string | null }   // paid_total, outstanding and payment_status are Medusa's order's
order { id, display_id, status } | null   // the Medusa order once placed (null while a quote)
```

- `state`: `unpaid` nothing started; `started` a payment was started, nothing taken; `awaiting` a gateway is working on it (not with the placeholder); `authorized` authorised, not captured; `paid` captured in full; `refunded` captured and (partly) refunded: **counts as not paid**; `canceled` the store canceled the order.
- `due`: the deposit while the order is `approved` and the deposit is not paid; the balance while `balance_due` and not paid. Never while a quote.

## 4. Routes

### GET /store/team-orders/:id/payments

What the team order costs and what is paid. **200** `{ "team_order": { id, status, kind }, "cost": cost, "payments": payments, "order": order | null }`. Reading it also prices the proof if needed and makes any step a payment caused (it heals a missed event).
Refusals: 400 `not_allowed` `team_order_not_priced` (a draft: no proof yet; with `status`); 404 `team_order_not_found`; 409 `payment_busy`.

### POST /store/team-orders/:id/payments/:part

Starts paying a part; `:part` is `deposit` or `balance`. Body, optional: `{ "provider_id"?: "pp_system_default" }` (the placeholder payment, the only provider team orders take today; cash on delivery is not one). **Any amount in the body is ignored**: the amount is the rule's, from the order's total. Starting again replaces the earlier session.
**200** the answer of GET `.../payments` plus:

```
payment {
  part, amount, currency_code,
  session: { id, provider_id, status, data },   // data: the provider's session data (for a redirecting gateway, where to send the organizer)
  next: { type: "confirm" }                     // the placeholder: call POST .../complete; a redirecting gateway will answer { type: "redirect", url } in this shape
}
```
Refusals (400 `not_allowed`, with `status`): `deposit_not_due` (the order is not `approved`: a draft or a proof out), `deposit_already_paid`, `balance_not_due` (not `balance_due` yet), `balance_already_paid` (also once shipped), `payment_in_progress` (a gateway is already working on this part), `order_canceled` (the store canceled the order); 400 `invalid_data` `payment_part_invalid`, `payment_provider_invalid`; 404 `team_order_not_found`; 409 `payment_busy`.

### POST /store/team-orders/:id/payments/:part/complete

Completes paying a part with the session that was started. Body `{ "session_id": "payses_..." }`. Medusa authorises and captures it (for the placeholder a plain confirmation). Then the step: a paid deposit moves the order to `deposit_paid`; a paid balance is recorded. **200** the answer of GET `.../payments`.
Refusals (400 `not_allowed`, with `status`): `deposit_not_due`, `deposit_already_paid`, `balance_not_due`, `balance_already_paid`, `order_canceled`, `payment_failed` (the provider refused; nothing paid; start again), `payment_requires_action` (the provider needs more from the organizer); 400 `invalid_data` `payment_part_invalid`, `payment_session_required` (missing or not a string); 409 `payment_session_stale` (not the session in progress for this part: started again since, or dropped when the order went back to draft), `payment_busy`; 404 `team_order_not_found`.

**Two requests at the same moment pay once**: one is answered 200, the others `deposit_already_paid` (or `balance_already_paid`). Every money request of one team order (start, complete, the admin's by-hand steps, ship, going back to draft) takes one lock per team order; one that waits more than 10 seconds is 409 `payment_busy` (nothing done; try again).

## 5. Going back to draft, deleting, and the money

- From `proof_sent` (withdraw): the proof's draft order is deleted.
- From `approved` (reopen): allowed while nothing of the deposit is authorised, captured, refunded or with a gateway. A payment that was only **started** does not block: the Medusa order is cancelled with it, and completing that session afterwards is refused (`deposit_not_due` with `status: "draft"`). Otherwise 400 `not_allowed` **`payment_in_progress`** with `status` and `deposit` (the part's state). After the deposit is paid it stays `team_order_not_reopenable` (status `deposit_paid`).
- A completion and a reopen at the same moment: exactly one wins; the money always agrees with the status (paid and `deposit_paid`, or nothing captured and `draft` with the order cancelled).
- A team order deleted after going back to draft: its payment routes are 404 `team_order_not_found`.

## 6. Admin

`GET /admin/team-orders/:id` gains **`money`**: the store's answer of GET `.../payments` (`team_order`, `cost`, `payments`, `order`), `null` for a draft, or `{ error }` when it could not be read (the page still loads). The order page shows the lines, delivery, rush, tax and total, the deposit and the balance with their states, what is paid and outstanding in the region's currency, and a link to the Medusa order (whose own page shows the placeholder payments).

`POST /admin/team-orders/:id/steps`:

| Status | `actions` offered |
| --- | --- |
| `approved` | `deposit_by_hand` "Mark the deposit as received by hand" (while the deposit is not paid) |
| `deposit_paid` | `start_production` |
| `in_production` | `ask_balance` (emails the organizer, with the payment link) |
| `balance_due` | `balance_by_hand` "Mark the balance as received by hand" while the balance is not paid; **`ship` only once it is paid** |

- **The by-hand steps record real money**: they capture the part's placeholder payment for its amount, in the admin user's name (Medusa keeps who and when on the capture). The deposit then moves the order to `deposit_paid` (recorded `actor: "admin"`, `by_hand: true`); the balance is recorded `balance_received_by_hand`. Marking a part that is paid: 400 `step_not_allowed`.
- **`ship` before the balance is paid: 400 `not_allowed` `balance_not_paid`** (with `status` and `action`).
- Medusa's own "Mark as paid" on the order page works too: a capture naming an admin makes the same by-hand step (a subscriber on `payment.captured`).

## 7. Emails

`team-order-deposit-due` (at signing) and `team-order-balance-due` (at `ask_balance`) now link to the order's payment page: `STOREFRONT_URL` + the store setting `team_order_payment_path` (placeholder **`/[countryCode]/account/team-orders/[id]/pay`**; `[countryCode]` is the region's country, lower case). Text: "You can pay it in your account: <link>" (a link in the html). **The amount is not in the text**: it is in the email's stored data (`payload.amount: { value, currency_code }`) for the founders to decide whether the wording states it. Still sent once each, through `team_order_email`. When the link cannot be made the old sentence ("We will send you the payment details separately.") is used.

## 8. Settings (Store `metadata`; the seed writes them when missing)

| Key | Placeholder | Meaning |
| --- | --- | --- |
| `team_order_deposit_percentage` | 50 | The deposit's share of the total, in percent (above 0, at most 100). The founders' decision. |
| `team_order_payment_path` | `/[countryCode]/account/team-orders/[id]/pay` | The storefront's payment page of a team order (must start with `/` and hold `[id]`). |

A missing or invalid value is a 500 naming the key on the payment routes. Existing databases need `npm run migrate` (columns `order_id`, `deposit_collection_id`, `balance_collection_id`, `deposit_percentage` on `proof_approval`) and `npm run seed`.

## 9. What is not built

- **Real gateways** (Stripe, JazzCash, Easypaisa): only `pp_system_default`. The shape is ready: `session.data` and `next.type: "redirect"`, the complete route on return, and the gateway's webhook (Medusa's `processPaymentWorkflow`) firing `payment.captured`, which makes the step.
- **Refunds**: Medusa's own refund route works on either payment; what a refund means for the team order (status, a cancelled order's deposit) is not decided. A refunded balance counts as not paid (shipping is refused again).
- **Cancelling**: Medusa's own order cancel is not tied to the team order (its status stays; payments are then refused with `order_canceled`).
- **Cash on delivery** for team orders, the fit kit's refundable deposit, the storefront's payment page.
- **Business questions open** (see the report): whether an add-on is paid in full at once or ships without a delivery fee of its own; what happens to a deposit when an order is cancelled; who pays a failed transfer's fee; how long a quoted price holds.
