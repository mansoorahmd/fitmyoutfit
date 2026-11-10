// ESLint 9 flat config. Same rules as the Medusa starter's .eslintrc.js ("next/core-web-vitals"),
// loaded through FlatCompat because eslint-config-next 15 ships in the older config format.
// https://nextjs.org/docs/15/app/api-reference/config/eslint
import { createRequire } from "node:module"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { FlatCompat } from "@eslint/eslintrc"

const require = createRequire(import.meta.url)

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  // Load the plugins eslint-config-next depends on (for example eslint-plugin-react-hooks 5),
  // as ESLint 8 did, not a different version that another workspace hoisted to the root.
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next/package.json")),
})

const eslintConfig = [...compat.extends("next/core-web-vitals")]

export default eslintConfig
