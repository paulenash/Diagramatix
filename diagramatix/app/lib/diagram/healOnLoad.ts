/**
 * The heals a diagram gets once, when it is opened: pool header strips too
 * narrow for their name (B32, containerMetrics.healPoolHeaderWidths), then
 * message labels that were never placed (messageLabel.healMessageLabels). Each
 * returns the same diagram when it has nothing to do.
 *
 * The editor opens with it (useDiagram), and so does the headless diagram — so
 * L4 scores the diagram the editor shows. Pure, so everything else that DRAWS a
 * stored diagram — the phone viewer, the partner PDF — draws what the editor
 * draws (2026-09-28).
 */
import type { DiagramData } from "./types";
import { healPoolHeaderWidths } from "./containerMetrics";
import { healMessageLabels } from "./messageLabel";

export const healOnLoad = (d: DiagramData): DiagramData =>
  Array.isArray(d.elements) && Array.isArray(d.connectors) ? healMessageLabels(healPoolHeaderWidths(d)) : healPoolHeaderWidths(d);
