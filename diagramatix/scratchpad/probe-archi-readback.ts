/** Does the redrawn operating model read back as intended? */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { skillsFromArchimate, matchSkills } from "../app/lib/simulation/skillsFromArchimate";
import type { DiagramData } from "../app/lib/diagram/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const companion = pkg.diagrams.find((d) => d.key === "hire-operating-model")!;
const m = skillsFromArchimate(companion.data as DiagramData);

console.log("pattern:", m.pattern);
console.log("teams:  ", m.teams.map((t) => `${t.name}(${t.members.length})`).join(", "));
console.log("people: ", m.people.length);
console.log("skills: ", m.skills.join(", "));
console.log("accredited:", m.people.filter((p) => p.skills.includes("Compliance Accreditation")).map((p) => p.name).join(", "));
console.log("posts held:", m.people.filter((p) => p.roles.length).map((p) => `${p.name}→${p.roles.join("/")}`).join(", "));
console.log("warnings:", m.warnings.length ? m.warnings.join(" | ") : "(none)");

const memberNames = pkg.teams.flatMap((t) => (t.members ?? []).map((x) => x.name));
const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const taskLabels = [...new Set((root.data as DiagramData).elements.filter((e) => e.type === "task").map((e) => (e.label ?? "").trim()))];
const match = matchSkills(m, memberNames, taskLabels);
console.log("\nmatched units:", match.units.length, "of", memberNames.length);
console.log("unmatchedActors:", match.unmatchedActors);
console.log("unmatchedMembers:", match.unmatchedMembers);
console.log("taskSkills:", Object.keys(match.taskSkills).length);
