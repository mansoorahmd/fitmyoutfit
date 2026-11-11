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
 * functions runSetup is given (which hide the password and which the tests capture). dev.mjs reads
 * PORT from backend/.env, which holds the admin password too, so it prints only through the same
 * helpers. In setup.mjs, dev.mjs and the helpers in scripts/lib/, only scripts/lib/output.mjs may
 * write to the terminal.
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
    files: ["scripts/setup.mjs", "scripts/dev.mjs", "scripts/lib/**/*.mjs"],
    ignores: ["scripts/lib/output.mjs", "**/*.test.mjs"],
    rules: noDirectOutput,
  },
  {
    // dev.mjs may hold only the PORT from backend/.env (scripts/lib/ports.mjs reads it), never the
    // parsed file with the admin password in it.
    files: ["scripts/dev.mjs"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./lib/env-file.mjs",
              message:
                "dev.mjs must not parse backend/.env (it holds MEDUSA_ADMIN_PASSWORD). Use readBackendEnvFilePort from ./lib/ports.mjs.",
            },
          ],
        },
      ],
    },
  },
]
