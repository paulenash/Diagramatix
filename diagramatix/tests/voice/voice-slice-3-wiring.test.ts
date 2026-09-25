/**
 * T4773 — the wiring, which no pure test can see.
 *
 * The suite is node-only, so the route and the overlay are read as source. Each
 * assertion names a decision that would be easy to undo by accident.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
/** Code only — a comment explaining why `gateFeature` is NOT used must not trip the guard. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = code(read("app", "api", "ai", "speak", "route.ts"));
const access = code(read("app", "lib", "voice", "speechAccess.ts"));
const overlay = read("app", "components", "canvas", "AnimateOverlay.tsx");

describe("T4773 — the speak route", () => {
  const post = route.slice(route.indexOf("export async function POST"));

  it("refuses a read-only impersonation BEFORE reading the body", () => {
    expect(post.indexOf("blockReadOnlyImpersonation(session)")).toBeGreaterThan(-1);
    expect(post.indexOf("blockReadOnlyImpersonation(session)")).toBeLessThan(post.indexOf("req.json()"));
  });

  it("gates on speechGranted — never the fail-open feature gate", () => {
    expect(post).toContain("speechGranted(session)");
    expect(route).not.toMatch(/gateFeature|isFeatureAvailable|getFeatureStates/);
    expect(access, "speechAccess must not route through the fail-open matrix").not.toMatch(/getFeatureStates|isFeatureAvailable|gateFeature/);
  });

  it("records failures too, so a run of errors is visible in AI Usage", () => {
    expect(post).toMatch(/status:\s*"failure"/);
    expect(post).toMatch(/status:\s*"success"/);
  });

  it("files speech under Deepgram with the voice as the model and characters as input", () => {
    expect(post).toMatch(/provider:\s*"deepgram",\s*model:\s*voice/);
    expect(post).toContain("inputTokens: text.length");
  });
});

describe("T4773 — Animate narration", () => {
  it("reads the script from narration.ts rather than inventing its own", () => {
    expect(overlay).toContain("narrationFor(el)");
  });

  it("the tour WAITS for the line: it advances when the speech ends, not on a timer", () => {
    expect(overlay).toMatch(/onSpeakingChange:\s*\(speaking\)\s*=>\s*\{\s*if \(!speaking && !cancelled\) advance\(\)/);
  });

  it("pausing, restarting or closing cuts the voice off", () => {
    expect(overlay).toMatch(/return \(\) => \{ cancelled = true; speaker\.stop\(\); \}/);
  });

  it("the slider cannot restart a line mid-sentence — speed is read through a ref", () => {
    expect(overlay).toContain("1000 / speedRef.current");
    const deps = overlay.match(/\}, \[playing, step, [^\]]*\]\);/)?.[0] ?? "";
    expect(deps, "speed must not be a dependency of the tick").not.toMatch(/\bspeed\b/);
  });

  it("the switch exists only for someone who can hear it", () => {
    expect(overlay).toContain("canSpeak === true &&");
  });

  it("a refusal turns narration off and says why, and the tour carries on", () => {
    expect(overlay).toContain("setNarrationError(message)");
    expect(overlay).toContain("Narration stopped:");
  });
});
