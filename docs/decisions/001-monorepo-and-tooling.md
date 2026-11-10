# 001: Monorepo layout and tooling

10 Nov 2026. Decided by the coordinator at the start of Sprint 0.

## Context

dev-plan.md asks for one repo with three parts: `backend/` (Medusa v2), `storefront/` (Next.js, from the official Medusa starter) and `packages/editor/` (the 3D editor, developed in isolation). Three workers build these in parallel, so they need the same package manager, script names and CI entry points from the first day. The dev machine has Node 22, npm 10 and pnpm 12, and no yarn.

## Decision

- **npm workspaces**, with one root `package.json` and one root `package-lock.json`. Workspaces: `backend`, `storefront`, `packages/*`.
- **Node 22** for development and CI; `engines` is `>=20`, the minimum Medusa v2 supports.
- **TypeScript** in all three parts.
- **Every workspace exposes the same scripts:** `dev`, `build`, `lint`, `typecheck`, `test`. The root runs them across workspaces, and CI calls the root scripts.
- **Test runners:** whatever the Medusa starter ships for `backend/` (Jest), and Vitest for `packages/editor/` and `storefront/`.
- **CI on GitHub Actions**, running lint, type-check and tests on every push and pull request.
- The details the workers build against are in [docs/contracts/sprint-0-dev-setup.md](../contracts/sprint-0-dev-setup.md).

## Alternatives

- **pnpm workspaces.** Faster installs and stricter dependency isolation, but Medusa expects a hoisted `node_modules` and needs extra configuration under pnpm's layout. Not worth the risk in week 1.
- **Yarn.** The Medusa starters ship with yarn lockfiles, but yarn isn't installed here and adds a tool every developer must install.
- **Turborepo or Nx on top.** Useful once builds get slow. Three packages don't need it yet.
- **Separate repos.** Cleaner isolation for the editor, but cross-cutting changes (an API plus the page that uses it) would need coordinated pull requests.

## Consequences

- npm hoists shared dependencies to the root. If the storefront and the Medusa admin need different React versions, npm nests the second copy; that is expected.
- The repo has no git remote yet, so the GitHub Actions workflow can't run until the repo is pushed to GitHub. Until then the coordinator runs the same root scripts locally before each merge.
- If the repo ends up on a host other than GitHub, the workflow file is rewritten for that host; the root scripts stay the same.
- The editor stays free of Medusa and Next.js dependencies, so it could move to its own repo, or serve a different store platform, without changes.

## Update, 11 Nov 2026

The backend is no longer an npm workspace: it has its own install and lockfile, and a root `postinstall` installs it. The root workspaces are `storefront` and `packages/*`. The root commands are unchanged. Reason and details: [decision 006](006-react-and-tool-versions.md), "Update, 11 Nov 2026".
