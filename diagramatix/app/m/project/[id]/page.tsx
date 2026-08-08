import { MobileProjectPlaceholder } from "./MobileProjectPlaceholder";

// Slice 1 stub — the diagram list + create + viewer land here in slice 2.
export default async function MobileProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MobileProjectPlaceholder projectId={id} />;
}
