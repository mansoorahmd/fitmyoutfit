// ESLint for the root scripts/ folder (plain Node ES modules: setup, dev and their helpers).
// It lives in the backend workspace because the backend declares ESLint and its plugins; the
// root `npm run lint:scripts` runs it. backend/eslint.config.mjs covers the backend itself.
import js from "@eslint/js"
import globals from "globals"

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
]
