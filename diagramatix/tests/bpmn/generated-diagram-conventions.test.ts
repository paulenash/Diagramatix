/**
 * Two conventions every AI-generated BPMN diagram must obey, both asked for by
 * Paul on 2026-08-27 and both enforced in `layoutBpmnDiagram` rather than in the
 * prompt — a rule the model can forget is not a rule.
 *
 *  1. NO "AI Generated" ANNOTATION. It used to be stamped above the start event
 *     naming the prompt, because that was once the only way to see where a
 *     diagram came from. A generated diagram now stores its prompt on
 *     `data.aiGeneration` and the editor shows it on demand, so the annotation
 *     was duplicating that in ink on every diagram, permanently.
 *
 *  2. EVERY EDGE-MOUNTED INTERMEDIATE EVENT IS INTERRUPTING. The subtlety worth
 *     guarding is the exception: the non-interrupting START event that R6.11
 *     places INSIDE an Event Expanded Subprocess is not edge-mounted, and its
 *     non-interrupting flavour is what says the inner tasks run in parallel with
 *     the outer ones. A blanket "force interrupting" would silently change what
 *     every event subprocess means, so that case is pinned here too.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

/** A process with boundary events of both flavours, plus an event subprocess. */
const els: AiElement[] = [
  { id: "p", type: "pool", label: "Sales", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Order received", pool: "p" },
  { id: "t1", type: "task", label: "Capture order", pool: "p" },
  { id: "t2", type: "task", label: "Confirm order", pool: "p" },
  { id: "e", type: "end-event", label: "Order captured", pool: "p" },
  // Asked for as NON-interrupting — must come back interrupting.
  {
    id: "nag", type: "intermediate-event", label: "No response in 2 days", eventType: "timer",
    boundaryHost: "t1", boundarySide: "bottom",
    properties: { interruptionType: "non-interrupting" },
  } as AiElement,
  // Asked for with nothing said — must also come back interrupting.
  { id: "err", type: "intermediate-event", label: "Capture failed", eventType: "error", boundaryHost: "t2", boundarySide: "bottom" },
  { id: "handle", type: "task", label: "Handle failure", pool: "p" },
  // An Event Expanded Subprocess with an internal non-interrupting start event.
  { id: "ep", type: "subprocess-expanded", label: "Do Until Done", pool: "p" },
  { id: "evsub", type: "subprocess-expanded", label: "Meanwhile Notify", parentSubprocess: "ep", usage: "Event" } as AiElement,
  {
    id: "evstart", type: "start-event", label: "", parentSubprocess: "evsub",
    properties: { interruptionType: "non-interrupting" },
  } as AiElement,
  { id: "evtask", type: "task", label: "Send update", parentSubprocess: "evsub" },
  { id: "evend", type: "end-event", label: "", parentSubprocess: "evsub" },
];

const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
  { sourceId: "t2", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
  { sourceId: "nag", targetId: "handle" }, { sourceId: "err", targetId: "handle" },
  { sourceId: "evstart", targetId: "evtask" }, { sourceId: "evtask", targetId: "evend" },
];

const interruption = (el: { properties?: Record<string, unknown> } | undefined) =>
  (el?.properties as Record<string, unknown> | undefined)?.interruptionType;

describe("Generated BPMN conventions", () => {
  it("T2895 — no AI Generated annotation is produced, even when a prompt label is given", () => {
    // promptLabel is still accepted by callers; it must simply no longer draw.
    const out = layoutBpmnDiagram(els, conns, { promptLabel: "V01.01 Receive Order" });
    expect(out.elements.find((e) => e.id === "_ai_gen_annotation")).toBeUndefined();
    for (const e of out.elements) {
      expect(e.label ?? "", `element ${e.id}`).not.toContain("AI Generated");
    }
    // And no dangling association was left pointing at the removed annotation.
    for (const c of out.connectors) {
      expect(c.sourceId).not.toBe("_ai_gen_annotation");
      expect(c.targetId).not.toBe("_ai_gen_annotation");
    }
    // The diagram itself still got built — the guard is not passing by being empty.
    expect(out.elements.length).toBeGreaterThan(8);
  });

  it("T2896 — every edge-mounted intermediate event comes back interrupting", () => {
    const out = layoutBpmnDiagram(els, conns);
    const boundary = out.elements.filter((e) => e.type === "intermediate-event" && e.boundaryHostId);
    expect(boundary.length, "the fixture must actually produce boundary events").toBeGreaterThanOrEqual(2);
    for (const e of boundary) {
      expect(interruption(e), `${e.id} (${e.label}) must be interrupting`).toBe("interrupting");
    }
    // Specifically: the one that ASKED to be non-interrupting was overridden.
    expect(interruption(out.elements.find((e) => e.id === "nag"))).toBe("interrupting");
  });

  it("T2897 — an Event Subprocess's internal start event keeps its non-interrupting flavour", () => {
    // The trap. This start event is INSIDE the event subprocess (parentId), never
    // edge-mounted, and non-interrupting is what says its tasks run in parallel
    // with the outer ones. Forcing it to interrupting would change the meaning of
    // every event subprocess in the app.
    const out = layoutBpmnDiagram(els, conns);
    const evstart = out.elements.find((e) => e.id === "evstart");
    expect(evstart, "the internal start event must survive layout").toBeDefined();
    expect(evstart!.boundaryHostId, "it is internal, not edge-mounted").toBeFalsy();
    expect(interruption(evstart)).toBe("non-interrupting");
  });
});
