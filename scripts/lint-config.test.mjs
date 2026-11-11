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
  "lint:scripts forbids console.* and process.stdout / stderr in setup.mjs, dev.mjs and scripts/lib/, except the output helper",
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
    // dev.mjs reads PORT from backend/.env, next to the admin password: covered too (QA, fourth review).
    const dev = lintAs("scripts/dev.mjs", leak);
    assert.equal(dev.code, 1, dev.output);
    assert.match(dev.output, /no-console/);
    const devWrite = lintAs("scripts/dev.mjs", write);
    assert.equal(devWrite.code, 1, devWrite.output);
    assert.match(devWrite.output, /no-restricted-properties/);
    // The one output helper may write; the tests are not covered by the rule.
    assert.equal(lintAs("scripts/lib/output.mjs", write).code, 0);
    assert.equal(lintAs("scripts/lib/anything.test.mjs", leak).code, 0);
  },
);

test(
  "lint:scripts refuses the .env parser in dev.mjs, which may hold only the PORT from backend/.env",
  { timeout: 120_000 },
  () => {
    const parse = [
      'import { readFileSync } from "node:fs";',
      'import { parseEnv } from "./lib/env-file.mjs";',
      'export const env = parseEnv(readFileSync("backend/.env", "utf8"));',
      "",
    ].join("\n");
    const dev = lintAs("scripts/dev.mjs", parse);
    assert.equal(dev.code, 1, dev.output);
    assert.match(dev.output, /no-restricted-imports/);
    // setup.mjs needs the whole file (the database URL, and the password to hide it).
    assert.equal(lintAs("scripts/setup.mjs", parse).code, 0);
    // The real dev.mjs passes.
    const real = lintAs("scripts/dev.mjs", readFileSync(path.join(root, "scripts", "dev.mjs"), "utf8"));
    assert.equal(real.code, 0, real.output);
  },
);

test("npm run lint includes lint:scripts, and lint:scripts runs ESLint over scripts/", () => {
  assert.match(pkg.scripts.lint, /npm run lint:scripts/);
  assert.match(pkg.scripts["lint:scripts"], /^eslint\b.*\sscripts$/);
  const config = /--config\s+(\S+)/.exec(pkg.scripts["lint:scripts"])?.[1];
  assert.ok(config && existsSync(path.join(root, config)), `ESLint config ${config} is missing`);
});
