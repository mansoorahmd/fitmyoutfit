# 011 How the rush charge is kept in a cart

12 Nov 2026 · coordinator. Technical choices for task S1-6, taken before the backend work started; corrected on 16 Nov after the build and QA's thirteenth review.

## Context

The promise is delivery in 15 days, or 10 with paid rush (CLAUDE.md). The founder set rush as a percentage (`rush_percentage`, placeholder 20). Sprint 0 seeded a "Rush Production" product of kind `rush_add_on` with no fixed price, and the cart page specification already draws rush as a line of its own.

The charge has to follow the cart: it changes when pieces are added or removed, when the region and currency change, and when a discount applies. It also has to be a figure the customer cannot set.

## Decisions

1. **Rush is one cart line of the seeded rush product,** quantity 1, with a unit price the server sets. It then appears in Medusa's totals, the order, the admin and later invoices with no special handling, and "does this cart hold rush" is one question with one answer.
2. **The base is the garment lines after item discounts, before delivery and tax.** The fit kit is a refundable deposit and delivery is not production work, so neither is charged for rush. Rounded half up to the currency's smallest unit.
3. **The rule is a plain TypeScript module** in `backend/src/lib/rules/` (base, percentage, rounding, when rush is available), with its own tests. Medusa code around it stays thin.
4. **Two small store routes add and remove it** (`POST` and `DELETE /store/carts/:id/rush`). Medusa's own add-line and change-quantity routes refuse the rush product, so its price and quantity never come from the customer.
5. **The server prices the line again after every cart change and once more at completion.** Corrected after the build: a completion cannot always go through. When the price changes at that moment Medusa drops the payment session, and when another request changes the cart during completion the order would be built from a snapshot with the new garments and the old rush price; in both cases the completion is refused once (400 or 409) and repeated. What holds without exception is that no order carries a rush charge other than the rule's (QA: about 470 orders from races, percentage changes, promotions, region moves and rounding cases, none wrong).
6. **A percentage of 0 means rush is not offered.** That gives the founder an off switch in the admin without a second setting.
7. **The kept delivery promise of an order with a rush line uses the rush days.** `delivery_promise.applies` says which date holds, on the cart's rules route and on the order.

## Alternatives rejected

- **A rush shipping option with a calculated price:** rush is about production time, not the carrier, and a cart has one shipping method per shipping profile, so it would be tangled with "Delivery in Pakistan" and the duty-paid export option.
- **A flag in the cart's metadata, with the charge added only at completion:** the cart total, the cash-on-delivery limit and every summary the customer sees would be wrong until the last step.
- **A fixed-price rush product in several price steps:** the founder asked for a percentage.

## How it is built (the developer's choice, checked by QA)

- **After every cart change:** a handler on `refreshCartItemsWorkflow`'s hook `beforeRefreshingPaymentCollection` (`backend/src/workflows/hooks/refresh-cart-items-rush.ts`) prices the rush line. Medusa runs that workflow inside the cart's lock at the end of add-to-cart, line update, line delete, cart update (region, currency, `promo_codes`), add shipping method and transfer to a customer. The hook comes after prices, taxes and promotions and before the payment collection takes the total. One handler covers every Medusa route that refreshes the cart, including future ones; that is why hooks were chosen over wrapping routes.
- **Promotions routes:** Medusa's `POST` and `DELETE /store/carts/:id/promotions` do not refresh items, so a route of ours at the same path replaces Medusa's handler, runs `updateCartPromotionsWorkflow`, prices the rush line and refreshes the payment collection under the cart lock.
- **At completion:** a middleware prices the line once more under the lock; then `completeCartWorkflow.hooks.validate` checks the rush line on the very snapshot the order is built from and refuses with 409 if it differs. The second check is needed because without Redis the lock is in memory, one per server (QA, two servers, 150 rounds: 34 completions refused by this check, none wrong).
- **The rule** is `backend/src/lib/rules/rush-charge.ts` with `exact-amount.ts` (exact decimal arithmetic), plain TypeScript with unit tests.

## Re-check on every Medusa upgrade

1. The hook still exists, after promotions and before `refreshPaymentCollectionForCartWorkflow`, and that workflow still re-reads the cart total.
2. Which workflows call `refreshCartItemsWorkflow`.
3. Whether Medusa's promotions route now refreshes items; then delete ours. Compare it with `@medusajs/medusa/dist/api/store/carts/[id]/promotions/route.js`.
4. `updateCartWorkflow` still deletes only custom-priced lines on a region change; the rush line must stay non-custom.
5. `completeCartWorkflow` still builds the order from the same cart data it passes to `hooks.validate`.
6. The lock-timeout message is still `Failed to acquire lock for key`.
7. The store line-item validators still refuse `unit_price`.
8. Medusa's error handler still replaces the message of every 409; our own sentences for a conflict never reach a client.

## Consequences

- **The storefront must repeat a refused completion** (400 "Payment sessions are required", 409, rarely 404 naming a payment session): create the payment session again and complete. The contract lists the three answers.
- **The rush product now has a price of 0 per currency** (a placeholder Medusa needs to add the line; never charged). It is still returned by `GET /store/products` like before, now at 0; it cannot be bought through the store API, and the storefront shows no page for it. In the admin, staff who add it in an order edit get a line at 0.
- **An order's promise is fixed at placement.** QA found that an order edit removing or adding the rush line rewrote the promised date with today's settings. Decided 16 Nov and built in S1-6b: a later order edit never changes the kept promise; which date applied is judged from the lines the order was placed with (its first item version; an order converted from a draft keeps its kept promise's own date). Changing a placed order's speed is a manual matter until team orders (M2) define it.
- Tax on the rush line follows the product's tax settings like any other line; M1 shows "Tax not final". Tax-inclusive prices are unit-tested only; the seed has none.
- Team orders (M2) will need the same rule against the deposit and balance; the plain module can be called with any list of lines.
- The percentage, and whether rush is charged on the garments only, are the founder's to change later; both are data or one rule, not spread through the code.
- **Open:** a promotion with a cart-total rule counts the rush line when it is applied; a cart completed by a payment provider's webhook with a stale rush price is refused after payment (with the M3 webhook item in decision 010).
