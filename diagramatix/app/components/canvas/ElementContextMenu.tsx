"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import {
  blackBoxPoolMenuItems,
  isBlackBoxPool,
  toggleBlackBoxPoolFlag,
} from "@/app/lib/diagram/blackBoxPoolMenu";
import {
  TASK_OPTS, GATEWAY_OPTS, ROLE_OPTS, SUBPROCESS_OPTS, REPEAT_OPTS,
  DATA_OBJECT_OPTS, EVENT_OPTS, FLOW_TYPE_OPTS,
} from "@/app/lib/diagram/elementSubtypes";

/**
 * Right-click "type-picker" menu for tasks, gateways, sub-processes,
 * data-objects and events. Replaces an inline IIFE in Canvas.tsx so it can
 * own its own focused-index state and keyboard navigation.
 *
 * Sections per kind:
 *   task        → Task Type
 *   gateway     → Gateway Type + Role         (Decision / Merge)
 *   subprocess  → Sub-Process Usage
 *   data-object → Role
 *   event       → Trigger  (Terminate filtered out on intermediate-event)
 *
 * Headers are non-focusable; ↑ / ↓ navigate across selectable items and
 * skip section dividers, Enter / Space picks, Esc closes.
 */
export type ContextMenuKind = "task" | "gateway" | "subprocess" | "data-object" | "event" | "package" | "lane" | "pool";

type Opt = { value: string; label: string };

type Section = {
  header: string;
  propKey: string;
  opts: Opt[];
  currentValue: string;
};

// The option tables live in `app/lib/diagram/elementSubtypes.ts` so the spoken
// form of this menu ("make this a user task") reads the same rows. A second
// copy would go stale the first time a subtype was added to one and not the
// other.

function sectionsFor(kind: ContextMenuKind, el: DiagramElement): Section[] {
  switch (kind) {
    case "task":
      return [{
        header: "Task Type",
        propKey: "taskType",
        opts: TASK_OPTS,
        currentValue: el.taskType ?? "none",
      }];
    case "gateway":
      return [
        {
          header: "Gateway Type",
          propKey: "gatewayType",
          opts: GATEWAY_OPTS,
          currentValue: el.gatewayType ?? "none",
        },
        {
          header: "Role",
          propKey: "gatewayRole",
          opts: ROLE_OPTS,
          currentValue: (el.properties.gatewayRole as string | undefined) ?? "decision",
        },
      ];
    case "subprocess":
      return [
        {
          header: "Sub-Process Usage",
          propKey: "subprocessType",
          opts: SUBPROCESS_OPTS,
          currentValue: (el.properties.subprocessType as string | undefined) ?? "normal",
        },
        {
          header: "Repeat",
          propKey: "repeatType",
          opts: REPEAT_OPTS,
          currentValue: el.repeatType ?? "none",
        },
      ];
    case "data-object":
      return [{
        header: "Role",
        propKey: "role",
        opts: DATA_OBJECT_OPTS,
        currentValue: (el.properties.role as string | undefined) ?? "none",
      }];
    case "event": {
      // BPMN: 'terminate' is only valid for END events. Filter it out when
      // the right-clicked element is an intermediate-event so the picker
      // can't propose an invalid combination.
      const opts = el.type === "intermediate-event"
        ? EVENT_OPTS.filter((o) => o.value !== "terminate")
        : EVENT_OPTS;
      const sections: Section[] = [{
        header: "Trigger",
        propKey: "eventType",
        opts,
        currentValue: el.eventType ?? "none",
      }];
      // Flow Type is only meaningful on intermediate events — start events
      // are always catching, end events are always throwing.
      if (el.type === "intermediate-event") {
        sections.push({
          header: "Flow Type",
          propKey: "flowType",
          opts: FLOW_TYPE_OPTS,
          currentValue: el.flowType ?? "none",
        });
      }
      return sections;
    }
    case "package":
      return []; // no type-picker sections — just the Collapse Package action
    case "lane":
    case "pool":
      return []; // no type-picker — just the actions below the sections
  }
}

export interface ElementContextMenuProps {
  el: DiagramElement;
  kind: ContextMenuKind;
  left: number;
  top: number;
  width?: number;
  onSelect: (propKey: string, value: string) => void;
  /** One-off actions (not property picks) e.g. "collapse-ep". */
  onAction?: (action: string) => void;
  /**
   * A tick-box style property patch. Unlike `onSelect` the menu STAYS OPEN, so
   * both black-box pool flags can be set in one right-click.
   */
  onToggle?: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}

export function ElementContextMenu({
  el, kind, left, top, width = 160, onSelect, onAction, onToggle, onClose,
}: ElementContextMenuProps) {
  const sections = useMemo(() => sectionsFor(kind, el), [kind, el]);
  // Flat list of selectable items across all sections — headers excluded.
  // Keyboard navigation iterates this, so ↑ / ↓ skip headers naturally.
  const flat = useMemo(
    () =>
      sections.flatMap((s, si) =>
        s.opts.map((o, oi) => ({ sectionIdx: si, optIdx: oi, opt: o, propKey: s.propKey })),
      ),
    [sections],
  );
  // Initial focus = the currently-selected option of the FIRST section.
  const initialFocus = useMemo(() => {
    if (sections.length === 0) return 0;
    const idx = sections[0].opts.findIndex((o) => o.value === sections[0].currentValue);
    return idx >= 0 ? idx : 0;
  }, [sections]);
  const [focused, setFocused] = useState(initialFocus);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rootRef.current?.focus(); }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused((p) => Math.min(flat.length - 1, p + 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused((p) => Math.max(0, p - 1)); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = flat[focused];
      if (item) onSelect(item.propKey, item.opt.value);
      return;
    }
  };

  // Running counter so each rendered button gets a stable flat index that
  // matches `flat[]`. Reset on every render.
  let runningIndex = -1;
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      style={{ position: "absolute", left, top, zIndex: 50, width, maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}
      className="bg-white border border-gray-300 rounded shadow-lg py-1 flex flex-col outline-none"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKey}
    >
      {sections.map((section, si) => (
        <div key={si}>
          {si > 0 && <div className="border-t border-gray-100 my-0.5" />}
          <div className="px-3 py-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide select-none">
            {section.header}
          </div>
          {section.opts.map((opt) => {
            runningIndex += 1;
            const myIdx = runningIndex;
            const isFocused = myIdx === focused;
            const isSelected = opt.value === section.currentValue;
            return (
              <button
                key={opt.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(section.propKey, opt.value);
                }}
                onMouseEnter={() => setFocused(myIdx)}
                className={`text-left px-3 py-0.5 text-sm hover:bg-gray-50 ${
                  isSelected ? "text-blue-700 font-medium bg-blue-50" : "text-gray-700"
                } ${isFocused ? "ring-1 ring-inset ring-blue-300" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ))}

      {/* One-off actions. Expanded Subprocess (EP) → collapse into a linked
          sub-diagram. Mouse-only (not part of ↑/↓ flat nav). */}
      {el.type === "subprocess-expanded" && onAction && (
        <div>
          {sections.length > 0 && <div className="border-t border-gray-100 my-0.5" />}
          <div className="px-3 py-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide select-none">
            Actions
          </div>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction("collapse-ep");
            }}
            className="text-left w-full px-3 py-0.5 text-sm text-blue-700 hover:bg-blue-50"
          >
            Collapse to Subprocess…
          </button>
        </div>
      )}

      {/* uml-package → collapse the Data Model into a linked Domain diagram,
          showing just the package with its crossing relationships. Hidden once
          already collapsed (it then has a linkedDiagramId). */}
      {el.type === "uml-package" && !el.properties?.linkedDiagramId && onAction && (
        <div>
          {sections.length > 0 && <div className="border-t border-gray-100 my-0.5" />}
          <div className="px-3 py-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide select-none">
            Actions
          </div>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction("collapse-package");
            }}
            className="text-left w-full px-3 py-0.5 text-sm text-blue-700 hover:bg-blue-50"
          >
            Collapse Package…
          </button>
        </div>
      )}

      {/* Black-box pool → what the participant IS. No Generate SOP below:
          a black-box pool has no internals, so a role SOP for it is empty.
          Clicking a flag leaves the menu open so both can be set at once. */}
      {isBlackBoxPool(el) && onToggle && (
        <div>
          <div className="px-3 py-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide select-none">
            Pool
          </div>
          {blackBoxPoolMenuItems(el).map((item) => (
            <button
              key={item.flag}
              role="menuitemcheckbox"
              aria-checked={item.checked}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(toggleBlackBoxPoolFlag(el, item.flag));
              }}
              className={`text-left w-full px-3 py-0.5 text-sm hover:bg-gray-50 flex items-center gap-1.5 ${
                item.checked ? "text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              <span className="w-3 shrink-0 text-center">{item.checked ? "✓" : ""}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Lane / white-box pool → generate a role-scoped SOP for just this
          swim-lane/pool. */}
      {(el.type === "lane" || (el.type === "pool" && !isBlackBoxPool(el))) && onAction && (
        <div>
          <div className="px-3 py-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide select-none">
            Actions
          </div>
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAction("generate-sop"); }}
            className="text-left w-full px-3 py-0.5 text-sm text-blue-700 hover:bg-blue-50"
          >
            Generate SOP for this {el.type === "lane" ? "lane" : "pool"}…
          </button>
        </div>
      )}
    </div>
  );
}
