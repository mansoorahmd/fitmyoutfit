// Builds @fitmyoutfit/editor (the 3D designer the store embeds, used from its built, git-ignored dist/) when
// that dist is missing or older than its source, so that a fresh clone (and CI) can run the storefront's dev,
// typecheck, test and build right after `npm install`. A built, current dist is left alone (nothing is
// rebuilt). The editor bundles the roster rules of packages/team-rules, so their source counts as its source.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages")
const editor = resolve(packages, "editor")
const rules = resolve(packages, "team-rules")

// The roster rules first, through their own guarded script: it builds them only when they are out of date and
// never at the same moment as another process (the backend's predev builds them too). The editor's build then
// finds them current and leaves them alone.
const rulesBuild = spawnSync(process.execPath, [resolve(rules, "scripts/ensure-built.mjs")], { stdio: "inherit" })
if (rulesBuild.status !== 0) process.exit(rulesBuild.status ?? 1)
// What the storefront imports, per the editor's package.json "exports".
const built = [
  ...["dist/index.js", "dist/types/index.d.ts", "dist/design.js", "dist/types/design/index.d.ts"].map((f) => resolve(editor, f)),
  // The storefront imports @fitmyoutfit/team-rules itself too (the team-order pages): its built output must be there
  // as well (the editor's build makes it).
  ...["dist/esm/index.js", "dist/esm/index.d.ts"].map((f) => resolve(rules, f)),
]

/** The newest modification time among the files under a folder (0 when the folder is missing). */
function newest(dir) {
  if (!existsSync(dir)) return 0
  let t = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    t = Math.max(t, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs)
  }
  return t
}

const sources = Math.max(
  newest(resolve(editor, "src")),
  statSync(resolve(editor, "package.json")).mtimeMs,
  newest(resolve(rules, "src"))
)
const stale = built.some((f) => !existsSync(f) || statSync(f).mtimeMs < sources)
if (stale) {
  console.log("[ensure-editor] building @fitmyoutfit/editor")
  const result = spawnSync("npm", ["run", "build"], { cwd: editor, stdio: "inherit", shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
