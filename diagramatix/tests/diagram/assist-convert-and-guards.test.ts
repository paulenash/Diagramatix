/**
 * T4580-T4586 — the 20 September batch: B8, B6, M3, R7, R5 and R6.
 *
 * Six items that look unrelated and share one shape: the code had the right
 * answer somewhere and threw it away. The token-overlap pass computed a score
 * for every label and discarded all but the winner (R6). The three-way failure
 * of the dictation token collapsed into one branch (B8). The auto-connect knew
 * about `canConnect` from the op next door and did not call it (R7). The
 * sub-lane guards knew one of the two shapes a sub-lane arrives in (B6). The
 * flash diff compared everything about an element except the thing the command
 * had just changed (R5).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenOutcome, VOICE_POLICY_MESSAGE } from "@/app/lib/dictation/tokenOutcome";
import { isSublane, isTopLevelLane, laneKindWord, sameKindAs } from "@/app/lib/diagram/laneKind";
import { convertMatches, matchesForType } from "@/app/lib/assist/convertPhrase";
import { SUBTYPE_GROUPS, subtypeFingerprint } from "@/app/lib/diagram/elementSubtypes";
import { flashTargets, opFlashes, type FlashBox } from "@/app/lib/assist/goldFlash";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { nearestRefs } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const el = (id: string, type: string, label?: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, label, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra }) as unknown as DiagramElement;

// ────────────────────────────────────────────────────────────────────────────
describe("T4580 — B8: an org that forbids cloud voice is told, not quietly downgraded", () => {
  it("REFUSES on 403 — the policy is a decision, not an outage", () => {
    const o = tokenOutcome(403, { error: "Voice transcription is turned off by your organisation's policy." });
    expect(o.kind, "starting a different engine sends the same audio elsewhere").toBe("refused");
    expect(o.kind === "refused" && o.message).toMatch(/organisation/i);
  });

  it("uses our own sentence when the server says nothing useful", () => {
    for (const body of [null, {}, { error: "" }, { error: "Forbidden" }]) {
      const o = tokenOutcome(403, body);
      expect(o).toEqual({ kind: "refused", message: VOICE_POLICY_MESSAGE });
    }
  });

  it("falls back on 503 — nobody decided anything — and SAYS it is the browser", () => {
    const o = tokenOutcome(503, { error: "Dictation service not configured" });
    expect(o.kind).toBe("fallback");
    expect(o.kind === "fallback" && o.notice, "the weaker engine must be named")
      .toMatch(/browser/i);
  });

  it("falls back on a network failure and on an unexpected status", () => {
    for (const s of [null, 500, 502, 401]) {
      const o = tokenOutcome(s, null);
      expect(o.kind, `status ${s}`).toBe("fallback");
    }
  });

  it("uses cloud only when a token actually came back", () => {
    expect(tokenOutcome(200, { token: "t", scheme: "bearer" }))
      .toEqual({ kind: "cloud", token: "t", scheme: "bearer" });
    expect(tokenOutcome(200, { token: "t" }), "scheme defaults, it is not dropped")
      .toEqual({ kind: "cloud", token: "t", scheme: "token" });
    // 200 with no token is a server bug — still not a reason to say nothing.
    expect(tokenOutcome(200, {}).kind).toBe("fallback");
  });

  it("is what startDictation actually branches on", () => {
    // The defect was `if (r.ok)` collapsing every failure into one path, so the
    // wiring is the half worth pinning — a pure module nobody calls fixes
    // nothing.
    const src = read("app", "lib", "dictation", "index.ts");
    expect(src).toContain("tokenOutcome(r.status, body)");
    expect(src, "a refusal must not start any engine").toMatch(/outcome\.kind === "refused"/);
    expect(src, "and must release the microphone it opened optimistically")
      .toMatch(/outcome\.kind === "refused"[\s\S]{0,300}getTracks\(\)\.forEach/);
    expect(src, "the fallback notice reaches the user").toMatch(/outcome\.kind === "fallback"\) cb\.onError/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4581 — B6: both shapes of a sub-lane count", () => {
  const pool = el("p", "pool", "Warehouse");
  const laneA = el("l1", "lane", "Sales", { parentId: "p" });
  const laneB = el("l2", "lane", "Picking", { parentId: "p" });
  const nested = el("s1", "lane", "Domestic", { parentId: "l2" });   // interactive shape
  const stamped = el("s2", "sublane", "International", { parentId: "l2" }); // AI / import shape
  const all = [pool, laneA, laneB, nested, stamped];

  it("recognises the nested-lane shape, which every interactive path produces", () => {
    expect(isSublane(nested, all)).toBe(true);
    expect(isTopLevelLane(nested, all)).toBe(false);
  });

  it("recognises the stamped type, which the AI converter and importers produce", () => {
    expect(isSublane(stamped, all)).toBe(true);
  });

  it("does not call a lane in a pool a sub-lane", () => {
    expect(isSublane(laneA, all)).toBe(false);
    expect(isTopLevelLane(laneA, all)).toBe(true);
  });

  it("counts siblings at the same level, which is what a 'which one?' guard needs", () => {
    // The defect: `els.filter(x => x.type === e.type)` counted EVERY lane, so
    // "delete the sublane Staff" answered "which lane? there are 4".
    expect(sameKindAs(nested, all).map((e) => e.id).sort()).toEqual(["s1", "s2"]);
    expect(sameKindAs(laneA, all).map((e) => e.id).sort()).toEqual(["l1", "l2"]);
  });

  it("names it the way the user did", () => {
    expect(laneKindWord(nested, all)).toBe("sub-lane");
    expect(laneKindWord(stamped, all)).toBe("sub-lane");
    expect(laneKindWord(laneA, all)).toBe("lane");
  });

  it("is what the delete guard uses, so the spoken word is stripped from the name", () => {
    const body = editorWithApplyLayer();
    expect(body).toContain("const kind = e.type === \"pool\" ? \"pool\" : laneKindWord(e, els);");
    expect(body).toContain("const siblings = sameKindAs(e, els);");
    expect(body, "the old type test would miss the interactive shape")
      .not.toContain('const kindWord = e.type === "sublane"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4582 — M3: the spoken form of the right-click type picker", () => {
  it("resolves a subtype named with its kind word", () => {
    const m = convertMatches("user task");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ propKey: "taskType", value: "user" });
    expect(convertMatches("parallel gateway")[0]).toMatchObject({ propKey: "gatewayType", value: "parallel" });
    expect(convertMatches("timer event")[0]).toMatchObject({ propKey: "eventType", value: "timer" });
    expect(convertMatches("call subprocess")[0]).toMatchObject({ propKey: "subprocessType", value: "call" });
  });

  it("copes with the glyphs and hyphens the menu labels carry", () => {
    // "Event-based ⬠" and "Business Rule" must be sayable.
    expect(convertMatches("event based gateway")[0]).toMatchObject({ value: "event-based" });
    expect(convertMatches("business rule task")[0]).toMatchObject({ value: "business-rule" });
    expect(convertMatches("multi instance parallel")[0]).toMatchObject({ propKey: "repeatType", value: "mi-parallel" });
  });

  it("never reaches 'none' from a bare word, only from a deliberate phrase", () => {
    expect(convertMatches("none")).toEqual([]);
    expect(convertMatches("plain task")[0]).toMatchObject({ propKey: "taskType", value: "none" });
  });

  it("knows which element types a subtype is legal on", () => {
    const m = convertMatches("user task");
    expect(matchesForType(m, "task")).toHaveLength(1);
    expect(matchesForType(m, "gateway"), "a gateway is not a task").toHaveLength(0);
  });

  it("reads the SAME table the right-click menu draws", () => {
    // A second copy is how the two would come to offer different things.
    const menu = read("app", "components", "canvas", "ElementContextMenu.tsx");
    expect(menu).toContain('from "@/app/lib/diagram/elementSubtypes"');
    expect(menu, "the tables must not have been left behind as well")
      .not.toMatch(/const TASK_OPTS: Opt\[\] = \[/);
    // Every option the menu can show is reachable by voice.
    for (const g of SUBTYPE_GROUPS) {
      for (const opt of g.opts) {
        if (opt.value === "none") continue;          // reachable as "plain <kind>"
        const said = `${opt.label.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim()} ${g.nouns[0]}`;
        expect(convertMatches(said).length, `"${said}" is unreachable by voice`).toBeGreaterThan(0);
      }
    }
  });

  it("parses the spoken command without stealing 'make a task called X'", () => {
    expect(parseCommand("make this a user task")).toEqual([{ op: "convert", ref: "this", subtype: "user task" }]);
    expect(parseCommand("turn the selected gateway into a parallel gateway"))
      .toEqual([{ op: "convert", ref: "the selected gateway", subtype: "parallel gateway" }]);
    expect(parseCommand("make Review a service task"))
      .toEqual([{ op: "convert", ref: "Review", subtype: "service task" }]);
    // The convert rule's verbs overlap what a user would say for an add, so
    // the TAIL is the discriminator, not the verb. An add phrasing must be
    // untouched, and a phrasing that is neither must still reach the AI rather
    // than becoming a convert with a nonsense subtype.
    expect(parseCommand("add a task called Approve")?.[0]).toMatchObject({ op: "add", label: "Approve" });
    expect(parseCommand("create a task called Approve")?.[0].op).toBe("add");
    expect(parseCommand("make a task called Approve"), "not a subtype → the AI decides").toBeNull();
    expect(parseCommand("change the name of Review to Approve")?.[0].op, "rename keeps its phrasing").toBe("rename");
  });

  it("is a validated op, so the AI can reach it too", () => {
    expect(validateOps([{ op: "convert", ref: "this", subtype: "user task" }]))
      .toEqual([{ op: "convert", ref: "this", subtype: "user task" }]);
    expect(validateOps([{ op: "convert", ref: "this" }]), "a subtype is required").toEqual([]);
    expect(validateOps([{ op: "convert", subtype: "user task" }])).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4583 — M3 refuses what it cannot do, by name", () => {
  it("does not pretend a task can become a gateway", () => {
    // "gateway" is a SHAPE, not a subtype — nothing in the table matches it on
    // its own, so the grammar declines and the AI is asked instead.
    expect(convertMatches("gateway")).toEqual([]);
    expect(parseCommand("make this a gateway"), "a shape change is a different operation").toBeNull();
  });

  it("the apply branch tells the user which kinds a subtype belongs to", () => {
    const body = editorWithApplyLayer();
    expect(body).toMatch(/is a \$\{e\.type\} — “\$\{op\.subtype\}” applies to \$\{kinds\}/);
    expect(body, "and writes exactly what the menu writes")
      .toContain("updateProperties(e.id, { [pick.propKey]: pick.value });");
    expect(body, "a rename or a conversion leaves nothing selected — the standing protocol")
      .toMatch(/updateProperties\(e\.id, \{ \[pick\.propKey\][\s\S]{0,120}setSelectedElementIds\(new Set\(\)\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4584 — R5: a change that moves nothing still flashes", () => {
  const box = (id: string, marks = ""): FlashBox => ({ id, x: 0, y: 0, width: 100, height: 60, marks });

  it("sees a subtype change, which moves and renames nothing", () => {
    const before = [box("a", "")];
    const after = [box("a", "taskType=user")];
    expect(flashTargets(before, after).map((b) => b.id), "the rename defect in a new costume")
      .toEqual(["a"]);
  });

  it("still sees nothing when nothing changed", () => {
    const same = [box("a", "taskType=user")];
    expect(flashTargets(same, [...same])).toEqual([]);
  });

  it("fingerprints every group in the shared table, so a new subtype is covered", () => {
    const task = { type: "task", taskType: "user", properties: {} };
    expect(subtypeFingerprint(task)).toBe("taskType=user");
    // Some markers live under `properties`; both places are read.
    const gw = { type: "gateway", gatewayType: "parallel", properties: { gatewayRole: "merge" } };
    expect(subtypeFingerprint(gw)).toContain("gatewayType=parallel");
    expect(subtypeFingerprint(gw)).toContain("gatewayRole=merge");
    // Absent markers contribute nothing, so an untouched element is stable.
    expect(subtypeFingerprint({ type: "task", properties: {} })).toBe("");
  });

  it("marks the convert op as worth flashing", () => {
    expect(opFlashes("convert")).toBe(true);
    expect(opFlashes("delete"), "nothing left to outline").toBe(false);
  });

  it("is carried into BOTH snapshots, or the diff compares a field against nothing", () => {
    // This counted to 2 while gold flash was the only before/after diff in the
    // editor. The Voice Assist debug log (2026-09-24) added a second one, and
    // the literal count went red — the guard working, but on a proxy rather
    // than on what it means.
    //
    // What it MEANS is: every diff has a before and an after, and both sides
    // must carry the fingerprint, or a subtype change is compared against
    // nothing and silently reads as "unchanged". Counting sites instead of
    // asserting a magic number keeps that true for the next diff too.
    const body = editorWithApplyLayer();
    const uses = (body.match(/marks: subtypeFingerprint\(/g) ?? []).length;
    const diffs = (body.match(/\b(?:flashTargets|touchedFor)\(/g) ?? []).length;
    expect(diffs, "the editor still diffs before against after somewhere").toBeGreaterThan(0);
    expect(uses, `each of the ${diffs} diffs needs a before and an after carrying marks`)
      .toBe(diffs * 2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4585 — R6: a failed reference says what it nearly found", () => {
  const els = [
    el("a", "task", "Escalate"), el("b", "task", "Pick Items"),
    el("c", "task", "Back Order"), el("d", "task", "Warehouse Audit"),
  ];

  it("offers a label that shares a word", () => {
    const near = nearestRefs("pick crates", els);
    expect(near.map((n) => n.label)).toContain("Pick Items");
  });

  it("offers a label that merely SOUNDS right", () => {
    // Two edits — deliberately further than `resolveRef` will act on.
    const near = nearestRefs("eskalayd", els);
    expect(near.map((n) => n.label)).toContain("Escalate");
    expect(near.find((n) => n.label === "Escalate")?.why).toBe("sound");
  });

  it("offers nothing for a name with nothing in common", () => {
    expect(nearestRefs("zzzz qqqq", els)).toEqual([]);
  });

  it("caps the list, so a question does not become a wall", () => {
    const many = Array.from({ length: 20 }, (_, i) => el(`x${i}`, "task", `Order Line ${i}`));
    expect(nearestRefs("order line", many, 3).length).toBeLessThanOrEqual(3);
  });

  it("never lets a suggestion become an action", () => {
    // The looseness is the point AND the risk. `nearestRefs` is only ever read
    // into an error message; the resolver itself keeps its one-edit limit.
    const body = editorWithApplyLayer();
    expect(body).toMatch(/const near = nearestRefs\(ref, els, 3\);/);
    expect(body, "the candidates go into a question, not a resolution")
      .toMatch(/couldn't find “\$\{ref\}” — did you mean \$\{list\}\?/);
    const resolve = read("app", "lib", "assist", "resolveRef.ts");
    expect(resolve, "the ACTING pass must still be the tight one")
      .toMatch(/phoneticMatches\(fullTarget, labelled/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4586 — R7: auto-connect obeys the same gauntlet as connect", () => {
  it("checks canConnect before drawing the flow the user did not ask for", () => {
    // "add a task after Done" drew a sequence flow OUT of an end event and
    // reported it with a green tick, because only the explicit `connect` op was
    // ever checked.
    const body = editorWithApplyLayer();
    expect(body).toMatch(/if \(!canConnect\(anchor, addedEl, "sequence", withAdded\(els, addedEl\)\)\)/);
  });

  it("checks against the state that WILL exist, not the one that does", () => {
    // The new element is not in `els` yet at that point; passing the current
    // list would ask about an element the checker cannot see.
    const body = editorWithApplyLayer();
    expect(body).toMatch(/canConnect\(anchor, addedEl, "sequence", withAdded\(els, addedEl\)\)/);
  });

  it("still adds the element and says why it is unconnected", () => {
    const body = editorWithApplyLayer();
    expect(body, "refusing the whole command would lose the element the user asked for")
      .toMatch(/but left it unconnected/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4707 — a boundary move flashes, whichever edge moved", () => {
  const pool = (o: Partial<FlashBox> = {}): FlashBox =>
    ({ id: "p", x: 100, y: 100, width: 800, height: 400, label: "Company", marks: "", ...o });

  it("the RIGHT boundary — the one that reported nothing", () => {
    // Paul, 2026-09-23: "No flashing occurred when this command executed:
    // 'Move company right boundary, right.' → moved Company's right boundary
    // right 20px." The diff read x and y alone, so a width-only change was
    // invisible to it.
    expect(flashTargets([pool()], [pool({ width: 820 })]).map((b) => b.id)).toEqual(["p"]);
  });

  it("and the bottom, which changes only the height", () => {
    expect(flashTargets([pool()], [pool({ height: 420 })]).map((b) => b.id)).toEqual(["p"]);
  });

  it("the left and top still flash — they move the origin, and always did", () => {
    expect(flashTargets([pool()], [pool({ x: 80, width: 820 })]).map((b) => b.id)).toEqual(["p"]);
    expect(flashTargets([pool()], [pool({ y: 80, height: 420 })]).map((b) => b.id)).toEqual(["p"]);
  });

  it("a redraw that changes nothing still flashes nothing", () => {
    expect(flashTargets([pool()], [pool()])).toEqual([]);
    // Sub-pixel noise is not a change: the same epsilon as a move.
    expect(flashTargets([pool()], [pool({ width: 800.2 })])).toEqual([]);
  });

  it("the op is on the flashing list, so the batch arms the snapshot", () => {
    expect(opFlashes("movePoolBoundary")).toBe(true);
  });
});
