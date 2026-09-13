/**
 * The NEW AI Generate console — a full screen for a feature that had been living
 * in a 384px sidebar.
 *
 * Paul, 2026-09-13: "Refactor the AI Generate for BPMN Diagrams to a larger
 * centralised popup screen associated with a new NEW AI Generate button to allow
 * comparison of behaviour while we are testing the new 2-phase AI Generate
 * replacement… all current functionality must be retained and look and feel like
 * Simulator / Miner but with AI Generate feature colour scheme."
 *
 * Two things need guarding, and they pull in opposite directions.
 *
 * The first is the REPLACEMENT: twelve numbered requirements, several of which
 * are renames and moves that a later tidy-up would silently undo.
 *
 * The second is the BASELINE. The whole point of a second button is that the two
 * screens can be run against each other on the same diagram; that comparison is
 * worthless the moment the new console starts sharing orchestration with the old
 * panel, because a change would then move both. So `PlanPanel` staying
 * independent is itself a property worth a test.
 *
 * There is no React renderer in this suite, so the behavioural half of these is
 * what can be read from the source with certainty — each assertion below names a
 * specific line that would have to be deleted or rewritten for it to fail, and
 * every one was checked by planting the opposite first.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { aiTones } from "@/app/(dashboard)/diagram/[id]/ai-generate/AiConsoleChrome";

const ROOT = path.resolve(__dirname, "..", "..");
const AI_GEN = path.join(ROOT, "app", "(dashboard)", "diagram", "[id]", "ai-generate");
const PLAN_DIR = path.join(ROOT, "app", "(dashboard)", "diagram", "[id]");

const read = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8");
const screen = () => read(AI_GEN, "AiGenerateScreen.tsx");
const sources = () => read(AI_GEN, "SourcesPanel.tsx");
const promptPanel = () => read(AI_GEN, "PromptPanel.tsx");
const saModal = () => read(AI_GEN, "SuperAdminOptionsModal.tsx");
const editor = () => read(PLAN_DIR, "DiagramEditor.tsx");

describe("the console is themed by the configured AI colour", () => {
  it("T4312 — every tone is DERIVED from the colour handed in, none is fixed", () => {
    // The Simulator can write `text-green-400` because its colour is a constant.
    // This console's colour is whatever the org set for AI Generate, and a
    // mid-violet that reads perfectly on white is invisible on black — so the
    // lighter tones have to be computed from it. A hardcoded tone would look
    // right for the default violet and wrong for every other setting, which is
    // exactly the sort of defect nobody reports.
    const t = aiTones("#123456");
    expect(t.accent).toBe("#123456");
    for (const [name, value] of Object.entries(t)) {
      expect(value, `${name} must be derived from the accent`).toContain("#123456");
    }
    // Four distinct roles — if two collapsed, a panel border would vanish into
    // its own fill.
    expect(new Set(Object.values(t)).size).toBe(4);

    // And nothing from the first colour survives into a second.
    const other = aiTones("rebeccapurple");
    expect(Object.values(other).some((v) => v.includes("#123456")),
      "a tone kept a previous colour — it is not derived").toBe(false);
  });

  it("T4329 — the toolbar button is coloured AT REST, not only when active", () => {
    // Paul, 2026-09-13: "The New AI Generate option does not use any changes to
    // the Feature Colours?"
    //
    // It did not. The button was copied from the sidebar's, which greys until
    // its panel is open — fine there, because the panel is a sidebar and you can
    // still see the button beside it. This console is a full-screen overlay, so
    // the moment the button becomes active it is covered by the thing it opened.
    // `active ? featureVars(...) : undefined` therefore rendered grey every time
    // it was ever on screen: a conditional whose true branch is unobservable.
    const src = editor();
    const btn = src.slice(src.indexOf("NEW AI Generate — the full-screen console"));
    const decl = btn.slice(0, btn.indexOf("✨ NEW AI Generate"));
    expect(decl, "the AI feature vars are applied unconditionally")
      .toMatch(/style=\{featureVars\(featureScheme, "ai"\)\}/);
    expect(decl, "no active-only gate on the colour").not.toMatch(/showAiGenerateScreen \? featureVars/);
    expect(decl, "and it wears the feature-tile skin").toMatch(/className="[^"]*feature-tile"/);
  });

  it("T4330 — the accent stays SATURATED, not washed to near-white", () => {
    // Legible is not the bar. Mixed far enough towards white, every accent
    // converges on the same pale tone and the console looks identical whatever
    // the org configured — which is how "does it use the Feature Colours at all?"
    // becomes a fair question about code that technically does.
    //
    // Measured as distance from white: two very different accents must still
    // produce visibly different bright tones.
    const violet = aiTones("#6d28d9").bright;
    const teal = aiTones("#0f766e").bright;
    expect(violet).not.toBe(teal);
    // The mix must keep at least half the accent. `lighten(c, pct)` writes the
    // RETAINED share as `${100 - pct}%`, so that share is what to assert on.
    const share = (tone: string) => Number(/ (\d+)%/.exec(tone)?.[1] ?? "0");
    expect(share(violet), "bright keeps at least half the accent").toBeGreaterThanOrEqual(50);
    expect(share(aiTones("#6d28d9").line), "line keeps more still").toBeGreaterThanOrEqual(50);
  });

  it("T4313 — the accent is read from the feature-colour scheme, not named in the file", () => {
    const src = screen();
    expect(src, "accent must come from the AI feature colour")
      .toMatch(/const accent = tonesFor\(useFeatureColors\(\), "ai"\)\.text;/);
    // ...and it must actually reach the three places that colour the console.
    expect(src, "the rain backdrop").toMatch(/<MatrixRain[^>]*color=\{accent\}/s);
    expect(src, "the derived tones").toMatch(/aiTones\(accent\)/);
    expect(src, "the structure editor opened from here").toMatch(/accent=\{accent\}/);
  });
});

describe("the twelve requirements are present as controls", () => {
  it("T4314 — the renamed labels are the ones Paul asked for", () => {
    // 6: "Audio / VTT (rename to Transcript)". 7: "Separate 'Load Image' from
    // 'Attach' (renamed Load Attachment)". 9: "Plan/Re-plan" — the sidebar's
    // second-press label is "Re-send to AI".
    expect(sources(), 'the transcript upload reads "Transcript"').toMatch(/uploadIdleLabel="Transcript"/);
    expect(sources(), "Load Attachment").toContain("Load Attachment");
    expect(sources(), "Load Image").toContain("Load Image");
    expect(sources(), "Record is retained (item 8)").toMatch(/AudioToProcessButton/);
    expect(screen(), "Re-plan, not Re-send to AI").toMatch(/hasPlan \? "Re-plan" : "Plan"/);
    expect(screen(), "the old label must be gone from the new screen").not.toContain("Re-send to AI");
  });

  it("T4315 — Load Image and Load Attachment are two choosers over ONE reader", () => {
    const src = sources();
    // Two accept lists, so the chooser offers the right files…
    expect(src).toMatch(/const DOC_ACCEPT = "\.pdf,\.txt,\.md,\.csv,\.rtf,\.doc,\.docx"/);
    expect(src).toMatch(/const IMAGE_ACCEPT = "[^"]*image\/\*"/);
    expect(src, "images must not be offered by the document button").not.toMatch(/DOC_ACCEPT = "[^"]*image/);
    // …but ONE handler, so how a file is parsed never depends on which button
    // opened the dialog. Two readers is how a .png attached from the wrong
    // button gets read as text.
    expect(src.match(/onChange=\{onChange\}/g)?.length, "both inputs share one onChange").toBe(2);
    expect(src.match(/onFile\(/g)?.length, "one call into the single reader").toBe(1);
  });

  it("T4316 — close is at the right of the header, after the User Guide chip", () => {
    const src = screen();
    const guide = src.indexOf("📖 User Guide");
    const exit = src.indexOf("✕ EXIT");
    expect(guide, "the User Guide chip").toBeGreaterThan(-1);
    expect(exit, "the exit button").toBeGreaterThan(guide);
    // Closing a full-screen overlay by accident costs more than closing a
    // sidebar did, and nothing here is persisted until Save or Apply.
    expect(src).toMatch(/const requestClose = useCallback\(\(\) => \{\s*if \(dirty\)/);
  });

  it("T4317 — Save / New sit under the description, and Refine under them", () => {
    // Item 10 says "immediately under the Describe the process area"; item 5
    // puts Refine under the prompt edit area. Both live in PromptPanel so the
    // order is the file's order.
    const src = promptPanel();
    const textarea = src.indexOf("<textarea");
    const save = src.indexOf("Item 10");
    const refine = src.indexOf("Item 5");
    expect(textarea).toBeGreaterThan(-1);
    expect(save, "Save / New come after the textarea").toBeGreaterThan(textarea);
    expect(refine, "Refine comes after Save / New").toBeGreaterThan(save);
    // Refine must never auto-generate — it collects answers and stops.
    expect(screen()).toMatch(/onSubmit=\{\(answers\) => \{\s*refinedRef\.current = true;/);
  });

  it("T4318 — the structure editor is a pop-up, holding all four views (item 11)", () => {
    expect(screen()).toMatch(/⤢ JSON \/ Plan structure/);
    expect(screen()).toMatch(/<PlanStructureModal/);
    // It is the SHARED editor, not a copy — a second one would drift.
    expect(screen()).toMatch(/from "\.\.\/ai-plan\/PlanStructureModal"/);
  });
});

describe("Apply Layout hands the screen back", () => {
  it("T4331 — a successful Apply closes the console", () => {
    // Paul, 2026-09-13: "After Apply Layout return hide the New AI Generate
    // screen."
    //
    // The sidebar stays open after an apply, correctly: it sits beside the
    // canvas, so you watch the diagram appear next to it. This console covers
    // the canvas, so staying open hides the only thing the button was pressed
    // to produce — and leaves a full-screen animated backdrop running over a
    // diagram that has just re-rendered.
    const src = screen();
    const apply = src.slice(src.indexOf("const callApplyLayout"));
    const body = apply.slice(0, apply.indexOf("// ── Refine"));
    expect(body, "the success path closes").toMatch(/onClose\(\);\s*\}\s*catch/);
    // Straight to onClose, NOT requestClose: the dirty guard stops unsaved work
    // being discarded, and applying is how the work stops being unsaved. Routing
    // this through the guard would ask "discard your prompt?" immediately after
    // succeeding.
    expect(body, "not through the dirty guard").not.toContain("requestClose()");
  });

  it("T4332 — a FAILED apply leaves the console open with its error", () => {
    // Every failure path has to return before the close. A console that closed
    // on failure would drop the error, the issues list and the diagnostics on
    // the floor, and look identical to success.
    const src = screen();
    const apply = src.slice(src.indexOf("const callApplyLayout"));
    const body = apply.slice(0, apply.indexOf("onClose();"));
    for (const failure of [
      /setError\(json\.error \?\? "Layout failed"\);[\s\S]{0,120}return;/,
      /setError\("Layout returned unexpected format\."\);[\s\S]{0,80}return;/,
    ]) {
      expect(body, "a failure path that does not return would fall through to the close")
        .toMatch(failure);
    }
    // And the network-error catch sets the error rather than closing.
    expect(apply).toMatch(/catch \(err\) \{\s*setError\(/);
  });
});

describe("behaviour that was easy to lose in the rewrite", () => {
  it("T4319 — prompt provenance is sent on CREATE only", () => {
    const src = screen();
    // Tidying the wording of something you dictated does not make it typed.
    // The PUT body must be `body` alone; only the POST spreads provenance.
    expect(src).toMatch(/method: "PUT",[\s\S]{0,120}body: JSON\.stringify\(body\),/);
    expect(src).toMatch(/method: "POST",[\s\S]{0,160}JSON\.stringify\(\{ \.\.\.body, \.\.\.provenance, diagramType \}\)/);
    // Refs, not state: a re-render must not reset how the text came to be.
    expect(src).toMatch(/const dictatedRef = useRef\(false\);/);
    expect(src).toMatch(/const refinedRef = useRef\(false\);/);
  });

  it("T4320 — answering the AI Tidy questions plans immediately", () => {
    // The only path that generates without a Plan click: the answers ARE the
    // instruction to try again. Dropping this leaves the user staring at a
    // dialog they just filled in with nothing having happened.
    expect(screen()).toMatch(/setClarifyOpen\(false\);[\s\S]{0,220}void executePlanCall\(newPrompt\);/);
  });

  it("T4321 — preservePositions is derived from the PLAN, not from the attachment", () => {
    const src = screen();
    expect(src).toMatch(/const planHasBounds = Array\.isArray\(plan\?\.elements\)/);
    expect(src).toMatch(/const preservePositions = !flatPlan && preserveLayout && planHasBounds;/);
    // If it were read off `attachment` instead, editing the plan's JSON or
    // removing the image after planning would silently change the layout.
    expect(src).not.toMatch(/preservePositions = [^;]*attachment/);
  });

  it("T4322 — the dictation stop-race guard survived", () => {
    // startDictation is async (token fetch + a permission prompt). A Stop
    // pressed during that window hits a null ref, and the handle that arrives
    // afterwards leaves a live microphone nobody can turn off.
    const src = screen();
    expect(src).toMatch(/const stopRequestedRef = useRef\(false\);/);
    expect(src).toMatch(/if \(stopRequestedRef\.current\) \{[\s\S]{0,160}handle\.stop\(\);/);
  });

  it("T4323 — a failed plan's raw reply is kept and is reachable", () => {
    // The error message alone says nothing about WHY the model's answer could
    // not be read. The sidebar dumped `json.raw` into its JSON textarea; the
    // console has no always-visible textarea, so it must hand it to the editor.
    const src = screen();
    expect(src).toMatch(/if \(json\.raw\) setRawReply\(json\.raw\);/);
    expect(src).toMatch(/initialRawJson=\{rawReply \?\? undefined\}/);
    const modal = read(PLAN_DIR, "ai-plan", "PlanStructureModal.tsx");
    expect(modal, "and it opens on Raw edit, where text is readable")
      .toMatch(/useState<"tree" \| "raw">\(props\.initialRawJson \? "raw" : "tree"\)/);
  });
});

describe("the elevated options are gated separately (item 12)", () => {
  it("T4324 — nothing renders at all when neither gate is open", () => {
    // A modal listing what you are not allowed to do is worse than no modal.
    expect(saModal()).toMatch(/if \(!showCompare && !showAdmin\) return null;/);
  });

  it("T4325 — compare/export is SuperAdmin; model + prompt-from-diagram is Admin", () => {
    // Not one blanket "is admin". The sidebar applies two different gates and
    // collapsing them would hand model comparison — four live generations, two
    // to three minutes — to every org admin.
    const src = saModal();
    expect(src).toMatch(/const showCompare = isSuperuser && !hidden;/);
    expect(src).toMatch(/const showAdmin = isAdmin && !hidden;/);
    // Presentation mode suppresses the lot, as it does in the sidebar.
    expect(src.match(/!hidden/g)?.length).toBe(2);
    // The screen only offers the button when one of the two could show.
    expect(screen()).toMatch(/const saAvailable = \(isSuperuser \|\| isAdmin\) && !superAdminHidden;/);
  });
});

describe("the comparison baseline cannot regress", () => {
  it("T4326 — the new console is mounted beside PlanPanel, for BPMN, behind its own button", () => {
    const src = editor();
    expect(src, "a second button").toContain("✨ NEW AI Generate");
    // Anchored on the block's own comment rather than a character distance, so
    // editing the button's body cannot make this pass or fail by accident.
    const block = src.slice(src.indexOf("NEW AI Generate — the full-screen console"));
    const gate = block.slice(0, block.indexOf("<button"));
    expect(gate, "BPMN only while it is being judged")
      .toMatch(/\{!readOnly && diagramType === "bpmn" && aiAllowedHere && \(/);
    expect(src, "the original button is still there").toMatch(/✨ AI Generate\s*\n\s*<\/button>/);
    expect(src, "and the original panel is still mounted").toMatch(/\{showPlanPanel && \(\s*<PlanPanel/);
  });

  it("T4327 — PlanPanel shares no orchestration with the new console", () => {
    // The comparison is only worth running while a change to one cannot move
    // the other. Shared LEAVES are fine and intended (the plan-state hook, the
    // structure editor, the audio button); shared orchestration is not.
    const plan = read(PLAN_DIR, "PlanPanel.tsx");
    expect(plan, "PlanPanel must not import from the new console").not.toMatch(/ai-generate/);
  });

  it("T4328 — PlanStructureModal's accent still defaults to the diagram-type colour", () => {
    // `accent` was added as an OPTIONAL prop precisely so the sidebar's use is
    // byte-for-byte what it was. If PlanPanel started passing one, the baseline
    // would have changed colour as a side effect of building the replacement.
    const modal = read(PLAN_DIR, "ai-plan", "PlanStructureModal.tsx");
    expect(modal).toMatch(/const accent = props\.accent \?\? getTypeStyle\(diagramType\)\?\.bgColor \?\? "#93c5fd";/);
    const plan = read(PLAN_DIR, "PlanPanel.tsx");
    const mount = plan.slice(plan.indexOf("<PlanStructureModal"));
    expect(mount.slice(0, mount.indexOf("/>")), "PlanPanel must not pass an accent").not.toContain("accent=");
  });
});
