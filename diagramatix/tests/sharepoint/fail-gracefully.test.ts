/**
 * SharePoint fails gracefully when the user has no working Microsoft sign-in.
 *
 * Paul, 2026-09-22: "trying to set a Sharepoint link on a Data Object should
 * always fail gracefully if user not logged in to a Microsoft account,
 * currently it can kill the app."
 *
 * The rules live in app/lib/microsoft/sharePointOutcome.ts; these tests pin
 * them and the WIRING that makes them matter — the routes answer through them,
 * the picker never navigates the editor away, and every SharePoint window in
 * the editor sits inside an error boundary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MS_NOT_CONNECTED, MS_NOT_CONNECTED_MESSAGE,
  asList, classifySharePointFailure, connectUrl, graphErrorBody, graphErrorStatus, notConnectedBody,
} from "@/app/lib/microsoft/sharePointOutcome";

const src = (p: string) => readFileSync(p, "utf8");

describe("T4682 — a Microsoft sign-in that is missing or refused asks the user to connect", () => {
  it("the routes' no-token body is classified as not connected", () => {
    expect(classifySharePointFailure(403, notConnectedBody()).kind).toBe("not-connected");
    // The body an older server sent (message only) still reads the same way.
    expect(classifySharePointFailure(403, { error: MS_NOT_CONNECTED_MESSAGE }).kind).toBe("not-connected");
  });

  it("a token Microsoft refuses (Graph 401) is answered as not connected, not a raw 401", () => {
    const { status, body } = graphErrorBody({ statusCode: 401, message: "Access token has expired or is not yet valid." }, "x");
    expect(status).toBe(403);
    expect(body.code).toBe(MS_NOT_CONNECTED);
    expect(classifySharePointFailure(status, body).kind).toBe("not-connected");
  });

  it("the org policy gate's 403 is 'unavailable' — there is nothing to connect", () => {
    const o = classifySharePointFailure(403, { error: "SharePoint is disabled for your organisation." });
    expect(o).toEqual({ kind: "unavailable", message: "SharePoint is disabled for your organisation." });
  });

  it("an ended Diagramatix session is 'signed-out'; anything else is an error with its message", () => {
    expect(classifySharePointFailure(401, { error: "Unauthorized" }).kind).toBe("signed-out");
    expect(classifySharePointFailure(404, { error: "itemNotFound" })).toEqual({ kind: "error", message: "itemNotFound" });
    expect(classifySharePointFailure(500, null).kind).toBe("error");
    expect(classifySharePointFailure(502, "<html>").message).toMatch(/502/);
  });
});

describe("T4683 — a Graph failure always gets a response the route can send", () => {
  it("a status Graph gives that no HTTP response can carry becomes 502", () => {
    // A network failure in the Graph client reports -1; NextResponse throws on it.
    for (const bad of [-1, 0, 200, 302, 600, 401.5, "404", undefined, null]) {
      expect(graphErrorStatus({ statusCode: bad })).toBe(502);
    }
    expect(graphErrorStatus(null)).toBe(502);
    expect(graphErrorStatus(new Error("boom"))).toBe(502);
  });

  it("a real error status passes through with Graph's message, or the fallback", () => {
    expect(graphErrorBody({ statusCode: 404, message: "itemNotFound" }, "Download failed"))
      .toEqual({ status: 404, body: { error: "itemNotFound" } });
    expect(graphErrorBody({ statusCode: 429 }, "Upload failed"))
      .toEqual({ status: 429, body: { error: "Upload failed" } });
  });

  it("every SharePoint route answers through the shared helpers", () => {
    for (const p of ["app/api/sharepoint/route.ts", "app/api/sharepoint/download/route.ts", "app/api/sharepoint/upload/route.ts"]) {
      const s = src(p);
      expect(s, p).toContain("graphErrorBody(err");
      expect(s, p).toContain("NextResponse.json(notConnectedBody(), { status: 403 })");
      // A token lookup that throws must read as "not connected", not a 500.
      expect(s, p).toContain("getMsAccessTokenForUser(session.user.id).catch(() => null)");
      expect(s, p).not.toMatch(/statusCode \?\? 500/);
    }
  });
});

describe("T4684 — the editor is never taken down by the SharePoint windows", () => {
  it("a response that is not a list renders as an empty list, not a crash", () => {
    expect(asList({ error: "x" })).toEqual([]);
    expect(asList(null)).toEqual([]);
    expect(asList("<html>")).toEqual([]);
    expect(asList([1, 2])).toEqual([1, 2]);
  });

  it("Connect opens in a new tab and returns to a page that can be closed", () => {
    const url = connectUrl("https://app.example");
    expect(url.startsWith("/api/microsoft/connect?returnTo=")).toBe(true);
    expect(decodeURIComponent(url.split("returnTo=")[1])).toBe("https://app.example/dashboard/microsoft-connected");

    const picker = src("app/components/SharePointPicker.tsx");
    expect(picker).not.toMatch(/window\.location\.href\s*=/);
    expect(picker).toMatch(/href=\{connectUrl\(window\.location\.origin\)\}\s*target="_blank"/);
    // Every list the picker renders goes through asList.
    expect(picker.match(/set(Sites|Drives|Items)\((?!asList)/g)).toBeNull();
  });

  it("every SharePoint window in the editor sits inside a SafeBoundary", () => {
    const ed = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    const opens = ed.match(/<SharePoint(Picker|Preview)\b/g) ?? [];
    expect(opens.length).toBe(3);
    // The boundary's own onClose holds a "=>", so match up to the NEXT tag rather than the first ">".
    const wrapped = ed.match(/<SafeBoundary what="The SharePoint (window|preview)"[^<]*<SharePoint(Picker|Preview)\b/g) ?? [];
    expect(wrapped.length).toBe(opens.length);
  });
});
