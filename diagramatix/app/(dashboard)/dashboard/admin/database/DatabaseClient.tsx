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
                          {queryResult.fields.map((f) => (
                            <td
                              key={f.name}
                              className={`px-2 py-1 font-mono max-w-xs truncate ${
                                row[f.name] === null ? "text-gray-300 italic" : "text-gray-800"
                              }`}
                              title={String(row[f.name] ?? "")}
                            >
                              {formatValue(row[f.name])}
                            </td>
                          ))}
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
    </div>
  );
}
