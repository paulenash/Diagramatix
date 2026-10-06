/**
 * T5243 — four screen changes (Paul, 2026-10-05):
 *   1. Acting as another subscription level shows NO message or warning at the top (video and screenshots must look like a
 *      real customer of that level) — the pill is hidden; the level is still enforced.
 *   2. The Registered Users tile scrolls horizontally.
 *   3. The Project Properties panel has a hide arrow and starts COLLAPSED; collapsed-but-openable when a diagram is selected.
 *   4. A "Badges" tick beside the navigation tree's refresh icon: off hides the diagram badges and the filter badges.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const project = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");

describe("T5243 1 — no banner while acting as a subscription level", () => {
  it("the pill is switched off at its source, before any other test, and nothing else replaces it in the root layout", () => {
    const b = read("app/components/ActingAsBanner.tsx");
    expect(b).toContain("export const SHOW_ACTING_AS_BANNER = false;");
    expect(b.indexOf("if (!SHOW_ACTING_AS_BANNER) return null;")).toBeLessThan(b.indexOf("if (!superAdmin) return null;"));
    const layout = read("app/layout.tsx");
    expect(layout).toContain("<ActingAsBanner superAdmin={superAdmin} />");
    expect(layout).toContain("<GateNoticeHost />");              // a real limit / not-in-plan notice is a customer's own experience: it stays
  });
});

describe("T5243 2 — the Registered Users tile has a horizontal scroll bar", () => {
  const admin = read("app/(dashboard)/dashboard/admin/AdminClient.tsx");
  it("the table sits in its OWN scroll box capped to the window (so its horizontal bar is always on screen, not at the foot of a long list) and has a floor, so a narrow window scrolls sideways instead of squashing the columns", () => {
    expect(admin).toMatch(/data-testid="admin-scroll" className="flex-1 min-h-0 overflow-auto /);
    expect(admin).toContain('data-testid="registered-users-scroll" className="rounded-lg overflow-auto border border-gray-200" style={{ maxHeight: "calc(100vh - 9rem)" }}');
    expect(admin).toMatch(/<table className="w-full min-w-\[1280px\]/);
  });
  it("the table is still inside its wrapper (the wrapper closes after it)", () => {
    const a = admin.indexOf('data-testid="registered-users-scroll"');
    const t = admin.indexOf("</table>", a);
    expect(admin.slice(t, t + 60)).toContain("</div>");
  });
});

describe("T5243 3 — the Properties panel: hide arrow, collapsed on entry", () => {
  it("starts collapsed", () => {
    expect(project).toContain("const [propertiesOpen, setPropertiesOpen] = useState(false);");
  });
  it("collapsed: a slim strip with an arrow that opens it — for the project's panel AND for a selected diagram's", () => {
    expect(project).toContain('data-testid="properties-collapsed"');
    expect(project).toContain('aria-label="Show properties"');
    expect(project).toContain("setPropertiesOpen(true)");
    expect(project).toContain('const diagramPanel = !!previewDiagramId && diagrams.some((x) => x.id === previewDiagramId);');
  });
  it("it is the SAME control as the Diagram screen's Properties panel: the slim grey tab with the ◀ arrow and a vertical label, and a ▶ in the panel's own header (never floating over the title)", () => {
    const editor = readFileSync("app/components/canvas/PropertiesPanel.tsx", "utf8");
    expect(editor).toContain('className="w-6 border-l border-gray-200 bg-gray-50 flex flex-col items-center cursor-pointer hover:bg-gray-100 shrink-0"');
    expect(project).toContain('className="w-6 border-l border-gray-200 bg-gray-50 flex flex-col items-center cursor-pointer hover:bg-gray-100 shrink-0"');
    expect(project).toContain('title="Expand panel"');
    expect(project).not.toContain('className="absolute top-1.5 left-1 z-10');
    for (const f of ["ProjectPropertiesPanel", "DiagramPropertiesPanel"]) {
      const src = readFileSync("app/(dashboard)/dashboard/projects/[id]/" + f + ".tsx", "utf8");
      expect(src).toContain("onCollapse?: () => void;");
      expect(src).toContain('title="Collapse panel"');
    }
  });
  it("open: all three panels (project, folder, diagram) carry the hide arrow, and are unchanged otherwise (the Folder panel arrived 2026-10-06)", () => {
    expect(project).toContain('data-testid="properties-open"');
    expect(project.split("onCollapse={() => setPropertiesOpen(false)}").length - 1).toBe(3);
    const open = project.indexOf('data-testid="properties-open"');
    expect(project.indexOf("<DiagramPropertiesPanel", open)).toBeGreaterThan(open);
    expect(project.indexOf("<ProjectPropertiesPanel", open)).toBeGreaterThan(open);
  });
  it("it is not drawn at all when there is no panel to show (nothing new appears on screens that had none)", () => {
    expect(project).toContain("if (!diagramPanel && !projectPanel && !folderPanel) return null;");
  });
});

describe("T5243 4 — Badges tick beside the refresh icon", () => {
  it("is there, next to the refresh button, on by default, remembered on this browser", () => {
    const refresh = project.indexOf('aria-label="Refresh navigation tree"');
    const tick = project.indexOf('aria-label="Badges"');
    expect(refresh).toBeGreaterThan(0);
    expect(tick).toBeGreaterThan(refresh);
    expect(tick - refresh).toBeLessThan(1500);
    expect(project).toContain("const [showBadges, setShowBadges] = useState(true);");
    expect(project).toContain('"dgx.nav.showBadges"');
  });
  it("off hides the badges beside each diagram AND the filter badges, and a badge filter is ignored while they are hidden", () => {
    expect(project).toContain("{showBadges && <DiagramFeatureBadges badges={badgesByDiagram.get(d.id) ?? []} />}");
    expect(project).toContain("{showBadges && ([");
    expect(project).toContain("showBadges ? treeFilter : { ...treeFilter, badges: [] }");
  });
  it("the type badge (what kind of diagram it is) is not a feature badge and stays", () => {
    expect(project).toContain("<DiagramTypeBadge type={d.type} className=\"shrink-0\" />");
  });
});
