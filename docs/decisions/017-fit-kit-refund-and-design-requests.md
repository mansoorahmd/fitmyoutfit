# 017: The fit kit's refund and the design-help queue

Date: 23 Nov 2026. Status: decided by the coordinator (technical), from the build of task M3-5; on `master`. The interface is in [the contract](../contracts/m3-design-help-and-fit-kit.md). The business rules it leaves open are listed at the end for the founders.

## Context

The founders promise fit kits as a refundable deposit and free design help for teams (CLAUDE.md, "Promises"). dev-plan.md (M3) asks for an admin action "kit returned: refund the deposit" and a design-help request form with a queue for our designer. Until M3-5 the fit kit was an ordinary product with nothing to give its money back, and there was no way to ask for design help.

Two things made the choices below matter later: a refund moves real money once a gateway is in place, and the design-help form is the store's first route that a stranger with no account can write to.

## Decision

**The fit kit's refund**

- A kit is an order line whose product has `metadata.kind` `fit_kit`. No new product type.
- The amount is never typed by staff and never read from the request: a plain rule module (`backend/src/lib/rules/fit-kit-refund.ts`, no Medusa import) works it out from the kit lines' own total, split across the kits and rounded half up to the currency's smallest unit so that the shares add up to the line. It never takes a garment's money, delivery or rush, and never more than the payment still holds.
- The money goes back through Medusa's own `refundPaymentWorkflow` on the payment that paid, with an idempotency key made from the order and the range of kits. The order's refund transactions are Medusa's, so a real gateway later uses the same call.
- Each return is one row in our own table `fit_kit_refund` (module `fitKitRefund`): how many kits, the exact amount, the method, who pressed, when.
- Cash on delivery has no payment to refund: the action records "refund by hand" and moves no money.
- The action runs under the order's cash lock of decision 010, which Medusa's cancel route also takes, so two presses refund once and a cancel never interleaves with a refund.
- The return window is a setting, `fit_kit_return_days` (0 or absent: no limit), written by the seed.

**The design-help queue**

- Our own module `designRequest` with three tables: the request, the record of its status changes, and the record of its confirmation email.
- The statuses and the allowed moves (new, in progress, proof sent, done; one step forward or back, and done back to in progress) are a plain rule module (`backend/src/lib/rules/design-request.ts`).
- `POST /store/design-requests` is open. It is guarded by: a 16 KB body limit; a trap field a person never fills in (a request with it filled is dropped and answered like a real one); three limits counted in the database under advisory locks (per network address, per email address, overall), all answered with one identical 429; one answer for every email address, so the route never says whether an address is known.
- The network address is kept only as a salted hash, read with the same `TRUSTED_PROXY_HOPS` logic as proof signing.
- What a stranger typed is shown to staff as plain text; links are shown as text, not as links.
- Reference pictures are links only. There is no file upload.
- One confirmation email per request, sent through a record with a unique key; logged in development and tests, withheld elsewhere until an email provider is chosen (decision 002).

## Alternatives

- **Medusa's return and claim flow for the kit.** It models goods coming back into stock with a return shipment. The kit's money is a deposit; staff only need "it came back, give the money back". Rejected as more steps for staff and more surface than the promise needs.
- **Staff type the refund amount in Medusa's own refund dialog.** Nothing ties that amount to the kit or stops a garment's money going back. Kept available (it is Medusa's), but the action above is the one staff are shown. A refund made there that leaves the payment holding less than the kit's refund is refused (`payment_refunded_elsewhere`); one that leaves enough is not noticed.
- **Rate limits in memory or in Redis.** Memory does not survive a restart or a second instance; Redis is optional in our setup (scratch backends run without it). The database is always there.
- **A captcha on the form.** Needs a third party and a decision on which one. The trap field and the limits come first; a captcha can be added in front later.
- **File upload for reference pictures.** Needs storage and a scan for an open route. Later.

## Consequences

- After a kit refund Medusa's order page shows "Credit lines" for the refunded amount and a lower "Paid total". That is Medusa's refund workflow, not our code. Accounts must know how to read it (question 8).
- The per-address limit is only right when `TRUSTED_PROXY_HOPS` is set for the deployment; without it every visitor looks like the proxy. This goes on the deployment checklist.
- The rule assumes one payment holds the kit's money; with several payments the first with enough left is chosen. A real gateway with split payments needs a look.
- If the payment is refunded and the record then fails to save, staff are told not to press again. A second press would carry the same idempotency key, which Medusa's refund workflow honours (it looks the refund up by the key), so it should not refund twice. No test covers that retry yet.
- A failed confirmation email is not retried: the row says `failed`.
- A design request is not linked to a team order.
- Existing databases need `npm run migrate` and `npm run seed`.

## Questions for the founders (a simple behaviour is built for each meanwhile)

1. Is delivery paid for a fit kit refunded too? Built: the kit lines only.
2. How long does a customer have to send the kit back? Built: no limit; the setting exists.
3. May the kit's deposit be credited against a team order instead of refunded? Built: refund only.
4. How soon does the designer answer a design-help request? Built: no time promised anywhere.
5. May the confirmation email go to any address typed, without an account? Built: yes, bounded by 3 per email address per day.
6. The open form's limits are placeholders: 5 per address per hour, 3 per email address per day, 300 in all per hour.
7. Who pays a cash-on-delivery customer back for a kit, and how? Built: only the record.
8. Is it acceptable for accounts that a kit refund shows on Medusa's order page as credit lines?
