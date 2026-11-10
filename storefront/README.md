# FitMyOutfit storefront

Next.js 15 storefront (React 19, Tailwind) for the FitMyOutfit custom apparel store. It talks to the Medusa v2 backend in `../backend`. It started from the official Medusa Next.js starter; `LICENSE` is that starter's MIT licence.

For full setup (Docker services, backend, seed data, the publishable key) see the README in the repository root.

## Scripts

Run from `storefront/`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:8000 (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on port 8000 |
| `npm run lint` | ESLint (exits non-zero on errors) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, run once. No backend or `.env.local` needed |
| `npm run test:watch` | Vitest in watch mode |

## Environment variables

Copy `.env.example` to `.env.local`. The root `npm run setup` does this and writes the publishable key for you.

| Variable | Purpose | Dev default |
| --- | --- | --- |
| `MEDUSA_BACKEND_URL` | Medusa backend URL | `http://localhost:9000` |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Publishable API key. Required for `dev` and `build` | none |
| `NEXT_PUBLIC_BASE_URL` | URL of this storefront | `http://localhost:8000` |
| `NEXT_PUBLIC_STORE_NAME` | Store name shown in the header, footer and page titles | `FitMyOutfit` |
| `NEXT_PUBLIC_DEFAULT_REGION` | Region used when the visitor's country is not detected (ISO-2, lowercase) | `pk` |
| `NEXT_PUBLIC_STRIPE_KEY` | Stripe public key | none |
| `NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY`, `NEXT_PUBLIC_MEDUSA_PAYMENTS_ACCOUNT_ID` | Medusa payments, read by the starter checkout code; leave empty | none |
| `MEDUSA_CLOUD_S3_HOSTNAME`, `MEDUSA_CLOUD_S3_PATHNAME` | Image host for Medusa Cloud, read by `next.config.js`; leave empty | none |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` to turn off Next.js telemetry | `1` |

## Running against a backend

`npm run dev` and `npm run build` need `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` to be set (the app stops at start-up without it) and a running backend that has been seeded: the middleware fetches the regions from the backend, and the listings read the `garments` collection. Tests do not need either.
