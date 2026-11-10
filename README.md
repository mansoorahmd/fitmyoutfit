# FitMyOutfit

Custom apparel store where teams and clubs design jerseys, T-shirts and jackets in 3D and order them. Medusa v2 backend, Next.js storefront, and a 3D editor package. Project context is in [CLAUDE.md](CLAUDE.md), the plan in [dev-plan.md](dev-plan.md).

| Folder | Contents |
| --- | --- |
| `backend/` | Medusa v2 (`@fitmyoutfit/backend`) |
| `storefront/` | Next.js storefront (`@fitmyoutfit/storefront`) |
| `packages/editor/` | 3D editor (`@fitmyoutfit/editor`) |
| `scripts/` | Root setup and dev scripts (plain Node, work on Windows and Linux) |

## Prerequisites

- Node 20.19 or newer (22 recommended) and npm 10 or newer
- Docker with Compose v2 (Docker Desktop on Windows and macOS)
- Free host ports: 9000 (backend), 8000 (storefront), 5433 (PostgreSQL), 6379 (Redis), 9100 and 9101 (MinIO)

## Quick start

```
docker compose up -d     # PostgreSQL, Redis, MinIO. Wait until `docker compose ps` shows them healthy
npm install
npm run setup            # safe to run again
npm run dev              # backend on :9000, storefront on :8000
```

`npm run quickstart` runs `setup` and then `dev`.

`npm run setup` does this, and skips whatever is already done:

1. Creates `.env`, `backend/.env` and `storefront/.env.local` from the `.env.example` files, if missing. It never overwrites an existing file.
2. Runs the database migrations.
3. Seeds the placeholder store data and the local admin user (see below). The seed only creates what is missing, so values you edited in the admin survive a re-run.
4. Writes the publishable API key into `storefront/.env.local` (only that one line; if `storefront/` does not exist yet it warns and skips).

## Ports

| Service | Host port | Notes |
| --- | --- | --- |
| Medusa backend and API | 9000 | Admin at <http://localhost:9000/app> |
| Storefront | 8000 | |
| PostgreSQL | 5433 | Not 5432, so it does not clash with a PostgreSQL already on your machine |
| Redis | 6379 | |
| MinIO S3 API | 9100 | Bucket `fitmyoutfit-dev`, created automatically |
| MinIO console | 9101 | <http://localhost:9101>, login `minioadmin` / `minioadmin` |

To change a host port, set it in the root `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`), update the matching URL in `backend/.env` (`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_FILE_URL`), then run `docker compose up -d` again.

## Local admin login (dev only)

<http://localhost:9000/app> with the email and password from `backend/.env`. The defaults are:

- Email: `admin@fitmyoutfit.local`
- Password: `dev-admin-password`

These are throwaway development values. Never use them anywhere else.

## What the seed creates

All of it is placeholder data, kept in `backend/src/scripts/seed-data/` (one file per kind, each marked `placeholder: true` with a note on what the real input is). Replace the data, not the code.

- 4 regions: Pakistan (PKR), United Kingdom (GBP), United Arab Emirates (AED), United States (USD). Region metadata `tax_final: false` is the data behind the "tax not final" label.
- Store currencies: those four, PKR as default. A currency added in the admin is kept on a re-run; only Medusa's starter currency `eur` is removed, and only while no region uses it.
- Products: `jersey`, `t-shirt`, `jacket` (11 size variants each, in the `garments` collection), plus `fit-kit` and `rush-add-on` (one variant each, no collection). Each has `metadata.kind`. Inventory is not managed (made to order).
- Placeholder product images, as web URLs in `products.ts` (`images.urls`, marked `placeholder: true`): stand-in photos from spized.com for the jersey, T-shirt, jacket and fit kit, and a Medusa demo photo for the rush add-on. The seed sets the first URL as the thumbnail and all of them as the product's images, only when the product has no thumbnail and no images, so a photo set in the admin is never replaced. Nothing is downloaded or uploaded, and no image file is kept in the repo. **These photos belong to another store: local development only.** They must be replaced by our own product photos before anything is deployed where the public can see it. To change a picture, edit the URL in `products.ts` (on an existing database, remove the product's images in the admin first, or reset the database).
- Sample prices in all four currencies for `jersey`, `t-shirt`, `jacket` and `fit-kit`. Amounts are in major units (3500 means Rs 3,500), as Medusa v2 stores them. Which products have fixed prices is data too (`has_fixed_prices` in `products.ts`).
- Rush: `rush-add-on` has **no fixed prices**. Rush is priced as a percentage of the order, held in the store setting `rush_percentage` (placeholder `20`, in `seed-data/settings.ts`). The seed writes it into the Store's metadata only when it is missing, so after the first run the value lives in the database: change it in the admin under **Settings > Store > Metadata**. Code reads it with `readRushPercentage` (`backend/src/lib/settings/rush-percentage.ts`). The charge itself is Sprint 1.
- The default sales channel and a publishable API key linked to it.
- The local admin user (only when `NODE_ENV` is unset, `development` or `test`).
- The store's name, `FitMyOutfit` (only while the store still has Medusa's default name, so a name set in the admin is kept).
- Minimum extras Medusa needs: the default shipping profile (created by Medusa's own migration). No stock location, shipping options, tax regions or payment providers yet: those are Sprint 1.

The products are listed in the order of `products.ts` (jersey, t-shirt, jacket, fit-kit, rush-add-on) when no other order is asked for. Regions are recognised by their country code, so you can rename them in the admin.

**An interrupted seed is repaired by the next run.** Medusa writes a product, its variants, prices, size order and links in separate steps, so a seed stopped half-way can leave a product without prices or with sizes out of order, or an admin user without a login. Each run checks those parts on their own and fills in only what is missing (it never overwrites a value an admin can edit): a variant missing its price in one seed currency gets that price (its other prices are left as they are), and a seed variant that lost its size value gets it back. The run's last log line lists everything it repaired. What it cannot repair safely (for example a size value that another variant already has) it leaves alone and names in a warning. The exceptions are on purpose: the four seed currencies are always supported with PKR as the only default (Medusa's starter `eur` is removed while no region uses it), and a store still named "Medusa Store" is renamed. The rush add-on is never given prices.

Check it: with the backend running,

```
curl -H "x-publishable-api-key: <key from storefront/.env.local>" http://localhost:9000/store/regions
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Env files, migrations, seed, publishable key (idempotent) |
| `npm run dev` | Backend and storefront together (a missing part is skipped) |
| `npm run lint` | ESLint in the backend, storefront and editor, and in `scripts/` |
| `npm run typecheck` | `tsc --noEmit` in the backend, storefront and editor |
| `npm run test` | Tests in the backend, storefront and editor, plus `scripts/` tests |
| `npm run build` | Production build of the backend, storefront and editor |

Backend only: `npm run <script> --prefix backend` (`dev`, `build`, `migrate`, `seed`, `test:unit`, `test:integration:http`). Storefront or editor only: `npm run <script> -w storefront` or `-w packages/editor`.

## Installing and adding dependencies

The backend is **not** an npm workspace. Medusa's admin runs on React 18 and the storefront and editor on React 19; in one shared install npm put React 18 at the root, where the storefront's libraries picked it up (see `docs/decisions/006-react-and-tool-versions.md`). So there are two installs, each with its own lockfile:

| Folder | Lockfile | Contains |
| --- | --- | --- |
| repo root | `package-lock.json` | the workspaces `storefront` and `packages/editor` |
| `backend/` | `backend/package-lock.json` | the backend only |

A root `npm install` (or `npm ci`) does both: when the root install finishes, its `postinstall` script (`scripts/install-backend.mjs`) runs `npm install` (or `npm ci`) in `backend/`. `npm run install:backend` runs only the backend part.

To add a dependency:

```
npm install <package> --prefix backend      # backend (updates backend/package-lock.json)
npm install <package> -w storefront         # storefront (updates the root package-lock.json)
npm install <package> -w packages/editor    # editor (updates the root package-lock.json)
```

The root `package.json` has one `overrides` entry: it lets `@medusajs/ui` (which declares React 18 as its peer) use the storefront's React 19, as Medusa's own storefront starter does. It does not reach the backend, whose install is separate. Keep its version equal to the storefront's `react`.

Backend integration tests create and drop temporary databases on the PostgreSQL server (host `localhost`, port 5433 by default, user `medusa`). They never touch the `medusa` development database. Start `docker compose up -d` first. To point them elsewhere set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, as the CI workflow does. Medusa also reads `backend/.env` in tests, so with `REDIS_URL` set there the tests use Redis, which makes them several times slower; CI has no `backend/.env` and sets no `REDIS_URL`, so there they use Medusa's in-memory modules. The tests use no network: image tests check the stored URLs only.

**Production start.** With any `NODE_ENV` other than `development` or `test` (or unset), so `production`, `prod` (Medusa's own production mode), `staging` and anything else, in any case, the backend refuses to start when `JWT_SECRET`, `COOKIE_SECRET`, `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` is missing, when `JWT_SECRET` or `COOKIE_SECRET` is shorter than 16 characters, when `DATABASE_URL` uses the dev database login `medusa:medusa`, or when any of these or `MEDUSA_ADMIN_PASSWORD` still has its dev value from `backend/.env.example` (compared ignoring case and surrounding spaces). It lists every problem and exits (`backend/src/lib/config/build-config.ts`; which `NODE_ENV` counts as what is in `node-env.ts` next to it). Medusa's `supersecret` fallback is used only in development and test. The seed creates the dev admin user only in development and test.

## Reset the database

Drop and recreate only the Medusa database, keeping Redis and MinIO data:

```
docker compose exec postgres psql -U medusa -d postgres -c "DROP DATABASE medusa WITH (FORCE)" -c "CREATE DATABASE medusa"
npm run setup
```

Stop the backend first. The compose project is shared by every git worktree, so this resets the database for all of them.

**Databases seeded before 10 Nov 2026** still have fixed prices on `rush-add-on` (PKR 500, GBP 4, AED 15, USD 5), and products that already have images keep them (for example Medusa's demo photos): the seed does not delete prices or replace images, so a re-run only adds the `rush_percentage` setting, images on products that have none, and whatever an interrupted run left out. Their products also stay in a random order in the store (the order of `products.ts` comes from the product ids, which are chosen only when a product is created) until the database is reset. Reset it as above to get the current data (products in seed order, rush with no fixed prices, the spized.com stand-in photos):

```
docker compose exec postgres psql -U medusa -d postgres -c "DROP DATABASE medusa WITH (FORCE)" -c "CREATE DATABASE medusa"
npm run setup
```

Wipe everything (PostgreSQL, Redis and MinIO volumes) and start over:

```
docker compose down -v
docker compose up -d
npm run setup
```

## Notes

- **MinIO image.** MinIO no longer publishes official Docker images (`minio/minio` is gone from Docker Hub and Quay). `docker-compose.yml` uses the Chainguard build, `cgr.dev/chainguard/minio:latest`, for local development only.
- **File storage.** The backend uses Medusa's S3 file provider pointed at MinIO when the `S3_*` variables in `backend/.env` are set (path-style addressing is turned on automatically when `S3_ENDPOINT` is set). With them empty it falls back to local files in `backend/static`.
- **Redis.** The cache, event bus and workflow engine use `REDIS_URL`. Remove it from `backend/.env` to run with Medusa's in-memory versions.
- **CI.** `.github/workflows/ci.yml` runs `npm ci`, then root `lint`, `typecheck` and `test` on every push and pull request, with a PostgreSQL service container. The test job sets no `REDIS_URL` (with it the integration tests ran about eight times slower).
