"use client";

import { useState, useEffect } from "react";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

interface Props {
  element: DiagramElement | null;
  connector: Connector | null;
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
  onDeleteElement: (id: string) => void;
  onDeleteConnector: (id: string) => void;
}

export function PropertiesPanel({
  element,
  connector,
  onUpdateLabel,
  onUpdateProperties,
  onDeleteElement,
  onDeleteConnector,
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

  return (
    <div className="w-56 border-l border-gray-200 bg-white p-4 space-y-4">
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
