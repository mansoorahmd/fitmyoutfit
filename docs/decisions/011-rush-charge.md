# 011 How the rush charge is kept in a cart

12 Nov 2026 · coordinator. Technical choices for task S1-6, taken before the backend work starts. Corrected when the task is accepted.

## Context

The promise is delivery in 15 days, or 10 with paid rush (CLAUDE.md). The founder set rush as a percentage (`rush_percentage`, placeholder 20). Sprint 0 seeded a "Rush Production" product of kind `rush_add_on` with no fixed price, and the cart page specification already draws rush as a line of its own.

The charge has to follow the cart: it changes when pieces are added or removed, when the region and currency change, and when a discount applies. It also has to be a figure the customer cannot set.

## Decisions

1. **Rush is one cart line of the seeded rush product,** quantity 1, with a unit price the server sets. It then appears in Medusa's totals, the order, the admin and later invoices with no special handling, and "does this cart hold rush" is one question with one answer.
2. **The base is the garment lines after item discounts, before delivery and tax.** The fit kit is a refundable deposit and delivery is not production work, so neither is charged for rush. Rounded half up to the currency's smallest unit.
3. **The rule is a plain TypeScript module** in `backend/src/lib/rules/` (base, percentage, rounding, when rush is available), with its own tests. Medusa code around it stays thin.
4. **Two small store routes add and remove it** (`POST` and `DELETE /store/carts/:id/rush`). Medusa's own add-line and change-quantity routes refuse the rush product, so its price and quantity never come from the customer.
5. **The server prices the line again after every cart change and once more at completion.** Completion is not refused for a stale rush price; it is corrected (the same principle as decision 010, point 2: an order is not refused for something the server can put right).
6. **A percentage of 0 means rush is not offered.** That gives the founder an off switch in the admin without a second setting.
7. **The kept delivery promise of an order with a rush line uses the rush days.** `delivery_promise.applies` says which date holds, on the cart's rules route and on the order.

## Alternatives rejected

- **A rush shipping option with a calculated price:** rush is about production time, not the carrier, and a cart has one shipping method per shipping profile, so it would be tangled with "Delivery in Pakistan" and the duty-paid export option.
- **A flag in the cart's metadata, with the charge added only at completion:** the cart total, the cash-on-delivery limit and every summary the customer sees would be wrong until the last step.
- **A fixed-price rush product in several price steps:** the founder asked for a percentage.

## Consequences

- The mechanism that prices the line after each cart change is Medusa-specific (the developer chooses between workflow hooks, route middleware or wrapping the cart routes, and records the choice here). It must be checked on every Medusa upgrade.
- Tax on the rush line follows the product's tax settings like any other line; M1 shows "Tax not final".
- Team orders (M2) will need the same rule against the deposit and balance; the plain module is written so that it can be called with any list of lines.
- The percentage, and whether rush is charged on the garments only, are the founder's to change later; both are data or one rule, not spread through the code.
