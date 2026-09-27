/**
 * Paul, 2026-09-27: "Add a clear button on the Database Access SQL Editor under
 * Execute. Increase the SQL code window height by 25%".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const client = () => readFileSync("app/(dashboard)/dashboard/admin/database/DatabaseClient.tsx", "utf8");

describe("T4956 — the SQL editor: Clear under Execute, and a 25% taller window", () => {
  it("Clear sits under Execute, in one column, and empties the editor and the history position", () => {
    const src = client();
    const column = src.indexOf('<div className="flex flex-col gap-2">');
    const execute = src.indexOf('{executing ? "Running..." : "Execute"}');
    const clear = src.indexOf("                  Clear\n");
    expect(column).toBeGreaterThan(0);
    expect(execute).toBeGreaterThan(column);
    expect(clear, "Clear comes after Execute, in the same column").toBeGreaterThan(execute);
    expect(src).toContain('onClick={() => { setSql(""); setHistoryIndex(-1); textareaRef.current?.focus(); }}');
  });

  it("the window is 25% taller: 38vh → 47.5vh, 16rem → 20rem, 15 → 19 rows", () => {
    const src = client();
    expect(src).toContain("h-[47.5vh] min-h-[20rem]");
    expect(src).toContain("rows={19}");
    expect(src).not.toContain("h-[38vh]");
  });
});
