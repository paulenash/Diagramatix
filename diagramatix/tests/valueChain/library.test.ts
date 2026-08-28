import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseLibraryFromMd, renderChainMd, renderLibraryMd, groupsFromMd, renumber, tidyHeading,
} from "@/app/lib/valueChain/library";
import { parseValueChainMd } from "@/app/lib/valueChain/parseValueChainMd";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

/**
 * T2900 — the Process Repository as data.
 *
 * The library takes over from a 500 KB markdown file, so the thing that has to be
 * true is an EQUIVALENCE, not a resemblance: what comes out of the library must
 * be readable by `parseValueChainMd` as exactly the same chains, names, types and
 * prompts as the file it was imported from.
 *
 * The names matter more than they look. A prompt's name becomes the generated
 * diagram's name, and the link scan matches subprocess element labels against
 * diagram names — so a rename during import would silently break cross-diagram
 * linking for every project generated from the library, and every individual
 * diagram would still look correct.
 */
describe("Process Repository — the library", () => {
  const md = fs.readFileSync(REPO_MD, "utf8");
  const lib = parseLibraryFromMd(md);

  it("imports every chain, process and prompt", () => {
    expect(lib).toHaveLength(26);
    expect(lib.reduce((t, c) => t + c.processes.length, 0)).toBe(277);
    expect(lib.reduce((t, c) => t + c.prompts.length, 0)).toBe(381);
    // Each chain keeps its narrative — that is what regeneration works from.
    for (const c of lib) {
      expect(c.narrative.length, `${c.code} narrative`).toBeGreaterThan(2000);
      expect(c.narrative, `${c.code} must not carry a prompt`).not.toContain("```");
    }
  });

  it("carries the grouping the catalogue already states", () => {
    const groups = groupsFromMd(md);
    expect(groups.get("V01")).toBe("Customer-facing");
    expect(groups.get("V21")).toBe("Decisioning");
    expect(groups.get("V16")).toBe("Risk, governance and security");
    expect(new Set([...groups.values()]).size).toBe(6);
    expect(groups.size, "every chain should be grouped").toBe(26);
  });

  it("has no key a chain could not store", () => {
    // The unique index is (chainId, type, processCode). A duplicate would make the
    // import fail halfway with a constraint violation, leaving a partial chain.
    for (const c of lib) {
      const keys = c.prompts.map((p) => `${p.type}|${p.processCode}`);
      expect(new Set(keys).size, `${c.code} duplicate prompt key`).toBe(keys.length);
      const codes = c.processes.map((p) => p.code);
      expect(new Set(codes).size, `${c.code} duplicate process code`).toBe(codes.length);
      // A BPMN prompt must be anchored to a process the chain declares.
      for (const p of c.prompts.filter((x) => x.type === "bpmn")) {
        expect(codes, `${c.code} "${p.name}" is not anchored to a process`).toContain(p.processCode);
      }
    }
  });

  it("ROUND TRIP — exporting and re-reading gives identical names, types and prompts", () => {
    const out = renderLibraryMd(lib);
    const before = parseValueChainMd(md);
    const after = parseValueChainMd(out);

    expect(after.map((c) => c.code)).toEqual(before.map((c) => c.code));
    expect(after.reduce((t, c) => t + c.diagrams.length, 0))
      .toBe(before.reduce((t, c) => t + c.diagrams.length, 0));

    let checked = 0;
    for (const b of before) {
      const a = after.find((x) => x.code === b.code)!;
      expect(a, `${b.code} must survive the export`).toBeTruthy();
      for (const d of b.diagrams) {
        const m = a.diagrams.find((x) => x.name === d.name && x.type === d.type);
        expect(m, `${b.code} ${d.type} "${d.name}" must survive the export`).toBeTruthy();
        expect(m!.prompt.trim(), `${b.code} "${d.name}"`).toBe(d.prompt.trim());
        checked++;
      }
    }
    expect(checked).toBe(381);
  });

  it("renders one chain on its own, still readable by the batch tool", () => {
    const v01 = lib.find((c) => c.code === "V01")!;
    const parsed = parseValueChainMd(renderChainMd(v01));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe("V01");
    expect(parsed[0].title).toBe("Order to Cash");
    expect(parsed[0].diagrams).toHaveLength(15);
  });

  it("renumbers processes locally, and only in sort order", () => {
    const map = renumber("V07", [
      { code: "V07.03", title: "c", sortOrder: 2 },
      { code: "V07.01", title: "a", sortOrder: 0 },
      { code: "V07.02", title: "b", sortOrder: 1 },
    ]);
    expect(map.get("V07.01")).toBe("V07.01");
    expect(map.get("V07.02")).toBe("V07.02");
    expect(map.get("V07.03")).toBe("V07.03");
    // Remove the middle one and everything after it shifts up by one.
    const after = renumber("V07", [
      { code: "V07.01", title: "a", sortOrder: 0 },
      { code: "V07.03", title: "c", sortOrder: 1 },
    ]);
    expect(after.get("V07.03")).toBe("V07.02");
    // Two digits, always — "V07.9" would sort wrongly against "V07.10".
    const many = renumber("V07", Array.from({ length: 12 }, (_, i) => ({ code: `x${i}`, title: "t", sortOrder: i })));
    expect(many.get("x8")).toBe("V07.09");
    expect(many.get("x9")).toBe("V07.10");
  });

  it("tidies a subprocess heading the way parseValueChainMd does", () => {
    expect(tidyHeading("V01.02 — Validate Customer / Order")).toBe("V01.02 Validate Customer / Order");
    expect(tidyHeading("V13.05 - Receive & Inspect Goods")).toBe("V13.05 Receive & Inspect Goods");
  });
});
