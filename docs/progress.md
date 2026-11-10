# Development progress

Maintained by the coordinator agent. The backlog is in [dev-plan.md](../dev-plan.md), and technical decisions are in [decisions/](decisions/).

## Current sprint
Sprint 0 (week 1): setup. Started 10 Nov 2026.

**Done when** (from dev-plan.md): a new developer can run `docker compose up` plus one command, and see the storefront with the 3 products in all 4 regions.

### Tasks

The three coding tasks run in parallel, each in its own worktree, against [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

| # | Task | Owner | Status | Accepted when |
| --- | --- | --- | --- | --- |
| S0-1 | Root workspace, `docker-compose.yml` (PostgreSQL, Redis, MinIO), Medusa v2 backend, seed script, setup and dev commands, CI workflow | backend-dev | QA verdict (10 Nov): changes needed. Fix round S0-1b is queued behind S0-9, which is editing the same seed files. Not merged | Seed creates the 4 regions, 5 products and sample prices from data files, and is idempotent. `npm run setup` works on an empty database. Lint, type-check and tests pass |
| S0-2 | Next.js storefront from the Medusa starter, wired to the contract's environment variables | storefront-dev | **Merged to `master`** on 10 Nov after the QA fix round (S0-2b). Still not run against the real backend; that is part of S0-5 | `/pk`, `/gb`, `/ae` and `/us` list the 3 garments with prices in the region's currency, and product pages offer the sizes. Lint, type-check and tests pass |
| S0-3 | Editor package scaffold: build, demo page, first draft of the design JSON type, schema and validator | editor-3d-dev | **Done, merged to `master`** on 10 Nov after the QA fix round (S0-3b) | Package builds standalone with no Medusa or Next.js imports. Demo page shows an orbitable placeholder. Lint, type-check and tests pass |
| S0-4 | Three technical choices: email provider, hosting target, PDF library | coordinator | Done | Recorded in decisions 002, 003 and 005 (005 replaces 004) |
| S0-5 | QA review of each branch, merge, root lockfile, full check from a clean database | qa-reviewer, coordinator | Not started | The "done when" above is seen working on `master` |
| S0-6 | Rush as a percentage: drop the fixed rush prices from the seed, add the `rush_percentage` setting (placeholder 20) | backend-dev (Opus) | In progress, in the same task as S0-9 | The setting is seeded as data and can be changed without a code change. `rush-add-on` has no fixed prices. Tests updated |
| S0-3c | Jersey number rule in the editor's design format: 1 or 2 digits up to a maximum held as data (99), English or Arabic digits, no mixing | editor-3d-dev | **Done, merged to `master`** on 10 Nov | The rule is one exported plain function that the backend can reuse. Tests cover both digit sets, mixing, and the maximum |
| S0-7 | Store name from one setting (`NEXT_PUBLIC_STORE_NAME`, default FitMyOutfit) in place of "Medusa Store" | storefront-dev | **Done**, merged with S0-2b | The name shows in the header, footer and page titles, and comes from one place. Tests updated |
| S0-9 | Placeholder product images. **Changed by the founder on 10 Nov:** use ready-made images from the web, as URLs in the seed data; do not generate images. The worker was briefed before this change and is still building generated images; it is redirected when it reports | backend-dev (Opus) | In progress since 10 Nov, started before the QA result at the founder's request. Built on top of the unmerged backend branch, together with S0-6 | Each of the 5 products has a thumbnail in the store API, the storefront shows it on listings and product pages, and the images are placeholders stored as data |
| S0-10 | One TypeScript version and one ESLint major version across the three workspaces ([decision 006](decisions/006-react-and-tool-versions.md)) | storefront-dev, editor-3d-dev | Not started; after the backend is merged | The root install has one copy of TypeScript and one of ESLint. Lint, type-check and tests still pass in all three |
| S0-1b | Backend fixes from QA: seed repairs a half-finished run; store currencies are exactly the four; dev secrets refused in production; CI does not set `REDIS_URL` for tests; regions matched by country code; stable product order; setup does not print the admin password. Also: placeholder images become URLs in the seed data (founder's direction) | backend-dev (Opus) | Queued behind S0-9 | Each QA defect has a test that fails on the old code. Root lint, type-check and tests pass |
| S0-11 | Product page button says "Out of stock" before a size is picked, on made-to-order products. Change to "Select a size" | storefront-dev | **Done, merged to `master`** on 10 Nov | The label is "Select a size" until a size is chosen, then "Add to cart". "Out of stock" only for a variant that truly can't be bought. Same on mobile. Tests cover each case |
| S0-12 | Product page images as a carousel (swipe on phones, arrows and thumbnails on desktop) instead of a stacked list. Founder's request, 10 Nov | storefront-dev | In progress. The worker must look at it in a browser at desktop and true phone width, not only test it | One image shows at a time; the customer can move between images by swipe, arrow, thumbnail and keyboard. No layout jump while an image loads. Tests updated |
| S0-13 | Design research: the most user-friendly storefront designs among custom teamwear stores and Shopify apparel themes, written up as a design direction for the founder to approve. Founder's request, 10 Nov | storefront-designer (Opus) | In progress | A design brief in `docs/design/` with a source URL for every claim about another site, evidence kept apart from opinion, and a recommended direction for the home page, listing, product page, header and footer |
| S0-8 | Home page headline from one data file, replacing the starter's hero text and Medusa banner (wording below) | storefront-dev | **Done, merged to `master`** on 10 Nov | The headline, subline and button label come from one file. Tests updated |

## Done
- **S0-3, editor package foundation: merged to `master` on 10 Nov** (merge commit `04982b2`). Verified by the coordinator before merging: lint, type-check, 147 tests, the library build with its entry-point check, and the demo build all pass; independent probes confirmed that the `/design` entry loads from CommonJS and from ES modules, and that the QA defects are fixed. The demo was seen rendering in a headless browser by QA in the first round; it was not re-checked visually after the fix round. Not tested on a real phone or GPU.
- **S0-2 and S0-7, storefront and store name: merged to `master` on 10 Nov** (merge commit `75586e1`). Verified by the coordinator before merging: lint (0 errors, 3 warnings in starter code), type-check and 41 tests pass with no backend. **Not verified:** the storefront has never been run against the real backend, and the cache fix was tested against a fake cache only. Both are checked in S0-5. Known gap to test there: other starter calls, including the region list, are still cached with no expiry, which may show stale regions after a database reset.
- **S0-3c, jersey number rule: merged to `master` on 10 Nov** (merge commit `ab765b0`). The rule lives in `packages/editor/src/design/jersey-number.ts`, with its limits as data in `jersey-number-rules.ts`, and is exported from `@fitmyoutfit/editor/design`. Verified by the coordinator before merging: lint, type-check, 243 tests and the build pass; independent probes from CommonJS confirmed the rule for all three digit systems, duplicates by value, changed limits, and number layers in the design document. The worker saw the demo render and recolour in headless Chrome. **Sprint 2 note:** the roster checks must call these functions (`checkJerseyNumber`, `findDuplicateJerseyNumbers`) rather than write their own.
- **S0-8, home page headline: merged to `master` on 10 Nov** (merge commit `a1d52ea`). The copy is in `storefront/src/content/home.ts`. The starter's hero text, the "Powered by Medusa" banner, the footer's Medusa links and the onboarding call-to-action are removed. Verified by the coordinator before merging: the wording is exact and appears only in the content file; lint (0 errors, 3 starter warnings), type-check and 52 tests pass. **Not verified:** the hero has been seen in tests only. Its look in a browser, and at phone width, is checked in S0-5.
- S0-4: decisions [001 monorepo and tooling](decisions/001-monorepo-and-tooling.md), [002 email provider](decisions/002-email-provider.md), [003 hosting target](decisions/003-hosting-target.md) and [005 roster proof PDF through headless Chromium](decisions/005-pdf-via-headless-chromium.md). 005 replaces [004](decisions/004-pdf-library.md) after the founder allowed Arabic and Urdu names.
- Contract for the local setup and seed data: [contracts/sprint-0-dev-setup.md](contracts/sprint-0-dev-setup.md).

## In progress
- S0-1 is with qa-reviewer. S0-2, S0-3, S0-3c, S0-7 and S0-8 are merged. S0-6 and S0-5 wait for S0-1.
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

## Standing instructions from the founder

- **Worker models (10 Nov 2026):** use the Opus model for difficult worker tasks. The coordinator passes the model override on those tasks; routine and mechanical tasks stay on each agent's default model. Counted as difficult so far: Medusa backend work (modules, workflows, seed, payments) and the reviews of it.

## Notes and known limits
- **Verification rule, after the coordinator's miss on 10 Nov.** The coordinator told the founder that product images were working after checking only that the image links were in the page and loaded. One image was a white shirt on a near-white card, invisible in practice, and the home page was a large empty block; the founder found both. From now on, nothing visible is reported as ready until someone has opened a screenshot of the rendered page. Workers on visible changes are briefed to do the same. A desktop Chrome window can't be narrowed below about 500 px, so phone-width checks need real device emulation; a narrow window size only crops a wider layout.
- **S0-1 QA result (10 Nov): changes needed.** What QA confirmed: root lint, type-check and tests pass (29 unit, 9 integration, 7 script tests); a clean `npm ci` and a backend build work; setup on an empty database works and is safe to re-run; the store API returns the contract's regions, products, prices and size order; a real upload reaches the storage bucket; CORS is correct. Must fix before merge (task S0-1b):
  - The seed does not repair a half-finished run. If it is interrupted, a re-run leaves sizes unordered, a product unpriced, or the admin unable to log in.
  - Store currencies are five, not four: Medusa's default euro is left in.
  - The dev-only secrets from `.env.example` are accepted when the backend runs in production mode.
  - The CI workflow sets `REDIS_URL` for the tests, which made the integration tests about eight times slower (47 s to 391 s) and is a timeout risk.
  - Lower priority, same round: renaming a seeded region in the admin breaks setup; the five products share one creation time, so listing order is not stable; setup prints the admin password.
- **QA's workspace warning, checked.** QA predicted that the combined install could give the storefront two copies of React and break it. The coordinator ran the real combined install and the storefront from it: pages render, and the browser console showed no React or hydration errors on the three pages loaded. Not yet exercised: adding to a cart and checkout. Keep watching.
- **MinIO images:** QA confirmed that the usual MinIO images can't be pulled, so the Chainguard images stay. They are unpinned; record or pin the digest in a follow-up.
- **Seen in the preview, for the designer:** the "Select a size" button does not look like a button, and the size buttons have uneven widths across two rows.
- **Design agent:** `storefront-designer` was created on 10 Nov at the founder's request (`.claude/agents/storefront-designer.md`). Sessions load their agent list at startup, so in the session that created it the role was run through a general agent reading that definition.
- **The storefront's look is not in either plan (found 10 Nov).** The founder saw the preview and called it childish-looking. It is the stock Medusa template with stand-in photos. Neither plan.md nor dev-plan.md has any task for the storefront's visual design or branding; the graphic designer in the plans is for jersey templates. The founder's direction: study the most user-friendly designs in this domain and in Shopify themes (task S0-13), then improve the storefront. The redesign itself is new scope, proposed as the first item of Sprint 1 once the founder approves a direction. dev-plan.md has not been changed.
- **Integration rehearsal (10 Nov), on a private copy of `master` plus the unreviewed backend branch.** One root `npm install` covers all three workspaces (1,920 packages, about 7 minutes). `npm run setup` ran cleanly and the seed created nothing new on the already-seeded database. With the backend on port 9002 and the storefront on 8000, the coordinator loaded the pages and saw: `/pk`, `/gb`, `/ae` and `/us` each list Jersey, T-Shirt and Jacket at the contract's prices in the region's currency; product pages show the sizes in the contract's order; the fit kit page shows its price and no related-products block. Not yet done on this copy: root lint, type-check and tests; a cart smoke test; a reseed while the storefront runs; a look in a real browser at phone width.
- **Two React versions are installed, and that is expected** ([decision 006](decisions/006-react-and-tool-versions.md)): 18 for Medusa's admin, 19 for the storefront and editor.
- **No product images (found 10 Nov in the founder's preview).** The seed creates products with no images, because the Sprint 0 contract did not ask for any. The storefront shows empty image boxes. Fixed by task S0-9.
  - **Stop-gap on the preview database (10 Nov):** the coordinator set Medusa's public demo images on the five products in the `medusa` database through the admin API. The coordinator then confirmed that listings and product pages in all four regions contain the images, and that the storefront's image optimizer serves them. This is data in one local database, not code: a fresh database has no images until S0-9 is merged.
- **First preview (10 Nov) was unreliable.** The coordinator pointed the storefront at the backend that qa-reviewer was running on its scratch database. QA then rebuilt that database and stopped the backend, so the founder saw "fetch failed" and "A valid publishable key is required". Neither is a product defect. Previews now run from a private copy (`.claude/worktrees/integration-preview`, local only) on the real `medusa` database.
- The GitHub remote is added (`origin`), but nothing has been pushed: the repository was public when checked on 10 Nov, and the founder is switching it to private first. Until the push, the CI workflow can't run, and the coordinator runs the same lint, type-check and test commands locally before each merge.
- The dev machine already runs a PostgreSQL on port 5432, so the project's database container is published on 5433.
- All prices and the size list in the seed are placeholders, stored as data.

## Blocked or waiting on founders
- Payment gateway applications under the UAE company: Stripe, PayPal, JazzCash, Easypaisa.
- Draft size list and garment-measurement chart, needed in week 2.
- First jersey 3D model with pattern panels, needed in week 3.
