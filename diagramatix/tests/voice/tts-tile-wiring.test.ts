/**
 * T4776 — the Text to Speech page and the routes behind it.
 *
 * Paul, 2026-09-25: "Text to Speech links to the Test Voice Assist tile". Slice 1
 * shipped a tile that only redirected to another page — and to the wrong tab of
 * it. The plan asked for a page of its own: master switch, who can hear it,
 * usage, and the side-by-side comparison. Read as code (comments stripped).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const speak = code(read("app", "api", "ai", "speak", "route.ts"));
const admin = code(read("app", "api", "admin", "text-to-speech", "route.ts"));
const grant = code(read("app", "api", "admin", "text-to-speech", "users", "[id]", "route.ts"));
const page = code(read("app", "(dashboard)", "dashboard", "admin", "text-to-speech", "TextToSpeechClient.tsx"));
const tiles = read("app", "(dashboard)", "dashboard", "admin", "AdminClient.tsx");

describe("T4776 — the tile opens its own page", () => {
  it("is a plain link to /dashboard/admin/text-to-speech, with no special case in the grid", () => {
    expect(tiles).toMatch(/id: "text-to-speech",[^\n]*href: "\/dashboard\/admin\/text-to-speech"/);
    expect(tiles).not.toMatch(/TextToSpeechTile|\btts\b/);
  });

  it("voice testing lives in ONE place — the Test voice tab and its panel are gone", () => {
    expect(read("app", "(dashboard)", "dashboard", "admin", "voice-assist-test", "VoiceAssistTestClient.tsx")).not.toContain("test-voice");
    expect(existsSync(join(root, "app", "(dashboard)", "dashboard", "admin", "voice-assist-test", "TestVoicePanel.tsx"))).toBe(false);
  });

  it("the page is SuperAdmin-only", () => {
    expect(read("app", "(dashboard)", "dashboard", "admin", "text-to-speech", "page.tsx")).toContain("isActingSuperuser(session)");
  });
});

describe("T4776 — the master switch", () => {
  const post = speak.slice(speak.indexOf("export async function POST"));

  it("off means 503 for everyone — checked before the grant, so SuperAdmins are stopped too", () => {
    const at = post.indexOf("readTtsSettings()).enabled");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(post.indexOf("speechGranted(session)"));
    expect(post).toMatch(/SWITCHED_OFF \}, \{ status: 503 \}/);
  });

  it("and a surface asking first is told no, so it draws no speech control", () => {
    const get = speak.slice(speak.indexOf("export async function GET"), speak.indexOf("export async function POST"));
    expect(get).toContain("settings.enabled &&");
    expect(get).toContain("defaultVoice: settings.defaultVoice");
  });
});

describe("T4776 — uses are told apart, and testing never hides in the real figures", () => {
  it("each purpose is recorded under its own point", () => {
    expect(speak).toMatch(/narration: AI_INVOCATION_POINTS\.VoiceNarration/);
    expect(speak).toMatch(/compare: AI_INVOCATION_POINTS\.VoiceCompare/);
    expect(speak).toContain("resolveAiRouteContext(session, POINT_FOR[purpose])");
  });

  it("a comparison play is refused to anyone but a SuperAdmin", () => {
    expect(speak).toMatch(/body\.purpose === "compare" && !isSuperuser\(session\)/);
  });

  it("the comparison goes straight to the route — a cached reply would report no delay at all", () => {
    expect(page).toContain('purpose: "compare"');
    expect(page).not.toMatch(/speaker\.speak/);
  });

  it("and plays each line exactly as the product would say it", () => {
    expect(page).toContain("speechTransform(raw)");
  });
});

describe("T4776 — the admin routes", () => {
  it("are SuperAdmin-only, and every write refuses a read-only impersonation first", () => {
    for (const src of [admin, grant]) {
      expect(src).toContain("isSuperuser(session)");
      const put = src.slice(src.indexOf("export async function PUT"));
      expect(put.indexOf("blockReadOnlyImpersonation(session)")).toBeGreaterThan(-1);
      expect(put.indexOf("blockReadOnlyImpersonation(session)")).toBeLessThan(put.indexOf("req.json()"));
    }
  });

  it("a grant changes ONE key, atomically — never the whole override map", () => {
    expect(grant).toMatch(/\|\| jsonb_build_object\(\$2::text, 'available'\)/);
    expect(grant).toMatch(/- \$2::text WHERE id = \$1/);
    expect(grant).not.toMatch(/"featureOverrides" = \$1::jsonb/);
  });

  it("a search term is matched literally — % and _ mean themselves", () => {
    expect(admin).toContain("ILIKE $1");
    expect(admin).toMatch(/replace\(\/\[\\\\%_\]\/g/);
  });
});
