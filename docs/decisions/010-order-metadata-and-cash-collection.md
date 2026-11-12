# 010 What an order keeps: the promised delivery date and cash collected

12 Nov 2026 · coordinator. Technical choices taken after QA's seventh and eighth reviews (tasks S1-1b and S1-1c), brought up to date after the tenth (task S1-1d, merged 12 Nov).

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
3. **Reserved keys are refused at the door.** `POST /store/carts` and `POST /store/carts/:id` answer HTTP 400 when `metadata` contains `delivery_promise` or any key starting with `cod_`. Since S1-1d the completion hook no longer refuses a cart for its metadata: once cash collection left the metadata, a `cod_` key on a cart records nothing, and the refusal contradicted decision 2.
4. **Order metadata is written one key at a time with SQL,** and only if the key still holds what was read (compare-and-set), in `backend/src/workflows/order-metadata/write-order-metadata.ts`. Medusa's own `updateOrders` reads the metadata, merges it in code and saves it whole, so two writers at once drop each other's key. Every value is passed as a parameter. Since S1-1d only the promised date is written this way.
5. **Cash collected: capture first, then record the slip once.** The capture is its own finished run of Medusa's `capturePaymentWorkflow`, not a step of a larger workflow, which would undo the capture's order transaction if the record failed. The record is a row in a table of its own (module `cash-collection`, table `cash_collection`), one per order by a unique index, so exactly one recording wins on any number of server instances and Medusa's whole-metadata saves cannot touch it. A payment captured with Medusa's own button can still have its slip recorded once, without a second capture. A partly captured payment is not "collected": recording the slip captures the exact rest first, because Medusa 2.22.6's own button always asks for the full amount and is refused once part is captured.
6. **Who recorded it is not kept where a customer can read it** (founder, 12 Nov). The panel reads who captured from Medusa's capture record. The slip reference and the time are in the cash-collection record, not in the order's metadata, so a customer's order routes do not return them.
7. **The slip reference rule stays loose** (founder, 12 Nov): 1 to 64 characters with at least one letter or digit. Control characters, line breaks, tabs and invisible format characters are refused, not silently changed. So are every Unicode default-ignorable character (Hangul fillers, variation selectors and the like), the Braille blank, private-use and unassigned characters, and a combining mark that is not on a letter or digit.

## Alternatives rejected

- **Keeping the promise on the cart and checking it at completion:** this is what was forged, and it fails for every completion that does not go through the store route.
- **A lock in the application for cash collection:** it does nothing across two server instances; the database statement does.
- **Medusa's `updateOrders` for metadata:** loses keys under concurrent writes.

## Consequences

- **A deliberate coupling to Medusa's `order` table** (its name, and its `metadata`, `updated_at` and `deleted_at` columns), now for the promised date only. The read route also reads the order's cart through Medusa's order-cart link. Check both on every Medusa upgrade.
- **The kept promise (corrected in S1-1d).** "Must match the order's creation date" did not stop QA's forged case, which was based on the creation date with `days: 1`. A kept promise is trusted only if it is based on the creation date, for the date that applies, and is not identical to a promise the order's cart carried. Remaining edge: a cart copy that equals the server's answer exactly cannot be told from the server's own write, so after a change of the days setting the next read works it out again (QA saw 15 days become 12 and stay 12). Only carts written before the reserved-key refusal can carry a promise; they exist in development databases only.
- **A Medusa defect, seen by QA in the tenth review, not caused by our code:** two captures of the same payment at the same moment (for example "Mark cash as collected" on a partly captured payment against a part capture through Medusa's own route, or two of Medusa's own captures) can leave an extra capture transaction on the order: the captures add up correctly, but the order shows more paid than was captured (8 of 40 rounds; 9 of 32 with Medusa's routes alone). Our presses against each other never caused it. To do: the panel compares the order's capture transactions with the payment's captures and warns staff; report it to Medusa.
- **Orders recorded before S1-1d keep `cod_*` keys in their metadata** (development databases only). The next backend task moves them into the table and removes the keys.
- **A cancelled or refunded order** still shows "Collected" in the panel, and a slip can be recorded on a refunded payment. To be corrected in the next backend task.
- **Open for M3, with the first real payment gateway:** when a provider's webhook reports a payment and the completion hook refuses the cart (for example it dropped below the minimum), no order is created, and a later "captured" webhook still captures the money. The checks must pass before payment starts, and a refused completion after payment needs a refund or an alert. Cash on delivery and the placeholder payment have no webhook, so M1 is not affected.
- The subscriber has not been seen on the Redis event bus (workers and QA run without Redis). It is checked on the preview after the merge.
