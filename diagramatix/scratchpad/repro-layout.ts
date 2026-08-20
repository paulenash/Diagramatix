import fs from "fs";
import { layoutBpmnDiagram, AiElement, AiConnection } from "../app/lib/diagram/bpmnLayout";

const j = JSON.parse(fs.readFileSync("C:/Users/paul/Downloads/New Local AI Test - First Simple Local.json","utf8"));
const d = j.diagrams[0].data;
const src = new Map<string,any>(d.elements.map((e:any)=>[e.id,e]));
// build lane->pool + element->lane/pool maps from parentId chain
const laneToPool = new Map<string,string>();
for(const e of d.elements) if(e.type==="lane") laneToPool.set(e.id, e.parentId);

const aiEls: AiElement[] = d.elements.filter((e:any)=>e.type!=="text-annotation").map((e:any)=>{
  const base:any = { id:e.id, type:e.type, label:e.label??"",
    gatewayType:e.gatewayType??e.properties?.gatewayType,
    eventType:e.eventType??e.properties?.eventType,
    properties:e.properties };
  if(e.type==="pool"){ base.poolType = e.properties?.poolType; base.isSystem = e.properties?.isSystem; 
    // gather lanes
    const lanes = d.elements.filter((x:any)=>x.type==="lane"&&x.parentId===e.id).map((x:any)=>({id:x.id,name:x.label}));
    if(lanes.length) base.lanes = lanes;
  }
  if(e.type==="lane"){ base.parentPool = e.parentId; }
  // node in a lane
  if(["task","gateway","start-event","end-event","intermediate-event","subprocess","subprocess-expanded","data-object","data-store"].includes(e.type)){
    if(e.parentId){ base.lane = e.parentId; base.pool = laneToPool.get(e.parentId); }
  }
  return base;
});
const aiConns: AiConnection[] = d.connectors.map((c:any)=>({
  sourceId:c.sourceId, targetId:c.targetId, label:c.label,
  type:(c.type==="messageBPMN"||c.type==="message")?"message":"sequence",
}));

const out = layoutBpmnDiagram(aiEls, aiConns);
const lanesOut = out.elements.filter(e=>e.type==="lane").map(l=>`${l.label}(cy=${l.y+l.height/2})`).join(" ");
console.log("lanes:", lanesOut);
console.log("=== gateways ===");
for(const g of out.elements.filter(e=>e.type==="gateway"))
  console.log(`  "${(g.label||"(none)").replace(/\n/g," ")}" role=${(g.properties as any)?.gatewayRole||"-"} parent=${g.parentId} x=${g.x} cy=${g.y+g.height/2}`);
console.log("=== branch tasks ===");
for(const t of out.elements.filter(e=>["Process Sales Enquiry","Process Invoice Payment","Handle General Enquiry","Send Response Email"].includes(e.label||"")))
  console.log(`  "${t.label}" parent=${t.parentId} x=${t.x} cy=${t.y+t.height/2}`);
