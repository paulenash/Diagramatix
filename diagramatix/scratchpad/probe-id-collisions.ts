/** Do the other layouts collide when two connectors join the same pair? */
import { layoutGenericDiagram } from "../app/lib/diagram/genericLayout";
import type { DiagramData } from "../app/lib/diagram/types";

const cases: { type: string; plan: unknown }[] = [
  { type: "flowchart", plan: { elements: [
      { id: "a", type: "process", label: "A" }, { id: "b", type: "process", label: "B" }],
    connections: [{ sourceId: "a", targetId: "b", label: "yes" }, { sourceId: "a", targetId: "b", label: "no" }] } },
  { type: "state-machine", plan: { elements: [
      { id: "a", type: "state", label: "A" }, { id: "b", type: "state", label: "B" }],
    connections: [{ sourceId: "a", targetId: "b", type: "transition", label: "x" }, { sourceId: "a", targetId: "b", type: "transition", label: "y" }] } },
  { type: "archimate", plan: { elements: [
      { id: "a", type: "business-actor", label: "A" }, { id: "b", type: "business-role", label: "B" }],
    connections: [{ sourceId: "a", targetId: "b", type: "assignment" }, { sourceId: "a", targetId: "b", type: "association" }] } },
];

for (const c of cases) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = layoutGenericDiagram(c.plan as any, c.type as any) as DiagramData;
    const ids = d.connectors.map((x) => x.id);
    const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
    console.log(`${c.type.padEnd(15)} connectors ${ids.length}   duplicate ids: ${dup.length ? dup.join(", ") : "(none)"}`);
  } catch (e) {
    console.log(`${c.type.padEnd(15)} threw: ${(e as Error).message.slice(0, 60)}`);
  }
}
