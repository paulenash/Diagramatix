"use client";

import { useState, useEffect, useLayoutEffect, useRef, Fragment } from "react";
import type {
  BpmnTaskType,
  FlowType,
  GatewayType,
  EventType,
  Connector,
  DiagramElement,
  DiagramType,
  DiagramTitle,
  DiagramStatus,
  DirectionType,
  ConnectorType,
  UmlAttribute,
  UmlOperation,
} from "@/app/lib/diagram/types";
import { RichTextEditor } from "./RichTextEditor";
import { SimulationSection } from "./SimulationSection";
import { RiskControlSection, type RiskCatalogItem } from "./RiskControlSection";
import { PcfClassifySection } from "./PcfClassifySection";
import type { PcfClassification } from "@/app/lib/diagram/types";
import { getCachedCatalogue, findShapeByKey, type ArchimateShapeEntry } from "@/app/lib/archimate/catalogue";

// ArchiMate relationship metadata — maps the archi-* connector type to its
// human name and ArchiMate relationship group (shown in the Properties panel).
type ArchiRelGroup = "Structural" | "Dependency" | "Other";
const ARCHI_GROUPS: ArchiRelGroup[] = ["Structural", "Dependency", "Other"];
const ARCHI_REL_META: Record<string, { type: string; group: ArchiRelGroup }> = {
  "archi-composition":    { type: "Composition",    group: "Structural" },
  "archi-aggregation":    { type: "Aggregation",    group: "Structural" },
  "archi-assignment":     { type: "Assignment",     group: "Structural" },
  "archi-realisation":    { type: "Realisation",    group: "Structural" },
  "archi-serving":        { type: "Serving",        group: "Dependency" },
  "archi-access":         { type: "Access",         group: "Dependency" },
  "archi-influence":      { type: "Influence",      group: "Dependency" },
  "archi-association":    { type: "Association",     group: "Dependency" },
  "archi-triggering":     { type: "Triggering",     group: "Other" },
  "archi-flow":           { type: "Flow",           group: "Other" },
  "archi-specialisation": { type: "Specialisation", group: "Other" },
};

interface Props {
  element: DiagramElement | null;
  connector: Connector | null;
  diagramType?: DiagramType;
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
  /** Project Risk & Control catalog items available to attach to a step. */
  riskCatalog?: RiskCatalogItem[];
  /** Create a new catalog Risk/Control from the diagram (undefined = not permitted). */
  onCreateRiskItem?: (kind: "Risk" | "Control", name: string) => Promise<RiskCatalogItem | null>;
  /** Controlled open state for the Risk & Controls section — owned by the editor
   *  so it stays open (sticky) across diagrams and drives the canvas highlight. */
  rcSectionOpen?: boolean;
  onRcSectionToggle?: (open: boolean) => void;
  /** Open the SharePoint picker to link a file to this Data Object / Store. */
  onLinkSharePointFile?: (elementId: string) => void;
  /** Open the embedded preview for an already-linked SharePoint file. */
  onPreviewSharePointFile?: (link: { driveId: string; itemId: string; name: string; webUrl?: string }) => void;
  onSetEventBoundary?: (id: string, hostId: string | null) => void;
  onDeleteElement: (id: string) => void;
  onDeleteConnector: (id: string) => void;
  onUpdateConnectorDirection: (id: string, directionType: DirectionType) => void;
  onUpdateConnectorType?: (id: string, connectorType: ConnectorType) => void;
  onReverseConnector?: (id: string) => void;
  onUpdateConnectorLabel?: (id: string, label: string) => void;
  onAddLane?: (poolId: string) => void;
  onAddSublane?: (laneId: string) => void;
  onReorderLane?: (laneId: string, direction: "up" | "down") => void;
  onUpdateConnectorFields?: (id: string, fields: Partial<Connector>) => void;
  parentName?: string;
  poolHasContent?: boolean;
  laneHasContent?: boolean;
  hasMessageBpmnConnection?: boolean;
  multiSelectionCount?: number;
  allConnectors?: Connector[];
  allElements?: DiagramElement[];
  debugMode?: boolean;
  diagramName?: string;
  diagramTitle?: DiagramTitle;
  onUpdateDiagramTitle?: (title: DiagramTitle) => void;
  createdAt?: string;
  updatedAt?: string;
  siblingDiagrams?: { id: string; name: string; type: string }[];
  currentDiagramId?: string;
  /** All parent diagrams that currently link to this diagram (set by the
   *  project-wide link scanner). Rendered as a list of clickable rows in
   *  the diagram title section. */
  parentDiagramIds?: string[];
  /** The parent diagram the user came FROM in this browser session
   *  (top of the drill stack). Used to highlight the matching row in the
   *  parents list. May be undefined if the user opened the diagram
   *  directly. */
  sessionParentId?: string;
  onNavigateToDiagram?: (diagramId: string) => void;
  onFlipForkJoin?: (id: string) => void;
  onConvertTaskSubprocess?: (id: string) => void;
  onConvertProcessCollapsed?: (id: string) => void;
  onConvertEventType?: (id: string, newEventType: "start-event" | "intermediate-event" | "end-event") => void;
  database?: string;
  onSetDatabase?: (db: string) => void;
  forceCollapseTitle?: boolean;
  /** Per-diagram process owner — surfaced in the new Process Owner
   *  sub-section. Both name + email are optional free-text. */
  processOwner?: { name?: string; email?: string };
  onSetProcessOwner?: (owner: { name?: string; email?: string }) => void;
  /** APQC PCF classification for this diagram (diagram-level). `projectId` powers
   *  the picker's framework/search fetch. */
  projectId?: string;
  pcf?: PcfClassification;
  onSetPcf?: (pcf: PcfClassification | undefined) => void;
  /** Current Diagram Owner (hard FK to a registered user). Displayed
   *  in a new sub-section directly above Process Owner. Null means the
   *  diagram has no owner-of-record set (legacy diagram or orphan). */
  diagramOwner?: { id: string; name: string | null; email: string } | null;
  /** Candidates for the Diagram Owner picker. Project owner + every
   *  registered user the project is shared with. Empty for diagrams
   *  with no project. */
  diagramOwnerCandidates?: { id: string; name: string | null; email: string }[];
  /** Whether the caller can change the Diagram Owner. True only for
   *  the project owner. When false the sub-section renders the current
   *  owner statically (no select). */
  canEditDiagramOwner?: boolean;
  /** Optional error string surfaced when a Diagram Owner save fails
   *  (e.g. server-side permission denied after an optimistic update).
   *  Rendered as a small red note under the picker. */
  diagramOwnerError?: string | null;
  /** Called when the Diagram Owner picker selection changes. Receives
   *  the chosen userId or null to clear the assignment. */
  onSetDiagramOwner?: (userId: string | null) => void;
  /** True when the signed-in user is a superuser. Reserved for any
   *  future role-gated controls inside the Diagram Properties panel
   *  (none today — the Bubble Help editor moved to
   *  /dashboard/admin/bubble-help). */
  isAdmin?: boolean;
}

// Min/max height for the task/subprocess Name textarea.
//   3 lines × ~16px line-box + ~10px vertical padding ≈ 58px (min — the
//     editor always presents 3 lines worth of space, even when empty).
//   6 lines × ~16px + ~10px ≈ 106px (max — beyond this the textarea
//     scrolls rather than continuing to grow).
const NAME_TEXTAREA_MIN_PX = 58;
const NAME_TEXTAREA_MAX_PX = 106;

const TASK_TYPE_OPTIONS: { value: BpmnTaskType; label: string }[] = [
  { value: "none",          label: "None" },
  { value: "user",          label: "User" },
  { value: "service",       label: "Service" },
  { value: "script",        label: "Script" },
  { value: "send",          label: "Send" },
  { value: "receive",       label: "Receive" },
  { value: "manual",        label: "Manual" },
  { value: "business-rule", label: "Biz Rule" },
];

const GATEWAY_TYPE_OPTIONS: { value: GatewayType; label: string }[] = [
  { value: "none",        label: "None" },
  { value: "exclusive",   label: "Exclusive ×" },
  { value: "inclusive",   label: "Inclusive ○" },
  { value: "parallel",    label: "Parallel +" },
  { value: "event-based", label: "Event-based ⬠" },
];

const FLOW_TYPE_OPTIONS: { value: FlowType; label: string }[] = [
  { value: "none",     label: "None" },
  { value: "catching", label: "Catching" },
  { value: "throwing", label: "Throwing" },
];

const TRIGGER_OPTIONS: { value: EventType; label: string }[] = [
  { value: "none",        label: "None" },
  { value: "message",     label: "Message" },
  { value: "timer",       label: "Timer" },
  { value: "error",       label: "Error" },
  { value: "signal",      label: "Signal" },
  { value: "terminate",    label: "Terminate" },
  { value: "conditional",  label: "Conditional" },
  { value: "escalation",   label: "Escalation" },
  { value: "cancel",       label: "Cancel" },
  { value: "compensation", label: "Compensation" },
  { value: "link",         label: "Link" },
];

/** Multiplicity selector: preset values + custom n..m */
function MultSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const presets = ["", "1", "0..1", "0..*", "1..*"];
  const isPreset = presets.includes(value);
  const [customMode, setCustomMode] = useState(!isPreset && value !== "");
  const [nVal, setNVal] = useState(() => {
    if (!isPreset && value.includes("..")) return value.split("..")[0];
    return "";
  });
  const [mVal, setMVal] = useState(() => {
    if (!isPreset && value.includes("..")) return value.split("..")[1];
    return "";
  });

  function commitCustom() {
    const n = nVal.trim(), m = mVal.trim();
    if (n && m) {
      onChange(`${n}..${m}`);
    }
  }

  if (customMode) {
    return (
      <div className="flex items-center gap-0.5 flex-1 min-w-0">
        <input type="text" value={nVal} onChange={e => setNVal(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={e => { if (e.key === "Enter") commitCustom(); }}
          className="w-6 text-[10px] border border-gray-300 rounded px-0.5 py-0 text-center" placeholder="n" />
        <span className="text-[10px] text-gray-400">..</span>
        <input type="text" value={mVal} onChange={e => setMVal(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={e => { if (e.key === "Enter") commitCustom(); }}
          className="w-6 text-[10px] border border-gray-300 rounded px-0.5 py-0 text-center" placeholder="m" />
        <button onClick={() => { setCustomMode(false); onChange(""); }}
          className="text-[9px] text-gray-400 hover:text-gray-600 px-0.5" title="Back to presets">{"\u2715"}</button>
      </div>
    );
  }

  return (
    <select
      value={isPreset ? value : "__custom__"}
      onChange={e => {
        const v = e.target.value;
        if (v === "__custom__") {
          setCustomMode(true);
          setNVal(""); setMVal("");
        } else {
          onChange(v);
        }
      }}
      className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium flex-1 min-w-0"
    >
      <option value="">None</option>
      <option value="1">1</option>
      <option value="0..1">0..1</option>
      <option value="0..*">0..*</option>
      <option value="1..*">1..*</option>
      <option value="__custom__">Custom (n..m)</option>
    </select>
  );
}

const UML_TYPES = ["String", "Number", "Integer", "Date", "DateTime", "Duration", "Money", "Decimal", "Boolean"];

const POSTGRES_TYPES = [
  "TEXT", "VARCHAR", "CHAR",
  "INT", "BIGINT", "SMALLINT", "SERIAL", "BIGSERIAL",
  "NUMERIC", "DECIMAL", "REAL", "DOUBLE PRECISION",
  "BOOLEAN",
  "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "INTERVAL",
  "UUID", "JSON", "JSONB", "BYTEA", "INET", "CIDR", "MACADDR",
  "ARRAY", "XML",
];

const MYSQL_TYPES = [
  "VARCHAR", "CHAR", "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
  "INT", "BIGINT", "SMALLINT", "TINYINT", "MEDIUMINT",
  "DECIMAL", "FLOAT", "DOUBLE",
  "BOOLEAN",
  "DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR",
  "BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB",
  "ENUM", "SET", "JSON", "BINARY", "VARBINARY",
];

const MSSQL_TYPES = [
  "NVARCHAR", "VARCHAR", "NCHAR", "CHAR", "TEXT", "NTEXT",
  "INT", "BIGINT", "SMALLINT", "TINYINT",
  "NUMERIC", "DECIMAL", "FLOAT", "REAL", "MONEY", "SMALLMONEY",
  "BIT",
  "DATE", "TIME", "DATETIME", "DATETIME2", "SMALLDATETIME", "DATETIMEOFFSET",
  "UNIQUEIDENTIFIER", "XML", "VARBINARY", "IMAGE",
  "SQL_VARIANT", "HIERARCHYID", "GEOGRAPHY", "GEOMETRY",
];

const DB_TYPE_LISTS: Record<string, string[]> = {
  postgres: POSTGRES_TYPES,
  mysql: MYSQL_TYPES,
  mssql: MSSQL_TYPES,
};

function formatAttrDisplay(attr: UmlAttribute): string {
  let s = "";
  if (attr.visibility) s += attr.visibility + " ";
  if (attr.isDerived) s += "/";
  s += attr.name;
  if (attr.type) s += " : " + attr.type;
  if (attr.multiplicity) s += " [" + attr.multiplicity + "]";
  if (attr.defaultValue) s += " = " + attr.defaultValue;
  if (attr.propertyString) s += " " + attr.propertyString;
  return s;
}

function ClassAttributesList({ element, onUpdateProperties, database }: {
  element: DiagramElement;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
  database?: string;
}) {
  const typeList = (database && database !== "none" && DB_TYPE_LISTS[database]) ? DB_TYPE_LISTS[database] : UML_TYPES;
  const attrs: UmlAttribute[] = (element.properties.attributes as UmlAttribute[] | undefined) ?? [];
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<UmlAttribute | null>(null);

  function update(newAttrs: UmlAttribute[]) {
    onUpdateProperties(element.id, { attributes: newAttrs });
  }
  function addAttr() {
    const newAttrs = [...attrs, { name: `attr${attrs.length + 1}` }];
    update(newAttrs);
    setEditingIdx(newAttrs.length - 1);
    setDraft(newAttrs[newAttrs.length - 1]);
  }
  function removeAttr(idx: number) {
    update(attrs.filter((_, i) => i !== idx));
    if (editingIdx === idx) { setEditingIdx(null); setDraft(null); }
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  }
  function moveAttr(idx: number, dir: -1 | 1) {
    const ni = idx + dir;
    if (ni < 0 || ni >= attrs.length) return;
    const next = [...attrs]; [next[idx], next[ni]] = [next[ni], next[idx]]; update(next);
    if (editingIdx === idx) setEditingIdx(ni);
    else if (editingIdx === ni) setEditingIdx(idx);
  }
  function startEdit(idx: number) {
    setEditingIdx(idx);
    setDraft({ ...attrs[idx] });
  }
  function confirmEdit() {
    if (editingIdx === null || !draft) return;
    const next = [...attrs]; next[editingIdx] = draft; update(next);
    setEditingIdx(null); setDraft(null);
  }
  function cancelEdit() {
    setEditingIdx(null); setDraft(null);
  }

  return (
    <div>
      <p className="text-[10px] font-medium text-gray-700 mb-1">Attributes</p>
      {attrs.length === 0 && <p className="text-[10px] text-gray-400 mb-1 italic">No attributes</p>}
      <div className="space-y-0.5 mb-1">
        {attrs.map((attr, i) => (
          editingIdx === i && draft ? (
            /* Expanded edit mode */
            <div key={i} className="border border-blue-300 rounded p-1.5 bg-blue-50 space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Visibility</label>
                <select value={draft.visibility ?? ""} onChange={e => setDraft({ ...draft, visibility: (e.target.value || undefined) as UmlAttribute["visibility"] })}
                  className="text-[9px] border border-gray-300 rounded px-0.5 py-0 flex-1">
                  <option value="">None</option>
                  <option value="+">+ Public</option>
                  <option value="-">- Private</option>
                  <option value="#"># Protected</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Name</label>
                <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Type</label>
                <select value={draft.type ?? ""} onChange={e => setDraft({ ...draft, type: e.target.value || undefined })}
                  className="text-[9px] border border-gray-300 rounded px-0.5 py-0 flex-1">
                  <option value="">None</option>
                  {typeList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Mult.</label>
                <MultSelect value={draft.multiplicity ?? ""} onChange={v => setDraft({ ...draft, multiplicity: v || undefined })} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Default</label>
                <input type="text" value={draft.defaultValue ?? ""} onChange={e => setDraft({ ...draft, defaultValue: e.target.value || undefined })}
                  className="flex-1 text-[9px] border border-gray-300 rounded px-1 py-0 min-w-0" placeholder="value" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Derived</label>
                <input type="checkbox" checked={draft.isDerived ?? false}
                  onChange={e => setDraft({ ...draft, isDerived: e.target.checked })}
                  className="w-3 h-3" />
              </div>
              {database && database !== "none" && (
                <>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-[9px] text-gray-500">
                      <input type="checkbox" checked={draft.notNull ?? false}
                        onChange={e => setDraft({ ...draft, notNull: e.target.checked })}
                        className="w-3 h-3" />
                      NOT NULL
                    </label>
                    <label className="flex items-center gap-1 text-[9px] text-gray-500">
                      <input type="checkbox" checked={draft.primaryKey ?? false}
                        onChange={e => setDraft({ ...draft, primaryKey: e.target.checked })}
                        className="w-3 h-3" />
                      PK
                    </label>
                    <label className="flex items-center gap-1 text-[9px] text-gray-500">
                      <input type="checkbox" checked={draft.foreignKey ?? false}
                        onChange={e => setDraft({ ...draft, foreignKey: e.target.checked })}
                        className="w-3 h-3" />
                      FK
                    </label>
                  </div>
                  {draft.foreignKey && (
                    <div className="flex items-center gap-1">
                      <label className="text-[9px] text-gray-500 w-10 shrink-0">FK →</label>
                      <input type="text" value={draft.fkTable ?? ""} onChange={e => setDraft({ ...draft, fkTable: e.target.value || undefined })}
                        className="flex-1 text-[9px] border border-gray-300 rounded px-1 py-0 min-w-0" placeholder="table" />
                      <span className="text-[9px] text-gray-400">.</span>
                      <input type="text" value={draft.fkColumn ?? ""} onChange={e => setDraft({ ...draft, fkColumn: e.target.value || undefined })}
                        className="flex-1 text-[9px] border border-gray-300 rounded px-1 py-0 min-w-0" placeholder="column" />
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-end gap-1 pt-0.5">
                <button onClick={cancelEdit}
                  className="px-2 py-0.5 text-[9px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
                <button onClick={confirmEdit}
                  className="px-2 py-0.5 text-[9px] text-white bg-blue-600 rounded hover:bg-blue-700">Confirm</button>
              </div>
            </div>
          ) : (
            /* Compact list view */
            <div key={i} className="flex items-center gap-0.5 group">
              <span className="flex-1 text-[10px] text-gray-700 truncate font-mono">{formatAttrDisplay(attr)}</span>
              <button onClick={() => startEdit(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 px-0.5" title="Edit">
                <svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2l3 3-7 7H0V9z" />
                </svg>
              </button>
              <button onClick={() => moveAttr(i, -1)} disabled={i === 0}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-gray-400 hover:text-gray-600 disabled:opacity-30 px-0.5">{"\u25B2"}</button>
              <button onClick={() => moveAttr(i, 1)} disabled={i === attrs.length - 1}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-gray-400 hover:text-gray-600 disabled:opacity-30 px-0.5">{"\u25BC"}</button>
              <button onClick={() => removeAttr(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 px-0.5" title="Delete">
                <svg width={8} height={8} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                  <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
                </svg>
              </button>
            </div>
          )
        ))}
      </div>
      <button onClick={addAttr}
        className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Add Attribute</button>
    </div>
  );
}

function formatOpDisplay(op: UmlOperation): string {
  let s = "";
  if (op.visibility) s += op.visibility + " ";
  s += op.name + "()";
  return s;
}

function ClassOperationsList({ element, onUpdateProperties }: {
  element: DiagramElement;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
}) {
  const ops: UmlOperation[] = (element.properties.operations as UmlOperation[] | undefined) ?? [];
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<UmlOperation | null>(null);

  function update(newOps: UmlOperation[]) {
    onUpdateProperties(element.id, { operations: newOps });
  }
  function addOp() {
    const newOps = [...ops, { name: `operation${ops.length + 1}` }];
    update(newOps);
    setEditingIdx(newOps.length - 1);
    setDraft(newOps[newOps.length - 1]);
  }
  function removeOp(idx: number) {
    update(ops.filter((_, i) => i !== idx));
    if (editingIdx === idx) { setEditingIdx(null); setDraft(null); }
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  }
  function moveOp(idx: number, dir: -1 | 1) {
    const ni = idx + dir;
    if (ni < 0 || ni >= ops.length) return;
    const next = [...ops]; [next[idx], next[ni]] = [next[ni], next[idx]]; update(next);
    if (editingIdx === idx) setEditingIdx(ni);
    else if (editingIdx === ni) setEditingIdx(idx);
  }
  function startEdit(idx: number) {
    setEditingIdx(idx);
    setDraft({ ...ops[idx] });
  }
  function confirmEdit() {
    if (editingIdx === null || !draft) return;
    const next = [...ops]; next[editingIdx] = draft; update(next);
    setEditingIdx(null); setDraft(null);
  }
  function cancelEdit() {
    setEditingIdx(null); setDraft(null);
  }

  return (
    <div>
      <p className="text-[10px] font-medium text-gray-700 mb-1">Operations</p>
      {ops.length === 0 && <p className="text-[10px] text-gray-400 mb-1 italic">No operations</p>}
      <div className="space-y-0.5 mb-1">
        {ops.map((op, i) => (
          editingIdx === i && draft ? (
            /* Expanded edit mode */
            <div key={i} className="border border-blue-300 rounded p-1.5 bg-blue-50 space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Visibility</label>
                <select value={draft.visibility ?? ""} onChange={e => setDraft({ ...draft, visibility: (e.target.value || undefined) as UmlOperation["visibility"] })}
                  className="text-[9px] border border-gray-300 rounded px-0.5 py-0 flex-1">
                  <option value="">None</option>
                  <option value="+">+ Public</option>
                  <option value="-">- Private</option>
                  <option value="#"># Protected</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 w-10 shrink-0">Name</label>
                <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0" />
                <span className="text-[10px] text-gray-400">()</span>
              </div>
              <div className="flex justify-end gap-1 pt-0.5">
                <button onClick={cancelEdit}
                  className="px-2 py-0.5 text-[9px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
                <button onClick={confirmEdit}
                  className="px-2 py-0.5 text-[9px] text-white bg-blue-600 rounded hover:bg-blue-700">Confirm</button>
              </div>
            </div>
          ) : (
            /* Compact list view */
            <div key={i} className="flex items-center gap-0.5 group">
              <span className="flex-1 text-[10px] text-gray-700 truncate font-mono">{formatOpDisplay(op)}</span>
              <button onClick={() => startEdit(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 px-0.5" title="Edit">
                <svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2l3 3-7 7H0V9z" />
                </svg>
              </button>
              <button onClick={() => moveOp(i, -1)} disabled={i === 0}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-gray-400 hover:text-gray-600 disabled:opacity-30 px-0.5">{"\u25B2"}</button>
              <button onClick={() => moveOp(i, 1)} disabled={i === ops.length - 1}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-gray-400 hover:text-gray-600 disabled:opacity-30 px-0.5">{"\u25BC"}</button>
              <button onClick={() => removeOp(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 px-0.5" title="Delete">
                <svg width={8} height={8} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                  <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
                </svg>
              </button>
            </div>
          )
        ))}
      </div>
      <button onClick={addOp}
        className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Add Operation</button>
    </div>
  );
}

function EnumValuesList({ element, onUpdateProperties }: {
  element: DiagramElement;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
}) {
  const [newVal, setNewVal] = useState("");
  const values: string[] = (element.properties.values as string[] | undefined) ?? [];

  function addValue() {
    if (!newVal.trim()) return;
    onUpdateProperties(element.id, { values: [...values, newVal.trim()] });
    setNewVal("");
  }
  function removeValue(idx: number) {
    onUpdateProperties(element.id, { values: values.filter((_, i) => i !== idx) });
  }
  function moveValue(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= values.length) return;
    const next = [...values];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onUpdateProperties(element.id, { values: next });
  }
  function updateValue(idx: number, val: string) {
    const next = [...values];
    next[idx] = val;
    onUpdateProperties(element.id, { values: next });
  }

  return (
    <div>
      <p className="text-[10px] font-medium text-gray-700 mb-1">Values List</p>
      {values.length === 0 && (
        <p className="text-[10px] text-gray-400 mb-1 italic">No values defined</p>
      )}
      <div className="space-y-0.5 mb-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-0.5">
            <input type="text" value={v}
              onChange={e => updateValue(i, e.target.value)}
              className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0" />
            <button onClick={() => moveValue(i, -1)} disabled={i === 0}
              className="text-[9px] text-gray-400 hover:text-gray-600 disabled:opacity-30 px-0.5"
              title="Move up">{"\u25B2"}</button>
            <button onClick={() => moveValue(i, 1)} disabled={i === values.length - 1}
              className="text-[9px] text-gray-400 hover:text-gray-600 disabled:opacity-30 px-0.5"
              title="Move down">{"\u25BC"}</button>
            <button onClick={() => removeValue(i)}
              className="text-[9px] text-gray-400 hover:text-red-500 px-0.5"
              title="Remove">
              <svg width={8} height={8} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input type="text" value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addValue(); }}
          placeholder="New value..."
          className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0" />
        <button onClick={addValue} disabled={!newVal.trim()}
          className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-30 font-medium px-1">+</button>
      </div>
    </div>
  );
}

// Compact inline row: label + value on same line. Defined at module
// scope (NOT inside PropertiesPanel) — React keeps a stable component
// identity across renders so the wrapped input keeps focus while the
// user is typing. When this lived inside PropertiesPanel each render
// created a fresh function reference, React unmounted/remounted the
// wrapped child on every keystroke, and any focused input lost focus
// after a single character.
function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <label className="text-[9px] text-gray-500 whitespace-nowrap w-12 shrink-0">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function PropertiesPanel({
  element,
  connector,
  diagramType,
  onUpdateLabel,
  onUpdateProperties,
  onLinkSharePointFile,
  onPreviewSharePointFile,
  onSetEventBoundary,
  onDeleteElement,
  onDeleteConnector,
  onUpdateConnectorDirection,
  onUpdateConnectorType,
  onReverseConnector,
  onUpdateConnectorLabel,
  onAddLane,
  onAddSublane,
  onReorderLane,
  onUpdateConnectorFields,
  parentName,
  poolHasContent,
  laneHasContent,
  hasMessageBpmnConnection,
  multiSelectionCount,
  allConnectors,
  allElements,
  debugMode,
  diagramName,
  diagramTitle,
  onUpdateDiagramTitle,
  createdAt,
  updatedAt,
  siblingDiagrams,
  currentDiagramId,
  parentDiagramIds,
  sessionParentId,
  onNavigateToDiagram,
  onFlipForkJoin,
  onConvertTaskSubprocess,
  onConvertProcessCollapsed,
  onConvertEventType,
  database,
  onSetDatabase,
  forceCollapseTitle,
  processOwner,
  onSetProcessOwner,
  projectId,
  pcf,
  onSetPcf,
  diagramOwner,
  diagramOwnerCandidates,
  canEditDiagramOwner,
  diagramOwnerError,
  onSetDiagramOwner,
  isAdmin: _isAdmin,
  riskCatalog,
  onCreateRiskItem,
  rcSectionOpen,
  onRcSectionToggle,
}: Props) {
  const [labelDraft, setLabelDraft] = useState("");
  // Auto-grow textarea ref for task/subprocess Name editing — height
  // tracks content up to 6 lines, then scrolls.
  const nameTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Resizable panel width (drag the left edge). Persisted per-browser.
  // NOTE: seed with the constant default on both server render and first
  // client render (no localStorage in the initializer) so hydration matches;
  // the stored value is applied in an effect after mount.
  const [panelWidth, setPanelWidth] = useState<number>(224);
  const panelWidthLoaded = useRef(false);
  useEffect(() => {
    const v = parseInt(window.localStorage.getItem("dgx_props_panel_width") || "", 10);
    if (Number.isFinite(v) && v >= 200 && v <= 640) setPanelWidth(v);
    panelWidthLoaded.current = true;
  }, []);
  useEffect(() => {
    if (panelWidthLoaded.current) window.localStorage.setItem("dgx_props_panel_width", String(panelWidth));
  }, [panelWidth]);
  function startPanelResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX, startW = panelWidth;
    const onMove = (m: MouseEvent) => setPanelWidth(Math.max(200, Math.min(640, startW + (startX - m.clientX))));
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const resizeHandle = (
    <div onMouseDown={startPanelResize} title="Drag to resize panel"
      className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 z-20" />
  );
  const [titleOpen, setTitleOpen] = useState(true);
  const [connectorOpen, setConnectorOpen] = useState(true);
  const [propsOpen, setPropsOpen] = useState(true);
  // Sub-sections inside the new "Diagram Properties" group. Each
  // collapses independently so the user can fold away parts they don't
  // care about. Defaults: title open, database/process-owner open,
  // bubble-help admin section closed (it's verbose).
  const [titleSubOpen, setTitleSubOpen] = useState(true);
  const [databaseSubOpen, setDatabaseSubOpen] = useState(true);
  const [diagramOwnerSubOpen, setDiagramOwnerSubOpen] = useState(true);
  const [processOwnerSubOpen, setProcessOwnerSubOpen] = useState(true);
  const [pcfSubOpen, setPcfSubOpen] = useState(true);


  // Confirm-and-delete modal for switching black-box (with messages) → white-box.
  const [poolTypeConfirm, setPoolTypeConfirm] = useState<null | { poolId: string; messageIds: string[] }>(null);

  useEffect(() => {
    if (element) setLabelDraft(element.label);
  }, [element]);

  // Auto-grow the task/subprocess Name textarea. Height = clamp(
  // scrollHeight, 3-line min, 6-line max). Below the min the editor
  // pads out to 3 visible lines; above the max it scrolls internally.
  useLayoutEffect(() => {
    const ta = nameTextareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.max(
      NAME_TEXTAREA_MIN_PX,
      Math.min(ta.scrollHeight, NAME_TEXTAREA_MAX_PX),
    );
    ta.style.height = next + "px";
  }, [labelDraft, element?.id]);

  // Collapse title and panel when AI panel opens
  useEffect(() => {
    if (forceCollapseTitle) {
      setTitleOpen(false);
      setPanelCollapsed(true);
    }
  }, [forceCollapseTitle]);

  // Auto-collapse title when element/connector selected, auto-open when deselected
  useEffect(() => {
    setTitleOpen(!element && !connector);
  }, [element, connector]);

  // Collapsed state: show a narrow vertical tab
  if (panelCollapsed) {
    return (
      <div
        className="w-6 border-l border-gray-200 bg-gray-50 flex flex-col items-center cursor-pointer hover:bg-gray-100 shrink-0"
        onClick={() => setPanelCollapsed(false)}
        title="Expand panel"
      >
        <span className="text-gray-400 text-xs mt-2">{"\u25C0"}</span>
        <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-widest mt-3"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>
          {connector ? "Connector" : element ? "Properties" : "Diagram"}
        </span>
      </div>
    );
  }

  // Collapse button for entire panel
  function CollapseButton() {
    return (
      <button onClick={() => setPanelCollapsed(true)} title="Collapse panel"
        className="absolute right-1 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs rounded hover:bg-gray-100 z-10"
        style={{ top: "1px" }}>
        {"\u25B6"}
      </button>
    );
  }

  // Collapsible section header
  function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle}
        className="w-full flex items-center justify-between py-0.5 border-b border-gray-200 mb-1">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-gray-400 text-[10px]">{open ? "\u25BC" : "\u25B6"}</span>
      </button>
    );
  }

  // InlineField is now defined at module scope (above) — see comment
  // there for why. Keeping this reference site comment so future
  // maintainers don't move it back inside.

  // Sub-section header inside DIAGRAM PROPERTIES. Smaller + italic
  // than the top-level SectionHeader.
  function SubHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle}
        className="w-full flex items-center justify-between mt-1 mb-0.5">
        <span className="text-[9px] italic font-semibold text-gray-600">{label}</span>
        <span className="text-gray-400 text-[9px]">{open ? "▾" : "▸"}</span>
      </button>
    );
  }

  // DIAGRAM PROPERTIES section content (was "Diagram Title").
  function TitleSection() {
    if (!onUpdateDiagramTitle) return null;
    return (
      <div className="pb-0.5">
        <SubHeader label="Title" open={titleSubOpen} onToggle={() => setTitleSubOpen(o => !o)} />
        {titleSubOpen && (<>
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] text-gray-500 w-12 shrink-0">Show</span>
          <button onClick={() => onUpdateDiagramTitle({ ...diagramTitle, showTitle: !(diagramTitle?.showTitle ?? false) })}
            className={`px-1.5 py-0 text-[9px] rounded border ${diagramTitle?.showTitle ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300"}`}
          >{diagramTitle?.showTitle ? "On" : "Off"}</button>
          <span className="text-[9px] text-gray-500 ml-1">Status</span>
          <select value={diagramTitle?.status ?? "draft"}
            onChange={e => onUpdateDiagramTitle({ ...diagramTitle, status: e.target.value as DiagramStatus })}
            className="text-[9px] border border-gray-300 rounded px-0.5 py-0 bg-white text-gray-700 cursor-pointer">
            {(["draft", "final", "production"] as DiagramStatus[]).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <InlineField label="Name">
          <span className="text-[9px] text-gray-600 truncate">{diagramName ?? ""}</span>
        </InlineField>
        {parentDiagramIds && parentDiagramIds.length > 0 && (() => {
          const siblings = siblingDiagrams ?? [];
          const rows = parentDiagramIds
            .map((pid) => {
              const sib = siblings.find((d) => d.id === pid);
              return { id: pid, name: sib?.name ?? "(missing)", missing: !sib };
            });
          const label = rows.length === 1 ? "Parent" : `Parents (${rows.length})`;
          return (
            <div className="mb-0.5">
              <div className="flex items-start gap-1">
                <span className="text-[9px] text-gray-500 w-12 shrink-0 pt-0.5">{label}</span>
                <div className="flex-1 flex flex-col gap-0.5">
                  {rows.map((r) => {
                    const isCurrent = r.id === sessionParentId;
                    if (r.missing) {
                      return (
                        <span key={r.id} className="text-[9px] text-gray-400 italic truncate">
                          {r.name}
                        </span>
                      );
                    }
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onNavigateToDiagram?.(r.id)}
                        disabled={!onNavigateToDiagram}
                        className={`text-[9px] text-left truncate rounded px-1 py-0.5 ${
                          isCurrent
                            ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200"
                            : "text-blue-600 hover:underline hover:bg-gray-50 border border-transparent"
                        }`}
                        title={isCurrent
                          ? `Most recently visited parent — "${r.name}"`
                          : `Drill to "${r.name}"`}
                      >
                        {isCurrent ? "▶ " : ""}{r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
        <InlineField label="Version">
          <input type="text" className="w-full text-[9px] border border-gray-300 rounded px-1 py-0"
            defaultValue={diagramTitle?.version ?? ""} key={`ver-${diagramName}`}
            onBlur={(e) => onUpdateDiagramTitle({ ...diagramTitle, version: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </InlineField>
        <InlineField label="Authors">
          <input type="text" className="w-full text-[9px] border border-gray-300 rounded px-1 py-0"
            defaultValue={diagramTitle?.authors ?? ""} key={`auth-${diagramName}`}
            onBlur={(e) => onUpdateDiagramTitle({ ...diagramTitle, authors: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </InlineField>
        <div className="flex items-center gap-1 text-[8px] text-gray-400 mt-0.5">
          <span>Created: {createdAt ? new Date(createdAt).toLocaleDateString() : ""}</span>
          <span>{"\u00B7"}</span>
          <span>Modified: {updatedAt ? new Date(updatedAt).toLocaleString() : ""}</span>
        </div>
        </>)}

        {/* Database sub-section \u2014 Domain diagrams only. */}
        {onSetDatabase && (<>
          <SubHeader label="Database" open={databaseSubOpen} onToggle={() => setDatabaseSubOpen(o => !o)} />
          {databaseSubOpen && (
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[9px] text-gray-500 w-12 shrink-0">Type</span>
              <select value={database ?? "none"}
                onChange={e => onSetDatabase(e.target.value)}
                className="text-[9px] border border-gray-300 rounded px-0.5 py-0 bg-white text-gray-700 cursor-pointer">
                <option value="none">None</option>
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="mssql">SQL Server</option>
              </select>
            </div>
          )}
        </>)}

        {/* Diagram Owner sub-section \u2014 hard FK to a registered user,
            sits directly above Process Owner. The display vs picker
            split mirrors how the dashboard sidebar handles non-owner
            access: editors and viewers see the name+email statically;
            only the project owner gets the picker. The candidates are
            the project owner + every share recipient.

            The sub-section renders even when there's no candidate pool
            or no current owner \u2014 that way the field is discoverable for
            project owners on freshly-created legacy diagrams (they can
            still see "(none)" and pick from the empty list to confirm
            the unset state isn't a bug). */}
        {(diagramOwner || canEditDiagramOwner || (diagramOwnerCandidates?.length ?? 0) > 0) && (<>
          <SubHeader
            label="Diagram Owner"
            open={diagramOwnerSubOpen}
            onToggle={() => setDiagramOwnerSubOpen(o => !o)}
          />
          {diagramOwnerSubOpen && (<>
            {canEditDiagramOwner && onSetDiagramOwner ? (<>
              <InlineField label="Owner">
                <select
                  className="w-full text-[9px] border border-gray-300 rounded px-1 py-0 bg-white"
                  value={diagramOwner?.id ?? ""}
                  onChange={(e) => onSetDiagramOwner(e.target.value || null)}
                >
                  <option value="">(none)</option>
                  {(diagramOwnerCandidates ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.name ?? "").trim() || u.email}
                    </option>
                  ))}
                </select>
              </InlineField>
              {diagramOwner?.email && (
                <InlineField label="Email">
                  <span className="text-[9px] text-gray-600 truncate" title={diagramOwner.email}>
                    {diagramOwner.email}
                  </span>
                </InlineField>
              )}
              {diagramOwnerError && (
                <p className="text-[9px] text-red-600 px-1 mt-0.5">{diagramOwnerError}</p>
              )}
            </>) : (<>
              <InlineField label="Name">
                <span className="text-[9px] text-gray-700 truncate" title={diagramOwner?.email ?? ""}>
                  {diagramOwner
                    ? ((diagramOwner.name ?? "").trim() || diagramOwner.email)
                    : <span className="text-gray-400 italic">(none)</span>}
                </span>
              </InlineField>
              {diagramOwner?.email && (
                <InlineField label="Email">
                  <span className="text-[9px] text-gray-600 truncate" title={diagramOwner.email}>
                    {diagramOwner.email}
                  </span>
                </InlineField>
              )}
            </>)}
          </>)}
        </>)}

        {/* Process Owner sub-section \u2014 every diagram type. */}
        {onSetProcessOwner && (<>
          <SubHeader label="Process Owner" open={processOwnerSubOpen} onToggle={() => setProcessOwnerSubOpen(o => !o)} />
          {processOwnerSubOpen && (<>
            <InlineField label="Name">
              <input type="text" className="w-full text-[9px] border border-gray-300 rounded px-1 py-0"
                defaultValue={processOwner?.name ?? ""} key={`po-name-${diagramName}`}
                onBlur={(e) => onSetProcessOwner({ name: e.target.value, email: processOwner?.email })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </InlineField>
            <InlineField label="Email">
              <input type="text" className="w-full text-[9px] border border-gray-300 rounded px-1 py-0"
                defaultValue={processOwner?.email ?? ""} key={`po-email-${diagramName}`}
                onBlur={(e) => onSetProcessOwner({ name: processOwner?.name, email: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </InlineField>
          </>)}
        </>)}

        {/* Process Classification (APQC PCF) — diagram-level, every type. */}
        {onSetPcf && projectId && (<>
          <SubHeader label="Process Classification (PCF)" open={pcfSubOpen} onToggle={() => setPcfSubOpen(o => !o)} />
          {pcfSubOpen && (
            <div className="px-1 py-1">
              <PcfClassifySection projectId={projectId} value={pcf} onChange={onSetPcf} />
            </div>
          )}
        </>)}

      </div>
    );
  }

  if (multiSelectionCount && multiSelectionCount > 1) {
    return (
      <div style={{ width: panelWidth }} className="border-l border-gray-200 bg-white p-2 overflow-y-auto relative shrink-0">{resizeHandle}
        <CollapseButton />
        <SectionHeader label="Diagram Properties" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && TitleSection()}
        <p className="text-xs text-gray-500 font-medium mt-2">{multiSelectionCount} elements selected</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Drag any selected element to move the group</p>
      </div>
    );
  }

  if (!element && !connector) {
    return (
      <div style={{ width: panelWidth }} className="border-l border-gray-200 bg-white p-2 overflow-y-auto relative shrink-0">{resizeHandle}
        <CollapseButton />
        <SectionHeader label="Diagram Properties" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && TitleSection()}
        <p className="text-[10px] text-gray-400 mt-2">Select an element to see properties</p>
      </div>
    );
  }

  if (connector) {
    return (
      <div style={{ width: panelWidth }} className="border-l border-gray-200 bg-white p-2 overflow-y-auto relative shrink-0">{resizeHandle}
        <CollapseButton />
        <SectionHeader label="Diagram Properties" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && TitleSection()}
        <SectionHeader label="Connector" open={connectorOpen} onToggle={() => setConnectorOpen(!connectorOpen)} />
        {connectorOpen && <div className="space-y-1.5">
        <div>
          <p className="text-xs text-gray-600">Type: {ARCHI_REL_META[connector.type]?.type ?? connector.type}</p>
          {debugMode && (
            <div className="mt-1 space-y-0.5 select-text">
              <input readOnly className="text-xs text-gray-400 font-mono bg-transparent border-none outline-none w-full p-0" value={`ID: ${connector.id}`} />
              <input readOnly className="text-xs text-gray-400 font-mono bg-transparent border-none outline-none w-full p-0" value={`Src: ${connector.sourceId} [${connector.sourceSide}:${(connector.sourceOffsetAlong ?? 0.5).toFixed(2)}]`} />
              <input readOnly className="text-xs text-gray-400 font-mono bg-transparent border-none outline-none w-full p-0" value={`Tgt: ${connector.targetId} [${connector.targetSide}:${(connector.targetOffsetAlong ?? 0.5).toFixed(2)}]`} />
              <input readOnly className="text-xs text-gray-400 font-mono bg-transparent border-none outline-none w-full p-0" value={`Routing: ${connector.routingType} | Segs: ${connector.waypoints.length - 1}`} />
              {connector.waypoints.map((wp, i) => (
                <input key={i} readOnly className="text-xs text-gray-400 font-mono bg-transparent border-none outline-none w-full p-0 pl-2"
                  value={`WP${i}: (${Math.round(wp.x)},${Math.round(wp.y)})${i < connector.waypoints.length - 1 ? ` → WP${i+1}` : ""}`} />
              ))}
            </div>
          )}
        </div>
        {connector.type.startsWith("archi-") && onUpdateConnectorType && (() => {
          const meta = ARCHI_REL_META[connector.type];
          const group: ArchiRelGroup = meta?.group ?? "Other";
          const typesInGroup = Object.entries(ARCHI_REL_META).filter(([, m]) => m.group === group);
          const stop = { onMouseDown: (e: React.MouseEvent) => e.stopPropagation() };
          return (
            <div className="space-y-1.5">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Relationship Group</label>
                <select
                  value={group}
                  onChange={(e) => {
                    const first = Object.entries(ARCHI_REL_META).find(([, m]) => m.group === e.target.value);
                    if (first) onUpdateConnectorType(connector.id, first[0] as ConnectorType);
                  }}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
                  {...stop}
                >
                  {ARCHI_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Relationship Type</label>
                <select
                  value={connector.type}
                  onChange={(e) => onUpdateConnectorType(connector.id, e.target.value as ConnectorType)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
                  {...stop}
                >
                  {typesInGroup.map(([key, m]) => <option key={key} value={key}>{m.type}</option>)}
                </select>
              </div>
            </div>
          );
        })()}
        {(() => {
          // Check if connector is between a Class and an Enumeration
          const srcEl = allElements?.find(e => e.id === connector.sourceId);
          const tgtEl = allElements?.find(e => e.id === connector.targetId);
          const classEnumTypes = new Set(["uml-class", "uml-enumeration"]);
          const isClassEnumConn = srcEl && tgtEl &&
            (classEnumTypes.has(srcEl.type) && classEnumTypes.has(tgtEl.type)) &&
            (srcEl.type !== tgtEl.type); // one is class, other is enumeration
          const isUmlConn = connector.type === "uml-association" || connector.type === "uml-aggregation" ||
            connector.type === "uml-composition" || connector.type === "uml-generalisation";
          // Process-context generalisation: only available between actor-type
          // participants (actor / team / system). When this case applies,
          // suppress the full 4-option UML dropdown below and show a
          // tailored Association/Generalisation choice instead — the
          // 4-option dropdown's Aggregation/Composition entries are
          // class-relationship semantics that don't apply to actors.
          const PC_ACTOR_TYPES = new Set(["actor", "team", "system"]);
          const isPCActorConn = diagramType === "process-context"
            && !!srcEl && !!tgtEl
            && PC_ACTOR_TYPES.has(srcEl.type)
            && PC_ACTOR_TYPES.has(tgtEl.type)
            && (connector.type === "association" || connector.type === "uml-generalisation");
          return (
            <>
              {/* Process-context actor-to-actor: Association ↔ Generalisation toggle */}
              {isPCActorConn && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-gray-500 w-20 shrink-0">Type:</span>
                  <select value={connector.type}
                    onChange={e => onUpdateConnectorType?.(connector.id, e.target.value as ConnectorType)}
                    className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium flex-1 min-w-0">
                    <option value="association">Association</option>
                    <option value="uml-generalisation">Generalisation</option>
                  </select>
                </div>
              )}
              {/* Relationship, Name, Reading Direction, Navigability — compact group */}
              {isUmlConn && !isPCActorConn && (() => {
                const relOpts = [
                  { value: "uml-association" as ConnectorType, label: "Association" },
                  { value: "uml-aggregation" as ConnectorType, label: "Aggregation" },
                  { value: "uml-composition" as ConnectorType, label: "Composition" },
                  { value: "uml-generalisation" as ConnectorType, label: "Generalisation" },
                ];
                const labelCls = "text-[10px] font-medium text-gray-500 w-20 shrink-0";
                const selectCls = "text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium flex-1 min-w-0";
                return (
                  <div className="space-y-0.5">
                    {/* Relationship */}
                    {isClassEnumConn ? (
                      <div className="flex items-center gap-1">
                        <span className={labelCls}>Relationship:</span>
                        <span className="text-[10px] font-medium text-gray-700">Association</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className={labelCls}>Relationship:</span>
                        <select value={connector.type}
                          onChange={e => onUpdateConnectorType?.(connector.id, e.target.value as ConnectorType)}
                          className={selectCls}>
                          {relOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    )}
                    {/* Name */}
                    {(connector.type === "uml-association" || connector.type === "uml-aggregation" ||
                      connector.type === "uml-composition") && onUpdateConnectorFields && (
                      <div className="flex items-center gap-1">
                        <span className={labelCls}>Name:</span>
                        <input type="text" className={"flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"}
                          defaultValue={connector.associationName ?? ""} key={`an-${connector.id}`}
                          onBlur={e => onUpdateConnectorFields(connector.id, { associationName: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          placeholder="association name" />
                      </div>
                    )}
                    {/* Reading Direction */}
                    {(connector.type === "uml-association" || connector.type === "uml-aggregation" ||
                      connector.type === "uml-composition") && onUpdateConnectorFields && (
                      <div className="flex items-center gap-1">
                        <span className={labelCls}>Reading Dir:</span>
                        <select value={connector.readingDirection ?? "none"}
                          onChange={e => onUpdateConnectorFields(connector.id, { readingDirection: e.target.value as "none" | "to-source" | "to-target" })}
                          className={selectCls}>
                          <option value="none">None</option>
                          <option value="to-source">{"\u25C0"} To Source</option>
                          <option value="to-target">To Target {"\u25B6"}</option>
                        </select>
                      </div>
                    )}
                    {/* Navigability */}
                    {connector.type === "uml-association" && !isClassEnumConn && onUpdateConnectorDirection && onUpdateConnectorFields && (
                      <div className="flex items-center gap-1">
                        <span className={labelCls}>Navigability:</span>
                        <select
                          value={connector.directionType === "non-directed" ? "none" : connector.arrowAtSource ? "to-source" : "to-target"}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === "none") {
                              onUpdateConnectorDirection(connector.id, "non-directed");
                              onUpdateConnectorFields(connector.id, { arrowAtSource: false });
                            } else if (v === "to-target") {
                              onUpdateConnectorDirection(connector.id, "open-directed");
                              onUpdateConnectorFields(connector.id, { arrowAtSource: false });
                            } else if (v === "to-source") {
                              onUpdateConnectorDirection(connector.id, "open-directed");
                              onUpdateConnectorFields(connector.id, { arrowAtSource: true });
                            }
                          }}
                          className={selectCls}>
                          <option value="none">None</option>
                          <option value="to-source">{"\u25C0"} To Source</option>
                          <option value="to-target">To Target {"\u25B6"}</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          );
        })()}
        {/* Reverse button for aggregation/composition/generalisation only */}
        {(connector.type === "uml-aggregation" || connector.type === "uml-composition" ||
          connector.type === "uml-generalisation") && onReverseConnector && (
          <button
            onClick={() => onReverseConnector(connector.id)}
            className="w-full px-3 py-1 text-[10px] bg-gray-50 text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
          >
            Reverse Direction
          </button>
        )}
        {/* UML association end properties */}
        {(connector.type === "uml-association" || connector.type === "uml-aggregation" ||
          connector.type === "uml-composition") && onUpdateConnectorFields && (() => {
          const srcEl = allElements?.find(e => e.id === connector.sourceId);
          const tgtEl = allElements?.find(e => e.id === connector.targetId);
          return (
            <div className="space-y-2">
              {/* Source end */}
              <div className="border-t border-gray-100 pt-1.5">
                <p className="text-[10px] font-medium text-gray-500 mb-1">Source End ({srcEl?.label || "?"})</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Role</label>
                    <input type="text" className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"
                      defaultValue={connector.sourceRole ?? ""} key={`sr-${connector.id}`}
                      onBlur={e => onUpdateConnectorFields(connector.id, { sourceRole: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      placeholder="role name" />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Multiplicity</label>
                    <MultSelect value={connector.sourceMultiplicity ?? ""}
                      onChange={v => onUpdateConnectorFields(connector.id, { sourceMultiplicity: v })} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Constraints</label>
                    <label className="flex items-center gap-0.5 text-[10px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={connector.sourceOrdered ?? false}
                        onChange={e => onUpdateConnectorFields(connector.id, { sourceOrdered: e.target.checked })}
                        className="w-3 h-3 rounded border-gray-300" />
                      ordered
                    </label>
                    <label className="flex items-center gap-0.5 text-[10px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={connector.sourceUnique ?? false}
                        onChange={e => onUpdateConnectorFields(connector.id, { sourceUnique: e.target.checked })}
                        className="w-3 h-3 rounded border-gray-300" />
                      unique
                    </label>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Visibility</label>
                    <select
                      value={connector.sourceVisibility ?? ""}
                      onChange={e => onUpdateConnectorFields(connector.id, { sourceVisibility: e.target.value })}
                      className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
                    >
                      <option value="">None</option>
                      <option value="+">+ Public</option>
                      <option value="-">- Private</option>
                      <option value="#"># Protected</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Qualifier</label>
                    <input type="text" className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"
                      defaultValue={connector.sourceQualifier ?? ""} key={`sq-${connector.id}`}
                      onBlur={e => onUpdateConnectorFields(connector.id, { sourceQualifier: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      placeholder="accountNumber" />
                  </div>
                </div>
              </div>
              {/* Target end */}
              <div className="border-t border-gray-100 pt-1.5">
                <p className="text-[10px] font-medium text-gray-500 mb-1">Target End ({tgtEl?.label || "?"})</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Role</label>
                    <input type="text" className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"
                      defaultValue={connector.targetRole ?? ""} key={`tr-${connector.id}`}
                      onBlur={e => onUpdateConnectorFields(connector.id, { targetRole: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      placeholder="role name" />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Multiplicity</label>
                    <MultSelect value={connector.targetMultiplicity ?? ""}
                      onChange={v => onUpdateConnectorFields(connector.id, { targetMultiplicity: v })} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Constraints</label>
                    <label className="flex items-center gap-0.5 text-[10px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={connector.targetOrdered ?? false}
                        onChange={e => onUpdateConnectorFields(connector.id, { targetOrdered: e.target.checked })}
                        className="w-3 h-3 rounded border-gray-300" />
                      ordered
                    </label>
                    <label className="flex items-center gap-0.5 text-[10px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={connector.targetUnique ?? false}
                        onChange={e => onUpdateConnectorFields(connector.id, { targetUnique: e.target.checked })}
                        className="w-3 h-3 rounded border-gray-300" />
                      unique
                    </label>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Visibility</label>
                    <select
                      value={connector.targetVisibility ?? ""}
                      onChange={e => onUpdateConnectorFields(connector.id, { targetVisibility: e.target.value })}
                      className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
                    >
                      <option value="">None</option>
                      <option value="+">+ Public</option>
                      <option value="-">- Private</option>
                      <option value="#"># Protected</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-400 w-12 shrink-0">Qualifier</label>
                    <input type="text" className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"
                      defaultValue={connector.targetQualifier ?? ""} key={`tq-${connector.id}`}
                      onBlur={e => onUpdateConnectorFields(connector.id, { targetQualifier: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      placeholder="accountNumber" />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
{(() => {
          const isAssocPC = connector.type === "association" && diagramType === "process-context";
          const isAssocBPMN = connector.type === "associationBPMN";
          // Annotation associations are inherently non-directional per BPMN —
          // hide the direction selector entirely. The user requested no
          // direction UI for these; the connector is also forced to
          // non-directed at draw time in Canvas.tsx.
          const involvesAnnotation = isAssocBPMN && allElements && (() => {
            const s = allElements.find(e => e.id === connector.sourceId);
            const t = allElements.find(e => e.id === connector.targetId);
            return s?.type === "text-annotation" || t?.type === "text-annotation";
          })();
          const showDirection = !involvesAnnotation &&
            connector.type !== "messageBPMN" &&
            connector.type !== "uml-association" && connector.type !== "uml-aggregation" &&
            connector.type !== "uml-composition" && connector.type !== "uml-generalisation" &&
            (isAssocBPMN || isAssocPC ||
            (connector.type !== "sequence" && connector.type !== "transition" && connector.type !== "flow") ||
            connector.routingType === "direct");
          if (!showDirection) return null;

          // --- associationBPMN: "To Data Object" / "From Data Object" buttons ---
          if (isAssocBPMN && allElements && allConnectors && onReverseConnector) {
            const srcEl = allElements.find(e => e.id === connector.sourceId);
            const tgtEl = allElements.find(e => e.id === connector.targetId);
            const DATA_TYPES = new Set(["data-object", "data-store", "text-annotation"]);
            const dataEl = tgtEl && DATA_TYPES.has(tgtEl.type) ? tgtEl
                         : srcEl && DATA_TYPES.has(srcEl.type) ? srcEl : null;
            // Arrow currently points toward target (open-directed) or is non-directed
            const arrowToTarget = connector.directionType === "open-directed";
            const dataIsTarget = dataEl?.id === connector.targetId;
            // Current effective direction relative to the data object
            const isToData = arrowToTarget ? dataIsTarget : !dataIsTarget;
            // Treat non-directed as neither selected
            const isNonDirected = connector.directionType === "non-directed" || connector.directionType === "both";

            function setAssocDirection(toData: boolean) {
              if (!dataEl || !connector || !allConnectors || !onReverseConnector) return;
              const dataIsTarget = dataEl.id === connector.targetId;
              // "To Data Object" means arrow points toward data element
              // "From Data Object" means arrow points away from data element
              const needArrowToTarget = toData ? dataIsTarget : !dataIsTarget;

              // Ensure direction is open-directed (if currently non-directed or both)
              if (connector.directionType !== "open-directed") {
                onUpdateConnectorDirection(connector.id, "open-directed");
              }
              // If current arrow direction is wrong, reverse
              const currentArrowToTarget = connector.directionType === "open-directed";
              if (currentArrowToTarget !== needArrowToTarget) {
                onReverseConnector(connector.id);
              }

              // Auto-set data object role based on all associations after this change
              if (dataEl.type !== "data-object") return;
              const otherConns = allConnectors.filter(
                c => c.id !== connector.id && c.type === "associationBPMN"
                  && (c.sourceId === dataEl.id || c.targetId === dataEl.id)
              );
              if (toData) {
                // "To Data Object" chosen → this is an incoming association to the data object
                if (otherConns.length === 0) {
                  // No other connectors → Output
                  onUpdateProperties(dataEl.id, { role: "output" });
                } else {
                  const allIncoming = otherConns.every(c => {
                    // Is this other connector also incoming to the data object?
                    const cDataIsTarget = c.targetId === dataEl.id;
                    const cArrowToTarget = c.directionType === "open-directed";
                    return cArrowToTarget ? cDataIsTarget : !cDataIsTarget;
                  });
                  if (allIncoming) {
                    onUpdateProperties(dataEl.id, { role: "output" });
                  } else {
                    // Has outgoing connectors → None
                    onUpdateProperties(dataEl.id, { role: "none" });
                  }
                }
              } else {
                // "From Data Object" chosen → this is an outgoing association from the data object
                if (otherConns.length === 0) {
                  // No other connectors → Input
                  onUpdateProperties(dataEl.id, { role: "input" });
                } else {
                  const hasIncoming = otherConns.some(c => {
                    const cDataIsTarget = c.targetId === dataEl.id;
                    const cArrowToTarget = c.directionType === "open-directed";
                    return cArrowToTarget ? cDataIsTarget : !cDataIsTarget;
                  });
                  if (hasIncoming) {
                    // Has incoming connectors → None
                    onUpdateProperties(dataEl.id, { role: "none" });
                  } else {
                    // Only outgoing → Input
                    onUpdateProperties(dataEl.id, { role: "input" });
                  }
                }
              }
            }

            return (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-gray-500 shrink-0">Direction:</span>
                <button
                  onClick={() => setAssocDirection(true)}
                  className={`px-2 py-0.5 text-[10px] rounded border font-medium ${
                    !isNonDirected && isToData
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >To Data Object</button>
                <button
                  onClick={() => setAssocDirection(false)}
                  className={`px-2 py-0.5 text-[10px] rounded border font-medium ${
                    !isNonDirected && !isToData
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >From Data Object</button>
              </div>
            );
          }

          // --- Other connector types: dropdown ---
          // Check if either end is a "system" element
          const hasSystem = isAssocPC && allElements && (
            allElements.find(e => e.id === connector.sourceId)?.type === "system" ||
            allElements.find(e => e.id === connector.targetId)?.type === "system"
          );
          const options = isAssocPC
            ? [
                { value: "non-directed"  as DirectionType, label: "None" },
                { value: "open-directed" as DirectionType, label: "Directed" },
                ...(hasSystem ? [{ value: "both" as DirectionType, label: "Both" }] : []),
              ]
            : connector.routingType === "direct"
              ? [
                  { value: "open-directed" as DirectionType, label: "Directed" },
                  { value: "both"          as DirectionType, label: "Both" },
                ]
              : [
                  { value: "directed"      as DirectionType, label: "Filled" },
                  { value: "open-directed" as DirectionType, label: "Open" },
                  { value: "both"          as DirectionType, label: "Both" },
                  { value: "non-directed"  as DirectionType, label: "None" },
                ].filter(o => !(diagramType === "process-context" && o.value === "directed"));
          return (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium text-gray-500 shrink-0">Direction:</span>
              <select
                value={connector.directionType}
                onChange={e => onUpdateConnectorDirection(connector.id, e.target.value as DirectionType)}
                className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
              >
                {options.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          );
        })()}
        {/* Reverse for process-context association when Directed + System actor */}
        {connector.type === "association" && diagramType === "process-context" &&
          connector.directionType === "open-directed" &&
          allElements && (
            allElements.find(e => e.id === connector.sourceId)?.type === "system" ||
            allElements.find(e => e.id === connector.targetId)?.type === "system"
          ) && onReverseConnector && (
          <button
            onClick={() => onReverseConnector(connector.id)}
            className="w-full px-3 py-1.5 text-xs bg-gray-50 text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
          >
            Reverse Direction
          </button>
        )}
        {/* Transition formal/informal label */}
        {connector.type === "transition" && onUpdateConnectorLabel && onUpdateConnectorFields && (() => {
          const mode = connector.labelMode ?? "informal";
          function composeFormalLabel(event: string, guard: string, actions: string): string {
            const parts: string[] = [];
            if (event.trim()) parts.push(event.trim());
            if (guard.trim()) parts.push(`[${guard.trim()}]`);
            if (actions.trim()) {
              parts.push("/ " + actions.trim());
            }
            return parts.join("\n");
          }
          return (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-700">Label</p>
                <div className="flex gap-1">
                  {(["informal", "formal"] as const).map(m => (
                    <button key={m}
                      onClick={() => {
                        if (m === "formal" && mode !== "formal") {
                          // Switching to formal: compose from current parts (or empty)
                          const ev = connector.transitionEvent ?? "";
                          const gd = connector.transitionGuard ?? "";
                          const ac = connector.transitionActions ?? "";
                          onUpdateConnectorFields(connector.id, {
                            labelMode: "formal",
                            transitionEvent: ev, transitionGuard: gd, transitionActions: ac,
                            label: composeFormalLabel(ev, gd, ac),
                          });
                        } else if (m === "informal") {
                          onUpdateConnectorFields(connector.id, { labelMode: "informal" });
                        }
                      }}
                      className={`px-1.5 py-0.5 text-[10px] rounded border ${
                        mode === m ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300"
                      }`}
                    >{m === "informal" ? "Text" : "Formal"}</button>
                  ))}
                </div>
              </div>
              {mode === "informal" ? (
                <>
                  <textarea
                    key={`inf-${connector.id}`}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 resize-y"
                    rows={2}
                    defaultValue={connector.label ?? ""}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => onUpdateConnectorLabel(connector.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Shift+Enter for new line</p>
                </>
              ) : (
                <div className="space-y-1.5">
                  <div>
                    <label className="text-[10px] text-gray-500">Event</label>
                    <input
                      key={`ev-${connector.id}`}
                      type="text"
                      className="w-full text-xs border border-gray-300 rounded px-2 py-0.5"
                      defaultValue={connector.transitionEvent ?? ""}
                      onBlur={(e) => {
                        const ev = e.target.value;
                        const gd = connector.transitionGuard ?? "";
                        const ac = connector.transitionActions ?? "";
                        onUpdateConnectorFields(connector.id, {
                          transitionEvent: ev,
                          label: composeFormalLabel(ev, gd, ac),
                        });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">Guard</label>
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-gray-400">[</span>
                      <input
                        key={`gd-${connector.id}`}
                        type="text"
                        className="flex-1 text-xs border border-gray-300 rounded px-2 py-0.5"
                        defaultValue={connector.transitionGuard ?? ""}
                        onBlur={(e) => {
                          const gd = e.target.value;
                          const ev = connector.transitionEvent ?? "";
                          const ac = connector.transitionActions ?? "";
                          onUpdateConnectorFields(connector.id, {
                            transitionGuard: gd,
                            label: composeFormalLabel(ev, gd, ac),
                          });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                      <span className="text-xs text-gray-400">]</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">Actions</label>
                    <input
                      key={`ac-${connector.id}`}
                      type="text"
                      className="w-full text-xs border border-gray-300 rounded px-2 py-0.5"
                      placeholder="action1, action2"
                      defaultValue={connector.transitionActions ?? ""}
                      onBlur={(e) => {
                        const ac = e.target.value;
                        const ev = connector.transitionEvent ?? "";
                        const gd = connector.transitionGuard ?? "";
                        onUpdateConnectorFields(connector.id, {
                          transitionActions: ac,
                          label: composeFormalLabel(ev, gd, ac),
                        });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <p className="text-xs text-gray-400 mt-0.5">Comma-separated list</p>
                  </div>
                  {/* Preview */}
                  <div className="bg-gray-50 rounded p-1.5 text-[10px] text-gray-600 font-mono whitespace-pre-wrap">
                    {composeFormalLabel(connector.transitionEvent ?? "", connector.transitionGuard ?? "", connector.transitionActions ?? "") || "(empty)"}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {/* Label for non-transition connectors */}
        {(connector.type === "flow" || connector.type === "messageBPMN"
          || (connector.type === "sequence" && connector.label !== undefined)) && onUpdateConnectorLabel && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Label</p>
            <textarea
              key={connector.id}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 resize-y"
              rows={3}
              defaultValue={connector.label ?? ""}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => onUpdateConnectorLabel(connector.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
            />
            <p className="text-xs text-gray-400 mt-0.5">Shift+Enter for new line</p>
          </div>
        )}
        {connector.type === "sequence" && onUpdateConnectorFields && (
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!!connector.bottleneck}
              onChange={(e) => onUpdateConnectorFields(connector.id, { bottleneck: e.target.checked || undefined } as Partial<Connector>)}
              className="accent-purple-600"
            />
            Bottleneck
          </label>
        )}
        <button
          onClick={() => onDeleteConnector(connector.id)}
          className="w-full px-3 py-1 text-[10px] bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
        >
          Delete connector
        </button>
      </div>}
      </div>
    );
  }

  if (!element) return null;

  const isEventElement =
    element.type === "start-event" ||
    element.type === "intermediate-event" ||
    element.type === "end-event";

  return (
    <div style={{ width: panelWidth }} className="border-l border-gray-200 bg-white p-3 overflow-y-auto relative shrink-0">{resizeHandle}
      <CollapseButton />
      <SectionHeader label="Diagram Properties" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
      {titleOpen && TitleSection()}
      <SectionHeader label="Properties" open={propsOpen} onToggle={() => setPropsOpen(!propsOpen)} />
      {propsOpen && <div className="space-y-1.5">
      <div>
        <p className="text-[10px] text-gray-400 mb-0.5">Type: {element.type}</p>
        {debugMode && (
          <p className="text-xs text-gray-300 mb-1 font-mono">ID: {element.id}</p>
        )}
        {(() => {
          if (!allElements) return parentName ? <p className="text-xs text-gray-400 mb-3">Parent: {parentName}</p> : <div className="mb-2" />;
          // Resolve ancestor chain treating boundaryHostId as parent
          const effectiveParentId = element.boundaryHostId ?? element.parentId;
          const parent = effectiveParentId ? allElements.find(e => e.id === effectiveParentId) : undefined;
          const gpId = parent ? (parent.boundaryHostId ?? parent.parentId) : undefined;
          const grandparent = gpId ? allElements.find(e => e.id === gpId) : undefined;
          const ggpId = grandparent ? (grandparent.boundaryHostId ?? grandparent.parentId) : undefined;
          const greatGrandparent = ggpId ? allElements.find(e => e.id === ggpId) : undefined;
          if (!parent) return <div className="mb-2" />;
          return (
            <div className="mb-3">
              <p className="text-xs text-gray-400">Parent: {parent.label || parent.type}</p>
              {grandparent && <p className="text-xs text-gray-400">Grandparent: {grandparent.label || grandparent.type}</p>}
              {greatGrandparent && <p className="text-xs text-gray-400">Great Grandparent: {greatGrandparent.label || greatGrandparent.type}</p>}
            </div>
          );
        })()}
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
          {element.type === "uml-class" || element.type === "uml-enumeration" ||
           element.type === "task" || element.type === "subprocess" ||
           element.type === "subprocess-expanded" ||
           element.type === "pool" || element.type === "lane" ||
           element.type === "external-entity" || element.type === "process-system" ? "Name" : "Label"}
        </label>
        {(element.type === "task" || element.type === "subprocess" || element.type === "subprocess-expanded") ? (
          // Task / Sub-Process / Expanded Sub-Process Name editor:
          //  - auto-grows downward as the user adds lines
          //  - shrinks back upward as lines are removed
          //  - caps at 6 visible lines; scrolls thereafter
          //  - a faint ↵ glyph is rendered at every hard newline so
          //    Shift+Enter breaks are visually distinguishable from
          //    soft word-wrap.
          // The ↵ glyphs are drawn by an absolutely-positioned <pre>
          // beneath a transparent textarea — both share identical font,
          // padding, and wrap rules so the glyphs line up with the
          // textarea's own breaks.
          <div className="relative w-full">
            <pre
              aria-hidden="true"
              className="absolute inset-0 m-0 px-1.5 py-1 border border-transparent rounded text-[11px] pointer-events-none whitespace-pre-wrap break-words overflow-hidden font-sans leading-[1.4] text-gray-900"
            >
              {labelDraft.split("\n").map((line, i, arr) => (
                <Fragment key={i}>
                  {line}
                  {i < arr.length - 1 && (
                    <>
                      <span className="text-gray-400 select-none">↵</span>
                      {"\n"}
                    </>
                  )}
                </Fragment>
              ))}
              {/* Trailing space so an empty final line is reflected in the
                  scrollHeight calculation. */}
              {" "}
            </pre>
            <textarea
              ref={nameTextareaRef}
              key={element.id}
              data-properties-label="true"
              className="relative w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 overflow-y-auto whitespace-pre-wrap break-words font-sans leading-[1.4]"
              style={{
                background: "transparent",
                color: "transparent",
                caretColor: "#111827",
                resize: "none",
                maxHeight: NAME_TEXTAREA_MAX_PX,
              }}
              rows={1}
              value={labelDraft}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => { if (labelDraft !== element.label) onUpdateLabel(element.id, labelDraft); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onUpdateLabel(element.id, labelDraft);
                }
              }}
            />
          </div>
        ) : (element.type === "gateway" || isEventElement ||
          element.type === "data-object" || element.type === "data-store" ||
          element.type === "use-case" ||
          element.type === "external-entity" || element.type === "process-system" ||
          element.type === "uml-class" || element.type === "uml-enumeration" ||
          element.type === "text-annotation" ||
          element.type === "chevron" || element.type === "chevron-collapsed" ||
          element.type === "archimate-shape" ||
          element.type === "pool" || element.type === "lane") ? (
            <textarea
              key={element.id}
              data-properties-label="true"
              className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y overflow-y-auto"
              rows={
                element.type === "archimate-shape" || element.type === "text-annotation"
                  // Starts at 3 lines, grows with each Shift+Enter the
                  // user types (caps at 6 lines so the panel doesn't
                  // stretch excessively). Enter commits, Shift+Enter
                  // inserts a newline. For text-annotation we add a
                  // visible ↵ marker before every '\n' inside the draft
                  // so the line-count basis here ALREADY matches what
                  // the textarea is rendering.
                  ? Math.max(3, Math.min(6, labelDraft.split("\n").length))
                  // Other multi-line shapes (gateway, event, data,
                  // pool/lane, etc.) all start at 3 lines per Paul's
                  // request — uniform Name editor across the panel.
                  : 3
              }
              value={
                // Render embedded newlines with a leading "↵" so the user
                // can SEE that a Shift+Enter is sitting in the label —
                // soft word-wrap looks identical to a hard newline without
                // the marker. The glyph is stripped on every onChange/commit
                // path so it never reaches state / persistence.
                labelDraft.replace(/\n/g, "↵\n")
              }
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                let val = e.target.value;
                // Strip any "↵" markers (user-typed or round-tripped from
                // our markered render). We keep raw \n only.
                val = val.replace(/↵/g, "");
                if (element.type === "uml-class" || element.type === "uml-enumeration") {
                  const lines = val.split("\n");
                  if (lines.length > 2) val = lines.slice(0, 2).join("\n");
                }
                setLabelDraft(val);
              }}
              onBlur={() => { if (labelDraft !== element.label) onUpdateLabel(element.id, labelDraft); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onUpdateLabel(element.id, labelDraft);
                }
              }}
            />
        ) : (
          // Fallback Name editor for any remaining element type — also
          // a 3-row auto-expanding textarea so Name behaviour is uniform
          // across the Properties panel.
          <textarea
            key={element.id}
            data-properties-label="true"
            className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y overflow-y-auto"
            rows={3}
            value={labelDraft}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => { if (labelDraft !== element.label) onUpdateLabel(element.id, labelDraft); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onUpdateLabel(element.id, labelDraft);
              }
            }}
          />
        )}
      </div>

      {element.type === "text-annotation" && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Colour</label>
          <select
            value={(element.properties.annotationColor as string | undefined) ?? "black"}
            onChange={(e) => onUpdateProperties(element.id, { annotationColor: e.target.value })}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            <option value="black">Black</option>
            <option value="green">Green</option>
            <option value="orange">Orange</option>
            <option value="red">Red</option>
            <option value="purple">Purple</option>
          </select>
          <select
            value={(element.properties.annotationFontStyle as string | undefined) ?? "normal"}
            onChange={(e) => onUpdateProperties(element.id, { annotationFontStyle: e.target.value })}
            className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
        </div>
      )}

      {element.type === "pool" && (() => {
        const poolType = (element.properties.poolType as string | undefined) ?? "black-box";
        // Message connectors whose source OR target is this pool (directly).
        // Gates the black-box → white-box pool-type change confirm
        // (formerly also gated the now-removed "+ Add Lane" button).
        const poolMessageConns = (allConnectors ?? []).filter(
          c => c.type === "messageBPMN" && (c.sourceId === element.id || c.targetId === element.id),
        );
        const hasMessageConns = poolMessageConns.length > 0;
        return (
          <>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Element</label>
              <select
                value={poolType}
                onChange={(e) => {
                  const newType = e.target.value;
                  // Guard: switching black-box (with message connectors) to white-box
                  // is destructive — messages can't survive because a white-box pool
                  // holds internal elements, not external-message attachment points.
                  // Routed through a Diagramatix-styled confirm modal (state below).
                  if (poolType === "black-box" && newType === "white-box" && hasMessageConns) {
                    setPoolTypeConfirm({ poolId: element.id, messageIds: poolMessageConns.map(c => c.id) });
                    return;
                  }
                  onUpdateProperties(element.id, { poolType: newType });
                }}
                className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
              >
                <option value="black-box">Black-box</option>
                <option value="white-box">White-box</option>
              </select>
            </div>
            {poolType === "black-box" && (
              <label className="flex items-center gap-1 text-[10px] text-gray-700">
                <input type="checkbox"
                  checked={!!element.properties.isSystem}
                  onChange={(e) => onUpdateProperties(element.id, { isSystem: e.target.checked })}
                  className="w-3 h-3" />
                System (IT application / database)
              </label>
            )}
            {/* + Add Lane removed — drop the Pool/Lane palette symbol
                onto an existing pool to add lanes (with green/blue/purple
                drop preview). */}
          </>
        );
      })()}

      {/* + Add Sublane removed — drop the Pool/Lane palette symbol on
          the middle ⅓ of a lane to split into sublanes. */}

      {element.type === "lane" && onReorderLane && (() => {
        const siblings = (allElements ?? [])
          .filter(e => e.type === "lane" && e.parentId === element.parentId)
          .sort((a, b) => a.y - b.y);
        const idx = siblings.findIndex(s => s.id === element.id);
        const canUp = idx > 0;
        const canDown = idx >= 0 && idx < siblings.length - 1;
        if (!canUp && !canDown) return null;
        return (
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Reorder</label>
            <button onClick={() => onReorderLane(element.id, "up")} disabled={!canUp}
              className="flex-1 px-2 py-0.5 text-[10px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Move lane up">
              &uarr; Up
            </button>
            <button onClick={() => onReorderLane(element.id, "down")} disabled={!canDown}
              className="flex-1 px-2 py-0.5 text-[10px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Move lane down">
              &darr; Down
            </button>
          </div>
        );
      })()}

      {(element.type === "data-object" || element.type === "pool" || element.type === "data-store") && (
        <>
          {element.type === "data-object" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="optional"
                  value={(element.properties.state as string) ?? ""}
                  onChange={(e) => onUpdateProperties(element.id, { state: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <div className="flex flex-wrap gap-1">
                  {(["none", "input", "output"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => onUpdateProperties(element.id, { role: v })}
                      className={`px-2 py-1 text-xs rounded border ${
                        ((element.properties.role as string | undefined) ?? "none") === v
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {v === "none" ? "None" : v === "input" ? "Input" : "Output"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {(element.type === "data-object" || element.type === "data-store") && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link</label>
                <div className="flex items-center gap-1">
                  <input
                    type="url"
                    className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://… (URL to the document)"
                    value={(element.properties.link as string) ?? ""}
                    onChange={(e) => onUpdateProperties(element.id, { link: e.target.value })}
                  />
                  {((element.properties.link as string) ?? "").startsWith("http") && (
                    <a
                      href={element.properties.link as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs shrink-0"
                      title="Open the linked document in a new tab"
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filename</label>
                <input
                  type="text"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Q4-operations-report.pdf"
                  value={(element.properties.filename as string) ?? ""}
                  onChange={(e) => onUpdateProperties(element.id, { filename: e.target.value })}
                />
              </div>

              {/* SharePoint file — structured link with embedded preview. */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">SharePoint file</label>
                {(() => {
                  const sp = element.properties.sharepointLink as
                    | { driveId: string; itemId: string; name: string; webUrl?: string }
                    | undefined;
                  if (sp && sp.itemId) {
                    return (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-200 rounded bg-gray-50">
                          <span aria-hidden>📄</span>
                          <span className="flex-1 min-w-0 truncate text-xs text-gray-800" title={sp.name}>{sp.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onPreviewSharePointFile?.(sp)}
                            className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => onLinkSharePointFile?.(element.id)}
                            className="px-2 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Change…
                          </button>
                          <button
                            onClick={() => onUpdateProperties(element.id, { sharepointLink: undefined })}
                            className="px-2 py-1 text-xs font-medium text-red-700 border border-gray-300 rounded hover:bg-red-50"
                          >
                            Unlink
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      onClick={() => onLinkSharePointFile?.(element.id)}
                      className="w-full px-2 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Link SharePoint file…
                    </button>
                  );
                })()}
              </div>
            </>
          )}

          {(element.type === "data-object" ||
            (element.type === "pool" &&
              ((element.properties.poolType as string | undefined) ?? "black-box") === "black-box")) && (
            <div className="flex items-center gap-2">
              <input
                id={`mult-collection-${element.id}`}
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={(element.properties.multiplicity as string | undefined) === "collection"}
                onChange={(e) => onUpdateProperties(element.id, {
                  multiplicity: e.target.checked ? "collection" : undefined,
                })}
              />
              <label htmlFor={`mult-collection-${element.id}`} className="text-xs font-medium text-gray-700">
                Collection
              </label>
            </div>
          )}
        </>
      )}

      {element.type === "task" && diagramType === "bpmn" && onConvertTaskSubprocess && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Convert</label>
          <button onClick={() => onConvertTaskSubprocess(element.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border text-blue-600 border-blue-300 hover:bg-blue-50">
            → Subprocess
          </button>
        </div>
      )}

      {element.type === "subprocess" && diagramType === "bpmn" && onConvertTaskSubprocess && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Convert</label>
          <button onClick={() => onConvertTaskSubprocess(element.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border text-blue-600 border-blue-300 hover:bg-blue-50">
            → Task
          </button>
        </div>
      )}

      {element.type === "task" && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Task Type</label>
          <select
            value={element.taskType ?? "none"}
            onChange={(e) => onUpdateProperties(element.id, { taskType: e.target.value })}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            {TASK_TYPE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {(element.type === "subprocess" || element.type === "subprocess-expanded") && (
        <>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Usage</label>
            <select
              value={(element.properties.subprocessType as string | undefined) ?? "normal"}
              onChange={(e) => onUpdateProperties(element.id, { subprocessType: e.target.value })}
              className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
            >
              <option value="normal">Normal</option>
              <option value="call">Call</option>
              <option value="event">Event</option>
              <option value="transaction">Transaction</option>
            </select>
            <label className="flex items-center gap-1 text-[10px] text-gray-700 whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!element.properties.adHoc}
                onChange={(e) => onUpdateProperties(element.id, { adHoc: e.target.checked })}
                className="cursor-pointer w-3 h-3"
              />
              Ad-hoc
            </label>
          </div>
        </>
      )}

      {element.type === "subprocess" && siblingDiagrams && (() => {
        const bpmnSiblings = siblingDiagrams.filter(d => d.type === "bpmn");
        if (bpmnSiblings.length === 0) return null;
        return (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Linked Diagram</label>
          {(() => {
            const linkedId = element.properties.linkedDiagramId as string | undefined;
            const linkedExists = linkedId ? bpmnSiblings.some(d => d.id === linkedId) : true;
            return (
              <>
                <select
                  value={linkedId ?? ""}
                  onChange={(e) => onUpdateProperties(element.id, {
                    linkedDiagramId: e.target.value || null,
                  })}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); (e.target as HTMLSelectElement).focus(); }}
                >
                  <option value="">None</option>
                  {bpmnSiblings.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {linkedId && !linkedExists && (
                  <p className="text-[10px] text-red-500 mt-1">Linked diagram not found — it may have been deleted</p>
                )}
                {linkedId && linkedExists && (
                  <p className="text-[10px] text-gray-400 mt-1">Double-click to drill into linked diagram</p>
                )}
              </>
            );
          })()}
        </div>
        );
      })()}

      {element.type === "archimate-shape" && typeof element.properties.shapeKey === "string" && (() => {
        const shapeKey = element.properties.shapeKey as string;
        const cat = getCachedCatalogue();
        const entry = findShapeByKey(shapeKey);
        const stop = { onMouseDown: (e: React.MouseEvent) => e.stopPropagation() };
        if (!cat || !entry) {
          // Catalogue not loaded yet — show the raw key so the panel still informs.
          return <div><p className="text-xs text-gray-600">Type: {shapeKey}</p></div>;
        }
        const layer = cat.categories.find(c => c.id === entry.category);
        // Build the Type list the SAME way the ArchiMate palette does
        // (Palette.tsx): one entry per concept name (box preferred), with a
        // separate "(icon)" entry ONLY for the three concepts that surface a
        // compact icon form. Keeps the dropdown identical to the palette.
        const ICON_AS_SEPARATE = new Set(["Business Actor", "Business Service", "Business Event"]);
        const byName = new Map<string, { primary: ArchimateShapeEntry; iconCounterpart?: ArchimateShapeEntry }>();
        for (const s of layer?.shapes ?? []) {
          const ex = byName.get(s.name);
          if (!ex) byName.set(s.name, { primary: s });
          else if (ex.primary.variant === "icon" && s.variant === "box") byName.set(s.name, { primary: s, iconCounterpart: ex.primary });
          else if (ex.primary.variant === "box" && s.variant === "icon") byName.set(s.name, { primary: ex.primary, iconCounterpart: s });
        }
        const typeItems: { key: string; label: string; iconOnly: boolean }[] = [];
        for (const [name, pair] of byName) {
          typeItems.push({ key: pair.primary.key, label: name, iconOnly: false });
          if (pair.iconCounterpart && ICON_AS_SEPARATE.has(name)) {
            typeItems.push({ key: pair.iconCounterpart.key, label: `${name} (icon)`, iconOnly: true });
          }
        }
        return (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Layer</label>
              <select
                value={entry.category}
                onChange={(e) => {
                  const first = cat.categories.find(c => c.id === e.target.value)?.shapes.find(s => s.variant === "box")
                    ?? cat.categories.find(c => c.id === e.target.value)?.shapes[0];
                  if (first) onUpdateProperties(element.id, { shapeKey: first.key, archimateIconOnly: false });
                }}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
                {...stop}
              >
                {cat.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={shapeKey}
                onChange={(e) => {
                  const it = typeItems.find(i => i.key === e.target.value);
                  onUpdateProperties(element.id, { shapeKey: e.target.value, archimateIconOnly: it?.iconOnly ?? false });
                }}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
                {...stop}
              >
                {typeItems.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
              </select>
            </div>
          </>
        );
      })()}

      {element.type === "archimate-shape" && siblingDiagrams &&
        typeof element.properties.shapeKey === "string" &&
        (element.properties.shapeKey as string).includes("business-process") && (() => {
        const bpmnSiblings = siblingDiagrams.filter(d => d.type === "bpmn");
        if (bpmnSiblings.length === 0) return null;
        return (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Linked BPMN Process</label>
          {(() => {
            const linkedId = element.properties.linkedDiagramId as string | undefined;
            const linkedExists = linkedId ? bpmnSiblings.some(d => d.id === linkedId) : true;
            return (
              <>
                <select
                  value={linkedId ?? ""}
                  onChange={(e) => onUpdateProperties(element.id, {
                    linkedDiagramId: e.target.value || null,
                  })}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); (e.target as HTMLSelectElement).focus(); }}
                >
                  <option value="">None</option>
                  {bpmnSiblings.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {linkedId && !linkedExists && (
                  <p className="text-[10px] text-red-500 mt-1">Linked diagram not found — it may have been deleted</p>
                )}
                {linkedId && linkedExists && (
                  <p className="text-[10px] text-gray-400 mt-1">Marker is green when linked — double-click to drill into the BPMN process</p>
                )}
              </>
            );
          })()}
        </div>
        );
      })()}

      {element.type === "submachine" && siblingDiagrams && (() => {
        const smSiblings = siblingDiagrams.filter(d => d.type === "state-machine");
        return (
        <div>
          <label className="text-[10px] text-gray-500">Linked Diagram</label>
          {(() => {
            const linkedId = element.properties.linkedDiagramId as string | undefined;
            const linkedExists = linkedId ? smSiblings.some(d => d.id === linkedId) : true;
            return (
              <>
                <select
                  value={linkedId ?? ""}
                  onChange={(e) => onUpdateProperties(element.id, {
                    linkedDiagramId: e.target.value || null,
                  })}
                  className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700 cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); (e.target as HTMLSelectElement).focus(); }}
                >
                  <option value="">None</option>
                  {smSiblings.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {linkedId && !linkedExists && (
                  <p className="text-[10px] text-red-500 mt-0.5">Linked diagram not found</p>
                )}
                {linkedId && linkedExists && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Double-click marker to drill in</p>
                )}
              </>
            );
          })()}
        </div>
        );
      })()}

      {element.type === "chevron-collapsed" && siblingDiagrams && (() => {
        const vcSiblings = siblingDiagrams.filter(d => d.type === "value-chain" || d.type === "bpmn");
        return (
        <div>
          <label className="text-[10px] text-gray-500">Linked Diagram</label>
          {(() => {
            const linkedId = element.properties.linkedDiagramId as string | undefined;
            const linkedExists = linkedId ? vcSiblings.some(d => d.id === linkedId) : true;
            return (
              <>
                <select
                  value={linkedId ?? ""}
                  onChange={(e) => onUpdateProperties(element.id, { linkedDiagramId: e.target.value || null })}
                  className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700 cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); (e.target as HTMLSelectElement).focus(); }}
                >
                  <option value="">None</option>
                  {vcSiblings.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.type === "bpmn" ? "BPMN" : "Value Chain"})</option>
                  ))}
                </select>
                {linkedId && !linkedExists && (
                  <p className="text-[10px] text-red-500 mt-0.5">Linked diagram not found</p>
                )}
                {linkedId && linkedExists && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Double-click marker to drill in</p>
                )}
              </>
            );
          })()}
        </div>
        );
      })()}

      {/* Process Context central process (use-case) → detailed BPMN. Lets
          a Process Context diagram act as a bundle root that links down to
          detailed processes, like a Value Chain chevron. */}
      {element.type === "use-case" && diagramType === "process-context" && siblingDiagrams && (() => {
        const bpmnSiblings = siblingDiagrams.filter(d => d.type === "bpmn");
        if (bpmnSiblings.length === 0) return null;
        const linkedId = element.properties.linkedDiagramId as string | undefined;
        const linkedExists = linkedId ? bpmnSiblings.some(d => d.id === linkedId) : true;
        return (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Linked Diagram</label>
            <select
              value={linkedId ?? ""}
              onChange={(e) => onUpdateProperties(element.id, { linkedDiagramId: e.target.value || null })}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 cursor-pointer"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); (e.target as HTMLSelectElement).focus(); }}
            >
              <option value="">None</option>
              {bpmnSiblings.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {linkedId && !linkedExists && (
              <p className="text-[10px] text-red-500 mt-1">Linked diagram not found — it may have been deleted</p>
            )}
            {linkedId && linkedExists && (
              <p className="text-[10px] text-gray-400 mt-1">Double-click to drill into linked diagram</p>
            )}
          </div>
        );
      })()}

      {/* Description for process elements */}
      {(element.type === "chevron" || element.type === "chevron-collapsed") && (
        <>
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">Description</label>
            <RichTextEditor
              key={`desc-${element.id}`}
              value={(element.properties.description as string | undefined) ?? ""}
              onChange={(html) => onUpdateProperties(element.id, { description: html || undefined })}
            />
          </div>
          <label className="flex items-center gap-1 text-[10px] text-gray-700">
            <input type="checkbox"
              checked={!!element.properties.showDescription}
              onChange={(e) => onUpdateProperties(element.id, { showDescription: e.target.checked })}
              className="w-3 h-3"
            />
            Show description
          </label>
        </>
      )}

      {/* Process ↔ Collapsed Process conversion */}
      {element.type === "chevron" && diagramType === "value-chain" && onConvertProcessCollapsed && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Convert</label>
          <button onClick={() => onConvertProcessCollapsed(element.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border text-blue-600 border-blue-300 hover:bg-blue-50">
            → Collapsed Process
          </button>
        </div>
      )}

      {element.type === "chevron-collapsed" && diagramType === "value-chain" && onConvertProcessCollapsed && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Convert</label>
          <button onClick={() => onConvertProcessCollapsed(element.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border text-blue-600 border-blue-300 hover:bg-blue-50">
            → Process
          </button>
        </div>
      )}

      {/* Fill colour for value chain elements */}
      {diagramType === "value-chain" && (element.type === "chevron" || element.type === "chevron-collapsed" || element.type === "process-group") && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Colour</label>
          <input
            type="color"
            value={(element.properties.fillColor as string | undefined) ?? "#fbd7bb"}
            onChange={(e) => onUpdateProperties(element.id, { fillColor: e.target.value })}
            className="w-6 h-6 border border-gray-300 rounded cursor-pointer p-0"
          />
          <span className="text-[9px] text-gray-400 font-mono">{(element.properties.fillColor as string | undefined) ?? "default"}</span>
          {!!(element.properties.fillColor as string | undefined) && (
            <button
              onClick={() => onUpdateProperties(element.id, { fillColor: undefined })}
              className="text-[9px] text-gray-400 hover:text-red-500 ml-auto"
              title="Reset to default"
            >Reset</button>
          )}
        </div>
      )}

      {(element.type === "task" || element.type === "subprocess" || element.type === "subprocess-expanded") && (
        <>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Repeat</label>
          <select
            value={element.repeatType ?? "none"}
            onChange={(e) => onUpdateProperties(element.id, { repeatType: e.target.value })}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            <option value="none">None</option>
            <option value="loop">Loop</option>
            <option value="mi-sequential">MI Sequential</option>
            <option value="mi-parallel">MI Parallel</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Value</label>
          <select
            value={(element.properties.valueAnalysis as string | undefined) ?? "none"}
            onChange={(e) => onUpdateProperties(element.id, { valueAnalysis: e.target.value })}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            <option value="none">None</option>
            <option value="VA">VA — Value Adding</option>
            <option value="NNVA">NNVA — Non-Value Adding (Necessary)</option>
            <option value="NVA">NVA — Non-Value Adding</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">CT / WT</label>
          <input type="number" min={0} step="any"
            value={(element.properties.cycleTime as number | undefined) ?? ""}
            onChange={(e) => onUpdateProperties(element.id, { cycleTime: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="CT" title="Cycle Time"
            className="w-14 text-[10px] border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-blue-400"
          />
          <input type="number" min={0} step="any"
            value={(element.properties.waitTime as number | undefined) ?? ""}
            onChange={(e) => onUpdateProperties(element.id, { waitTime: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="WT" title="Wait Time"
            className="w-14 text-[10px] border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-blue-400"
          />
          <select
            value={(element.properties.timeUnit as string | undefined) ?? "none"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "other") {
                onUpdateProperties(element.id, { timeUnit: "other", timeUnitCustom: element.properties.timeUnitCustom ?? "" });
              } else {
                onUpdateProperties(element.id, { timeUnit: v, timeUnitCustom: undefined });
              }
            }}
            className="text-[10px] border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-blue-400"
          >
            <option value="none">--</option>
            <option value="sec">sec</option>
            <option value="min">min</option>
            <option value="hrs">hrs</option>
            <option value="days">days</option>
            <option value="other">other</option>
          </select>
          {(element.properties.timeUnit as string) === "other" && (
            <input type="text"
              value={(element.properties.timeUnitCustom as string | undefined) ?? ""}
              onChange={(e) => onUpdateProperties(element.id, { timeUnitCustom: e.target.value })}
              placeholder="unit"
              className="w-12 text-[10px] border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-blue-400"
            />
          )}
        </div>
        </>
      )}

      {element.type === "gateway" && diagramType !== "state-machine" && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Gateway Type</label>
          <select
            value={element.gatewayType ?? "none"}
            onChange={(e) => onUpdateProperties(element.id, { gatewayType: e.target.value })}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            {GATEWAY_TYPE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {element.type === "gateway" && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Role</label>
          <select
            value={(element.properties.gatewayRole as string | undefined) ?? "decision"}
            onChange={(e) => onUpdateProperties(element.id, { gatewayRole: e.target.value })}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
          >
            <option value="decision">Decision</option>
            <option value="merge">Merge</option>
          </select>
        </div>
      )}

      {(element.type === "fork-join" || element.type === "flowchart-parallel") && onFlipForkJoin && (
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Orient.</label>
          <button
            onClick={() => onFlipForkJoin(element.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
          >
            {element.height >= element.width ? "→ Horizontal" : "→ Vertical"}
          </button>
        </div>
      )}

      {isEventElement && onConvertEventType && diagramType === "bpmn" && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Event Type</label>
          <select
            value={element.type}
            onChange={(e) => onConvertEventType(element.id, e.target.value as "start-event" | "intermediate-event" | "end-event")}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-400"
          >
            <option value="start-event">Start</option>
            <option value="intermediate-event">Intermediate</option>
            <option value="end-event">End</option>
          </select>
        </div>
      )}

      {isEventElement && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Trigger</label>
          <select
            value={element.eventType ?? "none"}
            onChange={(e) => onUpdateProperties(element.id, { eventType: e.target.value })}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-400"
          >
            {TRIGGER_OPTIONS
              .filter(o => {
                if (element.type !== "end-event" && o.value === "terminate") return false;
                if (element.type === "end-event" && (o.value === "timer" || o.value === "conditional")) return false;
                if (element.type !== "intermediate-event" && o.value === "link") return false;
                return true;
              })
              .map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
          </select>
        </div>
      )}

      {(element.type === "start-event" || element.type === "intermediate-event") && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Interruption</label>
          <select
            value={(element.properties.interruptionType as string | undefined) ?? "interrupting"}
            onChange={(e) => onUpdateProperties(element.id, { interruptionType: e.target.value })}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-400"
          >
            <option value="interrupting">Interrupting</option>
            <option value="non-interrupting">Non-Interrupting</option>
          </select>
        </div>
      )}

      {isEventElement && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Flow Type</label>
          {hasMessageBpmnConnection && (
            <p className="text-xs text-gray-400 mb-1">Cannot change while messageBPMN connections exist</p>
          )}
          <select
            value={element.flowType ?? "none"}
            disabled={hasMessageBpmnConnection}
            onChange={(e) => { if (!hasMessageBpmnConnection) onUpdateProperties(element.id, { flowType: e.target.value }); }}
            className={`w-full text-xs border rounded px-2 py-1 outline-none ${
              hasMessageBpmnConnection
                ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                : "border-gray-300 focus:border-blue-400"
            }`}
          >
            {FLOW_TYPE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {isEventElement && diagramType === "bpmn" && onSetEventBoundary && (() => {
        const isMounted = !!element.boundaryHostId;
        // Tighter snap threshold for the Properties-panel re-mount than
        // the 25 px used during drag (user spec: 15 px). This makes
        // re-checking the box only succeed when the event is already
        // visually next to a host edge — far-away events stay free.
        const SNAP_THRESHOLD = 15;
        const HOST_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);
        // Find nearest valid host within snap range — used when the
        // user re-checks the box on a free-floating event.
        function nearestHostId(): string | null {
          if (!allElements || !element) return null;
          const cx = element.x + element.width / 2;
          const cy = element.y + element.height / 2;
          let bestId: string | null = null;
          let bestDist = SNAP_THRESHOLD;
          for (const h of allElements) {
            if (!HOST_TYPES.has(h.type)) continue;
            // closest point on the host's bounding rect
            const px = Math.max(h.x, Math.min(h.x + h.width, cx));
            const py = Math.max(h.y, Math.min(h.y + h.height, cy));
            const d = Math.hypot(px - cx, py - cy);
            if (d < bestDist) { bestDist = d; bestId = h.id; }
          }
          return bestId;
        }
        return (
          <div>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer" title="When checked, the event is mounted to the boundary of a Task / Subprocess / EP. Uncheck to detach and move it elsewhere on the diagram.">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={isMounted}
                onChange={(e) => {
                  if (e.target.checked) {
                    const hid = nearestHostId();
                    if (hid) onSetEventBoundary(element.id, hid);
                    // No nearby host → no-op; the controlled checkbox
                    // will revert on the next render.
                  } else {
                    onSetEventBoundary(element.id, null);
                  }
                }}
              />
              <span>Edge-mounted</span>
            </label>
            {!isMounted && (
              <p className="text-[10px] text-gray-500 mt-0.5">
                Drag the event onto the edge of a Task, Subprocess, or
                Expanded Subprocess to mount it (auto-checks the box).
              </p>
            )}
          </div>
        );
      })()}


      {/* Outgoing connectors list (debug mode only) */}
      {debugMode && diagramType !== "process-context" && allConnectors && allElements && (() => {
        const outgoing = allConnectors.filter(c => c.sourceId === element.id);
        return (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Outgoing Connectors</p>
            {outgoing.length === 0 ? (
              <p className="text-xs text-gray-400">None</p>
            ) : (
              <ul className="text-xs text-gray-600 space-y-0.5">
                {outgoing.map(c => {
                  const target = allElements.find(e => e.id === c.targetId);
                  return (
                    <li key={c.id}>
                      <span className="text-gray-500">{c.type}</span> → {target?.label || "?"}
                      {debugMode && <span className="text-gray-300 font-mono text-[9px]"> [{c.id}]</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })()}

      {/* Incoming connectors list (debug mode only) */}
      {debugMode && diagramType !== "process-context" && allConnectors && allElements && (() => {
        const incoming = allConnectors.filter(c => c.targetId === element.id);
        return (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Incoming Connectors</p>
            {incoming.length === 0 ? (
              <p className="text-xs text-gray-400">None</p>
            ) : (
              <ul className="text-xs text-gray-600 space-y-0.5">
                {incoming.map(c => {
                  const source = allElements.find(e => e.id === c.sourceId);
                  return (
                    <li key={c.id}>
                      {source?.label || "?"} → <span className="text-gray-500">{c.type}</span>
                      {debugMode && <span className="text-gray-300 font-mono text-[9px]"> [{c.id}]</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })()}

      {/* Stereotype for UML Class and Enumeration */}
      {(element.type === "uml-class" || element.type === "uml-enumeration") && onUpdateProperties && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-gray-500 w-16 shrink-0">Stereotype</label>
            <input type="text"
              className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"
              defaultValue={(element.properties.stereotype as string | undefined) ?? (element.type === "uml-class" ? "entity" : "enumeration")}
              key={`stereo-${element.id}`}
              onBlur={e => onUpdateProperties(element.id, { stereotype: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          {element.type === "uml-class" && (
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-gray-500 w-16 shrink-0">Show</label>
              <button
                onClick={() => onUpdateProperties(element.id, { showStereotype: !((element.properties.showStereotype as boolean | undefined) ?? false) })}
                className={`px-2 py-0 text-[10px] rounded border ${
                  (element.properties.showStereotype as boolean | undefined) ?? false
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-300"
                }`}
              >{(element.properties.showStereotype as boolean | undefined) ?? false ? "On" : "Off"}</button>
            </div>
          )}
        </div>
      )}

      {/* UML Class: Attributes and Operations compartments */}
      {element.type === "uml-class" && onUpdateProperties && (
        <>
          <div className="flex items-center gap-2 border-t border-gray-100 pt-1">
            <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={(element.properties.showAttributes as boolean | undefined) ?? false}
                onChange={e => onUpdateProperties(element.id, { showAttributes: e.target.checked })}
                className="w-3 h-3" /> Attributes
            </label>
            <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={(element.properties.showOperations as boolean | undefined) ?? false}
                onChange={e => onUpdateProperties(element.id, { showOperations: e.target.checked })}
                className="w-3 h-3" /> Operations
            </label>
          </div>
          {((element.properties.showAttributes as boolean | undefined) ?? false) && (
            <ClassAttributesList element={element} onUpdateProperties={onUpdateProperties} database={database} />
          )}
          {((element.properties.showOperations as boolean | undefined) ?? false) && (
            <ClassOperationsList element={element} onUpdateProperties={onUpdateProperties} />
          )}
        </>
      )}

      {/* Enumeration Values List */}
      {element.type === "uml-enumeration" && onUpdateProperties && (
        <EnumValuesList element={element} onUpdateProperties={onUpdateProperties} />
      )}

      {element.type === "pool" ? (
        poolHasContent ? (
          <div>
            <p className="text-xs text-orange-600 mb-1">Remove all lanes and elements first</p>
            <button
              disabled
              className="w-full px-3 py-1.5 text-xs bg-gray-50 text-gray-400 border border-gray-200 rounded cursor-not-allowed"
            >
              Delete pool
            </button>
          </div>
        ) : (
          <button
            onClick={() => onDeleteElement(element.id)}
            className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
          >
            Delete pool
          </button>
        )
      ) : element.type === "lane" ? (
        // Non-empty lanes can be deleted: the adjacent sibling lane
        // absorbs the freed vertical slice, every element keeps its
        // (x, y) and connectors stay attached. No need to evacuate the
        // lane first. Sub-lanes (a lane whose parent is itself a lane)
        // get the "Delete Sublane" label so the user knows the scope.
        (() => {
          const parent = element.parentId
            ? allElements?.find(e => e.id === element.parentId)
            : undefined;
          const isSublane = parent?.type === "lane";
          const verb = isSublane ? "Delete sublane" : "Delete lane";
          return (
            <button
              onClick={() => onDeleteElement(element.id)}
              className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
              title={laneHasContent
                ? "Elements stay where they are; the adjacent " + (isSublane ? "sublane" : "lane") + " absorbs this " + (isSublane ? "sublane" : "lane") + "'s space"
                : "Delete this empty " + (isSublane ? "sublane" : "lane")}
            >
              {verb}
            </button>
          );
        })()
      ) : (
        <button
          onClick={() => onDeleteElement(element.id)}
          className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
        >
          Delete element
        </button>
      )}
    </div>}

    {poolTypeConfirm && (
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-base font-semibold text-gray-900">Change to White-box?</h2>
            <p className="mt-1 text-sm text-gray-600">
              This pool has {poolTypeConfirm.messageIds.length} message connector{poolTypeConfirm.messageIds.length === 1 ? "" : "s"} attached.
              White-box pools can&rsquo;t have message connectors — continuing will delete {poolTypeConfirm.messageIds.length === 1 ? "it" : "them"}.
            </p>
          </div>
          <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
            <button
              onClick={() => setPoolTypeConfirm(null)}
              className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                for (const id of poolTypeConfirm.messageIds) onDeleteConnector(id);
                onUpdateProperties(poolTypeConfirm.poolId, { poolType: "white-box" });
                setPoolTypeConfirm(null);
              }}
              className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700"
              autoFocus
            >
              Delete &amp; Change
            </button>
          </div>
        </div>
      </div>
    )}
      <SimulationSection element={element} onUpdateProperties={onUpdateProperties} />
      <RiskControlSection element={element} catalog={riskCatalog ?? []} onUpdateProperties={onUpdateProperties} onCreate={onCreateRiskItem} open={rcSectionOpen} onToggle={onRcSectionToggle} />
    </div>
  );
}
