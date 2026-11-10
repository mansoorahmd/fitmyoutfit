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
- Store currencies: those four, PKR as default.
- Products: `jersey`, `t-shirt`, `jacket` (11 size variants each, in the `garments` collection), plus `fit-kit` and `rush-add-on` (one variant each, no collection). Each has `metadata.kind`. Inventory is not managed (made to order).
- Sample prices in all four currencies. Amounts are in major units (3500 means Rs 3,500), as Medusa v2 stores them.
- The default sales channel and a publishable API key linked to it.
- The local admin user.
- Minimum extras Medusa needs: the default shipping profile (created by Medusa's own migration). No stock location, shipping options, tax regions or payment providers yet: those are Sprint 1.

Check it: with the backend running,

```
curl -H "x-publishable-api-key: <key from storefront/.env.local>" http://localhost:9000/store/regions
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Env files, migrations, seed, publishable key (idempotent) |
| `npm run dev` | Backend and storefront together (a missing workspace is skipped) |
| `npm run lint` | ESLint in every workspace, plus a syntax check of `scripts/` |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run test` | Tests in every workspace, plus `scripts/` tests |
| `npm run build` | Production build of every workspace |

Backend only: `npm run <script> -w backend` (`dev`, `build`, `migrate`, `seed`, `test:unit`, `test:integration:http`).

Backend integration tests create and drop temporary databases on the PostgreSQL server (host `localhost`, port 5433 by default, user `medusa`). They never touch the `medusa` development database. Start `docker compose up -d` first. To point them elsewhere set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, as the CI workflow does.

## Reset the database

Drop and recreate only the Medusa database, keeping Redis and MinIO data:

```
docker compose exec postgres psql -U medusa -d postgres -c "DROP DATABASE medusa WITH (FORCE)" -c "CREATE DATABASE medusa"
npm run setup
```

Stop the backend first. The compose project is shared by every git worktree, so this resets the database for all of them.

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
- **CI.** `.github/workflows/ci.yml` runs `npm ci`, then root `lint`, `typecheck` and `test` on every push and pull request, with PostgreSQL and Redis service containers.
