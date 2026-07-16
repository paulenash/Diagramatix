/**
 * BPMN type-completeness guard (Tier-1 "A").
 *
 * A single BPMN element/event type lives in many parallel structures —
 * palette, symbol definition, AI schema, renderer, XSD export. Adding a type in
 * one place but forgetting another is a silent gap (e.g. the Cancel boundary
 * event once rendered with the wrong trigger because the type wasn't wired
 * everywhere). These tests cross-reference the runtime sources of truth so that
 * a new type fails the build until it's fully wired — or consciously excluded
 * (with a reason in one of the EXCLUDED sets below).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PALETTE_BY_DIAGRAM_TYPE, ALL_SYMBOLS } from "@/app/lib/diagram/symbols/definitions";
import { ELEMENT_TYPES } from "@/app/lib/ai/planSchema";
import type { EventType } from "@/app/lib/diagram/types";

// ── Sources of truth (runtime) ─────────────────────────────────────────────
const BPMN_PALETTE = PALETTE_BY_DIAGRAM_TYPE.bpmn;          // user-placeable symbols
const AI_ELEMENT_TYPES = ELEMENT_TYPES as readonly string[]; // AI-emittable types
// Everything a user can place OR the model can emit.
const BPMN_ELEMENT_TYPES = [...new Set([...BPMN_PALETTE, ...AI_ELEMENT_TYPES])];

const DEFINED_TYPES = new Set(ALL_SYMBOLS.map((s) => s.type));

// Event-trigger types, bridged to the EventType union so the union can't gain a
// member without this list (and therefore the coverage check) being updated.
const BPMN_EVENT_TYPES = [
  "none", "message", "timer", "error", "signal", "terminate", "conditional",
  "escalation", "cancel", "compensation", "link",
] as const;
// Compile-time exhaustiveness: this file fails to typecheck if EventType grows.
type _MissingEvent = Exclude<EventType, typeof BPMN_EVENT_TYPES[number]>;
const _eventExhaustive: _MissingEvent extends never ? true : ["add to BPMN_EVENT_TYPES:", _MissingEvent] = true;
void _eventExhaustive;

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const RENDERER = read("app/components/canvas/SymbolRenderer.tsx");
const XSD = read("public/diagramatix-export.xsd").toLowerCase();

// ── Conscious exclusions (each needs a reason) ─────────────────────────────
// Element types with no draggable palette symbol — created implicitly, not
// dropped (lanes are added inside a pool; a group is drawn around elements).
const PALETTE_EXCLUDED = new Set<string>(["lane"]);
// Decorative problem markers (Pain Point + its dark-green twin Issue) are
// user-placed on EVERY diagram type but are never AI-emitted and carry no BPMN
// semantics — they're consciously excluded from the AI-emittable check.
const AI_EMIT_EXCLUDED = new Set<string>(["uml-pain-point", "uml-issue"]);
// Element/event types that intentionally have no standalone XSD export element.
const XSD_EXCLUDED = new Set<string>([]);
// Event types that don't need a distinct renderer branch.
const RENDERER_EVENT_EXCLUDED = new Set<string>([]);

describe("BPMN type coverage", () => {
  it("every BPMN palette + AI element type has a symbol definition (size/label)", () => {
    const missing = BPMN_ELEMENT_TYPES.filter((t) => !DEFINED_TYPES.has(t as never));
    expect(missing, `element type(s) with no SymbolDefinition in ALL_SYMBOLS: ${missing.join(", ")}`).toEqual([]);
  });

  it("every BPMN palette type is the AI schema can emit (or consciously palette-only)", () => {
    // A user-placeable type the AI can't emit means AI generation can never
    // produce it — flag it so that's a deliberate choice.
    const aiSet = new Set(AI_ELEMENT_TYPES);
    const unemittable = BPMN_PALETTE.filter((t) => !aiSet.has(t) && !AI_EMIT_EXCLUDED.has(t));
    expect(unemittable, `BPMN palette type(s) the AI schema can't emit: ${unemittable.join(", ")}`).toEqual([]);
  });

  it("every BPMN element type is handled by the renderer", () => {
    const missing = BPMN_ELEMENT_TYPES
      .filter((t) => !PALETTE_EXCLUDED.has(t))
      .filter((t) => !RENDERER.includes(`"${t}"`));
    expect(missing, `element type(s) not referenced in SymbolRenderer.tsx: ${missing.join(", ")}`).toEqual([]);
  });

  it("every BPMN element type has an XSD export mapping (or a conscious exclusion)", () => {
    const missing = BPMN_ELEMENT_TYPES
      .filter((t) => !XSD_EXCLUDED.has(t))
      .filter((t) => !XSD.includes(t.toLowerCase()));
    expect(
      missing,
      `element type(s) missing from diagramatix-export.xsd — map them or add to XSD_EXCLUDED: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every BPMN event-trigger type is handled by the renderer (the Cancel-bug guard)", () => {
    const missing = BPMN_EVENT_TYPES
      .filter((t) => !RENDERER_EVENT_EXCLUDED.has(t))
      .filter((t) => !RENDERER.includes(`"${t}"`));
    expect(
      missing,
      `event trigger(s) the renderer doesn't draw — wire them into the event shapes: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
