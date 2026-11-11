import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".medusa/**",
      "dist/**",
      "coverage/**",
      "static/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // Medusa's container and query results are loosely typed; allow `any` in tests only.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // The admin extension runs in the browser (it has its own tsconfig). Linted with the
    // TypeScript rules only; React-specific rules would need a new lint plugin.
    files: ["src/admin/**"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/__tests__/**", "integration-tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  }
)
