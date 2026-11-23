# Contract: free design help and the fit kit's refund (M3-5), as built

Status: **as built in task M3-5, on `master` since 23 Nov 2026.** Written by the backend developer from the code and its integration tests (`backend/integration-tests/http/design-requests.spec.ts`, `fit-kit-refund.spec.ts`), filed by the coordinator. The reasons are in [decision 017](../decisions/017-fit-kit-refund-and-design-requests.md). Business rules that are not settled are in section 7, as questions for the founders. The storefront's form (task M3-5b) is built against section 2.

## 1. What the storefront builds against

Only the design-help form is for the storefront. The fit kit's refund is an admin action; the storefront needs nothing for it (the kit is the ordinary `fit-kit` product).

## 2. The design request

A team (no account needed) sends a short form; our designer works through a queue in the admin.

### 2.1 `POST /store/design-requests` (open)

Needs the publishable API key header like every store route. No sign-in needed. If the visitor is signed in (customer bearer token or session), the request is linked to them. A token that is not a customer's, or of a deleted customer, counts as a visitor.

Body (JSON, at most 16 KB):

| Field | Required | Rule |
|---|---|---|
| `team_name` | yes | 1 to 100 characters, one line, a letter or digit in it |
| `contact_name` | yes | 1 to 100 characters, one line |
| `email` | yes | `name@host.tld`, at most 254 characters |
| `region` | yes | `pk`, `gb`, `ae` or `us` |
| `message` | yes | what they want, 10 to 2000 characters, line breaks kept |
| `phone` | no | phone or WhatsApp, 7 to 15 digits, `+ - ( ) .` and spaces allowed |
| `product` | no | `jersey`, `t-shirt`, `jacket` or `other` |
| `pieces` | no | whole number 1 to 10000 |
| `need_by_date` | no | `YYYY-MM-DD`, a real date, today (Asia/Karachi) or later |
| `reference_links` | no | up to 3 links to reference pictures, each `http://` or `https://`, no user name or password in it, at most 500 characters |
| `website` | no | **a field a person never fills in.** Hide it in the form (not `display:none` only: also `tabindex=-1`, `autocomplete=off`, no label read by screen readers). A request that has it filled in is dropped and answered exactly like a real one. |

Text is cleaned as the roster's text is: Unicode NFC, invisible direction marks removed, white space made one space. Urdu and Arabic text is kept. A control character (a line break in a one-line field, a NUL character) is refused. **There is no file upload.** Uploads need storage and a malware scan and come later: reference pictures are links only. Other fields in the body (`status`, `customer_id`, `reference`...) are ignored.

Answer `201`:

```json
{ "design_request": { "reference": "DR-7G47F665", "status": "new", "status_label": "Received" } }
```

The answer is the same shape for every email address: it never says whether the address is known to the store. Nothing a visitor sent is returned. Show the reference and say "we received your request" (no response time is promised).

Refusals (`{ type, code, message, field? }`; `message` is a sentence for the visitor):

| HTTP | `code` | When |
|---|---|---|
| 400 | `team_name_invalid`, `contact_name_invalid`, `email_invalid`, `phone_invalid`, `product_invalid`, `pieces_invalid`, `need_by_date_invalid`, `need_by_date_in_past`, `region_invalid`, `message_invalid`, `reference_links_invalid` | the field named in `field` (the first problem in form order) |
| 400 | `text_contains_null_character` | a NUL character in any text |
| 413 | `request_too_large` | body over 16 KB |
| 429 | `rate_limited` | too many requests: 5 per network address per hour, 3 per email address per 24 hours, 300 in all per hour. **One answer for every limit** (same code and message), so it never says which limit was hit nor whether the email is known. |

Behind a proxy of ours, set `TRUSTED_PROXY_HOPS` (as for signing a proof): without it the address is the socket's, and every visitor looks like the proxy. The address is stored only as a salted hash, never in clear, never logged.

### 2.2 `GET /store/design-requests` (signed in)

The customer's own requests, newest first (at most 100): `{ design_requests: [...], count }`. Each: `reference`, `team_name`, `status` (`new`, `in_progress`, `proof_sent`, `done`), `status_label` (plain words: "Received", "Our designer is working on it", "A proof has been sent to you", "Done"), `product`, `pieces`, `need_by_date`, `region`, `message`, `reference_links`, `created_at`, `updated_at`. Never staff notes, who works on it, the record of changes or any address. 401 without sign-in.

### 2.3 The email

One email when a request is received, to the address typed, sent once through a record (`design_request_email`, unique key per request). Draft wording (`lib/content/design-request-emails.ts`, marked `DESIGN_REQUEST_WORDING_IS_DRAFT`): "We received your design-help request", the reference, "Our design team will read it". It promises nothing else (no time, price or date). Development and tests: written to the backend log. Elsewhere nothing is sent yet (decisions 002 and 015); a warning without personal data is logged. A failed send is recorded and never fails the request.

### 2.4 The admin (for the record)

Routes under `/admin/design-requests` (admin user only): `GET` list (`?status=`, `?limit=`, `?offset=`; answers `counts` per status and `new_count`), `GET /:id`, `POST /:id/status {status}`, `POST /:id/notes {staff_notes}`, `POST /:id/assign {assign}`. Statuses: forward one step (`new`, `in_progress`, `proof_sent`, `done`), back one step, and `done` back to `in_progress`; nothing skips. Every change is recorded (who, from, to, when). Refusal codes: `status_invalid`, `status_not_allowed`, `request_changed` (409), `staff_notes_invalid`, `assign_invalid`, `paging_invalid`, `design_request_not_found`. Pages: "Design requests" list and a detail page; what a stranger typed is shown as plain text, links as text with a warning.

## 3. The fit kit's refund (admin only)

`GET` and `POST /admin/orders/:id/fit-kit-refund`, with a panel "Fit kit" on Medusa's order page. A kit is a line whose product has `metadata.kind` `fit_kit`. State: `applies`, `kits_total`, `kits_returned`, `kits_left`, `refunded_amount`, `amounts_by_quantity`, `can_refund`, `reason`, `message`, `method` (`medusa` or `by_hand`), `currency_code`, `currency_digits`, `returns` (record: quantity, amount, method, who, when). `POST {quantity}` refunds that many kits (1 up to what is left). Only `quantity` is read; the amount is worked out from the order (the kit lines' own total, split exactly across the kits, rounded half up to the currency's smallest unit; never a garment's money, delivery or rush).

- Paid by card or the placeholder: refunded through Medusa's own `refundPaymentWorkflow` on the payment that paid (idempotency key per order and range of kits).
- Paid by cash on delivery: nothing to refund through a payment; the action records "refund by hand" with the amount and who. No money moves.
- Refusals (400 `not_allowed` with `code`): `no_fit_kit`, `order_canceled`, `not_paid` (payment not captured in full; for cash on delivery, cash not collected), `nothing_to_refund`, `invalid_quantity`, `return_window_over`, `payment_refunded_elsewhere`. 404 `order_not_found`; 409 `order_busy`; 500 `refund_failed`, `record_failed`.
- Two presses at once refund once (the order's lock of decision 010, which Medusa's cancel route holds too).
- Medusa's own page then shows the refund transactions, and "Credit lines" for the refunded amount (Medusa's refund workflow adds them); "Paid total" falls by the refund.

## 4. Settings (Store metadata, written by the seed when missing)

`fit_kit_return_days`: days after the order within which a kit may be refunded; 0 (seed) or absent: no limit.

## 5. Tables (migrations in the modules)

`fit_kit_refund` (module `fitKitRefund`); `design_request`, `design_request_step`, `design_request_email` (module `designRequest`). Existing databases need `npm run migrate` and `npm run seed`.

## 6. Not built

- File upload of reference pictures (needs storage and a scan).
- Retry of a failed confirmation email (one attempt; the row says `failed`).
- A real email provider (decision 002); the storefront's form and pages; a customer reply channel.
- Linking a design request to a team order.
- Refund of delivery paid for the kit; crediting the deposit against a team order (questions below).
- The admin's design-request list does not search by text.

## 7. Questions for the founders (each has a simple behaviour built meanwhile)

1. Is delivery paid for a fit kit refunded too? Built: the kit lines only.
2. How long does a customer have to send the kit back? Built: no limit; the setting `fit_kit_return_days` exists.
3. May the deposit be credited against a team order instead of refunded? Built: refund only.
4. How soon does the designer answer a design-help request? Built: no time promised anywhere.
5. Should a requester without an account be sent the confirmation email to any address typed? Built: yes; the per-email limit (3 a day) bounds misuse by someone typing another person's address.
6. Limits for the open form (5 per address per hour, 3 per email per day, 300 per hour in all) are placeholders.
7. Do the by-hand refunds of cash on delivery need a payout step (who pays the customer back, and how)? Built: only the record.
