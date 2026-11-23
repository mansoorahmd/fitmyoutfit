# @fitmyoutfit/backend

Medusa v2 for the store. Setup, ports, commands and the contracts are in the [root README](../README.md); this file lists what is custom here.

| Where | What |
| --- | --- |
| `src/lib/rules/` | Business rules as plain TypeScript (no Medusa imports), each with unit tests in `__tests__/` |
| `src/lib/settings/` | Settings read from the Store's and Regions' `metadata` (checkout, rush, roster limits) |
| `src/lib/http/refusal.ts` | The refusal a store route answers with: `{ type, code, message, ... }` |
| `src/modules/cash-collection` | The cash-collection record of an order |
| `src/modules/design` | Saved designs and their versions (`design`, `design_version`) |
| `src/modules/team-order` | Team orders, their team lists and their proofs (`team_order`, `roster_entry`, `proof_approval`), the record of status steps (`team_order_step`) and the record of emails (`team_order_email`); `replaceRoster` saves a list atomically against a version number, and each step of the status flow (make a proof, sign, back to draft, the admin's steps) is one conditional write inside its transaction, recorded with who made it |
| `src/workflows/` | The Medusa glue the routes call (thin; the rules are in `lib/`) |
| `src/api/store/designs`, `src/api/store/team-orders` | The store routes of M2-1 to M2-3 (the proof, its signature, back to draft, the schedule, the design version, add-ons for late joiners, reorders); each route file's comment lists its body, answer and refusals |
| `src/api/admin/team-orders` | The admin's routes: the list, one order, the admin's steps (M2-3) |
| `src/admin/routes/team-orders`, `src/admin/lib/team-orders.ts` | The admin pages "Team orders" (list and detail) and the plain functions behind their words and colours |
| `src/lib/content/team-order-emails.ts` | The words of the emails to the organizer: one content file, **draft wording** for the founders to confirm |
| `src/jobs/team-order-reminders.ts` | The daily job: reminders 3 and 1 day before the latest day to sign, and a retry of failed emails |
| `integration-tests/http/` | One spec per area, run against a real Medusa with a temporary database |

**The roster rules are a package, not backend code.** The checks, the summary, the clean-up and the pasted-list reader are `@fitmyoutfit/team-rules` (`../packages/team-rules`), which the backend depends on as `file:../packages/team-rules`. The package must be built before the backend compiles or runs its tests; the `build`, `dev`, `typecheck` and test scripts here do it first (`npm run build:rules`). `dist/` of the package is not committed. See "Team orders, part one (M2-1)" in the root README for how a production deployment gets it.

Medusa's module commands, for the two modules above: `npx medusa db:generate design teamOrder` (names are the modules' registered names), then `npm run migrate`.

## Product pictures (seed)

The jersey and the T-shirt have **our own pictures**, rendered from our 3D models and kept in `../packages/editor/samples/pictures/products/` (WebP). `src/scripts/seed-data/products.ts` names them by file name (`images.files`: for the jersey the V-neck front and back, then the round neck front and back; for the T-shirt front and back; the first is the thumbnail). They stay marked `placeholder`: the pictures are ours, but the design on them is a sample. The jacket and the fit kit have no model yet and keep their stand-in photos from spized.com (web links, local development only, another store's photos), as does the rush add-on (a Medusa demo photo).

- **Upload.** The seed reads the files and uploads them through Medusa's File Module (`uploadFilesWorkflow`), then sets the URLs it returns on the product. With no `S3_*` variables that is the local file provider (files in `backend/static/`, served at `<BACKEND_URL>/static/...`; `BACKEND_URL` decides the host and port of those links, `buildFileModules` in `src/lib/config/build-config.ts`); with them it is S3 or MinIO, through the same code. The seed never writes into `static/` itself.
- **Fresh database:** the products get our pictures.
- **Existing database:** a product's images are replaced **only when they are still exactly the seed's old stand-in links** (the same images, the first as thumbnail). A picture an admin uploaded or changed is never touched. The replacement is listed under Repaired in the seed's last log line (`jersey: pictures (stand-in photos replaced by our own)`).
- **Run again:** a product that already shows our pictures (an image whose file name ends with the seed file's name) is found first, so nothing is uploaded and nothing changes.
- **Files missing** (a backend deployed without `packages/`): the seed does not fail. It leaves the images as they are and logs one warning naming the files it could not read (a product with no picture at all gets its stand-in links, as before). The seed looks for the folder next to `backend/` (and from `backend/.medusa/server`); copy `packages/editor/samples/pictures/products/` along if a deployment should upload them.
