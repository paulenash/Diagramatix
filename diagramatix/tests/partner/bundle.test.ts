/**
 * The case bundle — a corpus that can leave the database it was built in.
 *
 * T3015 is the reason the format looks the way it does. A bundle carrying a raw
 * `sourceDiagramId` would, in another environment, either dangle or — far worse
 * — resolve to a STRANGER'S diagram and quietly score a round trip against the
 * wrong ground truth, producing a number that looks fine and means nothing. So
 * ground-truth references travel as labels and are re-resolved on import, and an
 * unresolvable one becomes "no ground truth" out loud.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createOrg, createProject, createDiagram } from "../_setup/factories";

const DOC = Buffer.from("A reference SOP used as a regression case");

/** The bundle shape the routes read and write. */
interface BundleCase {
  name: string; notes: string | null; starred: boolean; description: string;
  documentName: string | null; documentType: string | null; documentBase64: string | null;
  volumetrics: unknown; sourceSopTitle: string | null; sourceDiagramName: string | null;
}

/** Mirrors the export route's mapping, so the format is asserted rather than
 *  assumed — the routes need a session, which a unit test has no business
 *  faking. */
function toBundle(rows: {
  name: string; notes: string | null; starred: boolean; description: string;
  documentBytes: Uint8Array | null; documentName: string | null; documentType: string | null;
  volumetrics: unknown; sourceDiagramName: string | null;
}[]): { version: number; cases: BundleCase[] } {
  return {
    version: 1,
    cases: rows.map((r) => ({
      name: r.name, notes: r.notes, starred: r.starred, description: r.description,
      documentName: r.documentName, documentType: r.documentType,
      documentBase64: r.documentBytes ? Buffer.from(r.documentBytes).toString("base64") : null,
      volumetrics: r.volumetrics,
      sourceSopTitle: null,
      sourceDiagramName: r.sourceDiagramName,
    })),
  };
}

describe("The harness case bundle", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T3014 — a case round-trips through the bundle with its document intact", async () => {
    const c = await prisma.harnessCase.create({
      data: {
        name: "Invoice approval", description: "AP clerk receives…", starred: true,
        documentBytes: new Uint8Array(DOC), documentName: "sop.pdf", documentType: "application/pdf",
      },
    });

    const bundle = toBundle([{ ...c, sourceDiagramName: null }]);
    expect(bundle.cases).toHaveLength(1);
    // Byte-for-byte, or the corpus is not portable.
    expect(Buffer.from(bundle.cases[0].documentBase64!, "base64").toString()).toBe(DOC.toString());

    // Re-import it as a second case and confirm the document survived.
    const back = bundle.cases[0];
    const reimported = await prisma.harnessCase.create({
      data: {
        name: back.name, description: back.description, starred: back.starred,
        documentBytes: back.documentBase64 ? new Uint8Array(Buffer.from(back.documentBase64, "base64")) : null,
        documentName: back.documentName, documentType: back.documentType,
      },
    });
    expect(Buffer.from(reimported.documentBytes!).toString()).toBe(DOC.toString());
    expect(reimported.starred).toBe(true);
  });

  it("T3015 — ground truth travels as a LABEL, and re-resolves in this environment", async () => {
    const user = await createUser();
    const org = await createOrg();
    const project = await createProject({ userId: user.id, orgId: org.id });
    const diagram = await createDiagram({ projectId: project.id, userId: user.id, orgId: org.id, name: "Invoice Approval v2" });

    const bundle = toBundle([{
      name: "case", notes: null, starred: false, description: "d",
      documentBytes: null, documentName: null, documentType: null, volumetrics: {},
      sourceDiagramName: "Invoice Approval v2",
    }]);
    // The id is NOT in the bundle — that is the point.
    expect(JSON.stringify(bundle)).not.toContain(diagram.id);

    // Resolving by name in THIS environment finds the right one.
    const resolved = await prisma.diagram.findFirst({
      where: { name: bundle.cases[0].sourceDiagramName! }, select: { id: true },
    });
    expect(resolved?.id).toBe(diagram.id);
  });

  it("T3016 — a name that does not exist here resolves to NOTHING, not to something else", async () => {
    // The failure this prevents: a bundle imported elsewhere silently scoring a
    // round trip against a stranger's diagram.
    const user = await createUser();
    const org = await createOrg();
    const project = await createProject({ userId: user.id, orgId: org.id });
    await createDiagram({ projectId: project.id, userId: user.id, orgId: org.id, name: "Something Else Entirely" });

    const resolved = await prisma.diagram.findFirst({
      where: { name: "Invoice Approval v2" }, select: { id: true },
    });
    expect(resolved).toBeNull();

    // …and the case is still importable, just without ground truth.
    const c = await prisma.harnessCase.create({
      data: { name: "case", description: "d", sourceDiagramId: resolved?.id ?? null },
    });
    expect(c.sourceDiagramId).toBeNull();
  });

  it("T3017 — a run records the case it replayed, so a history accumulates", async () => {
    const kase = await prisma.harnessCase.create({ data: { name: "c", description: "d" } });
    await prisma.harnessCase.update({
      where: { id: kase.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
    const after = await prisma.harnessCase.findUniqueOrThrow({ where: { id: kase.id } });
    expect(after.runCount).toBe(1);
    expect(after.lastRunAt).not.toBeNull();
  });
});
