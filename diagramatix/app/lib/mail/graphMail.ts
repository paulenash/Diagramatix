/**
 * Send mail through Microsoft Graph with an app-only token (client credentials) — no mailbox password involved.
 *
 * One-time Azure setup (a SuperAdmin; it cannot be done from code):
 *   1. Entra ID ▸ App registrations ▸ New registration ("Diagramatix Mail").
 *   2. API permissions ▸ Microsoft Graph ▸ APPLICATION permissions ▸ Mail.Send ▸ Grant admin consent.
 *   3. Certificates & secrets ▸ New client secret (note its expiry — the SuperAdmin failure list will show when it stops working).
 *   4. Restrict it to the one mailbox it needs: an Application Access Policy (Exchange Online
 *      New-ApplicationAccessPolicy) limited to the support mailbox — Mail.Send application permission otherwise allows any mailbox.
 *   5. App settings on the web app: MAIL_GRAPH_TENANT_ID, MAIL_GRAPH_CLIENT_ID, MAIL_GRAPH_CLIENT_SECRET, MAIL_GRAPH_SENDER
 *      — the MAILBOX the mail is sent through: its real address (user principal name), NOT an alias. Graph addresses /users/{id}/sendMail
 *      by user id or principal name; an alias such as support@ that is only a proxy address of paul@ is not a valid {id}.
 *   6. Optional: MAIL_GRAPH_FROM — an address to show as the sender (e.g. the support@ alias of that mailbox). Left unset, mail shows the
 *      mailbox's own address. Exchange only accepts a From that belongs to the mailbox, so use one of its own aliases.
 *
 * `sendMail` carries attachments inline (base64) in one request, which Graph limits to about 4 MB; deliver.ts keeps the attachment
 * total under GRAPH_ATTACHMENT_LIMIT_BYTES and uses SMTP for anything bigger.
 */
export interface GraphMailConfig { tenantId: string; clientId: string; clientSecret: string; sender: string; /** Optional From address (an alias of `sender`). */ from?: string }

/** Raw bytes of attachments; base64 inflates by a third, and the request must stay under Graph's ~4 MB. */
export const GRAPH_ATTACHMENT_LIMIT_BYTES = 2_400_000;

export function graphConfigFromEnv(env: Record<string, string | undefined> = process.env): GraphMailConfig | null {
  const tenantId = env.MAIL_GRAPH_TENANT_ID, clientId = env.MAIL_GRAPH_CLIENT_ID, clientSecret = env.MAIL_GRAPH_CLIENT_SECRET, sender = env.MAIL_GRAPH_SENDER;
  const from = env.MAIL_GRAPH_FROM?.trim() || undefined;
  return tenantId && clientId && clientSecret && sender ? { tenantId, clientId, clientSecret, sender, ...(from ? { from } : {}) } : null;
}

interface Msg { to: string; subject: string; html: string; replyTo?: string; attachments?: { filename: string; content: string | Buffer; contentType: string }[] }

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(cfg: GraphMailConfig, f: typeof fetch): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await f(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`token request failed (${res.status}): ${(body.error_description ?? body.error ?? "no detail").split("\r\n")[0]}`);
  }
  tokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

/** Pure — the Graph `sendMail` request body for a message. */
export function graphMessageBody(msg: Msg, from?: string): Record<string, unknown> {
  return {
    message: {
      subject: msg.subject,
      body: { contentType: "HTML", content: msg.html },
      ...(from ? { from: { emailAddress: { address: from } } } : {}),
      toRecipients: [{ emailAddress: { address: msg.to } }],
      ...(msg.replyTo ? { replyTo: [{ emailAddress: { address: msg.replyTo } }] } : {}),
      attachments: (msg.attachments ?? []).map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename,
        contentType: a.contentType,
        contentBytes: (typeof a.content === "string" ? Buffer.from(a.content) : a.content).toString("base64"),
      })),
    },
    saveToSentItems: true,
  };
}

export async function sendViaGraph(cfg: GraphMailConfig, msg: Msg, f: typeof fetch = fetch): Promise<void> {
  const token = await getToken(cfg, f);
  const res = await f(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(graphMessageBody(msg, cfg.from)),
  });
  if (res.status === 202 || res.ok) return;
  // A rejected token is cached for up to an hour — drop it so the next attempt asks again.
  if (res.status === 401) tokenCache.delete(`${cfg.tenantId}:${cfg.clientId}`);
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  throw new Error(`sendMail failed (${res.status}${body.error?.code ? ` ${body.error.code}` : ""}): ${body.error?.message ?? "no detail"}`);
}

/** For tests. */
export function clearGraphTokenCache(): void { tokenCache.clear(); }
