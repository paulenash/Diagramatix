/**
 * T4769 — what Animate says as each shape appears.
 *
 * The script is the diagram's own labels, in the order Animate already chose.
 * Three rules decide what is said and what is left silent — see narration.ts.
 */
import { describe, it, expect } from "vitest";
import { narrationFor } from "@/app/lib/voice/narration";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (type: string, label: string): DiagramElement =>
  ({ id: `${type}-1`, type, label, x: 0, y: 0, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;

describe("T4769 — the narration script", () => {
  it("a step says its own label, nothing invented", () => {
    expect(narrationFor(el("task", "Check coverage"))).toBe("Check coverage");
    expect(narrationFor(el("gateway", "Claim approved?"))).toBe("Claim approved?");
    expect(narrationFor(el("end-event", "Claim closed"))).toBe("Claim closed");
    expect(narrationFor(el("subprocess", "Assess damage"))).toBe("Assess damage");
  });

  it("a container says what it is — a pool called Customer is not a step called Customer", () => {
    expect(narrationFor(el("pool", "Customer"))).toBe("Pool, Customer");
    expect(narrationFor(el("lane", "Underwriters"))).toBe("Lane, Underwriters");
    expect(narrationFor(el("sublane", "Senior"))).toBe("Sub-lane, Senior");
  });

  it("an unlabelled shape appears in silence", () => {
    expect(narrationFor(el("start-event", ""))).toBe("");
    expect(narrationFor(el("gateway", "   "))).toBe("");
  });

  it("notes are not the process: annotations, review comments and groups are never read", () => {
    expect(narrationFor(el("text-annotation", "Check with legal"))).toBe("");
    expect(narrationFor(el("review-comment", "Is this right?"))).toBe("");
    expect(narrationFor(el("group", "Phase 1"))).toBe("");
  });

  it("data IS process (Paul: “include data stores”) and is read", () => {
    expect(narrationFor(el("data-store", "Claims DB"))).toBe("Claims DB");
    expect(narrationFor(el("data-object", "Claim form"))).toBe("Claim form");
  });

  it("labels go through the same cleanup as every spoken string", () => {
    expect(narrationFor(el("task", "Review\n\"Claim 1\""))).toBe("Review Claim one");
  });
});
