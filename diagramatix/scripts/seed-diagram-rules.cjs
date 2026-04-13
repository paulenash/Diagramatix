// Seed default DiagramRules for all diagram types
const pg = require("pg");
const pool = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/diagramatix", max: 1 });

const rules = {
  general: `## Group 1: General Layout
G01: Diagrams should flow left-to-right as the primary direction.
G02: Elements should be evenly spaced and well-organised.
G03: Avoid overlapping elements and crossing connectors where possible.
G04: Use clear, descriptive labels for all elements.
G05: Labels should be action-oriented verb phrases for tasks (e.g. "Check Order", "Approve Request").

## Group 2: General Naming
G06: Element names should be concise but descriptive (3-5 words maximum).
G07: Avoid abbreviations unless they are universally understood in the domain.
G08: Use consistent naming conventions throughout the diagram.`,

  bpmn: `## Group 1: Pools & Lanes
R01: Always create a main process White-Box Pool with the name of the entity carrying out the main process, or use the default name "Company".
R02: Any references to external entities (e.g. Customer, Client, Government Department, Applicant, Registrant, Supplier) should be represented as Black-Box Pools at the top of the diagram. There may be more than one. These are non-System pools.
R03: Any references to IT systems or commonly used business applications (e.g. Salesforce, XERO, SAP, SharePoint, databases, APIs) should be represented as Black-Box Pools below the main process Pool. These are System pools.
R04: If Teams or Roles are mentioned that can be interpreted as being within the Company carrying out the process, they should be represented as Lanes within the main process Pool.

## Group 2: Task Allocation & Types
R05: Any tasks or activities described that can be allocated to specific Roles or Teams should be placed in their corresponding Lane.
R06: Tasks that involve sending to or receiving from a non-System external entity (e.g. Customer, Client) should use Message Flow connectors. The sending task should have taskType "send" and the receiving task should have taskType "receive".
R07: Tasks that interact with System pools (IT systems like Salesforce, XERO, SAP) should use Message Flow connectors BUT the task should keep taskType "user" or "service" (NOT "send" or "receive"). Systems are accessed by users, not sent messages to.

## Group 3: Flow Structure
R08: Every process must start with exactly one Start Event on the left side, within the main process Pool.
R09: Every process must end with one or more End Events on the right side, within the main process Pool.
R10: CRITICAL: Any decision point that creates a diverging flow MUST always have a corresponding downstream Merge Gateway to reconnect ALL branches before any subsequent task.
R11: Use Exclusive Gateways for if/else decisions with condition labels on the outgoing flows.
R12: Use Parallel Gateways for concurrent activities that must all complete before proceeding.

## Group 4: Naming & Labels
R13: Task names should be action-oriented verb phrases (e.g. "Check Order", "Create Invoice", "Send Email").
R14: Gateway condition labels should be clear Yes/No or descriptive conditions.
R15: Pool and Lane names should match the entity or role names mentioned in the process description.

## Group 5: Layout Preferences
R16: The process should flow left-to-right within the main Pool.
R17: External entity (non-System) Pools should be positioned above the main Pool.
R18: System/application Pools should be positioned below the main Pool.
R19: Lanes should be ordered top-to-bottom in logical process flow order.`,

  "state-machine": `## Group 1: States
S01: Every state machine must have exactly one Initial State (filled circle) and at least one Final State (bull's eye).
S02: States should be named with nouns or adjective-noun phrases describing the condition (e.g. "Idle", "Processing", "Awaiting Approval").
S03: Use Composite States to group related sub-states that share common transitions.
S04: Use SubMachine states for complex sub-processes that warrant their own diagram.
S05: Use Fork/Join bars for concurrent state transitions.

## Group 2: Transitions
S06: Transitions should be labelled with the event or condition that triggers them.
S07: Use formal transition labels where appropriate: event [guard] / actions.
S08: Self-transitions are valid for states that loop on certain events.
S09: Decision gateways should be used for complex branching logic with multiple conditions.

## Group 3: Layout
S10: Initial State should be on the left, Final State(s) on the right.
S11: States should flow generally left-to-right showing progression.
S12: Composite States should be large enough to contain all sub-states clearly.`,

  "value-chain": `## Group 1: Chevron Layout
V01: Chevrons should be arranged left-to-right representing the value chain flow.
V02: Related chevrons should overlap by 10px to create the interlocking chain appearance.
V03: Each chevron should have a clear, concise process name.
V04: Use Collapsed Chevrons for processes that link to detailed BPMN or Value Chain diagrams.

## Group 2: Process Groups
V05: Use Process Groups to visually group related chevrons.
V06: Process Groups should have a descriptive name at the top.
V07: Nested Process Groups automatically lighten in shade for visual hierarchy.

## Group 3: Descriptions
V08: Each chevron should have a description that summarises the process scope.
V09: Descriptions are shown by default below each chevron.
V10: Descriptions should auto-wrap within the chevron width.

## Group 4: Colour Themes
V11: Use colour themes to distinguish different process areas or departments.
V12: Apply themes by selecting multiple chevrons and right-clicking.`,

  domain: `## Group 1: Entities
D01: Each table or entity should be represented as a UML Class with the <<entity>> or <<table>> stereotype.
D02: All attributes should include their data type.
D03: Primary keys should be marked with {PK}.
D04: Foreign keys should be marked with {FK} and reference the target table.
D05: NOT NULL constraints should be indicated with [1] multiplicity.

## Group 2: Relationships
D06: Use UML Association connectors for foreign key relationships.
D07: Show multiplicities on both ends of associations (e.g. 1..*, 0..1, 1..1).
D08: Use composition for strong ownership relationships.
D09: Use aggregation for weak containment relationships.

## Group 3: Enumerations
D10: Lookup/reference tables should be represented as UML Enumerations with <<enumeration>> stereotype.
D11: All valid values should be listed in the enumeration body.

## Group 4: Layout
D12: Entity tables should be arranged in a grid layout.
D13: Related entities should be positioned near each other.
D14: Enumeration tables should be grouped separately from entity tables.`,

  context: `## Group 1: Elements
C01: The central system or process should be represented as a large ellipse or rectangle in the centre.
C02: External entities should be arranged around the central system.
C03: Data flows should be labelled with the data or information being exchanged.

## Group 2: Layout
C04: External entities should be evenly spaced around the central system.
C05: Flow lines should not cross where possible.
C06: Use bi-directional flows where data moves in both directions.`,

  "process-context": `## Group 1: Elements
P01: Use Cases should represent the main processes or functions.
P02: Actors should represent the roles or teams that interact with processes.
P03: System boundaries should enclose related use cases.

## Group 2: Layout
P04: Actors should be positioned outside the system boundary.
P05: Use Cases should be arranged logically within the boundary.
P06: Association lines should connect actors to their relevant use cases.`,
};

async function seed() {
  for (const [category, text] of Object.entries(rules)) {
    await pool.query(
      `INSERT INTO "DiagramRules" (id, category, rules, "isDefault", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [`default-${category}`, category, text]
    );
    console.log(`Seeded: ${category} (${text.split("\n").filter(l => l.match(/^[A-Z]\d+:/)).length} rules)`);
  }
  await pool.end();
  console.log("Done!");
}

seed().catch(e => { console.error(e); process.exit(1); });
