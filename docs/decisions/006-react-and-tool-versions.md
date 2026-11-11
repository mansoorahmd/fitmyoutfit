# 006: React and tool versions across the workspace

10 Nov 2026. Decided by the coordinator in Sprint 0, after the founder asked why two React versions are installed and asked to keep the project clean.

## Context

The first install of the whole workspace put two copies of several packages on disk. Checked with `npm explain` and the packages' own `package.json` files on 10 Nov 2026:

| Package | Versions installed | Who needs each |
| --- | --- | --- |
| React | 18.3 and 19 | **18:** Medusa's admin dashboard (`@medusajs/dashboard` 2.22.6 depends on `react ^18.3.1`), which ships inside the backend. Our `backend/package.json` lists React 18 only so that admin extensions compile against the same React the dashboard runs. **19:** the storefront (Next.js 15) and the editor (`@react-three/fiber` 9 supports React 19 only) |
| Vite | 5 and 8 | **5:** Medusa's admin bundler. **8:** the editor's build, and the test runner in the storefront and editor |
| TypeScript | 5.9 and 6.0 | **5.9:** backend and storefront. **6.0:** the editor, by the editor worker's choice |
| ESLint | 8 and 10 | **8:** the storefront, inherited from the Medusa starter. **10:** backend and editor |

The first two rows are forced by Medusa. The last two are our own doing.

## Decision

- **Everything we write for customers uses one React: 19.** That is the storefront and the editor.
- **React 18 stays, confined to the backend's admin.** It is Medusa's dependency, not ours. We do not force the admin onto React 19 with an override: Medusa does not declare support for it, and a broken admin would stop order handling.
- **Vite 7.3.8 since 12 Nov (task S1-7).** The backend's own dev dependency was Vite 5.4.21, which had a high audit finding; Medusa 2.22.6's admin bundler already used Vite 7 and its admin plugin accepts Vite 5, 6 or 7, not 8. The admin was checked in development and in a production build. (Earlier text: "Vite 5 stays".)
- **We remove the duplicates that are ours.** All three workspaces use the same TypeScript version and the same ESLint major version. Target: the TypeScript version the backend already uses (5.9), and ESLint 10 if the storefront's Next.js lint rules support it, otherwise the newest major that all three support. Task S0-10.
- **Rule from now on:** a worker may not introduce a second version of a tool or library that another workspace already uses, unless a dependency forces it. Forced duplicates are added to the table above with the reason.

## Alternatives

- **Force React 19 everywhere with an npm override.** One copy on disk, but the Medusa admin would run on a React version its authors have not released it for. Rejected.
- **Use React 18 everywhere.** One copy, but the editor's 3D library has no React 18 release in its current major version, and the Medusa storefront starter is built on React 19. Rejected.
- **Leave the TypeScript and ESLint duplicates.** No work now, but three sets of lint and compiler behaviour to keep in mind. Rejected, because the project is at its start and alignment is cheapest now.

## Consequences

- Admin extensions (the team-order pages in Sprint 2) are written against React 18, because they run inside Medusa's admin. Storefront and editor code is React 19. Components are not shared between the two.
- The 3D editor can't be embedded in the Medusa admin as it stands. Admin shows a design through its rendered proof images, which is what the dev plan already describes.
- When Medusa moves its admin to React 19, the backend follows and the second copy disappears. Check on each Medusa upgrade.
- `@medusajs/ui` 4.2.13, used by the storefront, declares React 18 as its peer but is run on React 19 by Medusa's own storefront starter. npm reports a peer warning for it. It is Medusa's inconsistency; watch for a release that fixes it.

## Update, 11 Nov 2026 (task S0-10): the backend has its own install

**What went wrong.** In one shared npm install, npm put the backend's React 18 at the root `node_modules`, and the storefront's libraries (`next`, `@medusajs/ui`, the testing library) resolved it there. Root `npm run typecheck` failed with 147 errors in the storefront and the storefront tests failed.

**What was tried.** Declaring React 19 at the root: npm refuses it (ERESOLVE), because `@medusajs/medusa` and `@medusajs/ui` declare React 18 peers. An override wide enough to get past that would also put the admin on React 19, which this decision rules out. pnpm was not tried, because the next option met the goal without replacing the package manager of [decision 001](001-monorepo-and-tooling.md).

**Decision.** The backend is no longer an npm workspace.

- The root workspaces are `storefront` and `packages/*`, with the root `package-lock.json`.
- The backend has its own `backend/node_modules` and `backend/package-lock.json`.
- A root `postinstall` (`scripts/install-backend.mjs`) installs the backend, so `npm install` or `npm ci` at the root is still the one step.
- One root override lets the storefront's `@medusajs/ui` (React 18 peer) use React 19.3.1, as Medusa's own storefront starter does. It can't reach the admin, whose install is separate.

**Result, checked on disk.** The storefront, the editor and their dependencies resolve one React 19.3.1. The backend and its admin have one React 18.3.1. TypeScript is 5.9.3 everywhere. ESLint is 9 everywhere, not 10 as targeted above: `eslint-config-next` and its plugins don't declare support for ESLint 10 yet. npm now marks ESLint 9 as unsupported; re-check on each Next.js upgrade.

**Forced duplicates, added to the table above:**

| Package | Versions installed | Who needs each |
| --- | --- | --- |
| TypeScript | 5.9.3 and 7.0.2 | **7.0.2:** nested under `@medusajs/ui`, pulled in by an optional peer of its `cva` dependency, in both installs. None of our scripts runs it |
| `eslint-plugin-react-hooks` | 5 and 7 | **5:** `eslint-config-next` in the storefront. **7:** the editor |

**Consequences for developers.**

- The root commands are unchanged: `npm install`, `npm run setup`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run test`.
- Backend-only commands use `--prefix backend`, not `-w backend`. A backend dependency is added with `npm install <package> --prefix backend`.
- There are two lockfiles to commit. `npm ls` at the root no longer shows the backend.
- `npm install --ignore-scripts` skips the backend; run `npm run install:backend` after it.
- When the backend needs the editor's design schema (`@fitmyoutfit/editor/design`, Sprint 2), it is added to `backend/package.json` as `"file:../packages/editor"`. That was tested in a scratch copy: npm links the folder and installs nothing extra. A deployment must then include `packages/editor` or bundle it.
