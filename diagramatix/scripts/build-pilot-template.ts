/**
 * Builds the pilot prompt template Paul sends GETAI (review of 2026-09-01).
 *
 * Boroon fills it with 5-10 mock processes; Paul runs them and returns the
 * generated output in both BPMN XML and JSON, plus timings, via GETAI's OneDrive.
 *
 *   npx tsx scripts/build-pilot-template.ts ["<output.xlsx>"]
 *
 * Three sheets, and the split is deliberate: the sheet to FILL carries nothing
 * but what is being asked for, so it is obvious what to do with it; the notes and
 * the worked example sit beside it rather than in it, where they would be deleted
 * along with the sample rows.
 */
import fs from "node:fs";
import { buildXlsx, type Sheet } from "../app/lib/riskControls/xlsx";

const HEADERS = [
  "Prompt ID",
  "Mock customer",
  "Process name",
  "Process description",
  "Additional instructions (optional)",
  "Notes / what you expect",
];

/** One filled row, so the shape of a good description is visible rather than described. */
const EXAMPLE = [
  "P-001",
  "Northwind Utilities",
  "Invoice approval",
  "The accounts payable clerk receives the supplier invoice by email and checks it "
    + "against the purchase order in the ERP. If it matches and is under $5,000 the clerk "
    + "approves it. Anything over $5,000 goes to the finance approver, who either approves "
    + "it or sends it back to the clerk with a query. Once approved, finance schedules the "
    + "payment in the ERP and the supplier is notified.",
  "Keep this at a high level. Do not decompose to detailed-design depth.",
  "Expect two lanes (Accounts Payable, Finance Approver), one decision on the $5,000 "
    + "threshold, and a loop back to the clerk on a query.",
];

const sheets: Sheet[] = [
  {
    name: "Prompts",
    rows: [HEADERS, EXAMPLE, ...Array.from({ length: 12 }, () => Array(HEADERS.length).fill(""))],
  },
  {
    name: "How to fill this in",
    rows: [
      ["Diagramatix Process API — pilot prompt template"],
      ["Version 1 · 1 September 2026"],
      [],
      ["Fill the Prompts sheet with 5–10 processes. Row 2 is a worked example — overwrite or delete it."],
      ["Send the file back and we return, for each row: the generated diagram as BPMN 2.0 XML and as JSON, the rendered diagram, and how long the run took."],
      [],
      ["Column", "What to put in it"],
      ["Prompt ID", "Any unique reference — P-001, P-002. It is how we refer to a specific result when discussing which ones worked."],
      ["Mock customer", "A made-up customer name, so a set of prompts can be talked about as a group. Not sent to the model and not needed by the API."],
      ["Process name", "What the process is called. Names the diagram. Optional but useful."],
      ["Process description", "THE IMPORTANT ONE. Prose describing the process — see the guidance below."],
      ["Additional instructions (optional)", "Free text appended to the prompt, e.g. 'keep this at a high level'. Leave blank if none."],
      ["Notes / what you expect", "For us, not the model. What a good result would look like, so we can judge the output against your intent rather than ours."],
      [],
      ["What makes a good description"],
      ["Say WHO does each step. Unnamed performers are the single biggest cause of a weak map — everything lands in one lane and any role analysis comes back empty."],
      ["Put the steps in the order they happen. A description written in process order maps markedly better than free association."],
      ["Name the systems that are touched, if any. They become separate pools."],
      ["Say what the decisions are and what happens on each branch."],
      ["Say where work passes between people or teams."],
      [],
      ["Worth knowing before you judge the results"],
      ["The structure — pools, lanes, ordered activities, decisions, handoffs — is the dependable part, and is what to score from."],
      ["The DIAGRAM's layout is roughly 90% of what a person would draw and usually wants a few minutes' tidying before it goes to a client."],
      ["If a team is not named in the description, a plausible name is invented. It may not be the customer's real one."],
      ["Volumetrics (minutes per run, runs per month) are NOT part of phase 1 — that arithmetic stays in your application. There is no column for them here."],
    ],
  },
  {
    name: "What comes back",
    rows: [
      ["For each row in the Prompts sheet we return:"],
      [],
      ["Artifact", "Format", "What it is for"],
      ["diagram.bpmn", "BPMN 2.0 XML", "The recommended basis for your deterministic scoring. An OMG standard, so it does not depend on our document shape."],
      ["diagram.json", "JSON", "The same diagram in Diagramatix's own structure. Convenient, but ours — it can change as the product does."],
      ["diagram.pdf / .svg", "PDF / SVG", "The rendered diagram, for looking at."],
      ["Structured result", "JSON", "Pools and lanes, the ordered activities with performer / systems / inputs / outputs, decisions, handoffs, and any warnings."],
      ["Timings", "JSON", "How long the run took, and how long each stage took. There is no way to predict a run in advance — only to measure it."],
      [],
      ["Delivered as a zip, or placed in GETAI's OneDrive, whichever suits."],
    ],
  },
];

const out = process.argv[2]
  ?? "new features/getai-api/Diagramatix Process API - pilot prompt template.xlsx";

buildXlsx(sheets)
  .then((buf) => {
    fs.writeFileSync(out, buf);
    console.log("written: " + out + "  (" + buf.length + " bytes, " + sheets.length + " sheets)");
  })
  .catch((e) => { console.error(e); process.exit(1); });
