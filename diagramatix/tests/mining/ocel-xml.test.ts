/**
 * OCEL 2.0 XML import: the XML serialization parses to the same object-centric
 * model as OCEL 2.0 JSON (per-type projections, status-attribute states, O2O +
 * interactions), so the whole study pipeline works from an .xml log too.
 */
import { describe, it, expect } from "vitest";
import { parseOcelObjectCentric } from "@/app/lib/mining/formats/ocel";
import { buildOcelStudy } from "@/app/lib/mining/ocelStudy";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

const OCEL_XML = `<?xml version='1.0' encoding='UTF-8'?>
<log>
  <object-types>
    <object-type name="order"><attributes><attribute name="status" type="string"/></attributes></object-type>
    <object-type name="item"><attributes><attribute name="status" type="string"/></attributes></object-type>
  </object-types>
  <event-types>
    <event-type name="place order"><attributes/></event-type>
    <event-type name="ship order"><attributes/></event-type>
  </event-types>
  <objects>
    <object id="o1" type="order">
      <attributes>
        <attribute name="status" time="2023-01-01T09:00:00">placed</attribute>
        <attribute name="status" time="2023-01-01T11:00:00">shipped</attribute>
      </attributes>
      <objects>
        <relationship object-id="i1" qualifier="comprises"/>
      </objects>
    </object>
    <object id="i1" type="item">
      <attributes>
        <attribute name="status" time="2023-01-01T09:00:00">ordered</attribute>
      </attributes>
      <objects/>
    </object>
  </objects>
  <events>
    <event id="e1" type="place order" time="2023-01-01T09:00:00">
      <objects>
        <relationship object-id="o1" qualifier="order"/>
        <relationship object-id="i1" qualifier="item"/>
      </objects>
      <attributes/>
    </event>
    <event id="e2" type="ship order" time="2023-01-01T11:00:00">
      <objects>
        <relationship object-id="o1" qualifier="order"/>
      </objects>
      <attributes/>
    </event>
  </events>
</log>`;

describe("OCEL 2.0 XML import (T0694)", () => {
  const oc = parseOcelObjectCentric(OCEL_XML);

  it("parses XML into the same object-centric model as JSON", () => {
    expect(Object.keys(oc.perType).sort()).toEqual(["item", "order"]);
    expect(oc.perType.order.stateAttr).toBe("status");
    expect(oc.perType.order.cases).toBe(1);
    expect(oc.o2o).toEqual([{ fromType: "order", toType: "item", qualifier: "comprises", count: 1 }]);
    expect(oc.interactions.find((i) => i.count === 1 && (i.typeA === "item" || i.typeB === "item"))).toBeTruthy();
  });

  it("derives status states (Capitalised) and mines a lifecycle per type", () => {
    const order = oc.perType.order;
    const log = buildEventLog(order.headers, order.rows, order.mapping as LogMapping);
    expect(log.variants[0].states).toEqual(["Placed", "Shipped"]);
    const study = buildOcelStudy(OCEL_XML);
    expect(study.types.map((t) => t.objectType).sort()).toEqual(["item", "order"]);
    expect(study.types.find((t) => t.objectType === "order")!.smData.elements.some((e) => e.type === "state")).toBe(true);
  });
});
