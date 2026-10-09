import { defineConfig } from "vite";

/**
 * Bundle the module into a single ES module at dist/module.js, the file listed
 * in module.json#esmodules. Foundry loads it directly, so nothing is minified
 * and a source map is emitted for in-browser debugging.
 */
export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "module.js"
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
} as never);
