/**
 * The ready-made Order-to-Cash GRC sample must be internally consistent so the
 * seed can't build a broken library: unique codes, every link references real
 * items, every kind present, and monitor signatures are well-formed.
 */
import { describe, it, expect } from "vitest";
import { O2C_SAMPLE } from "@/app/lib/riskControls/o2cSample";
import { RISK_CONTROL_KINDS } from "@/app/lib/riskControls/types";

const CONFORMANCE_RULES = new Set(["undocumented-transition", "unknown-state", "unexpected-entry", "unexpected-exit", "dead-transition"]);

describe("Order-to-Cash sample GRC library", () => {
  it("T0636 — is internally consistent (codes, links, kinds, monitor signatures)", () => {
    const items = O2C_SAMPLE.items;
    const codes = new Set(items.map((i) => i.code));

    // Unique codes.
    expect(codes.size).toBe(items.length);

    // Every kind is represented (a full traceability demo).
    for (const kind of RISK_CONTROL_KINDS) {
      expect(items.some((i) => i.kind === kind), `has a ${kind}`).toBe(true);
    }

    // Every link references two real, distinct items.
    for (const ln of O2C_SAMPLE.links) {
      expect(codes.has(ln.source), `link source ${ln.source} exists`).toBe(true);
      expect(codes.has(ln.target), `link target ${ln.target} exists`).toBe(true);
      expect(ln.source).not.toBe(ln.target);
    }

    // Every Control→Risk mitigation points at a real Risk; every Risk is mitigated.
    const byCode = new Map(items.map((i) => [i.code, i]));
    const mitigatedRisks = new Set(
      O2C_SAMPLE.links.filter((l) => byCode.get(l.source)?.kind === "Control" && byCode.get(l.target)?.kind === "Risk").map((l) => l.target),
    );
    for (const r of items.filter((i) => i.kind === "Risk")) {
      expect(mitigatedRisks.has(r.code), `${r.code} has a mitigating control`).toBe(true);
    }

    // The governance chain exists: at least one Policy→Control and Regulation→Policy.
    const hasEdge = (sk: string, tk: string) => O2C_SAMPLE.links.some((l) => byCode.get(l.source)?.kind === sk && byCode.get(l.target)?.kind === tk);
    expect(hasEdge("Policy", "Control")).toBe(true);
    expect(hasEdge("Regulation", "Policy")).toBe(true);
    expect(hasEdge("KRI", "Risk")).toBe(true);

    // Monitor signatures are well-formed and only on Controls; at least one exists.
    const monitored = items.filter((i) => i.monitorSignature);
    expect(monitored.length).toBeGreaterThan(0);
    for (const c of monitored) {
      expect(c.kind).toBe("Control");
      const [rule, ...rest] = c.monitorSignature!.split("|");
      expect(CONFORMANCE_RULES.has(rule), `${c.code} rule "${rule}" valid`).toBe(true);
      expect(rest.length === 1 || rest.length === 2, `${c.code} signature shape`).toBe(true);
    }
  });
});
