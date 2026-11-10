// What `npm run setup` prints: never the admin password (setup output ends up in terminals,
// logs and screenshots). The message itself is tested in lib/setup-checks.test.mjs; this checks
// that setup.mjs and its helpers do not put the password into any string they build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

for (const file of ["setup.mjs", path.join("lib", "setup-checks.mjs")]) {
  test(`${file} never interpolates MEDUSA_ADMIN_PASSWORD into its output`, () => {
    const source = readFileSync(path.join(here, file), "utf8");
    const interpolations = [...source.matchAll(/\$\{[^}]*\}/g)].map((m) => m[0]);
    assert.deepEqual(
      interpolations.filter((text) => /PASSWORD/i.test(text)),
      [],
    );
  });
}
