# Contract: local dev setup and seed data (Sprint 0)

Written by the coordinator before Sprint 0 work started. The three workers build against this in parallel, in separate worktrees. If something here turns out to be wrong or impossible, report it to the coordinator. Don't quietly deviate.

## Repo layout and tooling

| Item | Value |
| --- | --- |
| Package manager | npm workspaces (see [decision 001](../decisions/001-monorepo-and-tooling.md)) |
| Node | 22 (the version on the dev machine); `engines` set to `>=20` |
| Language | TypeScript everywhere |
| Workspaces | `storefront`, `packages/*`. The backend has its own install and lockfile in `backend/`, installed by the root `postinstall` (changed 11 Nov, [decision 006](../decisions/006-react-and-tool-versions.md)) |
| Package names | `@fitmyoutfit/backend`, `@fitmyoutfit/storefront`, `@fitmyoutfit/editor` |
| React | 19 in the storefront and the editor. The editor declares `react` and `react-dom` as peer dependencies at `^19.0.0`. (Corrected 10 Nov 2026: the first version of this contract allowed React 18 as well, but `@react-three/fiber` 9 supports React 19 only, and currently only below 19.4) |
| Editor entry points | `@fitmyoutfit/editor` (the React component) and `@fitmyoutfit/editor/design` (design-document functions and types, with no React or Three.js). The `/design` entry must be importable from the backend, which is a CommonJS project using TypeScript `Node16` module resolution |

### Scripts every workspace must expose

| Script | Meaning |
| --- | --- |
| `dev` | Start in development mode |
| `build` | Production build |
| `lint` | ESLint, exits non-zero on errors |
| `typecheck` | `tsc --noEmit` (or equivalent), exits non-zero on errors |
| `test` | Run tests once (no watch mode), exits non-zero on failure |

The root `package.json` (owned by backend-dev) runs these across workspaces: `npm run lint`, `npm run typecheck`, `npm run test`. CI calls the root scripts.

### Lockfiles

**Changed 11 Nov:** there are two lockfiles: `package-lock.json` at the repo root (storefront and editor) and `backend/package-lock.json` (backend). Both are committed. The rest of this section describes how the workers started, before the root install existed.

There will be one lockfile, `package-lock.json` at the repo root. The storefront and editor workers build in worktrees where the root `package.json` doesn't exist yet, so they run `npm install` inside their own folder and **must not commit** a `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml` in their folder. The coordinator generates the root lockfile after the three branches are merged.

## Ports

| Service | Host port | Notes |
| --- | --- | --- |
| Medusa backend and admin | 9000 | Admin at `/app` |
| Storefront | 8000 | The Medusa Next.js starter default |
| PostgreSQL | **5433** | Not 5432: the dev machine already runs a local PostgreSQL on 5432. Container port stays 5432 |
| Redis | 6379 | |
| MinIO S3 API | **9100** | Not 9000: that would clash with Medusa. Container port stays 9000 |
| MinIO console | 9101 | Container port 9001 |

Host ports must be overridable through variables in the root `.env` (with the defaults above), so a developer with a clash can change them.

`docker-compose.yml` sets the compose project name to `fitmyoutfit` (top-level `name:`), so every worktree talks to the same containers and volumes.

## Environment variables

Real `.env` files are gitignored. Commit `.env.example` files only. Note that `.gitignore` ignores `.env.*` except `.env.example`, so a file named `.env.template` would be silently ignored: name it `.env.example`.

Backend (`backend/.env.example`):

| Variable | Dev default |
| --- | --- |
| `DATABASE_URL` | `postgres://medusa:medusa@localhost:5433/medusa` |
| `REDIS_URL` | `redis://localhost:6379` |
| `STORE_CORS` | `http://localhost:8000` |
| `ADMIN_CORS` | `http://localhost:9000` |
| `AUTH_CORS` | `http://localhost:8000,http://localhost:9000` |
| `JWT_SECRET`, `COOKIE_SECRET` | Dev-only values, clearly marked "change in production" |
| `S3_ENDPOINT` | `http://localhost:9100` |
| `S3_BUCKET` | `fitmyoutfit-dev` |
| `S3_REGION` | `us-east-1` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The MinIO dev credentials from `docker-compose.yml` |
| `S3_FILE_URL` | `http://localhost:9100/fitmyoutfit-dev` |

Storefront (`storefront/.env.example`):

| Variable | Dev default |
| --- | --- |
| `MEDUSA_BACKEND_URL` | `http://localhost:9000` |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Empty in the example. Written into `storefront/.env.local` by the root setup script |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:8000` |
| `NEXT_PUBLIC_DEFAULT_REGION` | `pk` |
| `NEXT_PUBLIC_STORE_NAME` | `FitMyOutfit` (added 10 Nov 2026, see "Store name" below) |

If the Medusa starter needs other variables, keep its names and add them to `.env.example`.

## Commands a new developer runs

```
docker compose up -d
npm install
npm run setup     # idempotent: creates .env files from the examples if missing, runs migrations, seeds, writes the publishable key into storefront/.env.local
npm run dev       # starts backend (9000) and storefront (8000) together
```

`npm run quickstart` chains `setup` and `dev`, so the sprint's "docker compose up plus one command" holds once dependencies are installed.

The root setup script is owned by backend-dev. It may **write the gitignored file** `storefront/.env.local`; that is not an edit to storefront source. It must not fail if `storefront/` doesn't exist yet (it won't, in the backend worktree): warn and skip that step.

## Seed data

All of this is placeholder data. It lives in data files (JSON or TS data modules under `backend/src/scripts/seed-data/`), never inline in logic, and each file says it is a placeholder. The seed must be **idempotent**: running it twice creates nothing twice and doesn't fail.

### Regions

| Region name | Currency | Country code | Region metadata |
| --- | --- | --- | --- |
| Pakistan | `pkr` | `pk` | `tax_final: false` |
| United Kingdom | `gbp` | `gb` | `tax_final: false` |
| United Arab Emirates | `aed` | `ae` | `tax_final: false` |
| United States | `usd` | `us` | `tax_final: false` |

The store's supported currencies are those four, with `pkr` as the default. On a fresh database there are exactly those four. On a re-run the seed adds any of the four that is missing and removes only `eur` (the starter's default), and only when no region uses it; a currency an admin added is left alone (changed 11 Nov after the second QA review). `tax_final: false` is the data behind the "tax not final" label the dev plan asks for; the label itself is Sprint 1 storefront work.

### Products

All products are published, in the default sales channel, and made to order: **inventory is not managed** (`manage_inventory: false`), so nothing shows as out of stock.

| Handle | Title | Variants |
| --- | --- | --- |
| `jersey` | Jersey | One per size |
| `t-shirt` | T-Shirt | One per size |
| `jacket` | Jacket | One per size |
| `fit-kit` | Fit Kit | One variant |
| `rush-add-on` | Rush Production | One variant |

Placeholder size list (option title `Size`), in this order: `YS`, `YM`, `YL`, `YXL`, `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL`. The real list comes from the pattern maker's size charts.

The three garments belong to one product collection, title `Garments`, handle `garments`. `fit-kit` and `rush-add-on` belong to no collection. The storefront's product listings show the `garments` collection only, so the two extras stay out of the main grid; they remain reachable by their own URLs.

Each product also carries metadata `kind`: `"garment"` for the three garments, `"fit_kit"` and `"rush_add_on"` for the extras. Later sprints use this to find the extras without relying on handles.

### Product images (added 10 Nov 2026, changed the same day, founder's direction)

For local development the products use ready-made photos from a live store. Nothing is generated or drawn. The founder named [spized.com](https://www.spized.com/en) as the source, and said our own product shoot replaces them once the design is ready.

The seed data holds one or two image URLs per product, marked as placeholder like the rest. The seed sets them as the product's thumbnail and images only when the product has none, so an admin's own photos are never overwritten. The files are not copied into this repo; the data holds links only.

All URLs start with `https://www.spized.com/thumbnail/`. Seen on the site on 10 Nov 2026:

| Product | Images (path after `/thumbnail/`) | Shows |
| --- | --- | --- |
| Jersey | `4b/cb/26/1744736603/abc184bc-ffaa-6972-d8f4-67ad4c530dd0_784006_600x600.webp?ts=1793783716` | Teal and navy jersey, front |
| | `5a/6f/9d/1744736603/99ed42a2-57cd-9912-8d85-67c407751689_784006_600x600.webp?ts=1793799289` | Red, white and black jersey, front |
| T-Shirt | `ec/18/b3/1752243175/e3ad4da2-a889-3963-c6e8-f7a0582cff6f_781001-V2_600x600.png?ts=1752243175` | Blue shirt, front |
| | `18/c3/8b/1744797261/custom-football-jersey-red-white-chevron-pattern_600x600.webp?ts=1794311519` | Red and white shirt, front |
| Jacket | `e9/e8/b6/1698000660/trainingsanzugjacke-herren-premium1-3_470x580.jpg?ts=1745265681` | Grey tracksuit jacket on a model |
| | `0c/9e/d4/1701168696/trainingsjacke-damen-premium1-1_470x580.jpg?ts=1745265645` | White tracksuit jacket on a model |
| Fit Kit | `74/0b/41/1731488347/fussball-trikot-herren-kurzarm-basic1-1_%281%29_470x580.jpg?ts=1745265613` | Plain white jersey on a model, front |
| | `de/c0/3c/1731488347/fussball-trikot-herren-kurzarm-basic2-2_%281%29_320x400.jpg?ts=1745265613` | The same, back |
| Rush Production | `https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png` (full URL; unchanged) | Not shown in any listing |

**These photos belong to another store and carry its logo. They are for local development only:**
- The storefront allows the host `www.spized.com` for images only when it is not a production build (`storefront/next.config.js`).
- They must be replaced by our own product photos before anything is deployed where the public can see it. This is a launch blocker; it is listed in `docs/progress.md`.

### Sample prices (placeholders, per unit, same price for every size)

| Product | PKR | GBP | AED | USD |
| --- | --- | --- | --- | --- |
| Jersey | 3,500 | 22 | 95 | 28 |
| T-Shirt | 2,000 | 14 | 60 | 18 |
| Jacket | 7,500 | 45 | 190 | 55 |
| Fit Kit (refundable deposit) | 5,000 | 30 | 130 | 40 |

Check the current Medusa v2 docs for how amounts are stored (major units or minor units) before writing them.

### Rush price (changed 10 Nov 2026, after work started)

The founder decided that rush is priced as **a percentage, not a fixed amount**. This replaces the fixed "Rush Production" prices that the first version of this contract listed (PKR 500, GBP 4, AED 15, USD 5). The backend worker started from that first version; the change is applied as follow-up task S0-6.

- The `rush-add-on` product stays, as the line item that carries the rush charge on an order. It has **no fixed prices** in the seed.
- The seed data holds a setting, `rush_percentage`, with the placeholder value **20**. It is stored where an admin can change it without a code change.
- Working out the charge and adding it to a cart is Sprint 1. The placeholder assumption is that the percentage applies to the garments subtotal, not to the fit kit or shipping; the founders have not confirmed that.

### Store name (added 10 Nov 2026)

The store's name is **FitMyOutfit** for now, and may change. The storefront reads it from one place (`NEXT_PUBLIC_STORE_NAME`, default `FitMyOutfit`) and shows it wherever the starter says "Medusa Store". Applied as follow-up task S0-7.

### Sales channel and publishable key

- One sales channel, the default one, holding all five products.
- One publishable API key linked to that sales channel. The seed prints it, and the root setup script writes it into `storefront/.env.local`.
- One admin user for local development, with credentials read from `backend/.env` (`MEDUSA_ADMIN_EMAIL`, `MEDUSA_ADMIN_PASSWORD`; dev defaults in `.env.example`).

### Not in Sprint 0

Shipping options, payment providers beyond Medusa's default, minimum-quantity rules, cash on delivery and tax rates are Sprint 1. If Medusa needs a minimal stock location or shipping profile for products to appear in the store API, create the minimum and say so in the report.

## What the storefront must show (Sprint 0 "done when")

- `http://localhost:8000/pk`, `/gb`, `/ae` and `/us` each load.
- Each lists Jersey, T-Shirt and Jacket with a price in that region's currency (PKR, GBP, AED, USD).
- Each product page loads and offers the size variants.
