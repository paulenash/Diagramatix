import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { prisma } from "@/app/lib/db";
import { graphConfigFromEnv } from "@/app/lib/mail/graphMail";
import { SupportRequestsClient, type SupportRow } from "./SupportRequestsClient";

export const metadata = { title: "Support Requests — Admin" };

/**
 * SuperAdmin: every "Send to support" request, newest first, with whether its email went and, when it did not, why — and a Resend button.
 * A request is saved BEFORE any mail is attempted (app/lib/support/supportRequests.ts), so a mail outage never loses one.
 */
export default async function SupportRequestsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");

  const rows = await prisma.supportRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, userEmail: true, userName: true, diagramId: true, diagramName: true, subject: true, message: true,
      status: true, via: true, error: true, attempts: true, createdAt: true, lastAttemptAt: true, sentAt: true,
    },
  });
  const entries: SupportRow[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    lastAttemptAt: r.lastAttemptAt ? r.lastAttemptAt.toISOString() : null,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
  }));
  const mail = {
    graph: !!graphConfigFromEnv(),
    smtp: !!process.env.SMTP_HOST,
  };
  return <SupportRequestsClient initial={entries} mail={mail} />;
}
