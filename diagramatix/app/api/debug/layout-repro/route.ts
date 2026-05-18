// TEMP debug endpoint — runs the BPMN layout on the AI-generated plan
// from the 2026-05-18 lane-fill regression and returns the pool/lane
// geometry so we can see where the gap is. Restricted to paul.
// Delete this file once the bug is fixed.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const PLAN_JSON = `{
  "elements": [
    { "id": "pCustomer", "type": "pool", "label": "Customer", "poolType": "black-box", "isSystem": false },
    { "id": "pMain", "type": "pool", "label": "Company", "poolType": "white-box" },
    { "id": "lFrontOffice", "type": "lane", "label": "Front Office", "parentPool": "pMain", "pool": "pMain" },
    { "id": "lRegistration", "type": "lane", "label": "Registration Team", "parentPool": "pMain", "pool": "pMain" },
    { "id": "pITRegister", "type": "pool", "label": "IT Register System", "poolType": "black-box", "isSystem": true },
    { "id": "eStart", "type": "start-event", "label": "Start", "pool": "pMain", "lane": "lFrontOffice" },
    { "id": "tAcknowledge", "type": "task", "label": "Ack", "taskType": "send", "pool": "pMain", "lane": "lFrontOffice" },
    { "id": "tForward", "type": "task", "label": "Forward", "taskType": "user", "pool": "pMain", "lane": "lFrontOffice" },
    { "id": "spProcess", "type": "subprocess-expanded", "label": "Process Registration", "pool": "pMain", "lane": "lRegistration" },
    { "id": "spStart", "type": "start-event", "label": "Start", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "tScanName", "type": "task", "label": "Scan Name", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "tSaveNameIT", "type": "task", "label": "Save Name", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "tResidential", "type": "task", "label": "Residential", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "tWork", "type": "task", "label": "Work", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "gwHoliday", "type": "gateway", "label": "Holiday?", "gatewayType": "exclusive", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "tHoliday", "type": "task", "label": "Holiday", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "gwMerge", "type": "gateway", "label": "Merge", "gatewayType": "exclusive", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "tSaveAddressIT", "type": "task", "label": "Save Address", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "spEnd", "type": "end-event", "label": "End", "pool": "pMain", "parentSubprocess": "spProcess" },
    { "id": "eEnd", "type": "end-event", "label": "End", "pool": "pMain", "lane": "lRegistration" }
  ],
  "connections": []
}`;

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== "paul@nashcc.com.au") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const plan = JSON.parse(PLAN_JSON);
  const out = layoutBpmnDiagram(plan.elements as AiElement[], plan.connections as AiConnection[]);
  const interesting = out.elements
    .filter(e => e.type === "pool" || e.type === "lane" || e.id === "spProcess")
    .map(e => ({
      id: e.id, type: e.type, parentId: e.parentId ?? null,
      x: e.x, y: e.y, width: e.width, height: e.height,
    }));
  // Compute invariants
  const invariants: string[] = [];
  for (const pool of out.elements.filter(e => e.type === "pool")) {
    const lanes = out.elements
      .filter(e => e.type === "lane" && e.parentId === pool.id)
      .sort((a, b) => a.y - b.y);
    if (lanes.length === 0) continue;
    const sumH = lanes.reduce((s, l) => s + l.height, 0);
    invariants.push(`Pool ${pool.id} h=${pool.height} sum(lane.h)=${sumH} ${sumH === pool.height ? "OK" : "MISMATCH"}`);
    for (let i = 0; i < lanes.length; i++) {
      const l = lanes[i];
      const expectedY = i === 0 ? pool.y : lanes[i - 1].y + lanes[i - 1].height;
      invariants.push(`  ${l.id} y=${l.y} expY=${expectedY} ${l.y === expectedY ? "OK" : "STACK GAP"}  w=${l.width} pool.w-36=${pool.width - 36} ${l.width === pool.width - 36 ? "OK" : "WIDTH MISMATCH"}`);
    }
  }
  return NextResponse.json({ geometry: interesting, invariants });
}
