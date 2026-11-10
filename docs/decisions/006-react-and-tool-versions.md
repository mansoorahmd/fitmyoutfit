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
- **Vite 5 stays** for the same reason: it belongs to Medusa's admin bundler.
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
