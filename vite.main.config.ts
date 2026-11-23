import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native modules can't be bundled; load them from node_modules at runtime.
      external: ["better-sqlite3"],
    },
  },
});
