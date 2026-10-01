"use client";
/**
 * Voice Assist Help — the editor's side (plan slice 3).
 *
 *   useVoiceAssistHelp(active)   fetches the command tree the SuperAdmin tile controls, once,
 *                                while Voice Assist is open; remembers this person's on/off.
 *   useTargetNow(...)            what "this" would act on right now, kept fresh as the cursor
 *                                moves and the selection changes.
 *
 * Separate from the canvas Bubble Help in every way (own setting, own localStorage key).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAssistHelp, targetNow, type CommandTree, type TargetNow } from "@/app/lib/assist/commandTree";
import type { DiagramElement } from "@/app/lib/diagram/types";

const PREF_KEY = "diagramatix.voiceAssistHelp";
/** The key this person's choice was first saved under (before the 2026-10-01 rename). */
const LEGACY_PREF_KEY = "diagramatix.voiceBubbleHelp";

function readPref(): boolean {
  try { return (window.localStorage.getItem(PREF_KEY) ?? window.localStorage.getItem(LEGACY_PREF_KEY)) !== "off"; } catch { return true; }
}
function writePref(on: boolean): void {
  try { window.localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* private window etc. — the choice just does not persist */ }
}

export function useVoiceAssistHelp(active: boolean): { tree: CommandTree | null; on: boolean; setOn: (on: boolean) => void } {
  const [tree, setTree] = useState<CommandTree | null>(null);
  const [on, setOnState] = useState(true);
  const asked = useRef(false);

  useEffect(() => { setOnState(readPref()); }, []);

  useEffect(() => {
    if (!active || asked.current) return;
    asked.current = true;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/voice-assist-help", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive || !j.enabled) return;
        // The server has already chosen what is in force; resolving again only compiles it
        // (and falls back to the shipped tree if what arrived somehow does not compile).
        setTree(resolveAssistHelp({ patterns: j.patterns, conventions: j.conventions }).tree);
      } catch { /* no help panel is a fine outcome — nothing else depends on it */ }
    })();
    return () => { alive = false; };
  }, [active]);

  const setOn = useCallback((v: boolean) => { setOnState(v); writePref(v); }, []);
  return { tree, on, setOn };
}

export function useTargetNow(
  active: boolean,
  read: () => { elements: readonly DiagramElement[]; selected: readonly string[]; last: string | null; pointer: { x: number; y: number } | null },
): TargetNow {
  const [now, setNow] = useState<TargetNow>({ kind: "none", label: "nothing — point at an element, or select one" });
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const i = readRef.current();
      const t = targetNow(i.elements, i.selected, i.last, i.pointer);
      setNow((prev) => (prev.kind === t.kind && prev.id === t.id && prev.label === t.label && prev.count === t.count ? prev : t));
    };
    tick();
    // The pointer is a ref, not state, so there is nothing to subscribe to: a light poll.
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
