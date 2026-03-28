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
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            {"\u2190"} Admin
          </button>
          <h1 className="font-semibold text-gray-900">Database Manager</h1>
          <span className="text-xs text-gray-400">PGlite :51214</span>
        </div>
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
      </header>

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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
    </div>
  );
}
