# 010 What an order keeps: the promised delivery date and cash collected

12 Nov 2026 · coordinator. Technical choices taken after QA's seventh and eighth reviews (tasks S1-1b and S1-1c).

## Context

Two things have to be kept with an order:

- **The delivery date that was promised** when the order was placed, so the confirmation and account pages can show it later even if the delivery-days setting changes.
- **That cash on delivery was collected:** the courier hands over a slip against the order number, and staff record its reference in the admin, which captures the payment (founder, 11 Nov).

The first version (S1-1b) wrote the promise into the cart just before completion and let Medusa copy the cart's metadata into the order. QA showed three faults:

- A customer could plant a forged date by racing a cart update against the completion (12 of 20 tries; 34 of 82 in the developer's repeat).
- A payment provider's webhook completes carts without the store route, so the order was refused after the money was taken.
- With two server instances, overlapping "mark collected" runs could lose the slip reference.

## Decisions

1. **The promised date belongs to the order, and the server writes it.** It is worked out from the order's own creation time as a date in Asia/Karachi plus the delivery-days setting at that moment. A subscriber on the order-placed event writes it, and the read route (`GET /store/orders/:id/delivery-promise`) makes sure it exists before answering. Nothing sent by the storefront or kept on the cart is trusted.
2. **Creating an order is never refused for a metadata reason.** The completion hook refuses only for the business rules (minimum quantity, cash on delivery) and for invalid settings.
3. **Reserved keys are refused at the door.** `POST /store/carts` and `POST /store/carts/:id` answer HTTP 400 when `metadata` contains `delivery_promise` or any key starting with `cod_`. The completion hook also refuses a cart that carries a staff-only key some other way.
4. **Order metadata is written one key at a time with SQL,** and only if the key still holds what was read (compare-and-set), in `backend/src/workflows/order-metadata/write-order-metadata.ts`. Medusa's own `updateOrders` reads the metadata, merges it in code and saves it whole, so two writers at once drop each other's key. Every value is passed as a parameter.
5. **Cash collected: capture first, then record the slip once.** The record is one statement that only succeeds while the order has no slip reference, so exactly one recording wins on any number of server instances. A payment captured with Medusa's own button can still have its slip recorded once, without a second capture. A partial capture is not "collected".
6. **Who recorded it is not kept where a customer can read it** (founder, 12 Nov). The panel reads who captured from Medusa's capture record. The slip reference and the time stay on the order.
7. **The slip reference rule stays loose** (founder, 12 Nov): 1 to 64 characters with at least one letter or digit. Control characters, line breaks, tabs and invisible format characters are refused, not silently changed.

## Alternatives rejected

- **Keeping the promise on the cart and checking it at completion:** this is what was forged, and it fails for every completion that does not go through the store route.
- **A lock in the application for cash collection:** it does nothing across two server instances; the database statement does.
- **Medusa's `updateOrders` for metadata:** loses keys under concurrent writes.

## Consequences

- **A deliberate coupling to Medusa's `order` table** (its name, and its `metadata`, `updated_at` and `deleted_at` columns). Check it on every Medusa upgrade; it is the one place where the backend writes to a table a Medusa module owns.
- **Still open after QA's eighth review, to be fixed soon (task S1-1d):**
  - If recording the slip fails after the capture, Medusa's order transaction for the capture is undone while the capture stays, so the order shows the amount as outstanding. The capture must run on its own, before the record.
  - An edit of the same order's metadata in Medusa's admin at the same moment can drop the slip after a "Collected" answer (8 of 25 tries). **Decided:** the cash-collection record moves out of `order.metadata` into a table of its own with one row per order, so the database guarantees one record and Medusa's whole-metadata saves cannot touch it. That also takes the slip reference out of what a customer's order list returns.
  - The read route can briefly show a promise copied from a cart created before this change, before the subscriber replaces it. The kept promise must match the order's creation date.
  - The panel's instruction for a partly captured payment cannot be followed with Medusa's own button, which always captures the full amount.
- **Open for M3, with the first real payment gateway:** when a provider's webhook reports a payment and the completion hook refuses the cart (for example it dropped below the minimum), no order is created, and a later "captured" webhook still captures the money. The checks must pass before payment starts, and a refused completion after payment needs a refund or an alert. Cash on delivery and the placeholder payment have no webhook, so M1 is not affected.
- The subscriber has not been seen on the Redis event bus (workers and QA run without Redis). It is checked on the preview after the merge.
