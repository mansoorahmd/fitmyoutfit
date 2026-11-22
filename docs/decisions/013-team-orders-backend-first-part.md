# 013: Team orders in the backend, first part: the rules package, saved designs, the team list

Date: 22 Nov 2026. Status: decided by the coordinator (technical); built in task M2-1 and on `master`.

## Context

M2 builds the backend for team orders. Since 17 Nov the organizer enters the whole team list in the editor (decision 012), so the same rules must judge a list in the editor, in the storefront and on the server, and the server's answer must be the one that counts. CLAUDE.md asks that the editor and the team-order logic stay loosely coupled from Medusa, so a later move to another commerce platform stays possible.

## Decision

1. **The roster rules are a plain package, `packages/team-rules` (`@fitmyoutfit/team-rules`).** No runtime dependencies, usable in Node and in a browser, compiled by `tsc` to ES modules (editor, storefront) and CommonJS (backend). It holds the checks (as codes with the line and field, never sentences), the summary, the reader for pasted lists, the cleaning of text for storage, and the jersey number rule. Wording belongs to whoever shows it.
2. **The backend gets the package through a `file:` link** (`"@fitmyoutfit/team-rules": "file:../packages/team-rules"` in `backend/package.json`), because the backend is not an npm workspace. The backend's build, dev, typecheck and test scripts compile the package first.
3. **Two Medusa modules, thin around the rules:** `design` (a design belongs to a customer; every save is a new version; nothing is overwritten) and `team-order` (`TeamOrder` and `RosterEntry`). The contract is `docs/contracts/m2-team-orders.md`.
4. **The team list is saved as a whole, with a version number.** A save names the version it was made from; one SQL statement checks and moves the version, so of two saves from the same version exactly one wins and the other gets 409 with the current version. A list with problems is saved and the answer carries the problems; only a malformed list or one over the line limit is refused.
5. **What the checks require comes from the server's own data, never from the request:** which fields the design prints is read from the design version (layers with the role `player-name` or `player-number`) when the team order is made; the sizes come from the product's "Size" option; the minimum comes from the region's `min_garment_quantity`.
6. **The roster limits are data:** the Store's metadata keys `roster_max_lines`, `roster_max_count` and `roster_max_name_length`, with the defaults of decision 012 (100, 10, 18) when a key is not set.
7. **These routes send their own refusals,** `{type, code, message, ...}`, with a machine code for every case, because Medusa's own errors carry no code and it rewrites 409 messages. Someone else's design or team order is 404, the same as an unknown id.
8. **The API is snake_case, the package camelCase;** the mapping is in the backend's glue.
9. **The zero-width non-joiner is allowed in names** (Urdu and Persian typing produces it); direction marks and zero-width spaces are removed when text is cleaned.

## Alternatives considered

- **The rules inside the backend only, with the editor calling the server for every check.** Rejected: the list must be checked as the organizer types, also offline, and a second copy of the rules in the editor would drift.
- **Publishing the package to a registry.** Not now: one repository, one team; a `file:` link needs no registry and no secret.
- **Saving the list line by line (add, edit, remove routes).** Rejected: the editor saves as the organizer types and reorders; whole-list saves with a version are simpler to reason about and make the two-tabs case explicit.
- **Taking the printed fields and the sizes from the request.** Rejected: the server's check would then be only as honest as the client.

## Consequences

- **Deployment needs care.** `medusa build` copies `package.json` into `.medusa/server` with the same `file:../packages/team-rules` path, which is wrong from inside that folder. The host must check out the whole repository, build the package, and run the server from `backend/` with its `node_modules`, or the path must be rewritten (for example to an `npm pack` tarball). Not yet tried on the host; M2-2 adds the exact commands.
- **The design JSON is not validated against the editor's full schema on the server** (only: a JSON object with a numeric `schemaVersion`, at most 1,000,000 bytes). The editor's validator needs the product definition and the font catalog, which the backend does not hold. Open.
- **Three checks wait for font metrics:** the letters a font cannot draw, the note that a name is drawn smaller, and the 75% shrink limit. Until then a name's limit is a number of characters.
- **The jersey number rule exists twice** (the package and `packages/editor`) until the editor imports the package (task E4a); a parity test compares the two meanwhile.
- A design version stores the Medusa product id; the editor's own product id stays inside the JSON.
