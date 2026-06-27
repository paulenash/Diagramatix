/**
 * Visio export — golden structural snapshots (layer 3).
 *
 * Snapshots a stable, normalised structural projection of the exported page for
 * a few canonical diagrams (incl. a Pool/Lane one). The BPMN layout is
 * deterministic, so the projection is stable run-to-run; any export change shows
 * a reviewable diff — catching collateral damage the topology invariants (layer
 * 2) don't: a master swap, a renamed shape, a moved/resized shape, an extra
 * sub-shape. Intentional changes: re-bless with `npx vitest -u`.
 */
import { describe, it, expect } from "vitest";
import { exportToVsdx, type ParsedVsdx } from "./_helpers/vsdx";
import { build, scenario } from "./_helpers/scenarios";
import type { DiagramData } from "@/app/lib/diagram/types";

// Canonical subset — small + meaningful; a Pool/Lane one is essential.
const GOLDEN = ["linear flow", "pool with two lanes", "expanded subprocess with internals"];

const round2 = (v: string | null) => (v == null ? null : Math.round(parseFloat(v) * 100) / 100);

/**
 * A stable, meaningful structural projection:
 *  - byId: every shape tagged with a diagram id (elements + connectors) →
 *          its master / NameU / rounded geometry, sorted by id (ids are unique).
 *  - summary: total shapes, tagged vs untagged sub-shape counts, and the set of
 *          masters used. Folds the many anonymous sub-shapes into counts so a
 *          replication / extra-shape regression still moves the snapshot.
 */
function projection(parsed: ParsedVsdx, data: DiagramData) {
  const typeOf = new Map(data.elements.map((e) => [e.id, e.type as string]));
  const tagged = parsed.shapes.filter((s) => s.bpmnId) as (ParsedVsdx["shapes"][number] & { bpmnId: string })[];
  const byId = tagged
    .map((s) => ({
      id: s.bpmnId,
      type: typeOf.get(s.bpmnId) ?? "connector",
      master: s.master,
      nameU: s.nameU,
      geom: { x: round2(s.pinX), y: round2(s.pinY), w: round2(s.width), h: round2(s.height) },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const masters = [...new Set(parsed.shapes.map((s) => s.master).filter(Boolean))].sort();
  return {
    byId,
    summary: {
      totalShapes: parsed.shapes.length,
      taggedShapes: tagged.length,
      subShapes: parsed.shapes.length - tagged.length,
      masters,
    },
  };
}

describe("Visio export — golden structural snapshots", () => {
  for (const name of GOLDEN) {
    it(name, async () => {
      const data = build(scenario(name));
      const parsed = await exportToVsdx(data);
      expect(projection(parsed, data)).toMatchSnapshot();
    });
  }
});
