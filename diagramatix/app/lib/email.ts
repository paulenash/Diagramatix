import nodemailer from "nodemailer";

// Shared transport factory — keeps every send-* helper consistent on
// host / port / auth so a config tweak in .env only changes one place.
// Returns null when SMTP_HOST is unset (dev mode), and the caller falls
// back to console-logging the message.
function smtpTransport() {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const defaultFrom = () => process.env.SMTP_FROM || "noreply@diagramatix.com";

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<void> {
  const transport = smtpTransport();
  if (transport) {
    await transport.sendMail({
      from: defaultFrom(),
      to: email,
      subject: "Reset your Diagramatix password",
      html: `
        <p>You requested a password reset for your Diagramatix account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  } else {
    console.log("\n========================================");
    console.log("[PASSWORD RESET]");
    console.log(`Email: ${email}`);
    console.log(`Link:  ${resetUrl}`);
    console.log("========================================\n");
  }
}

// User-initiated "Help with this diagram" send. Wraps the user's note
// in some context (who they are, which diagram, when) and attaches the
// diagram's JSON payload + a PNG screenshot the client generated.
//
// Reply-To is set to the user's email so the support team can hit Reply
// in their inbox and the response goes back to the user, not to the
// support@ shared inbox.
export interface SupportEmailInput {
  fromUserName: string | null;
  fromUserEmail: string;
  diagramId: string;
  diagramName: string;
  subject: string;
  message: string;
  // Diagram data JSON, stringified (the same shape stored in DiagramData).
  diagramJson: string;
  // PNG of the canvas, base64-encoded (no `data:` prefix).
  pngBase64: string | null;
}

export async function sendSupportDiagramEmail(input: SupportEmailInput): Promise<void> {
  const transport = smtpTransport();
  const supportAddress = process.env.SMTP_FROM || "support@diagramatix.com.au";
  const userDisplay = input.fromUserName ? `${input.fromUserName} <${input.fromUserEmail}>` : input.fromUserEmail;
  const sentAt = new Date().toISOString();

  const html = `
    <p>A Diagramatix user has sent a diagram for support.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:4px 8px;color:#555;">From</td><td style="padding:4px 8px;"><strong>${escapeHtml(userDisplay)}</strong></td></tr>
      <tr><td style="padding:4px 8px;color:#555;">Diagram</td><td style="padding:4px 8px;">${escapeHtml(input.diagramName)} <span style="color:#888;">(${escapeHtml(input.diagramId)})</span></td></tr>
      <tr><td style="padding:4px 8px;color:#555;">Sent at</td><td style="padding:4px 8px;">${sentAt}</td></tr>
    </table>
    <h3 style="font-family:Arial,sans-serif;font-size:14px;margin-top:18px;">Message</h3>
    <pre style="font-family:Arial,sans-serif;font-size:13px;white-space:pre-wrap;background:#f7f7f7;padding:10px;border:1px solid #e5e5e5;border-radius:4px;">${escapeHtml(input.message || "(no message)")}</pre>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#666;">Attachments: diagram JSON ${input.pngBase64 ? "+ PNG screenshot" : "only"}.</p>
  `;

  const attachments: nodemailer.SendMailOptions["attachments"] = [
    {
      filename: `${safeFileName(input.diagramName)}.json`,
      content: input.diagramJson,
      contentType: "application/json",
    },
  ];
  if (input.pngBase64) {
    attachments.push({
      filename: `${safeFileName(input.diagramName)}.png`,
      content: Buffer.from(input.pngBase64, "base64"),
      contentType: "image/png",
    });
  }

  if (transport) {
    await transport.sendMail({
      from: defaultFrom(),
      to: supportAddress,
      replyTo: input.fromUserEmail,
      subject: input.subject || `Help with: ${input.diagramName}`,
      html,
      attachments,
    });
  } else {
    console.log("\n========================================");
    console.log("[SUPPORT DIAGRAM]");
    console.log(`From:    ${userDisplay}`);
    console.log(`Diagram: ${input.diagramName} (${input.diagramId})`);
    console.log(`Subject: ${input.subject}`);
    console.log(`Message: ${input.message}`);
    console.log(`PNG:     ${input.pngBase64 ? `${input.pngBase64.length} chars` : "(none)"}`);
    console.log("========================================\n");
  }
}

// Sent when a bundle owner invites someone who doesn't yet have a
// Diagramatix account. The invitee follows the registration link, and
// the auth-side hook automatically promotes their PendingBundleAudience
// row(s) into real audience grants on first sign-in.
export interface BundleInviteEmailInput {
  toEmail: string;
  inviterName: string | null;
  inviterEmail: string;
  bundleName: string;
  registerUrl: string;
}

export async function sendBundleInvitationEmail(input: BundleInviteEmailInput): Promise<void> {
  const transport = smtpTransport();
  const inviterDisplay = input.inviterName ? `${input.inviterName} (${input.inviterEmail})` : input.inviterEmail;
  const html = `
    <p>${escapeHtml(inviterDisplay)} has invited you to view a published process on Diagramatix.</p>
    <p style="font-family:Arial,sans-serif;font-size:14px;margin:14px 0;">
      <strong>${escapeHtml(input.bundleName)}</strong>
    </p>
    <p>
      <a href="${input.registerUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;font-size:13px;">
        Create your account
      </a>
    </p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#666;">
      Once you've signed up with this email address you'll be automatically taken to the published process.
      The link doesn't expire, and you can also paste it into your browser if the button above doesn't work:
      <br/><br/>${escapeHtml(input.registerUrl)}
    </p>
  `;
  if (transport) {
    await transport.sendMail({
      from: defaultFrom(),
      to: input.toEmail,
      replyTo: input.inviterEmail,
      subject: `${input.inviterName ?? input.inviterEmail} invited you to view "${input.bundleName}"`,
      html,
    });
  } else {
    console.log("\n========================================");
    console.log("[BUNDLE INVITE]");
    console.log(`To:        ${input.toEmail}`);
    console.log(`Inviter:   ${inviterDisplay}`);
    console.log(`Bundle:    ${input.bundleName}`);
    console.log(`Register:  ${input.registerUrl}`);
    console.log("========================================\n");
  }
}

function safeFileName(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "diagram";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
