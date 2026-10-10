/**
 * T5297 — "Create a New Value Chain", slice 1 (foundations; Paul, 2026-10-10): C01.. chain codes local to an Org, prompts that REMEMBER
 * the master template version they were written to, one writer that stamps it, staleness judged from the stored version, and the .md
 * export / import carrying a user's C chain and its stamps (preserved, per Paul).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHAIN_CODE_RE, PROCESS_CODE_RE, PROCESS_CODE_PREFIX_RE, isChainCode, isUserChainCode, nextUserChainCode, processCodeFor, userChainCode,
} from "@/app/lib/valueChain/chainCodes";
import { hashText, stampFor } from "@/app/lib/valueChain/promptStamp";
import {
  latestTemplateVersion, promptIsStaleStamped, renderProvenance, parseProvenance,
} from "@/app/lib/valueChain/promptTemplates";
import { chainStaleness } from "@/app/lib/valueChain/staleness";
import { renderChainMd, parseLibraryFromMd, type ImportedChain } from "@/app/lib/valueChain/library";
import { parseValueChainMd } from "@/app/lib/valueChain/parseValueChainMd";
import { processCodeForDiagram } from "@/app/lib/valueChain/diagramSource";

describe("T5297 chain codes", () => {
  it("numbers user chains per Org: one more than the highest C, ignoring V codes, two digits then as many as needed", () => {
    expect(nextUserChainCode([])).toBe("C01");
    expect(nextUserChainCode(["V01", "V02", "V27"])).toBe("C01");              // adopted master chains never advance the C counter
    expect(nextUserChainCode(["C01", "C02", "V01"])).toBe("C03");
    expect(nextUserChainCode(["C01", "C09"])).toBe("C10");
    expect(nextUserChainCode(["C99"])).toBe("C100");
    expect(userChainCode(7)).toBe("C07");
    expect(processCodeFor("C03", 7)).toBe("C03.07");
  });
  it("recognises both families and nothing else", () => {
    for (const ok of ["V01", "C01", "C100", "V27"]) expect(isChainCode(ok)).toBe(true);
    for (const bad of ["X01", "C1", "V", "c01", "C01.01", "VC01"]) expect(CHAIN_CODE_RE.test(bad)).toBe(false);
    expect(isUserChainCode("C02")).toBe(true);
    expect(isUserChainCode("V02")).toBe(false);
    expect(PROCESS_CODE_RE.test("C01.03")).toBe(true);
    expect(PROCESS_CODE_RE.test("V01.03")).toBe(true);
    expect(PROCESS_CODE_PREFIX_RE.exec("C12.05 Check Credit")?.[1]).toBe("C12.05");
  });
  it("a diagram named for a user's process is matched to it, a user's own 'C2 draft' is not", () => {
    expect(processCodeForDiagram("C01.03 Check Credit & Pricing")).toBe("C01.03");
    expect(processCodeForDiagram("V01.03 Check Credit & Pricing")).toBe("V01.03");
    expect(processCodeForDiagram("C2 draft")).toBe("");
  });
});

describe("T5297 the template version is remembered", () => {
  it("the stamp holds the version in force, a hash of the house rules, and a hash of the whole briefing", () => {
    const s = stampFor("bpmn", "BUILT-IN\n\n## Additional Rules\nHOUSE", "HOUSE");
    expect(s.templateVersion).toBe(latestTemplateVersion("bpmn").version);
    expect(s.additionsHash).toBe(hashText("HOUSE"));
    expect(s.templateHash).toBe(hashText("BUILT-IN\n\n## Additional Rules\nHOUSE"));
    expect(s.templateHash).toMatch(/^[0-9a-f]{12}$/);
  });
  it("changing only the house rules changes the additions hash and the briefing hash, not the version", () => {
    const a = stampFor("bpmn", "BUILT-IN + one", "one"), b = stampFor("bpmn", "BUILT-IN + two", "two");
    expect(a.templateVersion).toBe(b.templateVersion);
    expect(a.additionsHash).not.toBe(b.additionsHash);
    expect(a.templateHash).not.toBe(b.templateHash);
    expect(stampFor("bpmn", "x", "").additionsHash).toBe(hashText(""));          // no additions is a value, not an absence
  });
  it("staleness uses the STORED version; only a prompt with none is judged by its date", () => {
    const now = latestTemplateVersion("bpmn").version;
    const longAgo = "2020-01-01T00:00:00Z", justNow = new Date().toISOString();
    expect(promptIsStaleStamped("bpmn", now, longAgo)).toBe(false);              // written to the current template: current, whatever the date says
    expect(promptIsStaleStamped("bpmn", now - 1, justNow)).toBe(true);           // written to an older template: stale, however recent
    expect(promptIsStaleStamped("bpmn", null, longAgo)).toBe(true);              // no stamp: the old inference, unchanged
    expect(promptIsStaleStamped("bpmn", undefined, justNow)).toBe(false);
  });
  it("the chain badge counts a prompt stale from its stored version", () => {
    const now = latestTemplateVersion("bpmn").version;
    const procs = [{ code: "C01.01", title: "A" }, { code: "C01.02", title: "B" }];
    const at = new Date().toISOString();
    const st = chainStaleness(procs, [
      { type: "bpmn", processCode: "C01.01", generatedAt: at, templateVersion: now },
      { type: "bpmn", processCode: "C01.02", generatedAt: at, templateVersion: now - 1 },
    ]);
    expect(st.stale.map((p) => p.code)).toEqual(["C01.02"]);
    expect(st.missing).toEqual([]);
  });
});

describe("T5297 the .md export and import keep working for a user's chain", () => {
  const chain: ImportedChain = {
    code: "C01", title: "Customer Onboarding", groupName: "", sortOrder: 0,
    narrative: "## C01 — Customer Onboarding\n\n**Teams and roles involved.**\nSales, Operations.\n\n### C01.01 — Capture Details\nThe officer captures the details.\n\n### C01.02 — Verify Identity\nThe officer verifies identity.\n",
    processes: [{ code: "C01.01", title: "Capture Details", sortOrder: 0 }, { code: "C01.02", title: "Verify Identity", sortOrder: 1 }],
    prompts: [
      { type: "value-chain", processCode: "", name: "C01 Customer Onboarding — Value Chain", prompt: "Value chain prompt body", model: "claude-opus-5-5",
        generatedAt: "2026-10-12T01:00:00.000Z", templateVersion: 1, additionsHash: "aaaaaaaaaaaa", templateHash: "bbbbbbbbbbbb" },
      { type: "bpmn", processCode: "C01.01", name: "C01.01 Capture Details", prompt: "BPMN: Capture Details\nLane: Sales", model: "claude-haiku-5-5",
        generatedAt: "2026-10-12T01:05:00.000Z", templateVersion: 9, additionsHash: "cccccccccccc", templateHash: "dddddddddddd" },
    ],
  };
  const md = renderChainMd(chain);

  it("exports under its C code with the stamps in each prompt's provenance line", () => {
    expect(md).toContain("## C01 — Customer Onboarding");
    expect(md).toContain("template=9; additions=cccccccccccc; briefing=dddddddddddd");
  });
  it("imports back to the same chain, processes, prompts, models, dates AND stamps", () => {
    const back = parseLibraryFromMd(md);
    expect(back).toHaveLength(1);
    const c = back[0];
    expect(c.code).toBe("C01");
    expect(c.processes.map((p) => p.code)).toEqual(["C01.01", "C01.02"]);
    const bp = c.prompts.find((p) => p.type === "bpmn")!;
    expect(bp.processCode).toBe("C01.01");
    expect(bp.prompt).toBe("BPMN: Capture Details\nLane: Sales");
    expect(bp.model).toBe("claude-haiku-5-5");
    expect(bp.generatedAt).toBe("2026-10-12T01:05:00.000Z");
    expect([bp.templateVersion, bp.additionsHash, bp.templateHash]).toEqual([9, "cccccccccccc", "dddddddddddd"]);
    const vc = c.prompts.find((p) => p.type === "value-chain")!;
    expect([vc.templateVersion, vc.additionsHash]).toEqual([1, "aaaaaaaaaaaa"]);
  });
  it("the project runner's parser reads the C chain and its prompts too", () => {
    const parsed = parseValueChainMd(md);
    expect(parsed.map((c) => c.code)).toEqual(["C01"]);
    expect(parsed[0].diagrams.map((d) => d.type).sort()).toEqual(["bpmn", "value-chain"]);
  });
  it("a file from before the stamps existed still imports, with the stamps unknown (never invented)", () => {
    const old = "<!-- diagramatix: model=claude-opus-5; generated=2026-09-01T00:00:00.000Z -->";
    const p = parseProvenance(old);
    expect(p).toEqual({ model: "claude-opus-5", generatedAt: "2026-09-01T00:00:00.000Z", templateVersion: null, additionsHash: null, templateHash: null });
    expect(renderProvenance({ model: "m" })).toBe("<!-- diagramatix: model=m -->");     // no stamps, nothing added
  });
});

describe("T5297 one writer", () => {
  const admin = readFileSync("app/lib/valueChain/libraryAdmin.ts", "utf8");
  const writer = readFileSync("app/lib/valueChain/writeChainPrompt.ts", "utf8");
  const store = readFileSync("app/lib/valueChain/storePrompt.ts", "utf8");
  it("the regenerate handler stores through the shared step, which saves through writeChainPrompt with a stamp; nothing else upserts a generated prompt", () => {
    expect(admin).toContain("await generateAndStorePrompt({");
    expect(store).toContain("await writeChainPrompt({");
    expect(store).toContain("stampFor(a.target.type, a.briefing, a.additions)");
    expect(admin).not.toContain("valueChainPrompt.upsert");
    expect(admin).not.toContain("generateMdPrompt(");                              // the handler no longer calls the model directly
  });
  it("the writer stores the version, the house-rule hash and the briefing hash with the model and the date", () => {
    for (const col of ["templateVersion", "additionsHash", "templateHash", "model", "generatedAt"]) expect(writer).toContain(col);
  });
  it("an adopted prompt keeps the master prompt's stamps; the project runner stamps diagrams from the stored version", () => {
    expect(admin).toContain("templateVersion: p.templateVersion, additionsHash: p.additionsHash");
    expect(readFileSync("app/lib/valueChain/runLibraryProject.ts", "utf8")).toContain("p.templateVersion ?? templateVersionAt(");
  });
});
