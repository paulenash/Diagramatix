/**
 * T5274 — "Send to support" can no longer fail silently (Paul, 2026-10-07). On 2026-10-06 the Microsoft 365 SMTP login was refused
 * ("535 5.7.3 Authentication unsuccessful") and every request vanished with a generic "Failed to send". Now:
 *   • mail goes by Microsoft Graph (app-only, no mailbox password) when configured, SMTP as the fallback — deliverMail;
 *   • a request is SAVED before any mail is attempted, and the outcome written back — attemptSupportSend;
 *   • the SuperAdmin sees failures with every route's error and can resend.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createDiagram } from "../_setup/factories";
import { deliverMail, type DeliverDeps } from "@/app/lib/mail/deliver";
import { clearGraphTokenCache, graphConfigFromEnv, graphMessageBody, sendViaGraph, GRAPH_ATTACHMENT_LIMIT_BYTES } from "@/app/lib/mail/graphMail";
import { attemptSupportSend, POLICY_OMITTED_JSON } from "@/app/lib/support/supportRequests";

const CFG = { tenantId: "t1", clientId: "c1", clientSecret: "s1", sender: "support@diagramatix.com.au" };
const MSG = { to: "support@diagramatix.com.au", subject: "Help", html: "<p>hi</p>", replyTo: "user@x.com", attachments: [{ filename: "a.json", content: "{}", contentType: "application/json" }] };

/** A fake fetch that answers the token and sendMail calls in turn and records what it saw. */
function fakeFetch(opts: { tokenStatus?: number; sendStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("login.microsoftonline.com")) {
      const ok = (opts.tokenStatus ?? 200) === 200;
      return new Response(JSON.stringify(ok ? { access_token: "tok", expires_in: 3600 } : { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret\r\ntrace" }), { status: opts.tokenStatus ?? 200 });
    }
    const status = opts.sendStatus ?? 202;
    return new Response(status === 202 ? null : JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Access is denied" } }), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

beforeEach(() => clearGraphTokenCache());

describe("T5274 Graph mail", () => {
  it("is configured only when all four settings are present", () => {
    expect(graphConfigFromEnv({})).toBeNull();
    expect(graphConfigFromEnv({ MAIL_GRAPH_TENANT_ID: "t", MAIL_GRAPH_CLIENT_ID: "c", MAIL_GRAPH_CLIENT_SECRET: "s" })).toBeNull();
    expect(graphConfigFromEnv({ MAIL_GRAPH_TENANT_ID: "t", MAIL_GRAPH_CLIENT_ID: "c", MAIL_GRAPH_CLIENT_SECRET: "s", MAIL_GRAPH_SENDER: "a@b.c" })).toEqual({ tenantId: "t", clientId: "c", clientSecret: "s", sender: "a@b.c" });
  });
  it("an alias is addressed through the real mailbox: MAIL_GRAPH_FROM only sets the displayed From, and is absent unless configured", () => {
    const env = { MAIL_GRAPH_TENANT_ID: "t", MAIL_GRAPH_CLIENT_ID: "c", MAIL_GRAPH_CLIENT_SECRET: "s", MAIL_GRAPH_SENDER: "paul@diagramatix.com.au" };
    expect(graphConfigFromEnv(env)).toEqual({ tenantId: "t", clientId: "c", clientSecret: "s", sender: "paul@diagramatix.com.au" });
    expect(graphConfigFromEnv({ ...env, MAIL_GRAPH_FROM: "support@diagramatix.com.au" })?.from).toBe("support@diagramatix.com.au");
    expect((graphMessageBody(MSG) as { message: Record<string, unknown> }).message.from).toBeUndefined();
    expect((graphMessageBody(MSG, "support@diagramatix.com.au") as { message: { from: unknown } }).message.from).toEqual({ emailAddress: { address: "support@diagramatix.com.au" } });
  });
  it("builds the sendMail body: HTML, recipient, reply-to, base64 file attachments", () => {
    const b = graphMessageBody(MSG) as { message: { subject: string; toRecipients: unknown[]; replyTo: unknown[]; attachments: { name: string; contentBytes: string; "@odata.type": string }[] }; saveToSentItems: boolean };
    expect(b.message.subject).toBe("Help");
    expect(b.message.toRecipients).toEqual([{ emailAddress: { address: "support@diagramatix.com.au" } }]);
    expect(b.message.replyTo).toEqual([{ emailAddress: { address: "user@x.com" } }]);
    expect(b.message.attachments[0]).toMatchObject({ "@odata.type": "#microsoft.graph.fileAttachment", name: "a.json", contentBytes: Buffer.from("{}").toString("base64") });
    expect(b.saveToSentItems).toBe(true);
  });
  it("gets an app-only token, then POSTs sendMail from the configured mailbox with a Bearer token", async () => {
    const { f, calls } = fakeFetch();
    await sendViaGraph(CFG, MSG, f);
    expect(calls[0].url).toContain("/t1/oauth2/v2.0/token");
    expect(String(calls[0].init?.body)).toContain("grant_type=client_credentials");
    expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/users/support%40diagramatix.com.au/sendMail");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
  it("reuses the token for the next send", async () => {
    const { f, calls } = fakeFetch();
    await sendViaGraph(CFG, MSG, f);
    await sendViaGraph(CFG, MSG, f);
    expect(calls.filter((c) => c.url.includes("login.microsoftonline.com")).length).toBe(1);
  });
  it("says why it failed: a bad secret, or Graph refusing the mailbox", async () => {
    await expect(sendViaGraph(CFG, MSG, fakeFetch({ tokenStatus: 401 }).f)).rejects.toThrow(/token request failed \(401\): AADSTS7000215/);
    clearGraphTokenCache();
    await expect(sendViaGraph(CFG, MSG, fakeFetch({ sendStatus: 403 }).f)).rejects.toThrow(/sendMail failed \(403 ErrorAccessDenied\): Access is denied/);
  });
});

describe("T5274 deliverMail — Graph first, SMTP as the fallback", () => {
  const smtpOk = () => { const sent: unknown[] = []; return { sent, smtp: { sendMail: async (o: Record<string, unknown>) => { sent.push(o); } } }; };
  const deps = (o: Partial<DeliverDeps>): DeliverDeps => ({ graph: CFG, smtp: null, smtpFrom: "support@x", ...o });

  it("uses Graph when it works and never touches SMTP", async () => {
    const { sent, smtp } = smtpOk();
    const r = await deliverMail(MSG, deps({ smtp, fetchImpl: fakeFetch().f }));
    expect(r.via).toBe("graph");
    expect(sent).toHaveLength(0);
  });
  it("falls back to SMTP when Graph fails", async () => {
    const { sent, smtp } = smtpOk();
    const r = await deliverMail(MSG, deps({ smtp, fetchImpl: fakeFetch({ sendStatus: 403 }).f }));
    expect(r.via).toBe("smtp");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "support@x", to: "support@diagramatix.com.au", replyTo: "user@x.com" });
  });
  it("uses SMTP alone when Graph is not configured", async () => {
    const { smtp } = smtpOk();
    expect((await deliverMail(MSG, deps({ graph: null, smtp }))).via).toBe("smtp");
  });
  it("when everything fails the error names every route (so the log and the failure list say what happened)", async () => {
    const smtp = { sendMail: async () => { throw new Error("Invalid login: 535 5.7.3 Authentication unsuccessful"); } };
    await expect(deliverMail(MSG, deps({ smtp, fetchImpl: fakeFetch({ sendStatus: 403 }).f }))).rejects.toThrow(/graph: sendMail failed \(403.*\| smtp: Invalid login: 535 5\.7\.3/);
  });
  it("sends attachments too big for Graph by SMTP", async () => {
    const { sent, smtp } = smtpOk();
    const big = { ...MSG, attachments: [{ filename: "big.svg", content: Buffer.alloc(GRAPH_ATTACHMENT_LIMIT_BYTES + 1), contentType: "image/svg+xml" }] };
    const { f, calls } = fakeFetch();
    expect((await deliverMail(big, deps({ smtp, fetchImpl: f }))).via).toBe("smtp");
    expect(calls).toHaveLength(0);                   // Graph was not even called
    expect(sent).toHaveLength(1);
  });
  it("with nothing configured it sends nothing and says so (dev: the caller logs it)", async () => {
    expect((await deliverMail(MSG, { graph: null, smtp: null })).via).toBe("console");
  });
});

describe("T5274 a request is saved, then emailed, and the outcome recorded", () => {
  beforeEach(async () => { await truncateAll(); });

  async function savedRequest(withDiagram = true) {
    const { user, org } = await createUserWithOrg();
    const diagram = await createDiagram({ userId: user.id, orgId: org.id, name: "AI Generate from Attachment" });
    const row = await prisma.supportRequest.create({
      data: { userId: user.id, userEmail: user.email, userName: "Paul", diagramId: diagram.id, diagramName: diagram.name, subject: "Help with: x", message: "Just a check", withDiagram },
    });
    return { user, diagram, row };
  }

  it("success: status sent, route recorded, the kept SVG cleared", async () => {
    const { row } = await savedRequest();
    const seen: { svgBase64: string | null; diagramJson: string }[] = [];
    const out = await attemptSupportSend(row.id, { svgBase64: "PHN2Zz4=", send: async (i) => { seen.push({ svgBase64: i.svgBase64, diagramJson: i.diagramJson }); return { via: "graph" }; } });
    expect(out).toEqual({ ok: true, via: "graph" });
    expect(seen[0].svgBase64).toBe("PHN2Zz4=");
    const after = await prisma.supportRequest.findUnique({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "sent", via: "graph", error: null, svgBase64: null, attempts: 1 });
    expect(after?.sentAt).not.toBeNull();
  });
  it("failure: the request is NOT lost — status failed, the error and the SVG kept for a resend", async () => {
    const { row } = await savedRequest();
    const out = await attemptSupportSend(row.id, { svgBase64: "PHN2Zz4=", send: async () => { throw new Error("graph: x | smtp: Invalid login: 535 5.7.3 Authentication unsuccessful"); } });
    expect(out.ok).toBe(false);
    const after = await prisma.supportRequest.findUnique({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "failed", svgBase64: "PHN2Zz4=", attempts: 1, message: "Just a check" });
    expect(after?.error).toContain("535 5.7.3");
  });
  it("a resend uses the kept SVG, and on success the row becomes sent", async () => {
    const { row } = await savedRequest();
    await attemptSupportSend(row.id, { svgBase64: "PHN2Zz4=", send: async () => { throw new Error("down"); } });
    let svgOnResend: string | null = null;
    const out = await attemptSupportSend(row.id, { send: async (i) => { svgOnResend = i.svgBase64; return { via: "smtp" }; } });
    expect(out.ok).toBe(true);
    expect(svgOnResend).toBe("PHN2Zz4=");
    expect(await prisma.supportRequest.findUnique({ where: { id: row.id } })).toMatchObject({ status: "sent", via: "smtp", attempts: 2, svgBase64: null });
  });
  it("an organisation that forbids the diagram leaving gets the note only — on a resend too", async () => {
    const { row } = await savedRequest(false);
    let seen: { diagramJson: string; svgBase64: string | null } | null = null;
    await attemptSupportSend(row.id, { svgBase64: "PHN2Zz4=", send: async (i) => { seen = { diagramJson: i.diagramJson, svgBase64: i.svgBase64 }; return { via: "graph" }; } });
    expect(seen).toEqual({ diagramJson: POLICY_OMITTED_JSON, svgBase64: null });
  });
  it("an unknown request id is reported, not thrown", async () => {
    expect(await attemptSupportSend("nope", { send: async () => ({ via: "graph" }) })).toMatchObject({ ok: false });
  });
});

describe("T5274 the wiring", () => {
  const route = readFileSync("app/api/support/diagram/route.ts", "utf8");
  it("the route saves the request BEFORE attempting the email, and answers ok with whether it went", () => {
    expect(route.indexOf("prisma.supportRequest.create")).toBeGreaterThan(-1);
    expect(route.indexOf("prisma.supportRequest.create")).toBeLessThan(route.indexOf("attemptSupportSend("));
    expect(route).toContain("return NextResponse.json({ ok: true, emailed: outcome.ok, requestId: saved.id });");
    expect(route).not.toContain("Failed to send. Please try again");
  });
  it("the Support-project copy no longer depends on the email having gone", () => {
    expect(route.indexOf("attemptSupportSend(")).toBeLessThan(route.indexOf("depositToSupportProject({"));
    expect(route).not.toMatch(/if \(!outcome\.ok\) return/);
  });
  it("the dialog tells the user when the request is saved but not emailed", () => {
    expect(readFileSync("app/(dashboard)/diagram/[id]/SupportRequestDialog.tsx", "utf8")).toContain("onSent({ emailed: body.emailed !== false })");
    expect(readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8")).toContain("Your request is saved, but we couldn&apos;t email it just now.");
  });
  it("every email helper goes through deliverMail; nothing else builds an SMTP transport", () => {
    const email = readFileSync("app/lib/email.ts", "utf8");
    expect((email.match(/deliverMail\(/g) ?? []).length).toBe(3);
    expect(email).not.toContain("createTransport");
  });
  it("the admin list is SuperAdmin-only, resend is guarded against read-only viewing, the tile exists, erasure deletes the rows", () => {
    expect(readFileSync("app/api/admin/support-requests/[id]/route.ts", "utf8")).toContain("isReadOnlyImpersonation(session, await cookies())");
    expect(readFileSync("app/(dashboard)/dashboard/admin/support-requests/page.tsx", "utf8")).toContain("isActingSuperuser(session)");
    expect(readFileSync("app/(dashboard)/dashboard/admin/AdminClient.tsx", "utf8")).toContain('href: "/dashboard/admin/support-requests"');
    expect(readFileSync("app/lib/account/eraseUser.ts", "utf8")).toContain("prisma.supportRequest.deleteMany({ where: { userId } })");
  });
});
