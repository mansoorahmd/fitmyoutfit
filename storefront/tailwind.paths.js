// Paths for tailwind.config.js that do not assume where npm put a package.
//
// In the monorepo's root install, npm hoists packages such as @medusajs/ui to
// the root node_modules, so "./node_modules/@medusajs/ui" does not exist next
// to the storefront. Tailwind then never sees Medusa UI's class names and
// every Medusa UI button renders as plain text. These helpers find a package
// the way Node does (walking up through parent node_modules folders), so the
// path is right for a local install and a hoisted one.
//
// Plain CommonJS with no dependencies: tailwind.config.js requires it, and
// src/__tests__/tailwind-content.test.ts tests it.

const fs = require("fs")
const path = require("path")

/**
 * The root directory of an installed package, as Node would find it from
 * `fromDir`. Works when the package's "exports" field hides package.json
 * (as @medusajs/ui's does): it resolves the package entry, then walks up to
 * the package.json whose name matches.
 */
function resolvePackageDir(name, fromDir) {
  const entry = require.resolve(name, { paths: [fromDir] })
  let dir = path.dirname(entry)

  for (;;) {
    const manifest = path.join(dir, "package.json")
    if (fs.existsSync(manifest)) {
      try {
        if (JSON.parse(fs.readFileSync(manifest, "utf8")).name === name) {
          return dir
        }
      } catch (e) {
        // An unreadable manifest is not the package root; keep walking up.
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`Cannot find the package folder of ${name} (from ${entry})`)
    }
    dir = parent
  }
}

/** Joins path segments into a glob with forward slashes, which Tailwind's globber needs on Windows. */
function toGlob(...segments) {
  return path.join(...segments).split(path.sep).join("/")
}

/** The Tailwind content glob for a package's built files. */
function packageContentGlob(name, fromDir, pattern) {
  return toGlob(resolvePackageDir(name, fromDir), pattern)
}

module.exports = { resolvePackageDir, toGlob, packageContentGlob }
