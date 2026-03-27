"use client";

import { useRouter } from "next/navigation";

interface Props {
  viewingAsName: string;
  viewingAsEmail: string;
}

export function ImpersonationBanner({ viewingAsName, viewingAsEmail }: Props) {
  const router = useRouter();

  async function handleReturn() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    router.push("/dashboard");
    router.refresh();
  }

  const displayName = viewingAsName || viewingAsEmail || "another user";

  return (
    <div className="bg-orange-400 text-white px-4 py-2 flex items-center justify-between text-sm font-medium">
      <span>
        Viewing as <strong>{displayName}</strong>
        {viewingAsEmail && viewingAsName ? ` (${viewingAsEmail})` : ""}
        {" \u2014 Read Only"}
      </span>
      <button
        onClick={handleReturn}
        className="bg-white text-orange-700 px-3 py-1 rounded text-xs font-semibold hover:bg-orange-50"
      >
        Return to my account
      </button>
    </div>
  );
}
