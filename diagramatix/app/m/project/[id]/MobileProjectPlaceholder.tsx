"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Slice 1 placeholder: confirms the project opened and navigation works. The
 *  diagram list / create / read-only viewer arrive in slice 2. */
export function MobileProjectPlaceholder({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setName(p?.name ?? "Project"))
      .catch(() => setName("Project"));
  }, [projectId]);

  return (
    <div className="p-4">
      <button onClick={() => router.push("/m")} className="text-blue-600 text-sm mb-3">‹ Projects</button>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">{name ?? "Loading…"}</h1>
      <p className="text-sm text-gray-500 mt-6 text-center">Diagrams for this project appear here (slice 2).</p>
    </div>
  );
}
