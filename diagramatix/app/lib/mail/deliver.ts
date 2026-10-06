/**
 * One way to send mail, with a route that does not depend on a person's mailbox password (Paul, 2026-10-07).
 *
 * On 2026-10-06 every support request failed with "535 5.7.3 Authentication unsuccessful": the SMTP login to Microsoft 365 was refused
 * (a password that changed, or Authenticated SMTP switched off for the mailbox). Everything that sends mail shared that one login.
 *
 *   1. MICROSOFT GRAPH, when configured — app-only `sendMail` from a shared mailbox, using an Entra app registration with the
 *      Mail.Send application permission. No mailbox password, no basic-auth SMTP, nothing to expire silently.
 *   2. SMTP, when configured — the existing nodemailer path, kept as the fallback.
 *   3. Neither configured (dev) — nothing is sent; the caller prints the message to the console as before.
 *
 * If the first route fails the next is tried; if all fail the thrown error names every attempt, so the log and the SuperAdmin's failure
 * list say exactly what went wrong. Returns which route delivered.
 */
import nodemailer from "nodemailer";
import { graphConfigFromEnv, sendViaGraph, GRAPH_ATTACHMENT_LIMIT_BYTES, type GraphMailConfig } from "./graphMail";

export interface MailAttachment { filename: string; content: string | Buffer; contentType: string }
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}
export type MailRoute = "graph" | "smtp" | "console";

export interface DeliverDeps {
  graph?: GraphMailConfig | null;
  /** Injected for tests; the default builds the nodemailer transport from the SMTP_* settings. */
  smtp?: { sendMail(opts: Record<string, unknown>): Promise<unknown> } | null;
  smtpFrom?: string;
  fetchImpl?: typeof fetch;
}

function smtpFromEnv(): DeliverDeps["smtp"] {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const attachmentBytes = (a: MailAttachment) => (typeof a.content === "string" ? Buffer.byteLength(a.content) : a.content.length);

export async function deliverMail(msg: MailMessage, deps: DeliverDeps = {}): Promise<{ via: MailRoute }> {
  const graph = deps.graph === undefined ? graphConfigFromEnv() : deps.graph;
  const smtp = deps.smtp === undefined ? smtpFromEnv() : deps.smtp;
  const from = deps.smtpFrom ?? process.env.SMTP_FROM ?? "noreply@diagramatix.com";
  if (!graph && !smtp) return { via: "console" };

  const failures: string[] = [];

  if (graph) {
    const bytes = (msg.attachments ?? []).reduce((n, a) => n + attachmentBytes(a), 0);
    if (bytes > GRAPH_ATTACHMENT_LIMIT_BYTES) {
      failures.push(`graph: attachments are ${Math.round(bytes / 1024)} KB, over the ${Math.round(GRAPH_ATTACHMENT_LIMIT_BYTES / 1024)} KB this route carries`);
    } else {
      try {
        await sendViaGraph(graph, msg, deps.fetchImpl ?? fetch);
        return { via: "graph" };
      } catch (e) {
        failures.push(`graph: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (smtp) {
    try {
      await smtp.sendMail({
        from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, html: msg.html,
        attachments: msg.attachments,
      });
      return { via: "smtp" };
    } catch (e) {
      failures.push(`smtp: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(failures.join(" | "));
}
