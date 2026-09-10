/**
 * EPC connector legality — the rules that make an EPC an EPC.
 *
 * These matter more than they look. The BPMN converter (a later slice) reads
 * the alternation and the assignments as FACTS: it derives lanes from
 * organisational units, and it turns the events after a split into the labels
 * on a gateway's outgoing flows. Every one of those readings assumes the
 * diagram obeys the rules below. Let an illegal edge through here and the
 * converter does not fail — it produces a plausible BPMN diagram that says
 * something the source never said, which is the worse outcome by a distance.
 *
 * E2, E4, E5 and E7 are deliberately NOT here. They are properties of the whole
 * diagram rather than of one edge, and enforcing them per-edge would make an
 * EPC impossible to draw: you would be blocked halfway through a branch, before
 * adding the join you were on your way to. They belong to the red-rule scan.
 */
import { describe, it, expect } from "vitest";
import { canConnect } from "@/app/lib/diagram/canConnect";
import type { DiagramElement, SymbolType, ConnectorType } from "@/app/lib/diagram/types";

let seq = 0;
const el = (type: SymbolType, label = ""): DiagramElement => ({
  id: `e${++seq}`, type, x: 0, y: 0, width: 100, height: 50, label,
});

const event = () => el("epc-event", "Invoice received");
const fn = () => el("epc-function", "Verify invoice");
const xor = () => el("epc-xor");
const and = () => el("epc-and");
const or = () => el("epc-or");
const org = () => el("epc-org-unit", "Accounts Payable");
const position = () => el("epc-position", "Credit Officer");
const data = () => el("epc-data", "Invoice");
const app = () => el("epc-application", "SAP");

/** All four elements are passed in `elements` because the reducer does. */
const ok = (s: DiagramElement, t: DiagramElement, c: ConnectorType = "epc-control-flow") =>
  canConnect(s, t, c, [s, t]);

describe("E1 — strict alternation", () => {
  it("T4025 - an event gives rise to a function, and a function to an event", () => {
    expect(ok(event(), fn())).toBe(true);
    expect(ok(fn(), event())).toBe(true);
  });

  it("T4026 - two functions may NOT be directly connected", () => {
    // "Verify invoice → Approve invoice" skips the state that came about in
    // between, and the notation says that state is the point.
    expect(ok(fn(), fn())).toBe(false);
  });

  it("T4027 - two events may NOT be directly connected", () => {
    expect(ok(event(), event())).toBe(false);
  });

  it("T4028 - a connector may sit between them without breaking the chain", () => {
    // Alternation is about events and functions; a connector is a junction, not
    // a link in the chain, so function → XOR → event is correct.
    expect(ok(fn(), xor())).toBe(true);
    expect(ok(xor(), event())).toBe(true);
    expect(ok(and(), fn())).toBe(true);
  });
});

describe("E3 — an event cannot make a decision", () => {
  it("T4029 - an event may NOT be followed by an XOR", () => {
    // THE classic EPC rule, and the one most implementations miss. An event is
    // passive — a thing that has come about — and a passive thing cannot
    // choose. Only a function may precede a decision.
    expect(ok(event(), xor())).toBe(false);
  });

  it("T4030 - nor by an OR", () => {
    expect(ok(event(), or())).toBe(false);
  });

  it("T4031 - but an AND after an event is FINE", () => {
    // Taking every branch is not a choice, so nothing is being decided. This is
    // the half of the rule that gets over-applied — implementations that ban
    // all three connectors after an event make legal EPCs undrawable.
    expect(ok(event(), and())).toBe(true);
  });

  it("T4032 - and a function may precede any of the three", () => {
    expect(ok(fn(), xor())).toBe(true);
    expect(ok(fn(), or())).toBe(true);
    expect(ok(fn(), and())).toBe(true);
  });
});

describe("E6 — assignments are not the control flow", () => {
  it("T4033 - an org unit is never ON the chain", () => {
    expect(ok(org(), fn())).toBe(false);
    expect(ok(fn(), org())).toBe(false);
    expect(ok(org(), event())).toBe(false);
  });

  it("T4034 - nor is data or a system", () => {
    expect(ok(data(), fn())).toBe(false);
    expect(ok(app(), fn())).toBe(false);
  });

  it("T4035 - responsibility attaches an org to a FUNCTION, either way round", () => {
    expect(ok(org(), fn(), "epc-org-assignment")).toBe(true);
    expect(ok(fn(), org(), "epc-org-assignment")).toBe(true);
    expect(ok(position(), fn(), "epc-org-assignment")).toBe(true);
  });

  it("T4036 - but NEVER to an event — nobody performs a state", () => {
    // The rule that makes lane derivation safe: if an org unit could attach to
    // an event, the converter would have to guess which function it meant.
    expect(ok(org(), event(), "epc-org-assignment")).toBe(false);
    expect(ok(org(), xor(), "epc-org-assignment")).toBe(false);
  });

  it("T4037 - information flows between data and a function, in either direction", () => {
    // Direction is the semantics: data → function reads it, function → data
    // writes it. Both are legal and they mean different things.
    expect(ok(data(), fn(), "epc-information-flow")).toBe(true);
    expect(ok(fn(), data(), "epc-information-flow")).toBe(true);
    expect(ok(app(), fn(), "epc-information-flow")).toBe(true);
  });

  it("T4038 - an org unit is not information, and data is not responsibility", () => {
    // The arcs are typed, so the wrong arc between the right objects is caught
    // as surely as the wrong objects.
    expect(ok(org(), fn(), "epc-information-flow")).toBe(false);
    expect(ok(data(), fn(), "epc-org-assignment")).toBe(false);
  });
});

describe("EPC leaves every other notation alone", () => {
  it("T4039 - a BPMN pair is judged by the BPMN gauntlet, not the EPC one", () => {
    // The regression bar for adding rules to a shared predicate: a diagram with
    // no EPC symbols must behave exactly as it did. `epcCanConnect` abstains
    // when neither end is an EPC object, and this is what proves it.
    const task = el("task", "Do the thing");
    const gw = el("gateway");
    expect(ok(task, gw, "sequence")).toBe(true);
    expect(canConnect(el("final-state"), el("state"), "transition", [])).toBe(false);
  });

  it("T4040 - an EPC object refuses a foreign connector type outright", () => {
    // A `sequence` between two EPC objects is not a near-miss to be tolerated —
    // it is a BPMN arc in an EPC, and letting it through would put an edge in
    // the model that the converter has no rule for.
    expect(ok(fn(), event(), "sequence")).toBe(false);
    expect(ok(fn(), event(), "flowline")).toBe(false);
  });
});
