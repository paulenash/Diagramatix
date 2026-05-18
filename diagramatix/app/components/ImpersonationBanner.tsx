"use client";

import { useRouter } from "next/navigation";

interface Props {
  viewingAsName: string;
  viewingAsEmail: string;
  mode?: "view" | "edit";
}

export function ImpersonationBanner({ viewingAsName, viewingAsEmail, mode = "view" }: Props) {
  const router = useRouter();
  void router;

  async function handleReturn() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    // Hard navigation ensures the server sees the cleared cookie
    window.location.href = "/dashboard";
  }

  const displayName = viewingAsName || viewingAsEmail || "another user";
  const isEdit = mode === "edit";
  const bg = isEdit ? "bg-red-600" : "bg-orange-400";
  const btnText = isEdit ? "text-red-700" : "text-orange-700";
  const btnHover = isEdit ? "hover:bg-red-50" : "hover:bg-orange-50";

  return (
    <div className={`${bg} text-white px-4 py-2 flex items-center justify-between text-sm font-medium`}>
      <span>
        {isEdit ? "EDITING AS " : "Viewing as "}
        <strong>{displayName}</strong>
        {viewingAsEmail && viewingAsName ? ` (${viewingAsEmail})` : ""}
        {isEdit ? " \u2014 changes will SAVE to their account" : " \u2014 Read Only"}
      </span>
      <button
        onClick={handleReturn}
        className={`bg-white ${btnText} px-3 py-1 rounded text-xs font-semibold ${btnHover}`}
      >
        Return to my account
      </button>
    </div>
  );
}
