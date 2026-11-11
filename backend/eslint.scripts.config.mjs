// ESLint for the root scripts/ folder (plain Node ES modules: setup, dev and their helpers).
// It lives in the backend workspace because the backend declares ESLint and its plugins; the
// root `npm run lint:scripts` runs it. backend/eslint.config.mjs covers the backend itself.
//
// `npm run lint:scripts` passes this file with --config, so ESLint reads the `files` and
// `ignores` patterns below relative to the folder it runs in (the repo root), not to backend/.
import js from "@eslint/js"
import globals from "globals"

/**
 * setup.mjs handles the admin password, so everything it prints must go through the `out` / `err`
 * functions runSetup is given (which hide the password and which the tests capture). In setup.mjs
 * and its helpers in scripts/lib/, only scripts/lib/output.mjs may write to the terminal.
 */
const noDirectOutput = {
  "no-console": "error",
  "no-restricted-properties": [
    "error",
    {
      object: "process",
      property: "stdout",
      message: "Print through runSetup's out / err (scripts/lib/output.mjs), not process.stdout.",
    },
    {
      object: "process",
      property: "stderr",
      message: "Print through runSetup's out / err (scripts/lib/output.mjs), not process.stderr.",
    },
  ],
}

export default [
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/setup.mjs", "scripts/lib/**/*.mjs"],
    ignores: ["scripts/lib/output.mjs", "**/*.test.mjs"],
    rules: noDirectOutput,
  },
]
