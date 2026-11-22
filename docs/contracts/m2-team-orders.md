# Contract: saved designs and team orders (M2), as built

Status: **as built in M2-1, on `master` since 22 Nov 2026** (the roster rules package, saved designs with versions, draft team orders with their team list). The proof, the signature, the status flow past `draft` and the need-by date are being built in M2-2 and will be merged into this file. Written by the backend developer from the code and from a real run against the built backend; checked by the coordinator against that run's output. For a storefront developer: nothing here needs the code.

## 0. Conventions

- **Base:** the Medusa backend, `/store/...`. Every route needs the header `x-publishable-api-key` (Medusa's rule; without it Medusa answers 400 before our code runs) **and** a signed-in customer: `Authorization: Bearer <customer token>` (or the session cookie). No sign-in: **401** `{"message":"Unauthorized"}` (Medusa's own body; it has no `code`).
- **How a customer signs in:** `POST /auth/customer/emailpass/register` `{email,password}` gives a token; `POST /store/customers` with that token creates the customer; `POST /auth/customer/emailpass` gives the token to use on the routes below.
- **Own data only.** A design, a design version or a team order of another customer is **404**, the same as an unknown id. The lists show only the caller's own.
- **Names are snake_case** in bodies and answers (`no_name`, `team_name`, `design_version_id`). The design JSON is stored and returned exactly as sent, so its own names (`schemaVersion`, `teamName`, ...) are the editor's.
- **Refusals** from these routes have one shape: `{ "type": "invalid_data" | "not_found" | "not_allowed" | "conflict", "code": "<machine code>", "message": "<sentence for developers, not for customers>", ...extra }`. Build the customer's wording from `code`. Status: 400 for `invalid_data` and `not_allowed`, 404 for `not_found`, 409 for `conflict`. A 500 is Medusa's usual `{type, message}` (a missing store or region setting; the message names it).
- **Dates** are ISO 8601 strings (`created_at`); `need_by_date` is a calendar date `YYYY-MM-DD`.
- **Ids:** designs `design_...`, design versions `desver_...`, team orders `teamord_...`. A design version is addressed by its number (1, 2, ...) inside its design and by its `id` when a team order refers to it.

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

### Objects

```
team_order {
  id, team_name, status: "draft",                     // only draft exists in this part
  design_id, design_version_id, product_id, region_id,
  need_by_date: "YYYY-MM-DD" | null,                  // stored as given; nothing is scheduled from it yet
  prints: { name: boolean, number: boolean },         // what the design prints, read from the design version at creation
  list_version: number,                               // starts at 1; +1 on every saved team list
  created_at, updated_at
}

line { id, name, number, size, count, no_name, no_number }
  // id: the line id (yours, or "ln_..." made by the server when you sent none). It stays the same when the line is edited or moved.
  // name, number, size: text, may be empty. Stored cleaned (section 3), never judged.
  // count: number of this shirt. no_name / no_number: the organizer said "no name / no number on this shirt" on purpose.

roster { version: number /* = team_order.list_version */, lines: line[], problems: problem[], notes: note[], summary: summary }
```

**The whole read answer** (GET one, create, rename, save list) is `{ "team_order": team_order, "sizes": string[], "roster": roster }`.

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

Body `{ "team_name": string, "design_version_id": string, "region_id": string, "product_id"?: string, "need_by_date"?: "YYYY-MM-DD" }`.
`team_name`: 1 to 100 characters. `design_version_id` must be a version of the caller's own design (the `version.id`, `desver_...`). The product is the version's; if `product_id` is sent it must be that. `region_id` is a Medusa region id (`GET /store/regions`).
**201** the whole read answer, with an empty list (`roster.version` 1).
Refusals: 400 `team_name_invalid`, `need_by_date_invalid`, `design_version_id_required`, `product_mismatch`, `product_not_found`, `region_id_required`, `region_not_found`; 404 `design_version_not_found` (unknown, or another customer's).

### GET /store/team-orders

**200** `{ "team_orders": [team_order & { players, pieces }], "count": number }`, newest first, own only. `players` and `pieces` are the line count and the sum of the counts; the checks are not run for the list (read one for those).

### GET /store/team-orders/:id

**200** the whole read answer. 404 `team_order_not_found`.

### POST /store/team-orders/:id (rename)

Body `{ "team_name": string }`. **200** the whole read answer. 400 `team_name_invalid`; 404.

### DELETE /store/team-orders/:id

Deletes a draft team order and its list. **200** `{ "id", "object": "team_order", "deleted": true }`. 400 `team_order_not_draft` (not a draft); 404.

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
- **400 `team_order_not_editable`**: the team order is no longer a draft.
- **409 `roster_version_stale`**: the list was saved since `version`: `{ type: "conflict", code: "roster_version_stale", message, current_version: number }`. Nothing was written. Read the order again, merge, and save with `current_version`. Two saves from the same version: exactly one wins (one SQL statement checks and moves the version).
- 404 `team_order_not_found`.

### Limits are data

Defaults of decision 012: 100 lines, 1 to 10 of one shirt, 18 characters in a name, numbers 0 to 99. The Store's metadata keys `roster_max_lines`, `roster_max_count` and `roster_max_name_length` change them (the answers use them at once); the storefront should read the limits it shows from its own copy of the package or ask the backend team for an endpoint (not built).

## 3. What is not here (next part, and follow-ups)

Proof, the status flow past `draft`, locking at signing, late joiners, reorders, the need-by arithmetic, emails and the admin pages are not built. Validating the design JSON against the editor's schema is not built. There is no CSV or paste route: the storefront reads pasted text with `readPastedList` from `@fitmyoutfit/team-rules` and saves the lines (the server's check of the saved lines is the one that counts).
