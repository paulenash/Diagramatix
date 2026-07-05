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
  objects: string[];          // related object ids
  attrs: Record<string, string>;
}
interface NormLog {
  events: NormEvent[];
  objectType: Record<string, string>;   // object id → type
}

/** Normalise either OCEL dialect into a common shape. */
function normalise(doc: any): NormLog {
  const objectType: Record<string, string> = {};
  const events: NormEvent[] = [];

  if (Array.isArray(doc?.events) || Array.isArray(doc?.objects)) {
    // OCEL 2.0
    for (const o of doc.objects ?? []) if (o?.id) objectType[String(o.id)] = String(o.type ?? "object");
    for (const e of doc.events ?? []) {
      const rels = (e?.relationships ?? []).map((r: any) => String(r.objectId ?? r.object ?? "")).filter(Boolean);
      const attrs: Record<string, string> = {};
      for (const a of e?.attributes ?? []) if (a?.name != null) attrs[String(a.name)] = String(a.value ?? "");
      events.push({ id: String(e.id ?? ""), activity: String(e.type ?? e.activity ?? ""), time: String(e.time ?? e.timestamp ?? ""), objects: rels, attrs });
    }
  } else if (doc?.["ocel:events"]) {
    // OCEL 1.0
    const objs = doc["ocel:objects"] ?? {};
    for (const [id, o] of Object.entries<any>(objs)) objectType[id] = String(o?.["ocel:type"] ?? "object");
    for (const [id, e] of Object.entries<any>(doc["ocel:events"])) {
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries<any>(e?.["ocel:vmap"] ?? {})) attrs[k] = String(v ?? "");
      events.push({ id, activity: String(e?.["ocel:activity"] ?? ""), time: String(e?.["ocel:timestamp"] ?? ""), objects: (e?.["ocel:omap"] ?? []).map(String), attrs });
    }
  }
  return { events, objectType };
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
