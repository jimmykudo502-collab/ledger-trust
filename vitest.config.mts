import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Property tests create many client database files; inside OneDrive on a
    // busy machine that can take longer than Vitest's 5s default.
    testTimeout: 30_000,
  },
});
