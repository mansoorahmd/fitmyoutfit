# @fitmyoutfit/team-rules

The roster rules of a team order as plain TypeScript: no runtime dependencies, no Medusa, no React. It runs in Node (the backend) and in a browser (the editor will use it later). The specification is [docs/design/08-team-list.md](../../docs/design/08-team-list.md) and [decision 012](../../docs/decisions/012-team-list-entered-by-the-organizer.md). The server's check is the one that counts; the editor shows the same result beside each line.

Every result is **a code with its line and field, never a sentence**: the storefront and the editor own the wording.

## What is in it

| Function | What it does |
| --- | --- |
| `checkRoster(lines, settings)` | The checks of section 6: `name-missing`, `number-missing`, `size-missing`, `number-not-digits`, `number-too-long`, `number-mixed-digits`, `number-duplicate` (on every line involved), `number-taken-first-order` and `number-taken-add-on` (a number already taken outside this list, see below), `name-character`, `name-too-long`, `size-unknown`, `quantity-range`, `list-too-long`. Also notes that are not problems (`name-mixed-scripts`, `mixed-digit-systems`). |
| `PROBLEM_CODES`, `NOTE_CODES` | The two lists above as data (`ProblemCode` and `NoteCode` are made from them), so whoever words the codes can test that none lacks a sentence. A test keeps them equal to what `checkRoster` returns. |
| `summarizeRoster`, `analyzeRoster` | Section 8: players, pieces, pieces per size, lines without a size, lines to fix, and with a minimum how many pieces are missing. `analyzeRoster` does the checks and the summary. |
| `normalizeLines(lines, settings)` | Cleans lines for storage: trimmed, runs of spaces made one, NFC, direction marks removed; the number kept as written; the size in the product's spelling. Nothing is shortened or capitalised. |
| `parseRosterInput(input, limits?)` | The shape of a list from outside (a request body). Only a malformed list or one over the line limit is refused; an incomplete list is a list. |
| `readPastedList(text, { sizes })` | Section 5.3: a pasted list or the text of a CSV file in, lines out; lines that are not players listed apart; uncertain parts left empty with a note. |
| `checkJerseyNumber` and friends | The jersey number rule (0 to 99; English, Arabic-Indic and Extended Arabic-Indic digits; `0` and `00` are the same number). This is now its one home. |
| `canonicalSnapshotText(snapshot)`, `hashSnapshot(snapshot)`, `hashSnapshotText(text)`, `sha256Hex(text)` | The roster proof's snapshot: the design version, product, region, team name, printed fields and every line in order, as one canonical JSON text (fixed key order, text cleaned the same way as stored lines, digits kept as written, non-ASCII written as is) and its SHA-256 as 64 lowercase hex characters. The backend stores both when a proof is made; the storefront or the editor computes the same hash from the same list, to show that the list on screen is the list that was signed. The SHA-256 is synchronous and has no dependency, so it runs in Node and in a browser. Format 1; the rules are in the top comment of `src/snapshot.ts`. |

**The server's shapes (mappers).** The checks and the editor use camelCase (`noName`, `noNumber`, `lineId`, `takenIn`, `bySize`); the server's contract ([docs/contracts/m2-team-orders.md](../../docs/contracts/m2-team-orders.md)) uses snake_case (`no_name`, `no_number`, `line_id`, `taken_in`, `by_size`). `lineToContract` / `linesToContract` build the PUT roster's `lines` (the flags are renamed, never lost); `lineFromContract` / `linesFromContract` read `roster.lines` (a missing flag is false, a missing count 1, junk is read as empty, never thrown). `problemToContract` / `problemFromContract`, `noteToContract` / `noteFromContract`, `summaryToContract` / `summaryFromContract` and `analysisFromContract(roster)` (problems, notes and summary of a `roster` answer as a `RosterAnalysis`) do the same for the checks' result (`detail.takenIn` is `detail.taken_in` with the sources `first_order` and `add_on`; a code this package does not know is kept as read). `limitsFromContract(limits)` turns the answer's `limits` (`max_lines`, `min_count`, `max_count`, `max_name_length`) into the `Partial<RosterLimits>` every function takes (the number rules stay the package's). Each pair round-trips (tested). Keys the contract does not name are ignored.

**Numbers already taken (late joiners).** `settings.taken` is a list of `{ number, source: "first-order" | "add-on", orderId?, name? }`: for an add-on order, the numbers of the first order's signed list and of its other add-ons that have a proof out or signed. A line whose printed number is the same number as one of them (`7`, `07` and `٧` are the same) gets `number-taken-first-order` (when it is taken there; else `number-taken-add-on`), with `detail.value` and `detail.takenIn` listing every place. A duplicate inside the list is still reported as `number-duplicate`. Absent or empty: nothing is taken, as before.

What is required follows the design and the line's flags: a name when the design prints names and the line is not "no name"; a number when the design prints numbers and the line is not "no number"; a size always. A value on a field that is switched off is kept and not checked.

```ts
import { analyzeRoster, normalizeLines, readPastedList, toRosterLine } from "@fitmyoutfit/team-rules";

const settings = { prints: { name: true, number: true }, sizes: ["S", "M", "L", "XL"] };
const read = readPastedList("Ali Raza 10 M\n7, Bilal Ahmed, L", { sizes: settings.sizes });
const lines = normalizeLines(read.lines.map(toRosterLine), settings);
const { problems, summary } = analyzeRoster(lines, settings, { minimum: 10 });
```

## Limits are data

`DEFAULT_LIMITS` holds the defaults of decision 012: 100 lines, 1 to 10 of one shirt, 18 characters in a name (a fixed number until the editor can measure fonts), numbers 0 to 99. Every function takes `settings.limits` (or a `limits` option) and falls back to these. The names allow Latin letters, Arabic-script letters (Urdu included) with their marks, space, hyphen, apostrophe, full stop, and the zero-width non-joiner (Urdu and Persian typing produces it).

## Build and use

```
npm run build -w @fitmyoutfit/team-rules   # dist/esm (editor, browsers) and dist/cjs (the backend)
npm test -w @fitmyoutfit/team-rules
```

`dist/` is not committed. The backend depends on this package with `"@fitmyoutfit/team-rules": "file:../packages/team-rules"` and its scripts build the package first; see `backend/README.md`.
