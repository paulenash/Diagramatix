"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ColumnDef {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface SchemaData {
  schema: Record<string, ColumnDef[]>;
  counts: Record<string, number>;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: { name: string }[];
  command: string;
  duration: number;
  error?: string;
}

interface JsonEditorState {
  value: string;           // pretty-printed JSON text
  rowIndex: number;        // which result row
  fieldName: string;       // which column
  tableName: string | null; // for UPDATE (extracted from last query)
  rowId: string | null;    // id column value for UPDATE
  readOnly: boolean;       // true if we can't determine table/id for saving
}

function isJsonValue(val: unknown): boolean {
  return val !== null && typeof val === "object";
}

function extractTableFromSql(sql: string): string | null {
  const m = sql.match(/FROM\s+"?([A-Za-z_]\w*)"?/i);
  return m ? m[1] : null;
}

export function DatabaseClient() {
  const router = useRouter();
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sql, setSql] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [jsonEditor, setJsonEditor] = useState<JsonEditorState | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // ── Full-backup restore state ────────────────────────────────────────
  // Two modes:
  //   wipe       — TRUNCATE then re-insert from snapshot. Requires the
  //                literal word "WIPE" typed in (case-sensitive).
  //   additive   — admin ticks orgs / users / projects / diagrams in a
  //                tree built server-side by inspecting the upload; only
  //                ticked rows are restored, additively.
  type InspectDiagram = { id: string; name: string };
  type InspectProject = { id: string; name: string; diagrams: InspectDiagram[] };
  type InspectTemplate = {
    id: string; name: string; diagramType: string;
    templateType: string; group: string | null;
  };
  type InspectUserInOrg = {
    userId: string; userEmail: string; userName: string | null;
    projects: InspectProject[]; unfiledDiagrams: InspectDiagram[];
    templates: InspectTemplate[]; promptCount: number;
  };
  type InspectOrg = { id: string; name: string; entityType: string; members: InspectUserInOrg[] };
  type InspectTree = {
    meta: { exportedAt: string; exportedBy: string; schemaVersion: string; counts: Record<string, number> };
    orgs: InspectOrg[];
  };
  type RestoreMode = "wipe" | "additive";

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("wipe");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<
    { mode: string; inserted: Record<string, number>; log: string[] } | null
  >(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // ── Rules + Prompts transfer (.diag-rules) ──
  // GET downloads, POST upserts. Used to migrate AI rules + saved
  // prompts from local-dev DB to prod web DB (and vice versa).
  const rulesImportInputRef = useRef<HTMLInputElement | null>(null);
  const [rulesImportBusy, setRulesImportBusy] = useState(false);
  const [rulesImportStatus, setRulesImportStatus] = useState<string | null>(null);
  async function handleRulesImport(file: File) {
    setRulesImportBusy(true);
    setRulesImportStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/rules-prefs", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setRulesImportStatus(`Error: ${json?.error ?? res.statusText}`);
        return;
      }
      const r = json.rules;
      const p = json.prompts;
      const skippedLines = [...r.skippedReasons, ...p.skippedReasons];
      const skippedDetail = skippedLines.length > 0
        ? `\nSkipped (${skippedLines.length}):\n  - ${skippedLines.slice(0, 10).join("\n  - ")}${skippedLines.length > 10 ? `\n  ...and ${skippedLines.length - 10} more` : ""}`
        : "";
      setRulesImportStatus(
        `Rules: ${r.inserted} inserted, ${r.updated} updated, ${r.skipped} skipped\n` +
        `Prompts: ${p.inserted} inserted, ${p.updated} updated, ${p.skipped} skipped` +
        skippedDetail,
      );
    } catch (err) {
      setRulesImportStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRulesImportBusy(false);
    }
  }

  // ── Built-in Templates transfer (.diag_tems) ──
  // Exports + re-imports `DiagramTemplate` rows where `templateType =
  // 'builtin'`. The endpoints already exist (used by the diagram editor's
  // File menu) — this just surfaces them on the admin Database page so an
  // admin can migrate built-in templates between databases without
  // diving into an editor. Conflict policy: import is additive by
  // (name + diagramType), duplicates are skipped (NOT updated).
  const templatesImportInputRef = useRef<HTMLInputElement | null>(null);
  const [templatesImportBusy, setTemplatesImportBusy] = useState(false);
  async function handleTemplatesImport(file: File) {
    setTemplatesImportBusy(true);
    setRulesImportStatus(null);
    try {
      // The endpoint expects a JSON body, not multipart — same shape the
      // editor's import flow uses.
      const text = await file.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch {
        setRulesImportStatus(`Error: ${file.name} is not valid JSON`);
        return;
      }
      const res = await fetch("/api/templates/import?type=builtin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setRulesImportStatus(`Error: ${json?.error ?? res.statusText}`);
        return;
      }
      const skippedDetail = json.skippedNames?.length > 0
        ? `\nSkipped (duplicates by name + diagramType):\n  - ${json.skippedNames.slice(0, 10).join("\n  - ")}${json.skippedNames.length > 10 ? `\n  ...and ${json.skippedNames.length - 10} more` : ""}`
        : "";
      setRulesImportStatus(
        `Built-In Templates: ${json.created} inserted, ${json.skipped} skipped` + skippedDetail,
      );
    } catch (err) {
      setRulesImportStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTemplatesImportBusy(false);
    }
  }

  // Additive-mode tree + selection.
  const [inspectTree, setInspectTree] = useState<InspectTree | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [sel, setSel] = useState<{
    orgIds: Set<string>; userIds: Set<string>;
    projectIds: Set<string>; diagramIds: Set<string>; templateIds: Set<string>;
  }>({ orgIds: new Set(), userIds: new Set(), projectIds: new Set(), diagramIds: new Set(), templateIds: new Set() });

  // Collapse state for the selective-restore tree. Each level tracks
  // EXPANDED ids (not collapsed) so a fresh inspect → fully collapsed
  // by default (the empty Set means "nothing expanded"). User keys are
  // `<orgId>:<userId>` so the same user collapsed under Org A stays
  // independent of their state under Org B.
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  function toggleExpanded(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  }

  async function inspectUpload(file: File) {
    setInspecting(true);
    setInspectTree(null);
    setSel({ orgIds: new Set(), userIds: new Set(), projectIds: new Set(), diagramIds: new Set(), templateIds: new Set() });
    setExpandedOrgs(new Set());
    setExpandedUsers(new Set());
    setExpandedProjects(new Set());
    setRestoreError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", "inspect");
      const res = await fetch("/api/admin/full-backup", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setRestoreError(data.error ?? `HTTP ${res.status}`); return; }
      setInspectTree(data.tree as InspectTree);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setInspecting(false);
    }
  }

  // Mutate the selection sets in one go. Returns a fresh state object so
  // React renders the new ticks.
  function withSelection(mutate: (s: {
    orgIds: Set<string>; userIds: Set<string>;
    projectIds: Set<string>; diagramIds: Set<string>; templateIds: Set<string>;
  }) => void) {
    setSel((cur) => {
      const next = {
        orgIds: new Set(cur.orgIds),
        userIds: new Set(cur.userIds),
        projectIds: new Set(cur.projectIds),
        diagramIds: new Set(cur.diagramIds),
        templateIds: new Set(cur.templateIds),
      };
      mutate(next);
      return next;
    });
  }

  // Cascading tick / untick helpers — ticking a parent ticks all visible
  // descendants; unticking unticks them. The server still computes the
  // dependency closure (a diagram pulls in its project / user / org
  // regardless of what was ticked), so partial ticks are safe.
  function toggleOrg(org: InspectOrg) {
    withSelection((s) => {
      const checked = s.orgIds.has(org.id);
      const apply = (action: "add" | "delete") => {
        s.orgIds[action](org.id);
        for (const m of org.members) {
          s.userIds[action](m.userId);
          for (const p of m.projects) {
            s.projectIds[action](p.id);
            for (const d of p.diagrams) s.diagramIds[action](d.id);
          }
          for (const d of m.unfiledDiagrams) s.diagramIds[action](d.id);
          // Templates are user-scoped — global Set, but cascade picks
          // them up under each org-occurrence so ticking an org also
          // brings in the templates of its members.
          for (const t of m.templates) s.templateIds[action](t.id);
        }
      };
      apply(checked ? "delete" : "add");
    });
  }
  function toggleUserInOrg(m: InspectUserInOrg) {
    withSelection((s) => {
      const checked = s.userIds.has(m.userId);
      const apply = (action: "add" | "delete") => {
        s.userIds[action](m.userId);
        for (const p of m.projects) {
          s.projectIds[action](p.id);
          for (const d of p.diagrams) s.diagramIds[action](d.id);
        }
        for (const d of m.unfiledDiagrams) s.diagramIds[action](d.id);
        for (const t of m.templates) s.templateIds[action](t.id);
      };
      apply(checked ? "delete" : "add");
    });
  }
  function toggleProject(p: InspectProject) {
    withSelection((s) => {
      const checked = s.projectIds.has(p.id);
      const apply = (action: "add" | "delete") => {
        s.projectIds[action](p.id);
        for (const d of p.diagrams) s.diagramIds[action](d.id);
      };
      apply(checked ? "delete" : "add");
    });
  }
  function toggleDiagram(id: string) {
    withSelection((s) => {
      if (s.diagramIds.has(id)) s.diagramIds.delete(id); else s.diagramIds.add(id);
    });
  }
  function toggleTemplate(id: string) {
    withSelection((s) => {
      if (s.templateIds.has(id)) s.templateIds.delete(id); else s.templateIds.add(id);
    });
  }

  async function runWipeRestore() {
    if (!restoreFile) return;
    if (restoreConfirm !== "WIPE") {
      setRestoreError("Type WIPE (uppercase) to confirm.");
      return;
    }
    setRestoreRunning(true);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const fd = new FormData();
      fd.set("file", restoreFile);
      fd.set("mode", "wipe");
      fd.set("confirmPhrase", "WIPE");
      const res = await fetch("/api/admin/full-backup", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setRestoreError(data.error ?? `HTTP ${res.status}`); return; }
      setRestoreResult(data.result);
      const r = await fetch("/api/admin/database");
      if (r.ok) setSchemaData(await r.json());
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoreRunning(false);
    }
  }

  async function runAdditiveRestore() {
    if (!restoreFile) return;
    const selections = {
      orgIds: [...sel.orgIds],
      userIds: [...sel.userIds],
      projectIds: [...sel.projectIds],
      diagramIds: [...sel.diagramIds],
      templateIds: [...sel.templateIds],
    };
    const total = selections.orgIds.length + selections.userIds.length
      + selections.projectIds.length + selections.diagramIds.length
      + selections.templateIds.length;
    if (total === 0) {
      setRestoreError("Tick at least one row in the tree.");
      return;
    }
    setRestoreRunning(true);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const fd = new FormData();
      fd.set("file", restoreFile);
      fd.set("mode", "additive");
      fd.set("selections", JSON.stringify(selections));
      const res = await fetch("/api/admin/full-backup", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setRestoreError(data.error ?? `HTTP ${res.status}`); return; }
      setRestoreResult(data.result);
      const r = await fetch("/api/admin/database");
      if (r.ok) setSchemaData(await r.json());
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoreRunning(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/database")
      .then((r) => r.ok ? r.json() : null)
      .then((data: SchemaData | null) => { if (data) setSchemaData(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function executeQuery() {
    if (!sql.trim()) return;
    setExecuting(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sql.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setQueryError(data.error);
      } else {
        setQueryResult(data);
        // Refresh schema if it was a DDL command
        if (/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)/i.test(sql)) {
          fetch("/api/admin/database")
            .then((r) => r.ok ? r.json() : null)
            .then((d: SchemaData | null) => { if (d) setSchemaData(d); })
            .catch(() => {});
        }
      }
      setHistory((prev) => [sql.trim(), ...prev.slice(0, 49)]);
      setHistoryIndex(-1);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeQuery();
    }
    if (e.key === "ArrowUp" && e.altKey && history.length > 0) {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setSql(history[newIndex]);
    }
    if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setSql(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setSql("");
      }
    }
  }

  function handleTableClick(table: string) {
    setSelectedTable(table === selectedTable ? null : table);
    setSql(`SELECT * FROM "${table}" LIMIT 50`);
  }

  function openJsonEditor(rowIndex: number, fieldName: string, val: unknown) {
    const tableName = extractTableFromSql(sql);
    const row = queryResult?.rows[rowIndex];
    const rowId = row?.id ? String(row.id) : null;
    const canEdit = !!tableName && !!rowId;
    setJsonError(null);
    setJsonEditor({
      value: JSON.stringify(val, null, 2),
      rowIndex,
      fieldName,
      tableName,
      rowId,
      readOnly: !canEdit,
    });
  }

  async function saveJsonEdit() {
    if (!jsonEditor || jsonEditor.readOnly || !jsonEditor.tableName || !jsonEditor.rowId) return;
    setJsonSaving(true);
    setJsonError(null);

    // Validate JSON
    try {
      JSON.parse(jsonEditor.value);
    } catch {
      setJsonError("Invalid JSON syntax");
      setJsonSaving(false);
      return;
    }

    try {
      const updateSql = `UPDATE "${jsonEditor.tableName}" SET "${jsonEditor.fieldName}" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`;
      const res = await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: updateSql, params: [jsonEditor.value, jsonEditor.rowId] }),
      });
      const data = await res.json();
      if (data.error) {
        setJsonError(data.error);
      } else {
        // Update the local result row
        if (queryResult) {
          const updated = { ...queryResult };
          updated.rows = [...updated.rows];
          updated.rows[jsonEditor.rowIndex] = {
            ...updated.rows[jsonEditor.rowIndex],
            [jsonEditor.fieldName]: JSON.parse(jsonEditor.value),
          };
          setQueryResult(updated);
        }
        setJsonEditor(null);
      }
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    } finally {
      setJsonSaving(false);
    }
  }

  function formatValue(val: unknown): string {
    if (val === null) return "NULL";
    if (val === undefined) return "";
    if (typeof val === "object") {
      const s = JSON.stringify(val);
      return s.length > 100 ? s.slice(0, 100) + "\u2026" : s;
    }
    const s = String(val);
    return s.length > 100 ? s.slice(0, 100) + "\u2026" : s;
  }

  const tableNames = schemaData ? Object.keys(schemaData.schema).sort() : [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/admin")}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"\u2190"}</span>
            <span className="underline">SuperAdmin</span>
          </button>
          {/* Brand icon: matches placement on every other admin sub-screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">Database Manager</h1>
          <span className="text-xs text-gray-400">PGlite :51214</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Admin FULL system backup \u2014 every row, every table, including
              password hashes + OAuth tokens. Treat the downloaded file
              as a credential. Restore (wipe / additive) lands in a
              follow-up phase. */}
          <a
            href="/api/admin/full-backup"
            download
            className="text-xs text-white bg-red-600 hover:bg-red-700 rounded px-2.5 py-1"
            title="Download a full system snapshot (every row, every table \u2014 sensitive)"
          >
            FULL Backup
          </a>
          <button
            onClick={() => {
              setShowRestoreModal(true);
              setRestoreFile(null);
              setRestoreConfirm("");
              setRestoreError(null);
              setRestoreResult(null);
            }}
            className="text-xs text-red-700 border border-red-300 hover:bg-red-50 rounded px-2.5 py-1"
            title="Full system restore from a .diag-full snapshot \u2014 wipe or selective"
          >
            Full &amp; Selective Restore
          </button>
          {/* Rules + Prompts transfer \u2014 for migrating AI configuration
              between databases (local-dev \u2192 prod, etc.). Additive merge
              by id; never deletes rows on the target. Treats user/org
              FKs gracefully \u2014 references that don't exist on the target
              are skipped with a per-row reason in the status output. */}
          <a
            href="/api/admin/rules-prefs"
            download
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded px-2.5 py-1"
            title="Download AI Rules + Prompts as a .diag-rules file"
          >
            Rules &amp; Prompts &darr;
          </a>
          <button
            onClick={() => {
              setRulesImportStatus(null);
              rulesImportInputRef.current?.click();
            }}
            disabled={rulesImportBusy}
            className="text-xs text-blue-700 border border-blue-300 hover:bg-blue-50 rounded px-2.5 py-1 disabled:opacity-50"
            title="Import AI Rules + Prompts from a .diag-rules file (additive merge)"
          >
            {rulesImportBusy ? "Importing\u2026" : "Rules & Prompts \u2191"}
          </button>
          <input
            ref={rulesImportInputRef}
            type="file"
            accept=".diag-rules,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleRulesImport(f);
              e.currentTarget.value = "";
            }}
          />
          {/* Built-In Templates transfer \u2014 admin-managed templates that
              are shared across all users. Same migration use case as
              Rules & Prompts: keep local-dev and prod web in sync. */}
          <a
            href="/api/templates/export?type=builtin"
            download
            className="text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2.5 py-1"
            title="Download built-in templates as a .diag_tems file"
          >
            Built-In Templates &darr;
          </a>
          <button
            onClick={() => {
              setRulesImportStatus(null);
              templatesImportInputRef.current?.click();
            }}
            disabled={templatesImportBusy}
            className="text-xs text-emerald-700 border border-emerald-300 hover:bg-emerald-50 rounded px-2.5 py-1 disabled:opacity-50"
            title="Import built-in templates from a .diag_tems file (additive \u2014 duplicates by name+type are skipped)"
          >
            {templatesImportBusy ? "Importing\u2026" : "Built-In Templates \u2191"}
          </button>
          <input
            ref={templatesImportInputRef}
            type="file"
            accept=".diag_tems,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleTemplatesImport(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            onClick={() => {
              setLoading(true);
              fetch("/api/admin/database")
                .then((r) => r.ok ? r.json() : null)
                .then((d: SchemaData | null) => { if (d) setSchemaData(d); })
                .catch(() => {})
                .finally(() => setLoading(false));
            }}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-2 py-1"
            title="Refresh schema"
          >
            {"\u21BB"}
          </button>
        </div>
      </header>

      {/* Rules + Prompts import status banner. Dismissible. */}
      {rulesImportStatus && (
        <div className={`px-6 py-2 border-b text-xs whitespace-pre-line ${rulesImportStatus.startsWith("Error") ? "bg-red-50 border-red-200 text-red-700" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
          <div className="flex items-start justify-between gap-3">
            <pre className="font-mono whitespace-pre-wrap flex-1">{rulesImportStatus}</pre>
            <button
              onClick={() => setRulesImportStatus(null)}
              className="text-gray-500 hover:text-gray-700 text-xs"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Table list */}
        <aside className="w-56 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tables</span>
          </div>
          {loading ? (
            <p className="px-3 py-4 text-xs text-gray-400">Loading...</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {tableNames.map((t) => (
                <div key={t}>
                  <button
                    onClick={() => handleTableClick(t)}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-gray-50 ${
                      selectedTable === t ? "bg-blue-50 text-blue-800 font-medium" : "text-gray-700"
                    }`}
                  >
                    <span className="truncate">{t}</span>
                    <span className="text-[10px] text-gray-400 ml-1 shrink-0">
                      {schemaData?.counts[t] ?? 0}
                    </span>
                  </button>
                  {selectedTable === t && schemaData?.schema[t] && (
                    <div className="bg-gray-50 px-3 py-1 border-t border-gray-100">
                      {schemaData.schema[t].map((col) => (
                        <div key={col.column_name} className="flex items-center gap-1 py-0.5">
                          <span className="text-[10px] text-gray-800 font-mono truncate flex-1">
                            {col.column_name}
                          </span>
                          <span className="text-[9px] text-gray-400 font-mono shrink-0">
                            {col.data_type}
                          </span>
                          {col.is_nullable === "NO" && (
                            <span className="text-[8px] text-red-400 shrink-0">NN</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Right: SQL editor + results */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* SQL editor */}
          <div className="border-b border-gray-200 p-3 bg-white flex-shrink-0">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter SQL query... (Ctrl+Enter to execute, Alt+Up/Down for history)"
                  rows={3}
                  className="w-full font-mono text-xs border border-gray-300 rounded px-3 py-2 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-y"
                  spellCheck={false}
                />
              </div>
              <button
                onClick={executeQuery}
                disabled={executing || !sql.trim()}
                className={`px-4 py-2 text-xs font-medium rounded ${
                  executing
                    ? "bg-yellow-50 text-yellow-700 border border-yellow-300"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                } disabled:opacity-50`}
              >
                {executing ? "Running..." : "Execute"}
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-gray-400">Ctrl+Enter to execute</span>
              <span className="text-[10px] text-gray-400">Alt+Up/Down for history</span>
              {queryResult && (
                <span className="text-[10px] text-green-600">
                  {queryResult.command} — {queryResult.rowCount} row(s) in {queryResult.duration}ms
                </span>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {queryError && (
              <div className="m-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-mono whitespace-pre-wrap">
                {queryError}
              </div>
            )}
            {queryResult && queryResult.rows.length > 0 && (
              <div className="p-3">
                <div className="overflow-auto border border-gray-200 rounded">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 sticky top-0 bg-gray-50">
                          #
                        </th>
                        {queryResult.fields.map((f) => (
                          <th
                            key={f.name}
                            className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 sticky top-0 bg-gray-50"
                          >
                            {f.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {queryResult.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-blue-50">
                          <td className="px-2 py-1 text-gray-400 font-mono">{i + 1}</td>
                          {queryResult.fields.map((f) => {
                            const val = row[f.name];
                            const isJson = isJsonValue(val);
                            return (
                              <td
                                key={f.name}
                                className={`px-2 py-1 font-mono max-w-xs truncate ${
                                  val === null ? "text-gray-300 italic" :
                                  isJson ? "text-purple-700 cursor-pointer hover:bg-purple-50" : "text-gray-800"
                                }`}
                                title={isJson ? "Click to view/edit JSON" : String(val ?? "")}
                                onClick={isJson ? (e) => { e.stopPropagation(); openJsonEditor(i, f.name, val); } : undefined}
                              >
                                {isJson && <span className="text-purple-400 mr-1">{"{}"}</span>}
                                {formatValue(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {queryResult && queryResult.rows.length === 0 && !queryError && (
              <div className="m-3 p-3 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                {queryResult.command} completed — {queryResult.rowCount} row(s) affected ({queryResult.duration}ms)
              </div>
            )}
          </div>
        </main>
      </div>

      {/* JSON Viewer/Editor Modal */}
      {jsonEditor && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {jsonEditor.readOnly ? "JSON Viewer" : "JSON Editor"}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {jsonEditor.tableName ? `${jsonEditor.tableName}.${jsonEditor.fieldName}` : jsonEditor.fieldName}
                  {jsonEditor.rowId ? ` (id: ${jsonEditor.rowId})` : ""}
                  {jsonEditor.readOnly && <span className="text-orange-500 ml-2">Read-only (no id column found)</span>}
                </p>
              </div>
              <button
                onClick={() => setJsonEditor(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              <textarea
                value={jsonEditor.value}
                onChange={jsonEditor.readOnly ? undefined : (e) => setJsonEditor({ ...jsonEditor, value: e.target.value })}
                readOnly={jsonEditor.readOnly}
                className={`w-full h-full min-h-[300px] font-mono text-xs border rounded px-3 py-2 resize-none outline-none ${
                  jsonEditor.readOnly
                    ? "bg-gray-50 border-gray-200 text-gray-700"
                    : "border-gray-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                }`}
                spellCheck={false}
              />
            </div>

            {jsonError && (
              <div className="px-5 pb-2">
                <p className="text-xs text-red-600 font-mono">{jsonError}</p>
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    try {
                      const formatted = JSON.stringify(JSON.parse(jsonEditor.value), null, 2);
                      setJsonEditor({ ...jsonEditor, value: formatted });
                      setJsonError(null);
                    } catch {
                      setJsonError("Invalid JSON — cannot format");
                    }
                  }}
                  className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                >
                  Format
                </button>
                <button
                  onClick={() => {
                    try {
                      const compact = JSON.stringify(JSON.parse(jsonEditor.value));
                      setJsonEditor({ ...jsonEditor, value: compact });
                      setJsonError(null);
                    } catch {
                      setJsonError("Invalid JSON — cannot compact");
                    }
                  }}
                  className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                >
                  Compact
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setJsonEditor(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                >
                  {jsonEditor.readOnly ? "Close" : "Cancel"}
                </button>
                {!jsonEditor.readOnly && (
                  <button
                    onClick={saveJsonEdit}
                    disabled={jsonSaving}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {jsonSaving ? "Saving..." : "Save to Database"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FULL Restore modal ─────────────────────────────────────────
          Two modes:
          • Wipe & Reload (destructive) — TRUNCATE then re-insert
            every row. Requires typed WIPE confirm.
          • Selective (Additive) — admin ticks orgs / users / projects /
            diagrams in a server-built tree; only ticked rows are
            inserted, additively. Email-matching users are re-parented
            onto the live row to avoid unique-email collisions. */}
      {showRestoreModal && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
          onClick={restoreRunning ? undefined : () => setShowRestoreModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">FULL Restore</h2>
              <button
                onClick={() => setShowRestoreModal(false)}
                disabled={restoreRunning}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none disabled:opacity-30"
              >
                &times;
              </button>
            </div>

            <div className="px-4 pt-3 border-b flex gap-1">
              <button
                onClick={() => { setRestoreMode("wipe"); setRestoreError(null); setRestoreResult(null); }}
                disabled={restoreRunning}
                className={`px-3 py-1.5 text-xs rounded-t border-b-2 ${restoreMode === "wipe"
                  ? "border-red-600 text-red-700 font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                Wipe & Reload
              </button>
              <button
                onClick={() => { setRestoreMode("additive"); setRestoreError(null); setRestoreResult(null); }}
                disabled={restoreRunning}
                className={`px-3 py-1.5 text-xs rounded-t border-b-2 ${restoreMode === "additive"
                  ? "border-blue-600 text-blue-700 font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                Selective (Additive)
              </button>
            </div>

            <div className="px-4 py-4 space-y-3 overflow-y-auto">
              {/* Common file picker */}
              <div>
                <label className="block text-xs text-gray-700 mb-1">Snapshot file (.diag-full)</label>
                <input
                  type="file"
                  accept=".diag-full,application/zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setRestoreFile(f);
                    setInspectTree(null);
                    setSel({ orgIds: new Set(), userIds: new Set(), projectIds: new Set(), diagramIds: new Set(), templateIds: new Set() });
    setExpandedOrgs(new Set());
    setExpandedUsers(new Set());
    setExpandedProjects(new Set());
                    setRestoreError(null);
                    setRestoreResult(null);
                    // Auto-inspect in additive mode so the tree appears immediately.
                    if (f && restoreMode === "additive") void inspectUpload(f);
                  }}
                  disabled={restoreRunning}
                  className="block w-full text-xs file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                {restoreFile && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Selected: {restoreFile.name} ({(restoreFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {restoreMode === "wipe" && (
                <>
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    <span className="font-semibold">Destructive.</span> Every table will be truncated and
                    re-populated from the snapshot. Data created since the snapshot is lost. Your session
                    survives only if your user row is in the snapshot.
                  </p>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">
                      Type <span className="font-mono font-semibold">WIPE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={restoreConfirm}
                      onChange={(e) => setRestoreConfirm(e.target.value)}
                      disabled={restoreRunning}
                      placeholder="WIPE"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                    />
                  </div>
                </>
              )}

              {restoreMode === "additive" && (
                <>
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                    Tick the rows to restore. Ticking a parent auto-ticks its descendants. Users whose
                    email matches an existing live account are re-parented onto that account (no duplicate
                    users). The server pulls in dependencies (a ticked diagram brings its project, user,
                    and org) regardless of what else is ticked.
                  </p>
                  {inspecting && <p className="text-xs text-gray-500">Inspecting snapshot…</p>}
                  {inspectTree && (
                    <>
                      <div className="text-[10px] text-gray-500 flex items-center gap-2 flex-wrap">
                        <span>
                          Snapshot from <span className="font-mono">{inspectTree.meta.exportedAt}</span>
                          {" "}by {inspectTree.meta.exportedBy}
                          {" — "}{Object.entries(inspectTree.meta.counts).map(([k, n]) => `${k}:${n}`).join(", ")}
                        </span>
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              // Expand every node: every Org, every (org:user) pair, every Project.
                              const allOrgs = new Set(inspectTree.orgs.map(o => o.id));
                              const allUsers = new Set<string>();
                              const allProjects = new Set<string>();
                              for (const o of inspectTree.orgs) {
                                for (const m of o.members) {
                                  allUsers.add(`${o.id}:${m.userId}`);
                                  for (const p of m.projects) allProjects.add(p.id);
                                }
                              }
                              setExpandedOrgs(allOrgs);
                              setExpandedUsers(allUsers);
                              setExpandedProjects(allProjects);
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                          >Expand all</button>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedOrgs(new Set());
                              setExpandedUsers(new Set());
                              setExpandedProjects(new Set());
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                          >Collapse all</button>
                        </span>
                      </div>
                      <div className="border border-gray-200 rounded p-2 text-[11px] max-h-[40vh] overflow-y-auto">
                        {inspectTree.orgs.length === 0 && (
                          <p className="text-gray-500 italic">Snapshot is empty.</p>
                        )}
                        {inspectTree.orgs.map((org) => {
                          const orgOpen = expandedOrgs.has(org.id);
                          return (
                          <div key={org.id} className="mb-2">
                            <div className="flex items-center gap-1 font-semibold text-gray-800">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(expandedOrgs, setExpandedOrgs, org.id)}
                                className="w-3 text-gray-400 hover:text-gray-700 select-none"
                                title={orgOpen ? "Collapse" : "Expand"}
                              >
                                {orgOpen ? "▼" : "▶"}
                              </button>
                              <input
                                type="checkbox"
                                checked={sel.orgIds.has(org.id)}
                                onChange={() => toggleOrg(org)}
                                disabled={restoreRunning}
                              />
                              <span>Org · {org.name}</span>
                              <span className="text-gray-400 font-normal text-[9px]">({org.entityType})</span>
                              <span className="text-gray-400 font-normal text-[9px] ml-auto">
                                {org.members.length} member{org.members.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            {orgOpen && (
                            <div className="ml-4 mt-0.5">
                              {org.members.length === 0 && (
                                <p className="text-gray-400 italic text-[10px]">No members</p>
                              )}
                              {org.members.map((m) => {
                                const userKey = `${org.id}:${m.userId}`;
                                const userOpen = expandedUsers.has(userKey);
                                return (
                                <div key={userKey} className="mt-1">
                                  <div className="flex items-center gap-1 text-gray-700">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpanded(expandedUsers, setExpandedUsers, userKey)}
                                      className="w-3 text-gray-400 hover:text-gray-700 select-none"
                                      title={userOpen ? "Collapse" : "Expand"}
                                    >
                                      {userOpen ? "▼" : "▶"}
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={sel.userIds.has(m.userId)}
                                      onChange={() => toggleUserInOrg(m)}
                                      disabled={restoreRunning}
                                    />
                                    <span>User · {m.userEmail}</span>
                                    {(m.promptCount > 0 || m.templates.length > 0) && (
                                      <span className="text-gray-400 text-[9px]">
                                        {m.promptCount > 0 && ` · ${m.promptCount} prompt(s)`}
                                        {m.templates.length > 0 && ` · ${m.templates.length} template(s)`}
                                      </span>
                                    )}
                                  </div>
                                  {userOpen && (
                                  <div className="ml-4">
                                    {m.projects.map((p) => {
                                      const projectOpen = expandedProjects.has(p.id);
                                      return (
                                      <div key={p.id} className="mt-0.5">
                                        <div className="flex items-center gap-1 text-gray-700">
                                          <button
                                            type="button"
                                            onClick={() => toggleExpanded(expandedProjects, setExpandedProjects, p.id)}
                                            className="w-3 text-gray-400 hover:text-gray-700 select-none"
                                            title={projectOpen ? "Collapse" : "Expand"}
                                          >
                                            {projectOpen ? "▼" : "▶"}
                                          </button>
                                          <input
                                            type="checkbox"
                                            checked={sel.projectIds.has(p.id)}
                                            onChange={() => toggleProject(p)}
                                            disabled={restoreRunning}
                                          />
                                          <span>Project · {p.name}</span>
                                          <span className="text-gray-400 text-[9px]">({p.diagrams.length} diagram{p.diagrams.length === 1 ? "" : "s"})</span>
                                        </div>
                                        {projectOpen && (
                                        <div className="ml-4">
                                          {p.diagrams.map((d) => (
                                            <label key={d.id} className="flex items-center gap-1 text-gray-600">
                                              <span className="w-3" />
                                              <input
                                                type="checkbox"
                                                checked={sel.diagramIds.has(d.id)}
                                                onChange={() => toggleDiagram(d.id)}
                                                disabled={restoreRunning}
                                              />
                                              <span>Diagram · {d.name}</span>
                                            </label>
                                          ))}
                                        </div>
                                        )}
                                      </div>
                                      );
                                    })}
                                    {m.unfiledDiagrams.length > 0 && (
                                      <div className="mt-0.5">
                                        <p className="text-[9px] uppercase tracking-wide text-gray-400 ml-3">Unfiled diagrams</p>
                                        {m.unfiledDiagrams.map((d) => (
                                          <label key={d.id} className="flex items-center gap-1 text-gray-600 ml-3">
                                            <span className="w-3" />
                                            <input
                                              type="checkbox"
                                              checked={sel.diagramIds.has(d.id)}
                                              onChange={() => toggleDiagram(d.id)}
                                              disabled={restoreRunning}
                                            />
                                            <span>Diagram · {d.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                    {m.templates.length > 0 && (
                                      <div className="mt-0.5">
                                        <p className="text-[9px] uppercase tracking-wide text-gray-400 ml-3">Templates</p>
                                        {m.templates.map((t) => (
                                          <label key={t.id} className="flex items-center gap-1 text-gray-600 ml-3">
                                            <span className="w-3" />
                                            <input
                                              type="checkbox"
                                              checked={sel.templateIds.has(t.id)}
                                              onChange={() => toggleTemplate(t.id)}
                                              disabled={restoreRunning}
                                            />
                                            <span>Template · {t.name}</span>
                                            <span className="text-gray-400 text-[9px]">
                                              ({t.templateType}
                                              {t.group ? ` · ${t.group}` : ""})
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-500">
                        Selected: {sel.orgIds.size} org · {sel.userIds.size} user · {sel.projectIds.size} project · {sel.diagramIds.size} diagram · {sel.templateIds.size} template
                      </p>
                    </>
                  )}
                </>
              )}

              {restoreError && (
                <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {restoreError}
                </div>
              )}

              {restoreResult && (
                <div className="text-[11px] bg-green-50 border border-green-200 rounded px-3 py-2 space-y-1">
                  <p className="font-semibold text-green-800">Restore complete ({restoreResult.mode}).</p>
                  <ul className="text-green-700 font-mono">
                    {Object.entries(restoreResult.inserted).map(([m, n]) => (
                      <li key={m}>{m}: {n} row(s)</li>
                    ))}
                  </ul>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-green-700">Log</summary>
                    <pre className="text-[10px] whitespace-pre-wrap mt-1">{restoreResult.log.join("\n")}</pre>
                  </details>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowRestoreModal(false)}
                disabled={restoreRunning}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {restoreResult ? "Close" : "Cancel"}
              </button>
              {!restoreResult && restoreMode === "wipe" && (
                <button
                  onClick={runWipeRestore}
                  disabled={restoreRunning || !restoreFile || restoreConfirm !== "WIPE"}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {restoreRunning ? "Restoring…" : "Wipe & Restore"}
                </button>
              )}
              {!restoreResult && restoreMode === "additive" && (
                <button
                  onClick={runAdditiveRestore}
                  disabled={restoreRunning || !restoreFile || !inspectTree
                    || (sel.orgIds.size + sel.userIds.size + sel.projectIds.size + sel.diagramIds.size + sel.templateIds.size) === 0}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {restoreRunning ? "Restoring…" : "Restore Selected"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
