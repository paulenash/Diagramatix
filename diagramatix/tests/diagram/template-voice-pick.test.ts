/**
 * T4709–T4712 — "add template": the numbered window, the provisional pick, and
 * the templates a diagram may sensibly take.
 *
 * Paul, 2026-09-24: "A large pop-up window appears with all of the templates in
 * their groups, divided by built-in and user … with large icons of the actual
 * template and our familiar green numbers marking each one, so that all the
 * user has to do is say seven or nine and that template is provisionally added
 * and requires the user to confirm, or use a different number … And then
 * finally the user has a voice confirm and the template is added."
 *
 * …plus the two rules that came with it:
 *   • "Do not include any templates that include White-box pools i.e. initial
 *     templates unless there are no white-box pools on the diagram, or it is an
 *     empty diagram … and Starters category as well."
 *   • "Note that insert a template may require the current Lane and Pool to be
 *     expanded to accommodate the new template."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer } from "@/app/hooks/useDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import {
  cardsOf, isInitialTemplate, matchCardByName, numberTemplates, offerableTemplates, parseTemplateAnswer,
} from "@/app/lib/assist/templatePick";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");

const BUILTIN = [
  { id: "b1", name: "Exclusive (XOR) Decision", group: "Gateways" },
  { id: "b2", name: "Parallel Split & Join", group: "Gateways" },
  { id: "b3", name: "Single Approval", group: "Approvals" },
  { id: "b4", name: "Automated Process", group: "Initial Process Types", hasWhiteBoxPool: true },
  { id: "b5", name: "Linear Process (3 steps)", group: "Starters" },
  { id: "b6", name: "Loose One", group: null },
];
const USER = [
  { id: "u1", name: "Our Intake", group: "Ours" },
  { id: "u2", name: "Our Spine", group: "Starters" },
];

describe("T4709 — one unbroken numbering, built-in first, in groups", () => {
  it("numbers every card once, in reading order", () => {
    const sections = numberTemplates(BUILTIN, USER);
    const cards = cardsOf(sections);
    expect(cards.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Groups sorted, ungrouped last within their half, user after built-in.
    expect(cards.map((c) => c.name)).toEqual([
      "Single Approval",                 // Approvals
      "Exclusive (XOR) Decision",        // Gateways
      "Parallel Split & Join",
      "Automated Process",               // Initial Process Types
      "Linear Process (3 steps)",        // Starters
      "Loose One",                       // ungrouped, last of the built-ins
      "Our Intake",                      // the user's own
      "Our Spine",
    ]);
    expect(cards.map((c) => c.source)).toEqual(["builtin", "builtin", "builtin", "builtin", "builtin", "builtin", "user", "user"]);
  });

  it("keeps each card with the header it is drawn under", () => {
    const sections = numberTemplates(BUILTIN, USER);
    const gateways = sections.find((s) => s.group === "Gateways")!;
    expect(gateways.cards.map((c) => c.n)).toEqual([2, 3]);
    expect(sections.find((s) => s.group === null)!.cards.map((c) => c.name)).toEqual(["Loose One"]);
  });
});

describe("T4710 — a number picks, another number replaces, “yes” keeps", () => {
  const cards = cardsOf(numberTemplates(BUILTIN, USER));

  it("a number is a pick — and nothing is confirmed that is not showing", () => {
    expect(parseTemplateAnswer("seven", cards, false)).toEqual({ kind: "pick", card: cards[6] });
    expect(parseTemplateAnswer("9", cards, false), "there is no ninth card").toBeNull();
    // "Yes" before anything is showing means nothing — the window stays.
    expect(parseTemplateAnswer("yes", cards, false)).toBeNull();
  });

  it("“yes” keeps what is showing, “cancel” takes it away", () => {
    expect(parseTemplateAnswer("yes", cards, true)).toEqual({ kind: "confirm" });
    expect(parseTemplateAnswer("that's it", cards, true), "not a confirmation word").toBeNull();
    expect(parseTemplateAnswer("cancel", cards, true)).toEqual({ kind: "cancel" });
    expect(parseTemplateAnswer("no", cards, false)).toEqual({ kind: "cancel" });
  });

  it("a NAME works too, and is read before the number", () => {
    // The same trap the disambiguation picker hit on 2026-09-23:
    // `leadingSpokenNumber` forgives mis-heard number words, and template
    // names are full of words it would forgive.
    expect(parseTemplateAnswer("Single Approval", cards, false)).toEqual({ kind: "pick", card: cards[0] });
    expect(matchCardByName("parallel split", cards)?.name).toBe("Parallel Split & Join");
    expect(matchCardByName("approval", cards)?.name, "only one name contains it").toBe("Single Approval");
    expect(matchCardByName("our", cards), "two names contain it — no answer").toBeNull();
    expect(matchCardByName("one", cards), "a number is not a name").toBeNull();
  });

  it("the command opens the window, and does not make a task called “template”", () => {
    expect(parseCommand("add template")).toEqual([{ op: "pickTemplate" }]);
    expect(parseCommand("add a template")).toEqual([{ op: "pickTemplate" }]);
    expect(parseCommand("templates")).toEqual([{ op: "pickTemplate" }]);
    expect(parseCommand("add a task called template")).toEqual([{ op: "add", symbolType: "task", label: "template" }]);
  });
});

describe("T4711 — an initial template is offered only where it belongs", () => {
  it("knows one by what it IS, not by a tick somebody has to remember", () => {
    expect(isInitialTemplate({ hasWhiteBoxPool: true }), "brings its own pool").toBe(true);
    expect(isInitialTemplate({ group: "Starters" }), "a whole process spine").toBe(true);
    expect(isInitialTemplate({ group: "starters" }), "however it is cased").toBe(true);
    expect(isInitialTemplate({ group: "Gateways" })).toBe(false);
    // A black-box participant pool is NOT an initial template — those are fine
    // to add to a live diagram.
    expect(isInitialTemplate({ group: "Process Fragments", hasWhiteBoxPool: false })).toBe(false);
  });

  it("an empty diagram is offered everything; one with a pool is not", () => {
    expect(offerableTemplates(BUILTIN, false).map((t) => t.id)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
    expect(offerableTemplates(BUILTIN, true).map((t) => t.id), "the pool one and the starter go")
      .toEqual(["b1", "b2", "b3", "b6"]);
    expect(offerableTemplates(USER, true).map((t) => t.id), "the user's Starters group too").toEqual(["u1"]);
  });

  it("the API derives the flag from the template's own data", () => {
    const route = src("app/api/templates/route.ts");
    expect(route).toContain(`e->>'type' = 'pool'`);
    expect(route).toContain(`e->'properties'->>'poolType' = 'white-box'`);
    expect((route.match(/hasWhiteBoxPool/g) ?? []).length, "both the built-in and the user query").toBe(2);
  });
});

describe("T4712 — the pool and lane make room for the template", () => {
  /** Two lanes, each with a task; the template lands in the upper one. */
  const world = (): DiagramData => ({
    elements: [
      E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 600, height: 300, properties: { poolType: "white-box" } }),
      E({ id: "L", type: "lane", label: "Lane 1", x: 36, y: 0, width: 564, height: 150, parentId: "p", properties: {} }),
      E({ id: "M", type: "lane", label: "Lane 2", x: 36, y: 150, width: 564, height: 150, parentId: "p", properties: {} }),
      E({ id: "t0", type: "task", label: "Existing", x: 100, y: 20, width: 100, height: 60, parentId: "L", properties: {} }),
      E({ id: "t1", type: "task", label: "Below", x: 100, y: 170, width: 100, height: 60, parentId: "M", properties: {} }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  const inserted = [
    E({ id: "n1", type: "task", label: "New A", x: 300, y: 60, width: 140, height: 120, properties: {} }),
    E({ id: "n2", type: "task", label: "New B", x: 460, y: 60, width: 140, height: 120, properties: {} }),
  ];
  const apply = (d: DiagramData) =>
    reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: inserted, connectors: [] } } as never) as DiagramData;

  it("adopts the template into the lane it was dropped in", () => {
    // Paul, 2026-09-24. Before this the inserted elements had no parent at
    // all, so nothing grew and the template hung over the edge of the pool.
    const after = apply(world());
    expect(after.elements.find((e) => e.id === "n1")!.parentId).toBe("L");
    expect(after.elements.find((e) => e.id === "n2")!.parentId).toBe("L");
  });

  it("grows that lane, moves the ones below, and grows the pool", () => {
    const after = apply(world());
    const at = (id: string) => after.elements.find((e) => e.id === id)!;
    expect(at("L").height, "the lane covers the template").toBeGreaterThanOrEqual(180);
    expect(at("M").y, "the lane below moves down by the growth").toBe(at("L").y + at("L").height);
    expect(at("t1").y, "and its contents go with it").toBe(170 + (at("L").height - 150));
    // The pool is still exactly its lane stack.
    expect(at("p").height).toBe(at("L").height + at("M").height);
    for (const id of ["n1", "n2"]) {
      const e = at(id);
      expect(e.y + e.height, `${e.label} is inside the lane`).toBeLessThanOrEqual(at("L").y + at("L").height);
    }
  });

  it("leaves a template that already fits exactly where it is", () => {
    const roomy = world();
    roomy.elements = roomy.elements.map((e) => (e.id === "L" ? { ...e, height: 400 } : e.id === "M" ? { ...e, y: 400 } : e));
    (roomy.elements.find((e) => e.id === "p") as DiagramElement).height = 550;
    const after = apply(roomy);
    const at = (id: string) => after.elements.find((e) => e.id === id)!;
    expect(at("L").height, "no growth was needed").toBe(400);
    expect(at("M").y).toBe(400);
  });
});
