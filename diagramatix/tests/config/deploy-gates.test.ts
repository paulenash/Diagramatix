/**
 * OPS-01 / OPS-02 — the two gates that stand in front of a production deploy.
 *
 * OPS-01: `prisma db push --accept-data-loss` runs unattended against prod on
 * every release. A renamed field reads as a drop plus an add, so the old
 * column's data would be gone before anyone saw the diff. The gate reads the
 * SQL first and refuses anything destructive.
 *
 * OPS-02: the deploy used to start on the push itself, in parallel with CI.
 * A commit whose suite went red was built and swapped into production at the
 * same moment the red X appeared on it.
 *
 * Both halves are tested: the RULE (a pure function, so the logic is provable)
 * and the WIRING (the workflow file, so a rule nothing calls cannot pass). The
 * second half matters more than it looks — a perfect guard in a step that runs
 * after the thing it guards, or with continue-on-error on it, protects nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findDestructiveStatements,
  isSchemaChangeSafe,
  describeDestructiveStatements,
  stripSqlComments,
  splitSqlStatements,
} from "@/app/lib/deploy/destructiveSchema";

const WORKFLOW = readFileSync(
  join(process.cwd(), "..", ".github", "workflows", "azure-deploy.yml"),
  "utf8",
);

const LINES = WORKFLOW.split("\n");
const isStepStart = (l: string) => /^\s*- name:/.test(l);

/** The line index of the first step whose name contains `needle`. */
const stepLine = (needle: string): number => {
  const i = LINES.findIndex((l) => isStepStart(l) && l.includes(needle));
  expect(i, `no deploy step named like "${needle}"`).toBeGreaterThan(-1);
  return i;
};

/**
 * The whole of one step — its name down to the next step — with comment lines
 * removed. Assertions about what a step does must look at the step's own body,
 * not at the file as a whole: "the file mentions the checker somewhere" is
 * satisfied by a commented-out line, and a `|| true` on the end of the command
 * turns the gate into a no-op while every substring assertion still passes.
 */
const stepBody = (needle: string): string => {
  const start = stepLine(needle);
  const rest = LINES.slice(start + 1).findIndex(isStepStart);
  const end = rest === -1 ? LINES.length : start + 1 + rest;
  return LINES.slice(start, end)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
};

/** Nothing in a step may swallow a non-zero exit. */
const expectFailsClosed = (needle: string) => {
  const body = stepBody(needle);
  expect(body, `${needle}: continue-on-error makes the step advisory`).not.toMatch(
    /continue-on-error:\s*true/,
  );
  // `cmd || true`, `cmd || :`, `cmd || echo ...` all turn a failure into a pass.
  expect(body, `${needle}: a shell fallback swallows the failure`).not.toMatch(/\|\|\s*(true|:|echo)\b/);
  expect(body, `${needle}: set +e disarms the shell`).not.toMatch(/set\s+\+e/);
};

describe("T4455 — destructive statements are recognised", () => {
  const cases: Array<[string, string]> = [
    ["drop-column", 'ALTER TABLE "DiagramTemplate" DROP COLUMN "thumbnailSvg";'],
    ["drop-table", 'DROP TABLE "Diagram";'],
    ["drop-type", 'DROP TYPE "ReviewStatus";'],
    ["truncate", 'TRUNCATE TABLE "AuditLog";'],
    ["drop-schema", "DROP SCHEMA public CASCADE;"],
    ["drop-database", "DROP DATABASE diagramatix;"],
    ["change-column-type", 'ALTER TABLE "Diagram" ALTER COLUMN "name" SET DATA TYPE VARCHAR(10);'],
  ];

  for (const [kind, sql] of cases) {
    it(`flags ${kind}`, () => {
      const found = findDestructiveStatements(sql);
      expect(found.map((f) => f.kind)).toContain(kind);
      expect(isSchemaChangeSafe(sql)).toBe(false);
    });
  }

  it("is the real shape prisma emits for a dropped field", () => {
    // Captured from `prisma migrate diff --from-config-datasource --to-schema
    // <schema with one field removed> --script` against the dev database.
    const real = [
      "-- AlterTable",
      'ALTER TABLE "DiagramTemplate" DROP COLUMN "thumbnailSvg";',
    ].join("\n");
    expect(findDestructiveStatements(real)).toHaveLength(1);
  });
});

describe("T4456 — an ordinary additive release passes", () => {
  const ADDITIVE = [
    "-- CreateTable",
    'CREATE TABLE "PartnerJob" ("id" TEXT NOT NULL, "orgId" TEXT NOT NULL);',
    "",
    "-- AlterTable",
    'ALTER TABLE "Diagram" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;',
    "",
    "-- CreateIndex",
    'CREATE UNIQUE INDEX "PartnerJob_id_key" ON "PartnerJob"("id");',
    "",
    'ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE;',
  ].join("\n");

  it("lets additive SQL through", () => {
    expect(findDestructiveStatements(ADDITIVE)).toEqual([]);
    expect(isSchemaChangeSafe(ADDITIVE)).toBe(true);
  });

  it("does not cry wolf on rules that are dropped but destroy no data", () => {
    // If the gate blocked these it would fire on routine releases and someone
    // would quite reasonably turn it off. Dropping a rule is not dropping data.
    const rulesOnly = [
      'ALTER TABLE "Diagram" DROP CONSTRAINT "Diagram_orgId_fkey";',
      'ALTER TABLE "Diagram" ALTER COLUMN "name" DROP DEFAULT;',
      'ALTER TABLE "Diagram" ALTER COLUMN "note" DROP NOT NULL;',
      'DROP INDEX "Diagram_slug_key";',
    ].join("\n");
    expect(findDestructiveStatements(rulesOnly)).toEqual([]);
  });

  it("treats an empty diff as safe", () => {
    expect(isSchemaChangeSafe("-- This is an empty migration.")).toBe(true);
    expect(isSchemaChangeSafe("")).toBe(true);
  });
});

describe("T4457 — only executable statements count", () => {
  it("ignores a warning comment that talks about dropping a column", () => {
    // Prisma's own warnings are phrased exactly like this.
    const sql = [
      "/*",
      "  Warnings:",
      "",
      "  - You are about to DROP TABLE `Diagram`. All the data will be lost.",
      "*/",
      'ALTER TABLE "Diagram" ADD COLUMN "note" TEXT;',
    ].join("\n");
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it("ignores a line comment", () => {
    expect(findDestructiveStatements('-- DROP TABLE "Diagram";')).toEqual([]);
  });

  it("ignores the words inside a string literal", () => {
    const sql = `INSERT INTO "AuditLog" ("action") VALUES ('DROP TABLE Diagram');`;
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it("still sees a real statement that follows a comment on the same line", () => {
    const sql = '-- AlterTable\nALTER TABLE "Diagram" DROP COLUMN "note"; -- gone';
    expect(findDestructiveStatements(sql)).toHaveLength(1);
  });

  it("strips comments and splits statements the way the scanner needs", () => {
    const stripped = stripSqlComments("A; /* x */ B; -- y\nC;");
    expect(splitSqlStatements(stripped)).toEqual(["A", "B", "C"]);
  });
});

describe("T4458 — the operator is told what to do about it", () => {
  it("names every offending statement and the way out", () => {
    const sql = 'ALTER TABLE "Diagram" DROP COLUMN "note";\nDROP TABLE "Old";';
    const report = describeDestructiveStatements(findDestructiveStatements(sql));
    expect(report).toContain("DROP COLUMN");
    expect(report).toContain("DROP TABLE");
    expect(report).toContain("allow_destructive_schema_change");
    // The likeliest cause, said out loud, because it is not obvious.
    expect(report.toLowerCase()).toContain("rename");
  });
});

describe("T4459 — OPS-01 gate is wired into the deploy, before the push", () => {
  it("runs the checker, and runs it before the schema is applied", () => {
    expect(stepLine("schema change is not destructive")).toBeLessThan(
      stepLine("Apply database schema"),
    );
    const gate = stepBody("schema change is not destructive");
    // It must diff against the LIVE database, not against an empty datamodel —
    // a diff from empty is always additive and would never flag anything.
    expect(gate).toContain("--from-config-datasource");
    expect(gate).toContain("--to-schema prisma/schema.prisma");
    expect(gate).toContain("scripts/check-destructive-schema.ts");
  });

  it("does not let the gate fail open", () => {
    expectFailsClosed("schema change is not destructive");
  });

  it("does not let the push itself fail open", () => {
    // A tolerated push would leave the container swapped onto the old schema —
    // the exact "new code, old schema" outage this step exists to prevent.
    expectFailsClosed("Apply database schema");
  });

  it("offers the override only as a manual dispatch input", () => {
    expect(WORKFLOW).toContain("allow_destructive_schema_change:");
    // If the value were read from anything but `inputs` — a repo variable, an
    // env var, a commit message — a merge could set it and the gate would be
    // bypassable without anyone clicking anything.
    const exprs = WORKFLOW.match(/\$\{\{[^}]*\}\}/g) ?? [];
    const overrideExprs = exprs.filter((e) => /allow_destructive_schema_change/i.test(e));
    expect(overrideExprs.length).toBeGreaterThan(0);
    for (const e of overrideExprs) {
      expect(e).toContain("inputs.allow_destructive_schema_change");
    }
  });
});

describe("T4460 — OPS-02 deploy follows CI, on the commit CI tested", () => {
  it("triggers on a completed CI run, not on the push", () => {
    expect(WORKFLOW).toMatch(/on:\s*\n\s*workflow_run:/);
    expect(WORKFLOW).toContain('workflows: ["CI"]');
    expect(WORKFLOW).not.toMatch(/^on:\s*\n\s*push:/m);
  });

  it("deploys only when that CI run passed, or when dispatched by hand", () => {
    expect(WORKFLOW).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(WORKFLOW).toContain("github.event_name == 'workflow_dispatch'");
  });

  it("checks out and tags the commit CI tested, not the branch tip", () => {
    expect(WORKFLOW).toContain("DEPLOY_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}");
    expect(WORKFLOW).toContain("ref: ${{ env.DEPLOY_SHA }}");
  });

  it("does not let CI pass on an empty run", () => {
    // Now that the deploy waits for CI, `passWithNoTests` would turn a typo in
    // the include glob into a green tick that ships every commit unexamined.
    const config = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
    const active = config
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(active).not.toMatch(/passWithNoTests:\s*true/);
  });

  it("leaves no step naming the raw github.sha", () => {
    // Under workflow_run, github.sha is the branch tip when the event fired —
    // not necessarily the commit that was tested. The image tag, the build arg
    // and the smoke test must all agree on DEPLOY_SHA or the smoke test fails
    // against a correctly deployed app.
    const offenders = WORKFLOW.split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((l) => l.line.includes("github.sha"))
      .filter((l) => !l.line.startsWith("#"))
      .filter((l) => !l.line.startsWith("DEPLOY_SHA:"));
    expect(offenders).toEqual([]);
  });
});
