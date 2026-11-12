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

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** The parts of a semver version (x.y.z, an optional -prerelease and an optional +build). */
function parseVersion(version) {
  const match = SEMVER_RE.exec(String(version).trim());
  if (!match) throw new Error(`not a semver version: ${JSON.stringify(version)}`);
  const [, major, minor, patch, prerelease] = match;
  return { core: [major, minor, patch].map(Number), prerelease: prerelease ? prerelease.split(".") : [] };
}

/** Semver order of two prerelease identifiers: numbers below words, numbers by value. */
function compareIdentifiers(a, b) {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b);
  if (numeric.test(a)) return -1;
  if (numeric.test(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two semver versions: negative, 0 or positive, by the precedence rules of semver 2.0.0
 * (section 11). A prerelease (8.5.32-beta.1) comes before its release (8.5.32) but after every
 * earlier release (8.5.31); build metadata (+sha.1) does not count. Throws on anything else, so a
 * version the test cannot read fails it loudly instead of comparing as NaN.
 */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }
  if (pa.prerelease.length === 0 || pb.prerelease.length === 0) {
    return pb.prerelease.length - pa.prerelease.length;
  }
  for (let i = 0; i < Math.max(pa.prerelease.length, pb.prerelease.length); i += 1) {
    if (pa.prerelease[i] === undefined) return -1;
    if (pb.prerelease[i] === undefined) return 1;
    const order = compareIdentifiers(pa.prerelease[i], pb.prerelease[i]);
    if (order !== 0) return order;
  }
  return 0;
}

test("compareVersions: plain x.y.z", () => {
  assert.ok(compareVersions("7.3.8", "6.4.3") > 0);
  assert.ok(compareVersions("5.4.21", "6.4.3") < 0);
  assert.equal(compareVersions("8.5.32", "8.5.32"), 0);
  assert.ok(compareVersions("8.4.31", "8.5.22") < 0);
  assert.ok(compareVersions("10.0.0", "9.99.99") > 0);
});

test("compareVersions: prerelease and build suffixes", () => {
  // Above the fixed version, whatever the suffix.
  assert.ok(compareVersions("8.5.32-beta.1", "8.5.22") > 0);
  assert.ok(compareVersions("8.5.23-rc.0", "8.5.22") > 0);
  assert.ok(compareVersions("7.3.8+sha.5114f85", "6.4.3") > 0);
  // A prerelease comes before its own release, and after the release before it.
  assert.ok(compareVersions("8.5.22-beta.1", "8.5.22") < 0);
  assert.ok(compareVersions("8.5.22", "8.5.22-beta.1") > 0);
  assert.ok(compareVersions("8.5.22-beta.1", "8.5.21") > 0);
  // Build metadata does not count.
  assert.equal(compareVersions("8.5.32+build.7", "8.5.32"), 0);
  assert.equal(compareVersions("8.5.32-beta.1+a", "8.5.32-beta.1+b"), 0);
  // The example order of semver 2.0.0, section 11.
  const order = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let i = 0; i + 1 < order.length; i += 1) {
    assert.ok(compareVersions(order[i], order[i + 1]) < 0, `${order[i]} < ${order[i + 1]}`);
    assert.ok(compareVersions(order[i + 1], order[i]) > 0, `${order[i + 1]} > ${order[i]}`);
  }
});

test("compareVersions: refuses what is not a version instead of comparing NaN", () => {
  for (const bad of ["", "8.5", "8.5.x", "latest", "8.5.32.1", undefined]) {
    assert.throws(() => compareVersions(bad, "8.5.22"), /not a semver version/);
  }
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
