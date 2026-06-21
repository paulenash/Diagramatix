/**
 * The AI image→BPMN flowchart-translation prompt line is GENERATED from the
 * canonical mapping table (flowchartBpmnMap.ts). These tests pin that contract:
 *  - the rendered prompt is derived from the table (every distinct promptText
 *    appears), so the prompt can never silently drift from the code translator;
 *  - the BPMN system prompt actually embeds the generated line.
 */
import { describe, it, expect } from "vitest";
import {
  FLOWCHART_TO_BPMN_MAP,
  renderFlowchartMappingForPrompt,
} from "@/app/lib/diagram/translate/flowchartBpmnMap";
import { buildSystemPrompt } from "@/app/lib/ai/planBpmn";

describe("renderFlowchartMappingForPrompt", () => {
  const rendered = renderFlowchartMappingForPrompt();

  it("includes every distinct promptText from the table", () => {
    const distinct = new Set(
      Object.values(FLOWCHART_TO_BPMN_MAP).map((m) => m.promptText),
    );
    for (const phrase of distinct) {
      expect(rendered).toContain(phrase);
    }
  });

  it("opens with the TRANSLATE instruction and closes with the pool-wrap rule", () => {
    expect(rendered).toMatch(/^If the image is a non-BPMN flowchart: TRANSLATE shapes to BPMN\./);
    expect(rendered).toContain("single white-box pool named after the process");
  });

  it("emits the shared on/off-page connector phrase only once", () => {
    const phrase = FLOWCHART_TO_BPMN_MAP["flowchart-onpage"].promptText;
    const occurrences = rendered.split(phrase).length - 1;
    expect(occurrences).toBe(1);
  });

  it("is embedded verbatim in the BPMN system prompt", () => {
    const sys = buildSystemPrompt("");
    expect(sys).toContain(rendered);
  });
});
