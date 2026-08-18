/**
 * Load the GREEN (AI-enforceable) rules brief for a diagram type — the exact
 * "General + <type> default rules → splitRulesByEnforcement → PCF grounding"
 * pipeline every AI Generate route repeats inline (see generate-diagram/route.ts
 * and generate-bpmn/compare/route.ts). Extracted so batch callers get the same
 * production brief without duplicating the query.
 */
import { prisma } from "@/app/lib/db";
import { splitRulesByEnforcement } from "./splitRules";
import { groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";

/**
 * Returns the green-filtered, PCF-grounded rules markdown for `diagramType`
 * (the Diagram.type key: "bpmn", "value-chain", "context", "process-context",
 * "archimate", …). Never throws — returns "" if the rules tables are empty.
 */
export async function loadAiRulesForType(diagramType: string): Promise<string> {
  let rules = "";
  try {
    for (const category of ["general", diagramType]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
    }
  } catch {
    /* proceed without rules — matches the routes' behaviour */
  }
  rules = splitRulesByEnforcement(rules).aiRules;
  rules = await groundRulesWithPcf(prisma, rules, undefined);
  return rules;
}
