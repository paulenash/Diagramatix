import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MD_PROMPT_TYPES, MD_PROMPT_LABEL, MD_PROMPT_CATEGORIES, DEFAULT_MD_PROMPT,
  mdPromptCategory, mdPromptTypeOf, extractMdPromptAdditions, buildMdPromptBriefing,
  renderPromptBlock, type MdPromptType,
} from "@/app/lib/valueChain/promptTemplates";
import {
  chainSection, chainTitle, subprocessHeadings, chainNarrative, chainCodes,
} from "@/app/lib/valueChain/chainSource";
import { stripWrapper, roundTrip, targetsFor, buildUserMessage } from "@/app/lib/valueChain/generatePrompt";
import { parseValueChainMd } from "@/app/lib/valueChain/parseValueChainMd";
import { BUILTIN_BY_CATEGORY, builtinFor } from "@/app/lib/ai/builtinRuleCategories";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

/**
 * T2891 — reading a chain's narrative out of the real repository document.
 *
 * The generator writes prompts FROM the narrative, so what counts as "the
 * narrative" is load-bearing. In particular the existing prompt blocks must be
 * stripped: leave them in and the model copies the nearest one almost verbatim,
 * so a template change appears to do nothing and the generator looks like it
 * works while actually laundering its input. That failure would be invisible —
 * the output would be good prompts — which is why it is tested against the real
 * 463 KB document rather than a fixture that could drift away from it.
 */
describe("Process Repository — reading a chain", () => {
  const md = fs.readFileSync(REPO_MD, "utf8");

  it("finds every chain the document declares", () => {
    expect(chainCodes(md)).toEqual(["V01", "V02", "V03", "V04", "V05", "V06", "V07", "V08", "V09"]);
  });

  it("slices a chain's own section, with its title and subprocesses", () => {
    const section = chainSection(md, "V01");
    expect(section).not.toBeNull();
    expect(chainTitle(section!)).toBe("Order to Cash");
    const subs = subprocessHeadings(section!, "V01");
    expect(subs).toHaveLength(11);
    expect(subs[0]).toEqual({ code: "V01.01", title: "Receive Order" });
    expect(subs[10].code).toBe("V01.11");
    // The slice stops at the next chain — V02's subprocesses must not leak in.
    expect(subs.every((s) => s.code.startsWith("V01."))).toBe(true);
  });

  it("returns null for a chain that is not there", () => {
    expect(chainSection(md, "V99")).toBeNull();
  });

  it("strips every existing prompt out of the narrative", () => {
    for (const code of chainCodes(md)) {
      const section = chainSection(md, code)!;
      const narrative = chainNarrative(section);
      expect(narrative, `${code} narrative must not carry a fence`).not.toContain("```");
      expect(narrative, `${code} narrative must not carry a prompt label`).not.toMatch(/diagram prompt\.\*\*/);
      // The narrative is the small part: the prompts are the bulk of a section.
      expect(narrative.length, `${code} narrative should be a fraction of its section`).toBeLessThan(section.length / 3);
      expect(narrative.length, `${code} must still have a narrative`).toBeGreaterThan(2000);
    }
  });

  it("keeps the seven-part narrative structure intact", () => {
    const narrative = chainNarrative(chainSection(md, "V01")!);
    for (const part of [
      "Teams and roles involved", "External participants", "High-level subprocesses",
      "IT systems", "Policies and procedures",
    ]) {
      expect(narrative, `the "${part}" section must survive stripping`).toContain(part);
    }
  });

  it("reads subprocess headings even when a chain has no prompts yet", () => {
    // The case the generator exists to serve: narrative written, prompts not.
    const doc = [
      "## V10 — Market to Lead", "", "**Teams and roles involved.**", "Marketing and Sales.", "",
      "### V10.01 — Plan Campaign", "", "### V10.02 — Capture Response", "",
    ].join("\n");
    const section = chainSection(doc, "V10")!;
    expect(chainTitle(section)).toBe("Market to Lead");
    expect(subprocessHeadings(section, "V10")).toEqual([
      { code: "V10.01", title: "Plan Campaign" },
      { code: "V10.02", title: "Capture Response" },
    ]);
    expect(chainNarrative(section)).toContain("Marketing and Sales");
  });
});

/**
 * T2892 — the master templates and the built-in/additions split.
 *
 * The split exists because the two halves have different lifetimes: the built-in
 * is a house standard that should improve for everyone on a deploy, the additions
 * are one organisation's conventions that must survive every deploy untouched.
 * Storing the whole briefing in a row freezes the standard at whatever it was the
 * day someone first edited it — which is exactly how the Staff Narrative briefing
 * ended up with a legacy shape to detect.
 */
describe("Process Repository — the master templates", () => {
  it("has a template, a category and a label for every parsed diagram type", () => {
    expect(MD_PROMPT_TYPES).toEqual(["bpmn", "value-chain", "context", "process-context", "archimate"]);
    for (const t of MD_PROMPT_TYPES) {
      expect(DEFAULT_MD_PROMPT[t]?.length, `${t} template`).toBeGreaterThan(500);
      expect(MD_PROMPT_LABEL[t]).toBeTruthy();
      expect(mdPromptTypeOf(mdPromptCategory(t))).toBe(t);
    }
    expect(MD_PROMPT_CATEGORIES).toHaveLength(5);
    expect(mdPromptTypeOf("bpmn")).toBeNull();
    expect(mdPromptTypeOf("staff-narrative")).toBeNull();
  });

  it("every template states the output contract, which is what keeps it parseable", () => {
    for (const t of MD_PROMPT_TYPES) {
      const tpl = DEFAULT_MD_PROMPT[t];
      expect(tpl, `${t}`).toContain("OUTPUT CONTRACT");
      expect(tpl, `${t} must forbid a preamble`).toMatch(/Never begin with "Here is"/);
      expect(tpl, `${t} must forbid its own fences`).toMatch(/no markdown fences of your own/);
      expect(tpl, `${t} must ground the prompt in the narrative`).toContain("GROUNDING");
    }
  });

  it("the BPMN template carries the canonical sections, in order", () => {
    const tpl = DEFAULT_MD_PROMPT.bpmn;
    const order = [
      "1. Pools & Lanes", "2. Pool properties", "3. Layout",
      "4. Lane contents in flow order", "5. Edge-mounted (boundary) events", "6. Connectors",
      "7. Data objects",
    ];
    let at = -1;
    for (const heading of order) {
      const found = tpl.indexOf(heading);
      expect(found, `${heading} must appear`).toBeGreaterThan(-1);
      expect(found, `${heading} must come after the previous section`).toBeGreaterThan(at);
      at = found;
    }
    expect(tpl).toContain("these seven numbered sections");
  });

  it("never asks for a loop-back — the shape R3.14 forbids and the code strips", () => {
    // The defect this template shipped with: it said "say explicitly where a
    // branch rejoins OR LOOPS BACK TO", so the repository's own V01.01 prompt
    // contains `then back to "Capture order details"` — repetition asked for and
    // silently discarded, across 104 prompts. Guarded rather than remembered.
    const tpl = DEFAULT_MD_PROMPT.bpmn;
    expect(tpl, "the template must not invite a loop-back").not.toMatch(/loops? back to/i);
    expect(tpl).toContain("REPETITION IS A SUBPROCESS, NEVER A LOOP-BACK");
    expect(tpl).toContain("(standard loop)");
    // And the four improvements adopted alongside it.
    expect(tpl, "R3.03 — every split needs a named merge").toMatch(/MERGE gateway/);
    expect(tpl, "R4.04 — waiting is an event, not a task").toContain("WAITING IS AN EVENT ON THE FLOW");
    expect(tpl, "cross-reference at both ends").toContain("The START event names where the work arrives from");
    expect(tpl, "R4.06/R4.07 need data objects to exist at all").toMatch(/Data Object "<name>"/);
  });

  it("uses the built-in alone when nothing is stored", () => {
    for (const t of MD_PROMPT_TYPES) {
      expect(buildMdPromptBriefing(t, null)).toBe(DEFAULT_MD_PROMPT[t]);
      expect(buildMdPromptBriefing(t, "")).toBe(DEFAULT_MD_PROMPT[t]);
      expect(buildMdPromptBriefing(t, "   \n  ")).toBe(DEFAULT_MD_PROMPT[t]);
    }
  });

  it("appends stored additions under their own heading, built-in first", () => {
    const brief = buildMdPromptBriefing("bpmn", "Always name the ERP as SAP S/4HANA.");
    expect(brief.startsWith(DEFAULT_MD_PROMPT.bpmn), "the built-in must lead").toBe(true);
    expect(brief).toContain("## Additional Rules — house conventions");
    expect(brief).toContain("Always name the ERP as SAP S/4HANA.");
    expect(extractMdPromptAdditions("  keep it short  ")).toBe("keep it short");
    expect(extractMdPromptAdditions(null)).toBe("");
  });

  it("registers all five as built-in-backed categories, alongside Staff Narrative", () => {
    for (const t of MD_PROMPT_TYPES) {
      const b = builtinFor(mdPromptCategory(t));
      expect(b, `${t} must be registered`).not.toBeNull();
      expect(b!.builtin).toBe(DEFAULT_MD_PROMPT[t]);
      expect(b!.extractAdditions("some house rule")).toBe("some house rule");
    }
    expect(builtinFor("staff-narrative")).not.toBeNull();
    // An ordinary diagram-rules category is a single editable blob, not a split.
    expect(builtinFor("bpmn")).toBeNull();
    expect(builtinFor("general")).toBeNull();
    expect(Object.keys(BUILTIN_BY_CATEGORY).sort()).toEqual([
      "md-prompt-archimate", "md-prompt-bpmn", "md-prompt-context",
      "md-prompt-process-context", "md-prompt-value-chain", "staff-narrative",
    ]);
  });
});

/**
 * T2893 — THE ROUND TRIP, which is the whole warrant for the feature.
 *
 * A generated block is only useful if the batch runner can find it again. The
 * check is not a regex that approximates `parseValueChainMd` — it is that
 * function, run on the block, asserting the prompt comes back with the right type
 * and its text intact. Without this, a template edit could silently produce
 * beautiful prompts the batch tool cannot see, and the failure would surface only
 * when someone asked for 140 diagrams.
 */
describe("Process Repository — generated blocks round-trip", () => {
  const sample: Record<MdPromptType, string> = {
    bpmn: "BPMN: V10.01 Plan Campaign — first stage of Market to Lead.\n\n1. Pools & Lanes\n- Pool \"Prospect\" — the external party.",
    "value-chain": "Value Chain V10 - Market to Lead\nLay out a single left-to-right sequence.\n\nV10.01. Plan Campaign",
    context: "Context Diagram: V10 — Market to Lead.\n\n1. Central system (process-system)\nA single central ellipse.",
    "process-context": "Process Context Diagram: V10 — Market to Lead.\n\n1. System boundary and processes\n- V10.01 Plan Campaign",
    archimate: "ArchiMate: V10 — Market to Lead — Service & Application Landscape (high level).\n\n1. Business Actors (Business Actor)\n- Prospect",
  };

  it("every type's block parses back with the batch tool's own reader", () => {
    for (const type of MD_PROMPT_TYPES) {
      const block = renderPromptBlock(type, sample[type]);
      const rt = roundTrip("V10", "Market to Lead", type, block);
      expect(rt.ok, `${type} must parse back`).toBe(true);
      expect(rt.name, `${type} must be named`).toBeTruthy();
    }
  });

  it("a whole chain of generated blocks parses as one document", () => {
    const doc = [
      "## V10 — Market to Lead",
      "",
      renderPromptBlock("value-chain", sample["value-chain"]),
      "",
      renderPromptBlock("context", sample.context),
      "",
      renderPromptBlock("process-context", sample["process-context"]),
      "",
      renderPromptBlock("archimate", sample.archimate),
      "",
      "### V10.01 — Plan Campaign",
      "",
      renderPromptBlock("bpmn", sample.bpmn),
      "",
    ].join("\n");
    const chains = parseValueChainMd(doc);
    expect(chains).toHaveLength(1);
    expect(chains[0].code).toBe("V10");
    expect(chains[0].title).toBe("Market to Lead");
    const types = chains[0].diagrams.map((d) => d.type).sort();
    expect(types).toEqual(["archimate", "bpmn", "context", "process-context", "value-chain"]);
    for (const d of chains[0].diagrams) expect(d.prompt.trim().length, d.name).toBeGreaterThan(20);
    // The BPMN prompt must come back verbatim — the fence must not eat anything.
    const bpmn = chains[0].diagrams.find((d) => d.type === "bpmn")!;
    expect(bpmn.prompt).toBe(sample.bpmn);
  });

  it("reports a block that would NOT parse, rather than passing it through", () => {
    // The failure mode this exists to catch: no label, so the reader never sees it.
    const naked = "```text\nBPMN: V10.01 Plan Campaign.\n```";
    expect(roundTrip("V10", "Market to Lead", "bpmn", naked).ok).toBe(false);
  });

  it("undoes a wrapper the model added despite being told not to", () => {
    // A nested fence would break the parse in a way that is tedious to spot by
    // eye, so it is cheaper to undo than to rely on instruction-following.
    expect(stripWrapper("```text\nBPMN: V10.01 Plan.\n```")).toBe("BPMN: V10.01 Plan.");
    expect(stripWrapper("```\nBPMN: V10.01 Plan.\n```")).toBe("BPMN: V10.01 Plan.");
    expect(stripWrapper("**BPMN diagram prompt.**\n\nBPMN: V10.01 Plan.")).toBe("BPMN: V10.01 Plan.");
    expect(stripWrapper("  BPMN: V10.01 Plan.  ")).toBe("BPMN: V10.01 Plan.");
    // Text that is already clean is left exactly alone, fences inside it included.
    const clean = "BPMN: V10.01 Plan.\n\n1. Pools & Lanes\n- Pool \"X\"";
    expect(stripWrapper(clean)).toBe(clean);
  });
});

/**
 * T2894 — what a run would ask for.
 *
 * The targets and the user message decide what the operator pays for and what the
 * model is grounded in, so both are pinned. The whole subprocess list travels with
 * every BPMN call on purpose: a BPMN prompt has to name the subprocess that
 * follows it in its end event, and that cross-reference is what makes a generated
 * project navigable rather than eleven disconnected diagrams.
 */
describe("Process Repository — what a run asks for", () => {
  const subs = [
    { code: "V10.01", title: "Plan Campaign" },
    { code: "V10.02", title: "Capture Response" },
  ];

  it("expands to the chain-level prompts plus one per subprocess", () => {
    const all = targetsFor("V10", "Market to Lead", subs, [...MD_PROMPT_TYPES]);
    expect(all).toHaveLength(4 + subs.length);
    // Chain-level first, in document order, then the BPMN ones.
    expect(all.slice(0, 4).map((t) => t.type)).toEqual(["value-chain", "context", "process-context", "archimate"]);
    expect(all.slice(4).map((t) => t.code)).toEqual(["V10.01", "V10.02"]);
    for (const t of all.slice(0, 4)) expect(t.code).toBe("V10");
  });

  it("generates only the types asked for", () => {
    expect(targetsFor("V10", "Market to Lead", subs, ["bpmn"])).toHaveLength(2);
    expect(targetsFor("V10", "Market to Lead", subs, ["context"])).toHaveLength(1);
    expect(targetsFor("V10", "Market to Lead", [], ["bpmn"])).toHaveLength(0);
  });

  it("grounds every call in the narrative and the full subprocess list", () => {
    const msg = buildUserMessage({
      chainCode: "V10", chainTitle: "Market to Lead",
      narrative: "**Teams and roles involved.**\nMarketing and Sales.",
      subs, target: { type: "bpmn", code: "V10.01", title: "Plan Campaign" },
    });
    expect(msg).toContain("VALUE CHAIN: V10 — Market to Lead");
    expect(msg).toContain("Marketing and Sales");
    // Both subprocesses, so the prompt can name what comes next.
    expect(msg).toContain("- V10.01 Plan Campaign");
    expect(msg).toContain("- V10.02 Capture Response");
    expect(msg).toContain("Write the BPMN diagram prompt for the subprocess V10.01 Plan Campaign.");
  });

  it("asks for the whole chain when the target is chain-level", () => {
    const msg = buildUserMessage({
      chainCode: "V10", chainTitle: "Market to Lead", narrative: "n",
      subs, target: { type: "archimate", code: "V10", title: "Market to Lead" },
    });
    expect(msg).toContain("Write the ArchiMate diagram prompt for the whole chain V10 Market to Lead.");
  });
});
