"use client";

/**
 * Standalone Markdown documents (Product Updates / Release Notes) authored with
 * the same WYSIWYG editor and saved to SharePoint as .md files. Documents are
 * independent of the guide DB; open one back from SharePoint to keep editing.
 */
import { useState } from "react";
import { GuideEditor } from "./GuideEditor";
import { SharePointPicker, type SharePointSelection } from "@/app/components/SharePointPicker";
import { DOC_TYPES, docTemplate, type DocType } from "@/app/lib/help/docTemplates";
import { embedMarkdownImages } from "@/app/lib/help/embedImages";

type Doc = { id: string; name: string; markdown: string };

let seq = 0;
const uid = () => `doc-${++seq}`;
const safeName = (n: string) => (n.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "document");

export function DocumentsTab() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [newMenu, setNewMenu] = useState(false);
  const [picker, setPicker] = useState<null | "save" | "open">(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sel = docs.find((d) => d.id === selId) ?? null;

  function create(type: DocType) {
    const t = DOC_TYPES.find((x) => x.id === type)!;
    const doc: Doc = { id: uid(), name: t.defaultName, markdown: docTemplate(type) };
    setDocs((ds) => [...ds, doc]); setSelId(doc.id);
    setNewMenu(false); setStatus(null); setErr(null);
  }
  const patch = (id: string, p: Partial<Doc>) => setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
  function close(id: string) { setDocs((ds) => ds.filter((d) => d.id !== id)); if (selId === id) setSelId(null); }

  async function onSavePick(folder: SharePointSelection) {
    setPicker(null);
    const doc = sel; if (!doc) return;
    setBusy(true); setErr(null); setStatus(null);
    try {
      const filename = `${safeName(doc.name)}.md`;
      // Embed library images as base64 so the SharePoint .md renders standalone.
      const md = await embedMarkdownImages(doc.markdown);
      const fd = new FormData();
      fd.append("driveId", folder.driveId);
      if (folder.itemId) fd.append("folderItemId", folder.itemId);
      fd.append("filename", filename);
      fd.append("contentType", "text/markdown");
      fd.append("file", new Blob([md], { type: "text/markdown" }), filename);
      const r = await fetch("/api/sharepoint/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Upload failed");
      setStatus(`Saved “${filename}” to ${folder.name}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function onOpenPick(file: SharePointSelection) {
    setPicker(null);
    if (!file.itemId) return;
    setBusy(true); setErr(null); setStatus(null);
    try {
      const r = await fetch(`/api/sharepoint/download?driveId=${encodeURIComponent(file.driveId)}&itemId=${encodeURIComponent(file.itemId)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Download failed");
      const text = await r.text();
      const doc: Doc = { id: uid(), name: file.name.replace(/\.md$/i, ""), markdown: text };
      setDocs((ds) => [...ds, doc]); setSelId(doc.id);
      setStatus(`Opened “${file.name}”.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Open failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-[240px_1fr] gap-5">
      {/* Document list + actions */}
      <nav className="bg-white border border-gray-200 rounded-lg p-2 h-fit">
        <div className="relative">
          <button onClick={() => setNewMenu((o) => !o)} className="w-full text-xs px-2 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">+ New document ▾</button>
          {newMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setNewMenu(false)} />
              <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg">
                {DOC_TYPES.map((t) => (
                  <button key={t.id} onClick={() => create(t.id)} className="block w-full text-left text-xs px-3 py-1.5 text-gray-700 hover:bg-blue-50">{t.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={() => setPicker("open")} className="w-full mt-2 text-xs px-2 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Open from SharePoint…</button>

        <div className="mt-3 border-t border-gray-100 pt-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1">Open documents</span>
          {docs.length === 0 && <p className="text-xs text-gray-400 italic px-1 mt-1">None open.</p>}
          <ol className="space-y-0.5 mt-1">
            {docs.map((d) => (
              <li key={d.id} className={`group flex items-center gap-1 px-2 py-1 rounded text-sm ${d.id === selId ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <button onClick={() => setSelId(d.id)} className="flex-1 text-left truncate text-gray-700">{d.name}</button>
                <button title="Close" onClick={() => close(d.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600">✕</button>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {/* Editor */}
      <main className="space-y-3">
        {(status || err) && (
          <div className={`text-xs px-3 py-2 rounded ${err ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{err ?? status}</div>
        )}
        {!sel ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
            Create a new <strong>Product Update</strong> or <strong>Release Notes</strong> document, or open one from SharePoint.
            Documents are saved to SharePoint as <code>.md</code> files.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input value={sel.name} onChange={(e) => patch(sel.id, { name: e.target.value })}
                placeholder="Document name" className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-medium text-gray-800" />
              <button onClick={() => setPicker("save")} disabled={busy}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? "Working…" : "Save to SharePoint"}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">Saves as <code>{safeName(sel.name)}.md</code>. Requires your Microsoft account to be connected.</p>
            <GuideEditor key={sel.id} value={sel.markdown} onChange={(md) => patch(sel.id, { markdown: md })} />
          </div>
        )}
      </main>

      {picker === "save" && (
        <SharePointPicker mode="folder" title="Save document to SharePoint" confirmLabel="Save here" onPick={onSavePick} onCancel={() => setPicker(null)} />
      )}
      {picker === "open" && (
        <SharePointPicker mode="file" title="Open a Markdown document" fileExtensions={[".md"]} confirmLabel="Open" onPick={onOpenPick} onCancel={() => setPicker(null)} />
      )}
    </div>
  );
}
