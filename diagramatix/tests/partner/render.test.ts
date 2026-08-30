/**
 * Partner API — rendering a diagram to a file.
 *
 * `renderTemplateThumbnailSvg` already draws server-side; this wrapper fixes the
 * three things that are fine inline and not fine in a file. T2996 is the one
 * that would otherwise bite silently: without an intrinsic width and height,
 * LibreOffice picks a default page and the diagram lands tiny or clipped — a PDF
 * that opens and looks wrong, rather than an error.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { renderDiagramSvg, NothingToRenderError } from "@/app/lib/partner/renderDiagramSvg";
import { thumbnailTransform } from "@/app/lib/diagram/templateThumbnail";

function sample() {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Acme", poolType: "white-box" },
    { id: "l", type: "lane", label: "Finance", parentPool: "p" },
    { id: "s", type: "start-event", label: "Invoice received", pool: "p", lane: "l" },
    { id: "t", type: "task", label: "Check Against Purchase Order", taskType: "user", pool: "p", lane: "l" },
    { id: "e", type: "end-event", label: "Approved", pool: "p", lane: "l" },
  ];
  const conns: AiConnection[] = [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }];
  return layoutBpmnDiagram(els, conns);
}

describe("renderDiagramSvg", () => {
  it("T2996 — the SVG carries an intrinsic width and height matching the content", () => {
    // Without these LibreOffice picks a default page: the PDF opens and is
    // wrong, which is worse than a failure because nobody investigates it.
    const data = sample();
    const svg = renderDiagramSvg(data);
    const { w, h } = thumbnailTransform(data.elements);

    const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
    const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
    expect(width).toBe(Math.max(1, Math.round(w)));
    expect(height).toBe(Math.max(1, Math.round(h)));
  });

  it("T2997 — it has an opaque background and a font stack the image actually has", () => {
    const svg = renderDiagramSvg(sample());
    expect(svg, "a transparent PDF prints as whatever the viewer decides").toMatch(/fill="#ffffff"/);
    expect(svg).toMatch(/Liberation Sans/);
  });

  it("T2998 — the content is really in there, not just a frame", () => {
    const svg = renderDiagramSvg(sample());
    expect(svg).toContain("Acme");
    expect(svg).toContain("Finance");
    expect(svg).toMatch(/Check Against/);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("T2999 — an empty diagram throws rather than handing LibreOffice an empty string", () => {
    // renderTemplateThumbnailSvg returns "" for no elements, and soffice given
    // an empty file produces a confusing failure much further downstream.
    const empty = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };
    expect(() => renderDiagramSvg(empty)).toThrow(NothingToRenderError);
  });
});
