/**
 * T5289 — Create Project from Process Repository, for users (Paul, 2026-10-08): two Feature Availability entries (Restricted / Complete), what
 * each subscription level may create, the user mode of the shared runner (one AI attempt per diagram, the server trims to what is allowed), and
 * the menu entries.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FREE_PROCESSES, RESTRICTED_CHAIN, disabledReason, itemAllowed, modeFromStates, type RepositoryAccess,
} from "@/app/lib/valueChain/repositoryAccess";
import { FEATURE_KEYS } from "@/app/lib/features/registry";

const acc = (mode: RepositoryAccess["mode"], levelId: string | null): RepositoryAccess => ({ mode, levelId });
const item = (chainCode: string, type: string, processCode = "") => ({ chainCode, type, processCode });

describe("T5289 which mode a level is in", () => {
  it("Complete wins, then Restricted, else none; hidden and disabled do not count", () => {
    expect(modeFromStates({ "process-repository-complete": "available", "process-repository-restricted": "available" })).toBe("complete");
    expect(modeFromStates({ "process-repository-restricted": "available" })).toBe("restricted");
    expect(modeFromStates({ "process-repository-complete": "hidden", "process-repository-restricted": "disabled" })).toBe("none");
    expect(modeFromStates({})).toBe("none");
  });
});

describe("T5289 what each level may create", () => {
  it("Free (Restricted): the V01 Value Chain diagram and processes V01.01 and V01.02 — nothing else", () => {
    const free = acc("restricted", "free");
    expect(RESTRICTED_CHAIN).toBe("V01");
    expect(FREE_PROCESSES).toEqual(["V01.01", "V01.02"]);
    expect(itemAllowed(free, item("V01", "value-chain"))).toBe(true);
    expect(itemAllowed(free, item("V01", "bpmn", "V01.01"))).toBe(true);
    expect(itemAllowed(free, item("V01", "bpmn", "V01.02"))).toBe(true);
    expect(itemAllowed(free, item("V01", "bpmn", "V01.03"))).toBe(false);
    expect(itemAllowed(free, item("V01", "context"))).toBe(false);
    expect(itemAllowed(free, item("V01", "archimate"))).toBe(false);
    expect(itemAllowed(free, item("V02", "value-chain"))).toBe(false);
    expect(itemAllowed(free, item("V02", "bpmn", "V02.01"))).toBe(false);
  });
  it("Introductory (Restricted): all of V01 — and still nothing outside it", () => {
    const intro = acc("restricted", "introductory");
    for (const t of ["value-chain", "context", "process-context", "archimate"]) expect(itemAllowed(intro, item("V01", t)), t).toBe(true);
    expect(itemAllowed(intro, item("V01", "bpmn", "V01.07"))).toBe(true);
    expect(itemAllowed(intro, item("V02", "bpmn", "V02.01"))).toBe(false);
    expect(itemAllowed(intro, item("V02", "value-chain"))).toBe(false);
  });
  it("Professional / Expert / Enterprise (Complete): everything; no subscription feature: nothing", () => {
    for (const level of ["professional", "expert", "enterprise"]) {
      expect(itemAllowed(acc("complete", level), item("V19", "bpmn", "V19.04"))).toBe(true);
      expect(itemAllowed(acc("complete", level), item("V26", "archimate"))).toBe(true);
    }
    expect(itemAllowed(acc("none", "free"), item("V01", "value-chain"))).toBe(false);
  });
  it("a disabled diagram says why, in words a person can act on", () => {
    expect(disabledReason(acc("restricted", "free"), item("V01", "bpmn", "V01.05"))).toBe("Available on Introductory and above");
    expect(disabledReason(acc("restricted", "introductory"), item("V03", "bpmn", "V03.01"))).toBe("Available on Professional and above");
    expect(disabledReason(acc("none", null), item("V01", "value-chain"))).toBe("Not included in your subscription");
    expect(disabledReason(acc("complete", "expert"), item("V03", "bpmn", "V03.01"))).toBeNull();
  });
});

describe("T5289 the Feature Availability grid and the prod SQL agree", () => {
  const seed = JSON.parse(readFileSync("menus_and_features/feature-availability.seed.json", "utf8")) as { rows: { key: string; states: Record<string, string> }[] };
  const sql = readFileSync("scripts/sql/patch-process-repository-features.sql", "utf8");
  it("both features are in the registry and the seed matrix with the levels Paul named", () => {
    expect(FEATURE_KEYS).toContain("process-repository-restricted");
    expect(FEATURE_KEYS).toContain("process-repository-complete");
    const r = seed.rows.find((x) => x.key === "process-repository-restricted")!.states;
    const c = seed.rows.find((x) => x.key === "process-repository-complete")!.states;
    expect(r).toEqual({ free: "available", introductory: "available", professional: "hidden", expert: "hidden", enterprise: "hidden" });
    expect(c).toEqual({ free: "hidden", introductory: "hidden", professional: "available", expert: "available", enterprise: "available" });
  });
  it("the patch holds exactly the same ten cells and REPORTS whether it was already run", () => {
    for (const key of ["process-repository-restricted", "process-repository-complete"]) {
      const states = seed.rows.find((x) => x.key === key)!.states;
      const flat = sql.replace(/\s+/g, " ");
      for (const [level, state] of Object.entries(states)) expect(flat, `${key}/${level}`).toContain(`('${level}', '${key}', '${state}')`);
    }
    for (const word of ["ALREADY APPLIED", "APPLIED NOW", "NOT APPLIED"]) expect(sql).toContain(word);
    expect(sql).not.toContain("DELETE FROM");
  });
});

describe("T5289 the runner's user mode", () => {
  const run = readFileSync("app/lib/valueChain/runLibraryProject.ts", "utf8");
  it("filters to what the feature opens on the SERVER, refuses a non-library source, and respects hidden chains and the Org's model", () => {
    expect(run).toContain("itemAllowed(repoAccess!, { chainCode: chain!.code, type: d.type, processCode: s?.processCode ?? \"\" })");
    expect(run).toContain('if (userMode && !fromLibrary)');
    expect(run).toContain("if (userMode && row.hidden)");
    expect(run).toContain("userMode ? await resolveOrgModel()");
    expect(run).toContain('The Process Repository is not part of your subscription.');
  });
  it("meters one AI attempt per diagram: checked before each, recorded on success only, and a new project counts against the projects limit", () => {
    expect(run).toContain('await gateLimit(userId, "aiAttempts")');
    expect(run).toContain('if (userMode) await recordUsage(userId, "aiAttempts");');
    expect(run).toContain('gateLimit(session.user.id, "projects")');
    expect(run).toContain('reason: "limit"');
  });
  it("the SuperAdmin route is the same runner in superadmin mode, and the user routes exist with their guards", () => {
    expect(readFileSync("app/api/admin/md-diagrams/run/route.ts", "utf8")).toContain('runLibraryProject(req, "superadmin")');
    const create = readFileSync("app/api/repository/create-project/route.ts", "utf8");
    expect(create).toContain('runLibraryProject(req, "user")');
    expect(create).toContain("isReadOnlyImpersonation");
    expect(readFileSync("app/api/repository/questions/route.ts", "utf8")).toContain("isReadOnlyImpersonation");
    const chains = readFileSync("app/api/repository/chains/route.ts", "utf8");
    expect(chains).toContain("publishedChainsFor(orgId)");
    expect(readFileSync("app/lib/valueChain/repositoryChains.ts", "utf8")).toContain("orgId: MASTER_ORG, publishedAt: { not: null }");
    expect(chains).toContain("allowed: itemAllowed(access, item)");
  });
});

describe("T5289 where a person finds it", () => {
  it("the Project menu has Create Project from Process Repository…, and the dashboard has the button beside Create APQC Project", () => {
    const project = readFileSync("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", "utf8");
    expect(project).toContain("Create Project from Process Repository…");
    expect(project).toContain("<CreateFromRepositoryDialog currentProjectId={project.id}");
    const dash = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");
    expect(dash).toContain("Create Project from Process Repository");
    expect(dash).toContain("<CreateFromRepositoryDialog onClose");
  });
  it("the dialog is a scrollable popup, lists every diagram with the disabled ones greyed and their reason, asks the questions, and offers 'This project' only inside one", () => {
    const d = readFileSync("app/components/repository/CreateFromRepositoryDialog.tsx", "utf8");
    expect(d).toContain("max-h-[88vh]");
    expect(d).toContain("overflow-y-auto");
    expect(d).toContain("/api/repository/questions");
    expect(d).toContain("{!d.allowed && <span");
    expect(d).toContain("{currentProjectId && (");
    expect(d).not.toContain("md-diagrams");                    // no .md loading and no SuperAdmin-only option
    expect(d).not.toContain("Only what I just generated");
  });
});
