// The root lint must run ESLint over scripts/, not only a syntax check.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

test("npm run lint includes lint:scripts, and lint:scripts runs ESLint over scripts/", () => {
  assert.match(pkg.scripts.lint, /npm run lint:scripts/);
  assert.match(pkg.scripts["lint:scripts"], /^eslint\b.*\sscripts$/);
  const config = /--config\s+(\S+)/.exec(pkg.scripts["lint:scripts"])?.[1];
  assert.ok(config && existsSync(path.join(root, config)), `ESLint config ${config} is missing`);
});
