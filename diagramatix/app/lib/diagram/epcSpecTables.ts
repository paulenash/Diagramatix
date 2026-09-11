/**
 * The eEPC specification's TABLES, built from the live code.
 *
 * The prose in `docs/eEPC-specification.md` is written by hand; every table in
 * it is generated from here and spliced in between markers. A specification
 * that restates the symbol set in prose is a specification that disagrees with
 * the product the first time somebody adds a shape — and it disagrees SILENTLY,
 * which is worse than having no document, because a reader trusts it.
 *
 * `npm run spec:epc` rewrites the document. A test fails if the committed copy
 * is stale, so it cannot drift without somebody being told.
 */
import type { SymbolType } from "./types";
import {
  EPC_DESCRIPTIVE_SYMBOLS,
  PALETTE_BY_DIAGRAM_TYPE,
  getSymbolDefinition,
} from "./symbols/definitions";
import { DEFAULT_SYMBOL_COLORS } from "./colors";
import { EPC_TO_BPMN_MAP, type EpcBpmnKind } from "./translate/epcBpmnMap";

/** Markdown-safe: a pipe in a description would split the cell. */
const cell = (s: string) => s.replace(/\|/g, "\\|").trim();

/**
 * The core notation, in palette order.
 *
 * PALETTE_BY_DIAGRAM_TYPE.epc lists the ten symbols that carry the process; the
 * connectors sit in ALL_SYMBOLS but not in the palette list (they are placed by
 * the split/join tools), so they are named explicitly and kept in notation
 * order rather than declaration order.
 */
const CORE_ORDER: SymbolType[] = [
  "epc-event", "epc-function",
  "epc-xor", "epc-and", "epc-or",
  "epc-org-unit", "epc-position",
  "epc-data", "epc-application",
  "epc-interface",
];

/** The drawn shape, which is a property of the renderer rather than the data. */
const SHAPE: Partial<Record<SymbolType, string>> = {
  "epc-event": "Elongated hexagon — flat top and bottom, points left and right",
  "epc-function": "Rounded rectangle",
  "epc-xor": "Circle containing ×",
  "epc-and": "Circle containing ∧",
  "epc-or": "Circle containing ∨",
  "epc-org-unit": "Rectangle with a half-ellipse left edge and a vertical divider",
  "epc-position": "The same outline, with a person glyph in the cap",
  "epc-data": "Rectangle with a vertical bar down the left edge",
  "epc-application": "Rectangle with vertical bars at both sides",
  "epc-interface": "Chevron — pointed right, notched left",
};

function symbolRows(types: SymbolType[]): string {
  const head = "| Symbol | `SymbolType` | Shape | Size | Colour | Meaning |\n|---|---|---|---|---|---|";
  const rows = types.map((t) => {
    const d = getSymbolDefinition(t);
    const shape = SHAPE[t] ?? "Rounded rectangle with a corner glyph";
    const colour = DEFAULT_SYMBOL_COLORS[t] ?? "—";
    return `| **${cell(d.label)}** | \`${t}\` | ${cell(shape)} | ${d.defaultWidth}×${d.defaultHeight} | \`${colour}\` | ${cell(d.description)} |`;
  });
  return [head, ...rows].join("\n");
}

/** The ten symbols that carry the notation. */
export function renderCoreSymbolTable(): string {
  const declared = new Set(PALETTE_BY_DIAGRAM_TYPE.epc);
  // Guard the hand-kept order against the palette drifting away from it.
  const missing = CORE_ORDER.filter((t) => !declared.has(t) && !t.startsWith("epc-x") && !t.startsWith("epc-a") && !t.startsWith("epc-o"));
  if (missing.length) throw new Error(`core order names symbols the palette does not: ${missing.join(", ")}`);
  return symbolRows(CORE_ORDER);
}

/** The ten that describe a function rather than carrying the flow. */
export function renderDescriptiveSymbolTable(): string {
  return symbolRows([...EPC_DESCRIPTIVE_SYMBOLS]);
}

const KIND_PROSE: Record<EpcBpmnKind, string> = {
  activity: "Becomes a task — the only EPC element that is unambiguously work.",
  event: "Resolved by POSITION: start, end, a label on a flow, or dropped. See the two rules below.",
  gateway: "Becomes a gateway of the matching type.",
  lane: "Becomes a lane, derived from the assignment relationship rather than from geometry.",
  "system-pool": "Becomes a black-box IT system pool — never a data store.",
  artifact: "Spliced out of the sequence and re-attached by association.",
  call: "Becomes a call activity: the chain continues in another EPC.",
};

/** EPC → BPMN, from the table that also drives the AI image prompt. */
export function renderConversionTable(): string {
  const head = "| EPC | BPMN | How | Notes |\n|---|---|---|---|";
  const rows = Object.values(EPC_TO_BPMN_MAP).map((m) => {
    const label = getSymbolDefinition(m.epc).label;
    const target = m.bpmn === "gateway" && m.gatewayType ? `\`gateway\` (${m.gatewayType})`
      : m.subprocessType ? `\`${m.bpmn}\` (${m.subprocessType})`
      : `\`${m.bpmn}\``;
    const notes = [
      m.labelPrefix ? `Label prefixed \`${m.labelPrefix}: \`` : "",
      m.note ?? "",
      m.approx ? "*Approximate.*" : "",
    ].filter(Boolean).join(" ");
    return `| ${cell(label)} | ${target} | ${cell(KIND_PROSE[m.kind])} | ${cell(notes) || "—"} |`;
  });
  return [head, ...rows].join("\n");
}

/**
 * The diagnostic kinds the layout can report, so the rules table below cannot
 * claim a check the code does not make — or miss one it does.
 */
export const EPC_DIAGNOSTIC_KINDS = [
  "epc-alternation",
  "epc-event-decides",
  "epc-connector-both-ways",
  "epc-not-event-bounded",
  "epc-unbalanced-connector",
  "epc-multiple-org",
  "epc-assignment-not-on-function",
] as const;
