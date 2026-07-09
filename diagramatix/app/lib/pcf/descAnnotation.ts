/**
 * Add a rectangular text-box annotation carrying the APQC element description of
 * the process a (deterministic) decomposition diagram represents. Placed above
 * the flow, sized to a reasonable rectangle for the wrapped text. Pure.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

export function addDescriptionAnnotation(data: DiagramData, description?: string | null): DiagramData {
  const desc = (description ?? "").replace(/\s+/g, " ").trim();
  const els = data.elements ?? [];
  if (!desc || els.length === 0) return data;

  const capped = desc.length > 700 ? desc.slice(0, 699).trimEnd() + "…" : desc;
  const width = 300;
  const charsPerLine = 44;                 // ~12px font within a 300px box
  const lineCount = Math.max(1, Math.ceil(capped.length / charsPerLine));
  const height = Math.min(360, Math.max(48, lineCount * 16 + 18));

  const minX = Math.min(...els.map((e) => e.x));
  const minY = Math.min(...els.map((e) => e.y));

  const annot = {
    id: "annot-pcf-desc",
    type: "text-annotation",
    x: minX,
    y: minY - height - 32,               // above the flow
    width,
    height,
    label: capped,
    properties: { boxed: true },          // full rectangular box (see TextAnnotationShape)
  } as DiagramElement;

  return { ...data, elements: [...els, annot] };
}
