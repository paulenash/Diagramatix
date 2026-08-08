import { MobileDiagramScreen } from "./MobileDiagramScreen";

// View a diagram — read-only pan/zoom (steps 9, 12).
export default async function MobileDiagramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MobileDiagramScreen diagramId={id} />;
}
