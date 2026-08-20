import fs from "fs";
import { layoutBpmnDiagram, AiElement, AiConnection } from "../app/lib/diagram/bpmnLayout";
const j = JSON.parse(fs.readFileSync("C:/Users/paul/Downloads/Procure to Pay.diagramatix.json","utf8"));
const d = (j.diagrams&&j.diagrams[0]?.data)||j.data||j;
const laneToPool = new Map<string,string>();
for(const e of d.elements) if(e.type==="lane") laneToPool.set(e.id, e.parentId);
const aiEls: AiElement[] = d.elements.filter((e:any)=>e.type!=="text-annotation").map((e:any)=>{
  const b:any={id:e.id,type:e.type,label:e.label??"",gatewayType:e.gatewayType??e.properties?.gatewayType,eventType:e.eventType??e.properties?.eventType,properties:e.properties};
  if(e.type==="pool"){b.poolType=e.properties?.poolType;b.isSystem=e.properties?.isSystem;const ln=d.elements.filter((x:any)=>x.type==="lane"&&x.parentId===e.id).map((x:any)=>({id:x.id,name:x.label}));if(ln.length)b.lanes=ln;}
  if(e.type==="lane")b.parentPool=e.parentId;
  const host=e.boundaryHostId||e.properties?.boundaryHostId;
  if(host){b.boundaryHost=host;b.boundarySide=e.properties?.boundarySide||e.boundarySide||"top";}
  else if(e.parentId){ if(e.type==="lane"){} else if(["task","gateway","start-event","end-event","intermediate-event","subprocess","subprocess-expanded","data-object","data-store"].includes(e.type)){const par=d.elements.find((x:any)=>x.id===e.parentId); if(par?.type==="subprocess-expanded")b.parentSubprocess=e.parentId; else {b.lane=e.parentId;b.pool=laneToPool.get(e.parentId);}}}
  return b;
});
const aiConns: AiConnection[]=d.connectors.map((c:any)=>({sourceId:c.sourceId,targetId:c.targetId,label:c.label,type:(c.type==="messageBPMN"||c.type==="message")?"message":"sequence"}));
const out=layoutBpmnDiagram(aiEls,aiConns);
const byId=new Map(out.elements.map(e=>[e.id,e]));
for(const be of out.elements.filter(e=>e.boundaryHostId)){
  const h=byId.get(be.boundaryHostId!)!;
  const cx=be.x+be.width/2, cy=be.y+be.height/2;
  console.log(`EMIE "${(be.label||"").replace(/\n/g," ")}" side=${(be.properties as any)?.boundarySide} labelOff=(${(be.properties as any)?.labelOffsetX},${(be.properties as any)?.labelOffsetY})`);
  console.log(`  host EP wh=${h.width.toFixed(0)}x${h.height.toFixed(0)} corner dist: L=${(cx-h.x).toFixed(0)} R=${(h.x+h.width-cx).toFixed(0)} T=${(cy-h.y).toFixed(0)} B=${(h.y+h.height-cy).toFixed(0)}`);
  const conn=out.connectors.find(c=>c.sourceId===be.id);
  if(conn){const wp=(conn as any).waypoints||[]; console.log(`  outgoing srcSide=${(conn as any).sourceSide} first2wp=${JSON.stringify(wp.slice(0,2))} evTop=${be.y}`);}
}
