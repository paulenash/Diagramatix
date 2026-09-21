/**
 * T4604-T4605 — Paul's two notes after walking Block 1, 21 September 2026.
 *
 *   1. "The element ids are confusing."
 *   2. "'Add a task before review.' → didn't understand that. Shouldn't the
 *      feedback be … there is no Task named 'Review'?"
 *
 * Both are the same complaint in different clothes: the log said something
 * true about OUR internals instead of something useful about the user's
 * diagram.
 *
 * On (1): `serializeDiagram` hands the model every element's id, because it
 * needs them to describe relationships. The prompt asks for names, but a model
 * given ids will sometimes answer with one — and the apply layer then matched
 * `k3f9a2bx` against the labels, failed, and printed the id. An id we handed
 * over should simply resolve; one that does not exist is our plumbing leaking
 * and must not be shown.
 *
 * On (2): the command was understood. The grammar declined on purpose (B5 —
 * "before X" is a position, not a name), and the AI had nothing to return
 * because there is no Review. "Didn't understand that" sends the user to
 * rephrase a sentence that was fine.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  looksLikeElementId, unresolvedMentions, notUnderstoodMessage,
} from "@/app/lib/assist/refMentions";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const el = (id: string, label: string): DiagramElement =>
  ({ id, type: "task", label, x: 0, y: 0, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;

describe("T4604 — an element id never reaches the user", () => {
  it("recognises the real id shape, which is 8 chars of letters AND digits", () => {
    // `nanoid()` is Math.random().toString(36).slice(2, 10).
    for (const s of ["k3f9a2bx", "0a1b2c3d", "zz99zz11"]) {
      expect(looksLikeElementId(s), s).toBe(true);
    }
  });

  it("does not mistake a real name for an id", () => {
    // Erring toward "this is a name" is the safe direction: the worst case is
    // the old behaviour.
    for (const s of ["checkout", "invoice", "approve", "Approve", "abcdefgh", "12345678", "check stock"]) {
      expect(looksLikeElementId(s), s).toBe(false);
    }
  });

  it("RESOLVES a bare id the model was given, rather than failing on it", () => {
    const els = [el("k3f9a2bx", "Receive Order"), el("m7q2w1z0", "Check Stock")];
    expect(resolveRef("k3f9a2bx", els, null, [])).toEqual({ id: "k3f9a2bx" });
  });

  it("still resolves a NAME that happens to look like an id", () => {
    // Checked against the real ids, so a name cannot be swallowed.
    const els = [el("aaaaaaaa", "k3f9a2bx")];
    expect(resolveRef("k3f9a2bx", els, null, [])).toEqual({ id: "aaaaaaaa" });
  });

  it("says something human when an id does not resolve", () => {
    const body = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(body).toMatch(/if \(looksLikeElementId\(ref\)\) return \{ err: "couldn't work out which element that meant — say its name" \}/);
    // And it is checked BEFORE "did you mean", since suggesting names for an
    // id is noise on top of noise.
    const guard = body.indexOf("looksLikeElementId(ref)");
    const near = body.indexOf("const near = nearestRefs(ref, els, 3);");
    expect(guard).toBeGreaterThan(-1);
    expect(near, "the id guard runs first").toBeGreaterThan(guard);
  });
});

describe("T4605 — name what is missing, instead of blaming the phrasing", () => {
  const els = [el("a", "Receive Order"), el("b", "Check Stock"), el("c", "Pick Items")];

  it("names the thing that is not there — Paul's exact sentence", () => {
    expect(notUnderstoodMessage("Add a task before review.", els))
      .toBe("nothing here is called “review” — say a name that is on the diagram");
  });

  it("finds a mention after any word that introduces a reference", () => {
    for (const said of ["add a task after Escalate", "connect Approve to Dispatch", "move it below Warehouse"]) {
      expect(unresolvedMentions(said, els).length, said).toBeGreaterThan(0);
    }
  });

  it("says NOTHING about a name being created, which is not a reference", () => {
    // "called / named / labelled" introduce a NEW name. Reporting "nothing is
    // called Approve" while the user is busy creating Approve would be worse
    // than the vague message it replaces.
    expect(unresolvedMentions("add a task called Approve", els)).toEqual([]);
    expect(unresolvedMentions("rename Check Stock to Verify Stock", els))
      .not.toContain("Verify Stock");
  });

  it("stays quiet when the mention IS on the diagram", () => {
    expect(unresolvedMentions("add a task after Check Stock", els)).toEqual([]);
    // Loose on purpose — a partial phrase still counts as found.
    expect(unresolvedMentions("add a task after check", els)).toEqual([]);
  });

  it("ignores pronouns, positions and the selection", () => {
    for (const said of [
      "add a task after it", "put one below the selected task", "add a task after these",
      "move it to the right", "add a task before the start",
    ]) {
      expect(unresolvedMentions(said, els), said).toEqual([]);
    }
  });

  it("never reports an element id as a missing name", () => {
    expect(unresolvedMentions("add a task after k3f9a2bx", els)).toEqual([]);
  });

  it("falls back to the old wording when it has nothing better to say", () => {
    // "Didn't understand that" is at least true when no mention is missing.
    expect(notUnderstoodMessage("what does this diagram do", els)).toBe("didn’t understand that");
    expect(notUnderstoodMessage("", els)).toBe("didn’t understand that");
  });

  it("is what the AI-returned-nothing path actually logs", () => {
    const body = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(body).toMatch(/summary: notUnderstoodMessage\(heard, data\.elements\)/);
  });
});
