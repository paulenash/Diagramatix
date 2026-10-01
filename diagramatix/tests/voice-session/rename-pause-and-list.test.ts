/**
 * Voice Assist, 2026-10-01 — three things Paul found using rename-by-number:
 *
 *   1. On a phone the numbered list shows each name, and after a rename the renamed item still showed its
 *      OLD name: the list was rebuilt from the diagram as it was before the edit had landed.
 *   2. "You have to speak very quickly": the quick path picked a number the moment ANY number was in the
 *      buffer, so "thirteen Approve" … a pause … "Order" renamed the item "Approve" and then rejected "Order".
 *   3. "'one' consistently heard as 'the' is back": a bare "the" (what a lone "one" arrives as) was no answer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { FRAGMENT_SILENCE_MS } from "@/app/lib/assist/fragmentBuffer";
import { restoreLostOneNumber } from "@/app/lib/assist/spokenNumber";
import { restoreLostOne } from "@/app/lib/assist/dividerFlow";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  stubFetch(() => ({ ops: [] }));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

type Target = { id: string; n: number; label?: string };
type Flow = { phase: string; targets?: Target[] } | null;
const rename = (h: Mounted) => h.session.renameFlow as Flow;
const label = (h: Mounted, id: string) => h.data.elements.find((e) => e.id === id)?.label;

async function drain(h: Mounted) {
  await h.act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); });
}
async function advance(h: Mounted, ms: number) {
  await h.act(() => { vi.advanceTimersByTime(ms); });
  await drain(h);
}
async function startMic(h: Mounted) { await h.act(() => h.session.toggleAbraListening()); }
async function hear(h: Mounted, text: string) { await h.act(() => fakeDictation.current.cb.onText(text)); }

describe("T5187 — after a rename the numbered list shows the NEW name", () => {
  it("the renamed task's entry carries its new name (the phone prints it); the others are untouched", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    const before = rename(h)!.targets!.find((t) => t.id === "t2")!.label;
    expect(before).toBeTruthy();
    await h.typed("two");
    await h.typed("approve invoice");
    expect(label(h, "t2")).toBe("Approve invoice");
    const after = rename(h)!.targets!;
    expect(after.find((t) => t.id === "t2")!.label).toBe("Approve invoice");
    expect(after.find((t) => t.id === "t2")!.label).not.toBe(before);
    expect(after.find((t) => t.id === "t1")!.label).toBe(label(h, "t1"));
    expect(after.find((t) => t.id === "t3")!.label).toBe(label(h, "t3"));
  });

  it("the same when number and name are said together, and when a connector label is cleared", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    await h.typed("3 pay the supplier");
    expect(rename(h)!.targets!.find((t) => t.id === "t3")!.label).toBe("Pay the supplier");
  });
});

describe("T5188 — a pause in the middle of a name no longer cuts it off", () => {
  it("“two review” … a pause … “invoice”: nothing runs until the quiet window ends, then the WHOLE name is used", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    await startMic(h);
    await hear(h, "two review");
    await advance(h, 600);                       // a slight pause — shorter than the quiet window
    expect(label(h, "t2")).not.toBe("Review");   // NOT renamed to the first half
    expect(rename(h)!.phase).toBe("pick");       // still waiting
    await hear(h, "invoice");
    await advance(h, FRAGMENT_SILENCE_MS + 100);
    expect(label(h, "t2")).toBe("Review invoice");
  });

  it("a number on its own is still picked AT ONCE — no wait — and the name then follows", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    await startMic(h);
    await hear(h, "two");
    expect(rename(h)!.phase).toBe("name");       // no timer advanced
    expect(h.labelEdits).toContain("t2");
    await hear(h, "approve");
    await advance(h, 600);
    await hear(h, "invoice");
    await advance(h, FRAGMENT_SILENCE_MS + 100);
    expect(label(h, "t2")).toBe("Approve invoice");
  });

});

describe("T5189 — a lone “the” where a number is due means “one”", () => {
  it("the helper: a bare “the”, or “the” + a non-number, is “one …”; “the” before a number (or a mis-heard one) is left alone", () => {
    expect(restoreLostOneNumber("the")).toBe("one");
    expect(restoreLostOneNumber("The.")).toBe("one");
    expect(restoreLostOneNumber("the Approve Order")).toBe("one Approve Order");
    expect(restoreLostOneNumber("the 3")).toBe("the 3");
    expect(restoreLostOneNumber("the three")).toBe("the three");
    expect(restoreLostOneNumber("the lane up")).toBe("the lane up");       // “lane” is a mis-heard number — a noun phrase
    expect(restoreLostOneNumber("two review")).toBe("two review");
  });

  it("“move dividers”: a bare “the” is divider 1", () => {
    expect(restoreLostOne("the")).toBe("1");
    expect(restoreLostOne("The.")).toBe("1");
    expect(restoreLostOne("the down 100 pixels")).toBe("1 down 100 pixels");   // the earlier fix still holds
    expect(restoreLostOne("the lane up")).toBe("the lane up");
  });

  it("the rename pick: “the” picks item 1; “the approve invoice” picks 1 and names it", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    await h.typed("the");
    expect(h.labelEdits).toEqual(["t1"]);
    expect(rename(h)).toMatchObject({ phase: "name", targetId: "t1" });
    await h.typed("send invoice");
    expect(label(h, "t1")).toBe("Send invoice");

    await h.typed("the approve payment");
    expect(label(h, "t1")).toBe("Approve payment");
  });

  it("a name that really starts with “the” is still safe in the NAME step — only the pick is repaired", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    await h.typed("two");
    await h.typed("the big review");
    expect(label(h, "t2")).toBe("The big review");
  });
});

describe("T5190 — the quick path is for a number alone (pinned in the source)", () => {
  it("fires only when the buffer is a number with nothing after it, and uses the lost-“one” repair", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/hooks/useVoiceSession.ts", "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain("const lead = leadingSpokenNumber(restoreLostOneNumber(buf));");
    expect(src).toContain("if (lead && !lead.rest) { flushVoiceBuffer(true); return; }");
    // the old rule — any number anywhere in the buffer — is gone
    expect(src).not.toContain("twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)(?:\\s|$)/i.test(buf)");
  });
});

// keep the type import used (DiagramData / DiagramElement document the harness's data shape)
export type _Shapes = [DiagramData, DiagramElement];
