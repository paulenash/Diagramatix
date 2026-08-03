/**
 * A compensation activity (isForCompensation) is triggered by a compensation
 * association — never a sequence flow — so the "activity has no incoming/outgoing
 * sequence connector" rules must NOT flag it (T2218).
 */
import { describe, it, expect } from "vitest";
import { checkActivityHasIncoming, checkActivityHasOutgoing } from "@/app/lib/diagram/checks/diagramChecks";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, props: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 100, height: 60, properties: props } as DiagramElement);
const seq = (id: string, s: string, t: string): Connector =>
  ({ id, type: "sequence", sourceId: s, targetId: t, waypoints: [] } as unknown as Connector);

describe("compensation activity is exempt from sequence-flow rules (T2218)", () => {
  // A normal flow A→B; plus a disconnected compensation task, and a disconnected NORMAL task.
  const elements = [
    el("s", "start-event"), el("a", "task"), el("e", "end-event"),
    el("comp", "task", { isForCompensation: true }),   // compensation handler — no sequence flow
    el("orphan", "task"),                               // a genuinely orphaned normal task
  ];
  const connectors = [seq("s1", "s", "a"), seq("s2", "a", "e")];
  const data = { elements, connectors };

  it("does not flag the compensation activity for missing incoming/outgoing", () => {
    const inV = checkActivityHasIncoming(data);
    const outV = checkActivityHasOutgoing(data);
    expect(inV.some((v) => v.ids.includes("comp"))).toBe(false);
    expect(outV.some((v) => v.ids.includes("comp"))).toBe(false);
  });

  it("still flags a genuinely orphaned normal task", () => {
    expect(checkActivityHasIncoming(data).some((v) => v.ids.includes("orphan"))).toBe(true);
    expect(checkActivityHasOutgoing(data).some((v) => v.ids.includes("orphan"))).toBe(true);
  });
});

describe("compensation activity is exempt from the EP one-entry/one-exit variant (T2218)", () => {
  // A non-ad-hoc Expanded Sub-Process allows ONE orphan entry (and one exit).
  // A compensation handler inside it must NOT be counted as the disallowed
  // second orphan — it is exempt entirely.
  const child = (id: string, props: Record<string, unknown> = {}) =>
    el(id, "task", props);
  const elements = [
    { ...el("ep", "subprocess-expanded"), width: 400, height: 300 } as DiagramElement,
    { ...child("entry"), parentId: "ep" } as DiagramElement,          // the single allowed entry orphan
    { ...child("next"), parentId: "ep" } as DiagramElement,           // reached from entry
    { ...child("comp", { isForCompensation: true }), parentId: "ep" } as DiagramElement, // compensation handler
  ];
  const connectors = [seq("s1", "entry", "next")];
  const data = { elements, connectors };

  it("does not flag the compensation handler as a second orphan entry", () => {
    expect(checkActivityHasIncoming(data).some((v) => v.ids.includes("comp"))).toBe(false);
  });
  it("does not flag the compensation handler as a second orphan exit", () => {
    // 'next' has no outgoing → it is the single allowed exit orphan; 'comp' must be exempt, not the 2nd.
    expect(checkActivityHasOutgoing(data).some((v) => v.ids.includes("comp"))).toBe(false);
  });
});
