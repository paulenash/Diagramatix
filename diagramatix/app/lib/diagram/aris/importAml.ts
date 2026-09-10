/**
 * ARIS Markup Language (AML) → a neutral EpcModel → the EPC plan shape.
 *
 * The commercial point of the whole EPC programme: a prospect with an ARIS
 * repository has hundreds of these and no way to bring them anywhere.
 *
 * ============================ WHAT IS ASSUMED ============================
 * AML's schema is large and version-dependent, and this importer was written
 * against a HAND-BUILT sample while a real ARIS export was being obtained. So
 * it is built to be wrong about the details without being wrong about the
 * process:
 *
 *  - It keys off OBJECT TYPE CODES (`TypeNum`), which are the stable part of
 *    AML, not off element nesting or document order.
 *  - It classifies a connection primarily by THE TYPES AT ITS TWO ENDS, and
 *    only secondarily by the `CxnDef.Type` code. An org unit joined to a
 *    function is an assignment whether the export calls it `CT_EXEC_1`,
 *    `CT_EXEC_2` or something this file has never heard of. That one decision
 *    is what should let a real export through unmodified.
 *  - Attribute lookup is case-insensitive and tolerates `.ID` / `.Id` / `.id`.
 *  - Anything it does not recognise is REPORTED, never dropped in silence. A
 *    real repository is full of KPIs, risks, products and knowledge
 *    categories, and a migration that quietly discards half your model is
 *    worse than one that tells you what it left behind.
 *
 * When the real export arrives, diff it against `public/ARIS Order to Cash
 * eEPC.aml`. Where they differ, the real file is right.
 * =========================================================================
 */

import { findChildren, getAttr, type ParsedTag } from "../xmlScan";
import type { AiEpcPlan, AiEpcElement, AiEpcConnection } from "../layoutEpc";

/** A neutral, format-free EPC. The seam: AML, EPML and anything else land here. */
export interface EpcModel {
  /** Model id as the source file records it. */
  id: string;
  /** Model name as drawn (AT_NAME on the Model). */
  name: string;
  /** Source id, kept so a re-import can be matched up. */
  sourceId: string;
  objects: EpcObject[];
  relations: EpcRelation[];
}

export type EpcObjectKind =
  | "event" | "function" | "xor" | "and" | "or"
  | "org-unit" | "position" | "data" | "application" | "interface";

export interface EpcObject {
  id: string;
  kind: EpcObjectKind;
  name: string;
  /** Drawn position, when the model records one. Not used by the layout — the
   *  vertical layout re-flows — but kept so an "as drawn" import can be added
   *  later without re-reading the file. */
  x?: number;
  y?: number;
}

export interface EpcRelation {
  from: string;
  to: string;
  kind: "control" | "assignment" | "information";
  /** The raw AML code, kept for the report and for diffing a real export. */
  raw?: string;
}

export interface AmlImportReport {
  /** Every eEPC model found, in document order. */
  models: Array<{ id: string; name: string; objectCount: number }>;
  /** Objects whose type code this importer does not model, with their counts. */
  unknownObjectTypes: Array<{ type: string; count: number; examples: string[] }>;
  /** Connections between two things it does understand, but whose code it does not. */
  unknownConnectionTypes: Array<{ type: string; count: number }>;
  /** Connections it could not place at all (an endpoint that resolves to nothing). */
  dropped: string[];
  /** Non-eEPC models skipped — organisational charts, data models, and so on. */
  skippedModels: Array<{ id: string; name: string; type: string }>;
}

export interface AmlImportResult {
  models: EpcModel[];
  report: AmlImportReport;
}

/**
 * Object type codes. The value is the EPC symbol; several codes map to the same
 * symbol because ARIS distinguishes things an EPC draws identically.
 */
const OBJECT_TYPES: Record<string, EpcObjectKind> = {
  OT_EVT: "event",
  OT_FUNC: "function",
  OT_PROCESS_IF: "interface",
  OT_ORG_UNIT: "org-unit",
  OT_ORG_UNIT_TYPE: "org-unit",
  OT_PERS_TYPE: "position",
  OT_POS: "position",
  OT_PERS: "position",
  // Information carriers. ARIS has several and an eEPC draws them the same.
  OT_CLST: "data",
  OT_ENT_TYPE: "data",
  OT_INFO_CARR: "data",
  OT_TECH_TRM: "data",
  OT_DOC: "data",
  OT_APPL_SYS_TYPE: "application",
  OT_APPL_SYS: "application",
  OT_APPL_SYS_CLS: "application",
  // OT_RULE resolves by SymbolNum below — the type says "connector", the
  // symbol says which one.
};

/** Which connector a rule is depends on its SYMBOL, not its type. */
function ruleKind(symbol: string): EpcObjectKind {
  const s = symbol.toUpperCase();
  if (s.includes("XOR")) return "xor";
  if (s.includes("AND")) return "and";
  if (s.includes("OR")) return "or";
  // An unqualified rule is drawn as an AND in most ARIS method sets, and AND is
  // the safe guess: it is the only connector that makes no claim about choice.
  return "and";
}

/** Connection codes this importer recognises. Endpoint types decide first. */
const CONTROL_CODES = new Set(["CT_IS_PRED_OF", "CT_IS_SUCC_OF", "CT_LNK_2"]);
const ASSIGNMENT_CODES = new Set(["CT_EXEC_1", "CT_EXEC_2", "CT_EXEC_3", "CT_IS_RESP_FOR", "CT_CARRIES_OUT", "CT_CONTR_1", "CT_DECIDES_ON"]);
const INFORMATION_CODES = new Set(["CT_USE_1", "CT_USE_2", "CT_CRT_1", "CT_CRT_2", "CT_PROVDS_INPT_FOR", "CT_CAN_SUPP_1", "CT_SUPP_1", "CT_IS_INP_FOR", "CT_HAS_OUT"]);

const ORG_KINDS = new Set<EpcObjectKind>(["org-unit", "position"]);
const DATA_KINDS = new Set<EpcObjectKind>(["data", "application"]);
const FLOW_KINDS = new Set<EpcObjectKind>(["event", "function", "xor", "and", "or", "interface"]);

/** Case-insensitive, punctuation-tolerant attribute read. */
function attr(openTag: string, ...names: string[]): string | undefined {
  for (const n of names) {
    const direct = getAttr(openTag, n);
    if (direct !== undefined) return direct;
  }
  // Fall back to a scan: a real export may differ in casing.
  const wanted = names.map((n) => n.toLowerCase().replace(/[._-]/g, ""));
  const re = /\s([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(openTag)) !== null) {
    if (wanted.includes(m[1].toLowerCase().replace(/[._-]/g, ""))) return m[2] ?? m[3] ?? "";
  }
  return undefined;
}

/** The AT_NAME attribute value, in whichever locale the file offers first. */
function readName(body: string): string {
  for (const a of findChildren(body, ["AttrDef"])) {
    const type = attr(a.openTag, "AttrDef.Type", "AttrDefType") ?? "";
    if (type.toUpperCase() !== "AT_NAME") continue;
    const values = findChildren(a.body, ["AttrValue"]);
    for (const v of values) {
      // AttrValue may itself wrap the text in inline formatting elements.
      const text = v.body.replace(/<[^>]*>/g, "").trim();
      if (text) return text;
    }
  }
  return "";
}

/**
 * Every element with the given local name, at ANY depth.
 *
 * The containers are named rather than walking everything, because "everything"
 * would descend into an ObjDef body looking for more ObjDefs. A real export
 * nests Groups several folders deep and may wrap the lot differently again,
 * which is why the list is generous and the search is not depth-limited.
 */
const CONTAINERS = ["AML", "Group", "Model.Group", "Database", "Filter"];
function findDeep(xml: string, name: string): ParsedTag[] {
  const out: ParsedTag[] = [];
  const seen = new Set<string>();
  const walk = (body: string, depth: number) => {
    if (depth > 32) return; // a malformed file must not take the process down
    for (const t of findChildren(body, [name, ...CONTAINERS])) {
      if (t.local === name) {
        // The same element can be reached twice if a container name ever
        // collides with the target; keep the first.
        const key = t.start + ":" + t.end + ":" + t.openTag.length;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
        continue;
      }
      walk(t.body, depth + 1);
    }
  };
  walk(xml, 0);
  return out;
}

export function importAml(xml: string): AmlImportResult {
  const report: AmlImportReport = {
    models: [], unknownObjectTypes: [], unknownConnectionTypes: [], dropped: [], skippedModels: [],
  };

  // ── 1. Object definitions ────────────────────────────────────────────────
  // ObjDefs may sit at any Group depth; the model below references them by id,
  // so the tree they live in does not matter.
  const objects = new Map<string, EpcObject>();
  const unknownTypes = new Map<string, string[]>();
  const relations: EpcRelation[] = [];
  const rawRelations: Array<{ from: string; to: string; code: string }> = [];

  for (const od of findDeep(xml, "ObjDef")) {
    const id = attr(od.openTag, "ObjDef.ID", "ObjDef.Id", "ID");
    if (!id) continue;
    const typeNum = (attr(od.openTag, "TypeNum", "ObjDef.TypeNum") ?? "").toUpperCase();
    const symbol = attr(od.openTag, "SymbolNum", "ObjDef.SymbolNum") ?? "";
    const name = readName(od.body);

    const kind: EpcObjectKind | undefined =
      typeNum === "OT_RULE" ? ruleKind(symbol) : OBJECT_TYPES[typeNum];

    if (!kind) {
      const list = unknownTypes.get(typeNum) ?? unknownTypes.set(typeNum, []).get(typeNum)!;
      if (list.length < 5 && name) list.push(name);
      // Its connections are recorded anyway, so the drop report can name them.
    } else {
      objects.set(id, { id, kind, name });
    }

    for (const cx of findChildren(od.body, ["CxnDef"])) {
      const to = attr(cx.openTag, "ToObjDef.IdRef", "ToObjDef.Id", "ToObjDefIdRef");
      if (!to) continue;
      rawRelations.push({ from: id, to, code: (attr(cx.openTag, "CxnDef.Type", "CxnDefType") ?? "").toUpperCase() });
    }
  }

  for (const [type, examples] of unknownTypes) {
    const count = examples.length;
    report.unknownObjectTypes.push({
      type: type || "(no type)",
      count,
      examples,
    });
  }

  // ── 2. Classify the relations ────────────────────────────────────────────
  // THE ENDPOINTS DECIDE. An org unit joined to a function is an assignment
  // whatever the export calls the connection, and that is what should let a
  // real ARIS file through when its codes differ from this list.
  const unknownCodes = new Map<string, number>();
  for (const r of rawRelations) {
    const a = objects.get(r.from), b = objects.get(r.to);
    if (!a || !b) {
      report.dropped.push(
        `${r.code || "connection"} ${r.from} → ${r.to}: ${!a ? r.from : r.to} is not an object this importer models`,
      );
      continue;
    }
    let kind: EpcRelation["kind"] | undefined;
    if (ORG_KINDS.has(a.kind) || ORG_KINDS.has(b.kind)) kind = "assignment";
    else if (DATA_KINDS.has(a.kind) || DATA_KINDS.has(b.kind)) kind = "information";
    else if (FLOW_KINDS.has(a.kind) && FLOW_KINDS.has(b.kind)) kind = "control";

    if (!kind) { report.dropped.push(`${r.code} ${a.name} → ${b.name}: no arc kind fits these two`); continue; }

    // The code is only a cross-check. Record a disagreement rather than obeying
    // it — the endpoints are the stronger signal, and a code we have never seen
    // is the expected case, not an error.
    const known = CONTROL_CODES.has(r.code) || ASSIGNMENT_CODES.has(r.code) || INFORMATION_CODES.has(r.code);
    if (r.code && !known) unknownCodes.set(r.code, (unknownCodes.get(r.code) ?? 0) + 1);

    relations.push({ from: r.from, to: r.to, kind, raw: r.code });
  }
  for (const [type, count] of unknownCodes) report.unknownConnectionTypes.push({ type, count });

  // ── 3. Models ────────────────────────────────────────────────────────────
  // A model is a drawn page: which objects appear on it, and where. Only eEPCs
  // are imported; an organisational chart or data model in the same export is
  // named and skipped rather than mangled into a process.
  const models: EpcModel[] = [];
  for (const md of findDeep(xml, "Model")) {
    const id = attr(md.openTag, "Model.ID", "Model.Id", "ID") ?? `model-${models.length + 1}`;
    const type = (attr(md.openTag, "Model.Type", "ModelType", "TypeNum") ?? "").toUpperCase();
    const name = readName(md.body) || "Imported EPC";

    // Accept anything that calls itself an EPC; ARIS has several EPC variants
    // (MT_EEPC, MT_EEPC_COLUMN, MT_EEPC_ROW, MT_EEPC_MAT...).
    if (type && !type.includes("EPC")) {
      report.skippedModels.push({ id, name, type });
      continue;
    }

    const present = new Map<string, EpcObject>();
    for (const occ of findChildren(md.body, ["ObjOcc"])) {
      const ref = attr(occ.openTag, "ObjDef.IdRef", "ObjDefIdRef", "ObjDef.Id");
      if (!ref) continue;
      const base = objects.get(ref);
      if (!base) continue;  // an unknown type; already reported
      if (present.has(ref)) continue;
      const pos = findChildren(occ.body, ["Position"])[0];
      present.set(ref, {
        ...base,
        x: pos ? Number(attr(pos.openTag, "Pos.X", "PosX", "x") ?? NaN) : undefined,
        y: pos ? Number(attr(pos.openTag, "Pos.Y", "PosY", "y") ?? NaN) : undefined,
      });
    }
    if (present.size === 0) continue;

    const ids = new Set(present.keys());
    models.push({
      id, name, sourceId: id,
      objects: [...present.values()],
      relations: relations.filter((r) => ids.has(r.from) && ids.has(r.to)),
    });
    report.models.push({ id, name, objectCount: present.size });
  }

  return { models, report };
}

/**
 * An EpcModel → the plan shape `layoutEpcDiagram` already takes.
 *
 * Deliberately the SAME shape the AI path produces, so an imported model gets
 * the identical vertical layout, the identical satellite placement and the
 * identical rule diagnostics. An importer with its own layout would be a second
 * thing to keep right.
 */
export function epcModelToPlan(model: EpcModel): AiEpcPlan {
  const byId = new Map(model.objects.map((o) => [o.id, o]));
  const kindToType: Record<EpcObjectKind, string> = {
    event: "event", function: "function",
    xor: "xor", and: "and", or: "or",
    "org-unit": "org-unit", position: "position",
    data: "information object", application: "application system",
    interface: "process interface",
  };

  // Assignments become ATTRIBUTES on the function, which is what the plan
  // format wants — and it is not merely a convenience: expressed that way an
  // assignment CANNOT hang off an event, and a function cannot end up with two
  // responsible parties, because there is nowhere to say either.
  const elements: AiEpcElement[] = [];
  const orgOf = new Map<string, string>();
  const dataOf = new Map<string, string[]>();
  const systemOf = new Map<string, string[]>();

  for (const r of model.relations) {
    if (r.kind === "control") continue;
    const a = byId.get(r.from), b = byId.get(r.to);
    if (!a || !b) continue;
    const [side, fn] = a.kind === "function" ? [b, a] : [a, b];
    if (fn.kind !== "function") continue;
    if (ORG_KINDS.has(side.kind)) {
      // First wins. E7 says one responsible party, and the second is reported
      // by the conversion rather than silently made into a lane.
      if (!orgOf.has(fn.id)) orgOf.set(fn.id, side.name);
    } else if (side.kind === "application") {
      (systemOf.get(fn.id) ?? systemOf.set(fn.id, []).get(fn.id)!).push(side.name);
    } else if (side.kind === "data") {
      (dataOf.get(fn.id) ?? dataOf.set(fn.id, []).get(fn.id)!).push(side.name);
    }
  }

  const satelliteKinds = new Set<EpcObjectKind>(["org-unit", "position", "data", "application"]);
  for (const o of model.objects) {
    if (satelliteKinds.has(o.kind)) continue; // carried as attributes above
    const el: AiEpcElement = { id: o.id, type: kindToType[o.kind], label: o.name };
    if (o.kind === "function") {
      const org = orgOf.get(o.id);
      if (org) el.org = org;
      const data = dataOf.get(o.id);
      if (data?.length) el.data = data;
      const sys = systemOf.get(o.id);
      if (sys?.length) el.system = sys;
    }
    elements.push(el);
  }

  const present = new Set(elements.map((e) => e.id));
  const connections: AiEpcConnection[] = model.relations
    .filter((r) => r.kind === "control" && present.has(r.from) && present.has(r.to))
    .map((r) => ({ sourceId: r.from, targetId: r.to }));

  return { elements, connections };
}
