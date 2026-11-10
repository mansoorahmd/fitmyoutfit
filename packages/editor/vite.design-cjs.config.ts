import { defineConfig } from "vite";
import { resolve } from "node:path";

// CommonJS build of the `design` entry only, for CommonJS consumers such as the
// Medusa backend (`require("@fitmyoutfit/editor/design")`). The React component
// is ES module only. It goes to dist/cjs/, next to a package.json that marks
// the folder as CommonJS (see scripts/write-cjs-package.mjs). The build runs
// after the ES module build and must not empty dist/.
export default defineConfig({
  build: {
    lib: {
      entry: { design: resolve(import.meta.dirname, "src/design/index.ts") },
      formats: ["cjs"],
      fileName: () => "design.cjs",
    },
    outDir: resolve(import.meta.dirname, "dist/cjs"),
    rollupOptions: { external: [/^zod($|\/)/] },
    sourcemap: true,
    emptyOutDir: true,
  },
});
