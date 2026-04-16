"use client";

import { useState, useEffect } from "react";
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

interface Props {
  element: DiagramElement | null;
  connector: Connector | null;
  diagramType?: DiagramType;
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
  onDeleteElement: (id: string) => void;
  onDeleteConnector: (id: string) => void;
  onUpdateConnectorDirection: (id: string, directionType: DirectionType) => void;
  onUpdateConnectorType?: (id: string, connectorType: ConnectorType) => void;
  onReverseConnector?: (id: string) => void;
  onUpdateConnectorLabel?: (id: string, label: string) => void;
  onAddLane?: (poolId: string) => void;
  onAddSublane?: (laneId: string) => void;
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
  onFlipForkJoin?: (id: string) => void;
  onConvertTaskSubprocess?: (id: string) => void;
  onConvertProcessCollapsed?: (id: string) => void;
  onConvertEventType?: (id: string, newEventType: "start-event" | "intermediate-event" | "end-event") => void;
  database?: string;
  onSetDatabase?: (db: string) => void;
  forceCollapseTitle?: boolean;
}

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

export function PropertiesPanel({
  element,
  connector,
  diagramType,
  onUpdateLabel,
  onUpdateProperties,
  onDeleteElement,
  onDeleteConnector,
  onUpdateConnectorDirection,
  onUpdateConnectorType,
  onReverseConnector,
  onUpdateConnectorLabel,
  onAddLane,
  onAddSublane,
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
  onFlipForkJoin,
  onConvertTaskSubprocess,
  onConvertProcessCollapsed,
  onConvertEventType,
  database,
  onSetDatabase,
  forceCollapseTitle,
}: Props) {
  const [labelDraft, setLabelDraft] = useState("");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [titleOpen, setTitleOpen] = useState(true);
  const [connectorOpen, setConnectorOpen] = useState(true);
  const [propsOpen, setPropsOpen] = useState(true);

  useEffect(() => {
    if (element) setLabelDraft(element.label);
  }, [element]);

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
          {connector ? "Connector" : element ? "Properties" : "Title"}
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

  // Compact inline row: label + value on same line
  function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex items-center gap-1">
        <label className="text-[9px] text-gray-500 whitespace-nowrap w-12 shrink-0">{label}</label>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  // Diagram Title section content
  function TitleSection() {
    if (!onUpdateDiagramTitle) return null;
    return (
      <div className="pb-0.5">
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
        {onSetDatabase && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[9px] text-gray-500 w-12 shrink-0">Database</span>
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
        <InlineField label="Name">
          <span className="text-[9px] text-gray-600 truncate">{diagramName ?? ""}</span>
        </InlineField>
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
      </div>
    );
  }

  if (multiSelectionCount && multiSelectionCount > 1) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-2 overflow-y-auto relative">
        <CollapseButton />
        <SectionHeader label="Diagram Title" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && <TitleSection />}
        <p className="text-xs text-gray-500 font-medium mt-2">{multiSelectionCount} elements selected</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Drag any selected element to move the group</p>
      </div>
    );
  }

  if (!element && !connector) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-2 overflow-y-auto relative">
        <CollapseButton />
        <SectionHeader label="Diagram Title" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && <TitleSection />}
        <p className="text-[10px] text-gray-400 mt-2">Select an element to see properties</p>
      </div>
    );
  }

  if (connector) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-2 overflow-y-auto relative">
        <CollapseButton />
        <SectionHeader label="Diagram Title" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && <TitleSection />}
        <SectionHeader label="Connector" open={connectorOpen} onToggle={() => setConnectorOpen(!connectorOpen)} />
        {connectorOpen && <div className="space-y-1.5">
        <div>
          <p className="text-xs text-gray-600">Type: {connector.type}</p>
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
          return (
            <>
              {/* Relationship, Name, Reading Direction, Navigability — compact group */}
              {isUmlConn && (() => {
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
          const showDirection = connector.type !== "messageBPMN" &&
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
    <div className="w-56 border-l border-gray-200 bg-white p-3 overflow-y-auto relative">
      <CollapseButton />
      <SectionHeader label="Diagram Title" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
      {titleOpen && <TitleSection />}
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
          {element.type === "uml-class" || element.type === "uml-enumeration" ? "Name" : "Label"}
        </label>
        {(element.type === "gateway" || isEventElement ||
          element.type === "data-object" || element.type === "data-store" ||
          element.type === "task" || element.type === "subprocess" ||
          element.type === "subprocess-expanded" || element.type === "use-case" ||
          element.type === "external-entity" || element.type === "process-system" ||
          element.type === "uml-class" || element.type === "uml-enumeration" ||
          element.type === "text-annotation" ||
          element.type === "chevron" || element.type === "chevron-collapsed" ||
          element.type === "pool" || element.type === "lane") ? (
            <textarea
              key={element.id}
              data-properties-label="true"
              className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y overflow-y-auto"
              rows={element.type === "chevron" || element.type === "chevron-collapsed" ? 3 : 2}
              value={labelDraft}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                let val = e.target.value;
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
          <input
            type="text"
            data-properties-label="true"
            value={labelDraft}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => { if (labelDraft !== element.label) onUpdateLabel(element.id, labelDraft); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onUpdateLabel(element.id, labelDraft);
            }}
            className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
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

      {element.type === "pool" && (
        <>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Type</label>
            <select
              value={(element.properties.poolType as string | undefined) ?? "black-box"}
              onChange={(e) => onUpdateProperties(element.id, { poolType: e.target.value })}
              className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-700"
            >
              <option value="black-box">Black-box</option>
              <option value="white-box">White-box</option>
            </select>
          </div>
          {((element.properties.poolType as string | undefined) ?? "black-box") === "black-box" && (
            <label className="flex items-center gap-1 text-[10px] text-gray-700">
              <input type="checkbox"
                checked={!!element.properties.isSystem}
                onChange={(e) => onUpdateProperties(element.id, { isSystem: e.target.checked })}
                className="w-3 h-3" />
              System (IT application / database)
            </label>
          )}
          {onAddLane && (element.properties.poolType === "white-box") && (
            <button onClick={() => onAddLane(element.id)}
              className="w-full px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
              + Add Lane
            </button>
          )}
        </>
      )}

      {element.type === "lane" && onAddSublane && (
        <button onClick={() => onAddSublane(element.id)}
          className="w-full px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
          + Add Sublane
        </button>
      )}

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

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Multiplicity</label>
            <div className="flex flex-wrap gap-1">
              {(["single", "collection"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onUpdateProperties(element.id, { multiplicity: v })}
                  className={`px-2 py-1 text-xs rounded border ${
                    ((element.properties.multiplicity as string | undefined) ?? "single") === v
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {v === "single" ? "Single" : "Collection"}
                </button>
              ))}
            </div>
          </div>
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
            <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Type</label>
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

      {/* Description for process elements */}
      {(element.type === "chevron" || element.type === "chevron-collapsed") && (
        <>
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">Description <span className="text-gray-400">(Shift+Enter for new line)</span></label>
            <textarea
              key={`desc-${element.id}`}
              className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-1 resize-none leading-[13px]"
              rows={7}
              style={{ wordWrap: "break-word", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
              defaultValue={(element.properties.description as string | undefined) ?? ""}
              onBlur={(e) => onUpdateProperties(element.id, { description: e.target.value || undefined })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
                // Shift+Enter inserts a newline (default browser behaviour)
              }}
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
          <label className="text-[10px] text-gray-500 whitespace-nowrap w-14 shrink-0">Type</label>
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

      {element.type === "fork-join" && onFlipForkJoin && (
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
        laneHasContent ? (
          <div>
            <p className="text-xs text-orange-600 mb-1">Remove all elements from this lane first</p>
            <button
              disabled
              className="w-full px-3 py-1.5 text-xs bg-gray-50 text-gray-400 border border-gray-200 rounded cursor-not-allowed"
            >
              Delete lane
            </button>
          </div>
        ) : (
          <button
            onClick={() => onDeleteElement(element.id)}
            className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
          >
            Delete lane
          </button>
        )
      ) : (
        <button
          onClick={() => onDeleteElement(element.id)}
          className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
        >
          Delete element
        </button>
      )}
    </div>}
    </div>
  );
}
