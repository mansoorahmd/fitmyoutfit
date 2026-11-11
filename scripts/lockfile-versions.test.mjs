// Guards the versions that `npm audit` flagged high (S1-7), in the committed lockfiles, so that a
// later install cannot quietly bring them back. Reads the lockfiles only; needs no install.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every installed copy of `name` in a lockfile: [{ location, version }]. */
function copiesOf(lockfile, name) {
  const { packages } = JSON.parse(readFileSync(path.join(root, lockfile), "utf8"));
  return Object.entries(packages)
    .filter(([location]) => location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`))
    .map(([location, entry]) => ({ location, version: entry.version }));
}

/** Compares two plain x.y.z versions: negative, 0 or positive. */
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

test("compareVersions", () => {
  assert.ok(compareVersions("7.3.8", "6.4.3") > 0);
  assert.ok(compareVersions("5.4.21", "6.4.3") < 0);
  assert.equal(compareVersions("8.5.32", "8.5.32"), 0);
  assert.ok(compareVersions("8.4.31", "8.5.22") < 0);
});

// GHSA-587h-7wmj-h5pm (high) and others: vite <=6.4.3. Medusa 2.22.6 bundles its admin with
// Vite ^7.3.7 (@medusajs/admin-bundler) and its Vite plugin accepts ^5.4.21 || ^6 || ^7, so the
// backend keeps exactly one Vite, a 7.x.
test("backend/package-lock.json: one Vite, 7.x, none at or below 6.4.3", () => {
  const vites = copiesOf("backend/package-lock.json", "vite");
  assert.deepEqual(
    vites.map(({ location }) => location),
    ["node_modules/vite"],
    `expected one Vite, found ${JSON.stringify(vites)}`
  );
  const [{ version }] = vites;
  assert.equal(version.split(".")[0], "7", `Vite ${version} is not a 7.x`);
  assert.ok(compareVersions(version, "6.4.3") > 0, `Vite ${version} has the high audit finding`);
});

// GHSA-qx2v-qp2m-jg93 (high) and others: postcss <=8.5.22. Next.js 15 pins postcss 8.4.31; the
// root package.json overrides it (overrides.next.postcss), so no copy at or below 8.5.22 is left.
test("package-lock.json: every postcss, Next.js's included, is above 8.5.22", () => {
  const copies = copiesOf("package-lock.json", "postcss");
  assert.ok(copies.length > 0, "no postcss in the root lockfile");
  for (const { location, version } of copies) {
    assert.ok(
      compareVersions(version, "8.5.22") > 0,
      `${location} is postcss ${version}, which has the high audit finding`
    );
  }
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(pkg.overrides?.next?.postcss, "the root package.json no longer overrides Next.js's postcss");
});
