"use client";
/**
 * Text to Speech — the SuperAdmin page that manages Diagramatix's spoken voice.
 *
 * Four parts, as the plan set them out (new features/diagramatix-voice):
 *   1. the master switch — the brake if cost or quality goes wrong;
 *   2. who can hear it — SuperAdmins always; anyone else switched on here;
 *   3. usage — this month and the last 30 days, by person and by use;
 *   4. voices — the default, chosen by ear in a side-by-side comparison.
 *
 * Nothing here decides access: `app/lib/voice/speechAccess.ts` does, on every
 * sentence. This page shows that decision and changes its inputs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TTS_VOICES, TTS_VOICE_INFO, type TtsVoice } from "@/app/lib/voice/speakParams";
import { speechTransform } from "@/app/lib/voice/spokenText";
import { COMPARE_LINES } from "@/app/lib/voice/compareLines";
import { DEEPGRAM_TTS_USD_PER_1K_CHARS } from "@/app/lib/ai/pricing";
import type { SpeechUsage, SpeechWindow } from "@/app/lib/voice/speechUsage";

interface Person { id: string | null; email: string; name: string | null }

interface TileData {
  settings: { enabled: boolean; defaultVoice: TtsVoice };
  configured: boolean;
  superAdmins: Person[];
  granted: Array<{ id: string; email: string; name: string | null }>;
  tiersOn: string[];
  usage: SpeechUsage;
  users: Record<string, { email: string; name: string | null }>;
  useLabels: Record<string, string>;
}

interface SearchResult { id: string; email: string; name: string | null; granted: boolean; superAdmin: boolean }

const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const voiceName = (v: TtsVoice) => `${TTS_VOICE_INFO[v].name} (${TTS_VOICE_INFO[v].accent})`;
const who = (p: { email: string; name: string | null }) => (p.name ? `${p.name} — ${p.email}` : p.email);

export function TextToSpeechClient() {
  const [data, setData] = useState<TileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/text-to-speech", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `the page could not load (${r.status})`);
      setData(j as TileData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the page could not load");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (patch: { enabled?: boolean; defaultVoice?: TtsVoice }) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/text-to-speech", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `not saved (${r.status})`);
      setData((d) => (d ? { ...d, settings: j.settings } : d));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "not saved");
    } finally {
      setBusy(false);
    }
  };

  const switchUser = async (id: string, on: boolean) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/text-to-speech/users/${encodeURIComponent(id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `not changed (${r.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "not changed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-1">
        <Link href="/dashboard/admin" className="text-xs text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      </div>
      <h1 className="text-xl font-semibold text-gray-800 mb-1">Text to Speech</h1>
      <p className="text-xs text-gray-500 mb-5 max-w-3xl">
        Diagramatix&apos;s spoken voice — Deepgram Aura-2, at {usd(DEEPGRAM_TTS_USD_PER_1K_CHARS)} per 1,000 characters.
        On for SuperAdmins, off for everyone else until they are switched on here.
      </p>

      {error && <p className="mb-4 text-xs text-red-700 border border-red-200 bg-red-50 rounded px-3 py-2">{error}</p>}
      {!data && !error && <p className="text-xs text-gray-500">Loading…</p>}

      {data && (
        <div className="space-y-6">
          <MasterSwitch data={data} busy={busy} onChange={(enabled) => void saveSettings({ enabled })} />
          <WhoCanHear data={data} busy={busy} onSwitch={(id, on) => void switchUser(id, on)} />
          <Usage data={data} />
          <Voices data={data} busy={busy} onUseVoice={(defaultVoice) => void saveSettings({ defaultVoice })} />
        </div>
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

// ── 1. Master switch ─────────────────────────────────────────────────────────

function MasterSwitch({ data, busy, onChange }: { data: TileData; busy: boolean; onChange: (on: boolean) => void }) {
  const on = data.settings.enabled;
  return (
    <Section title="1. Master switch">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(!on)} disabled={busy}
          className={`px-3 py-1.5 text-xs rounded font-medium disabled:opacity-50 ${on ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-gray-800 hover:bg-gray-300"}`}
        >
          {on ? "Speech is ON" : "Speech is OFF"}
        </button>
        <span className="text-xs text-gray-600">
          {on
            ? "Click to switch it off for everyone, SuperAdmins included."
            : "Nobody hears the voice. The browser stays silent rather than using its own voice, so nobody mistakes this for a fault."}
        </span>
      </div>
      {!data.configured && (
        <p className="mt-2 text-xs text-amber-800">
          This server has no <code>DEEPGRAM_API_KEY</code>, so nothing can be spoken whatever this switch says.
        </p>
      )}
    </Section>
  );
}

// ── 2. Who can hear it ───────────────────────────────────────────────────────

function WhoCanHear({ data, busy, onSwitch }: { data: TileData; busy: boolean; onSwitch: (id: string, on: boolean) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let alive = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/text-to-speech?search=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        if (alive) setResults(r.ok ? (j.results as SearchResult[]) : []);
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q, data.granted]);

  return (
    <Section title="2. Who can hear it">
      <h3 className="text-xs font-semibold text-gray-700 mb-1">SuperAdmins — always on</h3>
      <ul className="mb-4 text-xs text-gray-700 space-y-0.5">
        {data.superAdmins.map((p) => (
          <li key={p.email} className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">SuperAdmin</span>
            {who(p)}
            {!p.id && <span className="text-gray-400">(no account yet)</span>}
          </li>
        ))}
      </ul>

      {data.tiersOn.length > 0 && (
        <p className="mb-4 text-xs text-amber-800">
          Switched on for a whole subscription tier in Feature Availability: <strong>{data.tiersOn.join(", ")}</strong>.
          Everyone on {data.tiersOn.length === 1 ? "that tier" : "those tiers"} hears it too, and switching a person off here does not change that.
        </p>
      )}

      <h3 className="text-xs font-semibold text-gray-700 mb-1">Switched on individually</h3>
      {data.granted.length === 0 ? (
        <p className="mb-4 text-xs text-gray-500">Nobody yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-gray-100 border border-gray-100 rounded">
          {data.granted.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <span className="text-gray-800">{who(u)}</span>
              <button onClick={() => onSwitch(u.id, false)} disabled={busy}
                className="px-2 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Switch off
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="text-xs font-semibold text-gray-700 mb-1">Switch someone on</h3>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email…"
        className="w-full max-w-sm text-xs border border-gray-300 rounded px-2 py-1 mb-2" />
      {searching && <p className="text-[11px] text-gray-400">Searching…</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded max-w-xl">
          {results.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <span className="text-gray-800">{who(u)}</span>
              {u.superAdmin ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">SuperAdmin — always on</span>
              ) : u.granted ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">On</span>
              ) : (
                <button onClick={() => onSwitch(u.id, true)} disabled={busy}
                  className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  Switch on
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-[11px] text-gray-500">Nobody matches “{q.trim()}”.</p>
      )}
    </Section>
  );
}

// ── 3. Usage ─────────────────────────────────────────────────────────────────

function WindowCard({ title, w }: { title: string; w: SpeechWindow }) {
  return (
    <div className="border border-gray-200 rounded p-3 min-w-[12rem]">
      <div className="text-[11px] text-gray-500 mb-1">{title}</div>
      <div className="text-lg font-semibold text-gray-800">{usd(w.costUsd)}</div>
      <div className="text-[11px] text-gray-600">
        {w.calls} sentence{w.calls === 1 ? "" : "s"} · {w.chars.toLocaleString()} characters
      </div>
      {w.failures > 0 && (
        <div className="text-[11px] text-red-700">{w.failures} failed — not heard, not billed</div>
      )}
    </div>
  );
}

function Usage({ data }: { data: TileData }) {
  const u = data.usage;
  const since = new Date(u.monthStartIso).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" });
  const person = (id: string) => (id ? (data.users[id] ? who(data.users[id]) : id) : "(no user recorded)");
  return (
    <Section title="3. Usage">
      <div className="flex flex-wrap gap-3 mb-4">
        <WindowCard title={`This month — since ${since} (UTC)`} w={u.month} />
        <WindowCard title="Last 30 days" w={u.last30} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <BreakdownTable title="Last 30 days, by use" rows={u.byUse.map((b) => ({ ...b, label: data.useLabels[b.key] ?? b.key }))} />
        <BreakdownTable title="Last 30 days, by person" rows={u.byUser.map((b) => ({ ...b, label: person(b.key) }))} />
      </div>

      {u.unpricedModels.length > 0 && (
        <p className="mt-3 text-[11px] text-amber-800">
          No rate on file for {u.unpricedModels.join(", ")} — their cost shows as $0. Add a rate in AI Usage → rate catalog.
        </p>
      )}
      <p className="mt-3 text-[11px] text-gray-500">
        Estimated at the rate in the AI Usage catalog; Deepgram bills on its own dashboard. A reply the browser
        replays from its own cache never reaches the server and costs nothing — it is not counted here.
      </p>
    </Section>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Array<{ key: string; label: string; calls: number; chars: number; costUsd: number }> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-700 mb-1">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">Nothing spoken.</p>
      ) : (
        <table className="w-full text-xs border border-gray-100">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-2 py-1"></th>
              <th className="text-right px-2 py-1">Sentences</th>
              <th className="text-right px-2 py-1">Characters</th>
              <th className="text-right px-2 py-1">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-800">{r.label}</td>
                <td className="px-2 py-1 text-right">{r.calls}</td>
                <td className="px-2 py-1 text-right">{r.chars.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{usd(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── 4. Voices — the default, and the side-by-side comparison ─────────────────

type Slot = 0 | 1;
interface Take { firstByteMs: number; seconds: number; chars: number; costUsd: number }

function Voices({ data, busy, onUseVoice }: { data: TileData; busy: boolean; onUseVoice: (v: TtsVoice) => void }) {
  const [voices, setVoices] = useState<[TtsVoice, TtsVoice]>(["aura-2-theia-en", "aura-2-hyperion-en"]);
  const [lineIdx, setLineIdx] = useState(0); // -1 = the person's own words
  const [own, setOwn] = useState("");
  const [blind, setBlind] = useState(false);
  const [swapped, setSwapped] = useState(false); // blind: slot 0 plays voices[1]
  const [preferred, setPreferred] = useState<Slot | null>(null);
  const [takes, setTakes] = useState<Partial<Record<Slot, Take>>>({});
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({});
  const [playing, setPlaying] = useState<Slot | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const stopped = useRef(false);

  const raw = lineIdx >= 0 ? COMPARE_LINES[lineIdx].text : own;
  // Said exactly as the product would say it — "Task 1" as "Task one".
  const spoken = speechTransform(raw);
  const voiceIn = (slot: Slot): TtsVoice => voices[blind && swapped ? 1 - slot : slot];
  const slotName = (slot: Slot) => (blind ? `Voice ${slot + 1}` : voiceName(voiceIn(slot)));
  const canPlay = data.settings.enabled && data.configured && spoken.length > 0 && playing === null;

  // A new pair, sentence or mode is a new comparison: old timings would mislead.
  useEffect(() => { setTakes({}); setErrors({}); setPreferred(null); }, [voices, spoken, blind]);
  useEffect(() => () => { stopped.current = true; try { srcRef.current?.stop(); } catch { /* done */ } }, []);

  const toggleBlind = (on: boolean) => {
    setBlind(on);
    if (on) setSwapped(Math.random() < 0.5);
  };

  const playSlot = async (slot: Slot): Promise<boolean> => {
    const voice = voiceIn(slot);
    setPlaying(slot);
    setErrors((e) => ({ ...e, [slot]: undefined }));
    try {
      // Straight to the route, not through the speaker's cache: a cached reply
      // would report a first byte of nothing and hide the delay users feel.
      const t0 = performance.now();
      const res = await fetch("/api/ai/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spoken, voice, purpose: "compare" }),
      });
      const firstByteMs = Math.round(performance.now() - t0);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `the voice service answered ${res.status}`);
      }
      const bytes = await res.arrayBuffer();
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === "suspended") await ctx.resume();
      const buffer = await ctx.decodeAudioData(bytes);
      setTakes((t) => ({
        ...t,
        [slot]: { firstByteMs, seconds: buffer.duration, chars: spoken.length, costUsd: (spoken.length / 1000) * DEEPGRAM_TTS_USD_PER_1K_CHARS },
      }));
      if (stopped.current) return false;
      await new Promise<void>((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.onended = () => resolve();
        srcRef.current = src;
        src.start(0);
      });
      srcRef.current = null;
      return !stopped.current;
    } catch (e) {
      setErrors((er) => ({ ...er, [slot]: e instanceof Error ? e.message : "could not be played" }));
      return false;
    } finally {
      setPlaying(null);
    }
  };

  const play = async (slots: Slot[]) => {
    stopped.current = false;
    for (const s of slots) if (!(await playSlot(s))) break;
  };
  const stop = () => {
    stopped.current = true;
    try { srcRef.current?.stop(); } catch { /* already finished */ }
  };

  const bothHeard = takes[0] !== undefined && takes[1] !== undefined;

  return (
    <Section title="4. Voices">
      <p className="text-xs text-gray-700 mb-3">
        Default voice: <strong>{voiceName(data.settings.defaultVoice)}</strong> — {TTS_VOICE_INFO[data.settings.defaultVoice].description}.
        {" "}Someone who has picked a voice for themselves keeps theirs.
      </p>

      <h3 className="text-xs font-semibold text-gray-700 mb-2">Side by side — two voices, the same sentence</h3>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        {([0, 1] as const).map((i) => (
          <label key={i} className="text-xs text-gray-700">
            <div className="mb-0.5">{i === 0 ? "First voice" : "Second voice"}</div>
            <select value={voices[i]} disabled={playing !== null}
              onChange={(e) => setVoices((v) => (i === 0 ? [e.target.value as TtsVoice, v[1]] : [v[0], e.target.value as TtsVoice]))}
              className="border border-gray-300 rounded px-2 py-1 text-xs">
              {TTS_VOICES.map((v) => <option key={v} value={v}>{voiceName(v)}</option>)}
            </select>
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-gray-700 pb-1" title="Hide which is which until you have said which you prefer">
          <input type="checkbox" checked={blind} onChange={(e) => toggleBlind(e.target.checked)} disabled={playing !== null} />
          Blind
        </label>
      </div>

      <label className="block text-xs text-gray-700 mb-1">What they say</label>
      <select value={lineIdx} onChange={(e) => setLineIdx(Number(e.target.value))} disabled={playing !== null}
        className="border border-gray-300 rounded px-2 py-1 text-xs mb-2 max-w-full">
        {COMPARE_LINES.map((l, i) => <option key={l.label} value={i}>{l.label}</option>)}
        <option value={-1}>Your own words…</option>
      </select>
      {lineIdx < 0 && (
        <textarea value={own} onChange={(e) => setOwn(e.target.value)} rows={2} maxLength={2000}
          placeholder="Type what the two voices should say"
          className="block w-full max-w-2xl text-xs border border-gray-300 rounded px-2 py-1 mb-2" />
      )}
      {spoken && <p className="text-xs text-gray-600 mb-3">Spoken as: “{spoken}”</p>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => void play([0])} disabled={!canPlay} className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">▶ {slotName(0)}</button>
        <button onClick={() => void play([1])} disabled={!canPlay} className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">▶ {slotName(1)}</button>
        <button onClick={() => void play([0, 1])} disabled={!canPlay} className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">▶ Both, one after the other</button>
        {playing !== null && (
          <button onClick={stop} className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50">■ Stop</button>
        )}
      </div>
      {!data.settings.enabled && <p className="text-[11px] text-amber-800 mb-2">The master switch is off, so nothing can be played.</p>}

      <table className="w-full max-w-3xl text-xs border border-gray-100 mb-3">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-2 py-1">Voice</th>
            <th className="text-right px-2 py-1" title="From asking to the first byte of audio — the pause a listener waits through">First byte</th>
            <th className="text-right px-2 py-1">Length</th>
            <th className="text-right px-2 py-1">Characters</th>
            <th className="text-right px-2 py-1" title="At the list rate">Cost</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {([0, 1] as const).map((slot) => {
            const t = takes[slot];
            const v = voiceIn(slot);
            const revealed = !blind || preferred !== null;
            return (
              <tr key={slot} className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-800">
                  {playing === slot && <span className="text-blue-600">▶ </span>}
                  {slotName(slot)}
                  {blind && preferred !== null && <span className="text-gray-500"> — was {voiceName(v)}</span>}
                  {errors[slot] && <div className="text-red-700">{errors[slot]}</div>}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{t ? `${t.firstByteMs} ms` : "—"}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t ? `${t.seconds.toFixed(1)} s` : "—"}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t ? t.chars : "—"}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t ? usd(t.costUsd) : "—"}</td>
                <td className="px-2 py-1 text-right">
                  {blind && preferred === null ? (
                    bothHeard && (
                      <button onClick={() => setPreferred(slot)} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50">I prefer this one</button>
                    )
                  ) : revealed && v === data.settings.defaultVoice ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">Default</span>
                  ) : (
                    (!blind || preferred === slot) && (
                      <button onClick={() => onUseVoice(v)} disabled={busy}
                        className="px-2 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                        Use this voice
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[11px] text-gray-500">
        Each play is a real request, recorded under “{data.useLabels["voice.compare"] ?? "voice.compare"}” so testing never
        hides in the real figures. Flux voices are not in this comparison yet: Flux speaks over a live streaming session,
        a different protocol from Aura-2&apos;s one-off request, and that has not been checked against Deepgram&apos;s live
        API — so it is not guessed at here.
      </p>
    </Section>
  );
}
