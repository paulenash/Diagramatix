"use client";
/**
 * Voice Assist Help — the floating panel (plan slice 3).
 *
 * Lists what can be said NEXT, word by word, while Voice Assist is on. Presentational:
 * what to show is decided by `computePanel` (app/lib/assist/commandTree/panelState.ts) and
 * `targetNow`, both tested; this only draws it. Draggable, like the Commands card.
 *
 * Words are written as the SuperAdmin tile writes them: variables in <angle brackets>,
 * optional words in [square brackets] and dimmed.
 */
import { useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import type { PanelView, TargetNow } from "@/app/lib/assist/commandTree";

type Syntax = { heard: string; lines: string[] };

/** A main command word with its aliases in grey beside it (“add  insert create put …”). Click: its full syntax. */
function WordWithAliases({ main, aliases, onPick }: { main: string; aliases: string[]; onPick?: (w: string) => void }) {
  return (
    <span className="inline-flex items-baseline mr-1.5 mb-1.5">
      <button type="button" onClick={() => onPick?.(main)} disabled={!onPick} title="Click to see the full syntax"
        className="text-xs px-1.5 py-0.5 rounded border text-purple-900 border-purple-300 bg-purple-50 font-medium enabled:hover:bg-purple-100 enabled:cursor-pointer">{main}</button>
      {aliases.length > 0 && <span className="text-[11px] text-gray-400 ml-1" title={`also: ${aliases.join(", ")}`}>{aliases.join(" ")}</span>}
    </span>
  );
}

function Chip({ text, onPick }: { text: string; onPick?: (w: string) => void }) {
  const optional = text.startsWith("[");
  const variable = text.includes("<");
  const cls = optional
    ? "text-gray-400 border-gray-200 bg-white"
    : variable
      ? "text-teal-800 border-teal-300 bg-teal-50 italic"
      : "text-purple-900 border-purple-300 bg-purple-50 font-medium";
  const base = `inline-block text-xs px-1.5 py-0.5 rounded border mr-1.5 mb-1.5 ${cls}`;
  // A variable has no fixed word to look up; every other chip opens the syntax of the command it belongs to.
  if (variable || !onPick) return <span className={base}>{text}</span>;
  return <button type="button" onClick={() => onPick(text)} title="Click to see the full syntax" className={`${base} hover:bg-purple-100 cursor-pointer`}>{text}</button>;
}

export function VoiceAssistHelpPanel({ view, target, onClose, syntaxFor }: { view: PanelView; target: TargetNow; onClose: () => void; syntaxFor?: (word: string) => Syntax }) {
  // Opens just left of the bottom-centre command bar (440 px wide); draggable from there.
  const [initial] = useState(() => {
    if (typeof window === "undefined") return { x: 24, y: 88 };
    return { x: Math.max(8, Math.round(window.innerWidth / 2 - 220 - 420 - 12)), y: Math.max(60, window.innerHeight - 360) };
  });
  // The syntax window: a snapshot taken when the word was clicked, so it does not change as the speaker carries on.
  const [syntax, setSyntax] = useState<(Syntax & { word: string }) | null>(null);
  const pick = syntaxFor ? (word: string) => setSyntax({ word, ...syntaxFor(word) }) : undefined;
  const title = view.mode === "first" || view.mode === "no-match" ? "What can I say?" : view.mode === "flow" || view.mode === "other-flow" ? "Say next" : "Next words";
  return (
    <>
      <FloatingPanel title={title} onClose={onClose} initial={initial}>
        {view.heard && (
          <div className="text-[11px] text-gray-500 mb-1.5">
            Heard: <span className="font-mono text-gray-800">{view.heard}</span>
            {view.openSlot && <span className="text-teal-700"> · now saying &lt;{view.openSlot}&gt;</span>}
          </div>
        )}
        {view.note && <p className="text-[11px] text-gray-600 mb-1.5">{view.note}</p>}
        <div className="leading-6">
          {view.groups
            ? view.groups.map((g) => <WordWithAliases key={g.main} main={g.main} aliases={g.aliases} onPick={pick} />)
            : view.lines.map((l, i) => <Chip key={`${l}-${i}`} text={l} onPick={view.mode === "flow" || view.mode === "other-flow" ? undefined : pick} />)}
        </div>
        {view.complete && <p className="text-[11px] text-green-700 mt-0.5">That is already a whole command — you can stop here.</p>}
        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px]">
          <span className="text-gray-500">“this” / “that” would act on: </span>
          <span className={target.kind === "none" ? "text-gray-400" : "text-gray-800"}>{target.label}</span>
        </div>
      </FloatingPanel>
      {syntax && (
        <FloatingPanel title="Full syntax" onClose={() => setSyntax(null)} initial={{ x: initial.x + 24, y: Math.max(60, initial.y - 250) }}>
          <div className="text-[11px] text-gray-500 mb-1.5">
            Commands that go: <span className="font-mono text-gray-800">{syntax.heard}</span> …
          </div>
          {syntax.lines.length === 0
            ? <p className="text-[11px] text-gray-500">No command line starts like that.</p>
            : <ul className="space-y-1">
                {syntax.lines.map((l) => <li key={l} className="font-mono text-[11px] text-gray-800 bg-gray-50 border border-gray-100 rounded px-1.5 py-1 break-words">{l}</li>)}
              </ul>}
          <p className="text-[10px] text-gray-400 mt-1.5">&lt;variables&gt; are names or numbers you say · [optional] · a|b either · {"{list}"} one word from a list</p>
        </FloatingPanel>
      )}
    </>
  );
}
