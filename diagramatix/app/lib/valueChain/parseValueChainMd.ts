/**
 * Parse a "Process Repository"-style Value-Chain markdown file into a list of
 * value chains, each carrying the per-diagram AI prompts found inside it.
 *
 * The expected shape (see `new features/Process Repository.md`):
 *
 *   ## V01 — Order to Cash            ← a value chain (H2, "Vnn — Title")
 *   ...
 *   **Value Chain diagram prompt.**   ← a diagram-prompt label
 *   ```text
 *   <the prompt handed to AI Generate>
 *   ```
 *   **Context diagram prompt.**       ← another
 *   ```text ... ```
 *   ### V01.01 — Receive Order        ← a BPMN sub-process heading (H3)
 *   **BPMN diagram prompt.**
 *   ```text ... ```
 *
 * We collect every ```` ```text ```` block that follows a `**X diagram prompt.**`
 * label, map the label to the diagram TYPE the app understands, and name the
 * diagram from the nearest preceding `### Vnn.mm — …` heading (for BPMN) or a
 * generated "Vnn Title — <Type>" name (for the chain-level diagrams). Sections
 * without a prompt (narrative, association matrix, roll-up) are ignored.
 *
 * Pure + dependency-free so it runs unchanged on the server (parse/run routes)
 * and could run in the browser if ever needed.
 */

/** The diagram types this parser can emit — each a canonical Diagram.type key. */
export type ParsedDiagramType =
  | "value-chain"
  | "context"
  | "process-context"
  | "archimate"
  | "bpmn";

export interface ParsedDiagram {
  /** Human diagram name, e.g. "V02.01 Identify Need" or "V02 Procure to Pay — Context". */
  name: string;
  type: ParsedDiagramType;
  /** The verbatim prompt text (inside the ```text fence) handed to AI Generate. */
  prompt: string;
  /**
   * Where this prompt came from, when the run reads the LIBRARY rather than a
   * markdown file. Stamped onto the generated diagram so it can later answer
   * "has the prompt I came from moved on since?" — which nothing could, before.
   * Absent for a run from a .md, which has no regeneration history to compare to.
   */
  source?: DiagramPromptSource;
}

/** The library identity of the prompt a diagram was generated from. */
export interface DiagramPromptSource {
  kind: "value-chain-library";
  /** "V22" */
  chainCode: string;
  /** "V22.06", or "" for a chain-level prompt. */
  processCode: string;
  promptType: string;
  /** When the PROMPT was generated — the thing a later regeneration moves. */
  promptGeneratedAt: string | null;
  /** The master template version that prompt was written to. */
  templateVersion: number;
}

export interface ParsedValueChain {
  /** e.g. "V02" */
  code: string;
  /** e.g. "Procure to Pay" */
  title: string;
  diagrams: ParsedDiagram[];
}

/** `**Value Chain diagram prompt.**` → the label phrase → the diagram type. */
const LABEL_TO_TYPE: Record<string, ParsedDiagramType> = {
  "value chain": "value-chain",
  context: "context",
  "process context": "process-context",
  archimate: "archimate",
  bpmn: "bpmn",
};

/** Type → the suffix used when naming a chain-level (non-BPMN) diagram. */
const TYPE_LABEL: Record<Exclude<ParsedDiagramType, "bpmn">, string> = {
  "value-chain": "Value Chain",
  context: "Context",
  "process-context": "Process Context",
  archimate: "ArchiMate",
};

/** Normalise the em-dash-separated headings to a single readable string. */
function tidyHeading(raw: string): string {
  return raw.replace(/\s*[—–-]\s*/, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse the whole markdown document into value chains with their diagram prompts.
 * Chains with no diagram prompts (only narrative) are still returned, with an
 * empty `diagrams` array, so a caller can show "not ready yet".
 */
export function parseValueChainMd(md: string): ParsedValueChain[] {
  const text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. Find every H2 heading and its char offset, so we can slice each section.
  const h2 = /^##[ \t]+(.+?)[ \t]*$/gm;
  const headings: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = h2.exec(text)) !== null) {
    headings.push({ start: m.index, end: h2.lastIndex, text: m[1].trim() });
  }

  const chains: ParsedValueChain[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    // Only H2s shaped like "V01 — Order to Cash" are value chains.
    const cm = /^(V\d+)\b\s*[—–-]\s*(.+)$/.exec(h.text);
    if (!cm) continue;
    const code = cm[1];
    const title = cm[2].trim();
    const bodyStart = h.end;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].start : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    chains.push({ code, title, diagrams: parseChainBody(body, code, title) });
  }
  return chains;
}

/** Extract the ordered diagram prompts within a single value-chain section. */
function parseChainBody(body: string, code: string, title: string): ParsedDiagram[] {
  // Collect the offsets of: prompt labels, ```text fences, and H3 sub-headings.
  const labels: { index: number; type: ParsedDiagramType }[] = [];
  const labelRe = /\*\*([^*]+?) diagram prompt\.\*\*/g;
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(body)) !== null) {
    const key = lm[1].trim().toLowerCase();
    const type = LABEL_TO_TYPE[key];
    if (type) labels.push({ index: lm.index, type });
  }

  const fences: { index: number; text: string }[] = [];
  const fenceRe = /```text[ \t]*\n([\s\S]*?)\n?```/g;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(body)) !== null) {
    fences.push({ index: fm.index, text: fm[1].replace(/\s+$/, "") });
  }

  const subheads: { index: number; text: string }[] = [];
  const h3 = /^###[ \t]+(.+?)[ \t]*$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = h3.exec(body)) !== null) {
    subheads.push({ index: hm.index, text: hm[1].trim() });
  }

  const diagrams: ParsedDiagram[] = [];
  for (const label of labels) {
    // The prompt is the first ```text fence that starts AFTER the label.
    const fence = fences.find((f) => f.index > label.index);
    if (!fence || !fence.text.trim()) continue;

    let name: string;
    if (label.type === "bpmn") {
      // Name from the nearest preceding H3 (the "### Vnn.mm — Name" heading).
      let head: { index: number; text: string } | undefined;
      for (const s of subheads) {
        if (s.index < label.index) head = s;
        else break;
      }
      name = head ? tidyHeading(head.text) : `${code} ${title} — BPMN`;
    } else {
      name = `${code} ${title} — ${TYPE_LABEL[label.type]}`;
    }
    diagrams.push({ name, type: label.type, prompt: fence.text });
  }

  // `labels` is scanned left-to-right, so `diagrams` is already in document order.
  return diagrams;
}
