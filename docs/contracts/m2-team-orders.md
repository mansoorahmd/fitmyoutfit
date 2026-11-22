# Contract: saved designs and team orders (M2), as built

Status: **as built in M2-1 and M2-2, on `master` since 22 Nov 2026** (the roster rules package, saved designs with versions, team orders with their team list, the roster proof and its signature, the status flow, the need-by date). Late joiners, reorders, the admin routes and the emails are being built in M2-3 and will be merged into this file. Written by the backend developer from the code and from real runs against the built backend; checked by the coordinator against those runs' output. For a storefront developer: nothing here needs the code.

## 0. Conventions

- **Base:** the Medusa backend, `/store/...`. Every route needs the header `x-publishable-api-key` (Medusa's rule; without it Medusa answers 400 before our code runs) **and** a signed-in customer: `Authorization: Bearer <customer token>` (or the session cookie). No sign-in: **401** `{"message":"Unauthorized"}` (Medusa's own body; it has no `code`).
- **How a customer signs in:** `POST /auth/customer/emailpass/register` `{email,password}` gives a token; `POST /store/customers` with that token creates the customer; `POST /auth/customer/emailpass` gives the token to use on the routes below.
- **Own data only.** A design, a design version, a team order or a proof of another customer is **404**, the same as an unknown id. The lists show only the caller's own.
- **Names are snake_case** in bodies and answers (`no_name`, `team_name`, `design_version_id`). The design JSON is stored and returned exactly as sent, so its own names (`schemaVersion`, `teamName`, ...) are the editor's.
- **Refusals** from these routes have one shape: `{ "type": "invalid_data" | "not_found" | "not_allowed" | "conflict", "code": "<machine code>", "message": "<sentence for developers, not for customers>", ...extra }`. Build the customer's wording from `code`. Status: 400 for `invalid_data` and `not_allowed`, 404 for `not_found`, 409 for `conflict`. A 500 is Medusa's usual `{type, message}` (a missing store or region setting; the message names it).
- **Dates** are ISO 8601 strings (`created_at`, `signed_at`); `need_by_date` and the other calendar dates (`today`, `latest_sign_standard`, `promised_delivery_date`, ...) are `YYYY-MM-DD`.
- **Ids:** designs `design_...`, design versions `desver_...`, team orders `teamord_...`, proofs `proof_...`. A design version is addressed by its number (1, 2, ...) inside its design and by its `id` when a team order refers to it.
- **Personal data:** the address a proof was signed from is stored on the proof and is **never** in any answer of these routes (nor in a log line).

## 1. Saved designs

### Objects

```
design   { id, name, created_at, latest_version: number|null, product_id: string|null }   // product_id of the latest version
version  { id, design_id, version: number, product_id, schema_version: number, created_at, design?: <the design JSON> }
```

`design` (the JSON) is only in the answer of "read one version". Elsewhere a version has no JSON.

### What a version may hold

`design` must be a JSON object (not null, not an array) with a whole-number `schemaVersion` of 1 or more, and at most **1,000,000 bytes** as JSON text. Nothing else is checked: **the editor's full schema is not validated by the server yet** (follow-up). The request body limit of the two POST routes is 2 MB; a larger body is 413. `product_id` is a Medusa product id; the product must exist and must not be the fit kit or the rush add-on. Nothing is ever overwritten: every save is a new version, numbered from 1 in its design; two saves at the same moment get different numbers.

### POST /store/designs

Body `{ "name"?: string, "product_id": string, "design": object }`. `name`: 1 to 100 characters, no control characters (default "Untitled design").
**201** `{ "design": design, "version": version }` (version number 1, without its JSON).
Refusals (400): `design_not_an_object`, `design_schema_version`, `design_too_large`, `design_name_invalid`, `product_id_required`, `product_not_found`, `product_not_designable`.

### GET /store/designs

**200** `{ "designs": design[], "count": number }`, newest first, own only.

### GET /store/designs/:id

**200** `{ "design": design, "versions": version[] }`, versions oldest first, without their JSON. 404 `design_not_found`.

### POST /store/designs/:id/versions

Body `{ "product_id"?: string, "design": object }` (`product_id` defaults to the latest version's).
**201** `{ "design": design, "version": version }` (the new version, without its JSON). Refusals as POST /store/designs (without the name), and 404 `design_not_found`.

### GET /store/designs/:id/versions/:version

`:version` is the version's number. **200** `{ "version": version }` with `version.design` holding the JSON as saved. 404 `design_not_found` or `design_version_not_found` (unknown number, `0`, text).

## 2. Team orders

### The status flow

```
draft -> proof_sent -> approved -> deposit_paid -> in_production -> balance_due -> shipped
           |    ^          |
           v    |          v
          draft (the organizer goes back to change something)
```

| Step | Made by | Route (this part) |
| --- | --- | --- |
| `draft -> proof_sent` (make the proof) | organizer | `POST .../proofs` |
| `proof_sent -> draft` (change something before signing; the proof becomes `withdrawn`) | organizer | `POST .../reopen` |
| `proof_sent -> approved` (sign) | organizer | `POST .../proofs/:proofId/sign` |
| `approved -> draft` (change something after signing, before any payment; the signed proof becomes `replaced`) | organizer | `POST .../reopen` |
| `approved -> deposit_paid` | payment system | none yet (payments milestone) |
| `deposit_paid -> in_production`, `in_production -> balance_due`, `balance_due -> shipped` | admin | none yet (admin pages, next part) |

After the deposit nothing goes back to draft by the organizer. The later steps are in the rule module and refused on the store routes. **What each status allows** (one source of truth; there is no `locked` flag on a line):

| Status | Team list, team name, design version | Need-by date and rush choice | Delete |
| --- | --- | --- | --- |
| `draft` | may change | may change | allowed |
| `proof_sent` | **frozen** | may change | refused |
| `approved` and later | **frozen** | **frozen** | refused |

A refusal of a change to a frozen part is **400** `not_allowed`, code `team_order_not_editable`, with `status` (the order's status) in the body: `{ type: "not_allowed", code: "team_order_not_editable", message, status }`. Going back to `draft` (`POST .../reopen`) unlocks everything; the proof that was out is kept (see proofs).

### Objects

```
team_order {
  id, team_name,
  status: "draft"|"proof_sent"|"approved"|"deposit_paid"|"in_production"|"balance_due"|"shipped",
  design_id, design_version_id, product_id, region_id,
  need_by_date: "YYYY-MM-DD" | null,
  rush_requested: boolean,                            // the organizer's choice of rush delivery; charged in the payments milestone
  prints: { name: boolean, number: boolean },         // what the design prints, read from the design version (again when the design version changes)
  list_version: number,                               // starts at 1; +1 on every saved team list
  created_at, updated_at
}

line { id, name, number, size, count, no_name, no_number }
  // id: the line id (yours, or "ln_..." made by the server when you sent none). It stays the same when the line is edited or moved.
  // name, number, size: text, may be empty. Stored cleaned (section 3), never judged.
  // count: number of this shirt. no_name / no_number: the organizer said "no name / no number on this shirt" on purpose.

roster { version: number /* = team_order.list_version */, lines: line[], problems: problem[], notes: note[], summary: summary }

limits   { max_lines, min_count, max_count, max_name_length }     // the limits the checks used (section "Limits are data")

schedule {                                            // the need-by date worked out as of today (section 4)
  state: "none"|"ok"|"needs_rush"|"cannot_be_met",
  need_by_date: "YYYY-MM-DD"|null,
  today: "YYYY-MM-DD",                                // the store's day, in the store's time zone
  days: { standard: number, rush: number },           // the delivery days used (calendar days from approval)
  latest_sign_standard: "YYYY-MM-DD"|null,            // latest day to sign for standard delivery
  latest_sign_rush: "YYYY-MM-DD"|null,                // the same for rush
  days_left_standard: number|null,                    // days from today to those days: 0 = today, negative = already past
  days_left_rush: number|null,
  delivery_if_signed_today: { standard: "YYYY-MM-DD", rush: "YYYY-MM-DD" }
}

proof {                                               // a proof without its snapshot
  id, team_order_id,
  number: number,                                     // 1, 2, ... within the team order
  status: "sent"|"signed"|"withdrawn"|"replaced",
  hash: string,                                       // SHA-256 of the canonical snapshot text, 64 lowercase hex characters
  design_version_id, list_version: number,            // what the proof was made from
  created_at,
  closed_at: string|null,                             // when it was withdrawn or replaced
  signed_name: string|null, signed_at: string|null,   // who (the name as typed) and when
  schedule_state: string|null, need_by_date: string|null, rush: boolean|null,   // the schedule as it was at signing
  promised_delivery_date: "YYYY-MM-DD"|null           // promised at signing: signing day + the standard or (rush) days
}
```

**The whole read answer** (GET one, create, rename, save list, make a proof, sign, reopen, set the schedule, set the design version) is:

```
{ "team_order": team_order, "sizes": string[], "roster": roster, "limits": limits, "schedule": schedule, "current_proof": proof | null }
```

- `current_proof` is the proof the order holds now: the `sent` one while `proof_sent`, the `signed` one from `approved` on, `null` in `draft`.
- `sizes`: the product's sizes in the product's order (the values of its "Size" option, by rank). They come from the product, never from the request. A product with no Size option has none, and every size is then unknown.
- `prints` and `sizes` decide what the checks require; they are not taken from any request.

### problem (the checks' result for every line; codes, never sentences)

```
{ code, index: number, line_id: string|null, field: "name"|"number"|"size"|"count"|"list", detail: object|null }
```
`index` is the line's place in `roster.lines` from 0 (`-1` for the whole list). Problems come in list order, and within a line in the order name, number, size, count.

| code | field | meaning | `detail` |
| --- | --- | --- | --- |
| `name-missing` | name | the design prints names, the line has no "no name" flag, the name is empty | |
| `number-missing` | number | the design prints numbers, the line has no "no number" flag, the number is empty | |
| `size-missing` | size | no size | |
| `number-not-digits` | number | a character that is not a digit (letters, a space inside, a sign, full-width digits) | |
| `number-too-long` | number | more than 2 digits (leading zeros count) or above 99 | |
| `number-mixed-digits` | number | 0-9 mixed with Arabic-Indic or Extended Arabic-Indic digits in one number | |
| `number-duplicate` | number | the same value as another line: `7`, `07`, `٧`, `۷` are the same number, and so are `0` and `00`. Reported **on every line involved**, each naming the others | `{ value: number, others: [{ index, id?, name }] }` |
| `name-character` | name | a character that cannot be printed (allowed: Latin letters with accents, Arabic-script letters including Urdu with their marks, space, hyphen, apostrophe `'` `’`, full stop, zero-width non-joiner) | `{ characters: string[], has_digit: boolean }` |
| `name-too-long` | name | more characters than the limit (default 18; marks do not count) | `{ length, max }` |
| `size-unknown` | size | not one of the product's sizes (after the usual spellings: `xxl` is `2XL` ...) | `{ size }` as stored |
| `quantity-range` | count | not a whole number from 1 to 10 | `{ count?, min, max }` |
| `list-too-long` | list | more than the line limit. The save route refuses such a list before this can appear; the code exists for the shared package | `{ lines, max }` |

A value on a field the design does not print, or that a line flag switches off, is kept and **not checked** (no duplicate, no character problem). A forgotten name is never taken as "no name": only the flag does that.

### note (not a problem, nothing blocks)

`{ code: "name-mixed-scripts", index, line_id }` (Latin and Arabic-script letters in one name) and `{ code: "mixed-digit-systems", index: -1, line_id: null }` (lines use more than one digit system).

### summary

```
{ players,                       // lines
  pieces,                        // garments: the sum of the counts (a count that is not a whole number of 1 or more counts as 1)
  by_size: [{ size, pieces }],   // every size of the product, in order, 0 included
  other_sizes: [{ size, pieces }],   // sizes that are not the product's, as stored
  lines_without_size, pieces_without_size,
  ready_lines, lines_to_fix, indexes_to_fix: number[],
  minimum: { required, missing, met } | null,   // required = the region's min_garment_quantity (1 in Pakistan, 10 placeholder in UK/UAE/US); missing = pieces still needed; spares and second shirts count
  ready_for_proof }              // no problem, at least one line, minimum met
```

### POST /store/team-orders

Body `{ "team_name": string, "design_version_id": string, "region_id": string, "product_id"?: string, "need_by_date"?: "YYYY-MM-DD", "rush_requested"?: boolean }`.
`team_name`: 1 to 100 characters. `design_version_id` must be a version of the caller's own design (the `version.id`, `desver_...`). The product is the version's; if `product_id` is sent it must be that. `region_id` is a Medusa region id (`GET /store/regions`). `need_by_date`, if sent, must not be before today (the store's day).
**201** the whole read answer, with an empty list (`roster.version` 1), status `draft`, `current_proof` null.
Refusals: 400 `team_name_invalid`, `need_by_date_invalid`, `need_by_date_in_past` (with `today`), `rush_requested_invalid`, `design_version_id_required`, `product_mismatch`, `product_not_found`, `region_id_required`, `region_not_found`; 404 `design_version_not_found` (unknown, or another customer's).

### GET /store/team-orders

**200** `{ "team_orders": [team_order & { players, pieces, current_proof: proof|null }], "count": number }`, newest first, own only. `team_order.status` and `current_proof.status` are the order's and its current proof's status. `players` and `pieces` are the line count and the sum of the counts; the checks are not run for the list (read one for those).

### GET /store/team-orders/:id

**200** the whole read answer. 404 `team_order_not_found`.

### POST /store/team-orders/:id (rename)

Body `{ "team_name": string }`. **200** the whole read answer. 400 `team_name_invalid`; 400 `team_order_not_editable` (not a draft: a proof is out or signed; go back to draft first); 404.

### DELETE /store/team-orders/:id

Deletes a draft team order and its list. **200** `{ "id", "object": "team_order", "deleted": true }`. 400 `team_order_not_draft` (not a draft); 404. Proofs of a deleted order are kept in the database (never deleted).

### POST /store/team-orders/:id/design-version

Points a **draft** team order at another version of the same design (for example after the editor saved a new one). Body `{ "design_version_id": "desver_..." }`. **200** the whole read answer (`team_order.prints` is read again from the new version).
Refusals: 400 `design_version_id_required`, `design_mismatch` (a version of another design), `product_mismatch` (a version for another product), `team_order_not_editable` (not a draft); 404 `design_version_not_found` (unknown, or another customer's), `team_order_not_found`.

### PUT /store/team-orders/:id/roster (save the team list as a whole)

Body `{ "version": number, "lines": line-input[] }`.
- `version`: the `roster.version` the save was made from (a whole number of 1 or more).
- `lines`: the **whole** list in its order, replacing the saved one (an empty array clears it). Each `{ id?, name?, number?, size?, count?, no_name?, no_number? }`: missing text is empty, a missing count is 1, a missing flag is false. Extra fields are ignored. `id` (at most 64 characters) is kept; lines with no id get one. At most 100 lines (limit below).
- Text lengths read at all: name 200, number 40, size 40 characters.

**200** the whole read answer: the saved list (cleaned), `roster.version` + 1, and the checks' result. **A list with problems is saved**; the answer carries the problems. Nothing is refused for being incomplete.

Cleaning before storage: name and number are trimmed, runs of white space become one space, text is put in Unicode NFC, direction marks and zero-width spaces are removed (the zero-width non-joiner stays); the number is kept as written (`07`, `٧` stay); a size that is one of the product's (in any usual spelling, any case) is stored in the product's spelling (`xxl` becomes `2XL`), any other size is stored as typed; nothing is shortened or capitalised.

Refusals:
- **400 `roster_malformed`**: `lines` is not an array, a line is not an object, a field has the wrong type (text not a string, `count` not a number, a flag not a boolean), a text is too long, or two lines share an id. `detail` says where: `{ code: "not-a-list" | "line-not-an-object" | "wrong-type" | "too-long" | "duplicate-line-id", index?, field?, max?, id? }` (`field` in the API's names, e.g. `no_name`).
- **400 `roster_too_many_lines`**: more than the limit (default 100); `detail { code: "too-many-lines", lines, max }`.
- **400 `roster_version_required`**: `version` missing or not a whole number of 1 or more.
- **400 `team_order_not_editable`** with `status`: the team order is not a draft (a proof is out or signed, or later). This also holds when a proof is made at the same moment as the save: the list is frozen from the moment the proof exists.
- **409 `roster_version_stale`**: the list was saved since `version`: `{ type: "conflict", code: "roster_version_stale", message, current_version: number }`. Nothing was written. Read the order again, merge, and save with `current_version`. Two saves from the same version: exactly one wins (one SQL statement checks and moves the version).
- 404 `team_order_not_found`.

### Limits are data

Defaults of decision 012: 100 lines, 1 to 10 of one shirt, 18 characters in a name, numbers 0 to 99. The Store's metadata keys `roster_max_lines`, `roster_max_count` and `roster_max_name_length` change them (the answers use them at once; the seed writes the defaults when the keys are missing). **Every read answer carries the limits the checks used in `limits`** (`max_lines`, `min_count`, `max_count`, `max_name_length`), so the storefront need not guess.

## 3. The roster proof

A proof is the one page the organizer signs: a **snapshot** of the team list and what it is for, frozen when the proof is made.

### Making a proof: POST /store/team-orders/:id/proofs

No body. Allowed only from `draft`, and only when the list is ready (`roster.summary.ready_for_proof`: at least one line, no problem anywhere, the region's minimum met). The team order becomes `proof_sent`, a proof with the next number and status `sent` is stored, and the list, the team name and the design version are frozen.
**201** the whole read answer; `current_proof` is the new proof.
Refusals (400 `not_allowed`): `team_order_not_draft` (with `status`: a proof is out or signed already, or the order is later in the flow); `roster_empty`; `roster_has_problems` (with `problems`: how many, and `indexes_to_fix`: the lines to fix); `roster_below_minimum` (with `required` and `missing`). 409 `team_order_changed`: the order changed at the same moment (read it again). 404 `team_order_not_found`. Two requests at the same moment make exactly one proof.

### The snapshot and its hash

The snapshot holds: the design version, the product, the region, the team name, which fields are printed, and every line in order (name, number, size, count, flags; not the line ids). It is stored as a **canonical JSON text** and its **SHA-256**. The canonical text (format 1) has a fixed key order (`format`, `design_version_id`, `product_id`, `region_id`, `team_name`, `prints` { `name`, `number` }, `lines` [ { `name`, `number`, `size`, `count`, `no_name`, `no_number` } ]), no white space, text cleaned like stored lines (Unicode NFC, direction marks and zero-width spaces removed, white space runs made one space, trimmed), digits kept as written, non-ASCII text written as is (not as `\u` escapes), UTF-8. The hash is the SHA-256 of the text's UTF-8 bytes in 64 lowercase hex characters. **`hashSnapshot(snapshot)` of `@fitmyoutfit/team-rules` computes the same text and hash** (in Node or a browser, with no dependency), from the proof's `snapshot` or from the list on screen.

### GET /store/team-orders/:id/proofs

**200** `{ "proofs": proof[], "count": number }`, newest first (highest number first), every proof ever made, without snapshots.

### GET /store/team-orders/:id/proofs/:proofId

**200** `{ "proof": proof & { "snapshot": object, "snapshot_text": string } }`. `snapshot` is the snapshot as an object (the canonical text parsed: `{ format, design_version_id, product_id, region_id, team_name, prints, lines }`); `snapshot_text` is the canonical text whose SHA-256 is `proof.hash`. 404 `team_order_not_found` (also another customer's), `proof_not_found` (unknown, or a proof of another team order).

### Signing: POST /store/team-orders/:id/proofs/:proofId/sign

Body:
```
{ "proof_hash": string,        // the hash of the proof the organizer looked at
  "signed_name": string,       // their name as typed: 1 to 100 characters, cleaned (trimmed, white space runs made one space, NFC), no control characters
  "confirmed": true,           // the box they ticked: must be the boolean true
  "schedule_state": "none"|"ok"|"needs_rush"|"cannot_be_met" }   // the state they were shown (schedule.state)
```
**200** the whole read answer: `team_order.status` is `approved`, `current_proof` is the signed proof (`status: "signed"`, `signed_name`, `signed_at`, `schedule_state`, `need_by_date`, `rush`, `promised_delivery_date`). The server also stores the customer, and the request's IP address (see below); the address is never in an answer.

- **Signing twice does nothing the second time:** a request for a proof that is already signed, with the same hash, answers **200** with the same data and records nothing (the name sent the second time is ignored). A signed proof with another hash is 409 `proof_hash_mismatch`.
- **Two requests at the same moment:** exactly one signature is recorded; each request is answered 200 with that signature.
- **The hash must match:** the hash is checked against the proof on record, so the list the organizer saw is the list signed.
- **The schedule state must match:** the server works out the state for today from the order's need-by date; when it differs from `schedule_state`, nothing is signed. The signed proof records the state, the need-by date, the rush choice and `promised_delivery_date` = the signing day (the store's day) plus the standard delivery days, or the rush days when `team_order.rush_requested` is true.

Refusals: 400 `proof_hash_required` (missing or not 64 hex characters), `signed_name_required` (empty after cleaning, too long, or control characters), `confirmation_required` (`confirmed` is not true), `schedule_state_required` (missing or not one of the four). 409 `proof_hash_mismatch` (with `current_hash`: the proof's hash; the list the organizer saw is not the list on record), 409 `proof_not_current` (the proof is withdrawn or replaced, or the order is not waiting for a signature; with `status` when the order's status is the reason), 409 `schedule_changed` (with `schedule`: the current schedule). 404 `team_order_not_found`, `proof_not_found`.

**The address** recorded with a signature is the one the backend sees. With the environment variable `TRUSTED_PROXY_HOPS` unset or 0 it is the connection's own address and `X-Forwarded-For` is ignored. Behind N proxies of ours (`TRUSTED_PROXY_HOPS=N`) it is the N-th entry from the right of `X-Forwarded-For`, because each of our proxies appends the address it saw and the entries to the left are written by the client; a header with fewer than N entries falls back to the connection's address. IPv4 written as IPv6 (`::ffff:1.2.3.4`) is stored as IPv4. (The number of hops must be set to match the host's real chain; not verified for Railway.)

### Going back to draft: POST /store/team-orders/:id/reopen

No body. From `proof_sent` (the proof becomes `withdrawn`) or from `approved` (the signed proof becomes `replaced`): the order becomes `draft` and the list, the team name, the design version and the schedule can be changed again. **200** the whole read answer (`current_proof` null). The proof stays on record with its snapshot and, if signed, its signature (`status` `withdrawn` or `replaced`, `closed_at` set). A new proof must be made and signed. Refusals (400 `not_allowed`): `team_order_already_draft` (with `status`), `team_order_not_reopenable` (after the deposit: the organizer cannot go back); 409 `team_order_changed`; 404.

## 4. The need-by date

The schedule works backwards from the date the team needs the kit. Days are **calendar days**, counted like the delivery promise of an ordinary order (docs/contracts/m1-checkout.md): delivery date = the day the proof is signed + `delivery_days_standard` (15, placeholder) or, with paid rush, + `delivery_days_rush` (10, placeholder); the signing day is day 0; weekends and holidays count. The settings are the Store's metadata keys of M1.

- `latest_sign_standard` = need-by date − standard days; `latest_sign_rush` = need-by date − rush days.
- `state`: `none` (no date); `ok` (today is on or before `latest_sign_standard`); `needs_rush` (standard would be late, rush would not: `latest_sign_standard` < today <= `latest_sign_rush`); `cannot_be_met` (today is after `latest_sign_rush`).
- **"Today" is the store's day in one time zone**, the Store's metadata key `schedule_time_zone` (an IANA name; placeholder `Asia/Karachi`; the seed writes it when missing).
- **Nothing is refused for being late:** the state says it and the storefront offers rush.

### POST /store/team-orders/:id/schedule

Body `{ "need_by_date"?: "YYYY-MM-DD" | null, "rush_requested"?: boolean }`, at least one key; a key that is not sent is left as it is, `need_by_date: null` clears the date. Allowed while the order is `draft` or `proof_sent`. **200** the whole read answer (`schedule` is the new schedule).
Refusals (400): `schedule_empty`, `need_by_date_invalid`, `need_by_date_in_past` (before today in the store's time zone; with `today`; today itself is allowed), `rush_requested_invalid`, `team_order_not_editable` (approved or later, with `status`); 404.
`rush_requested` is a stored choice; charging for rush belongs to the payments milestone.

## 5. What is not here (next parts, and follow-ups)

Payments (the deposit and the balance, and the steps they cause), late joiners, reorders, the admin pages (and the admin's status steps), the emails, and the editor's roster page are not built. Validating the design JSON against the editor's schema is not built. There is no CSV or paste route: the storefront reads pasted text with `readPastedList` from `@fitmyoutfit/team-rules` and saves the lines (the server's check of the saved lines is the one that counts). Existing databases need `npm run seed` (it adds the missing store settings `roster_max_lines`, `roster_max_count`, `roster_max_name_length` and `schedule_time_zone`) and `npm run migrate` (the proof table and `rush_requested`, and the dropped, never-used `locked` column of a line); without `schedule_time_zone` a team-order answer is a 500 naming the key.
