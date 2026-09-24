/**
 * T4597-T4600 — M7's align half, M8, and B7's remainder.
 *
 * All three are the same shape as M3: the machinery already existed and only
 * the way to reach it was missing. `ALIGN_ELEMENTS` has driven the Alignment ▾
 * menu all along, `acceptNextStep` has applied ghost suggestions since Assist
 * shipped, and `addPool.relativeTo` has been in the op type and the apply
 * branch — the AI prompt simply never mentioned it, so the model could say
 * *above* with nowhere to put the anchor.
 *
 * The plan's note that "no align/distribute reducers exist today" is stale and
 * was written before that landed. What genuinely does not exist is DISTRIBUTE
 * and "same size as this", which is why they are deliberately not here:
 * distributing badly is worse than not distributing, because it looks done.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAlignTail } from "@/app/lib/assist/alignPhrase";
import { parseGhostPick, resolveGhostPick } from "@/app/lib/assist/ghostPick";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("T4597 — M7: align, and the axis word that means two things", () => {
  it("takes a bare 'align these' as the smart mode, which is what the menu leads with", () => {
    expect(parseCommand("align these")).toEqual([{ op: "alignSelection", mode: "smart" }]);
    expect(parseCommand("align the selected tasks")?.[0]).toMatchObject({ mode: "smart" });
  });

  it("maps a row to one horizontal line and a column to one vertical line", () => {
    expect(parseAlignTail("in a row")).toMatchObject({ kind: "align", mode: "center" });
    expect(parseAlignTail("in a column")).toMatchObject({ kind: "align", mode: "vcenter" });
    expect(parseCommand("align these in a row")?.[0]).toMatchObject({ mode: "center" });
    expect(parseCommand("line these up in a column")?.[0]).toMatchObject({ mode: "vcenter" });
  });

  it("accepts 'their' as a selection word, because align takes no other target", () => {
    // Caught by the catalogue guard, not by this file: the Commands card
    // advertised "align their left edges" and the grammar wanted a selection
    // word. A card that lists a phrase the grammar rejects is worse than no
    // card, which is why every example on it is held to the parser.
    expect(parseCommand("align their left edges")?.[0]).toMatchObject({ op: "alignSelection", mode: "left" });
    expect(parseCommand("align their centres vertically")?.[0]).toMatchObject({ mode: "vcenter" });
  });

  it("takes an edge, which is never ambiguous", () => {
    for (const [said, mode] of [
      ["their left edges", "left"], ["right", "right"], ["their tops", "top"], ["bottom edges", "bottom"],
    ] as const) {
      expect(parseAlignTail(said), said).toMatchObject({ kind: "align", mode });
    }
  });

  it("REFUSES a bare axis word rather than tossing a coin", () => {
    // "Align these horizontally" means "lay them along a horizontal line" to
    // some people and "move them horizontally" to others. Guessing would be
    // wrong about half the time, silently, with a green tick.
    expect(parseAlignTail("horizontally")).toEqual({ kind: "ambiguous-axis", said: "horizontally" });
    expect(parseAlignTail("vertically")).toEqual({ kind: "ambiguous-axis", said: "vertically" });
    // …and the grammar declines, so the AI can ask instead of the parser guessing.
    expect(parseCommand("align these horizontally")).toBeNull();
    expect(parseCommand("align these vertically")).toBeNull();
  });

  it("does not claim distribute or resize, which have no reducer", () => {
    expect(parseCommand("space these evenly"), "no DISTRIBUTE action exists").toBeNull();
    expect(parseCommand("make these the same size as this")).toBeNull();
  });

  it("validates the op and rejects a mode the reducer does not know", () => {
    expect(validateOps([{ op: "alignSelection", mode: "vcenter" }]))
      .toEqual([{ op: "alignSelection", mode: "vcenter" }]);
    expect(validateOps([{ op: "alignSelection", mode: "diagonally" }])).toEqual([]);
  });

  it("dispatches what the Alignment menu dispatches, and needs two elements", () => {
    const body = editorWithApplyLayer();
    expect(body).toContain("alignElements(ids, op.mode);");
    expect(body, "aligning one element is a no-op worth saying out loud")
      .toMatch(/select two or more elements to align/);
  });
});

describe("T4598 — M8: take the ghost, without stealing 'yes'", () => {
  const cands = [
    { label: "Task", symbolType: "task" },
    { label: "Decision", symbolType: "gateway" },
    { label: "End", symbolType: "end-event" },
  ];

  it("accepts the first, which is what Tab does", () => {
    for (const s of ["accept", "accept it", "take it", "accept the suggestion", "use it"]) {
      expect(resolveGhostPick(parseGhostPick(s), cands), s).toBe(0);
    }
  });

  it("takes one by position", () => {
    expect(resolveGhostPick(parseGhostPick("take the second one"), cands)).toBe(1);
    expect(resolveGhostPick(parseGhostPick("accept ghost 3"), cands)).toBe(2);
  });

  it("takes one by name, by label or by type", () => {
    expect(resolveGhostPick(parseGhostPick("take the gateway"), cands)).toBe(1);
    expect(resolveGhostPick(parseGhostPick("accept the decision"), cands)).toBe(1);
    expect(resolveGhostPick(parseGhostPick("take the end event"), cands)).toBe(2);
  });

  it("does NOT claim 'yes' — that already confirms a destructive command", () => {
    // A word that means two things depending on whether a ghost happens to be
    // showing is how you clear a diagram by accident.
    expect(parseGhostPick("yes")).toBeNull();
    expect(parseCommand("yes"), "left for the confirmation flow").toBeNull();
    expect(parseCommand("no")).toBeNull();
  });

  it("does not swallow an ordinary add", () => {
    // "Add a gateway" is an add; "take the gateway" is a pick. Every accept
    // form names the ACT of accepting, which is what keeps them apart.
    expect(parseCommand("add a gateway")?.[0].op).toBe("add");
    expect(parseCommand("add a task called Approve")?.[0].op).toBe("add");
    expect(parseCommand("take the gateway")?.[0].op).toBe("acceptGhost");
  });

  it("does not swallow a bare number, which answers a numbered pick", () => {
    // During "rename tasks" a bare "3" picks item 3. It must not be read as
    // ghost 3.
    expect(parseGhostPick("3")).toBeNull();
    expect(parseCommand("3")).toBeNull();
  });

  it("returns null for a pick that is not on offer", () => {
    expect(resolveGhostPick(parseGhostPick("take the subprocess"), cands)).toBeNull();
    expect(resolveGhostPick(parseGhostPick("take the fifth one"), cands)).toBeNull();
    expect(resolveGhostPick(parseGhostPick("accept"), []), "nothing showing").toBeNull();
  });

  it("lists what IS on offer when the pick misses, and uses the live candidates", () => {
    const body = editorWithApplyLayer();
    expect(body).toContain("const cands = nextStepRef.current.candidates;");
    expect(body, "the ghosts are translucent and easy to misread")
      .toMatch(/that isn't on offer — \$\{cands\.map\(\(c\) => c\.label\)\.join\(", "\)\}/);
    expect(body).toContain("nextStepRef.current.accept(cands[idx]);");
  });
});

describe("T4599 — B7: the AI prompt can finally anchor a pool", () => {
  const route = read("app", "api", "ai", "command", "route.ts");

  it("offers relativeTo, so 'above' has something to be above", () => {
    // Without it the model could say above/below with no anchor, and the pool
    // landed relative to the existing stack instead of the named pool.
    expect(route).toMatch(/"op":"addPool"[^\n]*"relativeTo"\?: <pool name>/);
    expect(route).toMatch(/add a pool called <name> above\|below <pool>/);
  });

  it("carries the two new ops as well", () => {
    expect(route).toMatch(/"op":"alignSelection"/);
    expect(route).toMatch(/"op":"acceptGhost"/);
  });

  it("tells the model to ASK about a bare axis word rather than pick one", () => {
    expect(route).toMatch(/ASK which they mean/);
  });

  it("has no stray backtick inside the SYSTEM template literal", () => {
    // 2026-09-20: writing `ref` in backticks inside the template literal ended
    // the string and broke the production build. tsc caught it; nobody read
    // tsc. This is cheaper than remembering.
    const start = route.indexOf("const SYSTEM = `");
    const end = route.indexOf("`;", start + 16);
    expect(start, "the SYSTEM literal must be findable").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = route.slice(start + "const SYSTEM = `".length, end);
    expect(body.includes("`"), "a backtick here ends the string early").toBe(false);
  });
});

describe("T4600 — the whole op vocabulary stays reachable", () => {
  it("every op the grammar can emit is one validateOps accepts", () => {
    // A new op added to the union and the grammar but NOT to the validator
    // would work when typed and vanish when the AI returned it — a failure
    // mode that only shows up on the expensive path.
    const ops = read("app", "lib", "assist", "ops.ts");
    const union = [...ops.matchAll(/\|\s*\{\s*op:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(union.length, "the union must be findable").toBeGreaterThan(20);
    const cases = new Set([...ops.matchAll(/case "([a-zA-Z]+)":/g)].map((m) => m[1]));
    const missing = union.filter((o) => !cases.has(o));
    expect(missing, "these ops have no validateOp case").toEqual([]);
  });
});
