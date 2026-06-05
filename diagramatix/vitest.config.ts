import path from "node:path";
import { defineConfig } from "vitest/config";

// Pure server-side library tests: BPMN layout engine, diagram invariant
// checker, and auth helpers (with a mocked Prisma client). Each suite runs
// in plain node — no React, no Next runtime, no real DB.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: [
      "app/lib/diagram/**/*.test.ts",
      "app/lib/auth/**/*.test.ts",
    ],
    environment: "node",
  },
});
