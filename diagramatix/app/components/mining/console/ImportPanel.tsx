"use client";

/**
 * Getting an event log into the Miner: pick a file, say which column is which,
 * check what would be dropped, import.
 *
 * Extracted from `ProcessMiningConsole` in Phase 0.2. The panel OWNS its state
 * rather than receiving twenty props: nothing here — the staged rows, the
 * mapping, the wide-format detection, the OCEL type picker, the enrichment
 * tables — is of any interest to the run list or the run detail. The console
 * learns one thing, when an import lands.
 *
 * That is the point of the split. Five of the plan's remaining phases add
 * something to this screen, and each of them would otherwise have been a diff
 * against a 1,183-line file.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseCsv, guessMapping, distinctActivities } from "@/app/lib/mining/parseEventLog";
import { parseXes } from "@/app/lib/mining/formats/xes";
import { parseOcel } from "@/app/lib/mining/formats/ocel";
import { parseXlsx, type XlsxSheet } from "@/app/lib/mining/formats/xlsx";
import { detectWideSpec, unpivotWide, describeWideSpec, type WideSpec, type UnpivotResult } from "@/app/lib/mining/wideFormat";
import { mergeSources, parseCrosswalk, type Crosswalk, type MergeSource } from "@/app/lib/mining/mergeSources";
import { validateEventLogMapping } from "@/app/lib/mining/validateLog";
import { enrichResources, enrichStates } from "@/app/lib/mining/enrich";
import { activityToState } from "@/app/lib/mining/stateNaming";
import type { LogMapping } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";
import { MiningLogViewer } from "../MiningLogViewer";
import { MergeCard } from "./MergeCard";
import { INPUT_CLASS as inp, ROLES, SAMPLE_LOG, type SampleScenario } from "./shared";

/** Strip a file extension, for turning a file name into a default label. */
const EXT_RE = /\.[^.]+$/;

export interface ImportPanelProps {
  projectId: string;
  /** A run (or an OCEL study) landed. `domainDiagramId` is set only for a study. */
  onImported: (runId: string | null, domainDiagramId?: string | null) => void;
  /** Link to a diagram, and remember where to come back to. */
  openDiagram: (id: string) => string;
  stashReturn: () => void;
}

export function ImportPanel({ projectId, onImported, openDiagram, stashReturn }: ImportPanelProps) {
  // ── Staging ──────────────────────────────────────────────────────────────
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<LogMapping>>({});
  const [runName, setRunName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  // A wide file, once detected, and the result once expanded. Both null for an
  // ordinary long-format log, which is the overwhelming majority.
  const [wide, setWide] = useState<WideSpec | null>(null);
  const [wideResult, setWideResult] = useState<UnpivotResult | null>(null);
  // Sheets from a workbook, so a multi-sheet file does not silently lose the
  // ones that were not first.
  const [xlsxSheets, setXlsxSheets] = useState<XlsxSheet[]>([]);

  // ── Merging several systems (Phase 2.3) ──────────────────────────────────
  // Exports already committed to the merge. The file still in the staging area
  // joins them IMPLICITLY, so the last file does not have to be "added" before
  // importing — forgetting to would quietly drop a whole system.
  const [committed, setCommitted] = useState<MergeSource[]>([]);
  const [stagingName, setStagingName] = useState("");
  const [stagingLink, setStagingLink] = useState("");
  const [crosswalk, setCrosswalk] = useState<Crosswalk | null>(null);
  const [crosswalkName, setCrosswalkName] = useState<string | null>(null);

  // Hold back the most recent share of cases so a twin can later be tested on
  // data it was not fitted to. The import route has accepted this since the
  // validation work shipped and NOTHING has ever sent it — while the validate
  // panel told the user to "re-import the log with a hold-back", which no screen
  // could do. Off by default: it is a deliberate choice, not a default posture.
  const [holdoutPct, setHoldoutPct] = useState(0);

  // Choosable scenarios (an example may ship several period logs to pick between).
  const [scenarios, setScenarios] = useState<SampleScenario[] | null>(null);
  const [scenarioIdx, setScenarioIdx] = useState(-1);
  // The adopted example's built-in log — RETAINED so it can always be re-loaded
  // (alongside "Choose file…"), even after picking a different file.
  const [builtInSample, setBuiltInSample] = useState<SampleScenario | null>(null);

  // OCEL 2.0 object-centric study: the raw log + the object types the user picks
  // to mine (one state machine + run each) tied together by a Domain Diagram.
  const [ocelText, setOcelText] = useState<string | null>(null);
  const [ocelTypes, setOcelTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [ocelDomainId, setOcelDomainId] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  // Pretty-printed OCEL for the inline "View JSON" panel (capped so a huge log
  // can't freeze the render; the raw file is unchanged on import).
  const ocelPretty = useMemo(() => {
    if (!ocelText) return "";
    let s: string;
    try { s = JSON.stringify(JSON.parse(ocelText), null, 2); } catch { s = ocelText; }
    return s.length > 200_000 ? s.slice(0, 200_000) + "\n… (truncated for display)" : s;
  }, [ocelText]);

  // Holds an adopted example's SLA between the pre-load and the import POST.
  const pendingKpi = useRef<unknown>(null);

  /** Stage a parsed table — the one path every format converges on. */
  const stage = useCallback((h: string[], r: string[][], map: Partial<LogMapping>, name: string, runLabel?: string) => {
    setWide(detectWideSpec(h, r));
    setWideResult(null);
    setFileName(name);
    setHeaders(h); setRows(r);
    setMapping(map); setEnrichMsg(null);
    setRunName(runLabel ?? name.replace(/\.[^.]+$/, ""));
    setStagingName(name.replace(EXT_RE, ""));
    setStagingLink("");
    setScenarioIdx(-1);
  }, []);

  /** Load a scenario/sample log into staging (confirm-the-analysis flow). */
  const loadStaging = useCallback((s: SampleScenario) => {
    if (!Array.isArray(s?.headers) || !Array.isArray(s?.rows) || !s.headers.length || !s.rows.length) return;
    setErr(null); setOcelText(null); setOcelTypes([]); setEnrichMsg(null);
    setHeaders(s.headers); setRows(s.rows); setWide(null); setWideResult(null);
    setMapping(s.mapping ?? guessMapping(s.headers));
    setFileName(s.fileName ?? "sample.csv");
    setRunName(s.runName ?? (s.fileName ?? "").replace(/\.[^.]+$/, ""));
  }, []);

  // Adopted-example hand-off: if the gallery stashed a raw sample log for this
  // project, pre-load with it (confirm the analysis, then import). Several
  // scenarios → keep the set for the picker + pre-load the default (last).
  useEffect(() => {
    try {
      const key = `mining-sample:${projectId}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key);
      try {
        const kraw = sessionStorage.getItem(`mining-kpi:${projectId}`);
        if (kraw) { sessionStorage.removeItem(`mining-kpi:${projectId}`); pendingKpi.current = JSON.parse(kraw); }
      } catch { /* ignore */ }
      const parsed = JSON.parse(raw) as SampleScenario | { scenarios: SampleScenario[] };
      const set = "scenarios" in parsed ? parsed.scenarios : null;
      if (set && Array.isArray(set) && set.length) {
        setScenarios(set);
        const def = set.length - 1;             // last = recommended/current
        setScenarioIdx(def);
        setBuiltInSample(set[def]);
        loadStaging(set[def]);
      } else {
        setBuiltInSample(parsed as SampleScenario);
        loadStaging(parsed as SampleScenario);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // The cold start. Before Phase 11 this screen offered a file picker and
  // nothing else to anyone who had not been through the example gallery, which
  // is every first-time user on their own project. One static CSV, fetched only
  // when asked for, so it costs the bundle nothing.
  const [sampleBusy, setSampleBusy] = useState(false);
  const loadSampleLog = useCallback(async () => {
    setSampleBusy(true);
    setErr(null);
    try {
      const res = await fetch(SAMPLE_LOG.path, { cache: "force-cache" });
      if (!res.ok) { setErr("The sample log could not be loaded. Choose a file instead."); return; }
      const csv = parseCsv(await res.text());
      if (csv.headers.length === 0 || csv.rows.length === 0) { setErr("The sample log could not be read. Choose a file instead."); return; }
      setXlsxSheets([]); setOcelText(null); setOcelTypes([]);
      stage(csv.headers, csv.rows, guessMapping(csv.headers), SAMPLE_LOG.fileName, SAMPLE_LOG.runName);
    } catch {
      setErr("The sample log could not be loaded. Choose a file instead.");
    } finally {
      setSampleBusy(false);
    }
  }, [stage]);

  /** Stage one worksheet, exactly as a parsed CSV would be staged. */
  const loadSheet = useCallback((sheet: XlsxSheet, name: string) => {
    setOcelText(null); setOcelTypes([]);
    stage(sheet.headers, sheet.rows, guessMapping(sheet.headers), name,
      name.replace(/\.[^.]+$/, "") + (sheet.name ? ` — ${sheet.name}` : ""));
  }, [stage]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    // A workbook is a ZIP, so it must be read as bytes — `file.text()` would
    // mangle it before anything got the chance to look.
    if (ext === "xlsx" || ext === "xlsm") {
      try {
        const sheets = (await parseXlsx(await file.arrayBuffer())).filter((s) => s.rows.length > 0);
        if (sheets.length === 0) { setErr("That workbook has no rows in any sheet."); return; }
        setXlsxSheets(sheets);
        loadSheet(sheets[0], file.name);
      } catch (ex) {
        setErr(`Couldn't read that workbook: ${ex instanceof Error ? ex.message : String(ex)}`);
      }
      return;
    }
    setXlsxSheets([]);
    const text = await file.text();
    // XES (IEEE 1849) and OCEL are parsed to the same { headers, rows, mapping }
    // table CSV produces, then flow through the identical import pipeline.
    setOcelText(null); setOcelTypes([]);
    let h: string[], r: string[][], map: Partial<LogMapping>;
    // OCEL 2.0 XML and XES both start with <?xml/<log — tell them apart by the
    // OCEL object-model markers so an OCEL .xml isn't mistaken for XES.
    const isXml = /^<\?xml|^<log[\s>]/.test(text.trimStart());
    const isOcelXml = isXml && /<object-types|<objects>/.test(text.slice(0, 30_000));
    if (!isOcelXml && (ext === "xes" || isXml)) {
      const parsed = parseXes(text); h = parsed.headers; r = parsed.rows; map = parsed.mapping;
    } else if (ext === "json" || ext === "ocel" || ext === "jsonocel" || ext === "xml" || isOcelXml || /^\s*\{/.test(text)) {
      const parsed = parseOcel(text); h = parsed.headers; r = parsed.rows; map = parsed.mapping;
      // Object-centric: offer an OCEL 2.0 STUDY (one lifecycle per object type +
      // a Domain Diagram). The single-object flatten stays as an advanced fallback.
      if (parsed.objectTypes.length > 0) { setOcelText(text); setOcelTypes(parsed.objectTypes); setSelectedTypes(parsed.objectTypes); }
    } else {
      const csv = parseCsv(text); h = csv.headers; r = csv.rows; map = guessMapping(h);
    }
    if (h.length === 0 || r.length === 0) { setErr("Couldn't read any rows from that file."); return; }
    stage(h, r, map, file.name);
  }

  const chooseScenario = (i: number) => { if (!scenarios?.[i]) return; setScenarioIdx(i); loadStaging(scenarios[i]); };
  const setRole = (key: keyof LogMapping, col: string) => setMapping((m) => ({ ...m, [key]: col || undefined }));
  const canImport = mapping.caseId && mapping.activity && mapping.timestamp && rows.length > 0;

  // Columns none of the nine roles claims — the candidates for slicing later,
  // and the ones that were silently discarded at parse time until Phase 1.
  const spareColumns = useMemo(() => {
    const claimed = new Set(ROLES.map((r) => mapping[r.key]).filter((c): c is string => typeof c === "string" && !!c));
    return headers.filter((h) => !claimed.has(h));
  }, [headers, mapping]);
  const setAttributeMode = (col: string, mode: "keep" | "hash" | "drop") =>
    setMapping((m) => ({ ...m, attributeMode: { ...(m.attributeMode ?? {}), [col]: mode } }));

  /** Expand a wide file in place, then re-guess the mapping over the new shape. */
  const expandWide = () => {
    if (!wide) return;
    const out = unpivotWide(headers, rows, wide);
    if (out.rows.length === 0) { setErr("Nothing could be expanded from that file — check the state and date columns."); return; }
    setHeaders(out.headers); setRows(out.rows);
    setMapping(guessMapping(out.headers));
    setWideResult(out); setWide(null); setErr(null);
  };

  // When no State column is mapped, offer an Activity→State table that completes
  // the lifecycle the miner + the State Machine need.
  const activities = useMemo(
    () => (mapping.activity ? distinctActivities(headers, rows, mapping.activity) : []),
    [headers, rows, mapping.activity],
  );
  const needsStateTable = !mapping.state && activities.length > 0;
  const stateFor = (a: string) => mapping.activityState?.[a] ?? activityToState(a);
  const setActivityState = (a: string, s: string) =>
    setMapping((m) => ({ ...m, activityState: { ...(m.activityState ?? {}), [a]: s } }));

  const needsTeamTable = !mapping.resource && activities.length > 0;
  const teamFor = (a: string) => mapping.activityResource?.[a] ?? "";
  const setActivityResource = (a: string, r: string) =>
    setMapping((m) => ({ ...m, activityResource: { ...(m.activityResource ?? {}), [a]: r || undefined } as Record<string, string> }));
  const [enrichDiagrams, setEnrichDiagrams] = useState<{ id: string; name: string; type: string }[]>([]);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/mining/diagrams`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { diagrams: [] })).then((j) => setEnrichDiagrams(j.diagrams ?? [])).catch(() => {});
  }, [projectId]);
  async function fillFrom(diagramId: string, kind: "resource" | "state") {
    if (!diagramId) return;
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = ((await res.json())?.data ?? null) as DiagramData | null;
      if (!data) return;
      const e = kind === "resource" ? enrichResources(activities, data) : enrichStates(activities, data);
      setMapping((m) => kind === "resource"
        ? { ...m, activityResource: { ...(m.activityResource ?? {}), ...e.map } }
        : { ...m, activityState: { ...(m.activityState ?? {}), ...e.map } });
      setEnrichMsg(`Filled ${e.rows.length} of ${activities.length} ${kind === "resource" ? "teams" : "states"}${e.unmatched.length ? ` — ${e.unmatched.length} unmatched (edit below)` : ""}.`);
    } catch { /* best-effort */ }
  }

  // Advisory pre-import validation off the already-parsed rows — confirm the
  // mapping is right + see what would be discarded, before ingesting.
  const validation = useMemo(
    () => (headers.length > 0 && rows.length > 0 ? validateEventLogMapping(headers, rows, mapping) : null),
    [headers, rows, mapping],
  );

  // The file currently in the staging area, as a merge source. Only once its
  // three required roles are mapped — a half-mapped file would drag the whole
  // assessment down and read as a crosswalk problem.
  const stagedSource: MergeSource | null = useMemo(() => (
    canImport
      ? { id: "staging", name: stagingName || fileName || "This file", headers, rows, mapping, linkColumn: stagingLink || undefined }
      : null
  ), [canImport, stagingName, fileName, headers, rows, mapping, stagingLink]);

  const mergeList = useMemo(
    () => (stagedSource ? [...committed, stagedSource] : committed),
    [committed, stagedSource],
  );
  const stagingIdx = stagedSource ? mergeList.length - 1 : -1;
  const merging = mergeList.length >= 2;

  // ONE call. The banner the user reads and the rows that get imported come from
  // the same result, so there is no second calculation that could disagree.
  const merge = useMemo(
    () => (merging ? mergeSources(mergeList, crosswalk ?? undefined) : null),
    [merging, mergeList, crosswalk],
  );
  const mergeBlocked = merge?.assessment.verdict === "no-overlap";

  /** Commit the staged file to the merge and clear the staging area for the next. */
  const addToMerge = () => {
    if (!stagedSource) return;
    setCommitted((c) => [...c, { ...stagedSource, id: `src-${c.length}-${Date.now()}` }]);
    setFileName(null); setHeaders([]); setRows([]); setWide(null); setWideResult(null);
    setMapping({}); setXlsxSheets([]); setStagingName(""); setStagingLink("");
  };

  const renameSource = (i: number, name: string) => {
    if (i === stagingIdx) setStagingName(name);
    else setCommitted((c) => c.map((s, j) => (j === i ? { ...s, name } : s)));
  };
  const setSourceLink = (i: number, column: string) => {
    if (i === stagingIdx) setStagingLink(column);
    else setCommitted((c) => c.map((s, j) => (j === i ? { ...s, linkColumn: column || undefined } : s)));
  };
  const removeSource = (i: number) => {
    if (i === stagingIdx) { setFileName(null); setHeaders([]); setRows([]); setMapping({}); setStagingName(""); setStagingLink(""); }
    else setCommitted((c) => c.filter((_, j) => j !== i));
  };

  async function onCrosswalkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const csv = parseCsv(await file.text());
    setCrosswalk(parseCrosswalk(csv.rows));
    setCrosswalkName(file.name);
  }

  /** Clear staging after a successful import. */
  const clearStaging = () => {
    setFileName(null); setHeaders([]); setRows([]); setWide(null); setWideResult(null);
    setMapping({}); setRunName(""); setXlsxSheets([]);
    setCommitted([]); setStagingName(""); setStagingLink("");
    setCrosswalk(null); setCrosswalkName(null);
  };

  async function doImport() {
    if (!canImport && !merging) return;
    if (mergeBlocked) return;                  // refused, not silently merged
    setBusy(true); setErr(null);
    // A merge posts the unified table; everything downstream reads it as an
    // ordinary long-format log and has no idea it came from several systems.
    const payload = merge
      ? { mapping: merge.mapping, headers: merge.headers, rows: merge.rows }
      : { mapping, headers, rows };
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: runName.trim() || "Event log", ...payload, holdoutPct, kpiConfig: pendingKpi.current ?? undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Import failed"); return; }
      pendingKpi.current = null;
      clearStaging();
      onImported(json.run?.id ?? null);
    } finally { setBusy(false); }
  }

  const toggleType = (t: string) => setSelectedTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  // OCEL 2.0 object-centric import: one discovered state machine + run per chosen
  // object type, plus the shared Domain Diagram that links them.
  async function importOcelStudy() {
    if (!ocelText || selectedTypes.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/import-ocel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: runName.trim() || "OCEL log", ocelText, selectedTypes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "OCEL study import failed"); return; }
      setOcelText(null); setOcelTypes([]); clearStaging();
      setOcelDomainId(json.domainDiagramId ?? null);
      onImported(json.runs?.[0]?.id ?? null, json.domainDiagramId ?? null);
    } finally { setBusy(false); }
  }

  return (
    <>
      <section className="md:col-span-2 bg-stone-900 border border-stone-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-amber-200 mb-1">Import an event log</h2>
        <p className="text-xs text-stone-400 mb-3">Upload an event log — <span className="text-stone-300">CSV/TSV</span>, <span className="text-stone-300">Excel</span>, <span className="text-stone-300">XES</span> (IEEE 1849) or <span className="text-stone-300">OCEL</span> JSON — from your source system(s). Map its columns to roles, then import — the process is inferred from the logs.</p>

        {/* Choosable scenarios (adopted example) — pick a period, confirm, import. */}
        {scenarios && scenarios.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-800/60 bg-amber-950/30 p-3 flex flex-col gap-2">
            <p className="text-[11px] text-amber-200 font-medium">Choose a scenario to explore</p>
            <div className="flex flex-wrap gap-1.5">
              {scenarios.map((s, i) => (
                <button
                  key={i}
                  onClick={() => chooseScenario(i)}
                  className={`text-[11px] rounded px-2.5 py-1 border transition ${
                    i === scenarioIdx
                      ? "bg-amber-700 border-amber-500 text-white shadow-[0_0_10px_rgba(217,119,6,0.45)]"
                      : "bg-stone-800 border-stone-600 text-stone-300 hover:border-amber-600 hover:text-amber-200"
                  }`}
                >
                  {s.scenario ?? s.runName ?? `Scenario ${i + 1}`}
                </button>
              ))}
            </div>
            {scenarios[scenarioIdx]?.note && (
              <p className="text-[10px] text-amber-100/70 leading-snug">{scenarios[scenarioIdx].note}</p>
            )}
            <p className="text-[10px] text-stone-400 leading-snug">Same process across different past periods — compliance declines the further back you go. Confirm the analysis below, then import.</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Always offer the built-in example data (when there's no multi-scenario
              picker) — so you can re-load it and Import even after browsing a file. */}
          {builtInSample && (!scenarios || scenarios.length === 0) && (
            <button onClick={() => loadStaging(builtInSample)}
              className="text-xs rounded px-3 py-1.5 border border-amber-700 text-amber-200 hover:bg-amber-950/40">
              📋 Load built-in example data
            </button>
          )}
          <label className="inline-block cursor-pointer text-xs bg-amber-700 hover:bg-amber-600 text-white rounded px-3 py-1.5">
            ⭱ Choose file…
            <input type="file" accept=".csv,.tsv,.txt,text/csv,.xlsx,.xlsm,.xes,.json,.ocel,.jsonocel,.xml,application/xml,application/json" onChange={onFile} className="hidden" />
          </label>
          {/* No adopted example, so no built-in log: offer the served sample
              rather than a file picker on its own. Kept visible afterwards, like
              the built-in button, so it can be come back to. */}
          {!builtInSample && (!scenarios || scenarios.length === 0) && (
            <button onClick={loadSampleLog} disabled={sampleBusy}
              className="text-xs rounded px-3 py-1.5 border border-amber-700 text-amber-200 hover:bg-amber-950/40 disabled:opacity-40">
              {sampleBusy ? "Loading sample…" : "📋 Try it with a sample log"}
            </button>
          )}
          {fileName && <span className="text-[11px] text-stone-400 truncate max-w-[18rem]" title={fileName}>loaded: <span className="text-stone-300">{fileName}</span></span>}
        </div>
        {/* Said once, on the cold start only — it stops being useful the moment
            a log is staged, and says plainly that the data is invented. */}
        {!fileName && !builtInSample && (!scenarios || scenarios.length === 0) && (
          <p className="mt-2 text-[11px] text-stone-500 leading-snug">{SAMPLE_LOG.note}</p>
        )}

        {/* OCEL 2.0 object-centric study — one lifecycle per object type + a Domain Diagram. */}
        {ocelText && ocelTypes.length > 0 && (
          <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-950/20 p-3 flex flex-col gap-2">
            <div className="text-[11px] text-emerald-200">
              <span className="font-semibold">OCEL 2.0 object-centric log</span> — {ocelTypes.length} object type{ocelTypes.length === 1 ? "" : "s"}. Import as a study: one discovered state machine + run per selected type, tied together by a <span className="text-emerald-100">Domain Diagram</span> (object model).
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ocelTypes.map((t) => (
                <label key={t} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded cursor-pointer border ${selectedTypes.includes(t) ? "bg-emerald-800/50 border-emerald-500 text-emerald-100" : "border-stone-600 text-stone-400"}`}>
                  <input type="checkbox" className="accent-emerald-500" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />
                  {t}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input value={runName} onChange={(e) => setRunName(e.target.value)} placeholder="Study name" className={`${inp} min-w-[10rem]`} />
              <button onClick={importOcelStudy} disabled={busy || selectedTypes.length === 0} className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
                {busy ? "Importing…" : `Import OCEL study (${selectedTypes.length})`}
              </button>
              <button onClick={() => setShowJson((v) => !v)} className="text-[11px] text-emerald-300 hover:text-emerald-200 underline">
                {showJson ? "Hide JSON ▾" : "View JSON ▸"}
              </button>
              <span className="text-[10px] text-stone-500">or map columns below to flatten onto a single object (advanced).</span>
            </div>
            {showJson && (
              <pre className="mt-1 max-h-72 overflow-auto rounded bg-stone-950/70 border border-stone-700 p-2 text-[10px] leading-snug text-stone-300 font-mono whitespace-pre">{ocelPretty}</pre>
            )}
          </div>
        )}
        {ocelDomainId && (
          <div className="mt-2 text-[11px] text-emerald-300">
            ✓ OCEL study created. <a href={openDiagram(ocelDomainId)} onClick={stashReturn} className="underline hover:text-emerald-200">Open the object model (Domain Diagram) →</a>
          </div>
        )}

        {/* A workbook with more than one sheet of data: say so and let the user
            choose, rather than importing the first and discarding the rest. */}
        {xlsxSheets.length > 1 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-stone-400">This workbook has {xlsxSheets.length} sheets with data. Import:</span>
            <select defaultValue="0" className={inp}
              onChange={(e) => { const sh = xlsxSheets[Number(e.target.value)]; if (sh) loadSheet(sh, fileName ?? "workbook"); }}>
              {xlsxSheets.map((sh, i) => <option key={sh.name + i} value={i}>{sh.name} ({sh.rows.length} rows)</option>)}
            </select>
          </div>
        )}

        {/* One row per case? Offer to expand it — and say exactly what that would
            do first. Reading such a file as long format yields ONE event per case
            and drops the rest of the row without a word. */}
        {wide && (
          <div className="mt-3 rounded border border-amber-500/50 bg-amber-950/20 p-2.5 flex flex-col gap-1.5">
            <div className="text-[11px] text-amber-200">
              This file looks like <span className="font-semibold">one row per case</span> — the whole
              lifecycle across the row, not one row per event.
            </div>
            <div className="text-[11px] text-stone-300">
              Found {describeWideSpec(wide)}. Read as-is, each case would show
              <span className="font-semibold"> a single step</span> and the rest of its row would be ignored.
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={expandWide} className="text-xs bg-amber-700 hover:bg-amber-600 text-white rounded px-3 py-1.5">⤢ Expand to one row per event</button>
              <button onClick={() => setWide(null)} className="text-xs rounded px-3 py-1.5 border border-stone-600 text-stone-300 hover:bg-stone-800">No, it is already one row per event</button>
            </div>
          </div>
        )}
        {wideResult && (
          <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-950/20 p-2.5 flex flex-col gap-1">
            <div className="text-[11px] text-emerald-200">
              ✓ Expanded to <span className="font-semibold">{wideResult.events}</span> event
              {wideResult.events === 1 ? "" : "s"} across <span className="font-semibold">{wideResult.cases}</span> case
              {wideResult.cases === 1 ? "" : "s"}.
            </div>
            {/* Never silently dropped: a state with no date, or a date naming no
                state, is counted and said out loud. */}
            {wideResult.warnings.map((w, i) => (
              <div key={i} className="text-[11px] text-amber-300/90">⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Merging several systems. Shown as soon as one export is committed, so
            it is visible while the next file is being mapped. */}
        {committed.length > 0 && (
          <MergeCard
            sources={mergeList}
            stagingIdx={stagingIdx}
            onRename={renameSource}
            onSetLink={setSourceLink}
            onRemove={removeSource}
            crosswalkName={crosswalkName}
            crosswalkPairs={crosswalk?.pairs.length ?? 0}
            onCrosswalkFile={onCrosswalkFile}
            onClearCrosswalk={() => { setCrosswalk(null); setCrosswalkName(null); }}
            merge={merge}
          />
        )}

        {headers.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((role) => (
                <label key={role.key} className="flex flex-col gap-0.5" title={role.hint}>
                  <span className="text-[10px] uppercase tracking-wide text-stone-400">{role.label}{role.required && <span className="text-rose-400"> *</span>}</span>
                  <select value={(mapping[role.key] as string) ?? ""} onChange={(e) => setRole(role.key, e.target.value)} className={inp}>
                    <option value="">—</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>

            {/* The columns the nine roles do not claim. Every one used to be
                discarded at parse time, which is why "did invoices over $10,000
                take longer?" was unanswerable from the very file just uploaded.

                DROP IS THE DEFAULT, deliberately: a spare column is as likely to
                hold a customer name as a region, and that is not a decision to
                make on the user's behalf. */}
            {spareColumns.length > 0 && (
              <div className="rounded border border-stone-600 bg-stone-900/40 p-2.5 flex flex-col gap-1.5">
                <div className="text-[11px] text-stone-300">
                  <span className="font-semibold">{spareColumns.length} other column{spareColumns.length === 1 ? "" : "s"}</span> in this file.
                  Keep one to slice by it later; hash it if it identifies a person.
                  Anything left as <em>drop</em> is not stored at all.
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {spareColumns.map((h) => (
                    <label key={h} className="flex items-center gap-2 text-[11px]">
                      <span className="flex-1 min-w-0 truncate text-stone-400" title={h}>{h}</span>
                      <select
                        value={mapping.attributeMode?.[h] ?? "drop"}
                        onChange={(e) => setAttributeMode(h, e.target.value as "keep" | "hash" | "drop")}
                        className={inp + " w-24"}
                      >
                        <option value="drop">drop</option>
                        <option value="keep">keep</option>
                        <option value="hash">hash</option>
                      </select>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[11px] pt-1 border-t border-stone-700">
                  <input
                    type="checkbox"
                    checked={!!mapping.caseId && mapping.attributeMode?.[mapping.caseId] === "hash"}
                    onChange={(e) => { if (mapping.caseId) setAttributeMode(mapping.caseId, e.target.checked ? "hash" : "keep"); }}
                    disabled={!mapping.caseId}
                  />
                  <span className="text-stone-400">
                    Mask the case id &mdash; for when it is really a customer number. Cases still group
                    and join; the original never reaches the database.
                  </span>
                </label>
              </div>
            )}

            {/* Activity → Team table — shown when no Resource column is mapped. */}
            {needsTeamTable && (
              <div className="rounded border border-blue-500/40 bg-blue-950/20 p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[11px] text-blue-200 flex-1 min-w-[12rem]">No <span className="font-semibold">Resource</span> column — set the team per activity, or fill from a Process Diagram&apos;s lanes.</div>
                  <select defaultValue="" onChange={(e) => { void fillFrom(e.target.value, "resource"); e.currentTarget.value = ""; }} className={`${inp} py-0.5 text-[10px]`}>
                    <option value="">✨ Fill from Process Diagram…</option>
                    {enrichDiagrams.filter((d) => d.type === "bpmn").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="max-h-48 overflow-y-auto grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
                  {activities.map((a) => (
                    <Fragment key={a}>
                      <span className="text-[10px] text-stone-300 truncate" title={a}>{a}</span>
                      <span className="text-stone-500 text-[10px]">→</span>
                      <input value={teamFor(a)} placeholder="(team)" onChange={(e) => setActivityResource(a, e.target.value)} className={`${inp} py-0.5 text-[10px]`} />
                    </Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Activity → State table — shown when no State column is mapped. */}
            {needsStateTable && (
              <div className="rounded border border-amber-500/40 bg-amber-950/20 p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[11px] text-amber-200 flex-1 min-w-[12rem]">No <span className="font-semibold">State</span> column mapped — set the state each activity produces, or fill from a State Machine. Defaults to the activity name.</div>
                  <select defaultValue="" onChange={(e) => { void fillFrom(e.target.value, "state"); e.currentTarget.value = ""; }} className={`${inp} py-0.5 text-[10px]`}>
                    <option value="">✨ Fill from State Machine…</option>
                    {enrichDiagrams.filter((d) => d.type === "state-machine").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="max-h-48 overflow-y-auto grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
                  {activities.map((a) => (
                    <Fragment key={a}>
                      <span className="text-[10px] text-stone-300 truncate" title={a}>{a}</span>
                      <span className="text-stone-500 text-[10px]">→</span>
                      <input value={stateFor(a)} onChange={(e) => setActivityState(a, e.target.value)} className={`${inp} py-0.5 text-[10px]`} />
                    </Fragment>
                  ))}
                </div>
                <p className="text-[10px] text-stone-400">{activities.length.toLocaleString()} distinct activities</p>
              </div>
            )}
            {(needsTeamTable || needsStateTable) && enrichMsg && <p className="text-[10px] text-emerald-300">✨ {enrichMsg}</p>}

            {/* Preview */}
            <div className="overflow-x-auto border border-stone-700 rounded">
              <table className="text-[10px] min-w-full">
                <thead className="bg-stone-800 text-stone-400">
                  <tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-stone-800">{headers.map((_, c) => <td key={c} className="px-2 py-1 whitespace-nowrap text-stone-300">{r[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-stone-400">{rows.length.toLocaleString()} rows · previewing first 5</p>

            {/* Advisory mapping verification — confirm the mapping + see what would be dropped */}
            {validation && (
              <div className="rounded border border-stone-700 bg-stone-900/60 p-2.5 flex flex-col gap-1.5 text-[10px]">
                <div className="text-stone-300">
                  <span className="text-amber-200">{validation.usable.toLocaleString()}</span> usable
                  {" · "}
                  {validation.dropped > 0
                    ? <span className="text-rose-300">{validation.dropped.toLocaleString()} dropped</span>
                    : <span className="text-emerald-300">0 dropped</span>}
                  {" · "}<span className="text-stone-200">{validation.distinctCases.toLocaleString()}</span> cases
                  {mapping.activity ? <>{" · "}{validation.distinctActivities.toLocaleString()} activities</> : null}
                  {mapping.state ? <>{" · "}{validation.distinctStates.toLocaleString()} states</> : null}
                </div>
                <div className="text-stone-400">
                  timestamp: <span className={validation.timestampFormat === "unrecognised" ? "text-rose-300" : "text-stone-300"}>{validation.timestampFormat}</span>
                  {validation.from && validation.to ? ` · ${new Date(validation.from).toISOString().slice(0, 10)} → ${new Date(validation.to).toISOString().slice(0, 10)}` : ""}
                </div>
                <div className="flex flex-col gap-0.5">
                  {ROLES.map((r) => (validation.samples[r.key]?.length ? (
                    <div key={r.key} className="text-stone-400 truncate"><span className="text-stone-500">{r.label.replace(/ \(optional\)$/, "")}:</span> {validation.samples[r.key]!.join("  ·  ")}</div>
                  ) : null))}
                </div>
                {validation.warnings.map((w, i) => (
                  <div key={i} className="text-amber-300 leading-snug">⚠ {w.message}</div>
                ))}
              </div>
            )}

          </div>
        )}

        {(headers.length > 0 || merging) && (
          <div className="mt-3 flex flex-col gap-3">
            {/* Another system's export of the SAME cases. Not another month of the
                same system — that is a linked run series, a different question,
                and it lands in a later phase. */}
            {headers.length > 0 && (
              <div>
                <button onClick={addToMerge} disabled={!canImport}
                  className="text-[11px] rounded px-2.5 py-1 border border-stone-600 text-stone-300 hover:border-amber-600 hover:text-amber-200 disabled:opacity-40"
                  title="Add this export to a merge, then load the next system's export of the same cases">
                  ＋ Add another system&rsquo;s export of these cases
                </button>
              </div>
            )}

            {/* The hold-back. Only offered where it can be honoured — at import,
                because the split has to happen before performance is fitted and
                the raw events are gone immediately afterwards. */}
            <div className="rounded border border-stone-600 bg-stone-900/40 p-2.5 flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="text-stone-300">Hold back the most recent</span>
                <select value={holdoutPct} onChange={(e) => setHoldoutPct(Number(e.target.value))} className={`${inp} py-0.5`}>
                  <option value={0}>nothing</option>
                  <option value={0.1}>10% of cases</option>
                  <option value={0.2}>20% of cases</option>
                  <option value={0.3}>30% of cases</option>
                </select>
                <span className="text-stone-300">to test the digital twin against</span>
              </label>
              <p className="text-[10px] text-stone-400 leading-snug">
                {holdoutPct > 0
                  ? <>The twin will be fitted on the earlier <span className="text-stone-300">{Math.round((1 - holdoutPct) * 100)}%</span> of cases and can then be checked against the {Math.round(holdoutPct * 100)}% it never saw. Split by <span className="text-stone-300">date</span>, not at random — a random split leaks the future into the fit. The Insights views still cover every case.</>
                  : <>Without a hold-back, a twin is fitted on every case and then checked against those same cases &mdash; marking its own homework. It is still a useful sanity check, and the validation says so.</>}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input value={runName} onChange={(e) => setRunName(e.target.value)} placeholder="run name" className={`${inp} flex-1`} />
              {rows.length > 0 && (
                <button onClick={() => setShowLog(true)} className="text-xs bg-stone-700 hover:bg-stone-600 text-stone-100 rounded px-3 py-1.5 whitespace-nowrap">
                  🔍 View / filter log
                </button>
              )}
              <button onClick={doImport} disabled={(!canImport && !merging) || mergeBlocked || busy} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
                {busy ? "Importing…" : merging ? `Import merged log (${mergeList.length} systems)` : "Import log"}
              </button>
            </div>
            {headers.length > 0 && !canImport && <p className="text-[10px] text-amber-400">Map case id, activity and timestamp to continue.</p>}
            {mergeBlocked && <p className="text-[10px] text-rose-400">These exports cannot be merged as they stand — link them on a shared key, attach a crosswalk, or remove one.</p>}
          </div>
        )}
        {err && <p className="text-rose-400 text-xs mt-2">{err}</p>}
      </section>

      {showLog && <MiningLogViewer headers={headers} rows={rows} title={fileName ?? "Event log"} onClose={() => setShowLog(false)} />}
    </>
  );
}
