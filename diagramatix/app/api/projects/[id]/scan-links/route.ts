import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import {
  getCurrentOrgId,
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

interface ElementLite {
  id: string;
  type: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
}

interface DiagramShape {
  id: string;
  name: string;
  type: string;
  data: { elements?: ElementLite[]; connectors?: unknown[] } | null;
}

interface ExistingLink {
  parentDiagramId: string;
  parentDiagramName: string;
  parentElementId: string;
  parentElementLabel: string;
  childDiagramId: string;
  childDiagramName: string;
}

interface Candidate {
  parentDiagramId: string;
  parentDiagramName: string;
  parentElementId: string;
  parentElementLabel: string;
  candidateDiagramId: string;
  candidateDiagramName: string;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Levenshtein distance, classic O(n*m) DP. Capped check via early exit
 *  when far over the threshold isn't needed for typical short names. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** GET — return existingLinks + definiteCandidates + probableCandidates. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id, orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Pull all BPMN diagrams in the project. type === "bpmn" is the only
  // value used in production for BPMN; the scan is scoped accordingly.
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId: id, orgId, type: "bpmn" },
    select: { id: true, name: true, type: true, data: true },
    orderBy: { name: "asc" },
  })) as unknown as DiagramShape[];

  // Index: normalized diagram name → list of diagrams with that name.
  // (Same-name diagrams in one project are rare but theoretically possible.)
  const byNormName = new Map<string, DiagramShape[]>();
  for (const d of diagrams) {
    const k = normalize(d.name);
    if (!k) continue;
    const list = byNormName.get(k) ?? [];
    list.push(d);
    byNormName.set(k, list);
  }
  const diagramById = new Map(diagrams.map((d) => [d.id, d] as const));

  const existingLinks: ExistingLink[] = [];
  const definiteCandidates: Candidate[] = [];
  const probableCandidates: Candidate[] = [];

  for (const d of diagrams) {
    const elements = d.data?.elements ?? [];
    for (const e of elements) {
      if (e.type !== "subprocess" && e.type !== "subprocess-expanded") continue;
      // Return-link variants live on child diagrams and aren't candidates
      // themselves — skip them when scanning for parent-side subprocesses.
      if (e.properties?.isReturnLink) continue;

      const label = (e.label ?? "").trim();
      const linkedId = (e.properties?.linkedDiagramId as string | undefined) ?? "";

      if (linkedId) {
        const child = diagramById.get(linkedId);
        if (child) {
          existingLinks.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentElementId: e.id,
            parentElementLabel: label,
            childDiagramId: child.id,
            childDiagramName: child.name,
          });
        }
        continue; // already linked — never a candidate
      }

      if (!label) continue;
      const normLabel = normalize(label);

      // Exact (normalized) match against any diagram name → definite.
      const exact = byNormName.get(normLabel);
      if (exact && exact.length > 0) {
        for (const c of exact) {
          if (c.id === d.id) continue; // never self-link
          definiteCandidates.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentElementId: e.id,
            parentElementLabel: label,
            candidateDiagramId: c.id,
            candidateDiagramName: c.name,
          });
        }
        continue;
      }

      // Probable: Levenshtein ≤ 3 (relative to the shorter name), OR
      // either name contains the other after normalization.
      for (const c of diagrams) {
        if (c.id === d.id) continue;
        const normCand = normalize(c.name);
        if (!normCand) continue;
        if (normCand === normLabel) continue; // already handled above
        const contains =
          normLabel.length >= 4 && normCand.length >= 4 &&
          (normLabel.includes(normCand) || normCand.includes(normLabel));
        const dist = levenshtein(normLabel, normCand);
        const dynThreshold = Math.min(3, Math.max(1, Math.floor(Math.min(normLabel.length, normCand.length) / 4)));
        if (contains || dist <= dynThreshold) {
          probableCandidates.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentElementId: e.id,
            parentElementLabel: label,
            candidateDiagramId: c.id,
            candidateDiagramName: c.name,
          });
        }
      }
    }
  }

  return NextResponse.json({
    existingLinks,
    definiteCandidates,
    probableCandidates,
    diagramCount: diagrams.length,
  });
}

interface AddOp { parentDiagramId: string; parentElementId: string; candidateDiagramId: string }
interface RemoveOp { parentDiagramId: string; parentElementId: string }
interface ApplyBody { adds?: AddOp[]; removes?: RemoveOp[] }

/** POST — apply user-confirmed adds + removes.
 *
 *  add: sets parent.element.properties.linkedDiagramId = candidateDiagramId,
 *       and creates a return-link element on the child near its first
 *       start event (if no return-link to that parent already exists).
 *  remove: clears linkedDiagramId on the parent element, and deletes the
 *          matching return-link on the child diagram IF no other parent
 *          still links to that child. */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id, orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as ApplyBody;
  const adds = Array.isArray(body.adds) ? body.adds : [];
  const removes = Array.isArray(body.removes) ? body.removes : [];

  // Pull every BPMN diagram in the project once; we mutate the in-memory
  // shape and write each modified diagram back via raw pg (Prisma 7 JSON
  // writes go through pgPool per project convention).
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId, orgId, type: "bpmn" },
    select: { id: true, name: true, data: true },
  })) as unknown as Array<{ id: string; name: string; data: { elements?: ElementLite[]; connectors?: unknown[] } | null }>;

  const diagramById = new Map(diagrams.map((d) => [d.id, d] as const));
  const touched = new Set<string>(); // diagram ids whose data we modified

  // Apply REMOVES first so the new state is consistent for add-after-remove.
  for (const op of removes) {
    const parent = diagramById.get(op.parentDiagramId);
    if (!parent || !parent.data) continue;
    const elements = parent.data.elements ?? [];
    const target = elements.find((e) => e.id === op.parentElementId);
    if (!target || !target.properties) continue;
    const previousChildId = (target.properties.linkedDiagramId as string | undefined) ?? "";
    if (!previousChildId) continue;
    delete target.properties.linkedDiagramId;
    touched.add(parent.id);

    // Remove the return-link on the previously-linked child only if no
    // OTHER parent diagram still links to that child.
    const child = diagramById.get(previousChildId);
    if (child && child.data) {
      const stillLinkedElsewhere = diagrams.some((d) => {
        if (d.id === parent.id) return false;
        return (d.data?.elements ?? []).some(
          (e) =>
            (e.type === "subprocess" || e.type === "subprocess-expanded") &&
            !e.properties?.isReturnLink &&
            (e.properties?.linkedDiagramId as string | undefined) === previousChildId,
        );
      });
      if (!stillLinkedElsewhere) {
        const childEls = child.data.elements ?? [];
        const filtered = childEls.filter(
          (e) =>
            !(
              e.type === "subprocess" &&
              e.properties?.isReturnLink === true &&
              (e.properties?.linkedDiagramId as string | undefined) === parent.id
            ),
        );
        if (filtered.length !== childEls.length) {
          child.data.elements = filtered;
          touched.add(child.id);
        }
      }
    }
  }

  // Apply ADDS.
  const newId = () => `el-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  for (const op of adds) {
    const parent = diagramById.get(op.parentDiagramId);
    const child = diagramById.get(op.candidateDiagramId);
    if (!parent || !child || !parent.data) continue;
    if (parent.id === child.id) continue;
    const elements = parent.data.elements ?? [];
    const target = elements.find((e) => e.id === op.parentElementId);
    if (!target) continue;
    target.properties = target.properties ?? {};
    target.properties.linkedDiagramId = child.id;
    touched.add(parent.id);

    // Ensure a return-link exists on the child pointing back to this parent.
    const childData = child.data ?? { elements: [] };
    child.data = childData;
    const childEls = childData.elements ?? [];
    childData.elements = childEls;
    const existingReturn = childEls.find(
      (e) =>
        e.type === "subprocess" &&
        e.properties?.isReturnLink === true &&
        (e.properties?.linkedDiagramId as string | undefined) === parent.id,
    );
    if (!existingReturn) {
      // Position: 80px to the left of the leftmost start-event, vertically
      // aligned to it. Fallback: top-left of the canvas if no start event.
      const W = 170;
      const H = 32;
      const starts = childEls.filter(
        (e) => e.type === "start-event" && !(e.properties && e.properties.boundaryHostId),
      );
      let placeX = 40;
      let placeY = 40;
      if (starts.length > 0) {
        // Leftmost start event.
        starts.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const s = starts[0];
        const sw = s.width ?? 36;
        const sh = s.height ?? 36;
        const sx = s.x ?? 0;
        const sy = s.y ?? 0;
        placeX = Math.max(10, sx - W - 30);
        placeY = sy + sh / 2 - H / 2;
      }
      childEls.push({
        id: newId(),
        type: "subprocess",
        label: `Return to ${parent.name}`,
        x: placeX,
        y: placeY,
        width: W,
        height: H,
        properties: {
          isReturnLink: true,
          linkedDiagramId: parent.id,
        },
      });
      touched.add(child.id);
    }
  }

  // Persist every modified diagram via raw pg (Prisma 7 JSON write rule).
  if (touched.size > 0) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      for (const did of touched) {
        const d = diagramById.get(did);
        if (!d) continue;
        await client.query(
          'UPDATE "Diagram" SET "data" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
          [JSON.stringify(d.data ?? {}), did],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return NextResponse.json({
    added: adds.length,
    removed: removes.length,
    diagramsTouched: touched.size,
  });
}
