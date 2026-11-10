import { defineConfig } from "vite";
import { resolve } from "node:path";

// Library build: ES modules only. React, Three.js and the other runtime
// dependencies stay external, so the host app supplies (and dedupes) them.
const external = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^three($|\/)/,
  /^@react-three\//,
  /^zod($|\/)/,
];

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        design: resolve(import.meta.dirname, "src/design/index.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: { external },
    sourcemap: true,
    emptyOutDir: true,
  },
});
