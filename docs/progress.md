# Development progress

Maintained by the coordinator agent. The backlog is in [dev-plan.md](../dev-plan.md), and technical decisions are in [decisions/](decisions/).

## Current sprint
Sprint 0 (week 1): setup. Started 10 Nov 2026.

**Done when** (from dev-plan.md): a new developer can run `docker compose up` plus one command, and see the storefront with the 3 products in all 4 regions.

### Tasks

The three coding tasks run in parallel, each in its own worktree, against [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

| # | Task | Owner | Status | Accepted when |
| --- | --- | --- | --- | --- |
| S0-1 | Root workspace, `docker-compose.yml` (PostgreSQL, Redis, MinIO), Medusa v2 backend, seed script, setup and dev commands, CI workflow | backend-dev | In QA review (worker reported 10 Nov; branch `worktree-agent-aeeb51ec26519d8ed`, Medusa 2.22.6) | Seed creates the 4 regions, 5 products and sample prices from data files, and is idempotent. `npm run setup` works on an empty database. Lint, type-check and tests pass |
| S0-2 | Next.js storefront from the Medusa starter, wired to the contract's environment variables | storefront-dev | QA verdict: changes needed. Back with the worker for fixes (S0-2b, which includes S0-7). Not yet checked against a real backend | `/pk`, `/gb`, `/ae` and `/us` list the 3 garments with prices in the region's currency, and product pages offer the sizes. Lint, type-check and tests pass |
| S0-3 | Editor package scaffold: build, demo page, first draft of the design JSON type, schema and validator | editor-3d-dev | **Done, merged to `master`** on 10 Nov after the QA fix round (S0-3b) | Package builds standalone with no Medusa or Next.js imports. Demo page shows an orbitable placeholder. Lint, type-check and tests pass |
| S0-4 | Three technical choices: email provider, hosting target, PDF library | coordinator | Done | Recorded in decisions 002, 003 and 005 (005 replaces 004) |
| S0-5 | QA review of each branch, merge, root lockfile, full check from a clean database | qa-reviewer, coordinator | Not started | The "done when" above is seen working on `master` |
| S0-6 | Rush as a percentage: drop the fixed rush prices from the seed, add the `rush_percentage` setting (placeholder 20) | backend-dev | Waiting for S0-1 | The setting is seeded as data and can be changed without a code change. `rush-add-on` has no fixed prices. Tests updated |
| S0-3c | Jersey number rule in the editor's design format: 1 or 2 digits up to a maximum held as data (99), English or Arabic digits, no mixing | editor-3d-dev | In progress | The rule is one exported plain function that the backend can reuse. Tests cover both digit sets, mixing, and the maximum |
| S0-7 | Store name from one setting (`NEXT_PUBLIC_STORE_NAME`, default FitMyOutfit) in place of "Medusa Store" | storefront-dev | In progress, as part of S0-2b | The name shows in the header, footer and page titles, and comes from one place. Tests updated |
| S0-8 | Home page headline from one data file, replacing the starter's hero text and Medusa banner (wording below) | storefront-dev | Waiting for S0-2b | The headline, subline and button label come from one file. Tests updated |

## Done
- **S0-3, editor package foundation: merged to `master` on 10 Nov** (merge commit `04982b2`). Verified by the coordinator before merging: lint, type-check, 147 tests, the library build with its entry-point check, and the demo build all pass; independent probes confirmed that the `/design` entry loads from CommonJS and from ES modules, and that the QA defects are fixed. The demo was seen rendering in a headless browser by QA in the first round; it was not re-checked visually after the fix round. Not tested on a real phone or GPU.
- S0-4: decisions [001 monorepo and tooling](decisions/001-monorepo-and-tooling.md), [002 email provider](decisions/002-email-provider.md), [003 hosting target](decisions/003-hosting-target.md) and [005 roster proof PDF through headless Chromium](decisions/005-pdf-via-headless-chromium.md). 005 replaces [004](decisions/004-pdf-library.md) after the founder allowed Arabic and Urdu names.
- Contract for the local setup and seed data: [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

## In progress
- S0-1 is with qa-reviewer. S0-2 is back with its worker after QA (S0-2b). S0-3 is merged; its follow-up S0-3c is being built.
- S0-1, as the worker reports it (not yet verified by QA): root lint, type-check and tests pass (29 unit, 9 integration, 7 script tests); the seed is idempotent; a file upload reached the MinIO bucket; the store API returns the contract's prices per region. Deviations the worker reported:
  - The MinIO images on Docker Hub and Quay could not be pulled, so compose uses Chainguard's MinIO images at `latest`, unpinned. QA is checking the claim.
  - Medusa's migrations already create a publishable key, so the seed reuses it instead of creating a second.
  - Medusa returns variants unordered. The seed fixes the order of the size option's values, which is what the storefront renders.
  - The rush add-on still has the fixed prices from the first contract; that is follow-up S0-6.
- S0-2 QA result (10 Nov): lint (0 errors, 3 warnings in starter code), type-check and 25 tests pass with no backend. QA ran the storefront against a stub server it wrote, not against Medusa, so the four region pages are still unproven against the real backend. Changes needed, sent back as S0-2b:
  - Must fix: the garments collection lookup is cached with no expiry, so an empty result sticks. Opening the storefront before the seed, or reseeding, leaves "No products yet." on screen until `.next` is deleted.
  - Should fix: the fit kit and rush add-on pages list each other and the garments under "Related products".
  - Tidy: pin the `@medusajs/*` packages (the starter uses `latest`), remove unused starter leftovers, correct two wrong defaults.
- QA's checklist for the integrated check against the real backend is kept for S0-5: API calls for regions, collection and products; the price table per region; size order on the product page; reseeding while the storefront runs; a cart smoke test.
- Open points from S0-2: `next build` needs a running, seeded backend (CI runs lint, type-check and tests only, so this does not block CI); the starter leaves `@medusajs/*` at `latest`, to be pinned to the backend version; the storefront has not been run against a real backend yet.
- S0-3 QA result (10 Nov): lint, type-check, 84 tests and the build pass, and QA saw the demo render, recolour and orbit in a headless browser. Changes needed before merge, sent back as S0-3b:
  - The `/design` entry can't be imported by the backend, which is CommonJS with Node16 module resolution.
  - The React peer range must be `^19.0.0`. The contract was wrong and is corrected.
  - Edit functions can produce a document that refers to an unknown font or pattern piece.
  - Three low-severity validation gaps.
- Noted for the editor's text-layer task (weeks 5 to 6), from QA's Arabic and Urdu probe. The design format accepts Arabic and Urdu text today, but:
  - it has no text-direction field, and alignment is left/right rather than start/end;
  - a font has one family, with no fallback per script;
  - text is not Unicode-normalised, which matters when comparing names;
  - number layers accept Western digits only, 1 to 3 of them. That limit should become data, and the roster checks in Sprint 2 need the same rule.

## Founder answers, 10 Nov 2026

Given in the coordinator session. critiques/DECISIONS.md and plan.md have not been changed.

| Question | Answer | Effect |
| --- | --- | --- |
| Where will the repo live? | GitHub | CI runs on GitHub Actions once the repo is pushed. The founder creates the repository; the GitHub CLI is not installed on the dev machine |
| Can jerseys carry Arabic or Urdu names? | Yes | PDF choice changed (decision 005). Sprint 2 roster checks allow Latin and Arabic script. The editor must shape right-to-left text, and one placeholder font must cover Arabic and Urdu |
| How is rush priced? | As a percentage | Task S0-6. Placeholder 20%, assumed to apply to the garments subtotal. The real percentage and what it applies to are still open |
| Store name? | FitMyOutfit, for now | Task S0-7. Read from one setting so it can change |
| Which digits can a jersey number use? | English (0 to 9) and Arabic (٠ to ٩) | Editor number layers and the Sprint 2 roster checks accept both. See the number rule below |
| Largest jersey number? | 99 | The limit is stored as a setting with the value 99, not written into code. The editor draft currently allows three digits; corrected in task S0-3c |

### Home page headline (placeholder, written by the coordinator at the founder's request)

The founder asked the coordinator to write a headline for now. It is a placeholder, stored as data so the founders can replace it without a code change. It makes no promise about price, delivery time or guarantees.

| Part | Wording |
| --- | --- |
| Headline | Design the kit. Drop the link. |
| Subline | Build your team's jersey in 3D, then share one link. Every player adds their own name, number and size. |
| Button | Start your team kit |

The button goes to the product listing until the editor is embedded in the storefront.

### Jersey number rule (from the two answers above)

The editor's number layers and the roster checks in Sprint 2 must apply the same rule, from one shared plain TypeScript module:

- A number is 1 or 2 digits, with a value from 0 to 99. The maximum is a setting.
- The digits are English (0 to 9) or Arabic (٠ to ٩). One number can't mix the two.
- **Duplicates are compared by value.** ٧ and 7 are the same number, so two players can't hold them in one team.

Assumptions the founders have not confirmed:

- The lowest number is 0.
- 7 and 07 are the same number, and it is stored as the player typed it.
- The Urdu and Persian digit forms (۰ to ۹), which look different from the Arabic ones for 4, 5 and 6, are accepted too, because Urdu names are allowed.

## Notes and known limits
- The GitHub remote is added (`origin`), but nothing has been pushed: the repository was public when checked on 10 Nov, and the founder is switching it to private first. Until the push, the CI workflow can't run, and the coordinator runs the same lint, type-check and test commands locally before each merge.
- The dev machine already runs a PostgreSQL on port 5432, so the project's database container is published on 5433.
- All prices and the size list in the seed are placeholders, stored as data.

## Blocked or waiting on founders
- Payment gateway applications under the UAE company: Stripe, PayPal, JazzCash, Easypaisa.
- Draft size list and garment-measurement chart, needed in week 2.
- First jersey 3D model with pattern panels, needed in week 3.
