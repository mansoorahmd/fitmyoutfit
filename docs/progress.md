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
| S0-2 | Next.js storefront from the Medusa starter, wired to the contract's environment variables | storefront-dev | In progress | `/pk`, `/gb`, `/ae` and `/us` list the 3 garments with prices in the region's currency, and product pages offer the sizes. Lint, type-check and tests pass |
| S0-3 | Editor package scaffold: build, demo page, first draft of the design JSON type, schema and validator | editor-3d-dev | In progress | Package builds standalone with no Medusa or Next.js imports. Demo page shows an orbitable placeholder. Lint, type-check and tests pass |
| S0-4 | Three technical choices: email provider, hosting target, PDF library | coordinator | Done | Recorded in decisions 002, 003 and 004 |
| S0-5 | QA review of each branch, merge, root lockfile, full check from a clean database | qa-reviewer, coordinator | Not started | The "done when" above is seen working on `master` |

## Done
- S0-4: decisions [001 monorepo and tooling](decisions/001-monorepo-and-tooling.md), [002 email provider](decisions/002-email-provider.md), [003 hosting target](decisions/003-hosting-target.md) and [004 PDF library](decisions/004-pdf-library.md).
- Contract for the local setup and seed data: [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

## In progress
- S0-1, S0-2 and S0-3 (see the table).

## Notes and known limits
- The repo has no git remote, so the CI workflow can't run yet. Until the repo is on GitHub, the coordinator runs the same lint, type-check and test commands locally before each merge.
- The dev machine already runs a PostgreSQL on port 5432, so the project's database container is published on 5433.
- All prices and the size list in the seed are placeholders, stored as data.

## Blocked or waiting on founders
- Payment gateway applications under the UAE company: Stripe, PayPal, JazzCash, Easypaisa.
- Draft size list and garment-measurement chart, needed in week 2.
- First jersey 3D model with pattern panels, needed in week 3.
