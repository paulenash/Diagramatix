"use client";

/**
 * What a phone shows when Mobile Access isn't part of the person's plan (the
 * `mobile` feature is Not Available or Disabled for their level, or a
 * prerequisite — Process Review, Voice Assist — is). It says why, offers the
 * desktop version (which also stops the proxy sending this phone back to /m),
 * and points at the upgrade.
 */
export function MobileUnavailable({ message, blockedByLabel }: { message: string; blockedByLabel: string | null }) {
  function useDesktop(to: string) {
    document.cookie = "dgx-desktop=1; path=/; max-age=31536000";
    window.location.href = to;
  }
  return (
    <div className="px-6 py-10 max-w-md mx-auto text-center" role="status" aria-label="Mobile access is not included">
      <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center text-2xl" aria-hidden>📱</div>
      <h1 className="text-lg font-semibold text-gray-900 mb-2">Mobile access isn’t in your plan</h1>
      <p className="text-sm text-gray-600 mb-6">
        {message}
        {blockedByLabel ? " Upgrade to a plan that includes it to use Diagramatix on your phone." : " Upgrade to use Diagramatix on your phone."}
      </p>
      <button onClick={() => useDesktop("/pricing")}
        className="w-full h-11 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-700 mb-3">
        See plans and upgrade
      </button>
      <button onClick={() => useDesktop("/dashboard?desktop=1")}
        className="w-full h-11 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium active:bg-gray-50">
        Use the desktop version
      </button>
    </div>
  );
}
