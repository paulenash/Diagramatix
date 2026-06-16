# Sample Process — Graebel (Global Mobility / Relocation)

## Executive summary

Graebel is being positioned internally as a global mobility / relocation services company with high-volume operational workflows.

They are actively moving toward being an **"AI-first organisation"**, with governance, data maturity, and agent-based automation already underway.

Their core operational challenge is high-volume, semi-structured process handling (emails, service orders, compliance workflows), making them a strong fit for agentic automation.

## 🧩 What Graebel actually does

From the materials and engagements:

### Core business domain

- Relocation / global mobility services
- Managing employee moves, logistics, compliance, and partner coordination
- Handling "thousands of relocation service orders" annually *[GET AI - C…view - ABS | PowerPoint]*

This implies:

- Multi-party workflows (employee, employer, vendors)
- Heavy compliance / regulatory steps
- Lots of coordination + document handling

## ⚙️ Key internal process types (based on evidence)

### 1. 📩 Service Order Processing (critical core process)

This is one of the clearest, documented workflows.

**Current (pre-AI) pattern:**

- Requests come in via email with unstructured instructions
- Staff must:
  - Read email
  - Extract key info (employee, service scope, timelines, compliance)
  - Manually enter into internal system (Global Connect)

**Pain points:**

- High manual effort
- Data quality inconsistency
- Backlogs during high-volume periods
- No APIs → hard to automate with traditional RPA *[GET AI - C…view - ABS | PowerPoint]*

**AI direction:**

- A "Service Order Agent" replicates a human:
  - Email reading
  - System navigation
  - Service order creation
  - Human-in-the-loop approval

## BPMN diagram prompt — Service Order Processing (AI-augmented)

This prompt models the **AI direction** target state: a "Service Order Agent"
reads the inbound email, extracts and validates the service order, drafts it in
Global Connect, and a human Mobility Coordinator approves it before it is
confirmed.

```text
BPMN: Graebel — Service Order Processing (AI-augmented "Service Order Agent").

1. Pools & Lanes
- Pool "Client / Requestor" — the external party (employer HR / mobility
  contact or employee) that emails the relocation service request.
- Pool "Graebel" — the organisation running the process, with two lanes
  top-to-bottom: "Service Order Agent" (AI agent), "Mobility Coordinator"
  (human reviewer / approver).
- Pool "Global Connect" — the internal system where service orders are created.

2. Pool properties
- Client / Requestor: black-box, single instance (no internal flow shown).
- Graebel: white-box (holds the process flow).
- Global Connect: black-box, System = true, single instance.

3. Layout
- Client / Requestor pool at the top, Graebel pool in the middle,
  Global Connect pool at the bottom.

4. Lane contents in flow order (Graebel)
Service Order Agent lane:
- Message start event "Service request email received"
- Service task "Read & parse email" (extract employee, service scope,
  timelines, compliance requirements)
- Business rule task "Validate details & check compliance"
- Exclusive gateway "Information complete & compliant?"
    - branch "No – missing / unclear": Send task "Request clarification from
      requestor", then intermediate message catch event "Requestor responds",
      then back to "Read & parse email"
    - branch "Yes": continue
- Service task "Draft service order in Global Connect"
Mobility Coordinator lane:
- User task "Review & approve service order"
- Exclusive gateway "Approved?"
    - branch "No – needs correction": back to "Draft service order in Global
      Connect" for revision
    - branch "Yes": continue
- Service task "Confirm service order in Global Connect"
- Send task "Send confirmation to requestor"
- End event "Service order created — ready for fulfilment"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Review & approve service order":
  "Not reviewed in 1 business day" → Send task "Escalate to team lead",
  then return to waiting.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches,
the loop back from "Requestor responds" to "Read & parse email", and the
rejection loop from "Approved?" back to "Draft service order in Global Connect".
Message flows:
- Client / Requestor → start event "Service request email received" (the
  unstructured email request: employee, service scope, timelines, compliance)
- "Request clarification from requestor" → Client / Requestor
- Client / Requestor → intermediate event "Requestor responds"
- "Draft service order in Global Connect" → Global Connect pool
- Global Connect → "Confirm service order in Global Connect" (order reference)
- "Send confirmation to requestor" → Client / Requestor

This replaces the current manual pattern — staff reading emails, extracting key
information, and hand-keying it into Global Connect — with an AI Service Order
Agent that reads the email, validates and drafts the order, and routes it for a
fast human-in-the-loop approval before the order is confirmed in Global Connect.
```
