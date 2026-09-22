// /dashboard/microsoft-connected — where the "Connect Microsoft" tab lands.
//
// The SharePoint window opens the Microsoft sign-in in a NEW tab so the editor
// is never navigated away (Paul, 2026-09-22: a failed sign-in "can kill the
// app"). Microsoft's callback — and the connect route itself when it cannot
// start — send that tab here with ?sharepoint=<what happened>. All this page
// has to do is say it in English and that the tab can be closed; it is never
// raw JSON (Paul, 2026-09-23).
const MESSAGES: Record<string, { title: string; body: string; ok: boolean }> = {
  connected: {
    title: "Microsoft 365 connected", ok: true,
    body: "You can close this tab. Back in Diagramatix, press Retry in the SharePoint window.",
  },
  error: {
    title: "Microsoft 365 was not connected", ok: false,
    body: "The Microsoft sign-in did not finish. Close this tab and try again from the SharePoint window — your diagram is untouched.",
  },
  unconfigured: {
    title: "SharePoint isn't set up on this server", ok: false,
    body: "Microsoft 365 hasn't been finished off for this Diagramatix server, so there is nothing to sign in to yet. Close this tab — your diagram is untouched — and ask your system administrator to complete the setup.",
  },
  "not-allowed": {
    title: "SharePoint is turned off for your organisation", ok: false,
    body: "Your organisation's settings don't allow SharePoint. Close this tab — your diagram is untouched.",
  },
};

type Props = { searchParams: Promise<{ sharepoint?: string }> };

export default async function MicrosoftConnectedPage({ searchParams }: Props) {
  const { sharepoint } = await searchParams;
  const m = MESSAGES[sharepoint ?? "error"] ?? MESSAGES.error;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className={`text-sm font-semibold ${m.ok ? "text-gray-900" : "text-red-700"}`}>{m.title}</h1>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-600">{m.body}</p>
        </div>
      </div>
    </div>
  );
}
