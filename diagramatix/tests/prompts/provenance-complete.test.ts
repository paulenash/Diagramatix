/**
 * EVERY place that creates a prompt records how it was written.
 *
 * Paul asked whether all new prompts get the new attributes. They did not: the
 * capture went into the two-phase Plan panel and three other creation sites
 * were left alone — the one-shot panel, the maintenance screen's own form, and
 * the auto-created prompt a generation makes when you have not saved one.
 *
 * That is worth a DERIVED guard rather than a list of four files, because the
 * failure has no symptom. Nothing breaks; a prompt is simply created with its
 * provenance blank, and the filter that was built to find it quietly returns
 * the wrong set. The next panel somebody adds would do the same thing.
 *
 * So this walks the client source, finds every POST to /api/prompts, and
 * insists each one says something about where the text came from.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every .ts/.tsx under app/, excluding the API routes themselves. */
function clientSources(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(process.cwd(), rel))) {
      const r = `${rel}/${name}`;
      if (statSync(join(process.cwd(), r)).isDirectory()) {
        if (name === "api" || name === "node_modules") continue;
        walk(r);
      } else if (/\.tsx?$/.test(name)) out.push(r);
    }
  };
  walk(dir);
  return out;
}

/**
 * The body of each `fetch("/api/prompts", { method: "POST" … })` call, roughly:
 * from the URL to the end of the JSON.stringify argument. Good enough to tell
 * whether provenance is mentioned, which is all this needs to decide.
 */
function promptCreateBodies(src: string): string[] {
  const out: string[] = [];
  const re = /fetch\(\s*[`"']\/api\/prompts[`"']\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const chunk = src.slice(m.index, m.index + 900);
    // Only creations. A PUT is an edit, and an edit must NOT rewrite how the
    // prompt was originally written.
    if (!/method:\s*["']POST["']/.test(chunk)) continue;
    out.push(chunk);
  }
  return out;
}

describe("every prompt creation records its provenance", () => {
  const files = clientSources("app");

  it("T4193 - no POST to /api/prompts omits how the text was written", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const body of promptCreateBodies(src)) {
        // A call site may say it outright, forward what a panel reported, or
        // spread a clearly-named object that carries it. What it may not do is
        // stay silent about where the text came from.
        const says = body.includes("source:")
          || body.includes("promptSource")
          || body.includes("...provenance");
        if (!says) offenders.push(f);
      }
    }
    expect(
      [...new Set(offenders)],
      "these create a prompt without recording whether it was typed or dictated",
    ).toEqual([]);
  });

  it("T4194 - the panels that can SEE an image or a microphone report both", () => {
    // DiagramEditor creates the prompt but cannot see either — it only knows
    // what the meta carries, which is why the meta carries it.
    for (const f of [
      "app/(dashboard)/diagram/[id]/PlanPanel.tsx",
      "app/(dashboard)/diagram/[id]/AiPanel.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} does not track dictation`).toContain("dictatedRef.current = true;");
      expect(src, `${f} does not report an image attachment`)
        .toMatch(/promptFromImage: attachment\?\.type === "image"/);
    }
  });

  it("T4195 - an auto-created prompt inherits what the panel reported", () => {
    // The path somebody takes without ever pressing Save: generate, and a
    // prompt is created for them. It was the one most likely to be missed and
    // the one most likely to be used.
    const src = readFileSync(join(process.cwd(), "app/(dashboard)/diagram/[id]/DiagramEditor.tsx"), "utf8");
    expect(src).toMatch(/meta\.promptSource \? \{ source: meta\.promptSource \} : \{\}/);
    expect(src).toMatch(/meta\.promptFromImage \? \{ fromImage: true \} : \{\}/);
    expect(src).toMatch(/meta\.promptRefined \? \{ refined: true \} : \{\}/);
  });

  it("T4196 - editing a prompt does not rewrite how it was originally written", () => {
    // A PUT is an edit. Tidying the wording of something you dictated does not
    // make it typed, and claiming otherwise would quietly rewrite history every
    // time somebody fixed a typo.
    const src = readFileSync(join(process.cwd(), "app/(dashboard)/dashboard/prompts/PromptMaintenance.tsx"), "utf8");
    expect(src, "source must only be set on CREATE").toMatch(/editingId \? \{\} : \{ source: "typed" \}/);
    const api = readFileSync(join(process.cwd(), "app/api/prompts/[id]/route.ts"), "utf8");
    expect(api, "the update endpoint must not accept a source at all")
      .not.toMatch(/\bsource\b\s*[,:}]/);
  });
});
