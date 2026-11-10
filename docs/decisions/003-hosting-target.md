# 003: Hosting target

10 Nov 2026. Decided by the coordinator in Sprint 0. One of the three choices dev-plan.md asks Sprint 0 to settle. Nothing is provisioned yet, and the choice costs nothing until it is.

## Context

The store has four parts to host: the Medusa backend (a server process and a background worker), PostgreSQL and Redis, the Next.js storefront, and file storage for uploads and proof images. Customers are in Pakistan, the UAE, the UK and the US. The team is three developers with no dedicated operations person. Local development already uses Docker for PostgreSQL, Redis and MinIO (an S3-compatible store).

## Decision

| Part | Target |
| --- | --- |
| Medusa backend: server and worker | **Railway**, in a European region |
| PostgreSQL and Redis | **Railway** managed services, in the same region as the backend |
| Storefront | **Vercel** |
| File storage | **Cloudflare R2** (S3-compatible, so the code path is the same as MinIO locally) |

Europe sits between the four markets, so no market is far from the backend. The storefront is served from Vercel's edge network, which is close to all of them.

The code must stay host-neutral: configuration comes only from environment variables, files go through the S3 API, and the backend runs from a standard Node start command. No Railway- or Vercel-specific APIs.

## Alternatives

- **Medusa Cloud.** Managed by the Medusa team, least operations work. Costs more and ties hosting to the commerce vendor.
- **One VPS with Docker Compose** (Hetzner, DigitalOcean). Cheapest and closest to the local setup, but backups, upgrades, monitoring and security patches become the team's job.
- **AWS** (ECS, RDS, ElastiCache, S3). Most control and room to grow, and the most setup and operations work.
- **Self-hosting the storefront next to the backend.** One fewer vendor, but loses the edge network that helps four distant markets.

## Consequences

- The founders will need Railway, Vercel and Cloudflare accounts under the company before the first deployment. Prices were not verified for this decision; get current quotes before committing.
- Because the code is host-neutral, moving the backend to a VPS or AWS later is a configuration change, not a rewrite.
- No deployment work is planned before the integration phase (week 13 onward). If the founders want a shared staging site earlier, for user tests or the phone test at the end of Sprint 3, that is a small added task.
- Where customer data is stored may matter for UK and UAE data-protection rules. That is a question for the founders and their adviser, and it could change the region.
