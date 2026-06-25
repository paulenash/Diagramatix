#!/usr/bin/env node
/**
 * Regenerate tests/TESTS.md — a browsable inventory of the Vitest suite
 * (file -> describe -> test). Run via: npm run test:list
 *
 * Self-contained: shells out to the local Vitest CLI's `list` command, parses
 * the "file > describe > ... > test" lines, and writes a grouped markdown doc.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.join("tests", "TESTS.md");

let raw;
try {
  // --no-install: use the installed Vitest, never fetch one.
  raw = execSync("npx --no-install vitest list", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (err) {
  console.error("Failed to run `vitest list`:", err.message);
  process.exit(1);
}

const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.includes(" > "));
if (lines.length === 0) {
  console.error("No tests found in `vitest list` output.");
  process.exit(1);
}

const byFile = new Map();
for (const line of lines) {
  const parts = line.split(" > ");
  const file = parts[0];
  const test = parts[parts.length - 1];
  const describe = parts.slice(1, -1).join(" › "); // ›
  if (!byFile.has(file)) byFile.set(file, new Map());
  const groups = byFile.get(file);
  const key = describe || "(top level)";
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(test);
}

const files = [...byFile.keys()].sort();
const total = lines.length;
const date = new Date().toISOString().slice(0, 10);
const TICK = "`";
const out = [];
out.push("# Diagramatix — Test Suite", "");
out.push("Auto-generated inventory of the automated test suite (Vitest). Regenerate with " + TICK + "npm run test:list" + TICK + ".", "");
out.push("- **Total tests:** " + total);
out.push("- **Test files:** " + files.length);
out.push("- **Last generated:** " + date, "");
out.push("> Run all: " + TICK + "npm test" + TICK + ". Run one file: " + TICK + "npx vitest run <path>" + TICK + ".", "");
out.push("---", "");
out.push("## Contents", "");
for (const f of files) {
  const n = [...byFile.get(f).values()].reduce((a, b) => a + b.length, 0);
  const anchor = f.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  out.push("- [" + f + "](#" + anchor + ") — " + n + " test" + (n === 1 ? "" : "s"));
}
out.push("", "---", "");
for (const f of files) {
  const groups = byFile.get(f);
  const n = [...groups.values()].reduce((a, b) => a + b.length, 0);
  out.push("## " + f, "", "_" + n + " test" + (n === 1 ? "" : "s") + "_", "");
  for (const [g, tests] of groups) {
    if (g !== "(top level)") out.push("### " + g, "");
    for (const t of tests) out.push("- " + t);
    out.push("");
  }
}

fs.writeFileSync(OUT, out.join("\n"));
console.log("Wrote " + OUT + " — " + total + " tests across " + files.length + " files");
