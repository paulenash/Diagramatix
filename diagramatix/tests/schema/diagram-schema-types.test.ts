/**
 * DRIFT GUARD (type-level). The Zod schema in diagramSchema.ts is a PARALLEL
 * mirror of types.ts. These assertions require the schema's KEY SET to equal each
 * interface's — add a field to types.ts (or the schema) and not the other and
 * `tsc --noEmit` fails, forcing the two back in sync. (Field VALUE types are
 * intentionally relaxed to string for enums, so we compare key sets, not value
 * types — enum additions must never trip this.)
 */
import { describe, it, expectTypeOf } from "vitest";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import type { InferredDiagramData, InferredDiagramElement, InferredConnector } from "@/app/lib/diagram/diagramSchema";

describe("diagram schema drift guard", () => {
  it("DiagramElement key set is in sync", () => {
    expectTypeOf<keyof InferredDiagramElement>().toEqualTypeOf<keyof DiagramElement>();
  });
  it("Connector key set is in sync", () => {
    expectTypeOf<keyof InferredConnector>().toEqualTypeOf<keyof Connector>();
  });
  it("DiagramData key set is in sync", () => {
    expectTypeOf<keyof InferredDiagramData>().toEqualTypeOf<keyof DiagramData>();
  });
});
