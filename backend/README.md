# @fitmyoutfit/backend

Medusa v2 for the store. Setup, ports, commands and the contracts are in the [root README](../README.md); this file lists what is custom here.

| Where | What |
| --- | --- |
| `src/lib/rules/` | Business rules as plain TypeScript (no Medusa imports), each with unit tests in `__tests__/` |
| `src/lib/settings/` | Settings read from the Store's and Regions' `metadata` (checkout, rush, roster limits) |
| `src/lib/http/refusal.ts` | The refusal a store route answers with: `{ type, code, message, ... }` |
| `src/modules/cash-collection` | The cash-collection record of an order |
| `src/modules/design` | Saved designs and their versions (`design`, `design_version`) |
| `src/modules/team-order` | Team orders and their team lists (`team_order`, `roster_entry`); `replaceRoster` saves a list atomically against a version number |
| `src/workflows/` | The Medusa glue the routes call (thin; the rules are in `lib/`) |
| `src/api/store/designs`, `src/api/store/team-orders` | The store routes of M2-1; each route file's comment lists its body, answer and refusals |
| `integration-tests/http/` | One spec per area, run against a real Medusa with a temporary database |

**The roster rules are a package, not backend code.** The checks, the summary, the clean-up and the pasted-list reader are `@fitmyoutfit/team-rules` (`../packages/team-rules`), which the backend depends on as `file:../packages/team-rules`. The package must be built before the backend compiles or runs its tests; the `build`, `dev`, `typecheck` and test scripts here do it first (`npm run build:rules`). `dist/` of the package is not committed. See "Team orders, part one (M2-1)" in the root README for how a production deployment gets it.

Medusa's module commands, for the two modules above: `npx medusa db:generate design teamOrder` (names are the modules' registered names), then `npm run migrate`.
