/** Does a plan whose connections omit `type` get its transitions added back twice? */
import { reconcileStateMachineCoverage } from "../app/lib/mining/stateMachineCoverage";

const variants = [{ states: ["Draft", "Approved"], events: ["Receive Order", "Approve"], count: 5 }] as never[];

const withType = {
  elements: [{ id: "s1", type: "state", label: "Draft" }, { id: "s2", type: "state", label: "Approved" }],
  connections: [{ sourceId: "s1", targetId: "s2", label: "Approve", type: "transition" }],
};
const withoutType = {
  elements: [{ id: "s1", type: "state", label: "Draft" }, { id: "s2", type: "state", label: "Approved" }],
  connections: [{ sourceId: "s1", targetId: "s2", label: "Approve" }],
};

for (const [name, plan] of [["type: transition", withType], ["no type field", withoutType]] as const) {
  const out = reconcileStateMachineCoverage(JSON.parse(JSON.stringify(plan)), variants);
  const pairs = out.connections.map((c) => `${c.sourceId}→${c.targetId}`);
  const dupes = pairs.filter((v, i) => pairs.indexOf(v) !== i);
  console.log(`${name.padEnd(18)} connections: ${out.connections.length}   duplicated pairs: ${dupes.length ? [...new Set(dupes)].join(", ") : "(none)"}`);
}
