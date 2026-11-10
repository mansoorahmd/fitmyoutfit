// Checks on .github/workflows/ci.yml that are easy to undo by accident.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");

test("CI does not set REDIS_URL: with it the backend integration tests run about 8x slower", () => {
  const setsRedisUrl = workflow
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .some((line) => /^\s*REDIS_URL\s*:/.test(line));
  assert.equal(setsRedisUrl, false);
});

test("CI still gives the integration tests their PostgreSQL connection", () => {
  for (const name of ["DB_HOST", "DB_PORT", "DB_USERNAME", "DB_PASSWORD"]) {
    assert.match(workflow, new RegExp(`^\\s*${name}\\s*:`, "m"), `${name} is missing`);
  }
});
