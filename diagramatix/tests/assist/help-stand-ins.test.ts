/**
 * T5213 — the Voice Assist Help tile picks what is selected / pointed at BY KIND (Paul, 2026-10-02: "replace
 * the list of actual elements from a test diagram with a list of names, one per type of element that can be
 * selected or hovered over").
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAND_IN_KINDS, standInDiagram } from "@/app/lib/assist/commandTree/standIns";
import { targetNow } from "@/app/lib/assist/commandTree";
import { elementUnderPointer, hoverConnectorAt } from "@/app/lib/assist/pointerRef";

const stand = standInDiagram();

describe("T5213 the kinds", () => {
  it("name every kind Paul listed (and the ones he may have forgotten)", () => {
    const labels = STAND_IN_KINDS.map((k) => k.label);
    for (const want of [
      "Black-box Pool", "White-box Pool", "Lane", "Sublane", "Task", "Expanded Subprocess",
      "Boundary Intermediate Event", "In-line Intermediate Event", "Gateway",
      "Sequence Connector", "Message Connector", "Association",
      "Start Event", "End Event", "Data Object", "Data Store", "Text Annotation", "Group",
    ]) expect(labels, want).toContain(want);
    expect(labels.some((l) => l.startsWith("Subprocess"))).toBe(true);
  });
  it("kinds are unique", () => {
    expect(new Set(STAND_IN_KINDS.map((k) => k.id)).size).toBe(STAND_IN_KINDS.length);
  });
  it("every kind can be selected AND hovered — connectors and their labels are hover targets too (2026-10-02)", () => {
    for (const k of STAND_IN_KINDS) expect(k.hover, k.id).toBe(true);
  });
});

describe("T5213 every kind has a stand-in on the test diagram", () => {
  it("an element kind resolves to an element, a connector kind to a connector", () => {
    for (const k of STAND_IN_KINDS) {
      if (/connector$|^association$/.test(k.id)) expect(stand.connectorOf(k.id), k.id).toBeTruthy();
      else expect(stand.elementOf(k.id), k.id).toBeTruthy();
    }
  });
  it("each is the right KIND of thing", () => {
    const t = (id: string) => stand.elementOf(id)!;
    const poolType = (id: string) => (t(id).properties as { poolType?: string }).poolType;
    expect(t("black-box-pool").type).toBe("pool"); expect(poolType("black-box-pool")).toBe("black-box");
    expect(t("white-box-pool").type).toBe("pool"); expect(poolType("white-box-pool")).toBe("white-box");
    expect(t("lane").type).toBe("lane");
    expect(t("sublane").type).toBe("lane");
    expect(stand.diagram.elements.find((e) => e.id === t("sublane").parentId)?.type).toBe("lane");   // a lane inside a lane
    expect(t("task").type).toBe("task");
    expect(t("subprocess").type).toBe("subprocess");
    expect(t("expanded-subprocess").type).toBe("subprocess-expanded");
    expect(t("step-in-ep").parentId).toBe(t("expanded-subprocess").id);
    expect(t("start-event").type).toBe("start-event");
    expect(t("end-event").type).toBe("end-event");
    expect(t("inline-event").type).toBe("intermediate-event"); expect(t("inline-event").boundaryHostId).toBeUndefined();
    expect(t("boundary-event").type).toBe("intermediate-event"); expect(t("boundary-event").boundaryHostId).toBeTruthy();
    expect(t("gateway").type).toBe("gateway");
    expect(t("data-object").type).toBe("data-object");
    expect(t("data-store").type).toBe("data-store");
    expect(t("text-annotation").type).toBe("text-annotation");
    expect(t("group").type).toBe("group");
    expect(stand.connectorOf("sequence-connector")!.type).toBe("sequence");
    expect(stand.connectorOf("message-connector")!.type).toBe("messageBPMN");
    expect(stand.connectorOf("association")!.type).toBe("associationBPMN");
  });
  it("nothing in the test diagram is replaced: it only gains a Kinds Sample Pool", () => {
    const base = standInDiagram().diagram.elements.filter((e) => !e.id.startsWith("ki-"));
    expect(base.length).toBeGreaterThan(20);
    expect(stand.diagram.elements.find((e) => e.id === "ki-pool")?.label).toBe("Kinds Sample Pool");
  });
  it("the Start and End inside the sample expanded subprocess are unnamed", () => {
    for (const id of ["ki-ep-start", "ki-ep-end"]) expect((stand.diagram.elements.find((e) => e.id === id)!.label ?? "").trim()).toBe("");
  });
});

describe("T5213 pointing at a kind finds exactly that kind — by the editor's own rule", () => {
  for (const k of STAND_IN_KINDS.filter((x) => x.hover && !/connector$|^association$/.test(x.id))) {
    it(`over ${k.label}`, () => {
      const at = stand.pointOf(k.id)!;
      expect(at, k.id).toBeTruthy();
      const found = elementUnderPointer(at, stand.diagram.elements);
      expect(found?.id, `${k.id} → ${found?.type}:${found?.label}`).toBe(stand.elementOf(k.id)!.id);
    });
  }
  for (const k of STAND_IN_KINDS.filter((x) => /connector$|^association$/.test(x.id))) {
    it(`over ${k.label}: no element in front, and the connector is the one found`, () => {
      const at = stand.pointOf(k.id)!;
      expect(at, k.id).toBeTruthy();
      expect(elementUnderPointer(at, stand.diagram.elements), `${k.id}: an element is in front`).toBeNull();
      expect(hoverConnectorAt(at, stand.diagram.elements, stand.diagram.connectors)?.id).toBe(stand.connectorOf(k.id)!.id);
    });
  }
});

describe("T5213 the target line understands a selected connector", () => {
  it("names its kind and both ends", () => {
    const c = stand.connectorOf("message-connector")!;
    const t = targetNow(stand.diagram.elements, [], null, null, c);
    expect(t.kind).toBe("selected");
    expect(t.label).toContain("message connector");
    expect(t.label).toContain("→");
    expect(t.label).toContain("selected");
  });
  it("an association is called an association", () => {
    expect(targetNow(stand.diagram.elements, [], null, null, stand.connectorOf("association")!).label).toContain("the association");
  });
  it("an element selection still wins, and nothing selected is unchanged", () => {
    const task = stand.elementOf("task")!;
    expect(targetNow(stand.diagram.elements, [task.id], null, null, stand.connectorOf("sequence-connector")!).kind).toBe("selected");
    expect(targetNow([], [], null, null).kind).toBe("none");
  });
});

describe("T5213 the tile uses it", () => {
  const tile = readFileSync("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx", "utf8");
  it("lists kinds, not elements: Selected offers every kind, Cursor over every hoverable one (all of them since connectors became hover targets)", () => {
    expect(tile).toContain("{STAND_IN_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}");
    expect(tile).toContain("{STAND_IN_KINDS.filter((k) => k.hover).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}");
    expect(tile).not.toContain("choices.map");
  });
  it("the Last command is applied with the connector as the selection when one is chosen", () => {
    expect(tile).toContain("s.selConn?.id ?? null");
  });
});
