// Builds @fitmyoutfit/team-rules (the roster rules, plain TypeScript compiled by tsc into a git-ignored dist/)
// when its dist is missing or older than its source, so that a fresh clone can run this package's dev, typecheck,
// test and build right after `npm install`. A built, current dist is left alone (nothing is rebuilt).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rules = resolve(dirname(fileURLToPath(import.meta.url)), "../../team-rules");
const built = ["dist/esm/index.js", "dist/esm/index.d.ts", "dist/cjs/index.js"].map((f) => resolve(rules, f));

/** The newest modification time among the files under a folder. */
function newest(dir) {
  let t = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    t = Math.max(t, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return t;
}

const sources = Math.max(newest(resolve(rules, "src")), statSync(resolve(rules, "package.json")).mtimeMs);
const stale = built.some((f) => !existsSync(f) || statSync(f).mtimeMs < sources);
if (stale) {
  console.log("[ensure-rules] building @fitmyoutfit/team-rules");
  const result = spawnSync("npm", ["run", "build"], { cwd: rules, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
