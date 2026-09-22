// /dashboard/microsoft-connected — where the "Connect Microsoft" tab lands.
//
// The SharePoint picker opens the Microsoft sign-in in a NEW tab so the editor
// is never navigated away (Paul, 2026-09-22: a failed sign-in "can kill the
// app"). Microsoft's callback sends that tab here with ?sharepoint=connected or
// ?sharepoint=error; all this page has to say is what happened and that the tab
// can be closed.
type Props = { searchParams: Promise<{ sharepoint?: string }> };

export default async function MicrosoftConnectedPage({ searchParams }: Props) {
  const { sharepoint } = await searchParams;
  const ok = sharepoint === "connected";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-lg shadow p-6 max-w-sm text-center">
        <h1 className="text-sm font-semibold text-gray-900 mb-2">
          {ok ? "Microsoft 365 connected" : "Microsoft 365 was not connected"}
        </h1>
        <p className="text-xs text-gray-600">
          {ok
            ? "You can close this tab. Back in Diagramatix, press Retry in the SharePoint window."
            : "The Microsoft sign-in did not finish. Close this tab and try again from the SharePoint window — your diagram is untouched."}
        </p>
      </div>
    </div>
  );
}
