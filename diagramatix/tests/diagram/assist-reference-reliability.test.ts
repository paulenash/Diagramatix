/**
 * T4703–T4706 — saying which one, reliably.
 *
 * Paul, 2026-09-23: "We need 'Lane 1' the name, to match 'lane one' the spoken
 * name much more reliably. Also, spoken 'line' should always resolve quickly to
 * 'lane'."
 *
 * Measured first, against a real diagram, because most of it already worked:
 * "lane one", "line one", "sub lane one", "poll three" and "pull three" all
 * resolved before any of this. What did not:
 *
 *   "lane won"                    → nothing          (a number heard as its homophone)
 *   "lines one"                   → Lane 1 or Sub 1  (the PLURAL mis-hear was not a kind word)
 *   "the sublanes in lane one"    → nothing
 *   "the top sublane in lane one" → LANE ONE ITSELF  (and a delete then offered to remove it)
 *
 * There is no single register of names: `diagramKeyterms` biases the recogniser
 * and `resolveRef` matches the elements, and container names are deliberately
 * kept OUT of the recogniser (they collide with the boosted command words —
 * the day numbers were boosted, "turn on" became "ten on"). So the reliability
 * has to come from the parser, which is where all of this lives.
 */
import { describe, it, expect } from "vitest";
import { resolveRef, resolveInsideRefs } from "@/app/lib/assist/resolveRef";
import { containerWordKind, foldNumberHomophones, leadingContainerWord } from "@/app/lib/assist/containerWords";
import { buildPickFlow, parsePickAnswer } from "@/app/lib/assist/disambiguate";
import type { DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** Pool 3 → Lane 1 (Sub 1, Sub 2 — one with a task) and Lane 2 (a gateway). */
const world = (): DiagramElement[] => [
  E({ id: "p", type: "pool", label: "Pool 3", x: 0, y: 0, width: 900, height: 600, properties: {} }),
  E({ id: "L1", type: "lane", label: "Lane 1", x: 36, y: 0, width: 864, height: 200, parentId: "p", properties: {} }),
  E({ id: "L2", type: "lane", label: "Lane 2", x: 36, y: 200, width: 864, height: 200, parentId: "p", properties: {} }),
  E({ id: "S1", type: "lane", label: "Sub 1", x: 72, y: 0, width: 828, height: 100, parentId: "L1", properties: {} }),
  E({ id: "S2", type: "lane", label: "Sub 2", x: 72, y: 100, width: 828, height: 100, parentId: "L1", properties: {} }),
  E({ id: "t", type: "task", label: "Review", x: 100, y: 20, width: 90, height: 50, parentId: "S1", properties: {} }),
  E({ id: "g", type: "gateway", label: "Approved?", x: 300, y: 220, width: 50, height: 50, parentId: "L2", properties: {} }),
];
const id = (phrase: string, els = world()) => {
  const r = resolveRef(phrase, els);
  return r && "id" in r ? r.id : r ? `AMBIGUOUS:${r.ambiguous.join(",")}` : null;
};

describe("T4703 — one list of container words, mis-hears included", () => {
  it("“line” is a lane wherever it appears — singular, plural, and as a sub-", () => {
    for (const said of ["lane one", "line one", "lines one", "the line one", "lane 1", "Lane 1"]) {
      expect(id(said), said).toBe("L1");
    }
    for (const said of ["sub one", "sub 1", "sublane one", "sub lane one", "sub line one", "sublines one"]) {
      expect(id(said), said).toBe("S1");
    }
    for (const said of ["pool three", "poll three", "pull three", "pools three"]) {
      expect(id(said), said).toBe("p");
    }
  });

  it("the list is the one the grammar has always used, in one place now", () => {
    expect(containerWordKind("line")).toBe("lane");
    expect(containerWordKind("poll")).toBe("pool");
    expect(containerWordKind("sub-lines")).toBe("sublane");
    expect(containerWordKind("review"), "an ordinary word is not a container").toBeNull();
    expect(leadingContainerWord("line one")).toEqual({ kind: "lane", rest: "one" });
    expect(leadingContainerWord("lane"), "a bare kind word leaves nothing").toEqual({ kind: "lane", rest: "" });
    expect(leadingContainerWord("Assembly Line")).toBeNull();
  });
});

describe("T4704 — a number heard as its homophone", () => {
  it("“lane won” is Lane 1, and the same for the rest of them", () => {
    expect(id("lane won")).toBe("L1");
    expect(id("line won")).toBe("L1");
    expect(id("sub too")).toBe("S2");
    expect(id("pool tree")).toBe("p");
  });

  it("folding happens only after a strict read has failed", () => {
    // An element genuinely called "Won" keeps its name: the strict pass finds
    // it, and the fold never runs.
    const els = [...world(), E({ id: "w", type: "task", label: "Won", x: 500, y: 20, width: 90, height: 50, parentId: "L1", properties: {} })];
    expect(id("Won", els)).toBe("w");
    expect(id("won", els)).toBe("w");
    // And the fold itself is a plain word swap, not a guess about meaning.
    expect(foldNumberHomophones("lane won")).toBe("lane one");
    expect(foldNumberHomophones("review")).toBe("review");
  });
});

describe("T4705 — a reference to what is INSIDE a named container", () => {
  it("“the top sublane in lane one” is the sublane, never the lane", () => {
    // The dangerous one: it used to resolve to LANE ONE, so a delete offered
    // to remove the lane and everything under it.
    expect(id("the top sublane in lane one")).toBe("S1");
    expect(id("the bottom sublane in lane one")).toBe("S2");
    expect(id("the middle lane in pool three")).toBe("L1");
  });

  it("a plural names them all, which is how the picker gets raised", () => {
    expect(resolveInsideRefs("the sublanes in lane one", world())).toEqual(["S1", "S2"]);
    expect(resolveInsideRefs("the lanes in pool three", world())).toEqual(["L1", "L2"]);
    expect(id("the sublanes in lane one")).toBe("AMBIGUOUS:S1,S2");
  });

  it("it reaches things that are not containers, by type or by name", () => {
    expect(id("the task in sub one")).toBe("t");
    expect(id("the gateway in lane two")).toBe("g");
    expect(id("Review in lane one")).toBe("t");
  });

  it("nothing inside means NOTHING — never the container itself", () => {
    expect(id("the top sublane in lane two"), "Lane 2 has no sublanes").toBeNull();
    expect(resolveInsideRefs("the sublanes in lane two", world())).toEqual([]);
    expect(id("the task in lane two"), "no task in Lane 2 either").toBeNull();
  });

  it("an unnamed or ambiguous parent settles nothing", () => {
    expect(resolveInsideRefs("the sublanes in the thing", world())).toBeNull();
    expect(resolveInsideRefs("Review", world()), "not an inside reference at all").toBeNull();
  });
});

describe("T4706 — a picker answers to a name as well as a number", () => {
  const flow = () => buildPickFlow(
    [{ op: "delete", ref: "lane" } as never],
    "lane",
    ["L1", "L2"],
    world(),
  )!;

  it("the number still works, exactly as before", () => {
    expect(parsePickAnswer("two", flow())?.id).toBe("L2");
    expect(parsePickAnswer("number 1", flow())?.id).toBe("L1");
  });

  it("and so does the name — which is what the question shows", () => {
    // Paul's log: being asked `which “pool three”? … say the name` and then
    // answering `Pool three.` came back "didn't understand that".
    expect(parsePickAnswer("Lane 2", flow())?.id).toBe("L2");
    expect(parsePickAnswer("lane two", flow())?.id).toBe("L2");
    expect(parsePickAnswer("the lane one", flow())?.id).toBe("L1");
  });

  it("a name that fits more than one candidate is no answer", () => {
    // Both are called "Lane N", so the bare kind word cannot choose between
    // them and the question stands.
    expect(parsePickAnswer("lane", flow())).toBeNull();
    expect(parsePickAnswer("something else entirely", flow())).toBeNull();
  });
});
