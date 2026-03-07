"use client";

import { useState, useEffect } from "react";
import type {
  BpmnTaskType,
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
}: Props) {
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    if (element) setLabelDraft(element.label);
  }, [element]);

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
        {connector.type !== "sequence" && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Direction</p>
            <div className="flex flex-wrap gap-1">
              {([
                { value: "directed" as DirectionType,      label: "Filled" },
                { value: "open-directed" as DirectionType, label: "Open" },
                { value: "both" as DirectionType,          label: "Both" },
                { value: "non-directed" as DirectionType,  label: "None" },
              ].filter(o => !(diagramType === "process-context" && o.value === "directed"))).map(({ value, label }) => (
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
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => onUpdateLabel(element.id, labelDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onUpdateLabel(element.id, labelDraft);
          }}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

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

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Position
        </label>
        <p className="text-xs text-gray-500">
          X: {Math.round(element.x)}, Y: {Math.round(element.y)}
        </p>
        <p className="text-xs text-gray-500">
          {element.width} × {element.height}
        </p>
      </div>

      <button
        onClick={() => onDeleteElement(element.id)}
        className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
      >
        Delete element
      </button>
    </div>
  );
}
