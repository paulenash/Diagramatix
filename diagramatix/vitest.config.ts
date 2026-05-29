import { defineConfig } from "vitest/config";

// Layout / diagram-structure tests only. These exercise the pure BPMN layout
// engine and the diagram invariant checker — no React, no Next, no DB — so
// they run in a plain node environment in well under a second.
export default defineConfig({
  test: {
    include: ["app/lib/diagram/**/*.test.ts"],
    environment: "node",
  },
});
