# Development progress

Maintained by the coordinator agent. The backlog is in [dev-plan.md](../dev-plan.md), and technical decisions are in [decisions/](decisions/).

## Current sprint
Sprint 0 (week 1): setup. Started 10 Nov 2026.

**Done when** (from dev-plan.md): a new developer can run `docker compose up` plus one command, and see the storefront with the 3 products in all 4 regions.

### Tasks

The three coding tasks run in parallel, each in its own worktree, against [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

| # | Task | Owner | Status | Accepted when |
| --- | --- | --- | --- | --- |
| S0-1 | Root workspace, `docker-compose.yml` (PostgreSQL, Redis, MinIO), Medusa v2 backend, seed script, setup and dev commands, CI workflow | backend-dev | In progress | Seed creates the 4 regions, 5 products and sample prices from data files, and is idempotent. `npm run setup` works on an empty database. Lint, type-check and tests pass |
| S0-2 | Next.js storefront from the Medusa starter, wired to the contract's environment variables | storefront-dev | In QA review (worker reported 10 Nov; branch `worktree-agent-ab58c40689e820697`). Not yet checked against a real backend | `/pk`, `/gb`, `/ae` and `/us` list the 3 garments with prices in the region's currency, and product pages offer the sizes. Lint, type-check and tests pass |
| S0-3 | Editor package scaffold: build, demo page, first draft of the design JSON type, schema and validator | editor-3d-dev | In QA review (worker reported 10 Nov; branch `worktree-agent-a9ccde12333187787`) | Package builds standalone with no Medusa or Next.js imports. Demo page shows an orbitable placeholder. Lint, type-check and tests pass |
| S0-4 | Three technical choices: email provider, hosting target, PDF library | coordinator | Done | Recorded in decisions 002, 003 and 005 (005 replaces 004) |
| S0-5 | QA review of each branch, merge, root lockfile, full check from a clean database | qa-reviewer, coordinator | Not started | The "done when" above is seen working on `master` |
| S0-6 | Rush as a percentage: drop the fixed rush prices from the seed, add the `rush_percentage` setting (placeholder 20) | backend-dev | Waiting for S0-1 | The setting is seeded as data and can be changed without a code change. `rush-add-on` has no fixed prices. Tests updated |
| S0-7 | Store name from one setting (`NEXT_PUBLIC_STORE_NAME`, default FitMyOutfit) in place of "Medusa Store" | storefront-dev | Waiting for S0-2 | The name shows in the header, footer and page titles, and comes from one place. Tests updated |

## Done
- S0-4: decisions [001 monorepo and tooling](decisions/001-monorepo-and-tooling.md), [002 email provider](decisions/002-email-provider.md), [003 hosting target](decisions/003-hosting-target.md) and [005 roster proof PDF through headless Chromium](decisions/005-pdf-via-headless-chromium.md). 005 replaces [004](decisions/004-pdf-library.md) after the founder allowed Arabic and Urdu names.
- Contract for the local setup and seed data: [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

## In progress
- S0-1 is being built. S0-2 and S0-3 are with qa-reviewer; not merged.
- Open points from S0-2: `next build` needs a running, seeded backend (CI runs lint, type-check and tests only, so this does not block CI); the starter leaves `@medusajs/*` at `latest`, to be pinned to the backend version; the storefront has not been run against a real backend yet.
- Open point from S0-3: `@react-three/fiber` 9 supports React 19 only, so the editor peer range `^18 || ^19` in the contract is wrong. To be changed to `^19` once QA confirms.

## Founder answers, 10 Nov 2026

Given in the coordinator session. critiques/DECISIONS.md and plan.md have not been changed.

| Question | Answer | Effect |
| --- | --- | --- |
| Where will the repo live? | GitHub | CI runs on GitHub Actions once the repo is pushed. The founder creates the repository; the GitHub CLI is not installed on the dev machine |
| Can jerseys carry Arabic or Urdu names? | Yes | PDF choice changed (decision 005). Sprint 2 roster checks allow Latin and Arabic script. The editor must shape right-to-left text, and one placeholder font must cover Arabic and Urdu |
| How is rush priced? | As a percentage | Task S0-6. Placeholder 20%, assumed to apply to the garments subtotal. The real percentage and what it applies to are still open |
| Store name? | FitMyOutfit, for now | Task S0-7. Read from one setting so it can change |

## Notes and known limits
- The repo has no git remote, so the CI workflow can't run yet. Until the repo is on GitHub, the coordinator runs the same lint, type-check and test commands locally before each merge.
- The dev machine already runs a PostgreSQL on port 5432, so the project's database container is published on 5433.
- All prices and the size list in the seed are placeholders, stored as data.

## Blocked or waiting on founders
- Payment gateway applications under the UAE company: Stripe, PayPal, JazzCash, Easypaisa.
- Draft size list and garment-measurement chart, needed in week 2.
- First jersey 3D model with pattern panels, needed in week 3.
