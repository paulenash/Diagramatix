import { MobileProjectClient } from "./MobileProjectClient";

// Project screen — diagram list + Create Diagram (steps 3, 4, 12).
export default async function MobileProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MobileProjectClient projectId={id} />;
}
