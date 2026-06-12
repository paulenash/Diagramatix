"use client";

import { useState } from "react";

export interface RsRef {
  id: string;
  label: string;
  type: string;
}

export interface RsSelection {
  delete: Set<string>;     // ids the user wants deleted
  preserve: Set<string>;   // ids the user wants preserved (kept at original coords)
  ignore: Set<string>;     // partial-overlap items left alone
  affect: Set<string>;     // partial-overlap items that get shrunk / affected
  leaveAlone: Set<string>; // partial-overlap items the user opted out of the shrink/affect
}

interface Props {
  zoneWidth: number;
  zoneHeight: number;
  toDelete: RsRef[];   // fully inside the zone — could be deleted (default UNCHECKED)
  ignored: RsRef[];    // partial overlap, default ignored (default CHECKED)
  affected: RsRef[];   // partial overlap, will be shrunk/affected (default CHECKED)
  onConfirm: (sel: RsSelection) => void;
  onCancel: () => void;
}

function PrettyType(t: string) {
  return t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function rowLabel(r: RsRef) {
  const name = r.label && r.label.trim().length ? r.label : "(unlabelled)";
  return `${name} — ${PrettyType(r.type)}`;
}

export function RemoveSpaceDialog({
  zoneWidth,
  zoneHeight,
  toDelete,
  ignored,
  affected,
  onConfirm,
  onCancel,
}: Props) {
  // Group A (delete candidates): UNCHECKED default → checking confirms delete.
  const [delChecked, setDelChecked] = useState<Set<string>>(new Set());
  // Group B (ignored partials): CHECKED default → unchecking promotes to delete.
  const [ignoreChecked, setIgnoreChecked] = useState<Set<string>>(
    new Set(ignored.map((r) => r.id)),
  );
  // Group C (affected partials): CHECKED default → unchecking leaves alone.
  const [affectChecked, setAffectChecked] = useState<Set<string>>(
    new Set(affected.map((r) => r.id)),
  );

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOn = (rs: RsRef[], set: Set<string>) =>
    rs.length > 0 && rs.every((r) => set.has(r.id));
  const setAll = (
    rs: RsRef[],
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    on: boolean,
  ) => {
    setter(on ? new Set(rs.map((r) => r.id)) : new Set());
  };

  const handleConfirm = () => {
    const delSet = new Set<string>();
    const preserveSet = new Set<string>();
    for (const r of toDelete) {
      if (delChecked.has(r.id)) delSet.add(r.id);
      else preserveSet.add(r.id);
    }
    const ignoreSet = new Set<string>();
    for (const r of ignored) {
      if (ignoreChecked.has(r.id)) ignoreSet.add(r.id);
      else delSet.add(r.id); // override: unchecked-ignore → delete
    }
    const affectSet = new Set<string>();
    const leaveAloneSet = new Set<string>();
    for (const r of affected) {
      if (affectChecked.has(r.id)) affectSet.add(r.id);
      else leaveAloneSet.add(r.id);
    }
    onConfirm({
      delete: delSet,
      preserve: preserveSet,
      ignore: ignoreSet,
      affect: affectSet,
      leaveAlone: leaveAloneSet,
    });
  };

  const sectionList = (
    rs: RsRef[],
    checkedSet: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => {
    if (rs.length === 0) return <div className="text-xs text-gray-400 italic px-1 py-0.5">None</div>;
    return (
      <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
        {rs.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={checkedSet.has(r.id)}
                onChange={() => toggle(setter, r.id)}
              />
              <span className="truncate">{rowLabel(r)}</span>
            </label>
          </li>
        ))}
      </ul>
    );
  };

  const sectionHeader = (
    title: string,
    note: string,
    rs: RsRef[],
    checkedSet: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => (
    <div className="flex items-baseline justify-between mb-1">
      <h4 className="text-xs font-semibold text-gray-900">
        {title} <span className="text-gray-500 font-normal">({rs.length})</span>
      </h4>
      {rs.length > 0 ? (
        <button
          type="button"
          onClick={() => setAll(rs, setter, !allOn(rs, checkedSet))}
          className="text-[10px] text-blue-600 hover:underline"
        >
          {allOn(rs, checkedSet) ? "Uncheck all" : "Check all"}
        </button>
      ) : null}
      <span className="sr-only">{note}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Remove space?</h3>
          <p className="text-xs text-gray-600 mt-1">
            A {Math.round(zoneWidth)} × {Math.round(zoneHeight)} px area will be collapsed.
            Choose what happens to each element below — pool and lane boundaries that straddle
            the area will shrink to close the gap. This cannot be undone.
          </p>
        </div>

        <div className="px-5 py-3 space-y-4 max-h-[60vh] overflow-y-auto">
          <section>
            {sectionHeader(
              "Fully inside (could be deleted)",
              "Check to delete; leave unchecked to keep at original coordinates.",
              toDelete,
              delChecked,
              setDelChecked,
            )}
            <p className="text-[10px] text-gray-500 mb-1">
              Check to delete. Unchecked items are preserved at their current position.
            </p>
            {sectionList(toDelete, delChecked, setDelChecked)}
          </section>

          <section>
            {sectionHeader(
              "Partially inside — ignored",
              "Checked: leave alone. Unchecked: delete.",
              ignored,
              ignoreChecked,
              setIgnoreChecked,
            )}
            <p className="text-[10px] text-gray-500 mb-1">
              Checked items stay put. Uncheck to delete instead.
            </p>
            {sectionList(ignored, ignoreChecked, setIgnoreChecked)}
          </section>

          <section>
            {sectionHeader(
              "Partially inside — will be affected",
              "Checked: shrink / shift. Unchecked: leave intact.",
              affected,
              affectChecked,
              setAffectChecked,
            )}
            <p className="text-[10px] text-gray-500 mb-1">
              Checked containers / EPs will shrink or shift to close the gap. Uncheck to leave them intact.
            </p>
            {sectionList(affected, affectChecked, setAffectChecked)}
          </section>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-red-600 hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
