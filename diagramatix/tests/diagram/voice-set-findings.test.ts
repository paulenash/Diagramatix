/**
 * What the 50-command set's builder found going wrong (2026-09-27), probing
 * ~150 phrasings on the test diagram — the silent wrong edits, fixed.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { parsePoolBoundaryPhrase, readAmount } from "@/app/lib/assist/poolBoundaryPhrase";

const say = (text: string, selectedIds: string[] = []) => {
  const h = headlessDiagram(fixtureDiagram());
  const before = structuredClone(h.data);
  const r = applyAssistOps(parseCommand(text)!, h.context({ selectedIds }));
  return { h, before, r, el: (id: string) => h.data.elements.find((e) => e.id === id)! };
};

describe("T4973 — the 50-command set's findings: no more silent wrong edits", () => {
  it("contents moves read the amount with the boundary's reader — no more silent 100px", () => {
    const amt = (s: string) => { const o = parseCommand(s)?.[0] as { steps?: number; pixels?: number } | undefined; return o ? (o.pixels !== undefined ? `${o.pixels}px` : o.steps !== undefined ? `${o.steps} steps` : "default") : "none"; };
    expect(amt("move everything in Underwriters twenty pixels to the right")).toBe("20px");
    expect(amt("move everything in Underwriters to the left by fifty pixels")).toBe("50px");
    expect(amt("move everything in Lane 3 thirty pixels to the left")).toBe("30px");
    expect(amt("move everything in Underwriters one task to the right")).toBe("102px");
    expect(amt("move everything in Underwriters a bit to the right")).toBe("10px");
    expect(amt("move everything in Underwriters one and a half steps to the right")).toBe("150px");
    expect(amt("move everything in Underwriters two to the right")).toBe("2 steps");
    expect(amt("move everything in Underwriters fifty to the left")).toBe("50px");
    // A name's number is never the amount.
    expect(parseCommand("move everything starting at Task 2 in Claims Processing one step to the right")?.[0]).toMatchObject({ fromRef: "Task 2", ref: "Claims Processing", steps: 1 });
    expect(readAmount(["Task", "2", "in", "Lane", "3"])).toBeNull();
  });

  it("“move Underwriters contents …” and “… in the Claims Processing pool …” are the contents move — and a lane never slides sideways", () => {
    expect(parseCommand("move Underwriters contents one step to the right")).toEqual([{ op: "moveContents", ref: "Underwriters", direction: "right", steps: 1 }]);
    expect(parseCommand("move the Underwriters lane contents one step to the right")?.[0]).toMatchObject({ op: "moveContents", steps: 1 });
    expect(parseCommand("move everything in the Claims Processing pool one step right")?.[0]).toMatchObject({ op: "moveContents", ref: "the Claims Processing pool", steps: 1 });
    const s = say("move Underwriters right");
    expect(s.r).toEqual({ ok: false, summary: "Underwriters is a lane — to move what is in it, say “move everything in Underwriters one step to the right”" });
    expect(s.h.data).toEqual(s.before);
  });

  it("a pool edge says what REALLY moved, and never grows over the next pool", () => {
    const up = say("move the top boundary of Lane 3 up by 200");
    const cust = up.el("cust");
    expect(up.r.summary).toMatch(/^moved Claims Processing's top boundary up \d+px — it stops short of Customer$/);
    expect(up.el("p").y, "clear of the Customer pool").toBeGreaterThanOrEqual(cust.y + cust.height);
    const inward = say("move Lane 2 bottom boundary up by 100");
    expect(inward.r.summary).toMatch(/^moved Claims Processing's bottom boundary up (\d+)px — it stops at what is inside$/);
    expect(Number(inward.r.summary.match(/up (\d+)px/)![1])).toBeLessThan(100);
  });

  it("touching is not crossing; “1.5 tasks” is 96px", () => {
    expect(say("move Underwriters bottom boundary down").r).toEqual({ ok: true, summary: "moved Underwriters's bottom boundary down 20px" });
    const d = (s: string) => { const p = parsePoolBoundaryPhrase(s); return p && p !== "needs-direction" ? p.distance : undefined; };
    expect(d("move Underwriters top boundary up by 1.5 tasks")).toBe(96);
    expect(d("move Underwriters top boundary up by one and a half tasks")).toBe(96);
  });
});
