/**
 * "Always go back to screen and state of original invocation when going to the
 * User Guide." — Paul, 2026-09-13.
 *
 * The guide already honoured `?from=<path>`, and for an ordinary page a path IS
 * the state. It was never enough for the four full-screen consoles. Each is an
 * OVERLAY over a host page rather than a route, so its open-ness lives in React
 * state the host drops the moment you navigate away — and none of the four
 * passed `from` at all, so the guide's back link went to /dashboard. You left
 * the Simulator and came back to the dashboard.
 *
 * Two halves have to hold, and each fails differently:
 *   • the LINK carries where to return to, and what to re-open
 *   • the HOST acts on that token, once, and then clears it
 *
 * The second is what stops the fix being annoying in a new way: a token left in
 * the URL re-opens a console the user has since closed, on the next reload or
 * Back.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  guideHref, reopenKeyOf, urlWithoutReopen, returnProjectOf,
  REOPEN_PARAM, RETURN_PID, RETURN_PNAME,
} from "@/app/lib/help/guideReturn";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

/** The `from` value the guide will read back out of a built href. */
const fromOf = (href: string) => new URLSearchParams(href.slice(href.indexOf("?"))).get("from");

describe("the guide link carries the way back", () => {
  it("T4338 — the return path is the invoking page plus the overlay to re-open", () => {
    const href = guideHref({ chapter: "simulation", pathname: "/diagram/abc", reopen: "simulator" });
    expect(href.startsWith("/help?")).toBe(true);
    const q = new URLSearchParams(href.slice(href.indexOf("?")));
    expect(q.get("c"), "opens at the feature's own chapter").toBe("simulation");
    expect(fromOf(href)).toBe(`/diagram/abc?${REOPEN_PARAM}=simulator`);
  });

  it("T4339 — an ordinary page needs no token: the path alone is the state", () => {
    const href = guideHref({ chapter: "projects-folders", pathname: "/dashboard" });
    expect(fromOf(href)).toBe("/dashboard");
    expect(href).not.toContain(REOPEN_PARAM);
  });

  it("T4340 — a host that needs more than a path gets it", () => {
    // The Dashboard holds the Simulator as a PROJECT, not a boolean. "/dashboard"
    // cannot say which project you were simulating, so the identity travels too.
    const href = guideHref({
      chapter: "simulation", pathname: "/dashboard", reopen: "simulator",
      returnParams: { [RETURN_PID]: "p1", [RETURN_PNAME]: "Order to Cash" },
    });
    const back = new URLSearchParams(fromOf(href)!.slice(fromOf(href)!.indexOf("?")));
    expect(back.get(RETURN_PID)).toBe("p1");
    expect(back.get(RETURN_PNAME)).toBe("Order to Cash");
    expect(returnProjectOf((k) => back.get(k))).toEqual({ id: "p1", name: "Order to Cash" });
    // Absent, the host must get NOTHING rather than a half-built project.
    expect(returnProjectOf(() => null)).toBeNull();
  });

  it("T4341 — an unknown key opens nothing rather than guessing", () => {
    expect(reopenKeyOf("simulator")).toBe("simulator");
    expect(reopenKeyOf("Simulator"), "keys are exact").toBeNull();
    expect(reopenKeyOf("dashboard")).toBeNull();
    expect(reopenKeyOf(null)).toBeNull();
    expect(reopenKeyOf("")).toBeNull();
  });

  it("T4342 — a path that is not an internal path cannot be smuggled in", () => {
    // `from` is fed to safeInternalPath at the far end, but the builder must not
    // manufacture an off-site value in the first place.
    for (const bad of ["https://evil.test", "//evil.test", ""]) {
      expect(fromOf(guideHref({ pathname: bad }))).toBe("/dashboard");
    }
  });
});

describe("the token is consumed, not left lying about", () => {
  it("T4343 — acting on the token strips it AND its return params", () => {
    const cleaned = urlWithoutReopen("/dashboard", `${REOPEN_PARAM}=miner&${RETURN_PID}=p1&${RETURN_PNAME}=X&tab=all`);
    expect(cleaned).not.toContain(REOPEN_PARAM);
    expect(cleaned).not.toContain(RETURN_PID);
    expect(cleaned).not.toContain(RETURN_PNAME);
    expect(cleaned, "unrelated params are the page's own and must survive").toContain("tab=all");
  });

  it("T4344 — a URL with no token is left alone", () => {
    // Returning null is what stops the host calling router.replace on every page
    // it ever renders.
    expect(urlWithoutReopen("/dashboard", "tab=all")).toBeNull();
    expect(urlWithoutReopen("/dashboard", "")).toBeNull();
  });

  it("T4345 — stripping the only params leaves a bare path, not a dangling '?'", () => {
    expect(urlWithoutReopen("/diagram/abc", `${REOPEN_PARAM}=ai-generate`)).toBe("/diagram/abc");
  });
});

describe("every console and host is wired", () => {
  const CONSOLES: [string, string, string][] = [
    ["app/components/simulation/SimulatorConsole.tsx", "simulation", "simulator"],
    ["app/components/mining/ProcessMiningConsole.tsx", "process-mining", "miner"],
    ["app/components/riskControls/RiskControlConsole.tsx", "risk-controls", "risk-control"],
    ["app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx", "ai-generate", "ai-generate"],
  ];

  it("T4346 — no console still hand-rolls a /help link without a way back", () => {
    // The defect was identical in all four, which is why this checks all four
    // rather than the one Paul happened to be looking at.
    for (const [file, chapter, reopen] of CONSOLES) {
      const src = read(file);
      expect(src, `${file} still has a raw /help anchor`).not.toMatch(/href="\/help\?/);
      expect(src, `${file} does not use the shared chip`).toContain("<ConsoleUserGuideLink");
      expect(src, `${file} wrong chapter`).toContain(`chapter="${chapter}"`);
      expect(src, `${file} wrong reopen key`).toContain(`reopen="${reopen}"`);
    }
  });

  it("T4347 — every host claims the overlays it renders", () => {
    // A link that asks to re-open something nobody listens for is the original
    // bug wearing a token.
    const hosts: [string, string[]][] = [
      ["app/(dashboard)/diagram/[id]/DiagramEditor.tsx", ["ai-generate", "simulator"]],
      ["app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", ["simulator", "miner", "risk-control"]],
      ["app/(dashboard)/dashboard/DashboardClient.tsx", ["simulator", "miner"]],
    ];
    for (const [file, keys] of hosts) {
      const src = read(file);
      for (const k of keys) {
        expect(src, `${file} does not re-open "${k}"`).toContain(`useReopenFromGuide("${k}"`);
      }
    }
  });

  it("T4348 — the Dashboard has a User Guide button, opening at Projects", () => {
    // Paul, 2026-09-13: "Add User Guide button to Dashboard and open at Projects".
    const src = read("app/(dashboard)/dashboard/DashboardClient.tsx");
    expect(src).toMatch(/<UserGuideLink\s+chapter="projects-folders"/);
    expect(src, "and it is a real chapter slug").toBeTruthy();
    const chapters = read("app/(dashboard)/help/chapters.tsx");
    expect(chapters, 'the "projects-folders" chapter must exist').toContain('slug: "projects-folders"');
  });

  it("T4349 — returning to a console skips the intro it already played", () => {
    // "The state of original invocation" is the console, not the 3.6-second
    // Matrix intro that precedes it. Sitting through that again on the way back
    // from the documentation would be its own small insult.
    const proj = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");
    expect(proj).toMatch(/useReopenFromGuide\("miner", \(\) => \{ setMiningSkipIntro\(true\)/);
    const dash = read("app/(dashboard)/dashboard/DashboardClient.tsx");
    expect(dash).toMatch(/useReopenFromGuide\("miner",[\s\S]{0,160}setSkipMiningIntro\(true\)/);
  });
});
