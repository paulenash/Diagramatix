import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { extractCode, stripCodeTail, normalize } from "@/app/lib/numbering/codes";
import { LINK_BEARING_ELEMENT_TYPES } from "@/app/lib/diagram/linkClosure";

type Params = { params: Promise<{ id: string }> };

// Diagram types the link scan spans: the high-level group (Value Chain, Process
// Context, ArchiMate) plus BPMN — so links WITHIN the high-level group and DOWN
// to BPMN are both detected (item 2).
const LINKABLE_DIAGRAM_TYPES = ["bpmn", "value-chain", "process-context", "archimate"];

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
  data: {
    elements?: ElementLite[];
    connectors?: unknown[];
    /** Legacy single-parent field — superseded by parentDiagramIds. The
     *  scan sweep deletes it whenever it finds the field set. */
    parentDiagramId?: string;
    parentDiagramIds?: string[];
  } | null;
}

interface ExistingLink {
  parentDiagramId: string;
  parentDiagramName: string;
  parentDiagramType: string;
  parentElementId: string;
  parentElementLabel: string;
  childDiagramId: string;
  childDiagramName: string;
  childDiagramType: string;
}

interface Candidate {
  parentDiagramId: string;
  parentDiagramName: string;
  parentDiagramType: string;
  parentElementId: string;
  parentElementLabel: string;
  candidateDiagramId: string;
  candidateDiagramName: string;
  candidateDiagramType: string;
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

  const { id } = await params;
  let orgId: string;
  try {
    // Edit-or-owner — scan-link is a project-wide diagnostic that the user
    // typically follows up with edits, so the floor matches the POST below.
    const access = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = access.projectOrgId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // Pull the high-level group (Value Chain, Process Context, ArchiMate) + BPMN
  // diagrams, so we can link within the high-level group and down to BPMN.
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId: id, orgId, type: { in: LINKABLE_DIAGRAM_TYPES } },
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
  // Precomputed code + post-code tail per diagram name — used by the two
  // probable-match rules: same code, or same descriptive text after the code.
  const codeByDiagramId = new Map(diagrams.map((d) => [d.id, extractCode(d.name)] as const));
  const tailByDiagramId = new Map(diagrams.map((d) => [d.id, stripCodeTail(d.name)] as const));

  const existingLinks: ExistingLink[] = [];
  const definiteCandidates: Candidate[] = [];
  const probableCandidates: Candidate[] = [];

  for (const d of diagrams) {
    const elements = d.data?.elements ?? [];
    for (const e of elements) {
      // Any drill-down element across the high-level group + BPMN: BPMN
      // subprocess/-expanded, Value Chain chevron-collapsed, Process Context
      // use-case, ArchiMate archimate-shape (item 2).
      if (!LINK_BEARING_ELEMENT_TYPES.has(e.type)) continue;
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
            parentDiagramType: d.type,
            parentElementId: e.id,
            parentElementLabel: label,
            childDiagramId: child.id,
            childDiagramName: child.name,
            childDiagramType: child.type,
          });
        }
        continue; // already linked — never a candidate
      }

      if (!label) continue;
      const normLabel = normalize(label);
      const labelCode = extractCode(label);
      const labelTail = stripCodeTail(label);

      // Exact (normalized) match against any diagram name → definite.
      const exact = byNormName.get(normLabel);
      if (exact && exact.length > 0) {
        for (const c of exact) {
          if (c.id === d.id) continue; // never self-link
          definiteCandidates.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentDiagramType: d.type,
            parentElementId: e.id,
            parentElementLabel: label,
            candidateDiagramId: c.id,
            candidateDiagramName: c.name,
            candidateDiagramType: c.type,
          });
        }
        continue;
      }

      // Bare-code PREFIX match (item 2b): a label that is a single code token
      // (e.g. "V01.07.1", no spaces) links to the diagram whose NAME STARTS
      // WITH that code — "V01.07.1 Commence …". The " "/end word boundary keeps
      // "V01.07.1" from matching "V01.07.10".
      if (!/\s/.test(label)) {
        const l = label.trim().toLowerCase();
        let matched = false;
        for (const c of diagrams) {
          if (c.id === d.id) continue;
          const n = c.name.trim().toLowerCase();
          if (n === l || n.startsWith(l + " ")) {
            definiteCandidates.push({
              parentDiagramId: d.id,
              parentDiagramName: d.name,
              parentDiagramType: d.type,
              parentElementId: e.id,
              parentElementLabel: label,
              candidateDiagramId: c.id,
              candidateDiagramName: c.name,
              candidateDiagramType: c.type,
            });
            matched = true;
          }
        }
        if (matched) continue;
      }

      // Probable match. Strongest signals first:
      //   • codesMatch — both names carry the same leading process code
      //     (e.g. both start "P03.1.1"). Strong identity in coded projects.
      //   • tailsMatch — descriptive text after the code matches in both
      //     names (4-char floor — single-letter tails like "x" generate
      //     noise across hundreds of candidate diagrams).
      // Loose fallbacks — only allowed when codes don't actively disagree:
      //   • contains — one normalized name contained in the other.
      //   • Levenshtein ≤ dynThreshold relative to the shorter name.
      // When BOTH names carry codes AND the codes DIFFER, the loose
      // fallbacks are suppressed: in a project where everything is
      // "P03.X.Y Foo", contains/Levenshtein over-fire on the shared
      // template structure and bury the real matches.
      for (const c of diagrams) {
        if (c.id === d.id) continue;
        const normCand = normalize(c.name);
        if (!normCand) continue;
        if (normCand === normLabel) continue; // already handled above

        const candCode = codeByDiagramId.get(c.id) ?? null;
        const candTail = tailByDiagramId.get(c.id) ?? "";
        const codesMatch = !!labelCode && labelCode === candCode;
        const tailsMatch =
          !!labelTail && labelTail.length >= 4 && labelTail === candTail;

        const codesPresentAndDiffer =
          !!labelCode && !!candCode && labelCode !== candCode;
        const allowLoose = !codesPresentAndDiffer;
        let loose = false;
        if (allowLoose) {
          const contains =
            normLabel.length >= 4 && normCand.length >= 4 &&
            (normLabel.includes(normCand) || normCand.includes(normLabel));
          const dist = levenshtein(normLabel, normCand);
          const dynThreshold = Math.min(
            3,
            Math.max(1, Math.floor(Math.min(normLabel.length, normCand.length) / 4)),
          );
          loose = contains || dist <= dynThreshold;
        }

        if (codesMatch || tailsMatch || loose) {
          probableCandidates.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentDiagramType: d.type,
            parentElementId: e.id,
            parentElementLabel: label,
            candidateDiagramId: c.id,
            candidateDiagramName: c.name,
            candidateDiagramType: c.type,
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

  const { id: projectId } = await params;
  let orgId: string;
  try {
    const access = await requireProjectAccess(session, await cookies(), projectId, "edit");
    orgId = access.projectOrgId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as ApplyBody;
  const adds = Array.isArray(body.adds) ? body.adds : [];
  const removes = Array.isArray(body.removes) ? body.removes : [];

  // Pull every BPMN diagram in the project once; we mutate the in-memory
  // shape and write each modified diagram back via raw pg (Prisma 7 JSON
  // writes go through pgPool per project convention).
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId, orgId, type: { in: LINKABLE_DIAGRAM_TYPES } },
    select: { id: true, name: true, data: true },
  })) as unknown as Array<{
    id: string;
    name: string;
    data: {
      elements?: ElementLite[];
      connectors?: unknown[];
      parentDiagramId?: string;
      parentDiagramIds?: string[];
    } | null;
  }>;

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

    // (Stale return-link symbols and parentDiagramIds are reconciled by
    // the project-wide sweep at the end of this handler.)
  }

  // Apply ADDS — only the parent-side `linkedDiagramId` is set here.
  // Back-link metadata on the child (parentDiagramIds list) is recomputed
  // from scratch during the project-wide normalize pass below, so we don't
  // duplicate that logic per-add.
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
  }

  // Project-wide normalize pass — runs after every scan POST regardless of
  // whether the user added or removed anything. Does three things:
  //
  //   (a) Drops every on-canvas return-link symbol. Older versions of
  //       this feature created pill-shaped subprocesses with
  //       isReturnLink=true on child diagrams; they are no longer wanted.
  //   (b) Drops the legacy `parentDiagramId` (singular) field. It is
  //       superseded by `parentDiagramIds`.
  //   (c) Recomputes `parentDiagramIds` for every diagram from the
  //       canonical source of truth (other diagrams' subprocess
  //       linkedDiagramId fields). This catches manual edits, race
  //       conditions, and any drift accumulated by older code paths.
  for (const d of diagrams) {
    if (!d.data) continue;

    // (a) Strip return-link symbols.
    const els = d.data.elements ?? [];
    const cleaned = els.filter(
      (e) => !(e.type === "subprocess" && e.properties?.isReturnLink === true),
    );
    if (cleaned.length !== els.length) {
      d.data.elements = cleaned;
      touched.add(d.id);
    }

    // (b) Drop legacy singular field if present.
    if (d.data.parentDiagramId !== undefined) {
      delete d.data.parentDiagramId;
      touched.add(d.id);
    }

    // (c) Recompute parentDiagramIds. A "parent" is any other diagram
    //     containing a non-return-link element whose linkedDiagramId equals
    //     d.id — across EVERY drill-linkable type (subprocess, submachine,
    //     chevron, use-case, ArchiMate shape, and a collapsed uml-package).
    const LINK_TYPES = new Set([
      "subprocess", "subprocess-expanded", "submachine",
      "chevron-collapsed", "use-case", "archimate-shape", "uml-package",
    ]);
    const parents: string[] = [];
    for (const other of diagrams) {
      if (other.id === d.id) continue;
      const otherEls = other.data?.elements ?? [];
      const links = otherEls.some(
        (e) =>
          LINK_TYPES.has(e.type) &&
          !e.properties?.isReturnLink &&
          (e.properties?.linkedDiagramId as string | undefined) === d.id,
      );
      if (links) parents.push(other.id);
    }
    // Stable order by diagram name for the UI.
    const nameById = new Map(diagrams.map((x) => [x.id, x.name] as const));
    parents.sort((a, b) => (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? ""));
    const existing = d.data.parentDiagramIds ?? [];
    const same = existing.length === parents.length && existing.every((v, i) => v === parents[i]);
    if (!same) {
      if (parents.length === 0) delete d.data.parentDiagramIds;
      else d.data.parentDiagramIds = parents;
      touched.add(d.id);
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
