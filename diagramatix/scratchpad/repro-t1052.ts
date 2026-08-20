import { layoutBpmnDiagram, AiElement, AiConnection } from "../app/lib/diagram/bpmnLayout";
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "ep", type: "subprocess-expanded", label: "Do Until Done", pool: "p", repeatType: "loop" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "work", type: "task", label: "Await Response", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "tb", type: "intermediate-event", label: "10 working days elapsed", eventType: "timer", boundaryHost: "work", boundarySide: "top" },
  { id: "lapse", type: "end-event", label: "Lapse Application", pool: "p" },
  { id: "e", type: "end-event", label: "Done", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
  { sourceId: "es", targetId: "work" }, { sourceId: "work", targetId: "ee" },
  { sourceId: "tb", targetId: "lapse" },
];
const out = layoutBpmnDiagram(els, conns);
const at=(id:string)=>out.elements.find(e=>e.id===id)!;
const ep=at("ep"),tb=at("tb"),lapse=at("lapse");
console.log(`EP: x=${ep.x.toFixed(0)} y=${ep.y.toFixed(0)} w=${ep.width.toFixed(0)} h=${ep.height.toFixed(0)} -> right=${(ep.x+ep.width).toFixed(0)} bottom=${(ep.y+ep.height).toFixed(0)}`);
console.log(`timer tb: cx=${(tb.x+tb.width/2).toFixed(0)} cy=${(tb.y+tb.height/2).toFixed(0)} side=${(tb.properties as any)?.boundarySide} host=${tb.boundaryHostId}`);
console.log(`lapse: x=${lapse.x.toFixed(0)} y=${lapse.y.toFixed(0)} w=${lapse.width} h=${lapse.height} -> right=${(lapse.x+lapse.width).toFixed(0)} bottom=${(lapse.y+lapse.height).toFixed(0)}`);
const fullyOutside = (lapse.x+lapse.width <= ep.x) || (lapse.x >= ep.x+ep.width) || (lapse.y+lapse.height <= ep.y) || (lapse.y >= ep.y+ep.height);
console.log("lapse fully outside EP:", fullyOutside);
const conn=out.connectors.find(c=>c.sourceId==="tb"&&c.targetId==="lapse")!;
const insideEp=(p:any)=>p.x>ep.x+1&&p.x<ep.x+ep.width-1&&p.y>ep.y+1&&p.y<ep.y+ep.height-1;
console.log("connector wps:", JSON.stringify(conn.waypoints.map((w:any)=>({x:Math.round(w.x),y:Math.round(w.y)}))));
console.log("any wp inside EP:", conn.waypoints.some(insideEp));
const near=Math.hypot((lapse.x+lapse.width/2)-(tb.x+tb.width/2),(lapse.y+lapse.height/2)-(tb.y+tb.height/2));
console.log("lapse-timer dist:", near.toFixed(0));
