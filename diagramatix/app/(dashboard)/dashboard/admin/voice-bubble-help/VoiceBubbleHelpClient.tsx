"use client";
/**
 * Voice Assist Bubble Help — the SuperAdmin tile (plan slice 2).
 *
 * Shows what the bubble will list as the next words, word by word, and lets the
 * SuperAdmin change it:
 *   1. the global switch (off until Paul turns it on);
 *   2. the conventions — what <existing_element_name>, <existing_label_name>,
 *      <new_element_name>, <new_label_name>, <target> … mean;
 *   3. the word lists (read-only: they are the parser's own vocabularies);
 *   4. the command patterns, with the [optional] words defined in them, validated live;
 *   5. the next-word summary, generated from the draft;
 *   6. try it — type the words of a command and see the bubble as the editor would draw it.
 *
 * Everything below the switch runs in the browser against the DRAFT, so an edit can be
 * tried before it is saved. The parser comparison is the real `parseCommand`. (Speaking
 * a command here is slice 4.)
 *
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import {
  compileTree, formatNext, namesOf, targetNow, tokenise, validateConventions,
  type Conventions, type Lists, type SlotDef, type SlotKind,
} from "@/app/lib/assist/commandTree";

interface TileData {
  enabled: boolean;
  patterns: string;
  conventions: Conventions;
  defaultPatterns: string;
  defaultConventions: Conventions;
  lists: Lists;
  usingPatternsOverride: boolean;
  usingConventionsOverride: boolean;
  fallback: string | null;
}

const KINDS: SlotKind[] = ["free", "names", "number", "distance", "pattern"];
/** The guided flows, in the words the tile uses for them. */
const FLOWS = [
  { id: "rename-pick", label: "After “rename tasks” — pick one by number" },
  { id: "rename-name", label: "After picking a number — say the new name" },
  { id: "dividers", label: "“Move dividers” — just opened" },
  { id: "dividers-held", label: "“Move dividers” — after saying a number" },
  { id: "dividers-moved", label: "“Move dividers” — after a move" },
];

export function VoiceBubbleHelpClient() {
  const [data, setData] = useState<TileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/voice-bubble-help", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `the page could not load (${r.status})`);
      setData(j as TileData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the page could not load");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (method: "PUT" | "DELETE", url: string, body?: unknown): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    setProblems([]);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setProblems(Array.isArray(j.problems) ? j.problems : []);
        setError(j.error ?? `that did not save (${r.status})`);
        return false;
      }
      setError(null);
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-baseline gap-3 mb-1">
        <Link href="/dashboard/admin" className="text-xs text-blue-700 hover:underline">← SuperAdmin</Link>
        <h1 className="text-lg font-semibold text-gray-900">Voice Assist Bubble Help</h1>
      </div>
      <p className="text-xs text-gray-600 mb-4 max-w-3xl">
        While Voice Assist is on, a panel lists what can be said next, word by word — the first words of every command, then
        the words that can follow each one. Names and labels are shown as variables, optional words in [ ]. This is
        separate from the canvas Bubble Help. The parser still acts on the commands; this tile only controls what is shown.
      </p>

      {error && (
        <div className="mb-4 text-xs text-red-700 border border-red-200 bg-red-50 rounded px-3 py-2">
          {error}
          {problems.length > 0 && <ul className="mt-1 list-disc ml-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </div>
      )}
      {notice && <p className="mb-4 text-xs text-green-800 border border-green-200 bg-green-50 rounded px-3 py-2">{notice}</p>}
      {!data && !error && <p className="text-xs text-gray-500">Loading…</p>}

      {data?.fallback && (
        <p className="mb-4 text-xs text-amber-800 border border-amber-200 bg-amber-50 rounded px-3 py-2">
          A saved edit is NOT in use: {data.fallback}. Fix it below and save, or reset to the shipped default.
        </p>
      )}

      {data && (
        <Editor
          key={`${data.patterns.length}:${data.conventions.length}:${data.usingPatternsOverride}:${data.usingConventionsOverride}`}
          data={data}
          busy={busy}
          onSwitch={async (enabled) => { if (await send("PUT", "/api/admin/voice-bubble-help", { enabled })) setNotice(enabled ? "Voice Assist Bubble Help is ON." : "Voice Assist Bubble Help is OFF."); }}
          onSave={async (patch, label) => { if (await send("PUT", "/api/admin/voice-bubble-help", patch)) setNotice(`${label} saved.`); }}
          onReset={async (what) => { if (await send("DELETE", `/api/admin/voice-bubble-help?reset=${what}`)) setNotice("Back to the shipped default."); }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-gray-200 rounded-lg bg-white">
      <h2 className="text-sm font-semibold text-gray-800 px-4 py-2 border-b border-gray-100">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Editor({ data, busy, onSwitch, onSave, onReset }: {
  data: TileData;
  busy: boolean;
  onSwitch: (on: boolean) => void;
  onSave: (patch: { patterns?: string; conventions?: Conventions }, label: string) => void;
  onReset: (what: "patterns" | "conventions") => void;
}) {
  const [patterns, setPatterns] = useState(data.patterns);
  const [conv, setConv] = useState<SlotDef[]>(data.conventions);
  const [confirm, setConfirm] = useState<"patterns" | "conventions" | null>(null);

  // The draft, compiled here so an edit can be tried before it is saved.
  const convCheck = useMemo(() => validateConventions(conv), [conv]);
  const convInForce = convCheck.ok ? convCheck.conventions : data.conventions;
  const tree = useMemo(() => compileTree(patterns, convInForce, data.lists), [patterns, convInForce, data.lists]);
  const patternsChanged = patterns.replace(/\r\n/g, "\n").trim() !== data.patterns.replace(/\r\n/g, "\n").trim();
  const convChanged = JSON.stringify(conv) !== JSON.stringify(data.conventions);
  const patternsDiffer = patterns.replace(/\r\n/g, "\n").trim() !== data.defaultPatterns.replace(/\r\n/g, "\n").trim();
  const convDiffer = JSON.stringify(conv) !== JSON.stringify(data.defaultConventions);

  return (
    <div className="space-y-6">
      <Section title="1. Switch">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSwitch(!data.enabled)} disabled={busy}
            className={`px-3 py-1.5 text-xs rounded font-medium disabled:opacity-50 ${data.enabled ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-gray-800 hover:bg-gray-300"}`}
          >
            {data.enabled ? "Bubble Help is ON" : "Bubble Help is OFF"}
          </button>
          <span className="text-xs text-gray-600">
            {data.enabled
              ? "Anyone who can use Voice Assist can turn the panel on in the editor."
              : "No one sees the panel. (The canvas Bubble Help is a separate switch.)"}
          </span>
        </div>
      </Section>

      <Section title="2. Conventions — what the variables mean">
        <p className="text-xs text-gray-600 mb-3">
          In the patterns a variable is written <code>&lt;name&gt;</code>. Each needs a convention here. <em>names</em> take a name that is
          already on the diagram; <em>free</em> takes whatever is said (a new name) up to the end of the command; <em>pattern</em> takes
          one of a set of phrases written in the same notation.
        </p>
        <div className="space-y-3">
          {conv.map((c, i) => (
            <ConventionRow
              key={i} c={c}
              onChange={(next) => setConv((all) => all.map((x, k) => (k === i ? next : x)))}
              onRemove={() => setConv((all) => all.filter((_, k) => k !== i))}
            />
          ))}
        </div>
        {!convCheck.ok && (
          <ul className="mt-3 text-xs text-red-700 list-disc ml-5">{convCheck.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setConv((all) => [...all, { name: "", kind: "free", means: "", example: "" }])}
            className="px-3 py-1.5 text-xs rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          >Add a convention</button>
          <button
            onClick={() => onSave({ conventions: conv }, "The conventions")}
            disabled={busy || !convChanged || !convCheck.ok || tree.errors.length > 0}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >Save conventions</button>
          <ResetButton
            what="conventions" differs={convDiffer} confirm={confirm === "conventions"} busy={busy}
            onAsk={() => setConfirm("conventions")} onCancel={() => setConfirm(null)}
            onDo={() => { setConfirm(null); onReset("conventions"); }}
          />
          {data.usingConventionsOverride && <span className="text-[11px] text-amber-800">A saved edit is in use.</span>}
        </div>
      </Section>

      <Section title="3. Word lists (the parser’s own vocabularies — read only)">
        <p className="text-xs text-gray-600 mb-2">Written <code>{"{list_name}"}</code> in a pattern. A word added to the parser’s vocabulary appears here with no second edit.</p>
        <dl className="text-xs space-y-1.5">
          {Object.entries(data.lists).map(([name, words]) => (
            <div key={name} className="flex gap-2">
              <dt className="font-mono text-gray-800 w-36 shrink-0">{`{${name}}`}</dt>
              <dd className="text-gray-700">{words.join(", ")}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="4. Command patterns">
        <p className="text-xs text-gray-600 mb-2">
          One command per line. <code>word</code> · <code>a|b</code> one of · <code>( x y | z )</code> a group · <code>[optional]</code> shown in [ ] ·
          <code> &lt;variable&gt;</code> · <code>{"{list}"}</code> · <code># comment</code>. Sections: <code>## commands</code>, <code>## assist</code> (only while
          Assist suggestions show), <code>## voice</code>, <code>## flow &lt;id&gt;</code> (a guided flow).
        </p>
        <textarea
          value={patterns} onChange={(e) => setPatterns(e.target.value)} spellCheck={false}
          rows={26}
          className="w-full text-[11px] leading-5 font-mono border border-gray-300 rounded p-2 whitespace-pre"
        />
        {tree.errors.length > 0 ? (
          <ul className="mt-2 text-xs text-red-700 list-disc ml-5">
            {tree.errors.map((e, i) => <li key={i}>{e.line ? `line ${e.line}: ` : ""}{e.message}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-green-800">
            {Object.values(tree.sections).reduce((n, ps) => n + ps.length, 0)} patterns, no problems.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button
            onClick={() => onSave({ patterns }, "The patterns")}
            disabled={busy || !patternsChanged || tree.errors.length > 0}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >Save patterns</button>
          <ResetButton
            what="patterns" differs={patternsDiffer} confirm={confirm === "patterns"} busy={busy}
            onAsk={() => setConfirm("patterns")} onCancel={() => setConfirm(null)}
            onDo={() => { setConfirm(null); onReset("patterns"); }}
          />
          {data.usingPatternsOverride && <span className="text-[11px] text-amber-800">A saved edit is in use.</span>}
        </div>
      </Section>

      <Summary tree={tree} />
      <TryIt tree={tree} />
    </div>
  );
}

function ResetButton({ what, differs, confirm, busy, onAsk, onCancel, onDo }: {
  what: string; differs: boolean; confirm: boolean; busy: boolean; onAsk: () => void; onCancel: () => void; onDo: () => void;
}) {
  if (!confirm) {
    return (
      <button onClick={onAsk} disabled={busy || !differs} className="px-3 py-1.5 text-xs rounded bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:opacity-40">
        Reset {what} to the shipped default
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-gray-700">Throw away your {what} and use the shipped ones?</span>
      <button onClick={onDo} disabled={busy} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">Yes, reset</button>
      <button onClick={onCancel} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800">Keep mine</button>
    </span>
  );
}

function ConventionRow({ c, onChange, onRemove }: { c: SlotDef; onChange: (c: SlotDef) => void; onRemove: () => void }) {
  const set = (patch: Partial<SlotDef>) => onChange({ ...c, ...patch });
  const input = "border border-gray-300 rounded px-2 py-1 text-xs w-full";
  return (
    <div className="border border-gray-200 rounded p-3 bg-gray-50">
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <span className="text-xs text-gray-500">&lt;</span>
        <input value={c.name} onChange={(e) => set({ name: e.target.value.trim() })} className={`${input} !w-56 font-mono`} placeholder="variable_name" />
        <span className="text-xs text-gray-500">&gt;</span>
        <select value={c.kind} onChange={(e) => set({ kind: e.target.value as SlotKind })} className="border border-gray-300 rounded px-2 py-1 text-xs">
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {c.kind === "names" && (
          <select value={c.source ?? "elements"} onChange={(e) => set({ source: e.target.value as "elements" | "labels" })} className="border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="elements">element names</option>
            <option value="labels">label names</option>
          </select>
        )}
        <label className="text-[11px] text-gray-600 ml-2">most words
          <input value={c.maxWords ?? ""} onChange={(e) => set({ maxWords: e.target.value === "" ? undefined : Number(e.target.value) })} className="ml-1 border border-gray-300 rounded px-1 py-0.5 w-12 text-xs" />
        </label>
        <button onClick={onRemove} className="ml-auto text-[11px] text-red-700 hover:underline">Remove</button>
      </div>
      {c.kind === "pattern" && (
        <input value={c.pattern ?? ""} onChange={(e) => set({ pattern: e.target.value })} className={`${input} font-mono mb-2`} placeholder="the phrases, in the pattern notation" />
      )}
      <textarea value={c.means} onChange={(e) => set({ means: e.target.value })} rows={2} className={`${input} mb-2`} placeholder="What it means" />
      <input value={c.example} onChange={(e) => set({ example: e.target.value })} className={input} placeholder="An example of what is said" />
    </div>
  );
}

function Summary({ tree }: { tree: ReturnType<typeof compileTree> }) {
  const [ghost, setGhost] = useState(false);
  const rows = useMemo(() => tree.summary({ ghost }), [tree, ghost]);
  return (
    <Section title="5. Next words — generated from the patterns above">
      <label className="flex items-center gap-2 text-xs text-gray-700 mb-3">
        <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />
        Assist suggestions are showing (adds the Assist-only words)
      </label>
      <div className="mb-3 text-xs">
        <span className="font-semibold text-gray-800">First words: </span>
        <span className="text-gray-700">{formatNext(tree.firstWords({ ghost })).join(", ")}</span>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3 w-28">Say</th><th className="py-1">Then, next</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.word} className="border-t border-gray-100 align-top">
              <td className="py-1 pr-3 font-mono text-gray-900">{r.word}</td>
              <td className="py-1 text-gray-700">{r.next.length ? formatNext(r.next).join(", ") : <em className="text-gray-400">(a complete command on its own)</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function TryIt({ tree }: { tree: ReturnType<typeof compileTree> }) {
  const [text, setText] = useState("");
  const [flow, setFlow] = useState("");
  const [ghost, setGhost] = useState(false);
  const [useNames, setUseNames] = useState(true);
  const [selId, setSelId] = useState("");
  const [cursorId, setCursorId] = useState("");

  // The test diagram — the same one the Commands card is written for — stands in for a real
  // diagram, so what is selected / pointed at, and which names exist, can be tried here.
  const fx = useMemo(() => fixtureDiagram(), []);
  const names = useMemo(() => namesOf(fx.elements, fx.connectors), [fx]);
  const choices = useMemo(
    () => fx.elements.filter((e) => (e.label ?? "").trim()).map((e) => ({ id: e.id, text: `${(e.label ?? "").replace(/\s+/g, " ").trim()} (${String(e.type).replace(/-/g, " ")})` })),
    [fx],
  );
  const pointerAt = (id: string) => {
    const e = fx.elements.find((x) => x.id === id);
    return e ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
  };
  const target = useMemo(
    () => targetNow(fx.elements, selId ? [selId] : [], null, cursorId ? pointerAt(cursorId) : null),
    [fx, selId, cursorId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const flows = useMemo(() => FLOWS.filter((f) => tree.sections[`flow ${f.id}`]), [tree]);
  const tokens = tokenise(text);
  const ctx = { ghost, flow: flow || null, ...(useNames ? { names } : {}) };
  const result = useMemo(() => tree.next(tokens, ctx), [tree, text, ghost, flow, useNames]); // eslint-disable-line react-hooks/exhaustive-deps
  const ops = useMemo(() => (text.trim() && !flow ? parseCommand(text.trim()) : null), [text, flow]);
  const treeSays = tree.accepts(text, ctx);
  const sel = "border border-gray-300 rounded px-2 py-1.5 text-xs max-w-[15rem]";
  return (
    <Section title="6. Try it — type the words of a command">
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <input
          value={text} onChange={(e) => setText(e.target.value)} placeholder="rename …" autoFocus
          className="flex-1 min-w-[16rem] border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-end mb-3">
        <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">Guided flow open?
          <select value={flow} onChange={(e) => setFlow(e.target.value)} className={sel}>
            <option value="">None — ordinary commands</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">Element selected
          <select value={selId} onChange={(e) => setSelId(e.target.value)} className={sel}>
            <option value="">Nothing selected</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">Cursor over
          <select value={cursorId} onChange={(e) => setCursorId(e.target.value)} className={sel}>
            <option value="">Nothing</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-700 flex items-center gap-1 pb-1.5"><input type="checkbox" checked={useNames} onChange={(e) => setUseNames(e.target.checked)} /> Names from the test diagram</label>
        <label className="text-xs text-gray-700 flex items-center gap-1 pb-1.5"><input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} /> Assist suggestions showing</label>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 max-w-2xl">
        <strong>Guided flow</strong> shows the panel as it looks while a flow is open — for example after “rename tasks” (green numbers on the tasks) or “move dividers”.
        <strong> Names from the test diagram</strong> makes a name in a command have to be one that is really on that diagram, as it is in the editor;
        switch it off to see any words accepted as a name. Selected and Cursor over drive the “this / that” line below.
      </p>

      <div className="border border-gray-300 rounded-lg bg-yellow-50 p-3 max-w-xl">
        <div className="text-[11px] text-gray-500 mb-1">
          {tokens.length ? <>Heard: <span className="font-mono text-gray-800">{tokens.join(" ")}</span></> : "Say…"}
        </div>
        {!result.ok ? (
          <p className="text-xs text-red-700">No command fits those words.</p>
        ) : (
          <p className="text-sm text-gray-900 leading-6">{formatNext(result.next).join(" · ") || "—"}</p>
        )}
        {result.complete && <p className="mt-1 text-[11px] text-green-800">That is already a whole command — you could stop here.</p>}
        <div className="mt-2 pt-2 border-t border-yellow-200 text-[11px]">
          <span className="text-gray-500">“this” / “that” would act on: </span>
          <span className={target.kind === "none" ? "text-gray-400" : "text-gray-800"}>{target.label}</span>
        </div>
      </div>

      {text.trim() && !flow && (
        <p className="mt-3 text-xs text-gray-700">
          The parser: {ops ? <span className="text-green-800">understands it ({ops.map((o) => o.op).join(", ")})</span> : <span className="text-amber-800">does not understand this as a whole command</span>}.
          {treeSays && !ops && <span className="text-red-700"> The tree describes this sentence but the parser does not take it — a drift to fix.</span>}
          {!treeSays && ops && <span className="text-amber-800"> The parser takes it but the tree does not describe it{useNames ? " (with this diagram’s names)" : ""}.</span>}
        </p>
      )}
      <p className="mt-2 text-[11px] text-gray-500">Speaking a command here arrives with a later slice.</p>
    </Section>
  );
}
