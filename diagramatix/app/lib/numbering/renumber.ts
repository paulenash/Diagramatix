/**
 * Project re-numbering ENGINE — pure, DB-free, unit-testable (modelled on
 * app/lib/riskControls/renumber.ts). Given the project's numbering config, its
 * folder tree, and its diagrams, it computes a structured diff of every folder /
 * diagram / activity old→new name+code. The same diff drives the preview modal
 * and the apply route (which recomputes server-side, never trusting a client diff).
 *
 * Two modes:
 *  - "full"  (Option 2): renumber the whole tree from the root. Codes are
 *    `{PREFIX}{n}.{m}.{k}…` — a fixed 0–3 uppercase prefix attached to the first
 *    (top-level) number, then dot-separated level groups. Width per level from the
 *    sibling COUNT: ≤9 → 1 digit, ≥10 → 2 digits ZERO-PADDED. Folders + diagrams +
 *    activities all coded.
 *  - "apqc"  (Option 1): keep the APQC folder + diagram codes; renumber each
 *    APQC diagram's activities CONTIGUOUSLY (APQC first by their pcfHierarchyId,
 *    then non-APQC appended) so deleted-APQC gaps close. APQC numbers are BARE
 *    (no zero-padding, e.g. …10, …11) but sort numerically.
 *
 * The activity code always renders on the FIRST LINE of the label ("CODE\nName");
 * diagram/folder codes prefix the name. Re-runs are idempotent: the base
 * descriptive text is recovered with stripLeadingCode() before reapplying.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { stripLeadingCode, widthFor, pad, dottedCompare } from "./codes";
import { folderCode } from "@/app/lib/pcf/bulkFolders";

export const ROOT_ID = "root";

export interface NumberingConfig {
  mode: "apqc" | "full";
  prefix: string;
  applied: boolean;
  showNonApqc: boolean;
  lastAppliedAt?: string;
}

/** Normalise a raw Project.numberingConfig JSON blob into a full config. */
export function resolveNumberingConfig(raw: unknown, hasPcf: boolean): NumberingConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = o.mode === "full" || o.mode === "apqc" ? o.mode : hasPcf ? "apqc" : "full";
  const prefix = typeof o.prefix === "string" ? o.prefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : "";
  return {
    mode,
    prefix,
    applied: !!o.applied,
    showNonApqc: !!o.showNonApqc,
    lastAppliedAt: typeof o.lastAppliedAt === "string" ? o.lastAppliedAt : undefined,
  };
}

export interface FolderNode { id: string; name: string; parentId: string | null; collapsed?: boolean; }
export interface FolderTree {
  folders: FolderNode[];
  diagramFolderMap: Record<string, string>;
  diagramOrder?: Record<string, string[]>;
  folderOrder?: Record<string, string[]>;
}

export interface DiagramInput { id: string; name: string; data: DiagramData; }

export interface ElementDiff { id: string; oldLabel: string; oldCode: string; newCode: string; newLabel: string; isApqc: boolean; }
export interface DiagramDiff { id: string; oldName: string; newName: string; code: string; elements: ElementDiff[]; }
export interface FolderDiff { id: string; oldName: string; newName: string; code: string; }
export interface RenumberDiff {
  folders: FolderDiff[];
  diagrams: DiagramDiff[];
  counters: { folders: number; diagrams: number; elements: number };
}

/** Element types that count as "activities" (numbered). Structural containers,
 *  annotations, events, gateways, connectors' labels etc. are not numbered. */
export const NUMBERABLE_TYPES = new Set<string>([
  "task", "subprocess", "subprocess-expanded", "subprocess-collapsed",
  "process", "flowchart-process", "predefined-process", "process-system",
  "use-case", "process-group", "chevron", "chevron-collapsed",
  "state", "composite-state",
]);

/** Is this element an APQC activity (carries a PCF reference)? */
export function isApqcElement(el: DiagramElement): boolean {
  const p = el.properties as Record<string, unknown> | undefined;
  return !!p && (p.pcfHierarchyId != null || p.pcfId != null);
}

/** Deterministic reading order: top-to-bottom in y-bands (~½ avg height), then
 *  left-to-right by x. Stable and diagram-type agnostic. */
function spatialOrder(els: DiagramElement[]): DiagramElement[] {
  const avgH = els.length ? els.reduce((s, e) => s + (e.height || 40), 0) / els.length : 40;
  const band = Math.max(8, avgH / 2);
  return [...els].sort((a, b) => {
    const dy = (a.y || 0) - (b.y || 0);
    if (Math.abs(dy) > band) return dy;
    return (a.x || 0) - (b.x || 0);
  });
}

function numberableElements(data: DiagramData): DiagramElement[] {
  return (data.elements ?? []).filter((e) => NUMBERABLE_TYPES.has(e.type));
}

/** The existing code shown against an element (for the preview's "old" column). */
function oldCodeOf(el: DiagramElement): string {
  const p = el.properties as Record<string, unknown> | undefined;
  if (p?.nameCode && typeof p.nameCode === "string") return p.nameCode;
  if (p?.pcfHierarchyId != null) return String(p.pcfHierarchyId);
  const firstLine = (el.label ?? "").split("\n")[0];
  return stripLeadingCode(firstLine) === firstLine ? "" : firstLine.trim();
}

function baseNameOfLabel(el: DiagramElement): string {
  const p = el.properties as Record<string, unknown> | undefined;
  const known = (typeof p?.nameCode === "string" ? p.nameCode : undefined) ??
    (p?.pcfHierarchyId != null ? String(p.pcfHierarchyId) : undefined);
  // Labels may be "CODE\nName" (new) or "CODE Name" (legacy inline) or "Name".
  const raw = el.label ?? "";
  const nl = raw.indexOf("\n");
  if (known && nl >= 0 && raw.slice(0, nl).trim() === known) return raw.slice(nl + 1).trim();
  return stripLeadingCode(nl >= 0 ? raw.slice(nl + 1) || raw : raw, known);
}

/** Build an element diff, or null if the element has no descriptive text. */
function elementDiff(el: DiagramElement, newCode: string): ElementDiff | null {
  const base = baseNameOfLabel(el);
  if (!base) return null;
  const newLabel = `${newCode}\n${base}`;
  return { id: el.id, oldLabel: el.label ?? "", oldCode: oldCodeOf(el), newCode, newLabel, isApqc: isApqcElement(el) };
}

// ── Full mode (Option 2) ─────────────────────────────────────────────
function renumberFull(config: NumberingConfig, tree: FolderTree, diagrams: DiagramInput[]): RenumberDiff {
  const prefix = config.prefix;
  const byId = new Map(diagrams.map((d) => [d.id, d]));
  const folderById = new Map(tree.folders.map((f) => [f.id, f]));
  const folders: FolderDiff[] = [];
  const diagramDiffs: DiagramDiff[] = [];

  const childFolders = (parentId: string): FolderNode[] => {
    const kids = tree.folders.filter((f) => (f.parentId ?? ROOT_ID) === parentId);
    const order = tree.folderOrder?.[parentId];
    if (order) {
      const inOrder = order.map((id) => folderById.get(id)).filter((f): f is FolderNode => !!f);
      const rest = kids.filter((k) => !order.includes(k.id)).sort((a, b) => a.name.localeCompare(b.name));
      return [...inOrder, ...rest];
    }
    return kids.sort((a, b) => a.name.localeCompare(b.name));
  };
  const folderDiagrams = (folderId: string): DiagramInput[] => {
    const ids = Object.entries(tree.diagramFolderMap).filter(([, fid]) => fid === folderId).map(([did]) => did);
    const order = tree.diagramOrder?.[folderId];
    const dias = ids.map((id) => byId.get(id)).filter((d): d is DiagramInput => !!d);
    if (order) {
      const inOrder = order.map((id) => byId.get(id)).filter((d): d is DiagramInput => !!d && dias.includes(d));
      const rest = dias.filter((d) => !order.includes(d.id)).sort((a, b) => a.name.localeCompare(b.name));
      return [...inOrder, ...rest];
    }
    return dias.sort((a, b) => a.name.localeCompare(b.name));
  };

  const numberDiagram = (d: DiagramInput, code: string) => {
    const base = stripLeadingCode(d.name);
    const newName = base ? `${code} ${base}` : code;
    const acts = spatialOrder(numberableElements(d.data));
    const aw = widthFor(acts.length);
    const els: ElementDiff[] = [];
    acts.forEach((el, j) => {
      const diff = elementDiff(el, `${code}.${pad(j + 1, aw)}`);
      if (diff) els.push(diff);
    });
    diagramDiffs.push({ id: d.id, oldName: d.name, newName, code, elements: els });
  };

  const walk = (folderId: string, parentCode: string, topLevel: boolean) => {
    const subs = childFolders(folderId);
    const dias = folderDiagrams(folderId);
    const w = widthFor(subs.length + dias.length);
    let idx = 0;
    for (const sf of subs) {
      idx++;
      const seg = pad(idx, w);
      const code = topLevel ? parentCode + seg : `${parentCode}.${seg}`;
      folders.push({ id: sf.id, oldName: sf.name, newName: `${code} ${stripLeadingCode(sf.name)}`.trim(), code });
      walk(sf.id, code, false);
    }
    for (const d of dias) {
      idx++;
      const seg = pad(idx, w);
      const code = topLevel ? parentCode + seg : `${parentCode}.${seg}`;
      numberDiagram(d, code);
    }
  };

  walk(ROOT_ID, prefix, true);
  return finalize(folders, diagramDiffs);
}

// ── APQC mode (Option 1) ─────────────────────────────────────────────
function renumberApqc(_config: NumberingConfig, diagrams: DiagramInput[]): RenumberDiff {
  const diagramDiffs: DiagramDiff[] = [];
  for (const d of diagrams) {
    const base = d.data.pcf?.hierarchyId ?? d.data.nameCode ?? folderCode(d.name);
    if (!base) continue; // non-APQC diagram → leave untouched in APQC mode
    const all = numberableElements(d.data);
    const apqc = all.filter(isApqcElement).sort((a, b) =>
      dottedCompare(String((a.properties as Record<string, unknown>).pcfHierarchyId ?? ""),
        String((b.properties as Record<string, unknown>).pcfHierarchyId ?? "")));
    const nonApqc = spatialOrder(all.filter((e) => !isApqcElement(e)));
    const ordered = [...apqc, ...nonApqc];
    const els: ElementDiff[] = [];
    let k = 0;
    for (const el of ordered) {
      k++;
      const diff = elementDiff(el, `${base}.${k}`); // BARE number, no zero-pad
      if (diff) els.push(diff);
    }
    // Diagram name is retained (APQC structure preserved) — code unchanged.
    diagramDiffs.push({ id: d.id, oldName: d.name, newName: d.name, code: base, elements: els });
  }
  return finalize([], diagramDiffs);
}

/** Keep only genuine changes; compute counters. */
function finalize(folders: FolderDiff[], diagrams: DiagramDiff[]): RenumberDiff {
  const changedFolders = folders.filter((f) => f.newName !== f.oldName);
  const changedDiagrams = diagrams
    .map((d) => ({ ...d, elements: d.elements.filter((e) => e.newLabel !== e.oldLabel) }))
    .filter((d) => d.newName !== d.oldName || d.elements.length > 0);
  const elementCount = changedDiagrams.reduce((s, d) => s + d.elements.length, 0);
  return {
    folders: changedFolders,
    diagrams: changedDiagrams,
    counters: { folders: changedFolders.length, diagrams: changedDiagrams.length, elements: elementCount },
  };
}

/** Compute the full old→new diff for a project. */
export function computeRenumber(config: NumberingConfig, tree: FolderTree, diagrams: DiagramInput[]): RenumberDiff {
  return config.mode === "apqc" ? renumberApqc(config, diagrams) : renumberFull(config, tree, diagrams);
}
