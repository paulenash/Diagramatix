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

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
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
}: Props) {
  const [labelDraft, setLabelDraft] = useState("");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [titleOpen, setTitleOpen] = useState(true);
  const [connectorOpen, setConnectorOpen] = useState(true);
  const [propsOpen, setPropsOpen] = useState(true);

  useEffect(() => {
    if (element) setLabelDraft(element.label);
  }, [element]);

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
      <div className="flex items-center gap-1.5 mb-0.5">
        <label className="text-[10px] text-gray-500 whitespace-nowrap w-16 shrink-0">{label}</label>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  // Diagram Title section content
  function TitleSection() {
    if (!onUpdateDiagramTitle) return null;
    return (
      <div className="space-y-0.5 pb-1">
        <InlineField label="Show">
          <button
            onClick={() => onUpdateDiagramTitle({ ...diagramTitle, showTitle: !(diagramTitle?.showTitle ?? false) })}
            className={`px-2 py-0 text-[10px] rounded border ${
              diagramTitle?.showTitle ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300"
            }`}
          >{diagramTitle?.showTitle ? "On" : "Off"}</button>
        </InlineField>
        <InlineField label="Name">
          <input readOnly className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0 bg-gray-50 text-gray-500" value={diagramName ?? ""} />
        </InlineField>
        <InlineField label="Version">
          <input type="text" className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-0"
            defaultValue={diagramTitle?.version ?? ""} key={`ver-${diagramName}`}
            onBlur={(e) => onUpdateDiagramTitle({ ...diagramTitle, version: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </InlineField>
        <InlineField label="Authors">
          <textarea className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-0 resize-y" rows={1}
            defaultValue={diagramTitle?.authors ?? ""} key={`auth-${diagramName}`}
            onBlur={(e) => onUpdateDiagramTitle({ ...diagramTitle, authors: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
          />
        </InlineField>
        <InlineField label="Status">
          <select
            value={diagramTitle?.status ?? "draft"}
            onChange={e => onUpdateDiagramTitle({ ...diagramTitle, status: e.target.value as DiagramStatus })}
            className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
          >
            {(["draft", "final", "production"] as DiagramStatus[]).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </InlineField>
        <InlineField label="Created">
          <span className="text-[10px] text-gray-500">{createdAt ? new Date(createdAt).toLocaleDateString() : ""}</span>
        </InlineField>
        <InlineField label="Modified">
          <span className="text-[10px] text-gray-500">{updatedAt ? new Date(updatedAt).toLocaleString() : ""}</span>
        </InlineField>
      </div>
    );
  }

  if (multiSelectionCount && multiSelectionCount > 1) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-3 overflow-y-auto relative">
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
      <div className="w-56 border-l border-gray-200 bg-white p-3 overflow-y-auto relative">
        <CollapseButton />
        <SectionHeader label="Diagram Title" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && <TitleSection />}
        <p className="text-[10px] text-gray-400 mt-2">Select an element to see properties</p>
      </div>
    );
  }

  if (connector) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-3 overflow-y-auto relative">
        <CollapseButton />
        <SectionHeader label="Diagram Title" open={titleOpen} onToggle={() => setTitleOpen(!titleOpen)} />
        {titleOpen && <TitleSection />}
        <SectionHeader label="Connector" open={connectorOpen} onToggle={() => setConnectorOpen(!connectorOpen)} />
        {connectorOpen && <div className="space-y-2">
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
              {/* Relationship type */}
              {isUmlConn && (() => {
                const opts = [
                  { value: "uml-association" as ConnectorType, label: "Association" },
                  { value: "uml-aggregation" as ConnectorType, label: "Aggregation" },
                  { value: "uml-composition" as ConnectorType, label: "Composition" },
                  { value: "uml-generalisation" as ConnectorType, label: "Generalisation" },
                ];
                const currentLabel = opts.find(o => o.value === connector.type)?.label ?? connector.type;
                if (isClassEnumConn) {
                  return <p className="text-xs text-gray-700"><span className="font-medium">Relationship:</span> Association</p>;
                }
                return (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium text-gray-500 shrink-0">Relationship:</span>
                    <select
                      value={connector.type}
                      onChange={e => onUpdateConnectorType?.(connector.id, e.target.value as ConnectorType)}
                      className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
                    >
                      {opts.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
              {/* Direction — hidden for Class↔Enumeration */}
              {connector.type === "uml-association" && !isClassEnumConn && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-gray-500 shrink-0">Direction:</span>
                  <select
                    value={connector.directionType}
                    onChange={e => onUpdateConnectorDirection(connector.id, e.target.value as DirectionType)}
                    className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
                  >
                    <option value="non-directed">None</option>
                    <option value="open-directed">Open</option>
                  </select>
                </div>
              )}
            </>
          );
        })()}
        {/* Reverse button for aggregation/composition/generalisation, and association when directed */}
        {((connector.type === "uml-aggregation" || connector.type === "uml-composition" ||
          connector.type === "uml-generalisation") ||
          (connector.type === "uml-association" && connector.directionType !== "non-directed")) && onReverseConnector && (
          <button
            onClick={() => onReverseConnector(connector.id)}
            className="w-full px-3 py-1.5 text-xs bg-gray-50 text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
          >
            Reverse Direction
          </button>
        )}
        {/* UML association name */}
        {(connector.type === "uml-association" || connector.type === "uml-aggregation" ||
          connector.type === "uml-composition") && onUpdateConnectorFields && (
          <div className="space-y-1 border-t border-gray-100 pt-1.5">
            <div className="flex items-center gap-1">
              <label className="text-[9px] text-gray-400 w-12 shrink-0">Name</label>
              <input type="text" className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0 min-w-0"
                defaultValue={connector.associationName ?? ""} key={`an-${connector.id}`}
                onBlur={e => onUpdateConnectorFields(connector.id, { associationName: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="association name" />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[9px] text-gray-400 w-12 shrink-0">Reading Direction</label>
              <select
                value={connector.readingDirection ?? "none"}
                onChange={e => onUpdateConnectorFields(connector.id, { readingDirection: e.target.value as "none" | "to-source" | "to-target" })}
                className="text-[10px] border border-gray-300 rounded px-1 py-0 bg-white text-gray-700 cursor-pointer font-medium"
              >
                <option value="none">None</option>
                <option value="to-source">{"\u25C0"} Source</option>
                <option value="to-target">Target {"\u25B6"}</option>
              </select>
            </div>
          </div>
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
                      <option value="+">+</option>
                      <option value="-">-</option>
                      <option value="#">#</option>
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
                      <option value="+">+</option>
                      <option value="-">-</option>
                      <option value="#">#</option>
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
          const showDirection = connector.type !== "messageBPMN" &&
            connector.type !== "uml-association" && connector.type !== "uml-aggregation" &&
            connector.type !== "uml-composition" && connector.type !== "uml-generalisation" &&
            (connector.type === "associationBPMN" || isAssocPC ||
            (connector.type !== "sequence" && connector.type !== "transition" && connector.type !== "flow") ||
            connector.routingType === "direct");
          if (!showDirection) return null;
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
            : connector.type === "associationBPMN"
              ? [
                  { value: "non-directed"  as DirectionType, label: "None"     },
                  { value: "open-directed" as DirectionType, label: "Directed" },
                  { value: "both"          as DirectionType, label: "Both"     },
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
                    onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
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
              onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
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
      {propsOpen && <div className="space-y-2">
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
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Label
        </label>
        {(element.type === "gateway" || isEventElement ||
          element.type === "data-object" || element.type === "data-store" ||
          element.type === "task" || element.type === "subprocess" ||
          element.type === "subprocess-expanded" || element.type === "use-case" ||
          element.type === "external-entity" || element.type === "process-system" ||
          element.type === "uml-class" || element.type === "uml-enumeration") ? (
          <>
            <textarea
              key={element.id}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              rows={3}
              value={labelDraft}
              onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => onUpdateLabel(element.id, labelDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onUpdateLabel(element.id, labelDraft);
                }
              }}
            />
            <p className="text-xs text-gray-400 mt-0.5">Shift+Enter for new line</p>
          </>
        ) : (
          <input
            type="text"
            value={labelDraft}
            onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => onUpdateLabel(element.id, labelDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onUpdateLabel(element.id, labelDraft);
            }}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>

      {element.type === "pool" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <div className="flex flex-wrap gap-1">
              {(["black-box", "white-box"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onUpdateProperties(element.id, { poolType: v })}
                  className={`px-2 py-1 text-xs rounded border ${
                    ((element.properties.poolType as string | undefined) ?? "black-box") === v
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {v === "black-box" ? "Black-box" : "White-box"}
                </button>
              ))}
            </div>
          </div>

          {onAddLane && (
            <button
              onClick={() => onAddLane(element.id)}
              className="w-full px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
            >
              + Add Lane
            </button>
          )}
        </>
      )}

      {element.type === "lane" && onAddSublane && (
        <button
          onClick={() => onAddSublane(element.id)}
          className="w-full px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
        >
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

      {element.type === "task" && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Task Type</label>
          <div className="flex flex-wrap gap-1">
            {TASK_TYPE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onUpdateProperties(element.id, { taskType: value })}
                className={`px-2 py-1 text-xs rounded border ${
                  (element.taskType ?? "none") === value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(element.type === "subprocess" || element.type === "subprocess-expanded") && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <div className="flex gap-1">
            {(["normal", "call", "event", "transaction"] as const).map((v) => (
              <button
                key={v}
                onClick={() => onUpdateProperties(element.id, { subprocessType: v })}
                className={`px-2 py-1 text-xs rounded border ${
                  ((element.properties.subprocessType as string | undefined) ?? "normal") === v
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {v === "normal" ? "Normal" : v === "call" ? "Call" : v === "event" ? "Event" : "Transaction"}
              </button>
            ))}
          </div>
        </div>
      )}

      {(element.type === "task" || element.type === "subprocess" || element.type === "subprocess-expanded") && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Repeat</p>
          <div className="flex gap-1">
            {(["none", "loop"] as const).map((v) => (
              <button
                key={v}
                onClick={() => onUpdateProperties(element.id, { repeatType: v })}
                className={`px-2 py-1 text-xs rounded border ${
                  (element.repeatType ?? "none") === v
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {v === "none" ? "None" : "Loop"}
              </button>
            ))}
          </div>
        </div>
      )}

      {element.type === "gateway" && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <div className="flex flex-col gap-1">
            {GATEWAY_TYPE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onUpdateProperties(element.id, { gatewayType: value })}
                className={`px-2 py-1 text-xs rounded border text-left ${
                  element.gatewayType === value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {element.type === "gateway" && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
          <div className="flex gap-1">
            {([{ value: "decision", label: "Decision" }, { value: "merge", label: "Merge" }] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => onUpdateProperties(element.id, { gatewayRole: opt.value })}
                className={`px-2 py-1 text-xs rounded border ${
                  ((element.properties.gatewayRole as string | undefined) ?? "decision") === opt.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isEventElement && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Event Type</label>
          <div className="flex flex-col gap-1">
            {EVENT_TYPE_OPTIONS
              .filter(o => {
                if (element.type !== "end-event" && o.value === "terminate") return false;
                if (element.type === "end-event" && (o.value === "timer" || o.value === "conditional")) return false;
                if (element.type !== "intermediate-event" && o.value === "link") return false;
                return true;
              })
              .map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onUpdateProperties(element.id, { eventType: value })}
                  className={`px-2 py-1 text-xs rounded border text-left ${
                    (element.eventType ?? "none") === value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      )}

      {(element.type === "start-event" || element.type === "intermediate-event") && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Interruption</label>
          <div className="flex gap-1">
            {(["interrupting", "non-interrupting"] as const).map((v) => (
              <button
                key={v}
                onClick={() => onUpdateProperties(element.id, { interruptionType: v })}
                className={`px-2 py-1 text-xs rounded border ${
                  ((element.properties.interruptionType as string | undefined) ?? "interrupting") === v
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {v === "interrupting" ? "Interrupting" : "Non-Interrupting"}
              </button>
            ))}
          </div>
        </div>
      )}

      {isEventElement && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Flow Type</label>
          {hasMessageBpmnConnection && (
            <p className="text-xs text-gray-400 mb-1">Cannot change while messageBPMN connections exist</p>
          )}
          <div className="flex flex-col gap-1">
            {FLOW_TYPE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                disabled={hasMessageBpmnConnection}
                onClick={() => { if (!hasMessageBpmnConnection) onUpdateProperties(element.id, { flowType: value }); }}
                className={`px-2 py-1 text-xs rounded border text-left ${
                  (element.flowType ?? "none") === value
                    ? "bg-blue-600 text-white border-blue-600"
                    : hasMessageBpmnConnection
                    ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
              defaultValue={(element.properties.stereotype as string | undefined) ?? (element.type === "uml-class" ? "class" : "enumeration")}
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
