# 016: The deposit and the balance of a team order: one Medusa order, two payment collections

Date: 23 Nov 2026. Status: decided by the coordinator (technical), from the spike and the build of task M3-3; on `master`. Written by the backend developer, checked and filed by the coordinator. The business rules it leaves open are listed at the end for the founders.

## Context

The founders decided that the organizer of a team order pays **50% at proof approval and 50% before shipping** (CLAUDE.md, "Team orders"; critiques/DECISIONS.md). Until M3-3 a team order carried no money: no price, no Medusa order, no payment; an admin marked the deposit "received by hand" and could ship without the balance (decision 015, "Shipping does not yet require the balance").

dev-plan.md (M3) asked for a spike first: can Medusa v2 take two payments on one order, either as (a) two payment collections or (b) one order with an outstanding amount paid in two captures; if neither works cleanly, (c) one draft order with a payment link for the deposit and a second link for the balance.

"Cleanly" (the brief): the order's totals, tax and shipping lines come from Medusa's own pricing for the region; each payment is a real Medusa payment with the placeholder provider (`pp_system_default`), authorised and captured through Medusa's workflows; the order shows as partly paid and then paid on the admin's own order page; a refund of either part is possible later; and nothing leans on undocumented internals more than decision 011 does.

## What was tried (evidence)

A throwaway integration spec against a fresh, seeded test database (Medusa 2.22.6; the spec is not committed; its output was kept by the developer as `spike2.log`). One team of 20 jerseys (7 M, 13 L) plus a rush line, in Pakistan and in the United Kingdom:

1. **The order, priced by Medusa.** `createOrderWorkflow` with `status: "draft", is_draft_order: true` (what Medusa's own `POST /admin/draft-orders` runs), the region, the customer, the jersey variants by size, and one shipping method: the region's shipping option with its price read from Medusa's pricing (`query.graph` of `shipping_option` with `calculated_price` in the region's currency). Then `convertDraftOrderWorkflow`. Result: Pakistan `pending`, `not_paid`, total PKR 71,484 (20 × 3,500 + delivery 250 + rush); UK total GBP 1,674, delivery "Shipping & duties included" at 0. About 300 ms per order. Tax lines are made by Medusa (`updateOrderTaxLinesWorkflow`, again at conversion); with today's seed there are no tax rates, so tax is 0 ("tax not final" stays).
2. **Two payment collections** with `createOrderPaymentCollectionWorkflow` (Medusa's documented workflow, `{ order_id, amount }`, used by its admin route): one for half the total, one for the rest. Payment status still `not_paid`; `summary.pending_difference` = the total.
3. **The deposit** as the organizer would pay it: `createPaymentSessionsWorkflow` (placeholder provider), authorisation of the session, `capturePaymentWorkflow`. Payment status **`partially_captured`**, `paid_total` = the deposit, `pending_difference` = the balance; the same on `GET /admin/orders/:id` (what the admin's order page reads).
4. **The balance** marked as paid the way Medusa's own "Mark as paid" does it (`markPaymentCollectionAsPaid`, with `captured_by`). Payment status **`captured`**, `pending_difference` 0.
5. **A refund** of part of the deposit with `refundPaymentWorkflow`: payment status `partially_refunded`. Either part can be refunded on its own payment.

Also read in Medusa's source (2.22.6): `getLastPaymentStatus` counts payment collections (one fully captured of two is "partially captured"); a capture on a collection linked to an order adds the order's payment transaction (`capturePaymentWorkflow`) and emits `payment.captured`; the capture keeps `captured_by` as its `created_by`; creating a payment session deletes the collection's earlier sessions; a collection with a session is `awaiting`, which Medusa's `markPaymentCollectionAsPaid` refuses (it accepts `not_paid` only).

(b) **One order, one collection, two captures** was not built: it needs the whole amount authorised at approval and the rest captured two weeks later. Card authorisations lapse in about 7 days, and JazzCash and Easypaisa take payments, not authorisations; the placeholder provider would hide that. Rejected on that ground, without a run.

(c) **The fallback** turned out to be the same machinery as (a): in Medusa v2 a "payment link" is a payment collection of an order (draft or not) that the customer pays through a session. Nothing extra to choose.

## Decision

1. **(a): one Medusa order per signed proof, with two payment collections, the deposit's and the balance's.**
2. **The order is priced from the proof, and the price is the one shown before signing.** The order is made as a Medusa *draft order* for the proof that is out (when the proof is made, again if the rush choice changes while it is out, and at the latest when the cost is first read or the proof is signed): one line per size (the product's variant for that size, quantity = the pieces of that size in the snapshot), unit prices from Medusa's pricing for the region (the variant's calculated price, passed to the order so the line keeps it), the region's shipping option at its Medusa price, and the rush line when the order asks for rush: decision 011's rule (`rush-charge.ts`) on those garment lines. The organizer reads exactly this order's totals before signing. At signing the draft becomes an order (`convertDraftOrderWorkflow`) and the two collections are made. **A price changed in the admin after the cost was shown does not change the order** (its lines keep their prices); tax is recomputed by Medusa at conversion (its own safety net), so a tax rate changed in between would show.
3. **The split is a plain rule** (`lib/rules/team-order-payments.ts`, unit-tested in PKR, GBP, AED and USD): deposit = total × the store setting `team_order_deposit_percentage` (seed 50) / 100, **rounded half up to the currency's smallest unit** (Medusa's `decimal_digits`: 0 for PKR, 2 for GBP, AED, USD); balance = total − deposit, so the two always add up to the total exactly. When the organizer starts a payment, an unpaid collection's amount is set again from the order's current total (a staff edit of the order changes the next payment, never a paid one); the balance is always the total less what the deposit captured.
4. **Payments go through Medusa's workflows only.** The organizer: our store route starts a session on the part's collection (`createPaymentSessionsWorkflow`) and completes it with one small workflow of ours made of Medusa's `authorizePaymentSessionStep` and `capturePaymentWorkflow`. Staff, by hand: the same, with a placeholder session made for them and `captured_by` = the admin user (Medusa's `markPaymentCollectionAsPaid` cannot be used, because it refuses a collection on which the organizer has started a session).
5. **The status steps follow the money, from one rule and one place.** `approved → deposit_paid` is made when the deposit's collection is fully captured: as the system (`team_order_step.actor = system`) when nobody is named on the capture, as an admin by hand when the capture names an admin user (our by-hand button, or Medusa's own "Mark as paid"). It runs right after our own captures, from a subscriber on `payment.captured` (any other capture, and later a gateway's webhook), and again when the order is read (so a missed event heals). **`balance_due → shipped` needs the balance's collection fully captured, less refunds** (rule `mayShip`; the admin's button is not offered; the API refuses `balance_not_paid`).
6. **One lock per team order for money.** Starting, completing, marking by hand, shipping, going back to draft and the step sync hold a PostgreSQL advisory lock per team order (the pattern of decision 010's cash lock), so two "pay the deposit" requests pay once, and a payment and a "back to draft" never interleave.
7. **Going back to draft with money involved:** refused (`payment_in_progress`) once anything is authorised or captured, or a gateway is still working on it (a session `requires_more` or `pending_authorization`). A session that was only started (placeholder `pending`, nothing taken) does not block: going back cancels the Medusa order, and completing that session afterwards is refused. Withdrawing a proof deletes its draft order.
8. **Add-ons and reorders** are team orders: each has its own Medusa order, delivery line, rush and 50/50 split. Whether an add-on should be paid in full at once, or ship in the first order's box without a delivery fee of its own, is a question for the founders (built: the same as any order).

## Alternatives rejected

- **(b) one collection, two captures:** needs a two-week authorisation; see above.
- **A cart for the team order, completed with the deposit only** (Medusa's `completeCartWorkflow` does not compare the authorised amount with the total, as its documentation says): it would run the ordinary checkout's rules (the UK minimum of 10 would refuse a one-player add-on), the rush and promise hooks of decisions 010 and 011, and leave a cart the organizer could change; and the order would exist only after the deposit.
- **Pricing beside Medusa** (our own sum of prices, delivery and tax): the brief forbids it, and the admin's order page would not show the money.
- **Creating the order only at signing:** the organizer could not see the exact total, tax included, before signing; a price changed between reading and signing would be charged unseen.
- **Our own table of payments:** the collections are Medusa's; the proof row keeps only their ids (`order_id`, `deposit_collection_id`, `balance_collection_id`, `deposit_percentage`).

## Consequences

- **A Medusa order per signed proof** appears in the admin's Orders (a draft one in Draft orders while a proof is out), with `metadata.team_order_id`, `team_order_proof_id` and `team_order_kind`. Going back to draft after signing cancels it; withdrawing a proof deletes its draft. The organizer sees it in Medusa's own `GET /store/orders` too.
- **The ordinary order's delivery promise does not apply** to these orders: the subscriber and the read route of decision 010 skip an order with `metadata.team_order_id`; the team order's promise is its signed proof's `promised_delivery_date`.
- **Seen on a running backend (the M3-3 real run):** Medusa's own order page of a team order shows the lines per size, delivery, tax 0, "Partially captured" with one placeholder payment of the deposit and "Outstanding amount" the balance, then "Captured" with two payments; it also offers its own "Copy payment link" and "Mark as paid" for the outstanding amount.
- **Staff can still use Medusa's own buttons on these orders.** "Mark as paid" on the deposit makes the by-hand step (named on the capture); Medusa's own order edit changes the total and the next unpaid part follows; **Medusa's own order cancel is not tied to the team order** (the team order keeps its status; starting a payment is then refused, `order_canceled`). A cancel after a captured deposit refunds it in Medusa (decision 010's finding) without moving the team order back. Open.
- **Refunds are not built.** What a refund needs: Medusa's refund route already works on either payment (`POST /admin/payments/:id/refund`); we must decide what a refund means for the status (a refunded deposit before production: back to `approved`? cancel?), the ship gate already counts a refunded balance as unpaid, and the fit kit's refundable deposit (M3, separate) will need the same.
- **A real gateway** plugs into the same shape: the start route returns the provider's session data (a redirect URL for JazzCash, Easypaisa or Stripe Checkout), the complete route is called on return, and the provider's webhook goes through Medusa's `processPaymentWorkflow`, whose capture fires `payment.captured`, which moves the status. Each gateway's provider module, its webhook, the region's provider links and the allowed-providers list (today `pp_system_default` only) are to be added.
- **Existing databases need `npm run migrate` and `npm run seed`** (new columns on `proof_approval`; new store settings `team_order_deposit_percentage` and `team_order_payment_path`).

## Re-check on every Medusa upgrade

1. `createOrderWorkflow` still makes a draft order from `status: "draft", is_draft_order: true`, keeps a given `unit_price`, and accepts a shipping method with `shipping_option_id`, `name`, `amount`; `convertDraftOrderWorkflow` still keeps line prices and only recomputes tax.
2. `getLastPaymentStatus` still counts payment collections (partly paid = one of two collections captured).
3. `capturePaymentWorkflow` still adds the order's payment transaction for a collection linked to an order, emits `payment.captured`, and the capture still records `captured_by` as `created_by`.
4. `createPaymentSessionsWorkflow` still deletes a collection's earlier sessions (a stale session id is then refused by our complete route).
5. `authorizePaymentSessionStep` still returns `null` for `pending_authorization` and throws for `requires_more` (our workflow skips the capture then).
6. A flat shipping option's price is still read through `query.graph` with a `calculated_price` context of currency and region.
7. Undocumented reliance, as in decision 011: the order's `metadata` key `team_order_id` (ours), the payment collection's `created_by` on captures, the payment collection statuses `not_paid`/`awaiting`/`authorized`/`completed`/`canceled` and the session statuses read by our rule.

## Questions for the founders (not decided here; each has a simple behaviour built meanwhile)

1. Is an add-on (a late joiner's order) paid in full at once, and does it ship in the first order's box without a delivery fee of its own? Built: the same 50/50 split and its own delivery line.
2. What happens to the deposit when an order is cancelled? Built: going back to draft is refused once money is taken; nothing more.
3. Who pays a failed transfer's fee? Built: nothing is charged for it.
4. How long does a quoted price hold before signing? Built: without limit (the price of the draft order made for the proof).
5. Is rush charged whenever the organizer asks for it, even when the date could be met without it? Built: charged whenever asked.
6. Do the payment emails state the amount? Built: the amount is in the email's data, not in its text.
