/**
 * Domain (UML class) Visio export — GEOMETRY SIMULATION.
 *
 * Computes each shape's painted bounding box from its ShapeSheet cells
 * (PinX/PinY/LocPinX/LocPinY/Width/Height + the MS6 body geometry) and asserts
 * the invariants that must hold for Visio to render the class correctly —
 * WITHOUT opening Visio:
 *   1. Selection box (group Width×Height) == visual box (MS6 body) — so the
 *      handles hug the drawn shape.
 *   2. Every member/separator sits fully inside its class box.
 *   3. Members stack in order with no overlap and no gaps beyond the pitch.
 *   4. The title divider is above the first member (header doesn't eat a row).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { exportVisioDomainV3 } from "@/app/lib/diagram/v3/exportVisioDomainV3";
import { domainProfile } from "@/app/lib/diagram/v3/stencilProfile";
import type { DiagramData } from "@/app/lib/diagram/types";

const tmpl = () => fs.readFileSync(path.join(process.cwd(), "public", domainProfile.templateFile)).buffer;

function topShapes(xml: string): string[] {
  const s = xml.indexOf("<Shapes>") + 8;
  let e = xml.indexOf("</Shapes><Connects");
  if (e < 0) e = xml.lastIndexOf("</Shapes>");
  const body = xml.slice(s, e);
  const re = /<Shape\b[^>]*?(\/?)>|<\/Shape>/g;
  let d = 0, cur = 0, m: RegExpExecArray | null; const out: string[] = [];
  while ((m = re.exec(body)) !== null) {
    if (m[0] === "</Shape>") { d--; if (d === 0) out.push(body.slice(cur, m.index + 8)); }
    else if (m[1] === "/") { if (d === 0) out.push(m[0]); }
    else { if (d === 0) cur = m.index; d++; }
  }
  return out;
}
const cv = (b: string, name: string): number | undefined => {
  const m = b.match(new RegExp(`<Cell N='${name}' V='([^']*)'`));
  return m ? parseFloat(m[1]) : undefined;
};
const attr = (b: string, name: string) => (b.match(new RegExp(`\\b${name}='([^']*)'`)) || [])[1];
const text = (b: string) => { const m = b.match(/<Text>([\s\S]*?)<\/Text>/); return m ? m[1].trim() : ""; };
/** Painted box of a shape in page coords: left/right/bottom/top (inches). */
function box(b: string) {
  const pinX = cv(b, "PinX")!, pinY = cv(b, "PinY")!;
  const w = cv(b, "Width") ?? 0, h = cv(b, "Height") ?? 0.1667;
  const locX = cv(b, "LocPinX") ?? w / 2, locY = cv(b, "LocPinY") ?? h / 2;
  return { left: pinX - locX, right: pinX - locX + w, bottom: pinY - locY, top: pinY - locY + h, w, h, pinX, pinY };
}
/** Extract MS6 body sub-shape block from a class group. */
function ms6(group: string): string | null {
  const i = group.indexOf("MasterShape='6'");
  if (i < 0) return null;
  const s = group.lastIndexOf("<Shape", i);
  let d = 0; const re = /<Shape\b[^>]*?(\/?)>|<\/Shape>/g; re.lastIndex = s; let m: RegExpExecArray | null;
  while ((m = re.exec(group)) !== null) {
    if (m[0] === "</Shape>") { d--; if (d === 0) return group.slice(s, m.index + 8); }
    else if (m[1] !== "/") d++;
  }
  return null;
}

const APPROX = 0.02; // 0.02" tolerance

const DATA: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "c1", type: "uml-class", x: 60, y: 80, width: 230, height: 150, label: "Customer",
      properties: { showAttributes: true, showOperations: true,
        attributes: [ { visibility: "+", name: "id", type: "Integer" }, { visibility: "+", name: "name", type: "String" }, { visibility: "-", name: "email", type: "String", multiplicity: "0..1" } ],
        operations: [ { visibility: "+", name: "rename" }, { visibility: "+", name: "deactivate" } ] } },
    { id: "c3", type: "uml-class", x: 460, y: 360, width: 230, height: 120, label: "OrderLine",
      properties: { showAttributes: true, attributes: [ { visibility: "+", name: "qty", type: "Integer" }, { visibility: "+", name: "price", type: "Decimal" } ] } },
    { id: "e1", type: "uml-enumeration", x: 60, y: 360, width: 200, height: 120, label: "OrderStatus",
      properties: { values: ["Pending", "Shipped", "Delivered"] } },
  ],
  connectors: [
    { id: "a1", sourceId: "c1", targetId: "c3", sourceSide: "right", targetSide: "left", type: "uml-association", directionType: "non-directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [], sourceMultiplicity: "1", targetMultiplicity: "*" },
    { id: "d1", sourceId: "c1", targetId: "e1", sourceSide: "bottom", targetSide: "top", type: "uml-dependency", directionType: "open-directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] },
  ],
};

describe("domain Visio geometry simulation", () => {
  it("selection box == visual box, and members sit inside their class", async () => {
    const out = await exportVisioDomainV3(DATA, "Geo", tmpl());
    const page = await (await JSZip.loadAsync(out)).file("visio/pages/page1.xml")!.async("string");
    const shapes = topShapes(page);

    // 0. No duplicate shape IDs anywhere on the page — Visio silently DROPS
    //    shapes that collide on ID (this once made 4 of 5 connectors vanish).
    const allIds = [...page.matchAll(/<Shape [^>]*\bID='(\d+)'/g)].map(m => m[1]);
    const dupes = [...new Set(allIds.filter((v, i, a) => a.indexOf(v) !== i))];
    expect(dupes, `duplicate shape IDs: ${dupes.join(", ")}`).toEqual([]);

    const classes = shapes.filter(b => /NameU='(Class|Enumeration)'/.test(b) && attr(b, "Type") === "Group");
    expect(classes.length).toBe(3);

    for (const cls of classes) {
      const cid = attr(cls, "ID");
      const cbox = box(cls);

      // 1. Selection box == visual (MS6 body) box.
      const body = ms6(cls);
      expect(body, `class ${cid} has no MS6 body`).toBeTruthy();
      const bbox = box(body!);
      expect(Math.abs(bbox.w - cbox.w), `class ${cid}: MS6 width ${bbox.w} vs group ${cbox.w}`).toBeLessThan(APPROX);
      expect(Math.abs(bbox.h - cbox.h), `class ${cid}: MS6 height ${bbox.h} vs group ${cbox.h}`).toBeLessThan(APPROX);

      // 2 + 3. Members belong to this class → fully inside + ordered, no overlap.
      const members = shapes.filter(b => /NameU='(Member|Separator)'/.test(b) && b.includes(`DEPENDSON(5,Sheet.${cid}!`));
      let prevTop = Infinity;
      for (const mem of members) {
        const mb = box(mem);
        expect(mb.left, `member '${text(mem)}' left outside class ${cid}`).toBeGreaterThanOrEqual(cbox.left - APPROX);
        expect(mb.right, `member '${text(mem)}' right outside class ${cid}`).toBeLessThanOrEqual(cbox.right + APPROX);
        expect(mb.bottom, `member '${text(mem)}' below class ${cid}`).toBeGreaterThanOrEqual(cbox.bottom - APPROX);
        expect(mb.top, `member '${text(mem)}' above class ${cid}`).toBeLessThanOrEqual(cbox.top + APPROX);
        // stacking: each member's centre is below the previous (Visio Y-down list)
        expect(mb.pinY, `member '${text(mem)}' out of order in class ${cid}`).toBeLessThan(prevTop + APPROX);
        prevTop = mb.pinY;
      }

      // 4. Title divider (from MS6 geometry Y) is above the first member.
      const divY = parseFloat((body!.match(/<Row T='LineTo' IX='3'>[^<]*<Cell N='X'[^>]*\/><Cell N='Y' V='([^']*)'/) || [])[1] ?? "0");
      if (divY && members.length) {
        const firstMemberLocalY = box(members[0]).pinY - cbox.bottom; // member centre in group-local Y
        expect(firstMemberLocalY, `class ${cid}: first member (localY ${firstMemberLocalY.toFixed(3)}) not below divider ${divY.toFixed(3)}`).toBeLessThan(divY + APPROX);
      }
    }

    // 5. Every connector's cached Begin/End endpoint lands ON its source/target
    //    shape (so it renders attached on first paint, not floating).
    const boxById = new Map<string, ReturnType<typeof box>>();
    for (const cls of classes) boxById.set(attr(cls, "ID"), box(cls));
    const sheetByBpmn = new Map<string, string>();
    for (const sh of shapes) { const bp = (sh.match(/<Row N='BpmnId'><Cell N='Value' V='([^']*)'/) || [])[1]; if (bp) sheetByBpmn.set(bp, attr(sh, "ID")); }

    // Connectors carry a DgxUmlRel blob (class/enum endpoints now glue via
    // PAR(PNT(...Connections)) rather than _WALKGLUE, so filter by the blob).
    const conns = shapes.filter(b => /<Row N='DgxUmlRel'>/.test(b));
    expect(conns.length).toBe(2);
    const inside = (x: number, y: number, bx: ReturnType<typeof box>) =>
      x >= bx.left - APPROX && x <= bx.right + APPROX && y >= bx.bottom - APPROX && y <= bx.top + APPROX;
    for (const c of conns) {
      const bx = cv(c, "BeginX")!, by = cv(c, "BeginY")!, ex = cv(c, "EndX")!, ey = cv(c, "EndY")!;
      // find which class boxes contain the endpoints
      const begOnAShape = [...boxById.values()].some(bb => inside(bx, by, bb));
      const endOnAShape = [...boxById.values()].some(bb => inside(ex, ey, bb));
      expect(begOnAShape, `connector Begin (${bx.toFixed(2)},${by.toFixed(2)}) not on any class`).toBe(true);
      expect(endOnAShape, `connector End (${ex.toFixed(2)},${ey.toFixed(2)}) not on any class`).toBe(true);
    }
  });
});
