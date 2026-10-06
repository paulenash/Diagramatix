/**
 * T5262 — Project screen (Paul, 2026-10-06): no browser right-click menus; right-click menus on a diagram (tree row and tile), a folder and the
 * project; one wide, scrolling "Move to project" dialog with a Close button (every version, the Sandpit tiles included); left-click shows the
 * Project / Diagram / Folder Properties panel; the Diagram panel carries every diagram-level attribute the Diagram screen shows.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { summariseFolder } from "@/app/lib/projects/folderSummary";
import { MoveToProjectDialog } from "@/app/components/MoveToProjectDialog";
import { RenameDialog } from "@/app/components/RenameDialog";
import { ContextMenuPopup } from "@/app/components/ContextMenuPopup";

const read = (p: string) => readFileSync(p, "utf8");
const screen = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");
const ROOT = "root";

describe("T5262 1 — no browser right-click menu on the screen", () => {
  it("the whole screen swallows the browser menu, except in a text box where Cut / Copy / Paste are wanted", () => {
    expect(screen).toContain("onContextMenu={(e) => { if ((e.target as HTMLElement).closest?.(\"input, textarea, select, [contenteditable='true']\")) return; e.preventDefault(); }}");
  });
});

describe("T5262 2–4 — the right-click menus", () => {
  it("diagram (a tree row AND a tile): Open, Rename, Clone, Move to project…, Delete", () => {
    expect(screen).toContain('onContextMenu={(e) => openCtx(e, "diagram", d.id)}');                       // the tree row
    expect(screen).toContain('onContextMenu={(e, id) => openCtx(e, "diagram", id)}');                     // the tile
    expect(screen).toContain("onContextMenu={(e) => onContextMenu(e, diagram.id)}");                       // …wired inside the tile
    const at = screen.indexOf('if (m.kind === "diagram") {');
    const body = screen.slice(at, screen.indexOf('if (m.kind === "folder") {'));
    const labels = [...body.matchAll(/label: "([^"]+)"/g)].map((x) => x[1]);
    expect(labels).toEqual(["Open", "Rename", "Clone", "Move to project…", "Delete"]);
  });
  it("folder: Rename, New Subfolder, Expand, Collapse, Move up, Move down, Delete — Delete disabled while the folder has any contents", () => {
    expect(screen).toContain('onContextMenu={(e) => openCtx(e, isRoot ? "project" : "folder", folderId)}');
    const at = screen.indexOf('if (m.kind === "folder") {');
    const body = screen.slice(at, screen.indexOf('label: "Rename", disabled: ro, title: roTitle, onClick: () => setRenameDlg({ kind: "project"'));
    const labels = [...body.matchAll(/label: "([^"]+)"/g)].map((x) => x[1]);
    expect(labels).toEqual(["Rename", "New Subfolder", "Expand", "Collapse", "Move up", "Move down", "Delete"]);
    expect(body).toContain("disabled: ro || hasContent");
    expect(body).toContain("Cannot delete: the folder is not empty");
    expect(body).toContain("moveTreeItem(m.id, -1)");
    expect(body).toContain("moveTreeItem(m.id, 1)");
  });
  it("project: Rename, New Folder, Refresh, Expand all, Collapse all", () => {
    const at = screen.indexOf('label: "Rename", disabled: ro, title: roTitle, onClick: () => setRenameDlg({ kind: "project"');
    const body = screen.slice(at, at + 900);
    const labels = [...body.matchAll(/label: "([^"]+)"/g)].map((x) => x[1]);
    expect(labels.slice(0, 5)).toEqual(["Rename", "New Folder", "Refresh", "Expand all", "Collapse all"]);
  });
  it("the menu is mounted once, with the three dialogs; read-only shares can still Open, Expand, Collapse and Refresh", () => {
    expect(screen).toContain("<ContextMenuPopup x={ctxMenu.x} y={ctxMenu.y} items={ctxItems(ctxMenu)}");
    expect(screen).toContain("<MoveToProjectDialog");
    expect(screen).toContain("<RenameDialog");
    expect(screen).toContain('{ label: "Open", onClick: () => handleOpenDiagram(m.id) },');
  });
  it("the menu renders its items, with a disabled one and a reason", () => {
    const html = renderToStaticMarkup(createElement(ContextMenuPopup, { x: 10, y: 10, onClose: () => {}, items: [
      { label: "Rename" }, { label: "Delete", disabled: true, title: "Cannot delete: the folder is not empty", danger: true, separatorBefore: true },
    ] }));
    expect(html).toContain('role="menu"');
    expect(html).toContain(">Rename<");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Cannot delete: the folder is not empty"/);
  });
  it("Rename is a dialog, not a browser prompt", () => {
    const html = renderToStaticMarkup(createElement(RenameDialog, { title: "Rename folder", initial: "Claims", onSave: () => {}, onClose: () => {} }));
    expect(html).toContain("Rename folder");
    expect(html).toContain('value="Claims"');
    expect(screen).not.toMatch(/\bprompt\(/);
  });
});

describe("T5262 2b — one wide, scrolling Move-to-project dialog with a Close button, everywhere", () => {
  const names = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `A rather long project name number ${i} for the Claims Processing programme` }));
  it("is wide, capped to the window, scrolls, has a header Close (✕) and a footer Close, a filter once the list is long, and a Sandpit option", () => {
    const html = renderToStaticMarkup(createElement(MoveToProjectDialog, { diagramName: "Order to Cash", projects: names, onPick: () => {}, onClose: () => {} }));
    expect(html).toContain("max-w-xl");
    expect(html).toContain("max-h-[80vh]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('aria-label="Close"');
    expect((html.match(/>Close</g) ?? []).length).toBe(1);                       // the footer button (the header one is an icon)
    expect(html).toContain("Filter projects…");
    expect(html).toContain("A rather long project name number 29");
    expect(html).toContain("Sandpit (no project)");
  });
  it("no filter box and no Sandpit target where they do not apply (a short list; a Sandpit tile)", () => {
    const html = renderToStaticMarkup(createElement(MoveToProjectDialog, { diagramName: "X", projects: names.slice(0, 3), sandpit: false, onPick: () => {}, onClose: () => {} }));
    expect(html).not.toContain("Filter projects…");
    expect(html).not.toContain("Sandpit (no project)");
  });
  it("the project screen's tile no longer has its own little dropdown — the ↗ button, the menu and… all ask for the one dialog", () => {
    expect(screen).toContain("onClick={(e) => { e.stopPropagation(); onRequestMove(diagram.id); }}");
    expect(screen).toContain("{ label: \"Move to project…\", disabled: ro, title: roTitle, onClick: () => setMoveDialogFor(m.id) },");
    expect(screen).not.toContain("setShowMove");
    expect(screen).not.toContain("min-w-36 py-1");
  });
  it("the Dashboard's Sandpit tiles use it too (shielded so a click does not open the diagram)", () => {
    const d = read("app/(dashboard)/dashboard/DashboardClient.tsx");
    expect(d).toContain("<MoveToProjectDialog");
    expect(d).toContain("sandpit={false}");
    expect(d).toContain("onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}");
    expect(d).not.toContain("min-w-36 py-1");
  });
});

describe("T5262 5 — left-click shows the Properties panel", () => {
  it("a Project / Folder entry in the tree shows its panel (and clears any diagram preview); a Diagram entry or tile shows the Diagram panel; each opens a collapsed panel", () => {
    expect(screen).toContain("setPreviewDiagramId(null); setPropertiesOpen(true);");
    expect(screen).toContain("setPreviewDiagramId(d.id); setPropertiesOpen(true);");
    const tile = screen.indexOf("    setPreviewDiagramId(diagramId);");
    expect(screen.slice(tile, tile + 80)).toContain("setPropertiesOpen(true);");
  });
  it("the right-hand panel is the Project's, a Folder's or a Diagram's, with its own collapsed tab label", () => {
    expect(screen).toContain("const folderPanel = !diagramPanel && selectedFolderId !== ROOT_ID");
    expect(screen).toContain('{diagramPanel ? "Diagram" : folderPanel ? "Folder" : "Project"}');
    expect(screen).toContain("<FolderPropertiesPanel");
  });
  it("the Diagram panel carries Title Show / Status, Parent(s), Created / Modified, the AI link, Database, Free-form layout, and the Pain Points / Issues / Review Comments lists", () => {
    const p = read("app/(dashboard)/dashboard/projects/[id]/DiagramPropertiesPanel.tsx");
    for (const id of ["diagram-title-show-status", "diagram-parents", "diagram-dates", "diagram-ai-generation", "diagram-database", "diagram-free-form"]) expect(p).toContain(`data-testid="${id}"`);
    for (const k of ["uml-pain-point", "uml-issue", "review-comment"]) expect(p).toContain(`key: "${k}"`);
    expect(p).toContain("Generated by AI from");
    expect(p).not.toMatch(/aiModelLabel|aiGeneration\.model/);                    // the model is never named here (2026-10-06 model rule)
    expect(screen).toContain("parentNames={");
  });
});

describe("T5262 5c — what a folder holds", () => {
  const folders = [
    { id: "f1", name: "Claims", parentId: null }, { id: "f2", name: "Intake", parentId: "f1" }, { id: "f3", name: "Empty", parentId: null },
  ];
  const diagrams = [
    { id: "d1", name: "Lodge", type: "bpmn", updatedAt: "2026-10-01T00:00:00Z" },
    { id: "d2", name: "Triage", type: "bpmn", updatedAt: "2026-10-05T00:00:00Z" },
    { id: "d3", name: "Model", type: "domain", updatedAt: "2026-10-03T00:00:00Z" },
    { id: "d4", name: "Loose", type: "flowchart", updatedAt: "2026-09-01T00:00:00Z" },
  ];
  const tree = { folders, diagramFolderMap: { d1: "f1", d2: "f2", d3: "f2" } as Record<string, string> };
  it("counts what is directly in the folder and everything below it, by type, with the newest first", () => {
    const s = summariseFolder(tree, diagrams, "f1", ROOT);
    expect(s.path).toEqual(["Claims"]);
    expect(s.direct).toEqual({ diagrams: 1, folders: 1 });
    expect(s.total).toEqual({ diagrams: 3, folders: 1 });
    expect(s.byType).toEqual([{ type: "bpmn", count: 2 }, { type: "domain", count: 1 }]);
    expect(s.recent.map((d) => d.id)).toEqual(["d2", "d3", "d1"]);
    expect(s.lastChanged).toBe("2026-10-05T00:00:00Z");
    expect(s.empty).toBe(false);
  });
  it("a subfolder knows its path; an empty folder says so; the project root counts the loose diagrams too", () => {
    expect(summariseFolder(tree, diagrams, "f2", ROOT).path).toEqual(["Claims", "Intake"]);
    const e = summariseFolder(tree, diagrams, "f3", ROOT);
    expect(e.empty).toBe(true);
    expect(e.total).toEqual({ diagrams: 0, folders: 0 });
    expect(summariseFolder(tree, diagrams, ROOT, ROOT).total).toEqual({ diagrams: 4, folders: 3 });
  });
  it("a damaged, cyclic folder chain cannot hang it", () => {
    const cyc = { folders: [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }], diagramFolderMap: {} };
    expect(summariseFolder(cyc, [], "a", ROOT).total.folders).toBe(1);
  });
});
