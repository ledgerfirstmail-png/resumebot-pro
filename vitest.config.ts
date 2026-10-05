/**
 * Standalone Vitest config (ROADMAP D1) — vite.config.ts is owned by the
 * platform (HMR must stay untouched), so tests get their own config file.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
