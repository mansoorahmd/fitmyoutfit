// The root lint must run ESLint over scripts/, not only a syntax check.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

/** Lint `code` as if it were the file `filename` (relative to the repo root); returns the exit code and output. */
function lintAs(filename, code) {
  const config = /--config\s+(\S+)/.exec(pkg.scripts["lint:scripts"])[1];
  const eslint = path.join(root, "backend", "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(
    process.execPath,
    [eslint, "--config", config, "--stdin", "--stdin-filename", filename],
    { cwd: root, input: code, encoding: "utf8" },
  );
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

test(
  "lint:scripts forbids console.* and process.stdout / stderr in setup.mjs and scripts/lib/, except the output helper",
  { timeout: 120_000 },
  () => {
    const leak = "export function f(env) {\n  console.log(env.MEDUSA_ADMIN_PASSWORD);\n}\n";
    const write = "export function f(text) {\n  process.stdout.write(text);\n  process.stderr.write(text);\n}\n";
    const setup = lintAs("scripts/setup.mjs", leak);
    assert.equal(setup.code, 1, setup.output);
    assert.match(setup.output, /no-console/);
    const lib = lintAs("scripts/lib/anything.mjs", write);
    assert.equal(lib.code, 1, lib.output);
    assert.match(lib.output, /no-restricted-properties/);
    // The one output helper may write; dev.mjs and the tests are not covered by the rule.
    assert.equal(lintAs("scripts/lib/output.mjs", write).code, 0);
    assert.equal(lintAs("scripts/dev.mjs", leak).code, 0);
    assert.equal(lintAs("scripts/lib/anything.test.mjs", leak).code, 0);
  },
);

test("npm run lint includes lint:scripts, and lint:scripts runs ESLint over scripts/", () => {
  assert.match(pkg.scripts.lint, /npm run lint:scripts/);
  assert.match(pkg.scripts["lint:scripts"], /^eslint\b.*\sscripts$/);
  const config = /--config\s+(\S+)/.exec(pkg.scripts["lint:scripts"])?.[1];
  assert.ok(config && existsSync(path.join(root, config)), `ESLint config ${config} is missing`);
});
