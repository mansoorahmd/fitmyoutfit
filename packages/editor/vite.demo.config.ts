import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Demo page: a visual check for the editor package. Not part of the library.
export default defineConfig({
  root: resolve(import.meta.dirname, "demo"),
  publicDir: resolve(import.meta.dirname, "samples"),
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { outDir: resolve(import.meta.dirname, "dist-demo"), emptyOutDir: true },
});
