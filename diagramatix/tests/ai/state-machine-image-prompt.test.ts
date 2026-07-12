/**
 * State Machine AI generation — image (vision) ingestion prompt (T0734).
 *
 * When a user attaches an image of a state-machine diagram, the generic
 * generation route pushes a vision image block AND the state-machine system
 * prompt must teach the model how to map drawn shapes → element types so the
 * transcription is accurate. Guards that shape-mapping guidance so it can't be
 * silently dropped.
 */
import { describe, it, expect } from "vitest";
import { buildGenericSystemPrompt } from "@/app/lib/ai/generateDiagramPrompt";

describe("state-machine image-input prompt (T0734)", () => {
  const sm = buildGenericSystemPrompt("state-machine", "");

  it("has an IMAGE INPUT section", () => {
    expect(sm).toMatch(/IMAGE INPUT/);
  });

  it("maps the key state-machine shapes to element types", () => {
    // initial (solid circle), final (bullseye), state (rounded rect),
    // choice (diamond), fork/join (bar), and arrows → transitions.
    expect(sm).toMatch(/initial-state/);
    expect(sm).toMatch(/final-state/);
    expect(sm).toMatch(/rounded rectangle.*"state"/is);
    expect(sm).toMatch(/diamond.*"gateway"/is);
    expect(sm).toMatch(/bar.*"fork-join"/is);
    expect(sm).toMatch(/arrow.*"transition"/is);
  });

  it("tells the model the image is the source of truth (image wins over prompt)", () => {
    expect(sm).toMatch(/follow the image|image wins|source of truth/i);
    expect(sm).toMatch(/OCR|verbatim/i);
  });

  it("only injects the image guidance for state-machine, not e.g. value-chain", () => {
    const vc = buildGenericSystemPrompt("value-chain", "");
    expect(vc).not.toMatch(/IMAGE INPUT/);
  });
});
