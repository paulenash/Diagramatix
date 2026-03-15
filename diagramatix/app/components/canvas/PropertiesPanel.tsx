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
  DirectionType,
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
  onUpdateConnectorLabel?: (id: string, label: string) => void;
  onAddLane?: (poolId: string) => void;
  poolHasContent?: boolean;
  laneHasContent?: boolean;
  hasMessageBpmnConnection?: boolean;
  multiSelectionCount?: number;
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
  { value: "terminate",   label: "Terminate" },
  { value: "conditional", label: "Conditional" },
];

export function PropertiesPanel({
  element,
  connector,
  diagramType,
  onUpdateLabel,
  onUpdateProperties,
  onDeleteElement,
  onDeleteConnector,
  onUpdateConnectorDirection,
  onUpdateConnectorLabel,
  onAddLane,
  poolHasContent,
  laneHasContent,
  hasMessageBpmnConnection,
  multiSelectionCount,
}: Props) {
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    if (element) setLabelDraft(element.label);
  }, [element]);

  if (multiSelectionCount && multiSelectionCount > 1) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-500 font-medium">{multiSelectionCount} elements selected</p>
        <p className="text-xs text-gray-400 mt-1">Drag any selected element to move the group</p>
      </div>
    );
  }

  if (!element && !connector) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-400">Select an element to see properties</p>
      </div>
    );
  }

  if (connector) {
    return (
      <div className="w-56 border-l border-gray-200 bg-white p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Connector
          </p>
          <p className="text-xs text-gray-600">Type: {connector.type}</p>
        </div>
{connector.type !== "messageBPMN" &&
          (connector.type === "associationBPMN" ||
          (connector.type !== "sequence" && connector.type !== "transition") ||
          connector.routingType === "direct") && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Direction</p>
            <div className="flex flex-wrap gap-1">
              {(connector.type === "associationBPMN"
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
                    ].filter(o => !(diagramType === "process-context" && o.value === "directed"))
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onUpdateConnectorDirection(connector.id, value)}
                  className={`px-2 py-1 text-xs rounded border ${
                    connector.directionType === value
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
        {(connector.type === "transition" || connector.type === "messageBPMN") && onUpdateConnectorLabel && (
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
          className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
        >
          Delete connector
        </button>
      </div>
    );
  }

  if (!element) return null;

  const isEventElement =
    element.type === "start-event" ||
    element.type === "intermediate-event" ||
    element.type === "end-event";

  return (
    <div className="w-56 border-l border-gray-200 bg-white p-4 space-y-4 overflow-y-auto">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Properties
        </p>
        <p className="text-xs text-gray-400 mb-3">Type: {element.type}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Label
        </label>
        {(element.type === "gateway" || isEventElement ||
          element.type === "data-object" || element.type === "data-store" ||
          element.type === "task" || element.type === "subprocess" ||
          element.type === "subprocess-expanded" || element.type === "use-case") ? (
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Gateway Type</label>
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
              .filter(o => !(element.type !== "end-event" && o.value === "terminate"))
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
    </div>
  );
}
