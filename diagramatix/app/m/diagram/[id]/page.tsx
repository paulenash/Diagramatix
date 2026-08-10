import { Suspense } from "react";
import { MobileDiagramScreen } from "./MobileDiagramScreen";

// View a diagram — read-only pan/zoom (steps 9, 12).
export default async function MobileDiagramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Suspense boundary required because MobileDiagramScreen reads useSearchParams (?from=…).
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading…</div>}>
      <MobileDiagramScreen diagramId={id} />
    </Suspense>
  );
}
