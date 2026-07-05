"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { GuideEditor } from "./GuideEditor";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { DocumentsTab } from "./DocumentsTab";
import { GuidePreview } from "./GuidePreview";
import { exportGuideZip, exportGuideSelfContained } from "./exportGuide";

type Section = {
  heading: string | null;
  bodyMarkdown: string;
  adminOnly: boolean;
  image: string | null;
  imageAlt: string | null;
  imageCaption: string | null;
};
type Chapter = { slug: string; title: string; adminOnly: boolean; sections: Section[] };

const newSection = (): Section => ({ heading: "", bodyMarkdown: "", adminOnly: false, image: null, imageAlt: null, imageCaption: null });
const newChapter = (n: number): Chapter => ({ slug: `new-chapter-${n}`, title: "New chapter", adminOnly: false, sections: [newSection()] });

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const COLLECTION_LABEL: Record<string, string> = { "user-guide": "User Guide", "tech-design": "Technical Design Notes" };

export function UserGuideEditorClient() {
  const searchParams = useSearchParams();
  const initialCollection = searchParams.get("collection") === "tech-design" ? "tech-design" : "user-guide";
  const [collection, setCollection] = useState<"user-guide" | "tech-design">(initialCollection);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [snapshot, setSnapshot] = useState("");
  const [selCh, setSelCh] = useState(0);
  const [selSec, setSelSec] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const [confirm, setConfirm] = useState<null | { msg: string; onYes: () => void }>(null);
  const [tab, setTab] = useState<"guide" | "documents">("guide");
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [exportMenu, setExportMenu] = useState(false);
  const [pickImage, setPickImage] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [imgNames, setImgNames] = useState<Record<string, string>>({}); // image URL → filename

  // Friendly name for an image URL (library map, else the path's last segment),
  // with the file extension dropped.
  const imageNameFor = (url: string | null | undefined) => {
    if (!url) return "";
    let name = imgNames[url];
    if (!name) { try { name = decodeURIComponent(url.split("?")[0].split("/").pop() || url); } catch { name = url; } }
    return name.replace(/\.[A-Za-z0-9]+$/, "");
  };

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/documents/${collection}`);
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chs: Chapter[] = (data.chapters ?? []).map((c: any) => ({
          slug: c.slug, title: c.title, adminOnly: !!c.adminOnly,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sections: (c.sections ?? []).map((s: any) => ({
            heading: s.heading ?? "", bodyMarkdown: s.bodyMarkdown ?? "", adminOnly: !!s.adminOnly,
            image: s.image ?? null, imageAlt: s.imageAlt ?? null, imageCaption: s.imageCaption ?? null,
          })),
        }));
        setChapters(chs);
        setSnapshot(JSON.stringify(chs));
        setSelCh(0); setSelSec(0);
      } catch (e) {
        setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Failed to load" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  const dirty = useMemo(() => JSON.stringify(chapters) !== snapshot, [chapters, snapshot]);
  const ch = chapters[selCh];
  const sec = ch?.sections[selSec];

  // Open the image panel automatically when the selected section has an image.
  useEffect(() => {
    setImgOpen(!!chapters[selCh]?.sections[selSec]?.image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCh, selSec]);

  // Map each library image URL → its file name (for the read-only file-name field).
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/help/images");
        if (!r.ok) return;
        const data = await r.json();
        const map: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const img of (data.images ?? []) as any[]) map[img.url] = img.filename;
        setImgNames(map);
      } catch { /* non-fatal */ }
    })();
  }, []);

  // ── mutators ──
  const patchChapter = (i: number, p: Partial<Chapter>) =>
    setChapters((cs) => cs.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const patchSection = (ci: number, si: number, p: Partial<Section>) =>
    setChapters((cs) => cs.map((c, k) => (k === ci ? { ...c, sections: c.sections.map((s, j) => (j === si ? { ...s, ...p } : s)) } : c)));

  async function save(): Promise<boolean> {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch(`/api/admin/documents/${collection}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapters }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setSnapshot(JSON.stringify(chapters));
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)), 2500);
      return true;
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Save failed" });
      return false;
    }
  }
  async function saveAndView() {
    const ok = dirty ? await save() : true;
    if (ok) setMode("view");
  }
  function cancel() {
    setChapters(JSON.parse(snapshot));
    setSelCh(0); setSelSec(0); setStatus({ kind: "idle" });
  }
  function switchCollection(next: "user-guide" | "tech-design") {
    if (next === collection) return;
    if (dirty) { setConfirm({ msg: "Discard unsaved changes and switch document?", onYes: () => { setConfirm(null); setCollection(next); } }); return; }
    setCollection(next);
  }
  const isTech = collection === "tech-design";

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading the guide…</div>;

  return (
    <div className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-red-600 hover:text-red-800">‹ SuperAdmin</Link>
          <h1 className="text-lg font-semibold text-gray-900">Document Editor</h1>
          {mode === "edit" && (
            <select
              value={collection}
              onChange={(e) => switchCollection(e.target.value as "user-guide" | "tech-design")}
              className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-800 bg-white"
              title="Which document to edit"
            >
              <option value="user-guide">User Guide</option>
              <option value="tech-design">Technical Design Notes</option>
            </select>
          )}
          {mode === "edit" && (
            <div className="flex items-center gap-1 ml-1">
              {(["guide", "documents"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs px-2.5 py-1 rounded ${tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                  {t === "guide" ? "Guide" : "Documents"}
                </button>
              ))}
            </div>
          )}
          {mode === "view" && (
            <span className="text-sm text-gray-500 ml-1">Viewing — <span className="text-gray-800 font-medium">{ch?.title}</span></span>
          )}
        </div>
        {tab === "guide" && mode === "view" && (
          <button onClick={() => setMode("edit")} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
            ‹ Back to Edit Mode
          </button>
        )}
        {tab === "guide" && mode === "edit" && (
          <div className="flex items-center gap-2 text-xs">
            {status.kind === "saved" && <span className="text-green-600">Saved</span>}
            {status.kind === "error" && <span className="text-red-600">{status.msg}</span>}
            {dirty && <span className="text-amber-600">Unsaved changes</span>}
            <div className="relative">
              <button onClick={() => setExportMenu((o) => !o)} className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">Export ▾</button>
              {exportMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setExportMenu(false)} />
                  <div className="absolute right-0 z-30 mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg text-gray-700">
                    <a href={`/api/admin/documents/${collection}/export`} onClick={() => setExportMenu(false)} className="block w-full text-left px-3 py-1.5 hover:bg-blue-50">Whole document (.docx)</a>
                    {ch?.slug && <a href={`/api/admin/documents/${collection}/export?chapter=${ch.slug}`} onClick={() => setExportMenu(false)} className="block w-full text-left px-3 py-1.5 hover:bg-blue-50">This chapter — {ch.title} (.docx)</a>}
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { setExportMenu(false); void exportGuideZip(chapters); }} className="block w-full text-left px-3 py-1.5 hover:bg-blue-50">Bundle (.zip + images/)</button>
                    <button onClick={() => { setExportMenu(false); void exportGuideSelfContained(chapters); }} className="block w-full text-left px-3 py-1.5 hover:bg-blue-50">Self-contained (.md)</button>
                  </div>
                </>
              )}
            </div>
            <Link href={isTech ? "/tech-notes" : "/help"} target="_blank" className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">{isTech ? "Open notes ↗" : "Open guide ↗"}</Link>
            <button onClick={cancel} disabled={!dirty} className="px-3 py-1 rounded border border-gray-300 text-gray-700 disabled:opacity-40">Cancel</button>
            <button onClick={saveAndView} disabled={status.kind === "saving"} className="px-3 py-1 rounded bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700">
              Save &amp; View
            </button>
            <button onClick={save} disabled={!dirty || status.kind === "saving"} className="px-3 py-1 rounded bg-red-600 text-white font-medium disabled:opacity-40 hover:bg-red-700">
              {status.kind === "saving" ? "Saving…" : `Save ${isTech ? "notes" : "guide"}`}
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
      {tab === "documents" ? <DocumentsTab /> : mode === "view" ? (
        <GuidePreview chapters={chapters} selCh={selCh} selSec={selSec} setSelCh={setSelCh} setSelSec={setSelSec} />
      ) : (
      <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-[240px_1fr] gap-5">
        {/* Chapter list */}
        <nav className="bg-white border border-gray-200 rounded-lg p-2 h-fit">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Chapters</span>
            <button onClick={() => { setChapters((cs) => [...cs, newChapter(cs.length + 1)]); setSelCh(chapters.length); setSelSec(0); }}
              className="text-xs text-blue-600 hover:text-blue-800">+ Add</button>
          </div>
          <ol className="space-y-0.5">
            {chapters.map((c, i) => (
              <li key={i} className={`group flex items-center gap-1 px-2 py-1 rounded text-sm ${i === selCh ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <button onClick={() => { setSelCh(i); setSelSec(0); }} className={`flex-1 text-left truncate ${c.adminOnly ? "text-red-700" : "text-gray-700"}`}>
                  {i + 1}. {c.title || c.slug}
                </button>
                {c.adminOnly && <span className="text-[8px] font-semibold text-red-600 border border-red-300 rounded px-0.5">S</span>}
                <span className="opacity-0 group-hover:opacity-100 flex gap-0.5 text-gray-400">
                  <button title="Up" onClick={() => setChapters((cs) => move(cs, i, -1))}>↑</button>
                  <button title="Down" onClick={() => setChapters((cs) => move(cs, i, 1))}>↓</button>
                  <button title="Delete" className="text-red-400 hover:text-red-600"
                    onClick={() => setConfirm({ msg: `Delete chapter "${c.title}" and its ${c.sections.length} section(s)?`, onYes: () => { setChapters((cs) => cs.filter((_, k) => k !== i)); setSelCh(0); setSelSec(0); setConfirm(null); } })}>✕</button>
                </span>
              </li>
            ))}
          </ol>
        </nav>

        {/* Chapter + section editor */}
        <main className="space-y-4">
          {!ch ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">No chapter selected.</div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-600">Title
                    <input value={ch.title} onChange={(e) => patchChapter(selCh, { title: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">Slug (URL)
                    <input value={ch.slug} onChange={(e) => patchChapter(selCh, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                      className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={ch.adminOnly} onChange={(e) => patchChapter(selCh, { adminOnly: e.target.checked })} />
                  <span className="text-red-700 font-medium">SuperAdmin-only chapter</span> — hidden from User / OrgAdmin viewers
                </label>
              </div>

              {/* Sections of this chapter */}
              <div className="bg-white border border-gray-200 rounded-lg p-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sections</span>
                  <button onClick={() => { patchChapter(selCh, { sections: [...ch.sections, newSection()] }); setSelSec(ch.sections.length); }}
                    className="text-xs text-blue-600 hover:text-blue-800">+ Add section</button>
                </div>
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                  {ch.sections.map((s, i) => (
                    <button key={i} onClick={() => setSelSec(i)}
                      className={`text-xs px-2 py-1 rounded border ${i === selSec ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {s.adminOnly && <span className="text-red-600 mr-0.5">S</span>}{s.heading || `§${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>

              {sec && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input value={sec.heading ?? ""} onChange={(e) => patchSection(selCh, selSec, { heading: e.target.value })}
                      placeholder="Section heading (optional)" className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-medium" />
                    <button title="Move up" onClick={() => patchChapter(selCh, { sections: move(ch.sections, selSec, -1) })} className="text-gray-400 px-1">↑</button>
                    <button title="Move down" onClick={() => patchChapter(selCh, { sections: move(ch.sections, selSec, 1) })} className="text-gray-400 px-1">↓</button>
                    <button title="Delete section" className="text-red-400 hover:text-red-600 px-1"
                      onClick={() => setConfirm({ msg: "Delete this section?", onYes: () => { patchChapter(selCh, { sections: ch.sections.filter((_, k) => k !== selSec) }); setSelSec(0); setConfirm(null); } })}>✕</button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={sec.adminOnly} onChange={(e) => patchSection(selCh, selSec, { adminOnly: e.target.checked })} />
                    <span className="text-red-700 font-medium">SuperAdmin-only section</span>
                  </label>

                  <GuideEditor key={`${selCh}:${selSec}`} value={sec.bodyMarkdown} onChange={(md) => patchSection(selCh, selSec, { bodyMarkdown: md })} />

                  <details open={imgOpen} onToggle={(e) => setImgOpen((e.currentTarget as HTMLDetailsElement).open)} className="text-xs text-gray-600">
                    <summary className="cursor-pointer select-none">Image (optional)</summary>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => setPickImage(true)} className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50">{sec.image ? "Replace…" : "Choose from library…"}</button>
                      {sec.image && <button type="button" onClick={() => patchSection(selCh, selSec, { image: null, imageAlt: null, imageCaption: null })} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                    </div>
                    {sec.image && (
                      <div className="mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sec.image} alt={sec.imageAlt ?? ""} className="max-h-56 max-w-full rounded border border-gray-200 object-contain bg-gray-50" />
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5 text-gray-500">Image Name
                        <input readOnly value={imageNameFor(sec.image)} placeholder="(choose from library)" title={sec.image ?? ""} className="border border-gray-200 rounded px-2 py-1 text-gray-700 bg-gray-50" />
                      </label>
                      <label className="flex flex-col gap-0.5 text-gray-500">Caption
                        <input value={sec.imageCaption ?? ""} onChange={(e) => patchSection(selCh, selSec, { imageCaption: e.target.value || null })} placeholder="Shown under the image" className="border border-gray-300 rounded px-2 py-1 text-gray-800" />
                      </label>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      )}
      </div>

      {pickImage && (
        <ImagePickerDialog
          onClose={() => setPickImage(false)}
          onPick={(url, alt, filename) => {
            setImgNames((m) => ({ ...m, [url]: filename }));
            patchSection(selCh, selSec, { image: url, imageAlt: alt ?? sec?.imageAlt ?? null });
            setPickImage(false);
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog title="Confirm" message={confirm.msg} confirmLabel="Delete" cancelLabel="Cancel" destructive
          onConfirm={confirm.onYes} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
