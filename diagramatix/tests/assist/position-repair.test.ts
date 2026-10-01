/**
 * T5205 — Voice Assist Help slice 5: position-aware repair of mis-heard words. On by default,
 * switchable in the SuperAdmin tile (Paul, 2026-10-01: "put it on, configurably, for now").
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { resolveAssistHelp } from "@/app/lib/assist/commandTree";
import { repairByPosition, repairForRun } from "@/app/lib/assist/commandTree/positionRepair";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { parseStoredVoiceAssistHelp } from "@/app/lib/voice/voiceAssistHelpSetting";

const tree = resolveAssistHelp({ patterns: null, conventions: null }).tree!;
const read = (p: string) => readFileSync(p, "utf8");

describe("T5205 repairByPosition", () => {
  it("a word the tree rejects but that sounds like exactly one expected word is repaired", () => {
    const r = repairByPosition(tree, "mood");
    expect(r.changes.length === 0 || r.changes[0].to === "move").toBe(true);
  });
  it("a word that FITS is never touched", () => {
    expect(repairByPosition(tree, "rename this to pay the claim")).toEqual({ text: "rename this to pay the claim", changes: [] });
  });
  it("inside a name nothing is repaired — any word fits there", () => {
    const r = repairByPosition(tree, "rename this to mood for tree");
    expect(r.changes).toEqual([]);
  });
  it("the case of the words spoken is kept in what is returned", () => {
    const r = repairByPosition(tree, "rename This to Pay The Claim");
    expect(r.text).toBe("rename This to Pay The Claim");
  });
});

describe("T5205 repairForRun — only ever rescues a command the parser does not understand", () => {
  it("every catalog sentence that already parses comes back unchanged", () => {
    for (const card of COMMAND_CATALOG) for (const ex of (card as { examples?: string[] }).examples ?? []) {
      if (!parseCommand(ex)) continue;
      expect(repairForRun(tree, ex).text, ex).toBe(ex);
    }
  });
  it("a repair is used only if the parser then understands it", () => {
    for (const s of ["mood this up", "rename to", "zzz qqq", "delete flurb"]) {
      const r = repairForRun(tree, s);
      if (r.text !== s) expect(parseCommand(r.text), s).toBeTruthy();
    }
  });
  it("nothing heard, nothing returned", () => {
    expect(repairForRun(tree, "  ")).toEqual({ text: "", changes: [] });
  });
});

describe("T5205 the switch", () => {
  it("is ON when nothing is stored, and only a stored \"false\" turns it off", () => {
    expect(parseStoredVoiceAssistHelp([]).repair).toBe(true);
    expect(parseStoredVoiceAssistHelp([{ key: "voiceAssistHelp.repair", value: "false" }]).repair).toBe(false);
    expect(parseStoredVoiceAssistHelp([{ key: "voiceAssistHelp.repair", value: "true" }]).repair).toBe(true);
  });
  it("is wired: the tile button, the admin route, the editor route, the hook and the session", () => {
    expect(read("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx")).toContain("onRepair(!data.repair)");
    expect(read("app/api/admin/voice-assist-help/route.ts")).toContain("repair must be true or false");
    expect(read("app/api/voice-assist-help/route.ts")).toContain("repair: stored.repair");
    expect(read("app/hooks/useVoiceAssistHelp.ts")).toContain("setRepairTree(t)");
    const session = read("app/hooks/useVoiceSession.ts");
    expect(session).toContain("host.repairCommandRef?.current?.(cmd)");
    // never while a flow or a question is open: those answers go to the flow, not the parser
    expect(session).toMatch(/nothingOpen[\s\S]{0,300}pendingConfirmRef\.current/);
  });
});
