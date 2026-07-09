/**
 * OCEL (Object-Centric Event Log) interchange. Import projects an OCEL log onto a
 * single chosen object type (that object becomes the process "case"), flattening
 * to the tool's normalised { headers, rows, mapping } table — an honest
 * single-object projection of a multi-object log, not full OCEL analytics. Export
 * emits a single-object OCEL 2.0 JSON from a run's variants (variant-level).
 *
 * Supports OCEL 2.0 JSON (objectTypes/eventTypes/events/objects with
 * relationships) and legacy OCEL 1.0 JSON (ocel:events / ocel:objects). Pure.
 */
import type { LogMapping, Variant, MiningStats } from "../types";
import type { ParsedLog } from "./xes";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NormEvent {
  id: string;
  activity: string;
  time: string;
  objects: string[];          // related object ids (E2O)
  attrs: Record<string, string>;
}
/** A time-stamped object attribute value (OCEL 2.0 objects carry time-varying
 *  attributes; `time` is absent for OCEL 1.0 static attributes). */
interface ObjAttr { name: string; time?: string; value: string }
interface NormObject {
  id: string;
  type: string;
  attributes: ObjAttr[];
  relationships: { objectId: string; qualifier: string }[];  // O2O (OCEL 2.0)
}
interface NormLog {
  events: NormEvent[];
  objectType: Record<string, string>;   // object id → type
  objects: Record<string, NormObject>;  // object id → full object (2.0: attrs + O2O)
  objectTypeNames: string[];            // declared objectTypes[].name ∪ observed
}

/** Normalise either OCEL dialect into a common shape. OCEL 2.0-compliant: reads
 *  event `attributes`/`relationships` (E2O) AND object `attributes`
 *  (time-varying) + `relationships` (O2O). */
function normalise(doc: any): NormLog {
  const objectType: Record<string, string> = {};
  const objects: Record<string, NormObject> = {};
  const events: NormEvent[] = [];
  const declaredTypes = new Set<string>();

  if (Array.isArray(doc?.events) || Array.isArray(doc?.objects)) {
    // OCEL 2.0
    for (const t of doc.objectTypes ?? []) if (t?.name != null) declaredTypes.add(String(t.name));
    for (const o of doc.objects ?? []) {
      if (o?.id == null) continue;
      const id = String(o.id), type = String(o.type ?? "object");
      objectType[id] = type;
      const attributes: ObjAttr[] = (o.attributes ?? [])
        .filter((a: any) => a?.name != null)
        .map((a: any) => ({ name: String(a.name), time: a.time != null ? String(a.time) : undefined, value: String(a.value ?? "") }));
      const relationships = (o.relationships ?? [])
        .map((r: any) => ({ objectId: String(r.objectId ?? r.object ?? ""), qualifier: String(r.qualifier ?? "") }))
        .filter((r: any) => r.objectId);
      objects[id] = { id, type, attributes, relationships };
    }
    for (const e of doc.events ?? []) {
      const rels = (e?.relationships ?? []).map((r: any) => String(r.objectId ?? r.object ?? "")).filter(Boolean);
      const attrs: Record<string, string> = {};
      for (const a of e?.attributes ?? []) if (a?.name != null) attrs[String(a.name)] = String(a.value ?? "");
      events.push({ id: String(e.id ?? ""), activity: String(e.type ?? e.activity ?? ""), time: String(e.time ?? e.timestamp ?? ""), objects: rels, attrs });
    }
  } else if (doc?.["ocel:events"]) {
    // OCEL 1.0 (static object attributes via ovmap; no O2O)
    const objs = doc["ocel:objects"] ?? {};
    for (const [id, o] of Object.entries<any>(objs)) {
      const type = String(o?.["ocel:type"] ?? "object");
      objectType[id] = type;
      const attributes: ObjAttr[] = Object.entries<any>(o?.["ocel:ovmap"] ?? {}).map(([name, value]) => ({ name, value: String(value ?? "") }));
      objects[id] = { id, type, attributes, relationships: [] };
    }
    for (const [id, e] of Object.entries<any>(doc["ocel:events"])) {
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries<any>(e?.["ocel:vmap"] ?? {})) attrs[k] = String(v ?? "");
      events.push({ id, activity: String(e?.["ocel:activity"] ?? ""), time: String(e?.["ocel:timestamp"] ?? ""), objects: (e?.["ocel:omap"] ?? []).map(String), attrs });
    }
  }
  for (const t of Object.values(objectType)) declaredTypes.add(t);
  return { events, objectType, objects, objectTypeNames: [...declaredTypes] };
}

/** The object types present, most-referenced first (the case-type picker menu). */
export function ocelObjectTypes(text: string): string[] {
  let doc: any; try { doc = JSON.parse(text); } catch { return []; }
  const log = normalise(doc);
  const count = new Map<string, number>();
  for (const e of log.events) for (const oid of e.objects) { const t = log.objectType[oid]; if (t) count.set(t, (count.get(t) ?? 0) + 1); }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Parse OCEL JSON → a normalised table, using `objectType` as the case (defaults
 *  to the most-referenced type). One row per (event, related object of that type). */
export function parseOcel(text: string, objectType?: string): ParsedLog & { objectTypes: string[]; chosenType: string } {
  let doc: any; try { doc = JSON.parse(text); } catch { return { headers: [], rows: [], mapping: {}, objectTypes: [], chosenType: "" }; }
  const log = normalise(doc);
  const objectTypes = ocelObjectTypes(text);
  const chosen = objectType || objectTypes[0] || "";

  const extraKeys: string[] = [];
  const seen = new Set<string>();
  const FIXED = ["case", "activity", "timestamp", "resource"] as const;
  const records: Record<string, string>[] = [];
  for (const e of log.events) {
    const caseObjs = e.objects.filter((oid) => log.objectType[oid] === chosen);
    for (const oid of caseObjs) {
      const rec: Record<string, string> = {
        case: oid,
        activity: e.activity,
        timestamp: e.time,
        resource: e.attrs["resource"] ?? e.attrs["org:resource"] ?? e.attrs["Resource"] ?? "",
      };
      for (const [k, v] of Object.entries(e.attrs)) {
        if (/^(resource|org:resource)$/i.test(k)) continue;
        const col = k.replace(/^[^:]*:/, "");
        rec[col] = v;
        if (!seen.has(col)) { seen.add(col); extraKeys.push(col); }
      }
      records.push(rec);
    }
  }

  const headers = [...FIXED, ...extraKeys];
  const rows = records.map((r) => headers.map((h) => r[h] ?? ""));
  const has = (h: string) => rows.some((r) => r[headers.indexOf(h)]?.trim());
  const findExtra = (re: RegExp) => extraKeys.find((k) => re.test(k.toLowerCase()));
  const mapping: Partial<LogMapping> = { caseId: "case", activity: "activity", timestamp: "timestamp" };
  if (has("resource")) mapping.resource = "resource";
  const ctl = findExtra(/control|rcm/), rsk = findExtra(/risk/), pol = findExtra(/policy/);
  if (ctl) mapping.controlId = ctl;
  if (rsk) mapping.riskId = rsk;
  if (pol) mapping.policyId = pol;
  return { headers, rows, mapping, objectTypes, chosenType: chosen };
}

// ── object-centric (OCEL 2.0) ───────────────────────────────────────────────

/** The value of object attribute `name` effective at ISO time `at` — the last
 *  time-stamped change ≤ `at` (OCEL 2.0 objects carry time-varying attributes),
 *  or the sole static value for OCEL 1.0. "" when the object never had it. */
function attrValueAt(obj: NormObject, name: string, at: string): string {
  const changes = obj.attributes.filter((a) => a.name === name);
  if (changes.length === 0) return "";
  const timed = changes.filter((a) => a.time != null).sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
  if (timed.length === 0) return changes[0].value;   // static (1.0) attribute
  const t = Date.parse(at);
  if (Number.isNaN(t)) return timed[timed.length - 1].value;
  let val = timed[0].value;
  for (const c of timed) { if (Date.parse(c.time!) <= t) val = c.value; else break; }
  return val;
}

export interface OcelTypeProjection {
  headers: string[];
  rows: string[][];
  mapping: Partial<LogMapping>;
  stateAttr?: string;   // the object status attribute used to derive `state`, if any
  cases: number;        // distinct objects of this type that carry events
}
export interface OcelO2O { fromType: string; toType: string; qualifier: string; count: number }
export interface OcelObjectCentric {
  objectTypes: string[];                        // most-referenced first, then event-less declared types
  perType: Record<string, OcelTypeProjection>;  // one normalised table per object type
  o2o: OcelO2O[];                               // object-to-object relationships, aggregated by type pair + qualifier
}

const STATUS_RE = /^(state|status|stage|phase)$/i;

/** OCEL 2.0-compliant object-centric parse: instead of flattening onto a single
 *  object type, project EVERY object type to its own normalised { headers, rows,
 *  mapping } table (the input the state-machine pipeline consumes), deriving each
 *  object's `state` from a status attribute when present (else left for the
 *  activity→state table). Also returns the object-to-object relationship edges so
 *  the object model can be drawn as a Domain Diagram. Pure. */
export function parseOcelObjectCentric(text: string): OcelObjectCentric {
  let doc: any; try { doc = JSON.parse(text); } catch { return { objectTypes: [], perType: {}, o2o: [] }; }
  const log = normalise(doc);
  const byFreq = ocelObjectTypes(text);
  const objectTypes = [...byFreq, ...log.objectTypeNames.filter((t) => !byFreq.includes(t))];

  const perType: Record<string, OcelTypeProjection> = {};
  for (const type of objectTypes) {
    // A status/state attribute on this type's objects → the proper lifecycle source.
    let stateAttr: string | undefined;
    for (const o of Object.values(log.objects)) {
      if (o.type !== type) continue;
      const hit = o.attributes.find((a) => STATUS_RE.test(a.name));
      if (hit) { stateAttr = hit.name; break; }
    }

    const extraKeys: string[] = [];
    const seen = new Set<string>();
    const caseSet = new Set<string>();
    const records: Record<string, string>[] = [];
    for (const e of log.events) {
      for (const oid of e.objects) {
        if (log.objectType[oid] !== type) continue;
        caseSet.add(oid);
        const rec: Record<string, string> = {
          case: oid, activity: e.activity, timestamp: e.time,
          resource: e.attrs["resource"] ?? e.attrs["org:resource"] ?? e.attrs["Resource"] ?? "",
        };
        if (stateAttr) rec.state = attrValueAt(log.objects[oid], stateAttr, e.time);
        for (const [k, v] of Object.entries(e.attrs)) {
          if (/^(resource|org:resource)$/i.test(k)) continue;
          const col = k.replace(/^[^:]*:/, "");
          if (col === "state" && stateAttr) continue;   // status-derived state wins
          rec[col] = v;
          if (!seen.has(col)) { seen.add(col); extraKeys.push(col); }
        }
        records.push(rec);
      }
    }

    const FIXED = ["case", "activity", "timestamp", "resource"] as const;
    const headers = [...FIXED, ...(stateAttr ? ["state"] : []), ...extraKeys];
    const rows = records.map((r) => headers.map((h) => r[h] ?? ""));
    const has = (h: string) => rows.some((r) => r[headers.indexOf(h)]?.trim());
    const findExtra = (re: RegExp) => extraKeys.find((k) => re.test(k.toLowerCase()));
    const mapping: Partial<LogMapping> = { caseId: "case", activity: "activity", timestamp: "timestamp" };
    if (has("resource")) mapping.resource = "resource";
    if (stateAttr) mapping.state = "state";
    const ctl = findExtra(/control|rcm/), rsk = findExtra(/risk/), pol = findExtra(/policy/);
    if (ctl) mapping.controlId = ctl;
    if (rsk) mapping.riskId = rsk;
    if (pol) mapping.policyId = pol;
    perType[type] = { headers, rows, mapping, ...(stateAttr ? { stateAttr } : {}), cases: caseSet.size };
  }

  // Object-to-object relationships, aggregated by (fromType, toType, qualifier).
  const SEP = String.fromCharCode(1);
  const o2oMap = new Map<string, OcelO2O>();
  for (const o of Object.values(log.objects)) {
    for (const r of o.relationships) {
      const toType = log.objectType[r.objectId];
      if (!toType) continue;
      const key = `${o.type}${SEP}${toType}${SEP}${r.qualifier}`;
      const cur = o2oMap.get(key) ?? { fromType: o.type, toType, qualifier: r.qualifier, count: 0 };
      cur.count++; o2oMap.set(key, cur);
    }
  }
  return { objectTypes, perType, o2o: [...o2oMap.values()] };
}

// ── export ────────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 3_600_000;

export interface OcelExportInput {
  name: string;
  variants: Variant[];
  stats?: MiningStats | null;
  maxCases?: number;
}

/** Serialise a run's variants to single-object OCEL 2.0 JSON: object type "Case",
 *  one object per case, events carrying a relationship to their case object. */
export function buildOcel(input: OcelExportInput): string {
  const cap = input.maxCases ?? 5000;
  const base = input.stats?.from ?? 0;
  const objects: any[] = [];
  const events: any[] = [];
  const eventTypeSet = new Set<string>();

  let caseNo = 0;
  outer: for (const v of input.variants) {
    for (let c = 0; c < v.count; c++) {
      if (caseNo >= cap) break outer;
      const caseId = `case-${caseNo + 1}`;
      objects.push({ id: caseId, type: "Case", attributes: [] });
      const start = base + caseNo * MS_PER_HOUR;
      for (let i = 0; i < v.events.length; i++) {
        const act = v.events[i] ?? "";
        const st = v.states[i] ?? "";
        eventTypeSet.add(act);
        events.push({
          id: `${caseId}-e${i + 1}`,
          type: act,
          time: new Date(start + i * 60_000).toISOString(),
          relationships: [{ objectId: caseId, qualifier: "case" }],
          attributes: st && st !== act ? [{ name: "state", value: st }] : [],
        });
      }
      caseNo++;
    }
  }

  const doc = {
    objectTypes: [{ name: "Case", attributes: [] }],
    eventTypes: [...eventTypeSet].map((name) => ({ name, attributes: [] })),
    objects,
    events,
  };
  return JSON.stringify(doc, null, 2);
}
