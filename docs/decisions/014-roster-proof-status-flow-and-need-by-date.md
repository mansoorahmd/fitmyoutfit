# 014: The roster proof, the status flow and the need-by date

Date: 22 Nov 2026. Status: decided by the coordinator (technical); built in task M2-2 and on `master`.

## Context

The organizer signs a one-page roster proof before paying (CLAUDE.md, plan.md). M2 needs a record of exactly what was signed, a status flow for the team order, and a need-by date worked backwards from the delivery promise (15 days from proof approval, 10 with paid rush: placeholders kept as data since M1). The contract is `docs/contracts/m2-team-orders.md`.

## Decision

1. **A proof is a frozen snapshot with a hash.** Making a proof stores the design version, product, region, team name, the printed fields and every line in order as one canonical JSON text (fixed key order, no white space, text cleaned like stored lines, digits as written) with its SHA-256. `hashSnapshot` in `@fitmyoutfit/team-rules` computes the same text and hash in a browser, so the storefront can show and check what is being signed.
2. **The organizer signs a hash, not "the current list".** The signature request carries the hash of the proof the organizer looked at; the server refuses when it is not the proof on record. It also stores the typed name, the customer, the time and the request's IP address. Signing twice records once; two requests at the same moment record one signature.
3. **Every proof ever made is kept** (table `proof_approval`, statuses `sent`, `signed`, `withdrawn`, `replaced`), numbered within its team order. Nothing is deleted when the organizer goes back to change something.
4. **The status flow is a plain rule module** (`backend/src/lib/rules/team-order-status.ts`): `draft → proof_sent → approved → deposit_paid → in_production → balance_due → shipped`, with who may make each step. The organizer may go back to `draft` from `proof_sent` (the proof is withdrawn) and from `approved` (the signed proof is replaced and a new one must be signed), **but not after the deposit**.
5. **The order's status says what is frozen; a line has no `locked` flag.** While a proof is out or signed, the team list, the team name and the design version cannot be changed. The `locked` column that dev-plan.md lists for a roster line was never used and is dropped: one source of truth.
6. **The need-by date never refuses an order for being late.** The server works out the latest day to sign for standard and for rush delivery and a state (`ok`, `needs_rush`, `cannot_be_met`, `none`); the storefront offers rush. Only a date in the past is refused.
7. **The organizer cannot sign under a wrong expectation.** The signature request carries the schedule state the organizer was shown; when the server's state for today differs, nothing is signed and the current schedule is returned. The signed proof records the state, the need-by date, the rush choice and the promised delivery date.
8. **Days are calendar days, the signing day is day 0,** as for an ordinary order's delivery promise. "Today" is the store's day in one time zone, the store setting `schedule_time_zone` (placeholder `Asia/Karachi`, written by the seed).
9. **The IP address stored with a signature is the connection's own by default.** `X-Forwarded-For` is trusted only as far as `TRUSTED_PROXY_HOPS` says (the N-th entry from the right), because entries further left are written by the client. The address is never in a store answer or a log line.
10. **Rush for a team order is a stored choice (`rush_requested`);** charging for it belongs to the payments milestone.

## Alternatives considered

- **Signing "whatever is on record now".** Rejected: a list changed in another tab between looking and signing would be signed unseen.
- **A `locked` flag per line.** Rejected: it could disagree with the order's status.
- **Refusing a need-by date that cannot be met.** Rejected: the organizer may still want the kit a few days late; the plan asks to warn and offer rush.
- **Trusting the left-most `X-Forwarded-For` entry.** Rejected: the client writes it.

## Consequences

- **Existing databases need `npm run migrate` and `npm run seed`** after this change; without the `schedule_time_zone` setting a team-order answer is a 500 that names the key.
- **`TRUSTED_PROXY_HOPS` must be set for the real host** (Railway); the right number is not yet verified. Until then a signature made behind a proxy records the proxy's address.
- The ordinary checkout's delivery promise still uses its own time-zone constant, not the new setting. To be joined later.
- Deleting a draft team order leaves the proofs it once had in the database, unread.
- The admin's steps and the payment system's step exist in the rule module and have no route yet (M2-3 and the payments milestone).
- dev-plan.md's model table still lists `locked` on a roster line; this decision replaces it.
