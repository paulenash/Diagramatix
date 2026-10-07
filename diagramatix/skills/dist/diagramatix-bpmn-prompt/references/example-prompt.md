# Real prompts of the right shape

These are two prompts from Diagramatix's Process Repository — prompts it generates diagrams from. Match their **shape and level of detail**; do not copy their content.

- **Example 1 — simple.** The format; a decision whose branches close at a named merge; a loop written as a standard-loop subprocess; a timer boundary event on that subprocess; message flows that cross pool boundaries (to a customer pool and to a system pool); data objects.
- **Example 2 — richer.** Adds a **parallel** split with its matching **parallel merge**, **nested decisions** (a decision inside a branch of another), several **boundary events**, and branches that end in their own End events.

## Example 1 — V01.01 — Receive Order

```text
BPMN: V01.01 Receive Order — first subprocess of the Order to Cash value
chain, capturing an inbound customer order and recording it in the Order
Management System before passing it to validation.

1. Pools & Lanes

Pool "Sales Organisation" — the company receiving and processing the order,
  with lanes for Customer Service and Order Processing.
Pool "Customer" — the external buyer placing the order.
Pool "Order Management System (OMS)" — the system of record for sales orders.

2. Pool properties

Pool "Sales Organisation": white-box, single instance.
Pool "Customer": black-box, single instance.
Pool "Order Management System (OMS)": black-box, System = true, single
  instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Order Management System (OMS)

4. Lane contents in flow order (Sales Organisation)

Customer Service lane:
  Message start event "Order received from Customer"
  User task "Log initial order contact"
  User task "Capture order channel and details"
  Exclusive gateway "Order information complete?"
  - branch "No — information missing":
      Expanded Subprocess "Repeat Until Details Complete" (standard loop)
        containing, in order: Send task "Request missing information from
        Customer", Intermediate message catch event "Customer responds",
        User task "Update order details"
      (continues to exclusive merge gateway "Order information complete")
  - branch "Yes — details sufficient":
      (continues to exclusive merge gateway "Order information complete")
  Exclusive merge gateway "Order information complete"
  User task "Confirm order receipt with Customer"
  Send task "Send order acknowledgement to Customer"

Order Processing lane:
  User task "Review captured order details"
  User task "Assign order type and priority"
  Service task "Create sales order record in OMS"
  User task "Verify order record created"
  End event "Order record confirmed — ready for Validate Customer / Order"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Details Complete", labelled "48-hour response deadline exceeded", leading
  to End event "Order abandoned — customer unresponsive".

6. Connectors

Sequence flows: work begins in the Customer Service lane with the message
  start event, moves through order capture and the completeness gateway loop,
  then passes via sequence flow into the Order Processing lane for review,
  order creation in the OMS, and verification before reaching the end event.
  The "No" branch of the completeness gateway enters the standard-loop
  subprocess and rejoins at the exclusive merge gateway "Order information
  complete"; the "Yes" branch bypasses the subprocess and also rejoins at
  that same merge gateway, continuing to the acknowledgement send task.

Message flows:
  Customer → Customer Service lane (inbound order details, purchase order,
    or subscription trigger)
  Send task "Request missing information from Customer" → Customer (request
    for clarification or missing order data)
  Customer → Intermediate message catch event "Customer responds" (customer
    reply with missing information)
  Send task "Send order acknowledgement to Customer" → Customer (order
    acknowledgement with reference number)
  Service task "Create sales order record in OMS" → Order Management System
    (OMS) (new sales order record)
  Order Management System (OMS) → User task "Verify order record created"
    (confirmation of record creation and assigned order number)

7. Data objects

Data Object "Inbound Order" — written by User task "Capture order channel
  and details"; read by User task "Review captured order details".
Data Object "Order Acknowledgement" — written by User task "Confirm order
  receipt with Customer"; read by Send task "Send order acknowledgement to
  Customer".
Data Object "Sales Order Record" — written by Service task "Create sales
  order record in OMS"; read by User task "Verify order record created".

This subprocess receives the customer's order through any channel, gathers
all necessary order details through an iterative clarification loop if needed,
and registers a confirmed sales order record in the Order Management System.
It hands a complete, system-recorded order to the Validate Customer / Order
subprocess, which checks the customer's standing and the order's correctness
before credit and pricing review begins.
```

## Example 2 — V26.05 — Procure Contractors & Equipment

```text
BPMN: V26.05 Procure Contractors & Equipment — the procurement subprocess
within Concept to Commissioning, triggered by completed detailed design and
permits, delivering awarded contracts and confirmed equipment orders ready for
mobilisation and construction.

1. Pools & Lanes

Pool "Project Organisation" — the internal organisation running the
procurement process, with lanes for Procurement.
Pool "Contractor" — external tenderers submitting bids for construction
and delivery work.
Pool "Equipment Vendor" — external suppliers submitting quotations for
long-lead equipment.
Pool "Procurement & Contract Management" — the system recording
contracts, purchase orders, and procurement events.

2. Pool properties

Pool "Project Organisation" — white-box, single instance.
Pool "Contractor" — black-box, single instance.
Pool "Equipment Vendor" — black-box, single instance.
Pool "Procurement & Contract Management" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Contractor
2. Equipment Vendor
3. Project Organisation
4. Procurement & Contract Management

4. Lane contents in flow order (Project Organisation)

Procurement lane:
  Message start event "Permits and approved design received from
  Obtain Permits & Approvals"
  User task "Define procurement strategy and package scope"
  User task "Prepare tender documents and specifications"
  Parallel gateway "Initiate parallel procurement streams"
  - branch "Contractor procurement":
      Send task "Issue invitation to tender to Contractor"
      Intermediate message catch event "Tenders received from Contractor"
      User task "Evaluate contractor tenders"
      User task "Conduct contractor clarification and negotiation"
      Exclusive gateway "Contractor tender acceptable?"
      - branch "Yes":
          User task "Award contract to Contractor"
          Service task "Record contract in Procurement & Contract
          Management"
          (continues to exclusive merge gateway "Contractor
          procurement complete")
      - branch "No":
          User task "Revise scope or re-tender for contractor"
          (continues to exclusive merge gateway "Contractor
          procurement complete")
      Exclusive merge gateway "Contractor procurement complete"
  - branch "Equipment procurement":
      Send task "Issue request for quotation to Equipment Vendor"
      Intermediate message catch event "Quotations received from
      Equipment Vendor"
      User task "Evaluate equipment quotations"
      User task "Conduct vendor clarification and negotiation"
      Exclusive gateway "Equipment quotation acceptable?"
      - branch "Yes":
          User task "Raise purchase order for equipment"
          Service task "Record purchase order in Procurement &
          Contract Management"
          (continues to exclusive merge gateway "Equipment
          procurement complete")
      - branch "No":
          User task "Revise specification or re-quote for equipment"
          (continues to exclusive merge gateway "Equipment
          procurement complete")
      Exclusive merge gateway "Equipment procurement complete"
  Parallel merge gateway "All procurement streams complete"
  User task "Confirm mobilisation readiness and handover package"
  End event "Contracts awarded and orders placed — ready for Mobilise
  & Construct"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Evaluate contractor tenders" —
label "Tender evaluation period exceeded" — triggers User task "Escalate
tender evaluation to procurement lead" which then flows back to the
exclusive merge gateway "Contractor procurement complete".
Interrupting timer boundary event on "Evaluate equipment quotations" —
label "Quotation evaluation period exceeded" — triggers User task
"Escalate quotation evaluation to procurement lead" which then flows
back to the exclusive merge gateway "Equipment procurement complete".

6. Connectors

Sequence flows: the Procurement lane begins at the message start event,
advances through strategy and document preparation tasks, then splits at
the parallel gateway into the contractor procurement branch and the
equipment procurement branch. The contractor branch runs through tender
issuance, receipt, evaluation, negotiation, and the acceptable gateway;
the Yes branch records the contract and rejoins the contractor
exclusive merge gateway; the No branch re-tenders and rejoins the same
merge gateway. The equipment branch runs through quotation issuance,
receipt, evaluation, negotiation, and the acceptable gateway; the Yes
branch records the purchase order and rejoins the equipment exclusive
merge gateway; the No branch re-quotes and rejoins the same merge
gateway. Both exclusive merge gateways flow into the parallel merge
gateway, which advances to the readiness confirmation task and on to
the end event.

Message flows:
Send task "Issue invitation to tender to Contractor" → Contractor
(invitation to tender package including scope and specifications).
Contractor → Intermediate message catch event "Tenders received from
Contractor" (completed tender submissions).
Send task "Issue request for quotation to Equipment Vendor" →
Equipment Vendor (request for quotation with technical specification).
Equipment Vendor → Intermediate message catch event "Quotations
received from Equipment Vendor" (equipment quotations and lead-time
details).
Service task "Record contract in Procurement & Contract Management" →
Procurement & Contract Management (awarded contract data).
Service task "Record purchase order in Procurement & Contract
Management" → Procurement & Contract Management (purchase order data).
Procurement & Contract Management → User task "Confirm mobilisation
readiness and handover package" (confirmed contract and order records
for handover package).

7. Data objects

Data Object "Procurement Strategy" — written by "Define procurement
strategy and package scope"; read by "Prepare tender documents and
specifications".
Data Object "Tender Documents" — written by "Prepare tender documents
and specifications"; read by "Issue invitation to tender to Contractor".
Data Object "Request for Quotation" — written by "Prepare tender
documents and specifications"; read by "Issue request for quotation to
Equipment Vendor".
Data Object "Contractor Tender Submissions" — written by intermediate
message catch event "Tenders received from Contractor"; read by
"Evaluate contractor tenders".
Data Object "Equipment Quotations" — written by intermediate message
catch event "Quotations received from Equipment Vendor"; read by
"Evaluate equipment quotations".
Data Object "Awarded Contract" — written by "Award contract to
Contractor"; read by "Record contract in Procurement & Contract
Management".
Data Object "Equipment Purchase Order" — written by "Raise purchase
order for equipment"; read by "Record purchase order in Procurement &
Contract Management".
Data Object "Mobilisation Readiness Package" — written by "Confirm
mobilisation readiness and handover package".

This subprocess converts approved design and permit conditions into
binding contractual and commercial commitments. Running contractor
tendering and equipment procurement in parallel keeps the critical path
as short as possible. When it ends, awarded contracts, confirmed purchase
orders, and a mobilisation readiness package are handed to Mobilise &
Construct so that site work can begin without commercial uncertainty.
```
