/**
 * Voice Assist Help — slice 2: the stored settings, the validation, the tile and its routes.
 * Plan: new features/voice-assist-help-plan-2026-10-01.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// ── mocks for the two routes ────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; email: string } },
    readOnly: false,
    rows: [] as { key: string; value: string }[],
    writes: [] as unknown[],
  };
  return state;
});

vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("@/app/lib/routeGuard", () => ({
  blockReadOnlyImpersonation: async () => (h.readOnly ? new Response(JSON.stringify({ error: "read-only" }), { status: 403 }) : null),
}));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    appSetting: {
      findMany: async () => h.rows,
      upsert: (a: { where: { key: string }; update: { value: string } }) => ({ op: "put", key: a.where.key, value: a.update.value }),
      deleteMany: (a: { where: { key: string } }) => ({ op: "drop", key: a.where.key }),
    },
    $transaction: async (ops: unknown[]) => { h.writes.push(...ops); return ops; },
  },
}));

import { GET as adminGet, PUT as adminPut, DELETE as adminDelete } from "@/app/api/admin/voice-assist-help/route";
import { GET as publicGet } from "@/app/api/voice-assist-help/route";
import {
  parseStoredVoiceAssistHelp, VAH_CONVENTIONS_KEY, VAH_ENABLED_KEY, VAH_PATTERNS_KEY,
  LEGACY_CONVENTIONS_KEY, LEGACY_ENABLED_KEY, LEGACY_PATTERNS_KEY,
} from "@/app/lib/voice/voiceAssistHelpSetting";
import {
  DEFAULT_CONVENTIONS, DEFAULT_PATTERNS, formatNext, resolveAssistHelp, validateConventions, defaultCommandTree,
} from "@/app/lib/assist/commandTree";

const SUPER = { user: { id: "u1", email: "paul@nashcc.com.au" } };
const REGULAR = { user: { id: "u2", email: "someone@example.com" } };
const json = (b: unknown) => new Request("http://x", { method: "PUT", body: JSON.stringify(b) });
const body = async (r: Response) => r.json();

beforeEach(() => { h.session = SUPER; h.readOnly = false; h.rows = []; h.writes = []; });

describe("T5169 — what is stored: off until switched on; a missing row is the shipped default", () => {
  it("nothing stored: off, no overrides", () => {
    expect(parseStoredVoiceAssistHelp([])).toEqual({ enabled: false, repair: true, patterns: null, conventions: null });   // repair is ON unless switched off (slice 5)
  });

  it("reads the switch, the patterns text and the conventions JSON", () => {
    const s = parseStoredVoiceAssistHelp([
      { key: VAH_ENABLED_KEY, value: "true" },
      { key: VAH_PATTERNS_KEY, value: "undo" },
      { key: VAH_CONVENTIONS_KEY, value: JSON.stringify(DEFAULT_CONVENTIONS) },
    ]);
    expect(s.enabled).toBe(true);
    expect(s.patterns).toBe("undo");
    expect(s.conventions).toEqual(DEFAULT_CONVENTIONS);
  });

  it("a conventions row that is unreadable or does not validate is no override at all", () => {
    expect(parseStoredVoiceAssistHelp([{ key: VAH_CONVENTIONS_KEY, value: "{not json" }]).conventions).toBeNull();
    expect(parseStoredVoiceAssistHelp([{ key: VAH_CONVENTIONS_KEY, value: JSON.stringify([{ name: "X" }]) }]).conventions).toBeNull();
  });
});

describe("T5170 — which tree is in force, and a broken edit never takes the help down", () => {
  it("no override: the shipped tree, nothing to explain", () => {
    const c = resolveAssistHelp({});
    expect(c).toMatchObject({ usingPatternsOverride: false, usingConventionsOverride: false, fallback: null, patterns: DEFAULT_PATTERNS });
    expect(c.tree.errors).toEqual([]);
  });

  it("saving the shipped text is not an override", () => {
    expect(resolveAssistHelp({ patterns: DEFAULT_PATTERNS, conventions: DEFAULT_CONVENTIONS }).usingPatternsOverride).toBe(false);
  });

  it("a good edit is used", () => {
    const c = resolveAssistHelp({ patterns: "frobnicate <existing_element_name>\nundo" });
    expect(c.usingPatternsOverride).toBe(true);
    expect(c.tree.firstWords().map((i) => i.text)).toEqual(["frobnicate", "undo"]);
  });

  it("an edit with ANY problem is not used: the shipped tree is, and the reason says why", () => {
    const c = resolveAssistHelp({ patterns: "good line\nbad ( line" });
    expect(c.usingPatternsOverride).toBe(false);
    expect(c.fallback).toMatch(/line 2: missing \)/);
    expect(c.patterns).toBe(DEFAULT_PATTERNS);
    expect(c.tree.errors).toEqual([]);
    expect(c.tree.firstWords().length).toBeGreaterThan(30);
  });

  it("an edit that uses a variable with no convention is not used either", () => {
    expect(resolveAssistHelp({ patterns: "say <nobody>" }).fallback).toMatch(/no convention for <nobody>/);
  });
});

describe("T5171 — validating the conventions table", () => {
  it("accepts the shipped table", () => {
    const v = validateConventions(DEFAULT_CONVENTIONS);
    expect(v.ok).toBe(true);
  });

  it("says what is wrong, convention by convention", () => {
    const bad = (x: unknown) => { const v = validateConventions(x); return v.ok ? [] : v.errors.join("|"); };
    expect(bad("nope")).toMatch(/must be a list/);
    expect(bad([{ name: "Bad Name", kind: "free", means: "x".repeat(30), example: "e" }])).toMatch(/lower case letters/);
    expect(bad([{ name: "ok_name", kind: "weird", means: "x".repeat(30), example: "e" }])).toMatch(/kind must be one of/);
    expect(bad([{ name: "ok_name", kind: "free", means: "", example: "e" }])).toMatch(/say what it means/);
    expect(bad([{ name: "ok_name", kind: "names", means: "x".repeat(30), example: "e" }])).toMatch(/needs a source/);
    expect(bad([{ name: "ok_name", kind: "pattern", pattern: "a (b", means: "x".repeat(30), example: "e" }])).toMatch(/do not parse/);
    expect(bad([{ name: "ok_name", kind: "free", means: "x".repeat(30), example: "e", maxWords: 99 }])).toMatch(/1 to 40/);
    const dup = { name: "ok_name", kind: "free", means: "x".repeat(30), example: "e" };
    expect(bad([dup, dup])).toMatch(/defined twice/);
  });
});

describe("T5172 — how the help writes the next words", () => {
  it("required words first, then [optional] ones; variables in <>; an open variable ends with …", () => {
    const t = defaultCommandTree();
    const after = formatNext(t.next(["rename"]).next);
    expect(after.slice(0, 4)).toEqual(["activities", "as", "connectors", "decisions"]); // A–Z ("as" and "to" now start “rename to <name>”)
    expect(after).toEqual(expect.arrayContaining(["<existing_element_name>", "<existing_label_name>", "<target>"]));
    expect(after.indexOf("[all]")).toBeGreaterThan(after.indexOf("<target>"));
    const open = formatNext(t.next(["rename", "review", "claim"]).next);
    expect(open).toContain("<existing_element_name> …");
    expect(open).toContain("to");
  });
});

describe("T5173 — the admin route: SuperAdmin only, and nothing broken is ever saved", () => {
  it("GET: 401 signed out, 403 for anyone but a SuperAdmin, and the whole picture for one", async () => {
    h.session = null;
    expect((await adminGet()).status).toBe(401);
    h.session = REGULAR;
    expect((await adminGet()).status).toBe(403);
    h.session = SUPER;
    const r = await adminGet();
    expect(r.status).toBe(200);
    const j = await body(r);
    expect(j).toMatchObject({ enabled: false, usingPatternsOverride: false, fallback: null });
    expect(j.patterns).toBe(DEFAULT_PATTERNS);
    expect(j.lists.directions).toEqual(["up", "down", "left", "right"]);
  });

  it("PUT: blocked read-only impersonation, then non-SuperAdmin, both before anything is read", async () => {
    h.readOnly = true;
    expect((await adminPut(json({ enabled: true }))).status).toBe(403);
    h.readOnly = false;
    h.session = REGULAR;
    expect((await adminPut(json({ enabled: true }))).status).toBe(403);
    expect(h.writes).toEqual([]);
  });

  it("PUT: the switch", async () => {
    expect((await adminPut(json({ enabled: true }))).status).toBe(200);
    expect(h.writes).toEqual([{ op: "put", key: VAH_ENABLED_KEY, value: "true" }, { op: "drop", key: LEGACY_ENABLED_KEY }]);
    h.writes = [];
    expect((await adminPut(json({ enabled: "yes" }))).status).toBe(400);
    expect(h.writes).toEqual([]);
  });

  it("PUT: patterns with a problem are refused line by line and nothing is written", async () => {
    const r = await adminPut(json({ patterns: "fine\nbroken ( here" }));
    expect(r.status).toBe(400);
    const j = await body(r);
    expect(j.problems).toEqual([expect.stringContaining("line 2")]);
    expect(h.writes).toEqual([]);
  });

  it("PUT: a good edit is stored; the shipped text stores nothing (it clears the override)", async () => {
    expect((await adminPut(json({ patterns: "undo\nagain" }))).status).toBe(200);
    expect(h.writes).toEqual([{ op: "put", key: VAH_PATTERNS_KEY, value: "undo\nagain" }, { op: "drop", key: LEGACY_PATTERNS_KEY }]);
    h.writes = [];
    expect((await adminPut(json({ patterns: DEFAULT_PATTERNS }))).status).toBe(200);
    expect(h.writes).toEqual([{ op: "drop", key: VAH_PATTERNS_KEY }, { op: "drop", key: LEGACY_PATTERNS_KEY }]);
  });

  it("PUT: conventions are validated, and the patterns must still compile with them", async () => {
    expect((await adminPut(json({ conventions: [{ name: "x" }] }))).status).toBe(400);
    // Removing <target> would break the shipped patterns, so it is refused.
    const without = DEFAULT_CONVENTIONS.filter((c) => c.name !== "target");
    const r = await adminPut(json({ conventions: without }));
    expect(r.status).toBe(400);
    expect((await body(r)).problems.join(" ")).toMatch(/no convention for <target>/);
    expect(h.writes).toEqual([]);
  });

  it("PUT: patterns checked against the conventions already stored, not only the shipped ones", async () => {
    h.rows = [{ key: VAH_CONVENTIONS_KEY, value: JSON.stringify([...DEFAULT_CONVENTIONS, { name: "team", kind: "free", means: "A team name, as said.", example: "Finance" }]) }];
    expect((await adminPut(json({ patterns: "assign <selection> to <team>" }))).status).toBe(200);
  });

  it("DELETE: resets patterns, conventions or both; anything else is refused", async () => {
    const del = (q: string) => adminDelete(new Request(`http://x?reset=${q}`, { method: "DELETE" }));
    expect((await del("patterns")).status).toBe(200);
    expect(h.writes).toEqual([{ op: "drop", key: VAH_PATTERNS_KEY }, { op: "drop", key: LEGACY_PATTERNS_KEY }]);
    h.writes = [];
    expect((await del("all")).status).toBe(200);
    expect(h.writes).toEqual([
      { op: "drop", key: VAH_PATTERNS_KEY }, { op: "drop", key: LEGACY_PATTERNS_KEY },
      { op: "drop", key: VAH_CONVENTIONS_KEY }, { op: "drop", key: LEGACY_CONVENTIONS_KEY },
    ]);
    expect((await del("everything")).status).toBe(400);
    h.session = REGULAR;
    expect((await del("all")).status).toBe(403);
  });

  it("a saved edit that does not compile is reported by GET, and the shipped tree is what is in force", async () => {
    h.rows = [{ key: VAH_PATTERNS_KEY, value: "broken ( x" }];
    const j = await body(await adminGet());
    expect(j.usingPatternsOverride).toBe(false);
    expect(j.fallback).toMatch(/missing \)/);
    expect(j.patterns).toBe(DEFAULT_PATTERNS);
  });
});

describe("T5174 — what the editor reads: any signed-in user, nothing while it is off", () => {
  it("401 signed out", async () => {
    h.session = null;
    expect((await publicGet()).status).toBe(401);
  });

  it("panel off AND repair off: just {enabled:false, repair:false} — no command text leaves the server", async () => {
    h.session = REGULAR;
    h.rows = [{ key: "voiceAssistHelp.repair", value: "false" }];
    expect(await body(await publicGet())).toEqual({ enabled: false, repair: false });
  });

  it("panel off, repair on (the default): the patterns are sent for the repair only", async () => {
    h.session = REGULAR;
    const j = await body(await publicGet());
    expect(j.enabled).toBe(false);
    expect(j.repair).toBe(true);
    expect(typeof j.patterns).toBe("string");
  });

  it("on: the patterns and conventions in force", async () => {
    h.session = REGULAR;
    h.rows = [{ key: VAH_ENABLED_KEY, value: "true" }];
    const j = await body(await publicGet());
    expect(j.enabled).toBe(true);
    expect(j.patterns).toBe(DEFAULT_PATTERNS);
    expect(j.conventions.map((c: { name: string }) => c.name)).toContain("existing_label_name");
  });
});

describe("T5175 — the tile is on the admin grid and the page is SuperAdmin-only", () => {
  const read = (...p: string[]) => readFileSync(p.join("/"), "utf8").replace(/\r\n/g, "\n");
  it("a plain link to its own page", () => {
    expect(read("app/(dashboard)/dashboard/admin/AdminClient.tsx")).toMatch(/id: "voice-assist-help",[^\n]*href: "\/dashboard\/admin\/voice-assist-help"/);
  });
  it("the page checks isActingSuperuser", () => {
    expect(read("app/(dashboard)/dashboard/admin/voice-assist-help/page.tsx")).toContain("isActingSuperuser(session)");
  });
  it("it is not the canvas Bubble Help: separate settings keys, no shared table", () => {
    const setting = read("app/lib/voice/voiceAssistHelpSetting.ts");
    expect(setting).toContain('"voiceAssistHelp.enabled"');
    expect(setting).not.toMatch(/assistHelp\.enabled"|prisma\.assistHelp/);
  });
  it("the tile client compiles the DRAFT in the browser and uses the real parser to compare", () => {
    const c = read("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx");
    expect(c).toContain("compileTree(patterns, convInForce, data.lists)");
    expect(c).toContain("parseCommand(heard.trim())");   // the REPAIRED words, as the real session parses them
    expect(c).not.toMatch(/window\.(confirm|alert|prompt)/);
  });
});

describe("T5200 — renamed from its first name: a setting saved under the OLD keys is still in force", () => {
  it("the old switch and old edits are read when there is no new row — nothing silently turns off", () => {
    const s = parseStoredVoiceAssistHelp([
      { key: LEGACY_ENABLED_KEY, value: "true" },
      { key: LEGACY_PATTERNS_KEY, value: "undo" },
      { key: LEGACY_CONVENTIONS_KEY, value: JSON.stringify(DEFAULT_CONVENTIONS) },
    ]);
    expect(s).toEqual({ enabled: true, repair: true, patterns: "undo", conventions: DEFAULT_CONVENTIONS });
  });

  it("a NEW row wins over the old one, field by field", () => {
    const s = parseStoredVoiceAssistHelp([
      { key: LEGACY_ENABLED_KEY, value: "true" },
      { key: VAH_ENABLED_KEY, value: "false" },
      { key: LEGACY_PATTERNS_KEY, value: "old patterns" },
    ]);
    expect(s.enabled).toBe(false);
    expect(s.patterns).toBe("old patterns");    // no new patterns row, so the old one still stands
  });

  it("the editor route reports it ON when only the old switch is set", async () => {
    h.session = REGULAR;
    h.rows = [{ key: LEGACY_ENABLED_KEY, value: "true" }];
    expect((await body(await publicGet())).enabled).toBe(true);
  });

  it("the old names are not used anywhere else: routes, files, components and the tile are all “voice-assist-help”", () => {
    const read = (...p: string[]) => readFileSync(p.join("/"), "utf8");
    expect(read("app/(dashboard)/dashboard/admin/AdminClient.tsx")).toContain('id: "voice-assist-help"');
    expect(read("app/hooks/useVoiceAssistHelp.ts")).toContain('"/api/voice-assist-help"');
    expect(read("app/hooks/useVoiceAssistHelp.ts")).toContain('"diagramatix.voiceAssistHelp"');
  });
});
