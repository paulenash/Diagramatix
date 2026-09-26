/**
 * T4723, T4894 — keeping an annotated Voice Assist session.
 *
 * Phase 2 of the debug plan: sessions survive the browser, and the SuperAdmin
 * list leads with the pair that matters — a command the system reported as
 * successful and the person watching marked wrong.
 *
 * The models are deliberately plain: `entries` and `tally` are `@db.Text`
 * documents rather than `Json`, written whole and read whole, so there is **no
 * pgPool write path anywhere in this subsystem** — one fewer Prisma 7 rule to
 * get wrong in new code. The numbers anyone would query are scalars beside them.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import {
  buildDebugSessionFile, sessionCounts, DEBUG_SESSION_FORMAT,
} from "@/app/lib/assist/debugSessionFile";
import type { CommandLogEntry } from "@/app/lib/assist/commandLog";
import { captureState, newCaptureLedger } from "@/app/lib/assist/debugCapture";

const read = (p: string) => readFileSync(p, "utf8");
const LIST_ROUTE = "app/api/admin/voice-debug/sessions/route.ts";
const ONE_ROUTE = "app/api/admin/voice-debug/sessions/[id]/route.ts";
const SHOT_ROUTE = "app/api/admin/voice-debug/snapshots/[id]/route.ts";

const entries: CommandLogEntry[] = [
  { id: "1", heard: "add a task called Approve", summary: "added Approve", ok: true, at: 1, verdict: "worked" },
  { id: "2", heard: "put it in the second lane", summary: "moved Approve", ok: true, at: 2, verdict: "wrong", note: "went into lane 3" },
  { id: "3", heard: "delete the gateway", summary: "couldn't find a gateway", ok: false, at: 3 },
];

/** What the POST route does with an accepted body, without going through HTTP. */
async function saveLikeTheRoute(png?: string, diagramJson: unknown = { elements: [{ id: "a" }], connectors: [] }) {
  const file = buildDebugSessionFile({
    title: "Voice Assist — Order to Cash",
    diagramId: "d1", diagramName: "Order to Cash",
    entries,
    snapshots: [{
      id: "s1", entryId: "2", takenAt: 1_700_000_000_000,
      ...(png ? { png, width: 800, height: 600 } : {}),
      diagramJson,
      elementCount: 1, connectorCount: 0,
    }],
    savedAt: 1_700_000_001_000, appVersion: "2.12",
  });
  const counts = sessionCounts(file.entries);
  const created = await prisma.voiceDebugSession.create({
    data: {
      title: file.title,
      diagramId: file.diagram.id, diagramName: file.diagram.name,
      ...counts,
      appVersion: file.appVersion ?? null,
      entries: JSON.stringify(file.entries),
      tally: JSON.stringify(counts),
    },
    select: { id: true },
  });
  for (const s of file.snapshots) {
    const b64 = typeof s.png === "string" ? s.png.split(",")[1] : undefined;
    await prisma.voiceDebugSnapshot.create({
      data: {
        sessionId: created.id, entryId: s.entryId, takenAt: new Date(s.takenAt),
        pngBytes: b64 ? Buffer.from(b64, "base64") : null,
        pngWidth: s.width ?? null, pngHeight: s.height ?? null,
        diagramJson: JSON.stringify(s.diagramJson),
        elementCount: s.elementCount, connectorCount: s.connectorCount,
      },
    });
  }
  return created.id;
}

describe("T4723 — a saved session keeps what makes it evidence", () => {
  beforeEach(async () => { await truncateAll(); });

  it("stores the commands, the comments and the verdicts, and counts the disputes", async () => {
    const id = await saveLikeTheRoute("data:image/png;base64,iVBORw0KGgo=");
    const row = await prisma.voiceDebugSession.findUniqueOrThrow({ where: { id } });
    expect(row.entryCount).toBe(3);
    expect(row.failureCount, "the one the system admitted").toBe(1);
    expect(row.disputeCount, "the one it did not — ok:true, verdict wrong").toBe(1);
    const back = JSON.parse(row.entries) as CommandLogEntry[];
    expect(back[1].note).toBe("went into lane 3");
    expect(back[1].verdict).toBe("wrong");
  });

  it("keeps the picture as bytes and the diagram as a document", async () => {
    const id = await saveLikeTheRoute("data:image/png;base64,iVBORw0KGgo=");
    const shot = await prisma.voiceDebugSnapshot.findFirstOrThrow({ where: { sessionId: id } });
    expect(Buffer.isBuffer(shot.pngBytes) || shot.pngBytes instanceof Uint8Array).toBe(true);
    expect(Buffer.from(shot.pngBytes as Buffer).length).toBeGreaterThan(0);
    expect(JSON.parse(shot.diagramJson).elements).toHaveLength(1);
    expect(shot.entryId, "linked to the command it was taken for").toBe("2");
  });

  it("a snapshot whose picture failed is still a snapshot", async () => {
    // Evidence with no picture beats no evidence: the diagram JSON is the half
    // that lets the situation be replayed, and it is never the half that fails.
    const id = await saveLikeTheRoute(undefined);
    const shot = await prisma.voiceDebugSnapshot.findFirstOrThrow({ where: { sessionId: id } });
    expect(shot.pngBytes).toBeNull();
    expect(JSON.parse(shot.diagramJson).elements, "the replayable half survived").toHaveLength(1);
  });

  it("T4894 — a JSON snapshot's _voiceDebug survives the save, with no picture and no schema change", async () => {
    // Paul, 2026-09-26: snapshots are the diagram as JSON. What was on screen
    // rides INSIDE diagramJson, because the route keeps a fixed list of
    // snapshot fields and would silently drop a new one.
    const r = captureState(newCaptureLedger(), { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, fontSize: 13 }, {
      role: "after", diagramType: "bpmn", colorConfig: {}, displayMode: "normal",
      ui: { selectedIds: ["a"], selectedConnectorId: null, pointer: { x: 1, y: 2 }, voiceLastId: "a", badges: null, flow: null },
    });
    if (!("diagramJson" in r)) throw new Error("not saved");
    const id = await saveLikeTheRoute(undefined, r.diagramJson);
    const shot = await prisma.voiceDebugSnapshot.findFirstOrThrow({ where: { sessionId: id } });
    const back = JSON.parse(shot.diagramJson);
    expect(back._voiceDebug).toEqual(r.diagramJson._voiceDebug);
    expect(back.fontSize, "the whole DiagramData, not just elements and connectors").toBe(13);
    expect(shot.pngBytes, "no picture").toBeNull();
    expect(shot.pngWidth, "so the GET says hasPicture: false").toBeNull();
    // The mirror above is honest only while the route stores the document whole.
    expect(read(LIST_ROUTE)).toContain("diagramJson: JSON.stringify(s.diagramJson ?? {}),");
    expect(read(ONE_ROUTE)).toContain("hasPicture: s.pngWidth != null,");
  });

  it("deleting a session takes its snapshots with it", async () => {
    const id = await saveLikeTheRoute("data:image/png;base64,iVBORw0KGgo=");
    await prisma.voiceDebugSession.delete({ where: { id } });
    expect(await prisma.voiceDebugSnapshot.count({ where: { sessionId: id } }), "onDelete: Cascade").toBe(0);
  });

  it("the diagram is referenced by id, NOT by relation", async () => {
    // Deleting the diagram must not delete the evidence about it — the most
    // useful session is often about a diagram somebody threw away afterwards.
    const schema = read("prisma/schema.prisma");
    const model = schema.slice(schema.indexOf("model VoiceDebugSession"), schema.indexOf("model VoiceDebugSnapshot"));
    expect(model).toMatch(/diagramId\s+String\?/);
    expect(model, "no relation to Diagram").not.toMatch(/diagram\s+Diagram\s/);
    expect(model, "and the disputes are indexed, because that is what the list sorts on")
      .toMatch(/@@index\(\[disputeCount, createdAt\]\)/);
  });

  it("no JSON column, so no pgPool write path in this subsystem", async () => {
    const schema = read("prisma/schema.prisma");
    const models = schema.slice(schema.indexOf("model VoiceDebugSession"));
    expect(models, "documents are @db.Text on purpose").not.toMatch(/^\s+\w+\s+Json/m);
    for (const f of [LIST_ROUTE, ONE_ROUTE, SHOT_ROUTE]) {
      expect(read(f), `${f} must not need raw SQL`).not.toContain("pgPool");
    }
  });
});

describe("T4723b — the routes are locked, and the listing stays small", () => {
  it("every route refuses a non-superuser, and the mutating ones refuse read-only impersonation", () => {
    for (const f of [LIST_ROUTE, ONE_ROUTE, SHOT_ROUTE]) {
      const src = read(f);
      expect(src, `${f} checks the real identity`).toContain("isSuperuser(session)");
      expect(src).toContain('{ status: 403 }');
    }
    // The two that write. Copying api-harness would have failed the ratchet —
    // all six of those routes are frozen debt on KNOWN_UNGUARDED, not a pattern.
    expect(read(LIST_ROUTE), "POST").toContain("blockReadOnlyImpersonation(session)");
    expect(read(ONE_ROUTE), "DELETE").toContain("blockReadOnlyImpersonation(session)");
    const ratchet = read("tests/config/mutating-route-guard.test.ts");
    expect(ratchet, "and they are not on the frozen list").not.toContain("voice-debug");
  });

  it("the listing carries no documents and no bytes", () => {
    // Twenty sessions of a hundred commands each, with their snapshots, is
    // megabytes of payload on every page load.
    const src = read(LIST_ROUTE);
    const select = src.slice(src.indexOf("const LIST_SELECT"), src.indexOf("export async function GET"));
    for (const heavy of ["entries", "tally", "pngBytes", "diagramJson"]) {
      expect(select, `LIST_SELECT must not include ${heavy}`).not.toContain(`${heavy}: true`);
    }
    expect(select, "but the counts it sorts on, yes").toContain("disputeCount: true");
  });

  it("the detail route sends snapshot metadata and a URL, not the bytes", () => {
    const src = read(ONE_ROUTE);
    expect(src).toContain("`/api/admin/voice-debug/snapshots/${s.id}`");
    expect(src, "the include never selects the bytes").not.toMatch(/pngBytes:\s*true/);
  });

  it("the picture is served with the same hardening as help images", () => {
    const src = read(SHOT_ROUTE);
    expect(src).toContain('"Content-Type": "image/png"');
    expect(src).toContain('"X-Content-Type-Options": "nosniff"');
    expect(src).toContain("sandbox");
    expect(src, "evidence about one moment must not be served from a stale cache")
      .toContain('"Cache-Control": "private, no-store"');
  });

  it("the tile exists and points at the page", () => {
    const admin = read("app/(dashboard)/dashboard/admin/AdminClient.tsx");
    expect(admin).toContain('id: "voice-debug"');
    expect(admin).toContain('href: "/dashboard/admin/voice-debug"');
    const page = read("app/(dashboard)/dashboard/admin/voice-debug/page.tsx");
    expect(page, "the page re-guards itself independently of the tile").toContain("isActingSuperuser(session)");
  });
});

describe("T4722c — the POST accepts exactly what the Download writes", () => {
  it("a built session file satisfies the route's own acceptance check", () => {
    // Save-to-disk and save-to-database take the same payload, so a downloaded
    // file can be posted back and the two shapes cannot drift apart.
    const file = buildDebugSessionFile({ title: "t", entries, savedAt: 1 });
    expect(file.format).toBe(DEBUG_SESSION_FORMAT);
    expect(Array.isArray(file.entries)).toBe(true);

    const src = read(LIST_ROUTE);
    expect(src, "the route validates on the format tag and the entries array")
      .toContain("body.format !== DEBUG_SESSION_FORMAT || !Array.isArray(body.entries)");
    expect(src, "and reads the diagram from the same nested shape the file writes")
      .toContain("body.diagram?.id");
  });

  it("the editor builds ONE session and sends it to both destinations", () => {
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("const buildDebugSession = useCallback");
    // Both callers go through it — not two builders that can drift.
    expect(editor).toContain("JSON.stringify(buildDebugSession(Date.now()))");
    expect(editor).toContain("serialiseDebugSession(buildDebugSession(savedAt))");
  });
});
