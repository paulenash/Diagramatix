import "dotenv/config";
import { deliverMail } from "../app/lib/mail/deliver";

/**
 * Send one real test message through the configured mail route(s) and say which one delivered it.
 *   npx tsx scripts/mail-test.ts [to-address]
 * Defaults to the support address. Uses the same settings as the app (Graph first, SMTP fallback).
 */
async function main() {
  const to = process.argv[2] || process.env.SMTP_FROM || "support@diagramatix.com.au";
  const { via } = await deliverMail({
    to,
    subject: "Diagramatix mail route test",
    html: "<p>This is a test message from <code>scripts/mail-test.ts</code>. If you can read it, the route works.</p>",
  });
  console.log(`delivered to ${to} via ${via}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
