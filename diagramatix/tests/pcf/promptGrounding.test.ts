/**
 * PCF AI grounding (Level 3): rendering a classified process's sub-activities as
 * a prompt block, and appending it to the AI rules. Pure — a mock Prisma stands
 * in for the DB.
 */
import { describe, it, expect } from "vitest";
import { renderPcfBranchForPrompt, groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";

// Minimal Prisma stand-in with just the two methods the helper calls.
function mockPrisma(node: unknown, descendants: unknown[]) {
  return {
    pcfNode: {
      findUnique: async () => node,
      findMany: async () => descendants,
    },
  } as unknown as Parameters<typeof renderPcfBranchForPrompt>[0];
}

const NODE = { hierarchyId: "4.2", name: "Manage orders", level: 2, frameworkId: "f1", framework: { variant: "Retail" } };
const KIDS = [
  { hierarchyId: "4.2.1", name: "Receive orders", level: 3 },
  { hierarchyId: "4.2.1.1", name: "Validate order", level: 4 },
];

describe("PCF AI grounding", () => {
  it("T0664 — renders a branch as an aligned, indented reference block", async () => {
    const out = (await renderPcfBranchForPrompt(mockPrisma(NODE, KIDS), "n1"))!;
    expect(out).toContain("APQC PCF ALIGNMENT");
    expect(out).toContain("Retail");
    expect(out).toContain('"4.2 Manage orders"');
    expect(out).toContain("- 4.2.1 Receive orders");           // child, no indent
    expect(out).toContain("  - 4.2.1.1 Validate order");        // grandchild, indented
  });

  it("T0665 — grounding appends to rules; no-op without a classification / sub-structure", async () => {
    const withBlock = await groundRulesWithPcf(mockPrisma(NODE, KIDS), "GREEN RULES", "n1");
    expect(withBlock.startsWith("GREEN RULES\n\n")).toBe(true);
    expect(withBlock).toContain("APQC PCF ALIGNMENT");

    // No classified node → rules unchanged.
    expect(await groundRulesWithPcf(mockPrisma(NODE, KIDS), "GREEN RULES", undefined)).toBe("GREEN RULES");
    // Classified but a leaf (no descendants) → null / unchanged rules.
    expect(await renderPcfBranchForPrompt(mockPrisma(NODE, []), "n1")).toBeNull();
    expect(await groundRulesWithPcf(mockPrisma(NODE, []), "GREEN RULES", "n1")).toBe("GREEN RULES");
  });
});
