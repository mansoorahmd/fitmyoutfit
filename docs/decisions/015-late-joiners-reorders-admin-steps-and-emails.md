# 015: Late joiners, reorders, the admin's steps and the emails for team orders

Date: 22 Nov 2026. Status: decided by the coordinator (technical); built in task M2-3 and on `master`. Two numbers and the email wording are placeholders for the founders (listed at the end).

## Context

dev-plan.md (M2) asks for late joiners ("the addition becomes a linked add-on order"), reorders from a past team order with the same design version, admin pages with buttons to change status, and emails to the organizer. Payments do not exist yet (a later milestone). The contract is `docs/contracts/m2-team-orders.md`.

## Decision

1. **A late joiner is its own team order, linked to the first one** (`kind: add_on`, `linked_order_id`). It has the same design version, product and region, its own team list, its own proof and signature, and later its own payment. The first order and its signed proof are never changed by it.
2. **An add-on's list is also checked against the numbers already taken:** the first order's signed list, and the other add-ons whose proof is out or signed. The rules package takes the taken numbers as an input and answers with the codes `number-taken-first-order` and `number-taken-add-on`, saying where the number is taken. A draft add-on takes no number yet.
3. **An add-on has a minimum of its own,** the region setting `addon_min_garment_quantity`, written by the seed (the region's ordinary minimum would refuse one late player).
4. **An add-on cannot have add-ons.** While a first order has add-ons it cannot go back to draft, and an order with add-ons or reorders cannot be deleted, because they depend on its signed list.
5. **A reorder is a full team order** (`kind: reorder`) with the same design version, linked to the order it came from. Its lines are copied from the source's **signed** proof (all, none or chosen positions), never from a later draft. The region's ordinary minimum applies and its numbers are checked within itself only.
6. **Every status step is recorded** (table `team_order_step`: who, from, to, when, and whether it was made by hand), in the same transaction as the step. The admin's detail page shows the record.
7. **Until payments exist, the admin marks payments by hand.** "Mark the deposit as received by hand" is the by-hand form of `approved → deposit_paid`; "Mark the balance as received by hand" is a recorded note at `balance_due` and changes no status. The admin's other steps (`deposit_paid → in_production → balance_due → shipped`) use the rule module of decision 014; a step the rules refuse is not offered.
8. **The emails are sent once each, kept by a record, not by memory** (table `team_order_email`, a unique key per email and moment, claimed before sending). A failed send never fails the organizer's request; the daily job retries it. The reminder's key includes the latest day to sign, so a changed need-by date is reminded of again.
9. **Reminders go exactly 3 days and 1 day before the latest day to sign,** on the store's day (setting `schedule_time_zone`); when the standard day is past and rush still works, the rush day is used and the email says so. A missed day is not caught up.
10. **Outside development and tests nothing is sent yet** (no email provider is set up; decision 002): no record is made and one warning without personal data is logged. In development the email is written to the log, as for the password reset.
11. **The payment emails carry no amounts** and say that payment details follow from us.

## Alternatives considered

- **Adding late players to the signed list.** Rejected: it would change what the organizer signed.
- **Reorders copied from the source's current rows.** Rejected: the rows can change after signing; the signed proof is what was made.
- **A status between `balance_due` and `shipped` for "balance received".** Not added: the plan's flow has none; the payments milestone decides how the balance gates shipping.
- **Sending emails inside the request and failing it when the send fails.** Rejected: the organizer's signature must not depend on an email provider.

## Consequences

- **Shipping does not yet require the balance.** The plan says the balance is paid before shipping; today the admin can ship from `balance_due` without the by-hand note. The payments milestone must close this.
- **Two add-ons that make their proofs at exactly the same moment with the same number can both pass** (each sees the other as a draft). Rare (one organizer, two tabs); to be closed with a lock if QA finds it reachable in practice.
- Existing databases need `npm run migrate` and `npm run seed` after this change.
- The admin pages were looked at under `medusa develop` only; a production-mode start of the admin is untried.
- The storefront (M3) must show `kind` and `links`, the two new problem codes and the new refusal codes.

## Placeholders for the founders (not asked now; kept as data)

- The add-on minimum: **1 piece** in every region (`addon_min_garment_quantity`).
- The time of the daily reminder job: 04:00 server time.
- The wording of the five emails (`backend/src/lib/content/team-order-emails.ts`), marked as drafts.
