# Process Repository

The main end-to-end business processes are often called **value streams** or **cross-functional process chains**. They cut across departments and describe how the organisation creates, sells, delivers, supports, and manages value.

## A Common Set

| End-to-end process | What it covers |
| --- | --- |
| **Order to Cash** | Customer order → fulfilment → delivery → invoicing → payment collection |
| **Lead to Order / Lead to Cash** | Marketing lead → sales opportunity → quote → contract/order. If extended through payment, it becomes Lead to Cash |
| **Quote to Order** | Customer request → quotation → negotiation → accepted order |
| **Procure to Pay** | Purchase need → requisition → purchase order → goods/services receipt → supplier invoice → payment |
| **Plan to Produce / Plan to Make** | Demand planning → production planning → manufacturing → quality control → finished goods |
| **Forecast to Stock** | Forecast demand → plan inventory → procure/manufacture → hold stock ready for sale |
| **Design to Launch / Idea to Market** | Product idea → design → development → testing → launch |
| **Issue to Resolution / Request to Resolve** | Customer issue/request → triage → investigation → resolution → closure |
| **Hire to Retire** | Workforce planning → recruitment → onboarding → payroll/HR management → performance → offboarding/retirement |
| **Record to Report** | Financial transactions → journals → reconciliations → close → financial/statutory reporting |
| **Acquire to Retire** | Asset need → acquisition → deployment → maintenance → depreciation → disposal |
| **Source to Contract** | Supplier identification → RFQ/RFP → negotiation → contract award |
| **Contract to Renewal** | Contract setup → obligation management → performance monitoring → renewal/termination |
| **Service Request to Fulfilment** | Internal or customer service request → approval → fulfilment → confirmation |
| **Concept to Customer** | Broad product/service lifecycle from concept through development, launch, sale, delivery, and support |

## A Useful Way to Group Them

### 1. Customer-facing / revenue processes

These are the processes most directly tied to revenue and customer value.

- **Lead to Order** — Find potential customers, qualify them, develop opportunities, quote, negotiate, and win the sale.
- **Order to Cash** — Receive the order, deliver the goods or services, invoice the customer, and collect payment.
- **Issue to Resolution** — Handle complaints, faults, warranty claims, service tickets, returns, and customer support.

### 2. Supply chain and operations processes

These are about planning, sourcing, making, moving, and delivering.

- **Plan to Produce** — Plan demand, schedule production, manufacture goods, test quality, and release finished product.
- **Procure to Pay** — Buy goods and services, receive them, match invoices, and pay suppliers.
- **Forecast to Stock** — Forecast demand and maintain inventory so products are available when needed.
- **Warehouse to Deliver** — Pick, pack, ship, deliver, and confirm receipt.

### 3. Product and service lifecycle processes

These are about creating or improving what the business sells.

- **Idea to Market** — Identify opportunity, develop a product/service, test it, price it, launch it, and manage adoption.
- **Design to Launch** — More product-development focused: design, build, validate, release.
- **Change to Release** — Common in IT/software: request change, assess, build, test, approve, deploy.

### 4. Finance and corporate management processes

These keep the organisation controlled and compliant.

- **Record to Report** — Capture accounting transactions, reconcile accounts, close periods, and produce reports.
- **Budget to Forecast** — Set budgets, track actuals, revise forecasts, and manage financial performance.
- **Risk to Compliance** — Identify risks, define controls, monitor compliance, manage audits and remediation.

### 5. People and asset processes

These manage key organisational resources.

- **Hire to Retire** — Recruit, onboard, manage, develop, pay, and offboard employees.
- **Acquire to Retire** — Acquire assets, maintain them, depreciate them, and dispose of them.
- **Request to Fulfilment** — An employee or department asks for something — equipment, access, travel, software — and the organisation approves and provides it.

## The Most Common "Big Name" Process Chains

- **V01** Order to Cash
- **V02** Procure to Pay
- **V03** Record to Report
- **V04** Hire to Retire
- **V05** Plan to Produce
- **V06** Idea to Market
- **V07** Issue to Resolution
- **V08** Acquire to Retire
- **V09** Source to Contract

> **Prompt used for the next section:**
> Now for each of these I need a few short paragraphs describing: 1. The Teams and Roles that would typically be involved in that process. 2. The External Participants that would initiate the process and be the main external participant during the end-to-end process (e.g. Customer, Applicant, Interviewee, Inventor, Complainant, Seller, Buyer, Owner, etc.). 3. The small number of high-level Subprocesses that would be carried out during the end-to-end Value Chain. 4. The typical IT Systems that would support these processes. 5. The main policies and procedures that would inform the processes. 6. The high-level flow of information to and from the External Participants and the Processes. 7. The high-level flow of information to and from the Processes and the IT Systems.

---

# Enterprise Value Chains Catalogue

## V01 — Order to Cash

**Teams and roles involved.**
Order to Cash usually involves Sales, Customer Service, Order Management, Credit Control, Warehouse/Logistics, Billing, Accounts Receivable, Finance, and sometimes Legal or Contracts. Key roles include account manager, sales operations analyst, order processor, credit officer, fulfilment coordinator, warehouse picker/packer, delivery coordinator, billing officer, collections officer, and customer support agent.

**External participants.**
The main external participant is the Customer or Buyer. The process is normally initiated when a customer places an order, accepts a quote, signs a contract, or triggers a recurring purchase/subscription. Other external parties may include freight carriers, payment providers, distributors, resellers, or customer procurement teams.

**High-level subprocesses.**
Typical subprocesses are: receive order, validate customer/order, check credit and pricing, confirm availability, fulfil goods or services, deliver to customer, issue invoice, receive payment, reconcile payment, manage disputes or deductions, and close the order.

**Typical IT systems.**
Supporting systems include CRM, ERP, order management, eCommerce platform, customer portal, warehouse management system, transport management system, billing system, accounts receivable system, payment gateway, document management, and customer service/ticketing platform.

**Policies and procedures.**
Key controls include pricing policy, credit policy, customer master data policy, order acceptance procedure, fulfilment procedure, delivery terms, billing policy, tax rules, revenue recognition policy, returns policy, dispute management procedure, and debt collection policy.

**Information flow between external participants and process.**
The customer provides order details, purchase orders, delivery instructions, contact details, payment details, and dispute or return requests. The process provides the customer with quotes, order confirmations, availability updates, shipment notifications, invoices, statements, payment receipts, credit notes, and service updates.

**Information flow between process and IT systems.**
The process creates or updates customer master data, sales orders, inventory reservations, shipment records, delivery confirmations, invoices, receivables, payment records, and financial postings. IT systems provide pricing, credit status, inventory availability, order status, invoice status, payment status, and reporting information.

**Value Chain diagram prompt.**

```text
Value Chain V01 - Order to Cash (O2C)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V01.01. Receive Order
V01.02. Validate Customer / Order
V01.03. Check Credit & Pricing
V01.04. Confirm Availability
V01.05. Fulfil Goods or Services
V01.06. Deliver to Customer
V01.07. Issue Invoice
V01.08. Receive Payment
V01.09. Reconcile Payment
V01.10. Manage Disputes & Deductions
V01.11. Close Order

This is the customer-facing, revenue-generating end-to-end process: a
customer order flows through fulfilment, delivery, invoicing, and
payment collection. The main external participant is the Customer
(Buyer); the process is triggered when the customer places an order,
accepts a quote, signs a contract, or starts a recurring purchase.
```

**Context diagram prompt.**

```text
Context Diagram: V01 — Order to Cash (O2C).

1. Central system (process-system)
A single central process/system ellipse named "Order Processing Company"
representing the whole organisation that runs the Order to Cash process. It is
the system in context: everything inside it — sales, order processing,
fulfilment, billing, finance and the supporting IT systems (OMS, CRM/ERP, WMS,
TMS, billing and general ledger) — is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one rectangle
each:
- Customer
- Freight Carrier
- Payment Gateway
- Bank

3. Layout
"Order Processing Company" sits in the centre. The Customer sits to the LEFT
(the demand side). Freight Carrier, Payment Gateway and Bank sit to the RIGHT
(the fulfilment and settlement side). Every external entity connects directly
to the central system with labelled information flows; entities never connect
to one another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Customer → Order Processing Company: order / purchase order, delivery
  instructions, contact details, payment details, dispute & return requests.
- Order Processing Company → Customer: quote, order confirmation, availability
  update, shipment notification, invoice, statement, payment receipt, credit
  note, service update.
- Order Processing Company → Freight Carrier: shipment booking & consignment
  details.
- Freight Carrier → Order Processing Company: proof of delivery & tracking
  updates.
- Order Processing Company → Payment Gateway: payment authorisation request.
- Payment Gateway → Order Processing Company: payment confirmation & settlement
  advice.
- Bank → Order Processing Company: bank statement & cleared funds.
- Order Processing Company → Bank: deposit & remittance details.

This Context Diagram frames the Order Processing Company as a single system in
context: the Customer initiates the Order to Cash process, the Freight Carrier
delivers the goods, and the Payment Gateway and Bank settle payment. The four
external entities are exactly the external actors of the Process Context diagram
below, so the two views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V01 — Order to Cash (O2C).

1. System boundary and processes
A system boundary named "V01 — Order to Cash" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V01.01 Receive Order
- V01.02 Validate Customer / Order
- V01.03 Check Credit & Pricing
- V01.04 Confirm Availability
- V01.05 Fulfil Goods or Services
- V01.06 Deliver to Customer
- V01.07 Issue Invoice
- V01.08 Receive Payment
- V01.09 Reconcile Payment
- V01.10 Manage Disputes & Deductions
- V01.11 Close Order

2. Participants (outside the boundary)
External actors (actor):
- Customer
- Freight Carrier
- Bank
- Payment Gateway
Internal teams (team):
- Customer Service
- Order Processing
- Sales / Pricing
- Credit Control
- Planning / Inventory
- Warehouse / Operations
- Quality Assurance
- Logistics / Dispatch
- Billing
- Accounts Receivable
- Finance
IT systems (system):
- Order Management System (OMS)
- Customer Master Data System (CRM/ERP)
- ERP / Credit System
- Inventory / Warehouse System (WMS)
- Transport Management System (TMS)
- Billing / ERP System
- Payment Gateway / Bank
- ERP / General Ledger System
- Case / Ticketing System

3. Layout
The processes sit inside the boundary in V01.01 → V01.11 order. External
actors and internal teams sit to the LEFT of the boundary; IT systems sit to
the RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V01.01 Receive Order — Customer (places order); Customer Service, Order
  Processing (capture); Order Management System (OMS) (record).
- V01.02 Validate Customer / Order — Customer (confirm details); Order
  Processing, Customer Service (validate / onboard); Customer Master Data
  System (CRM/ERP) (master data).
- V01.03 Check Credit & Pricing — Customer (prepayment on decline); Sales /
  Pricing, Credit Control (price & credit decision); ERP / Credit System
  (pricing, credit limit & exposure).
- V01.04 Confirm Availability — Customer (availability / date proposal); Order
  Processing, Planning / Inventory (ATP & reserve); Inventory / Warehouse
  System (WMS) (stock & ATP).
- V01.05 Fulfil Goods or Services — Warehouse / Operations (pick & pack),
  Quality Assurance (QC); Inventory / Warehouse System (WMS) (pick list & stock).
- V01.06 Deliver to Customer — Customer (shipment notice & delivery), Freight
  Carrier (carriage & POD); Logistics / Dispatch (dispatch); Transport
  Management System (TMS) (booking & tracking).
- V01.07 Issue Invoice — Customer (invoice); Billing, Finance (invoice & AR
  posting); Billing / ERP System (generate & post).
- V01.08 Receive Payment — Customer (payment & receipt), Payment Gateway, Bank
  (settlement); Accounts Receivable, Finance (record payment); Payment Gateway
  / Bank (clearing).
- V01.09 Reconcile Payment — Bank (statement); Accounts Receivable, Finance
  (match, clear, post); ERP / General Ledger System (open AR & ledger).
- V01.10 Manage Disputes & Deductions — Customer (dispute & resolution);
  Customer Service, Accounts Receivable, Finance (log, investigate, credit);
  Case / Ticketing System (case management).
- V01.11 Close Order — Order Processing, Finance (verify, finalise, archive);
  Order Management System (OMS), ERP / General Ledger System (status & close).

This Process Context diagram frames the whole Order to Cash value chain: the
eleven subprocesses inside the boundary, the external actors (Customer, Freight
Carrier, Bank, Payment Gateway) and internal teams that perform them, and the
IT systems that support them — consistent with the per-process BPMN prompts
below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Sales Organisation" pool (key role in brackets), and IT systems
are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V01.01** Receive Order | Customer | Customer Service (customer support agent), Order Processing (order processor) | Order Management System (OMS) |
| **V01.02** Validate Customer / Order | Customer | Order Processing (order processor), Customer Service (customer support agent) | Customer Master Data System (CRM/ERP) |
| **V01.03** Check Credit & Pricing | Customer | Sales / Pricing (sales operations analyst, pricing analyst), Credit Control (credit officer) | ERP / Credit System |
| **V01.04** Confirm Availability | Customer | Order Processing (order processor), Planning / Inventory (inventory controller, planner) | Inventory / Warehouse System (WMS) |
| **V01.05** Fulfil Goods or Services | — | Warehouse / Operations (picker/packer, fulfilment coordinator), Quality Assurance (quality inspector) | Inventory / Warehouse System (WMS) |
| **V01.06** Deliver to Customer | Customer, Freight Carrier | Logistics / Dispatch (delivery coordinator) | Transport Management System (TMS) |
| **V01.07** Issue Invoice | Customer | Billing (billing officer), Finance (finance controller) | Billing / ERP System |
| **V01.08** Receive Payment | Customer, Payment Gateway, Bank | Accounts Receivable (collections officer), Finance (finance controller) | Payment Gateway / Bank |
| **V01.09** Reconcile Payment | Bank | Accounts Receivable (reconciliations analyst), Finance (finance controller) | ERP / General Ledger System |
| **V01.10** Manage Disputes & Deductions | Customer | Customer Service (case manager), Accounts Receivable (collections officer), Finance (finance controller) | Case / Ticketing System |
| **V01.11** Close Order | — | Order Processing (order processor), Finance (finance controller) | Order Management System (OMS), ERP / General Ledger System |

**Actor / Team / System roll-up** (every distinct participant across V01):

- **External actors:** Customer (V01.01–V01.04, V01.06–V01.08, V01.10); Freight Carrier (V01.06); Payment Gateway (V01.08); Bank (V01.08–V01.09).
- **Teams:** Customer Service (V01.01, V01.02, V01.10); Order Processing (V01.01, V01.02, V01.04, V01.11); Sales / Pricing (V01.03); Credit Control (V01.03); Planning / Inventory (V01.04); Warehouse / Operations (V01.05); Quality Assurance (V01.05); Logistics / Dispatch (V01.06); Billing (V01.07); Accounts Receivable (V01.08–V01.10); Finance (V01.07–V01.11).
- **IT systems:** Order Management System / OMS (V01.01, V01.11); Customer Master Data System / CRM/ERP (V01.02); ERP / Credit System (V01.03); Inventory / Warehouse System / WMS (V01.04, V01.05); Transport Management System / TMS (V01.06); Billing / ERP System (V01.07); Payment Gateway / Bank (V01.08); ERP / General Ledger System (V01.09, V01.11); Case / Ticketing System (V01.10).

### V01.01 — Receive Order

**BPMN diagram prompt.**

```text
BPMN: V01.01 Receive Order — first stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party that places the order.
- Pool "Sales Organisation" — the organisation running the process, with two
  lanes top-to-bottom: "Customer Service", "Order Processing".
- Pool "Order Management System (OMS)" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance (no internal flow shown).
- Sales Organisation: white-box (holds the process flow).
- Order Management System (OMS): black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  Order Management System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Customer Service lane:
- Message start event "Order received"
- User task "Capture order details"
- Exclusive gateway "Order complete?"
    - branch "No – information missing": Send task "Request missing details",
      then intermediate message catch event "Customer responds", then back to
      "Capture order details"
    - branch "Yes": continue to Order Processing
Order Processing lane:
- Service task "Record order in OMS"
- User task "Check order against duplicates / existing customer"
- Send task "Send order acknowledgement"
- End event "Order recorded — ready for Validate Customer / Order (V01.02)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Capture order details":
  "No response in 2 business days" → Send task "Send reminder to customer",
  then return to waiting.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches
and the loop back from "Customer responds" to "Capture order details".
Message flows:
- Customer → start event "Order received" (the order: purchase order, quote
  acceptance, portal/eCommerce order, or recurring purchase)
- "Request missing details" → Customer
- Customer → intermediate event "Customer responds"
- "Record order in OMS" → Order Management System (OMS) pool
- Order Management System (OMS) → "Check order against duplicates / existing
  customer" (customer-match / duplicate data)
- "Send order acknowledgement" → Customer

This is the customer-facing entry point of O2C: an incoming order is received
through any channel, captured, completed if details are missing, recorded in
the OMS, and acknowledged — leaving a clean order ready for credit, pricing,
and availability checks in the next stages.
```

### V01.02 — Validate Customer / Order

**BPMN diagram prompt.**

```text
BPMN: V01.02 Validate Customer / Order — second stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party whose order is being validated.
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Customer Service", "Order Processing".
- Pool "Customer Master Data System (CRM/ERP)" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- Customer Master Data System (CRM/ERP): black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  Customer Master Data System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Order Processing lane:
- Message start event "Order to validate received"
- Service task "Look up customer master data"
- User task "Validate order data (products / SKUs / quantities / terms)"
- Exclusive gateway "Customer & order valid?"
    - branch "No – customer missing or blocked": User task "Refer to Customer
      Service", then continue
    - branch "Yes": continue
Customer Service lane:
- Exclusive gateway "New or blocked customer?"
    - branch "New": User task "Request customer onboarding / master-data setup",
      then intermediate message catch event "Customer details confirmed", then
      back to "Look up customer master data"
    - branch "Existing & clear": continue
- Service task "Flag order as validated"
- End event "Order validated — ready for Check Credit & Pricing (V01.03)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Request customer onboarding /
  master-data setup": "No response in 2 business days" → Send task "Chase
  customer for details", then return to waiting.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches and
the loop back from "Customer details confirmed" to "Look up customer master data".
Message flows:
- "Look up customer master data" → Customer Master Data System (CRM/ERP)
- Customer Master Data System (CRM/ERP) → "Validate order data" (customer
  status, credit block flag, account terms)
- "Request customer onboarding / master-data setup" → Customer
- Customer → intermediate event "Customer details confirmed"

This stage confirms the customer exists, is active and unblocked, and that the
order's products, quantities and terms are valid — onboarding or unblocking the
customer where needed — leaving a validated order ready for credit and pricing.
```

### V01.03 — Check Credit & Pricing

**BPMN diagram prompt.**

```text
BPMN: V01.03 Check Credit & Pricing — third stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party whose credit and pricing are assessed.
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Sales / Pricing", "Credit Control".
- Pool "ERP / Credit System" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- ERP / Credit System: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  ERP / Credit System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Sales / Pricing lane:
- Message start event "Validated order received"
- Service task "Retrieve list prices"
- User task "Apply contract / discount pricing"
Credit Control lane:
- Service task "Check credit limit and exposure"
- Exclusive gateway "Credit decision?"
    - branch "Approved": continue
    - branch "Refer": User task "Credit Officer review", then back to "Check
      credit limit and exposure"
    - branch "Declined": Send task "Request prepayment / hold order", then
      intermediate message catch event "Prepayment confirmed", then continue
- Service task "Confirm final price and credit terms"
- End event "Priced and credit-approved — ready for Confirm Availability (V01.04)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Credit Officer review": "Not
  decided in 1 business day" → Send task "Escalate to Credit Manager", then
  return to review.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches and
the loop backs.
Message flows:
- "Retrieve list prices" → ERP / Credit System
- "Check credit limit and exposure" → ERP / Credit System
- ERP / Credit System → "Credit decision?" (credit limit, exposure, rating)
- "Request prepayment / hold order" → Customer
- Customer → intermediate event "Prepayment confirmed"

This stage prices the order and checks the customer's credit limit and
exposure, approving, referring or declining it (with a prepayment path on
decline) — leaving a priced, credit-cleared order ready for availability checks.
```

### V01.04 — Confirm Availability

**BPMN diagram prompt.**

```text
BPMN: V01.04 Confirm Availability — fourth stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party awaiting an availability / delivery date.
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Order Processing", "Planning / Inventory".
- Pool "Inventory / Warehouse System (ERP/WMS)" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- Inventory / Warehouse System (ERP/WMS): black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  Inventory / Warehouse System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Order Processing lane:
- Message start event "Credit-approved order received"
- Service task "Check available-to-promise (ATP) stock"
- Exclusive gateway "Available in full?"
    - branch "Yes": continue
    - branch "No": continue to Planning / Inventory
Planning / Inventory lane:
- Exclusive gateway "Sourcing option?" (only on the "No" branch)
    - branch "Backorder / replenish": User task "Raise replenishment / backorder"
    - branch "Substitute": Send task "Propose substitute / partial to customer",
      then intermediate message catch event "Customer accepts proposal", then continue
- Service task "Reserve inventory"
Order Processing lane:
- End event "Availability confirmed and reserved — ready for Fulfil Goods or Services (V01.05)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Propose substitute / partial to
  customer": "No response in 1 business day" → Send task "Follow up on proposal",
  then return to waiting.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches and
the loop back from "Customer accepts proposal".
Message flows:
- "Check available-to-promise (ATP) stock" → Inventory / Warehouse System
- Inventory / Warehouse System → "Available in full?" (stock, ATP, lead times)
- "Reserve inventory" → Inventory / Warehouse System
- "Propose substitute / partial to customer" → Customer
- Customer → intermediate event "Customer accepts proposal"

This stage checks stock against the order, reserves it, and where it can't be
met in full raises replenishment or proposes a substitute / partial — leaving a
confirmed, reserved order ready for fulfilment.
```

### V01.05 — Fulfil Goods or Services

**BPMN diagram prompt.**

```text
BPMN: V01.05 Fulfil Goods or Services — fifth stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Warehouse / Operations", "Quality Assurance".
- Pool "Warehouse Management System (WMS)" — the supporting IT system.

2. Pool properties
- Sales Organisation: white-box (holds the process flow).
- Warehouse Management System (WMS): black-box, System = true, single instance.

3. Layout
- Sales Organisation pool at the top, Warehouse Management System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Warehouse / Operations lane:
- Message start event "Reserved order received"
- Service task "Generate pick list"
- User task "Pick items"
- User task "Pack and label"
Quality Assurance lane:
- User task "Quality check"
- Exclusive gateway "QC pass?"
    - branch "No": User task "Rework / re-pick", then back to "Quality check"
    - branch "Yes": continue
Warehouse / Operations lane:
- Service task "Stage for dispatch and update WMS"
- End event "Goods picked, packed and QC-passed — ready for Deliver to Customer (V01.06)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Pick items": "Pick shortfall not
  cleared in 4 hours" → User task "Notify Order Processing of shortfall", then
  return to picking.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch and the
loop back from "Rework / re-pick" to "Quality check".
Message flows:
- "Generate pick list" → Warehouse Management System (WMS)
- "Stage for dispatch and update WMS" → Warehouse Management System (WMS)
- Warehouse Management System (WMS) → "Pick items" (bin locations, stock)

This stage turns a reserved order into picked, packed and quality-checked goods
staged for dispatch — leaving the shipment ready for delivery.
```

### V01.06 — Deliver to Customer

**BPMN diagram prompt.**

```text
BPMN: V01.06 Deliver to Customer — sixth stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party receiving the goods.
- Pool "Sales Organisation" — the organisation, with one lane: "Logistics / Dispatch".
- Pool "Transport Management System (TMS)" — the supporting IT system.
- Pool "Freight Carrier" — the external delivery partner.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- Transport Management System (TMS): black-box, System = true, single instance.
- Freight Carrier: black-box, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool below it, Transport
  Management System and Freight Carrier pools at the bottom.

4. Lane contents in flow order (Sales Organisation)
Logistics / Dispatch lane:
- Message start event "Dispatch-ready shipment received"
- Service task "Book carrier and generate shipping docs"
- User task "Hand over to carrier"
- Send task "Send shipment notification"
- Intermediate message catch event "Proof of delivery received"
- Exclusive gateway "Delivered successfully?"
    - branch "No – failed / returned": User task "Arrange re-delivery or return",
      then back to "Book carrier and generate shipping docs"
    - branch "Yes": continue
- End event "Delivered and POD captured — ready for Issue Invoice (V01.07)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Proof of delivery received" wait:
  "No POD within the promised window" → Send task "Query carrier on status",
  then return to waiting.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch and the
loop back from "Arrange re-delivery or return".
Message flows:
- "Book carrier and generate shipping docs" → Transport Management System (TMS)
- "Book carrier and generate shipping docs" → Freight Carrier
- Freight Carrier → intermediate event "Proof of delivery received"
- "Send shipment notification" → Customer

This stage books and dispatches the shipment, tracks it, and captures proof of
delivery (re-attempting on failure) — leaving a delivered order ready for invoicing.
```

### V01.07 — Issue Invoice

**BPMN diagram prompt.**

```text
BPMN: V01.07 Issue Invoice — seventh stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party being invoiced.
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Billing", "Finance".
- Pool "Billing / ERP System" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- Billing / ERP System: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  Billing / ERP System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Billing lane:
- Message start event "Delivered order received"
- Service task "Generate invoice from order and delivery"
- Service task "Apply tax rules"
- User task "Review invoice"
- Exclusive gateway "Invoice correct?"
    - branch "No": User task "Correct invoice", then back to "Review invoice"
    - branch "Yes": continue
- Send task "Issue and send invoice"
Finance lane:
- Service task "Post invoice to accounts receivable"
- End event "Invoice issued and posted — ready for Receive Payment (V01.08)"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch and the
loop back from "Correct invoice" to "Review invoice".
Message flows:
- "Generate invoice from order and delivery" → Billing / ERP System
- "Post invoice to accounts receivable" → Billing / ERP System
- "Issue and send invoice" → Customer

This stage generates, taxes, reviews and issues the customer invoice and posts
it to accounts receivable — leaving an open receivable ready for payment.
```

### V01.08 — Receive Payment

**BPMN diagram prompt.**

```text
BPMN: V01.08 Receive Payment — eighth stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party making the payment.
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Accounts Receivable", "Finance".
- Pool "Payment Gateway / Bank" — the supporting payment provider.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- Payment Gateway / Bank: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  Payment Gateway / Bank pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Accounts Receivable lane:
- Message start event "Payment notification received"
- Service task "Record payment against invoice"
- Exclusive gateway "Paid in full?"
    - branch "Partial": User task "Record part-payment and balance due", then continue
    - branch "Yes": continue
Finance lane:
- Send task "Send payment receipt"
- End event "Payment received — ready for Reconcile Payment (V01.09)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on the "Payment notification received"
  start (the awaiting-payment state): "Invoice overdue" → Send task "Send dunning
  reminder", then continue waiting.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch.
Message flows:
- Customer → start event "Payment notification received" (the remittance / payment)
- Payment Gateway / Bank → "Record payment against invoice" (settlement / clearing)
- "Send payment receipt" → Customer
- "Send dunning reminder" → Customer

This stage records the customer's payment against the invoice (handling partial
payments and chasing overdue ones) — leaving a settled invoice ready for
reconciliation.
```

### V01.09 — Reconcile Payment

**BPMN diagram prompt.**

```text
BPMN: V01.09 Reconcile Payment — ninth stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Accounts Receivable", "Finance".
- Pool "Bank" — the external source of statement data.
- Pool "ERP / General Ledger System" — the supporting IT system.

2. Pool properties
- Sales Organisation: white-box (holds the process flow).
- Bank: black-box, System = true, single instance.
- ERP / General Ledger System: black-box, System = true, single instance.

3. Layout
- Sales Organisation pool at the top, Bank and ERP / General Ledger System
  pools at the bottom.

4. Lane contents in flow order (Sales Organisation)
Accounts Receivable lane:
- Message start event "Bank statement received"
- Service task "Match payments to invoices"
- Exclusive gateway "All matched?"
    - branch "No – unmatched / short": User task "Investigate and allocate",
      then back to "Match payments to invoices"
    - branch "Yes": continue
- Service task "Clear receivable"
Finance lane:
- Service task "Post to general ledger"
- End event "Payment reconciled — ready for Manage Disputes & Deductions (V01.10)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Investigate and allocate": "Unmatched
  item ageing past 5 days" → User task "Escalate to Finance Controller", then
  return to investigation.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch and the
loop back from "Investigate and allocate" to "Match payments to invoices".
Message flows:
- Bank → start event "Bank statement received" (the statement / remittance file)
- ERP / General Ledger System → "Match payments to invoices" (open AR items)
- "Clear receivable" → ERP / General Ledger System
- "Post to general ledger" → ERP / General Ledger System

This stage matches received payments to invoices from the bank statement,
investigates exceptions, clears the receivable and posts to the ledger — leaving
the order financially settled.
```

### V01.10 — Manage Disputes & Deductions

**BPMN diagram prompt.**

```text
BPMN: V01.10 Manage Disputes & Deductions — tenth stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party raising the dispute or deduction.
- Pool "Sales Organisation" — the organisation, with three lanes top-to-bottom:
  "Customer Service", "Accounts Receivable", "Finance".
- Pool "Case / Ticketing System" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Sales Organisation: white-box (holds the process flow).
- Case / Ticketing System: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Sales Organisation pool in the middle,
  Case / Ticketing System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Customer Service lane:
- Message start event "Dispute / deduction raised"
- Service task "Log case"
Accounts Receivable lane:
- User task "Investigate dispute / deduction"
- Exclusive gateway "Claim valid?"
    - branch "Valid": continue to Finance
    - branch "Invalid": Send task "Reject and request payment", then intermediate
      message catch event "Customer responds", then back to "Investigate dispute /
      deduction"
Finance lane:
- Service task "Issue credit note / adjustment"
Customer Service lane:
- Send task "Communicate resolution"
- End event "Dispute resolved — ready for Close Order (V01.11)"

5. Edge-mounted (boundary) events
- Non-interrupting timer boundary event on "Investigate dispute / deduction":
  "SLA breach (case open past target)" → User task "Escalate to Escalation
  Manager", then return to investigation.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch and the
loop back from "Customer responds" to "Investigate dispute / deduction".
Message flows:
- Customer → start event "Dispute / deduction raised" (the claim / short-pay reason)
- "Log case" → Case / Ticketing System
- Case / Ticketing System → "Investigate dispute / deduction" (case history, evidence)
- "Reject and request payment" → Customer
- Customer → intermediate event "Customer responds"
- "Communicate resolution" → Customer

This stage logs, investigates and resolves disputes and deductions — issuing a
credit note where valid or rejecting and chasing payment where not — leaving the
account clean for closure.
```

### V01.11 — Close Order

**BPMN diagram prompt.**

```text
BPMN: V01.11 Close Order — final stage of the Order to Cash (O2C) value chain.

1. Pools & Lanes
- Pool "Sales Organisation" — the organisation, with two lanes top-to-bottom:
  "Order Processing", "Finance".
- Pool "ERP / Order Management System" — the supporting IT system.

2. Pool properties
- Sales Organisation: white-box (holds the process flow).
- ERP / Order Management System: black-box, System = true, single instance.

3. Layout
- Sales Organisation pool at the top, ERP / Order Management System pool at the bottom.

4. Lane contents in flow order (Sales Organisation)
Order Processing lane:
- Message start event "Order ready to close"
- Service task "Verify delivery, invoicing and payment complete"
- Exclusive gateway "All steps complete & no open disputes?"
    - branch "No – open item": User task "Return to responsible stage", then
      End event "Re-opened — routed back to the open stage"
    - branch "Yes": continue
Finance lane:
- Service task "Finalise financials and close order"
- Service task "Archive order records"
- End event "Order closed — Order to Cash complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- ERP / Order Management System → "Verify delivery, invoicing and payment
  complete" (order, delivery, invoice and payment status)
- "Finalise financials and close order" → ERP / Order Management System
- "Archive order records" → ERP / Order Management System

This stage confirms every prior step is complete with no open disputes, finalises
the financials, archives the records and closes the order — completing the
end-to-end Order to Cash cycle.
```

## V02 — Procure to Pay

**Teams and roles involved.**
Procure to Pay involves Procurement, Requesting Departments, Finance, Accounts Payable, Receiving/Warehouse, Legal, Contract Management, and sometimes Risk or Compliance. Key roles include requisitioner, procurement officer, category manager, buyer, approver, goods receipting officer, accounts payable officer, contract manager, and finance controller.

**External participants.**
The main external participant is the Supplier or Seller. The process may be initiated by an internal purchase need, but the external interaction begins when suppliers respond to purchase orders, provide goods or services, submit invoices, or resolve payment queries.

**High-level subprocesses.**
Typical subprocesses are: identify need, create requisition, approve purchase, issue purchase order, receive goods or confirm services, match purchase order/goods receipt/invoice, approve invoice, pay supplier, handle exceptions, and close the procurement transaction.

**Typical IT systems.**
Supporting systems include ERP procurement modules, supplier portal, purchase requisition system, contract management system, inventory or warehouse system, accounts payable system, electronic invoicing system, payment platform, document management, and workflow/approval tools.

**Policies and procedures.**
Key policies include procurement policy, delegation of authority, purchase approval procedure, supplier onboarding policy, conflict of interest policy, contract management procedure, goods receipting procedure, invoice matching rules, payment terms policy, and anti-bribery/corruption controls.

**Information flow between external participants and process.**
Suppliers receive purchase orders, delivery instructions, contract terms, remittance advice, and payment status. Suppliers provide quotes, order acknowledgements, delivery notices, goods/services, invoices, credit notes, tax documents, and bank/payment details.

**Information flow between process and IT systems.**
The process records supplier master data, requisitions, approvals, purchase orders, goods receipts, service confirmations, invoices, payment runs, and accounting entries. IT systems provide approved supplier lists, contract pricing, budget availability, approval status, open purchase orders, invoice exceptions, and payment status.

## V03 — Record to Report

**Teams and roles involved.**
Record to Report involves Finance, Financial Accounting, Management Accounting, Tax, Treasury, Payroll Finance, Accounts Payable, Accounts Receivable, Internal Audit, External Reporting, and senior executives. Key roles include financial accountant, management accountant, tax accountant, finance controller, CFO, reconciliations analyst, reporting analyst, and auditor.

**External participants.**
This process is usually cycle-driven rather than initiated by a single external participant. Important external participants include Regulators, Tax Authorities, External Auditors, Shareholders, Banks, Owners, and Board Members. They consume or review the financial outputs of the process.

**High-level subprocesses.**
Typical subprocesses are: capture financial transactions, post journals, maintain chart of accounts, reconcile accounts, manage accruals and provisions, close accounting periods, consolidate entities, prepare management reports, prepare statutory reports, submit tax/regulatory returns, and support audit.

**Typical IT systems.**
Supporting systems include ERP general ledger, sub-ledgers, consolidation system, financial close system, tax system, treasury system, payroll system, fixed asset register, reporting/BI platform, document management system, and audit management tools.

**Policies and procedures.**
Key policies include accounting policy, chart of accounts governance, journal posting procedure, month-end close procedure, reconciliation policy, accruals policy, tax compliance policy, financial delegation policy, audit procedure, and statutory reporting requirements.

**Information flow between external participants and process.**
External auditors, regulators, tax authorities, banks, and owners may request financial statements, reconciliations, supporting schedules, tax returns, compliance reports, or audit evidence. The process provides financial statements, management reports, statutory returns, audit responses, covenant reporting, and tax submissions.

**Information flow between process and IT systems.**
The process consumes transactions from sales, procurement, payroll, assets, inventory, banking, and other operational systems. It creates journals, reconciliations, close tasks, consolidation entries, tax calculations, reporting packs, audit evidence, and final financial statements.

## V04 — Hire to Retire

**Teams and roles involved.**
Hire to Retire involves Human Resources, Recruitment, Hiring Managers, Payroll, IT, Facilities, Learning and Development, Legal, Finance, and sometimes Security or Compliance. Key roles include recruiter, HR business partner, hiring manager, payroll officer, onboarding coordinator, training manager, employee relations adviser, IT provisioning officer, and people manager.

**External participants.**
The main external participant at the start is the Applicant or Candidate. Once hired, the main participant becomes the Employee. Other external participants may include recruitment agencies, referees, background check providers, training providers, benefits providers, and superannuation/pension funds.

**High-level subprocesses.**
Typical subprocesses are: workforce planning, create vacancy, attract candidates, assess and interview candidates, make offer, onboard employee, provision access/equipment, manage payroll and benefits, manage performance, develop employee, manage changes, handle leave/absence, and offboard/retire employee.

**Typical IT systems.**
Supporting systems include HRIS/HCM, applicant tracking system, payroll system, learning management system, identity and access management system, workforce management system, performance management system, employee self-service portal, document management, and case management system.

**Policies and procedures.**
Key policies include recruitment policy, equal opportunity policy, background check procedure, employment contract policy, onboarding procedure, remuneration policy, leave policy, performance management procedure, workplace conduct policy, health and safety policy, disciplinary procedure, and termination/offboarding procedure.

**Information flow between external participants and process.**
Applicants provide resumes, applications, interview availability, identity documents, references, and employment history. The process provides job advertisements, interview invitations, assessment instructions, offer letters, contracts, onboarding instructions, employment communications, payslips, performance feedback, and exit documentation.

**Information flow between process and IT systems.**
The process creates and updates candidate records, employee master data, contracts, payroll details, tax information, benefits records, leave balances, training records, performance reviews, access requests, equipment allocations, and termination records. Systems provide vacancy status, candidate status, employee lifecycle status, payroll calculations, compliance alerts, and workforce reporting.

## V05 — Plan to Produce

**Teams and roles involved.**
Plan to Produce involves Demand Planning, Supply Planning, Production Planning, Manufacturing Operations, Procurement, Warehouse, Quality Assurance, Maintenance, Engineering, Finance, and Logistics. Key roles include demand planner, production planner, plant manager, production supervisor, machine operator, quality inspector, maintenance technician, inventory controller, and supply chain manager.

**External participants.**
The external participants are usually indirect. The main external trigger may be Customer Demand, a Distributor, a Retailer, or a forecast from the market. Suppliers and contract manufacturers may also participate during production planning and execution.

**High-level subprocesses.**
Typical subprocesses are: forecast demand, plan supply, create production plan, check capacity and materials, schedule production, issue materials, manufacture product, inspect quality, manage exceptions, record production output, move finished goods to inventory, and close production orders.

**Typical IT systems.**
Supporting systems include ERP manufacturing modules, material requirements planning system, advanced planning and scheduling system, manufacturing execution system, warehouse management system, quality management system, maintenance management system, product lifecycle management system, and reporting/BI tools.

**Policies and procedures.**
Key policies include production planning policy, inventory policy, quality policy, safety procedure, bill of materials governance, production scheduling procedure, material handling procedure, maintenance procedure, batch/lot traceability procedure, and non-conformance procedure.

**Information flow between external participants and process.**
Customers, distributors, and market channels provide demand signals, orders, forecasts, service-level expectations, and product requirements. Suppliers provide material availability, lead times, substitutions, and delivery confirmations. The process may provide production availability, delivery promise dates, shortage notices, and fulfilment commitments.

**Information flow between process and IT systems.**
The process consumes demand forecasts, sales orders, inventory levels, bills of materials, routings, supplier lead times, capacity data, and quality specifications. It creates production plans, work orders, material reservations, shop-floor instructions, quality results, production confirmations, inventory movements, and cost postings.

## V06 — Idea to Market

**Teams and roles involved.**
Idea to Market involves Strategy, Product Management, Research and Development, Innovation, Marketing, Sales, Customer Experience, Engineering, Finance, Legal, Risk, Compliance, Operations, and sometimes external partners. Key roles include product manager, product owner, innovation lead, business analyst, designer, engineer, market researcher, compliance adviser, pricing analyst, and launch manager.

**External participants.**
External participants may include Customers, Inventors, Research Partners, Design Partners, Regulators, Beta Users, Distributors, or Investors. The process may be initiated by a market opportunity, customer need, internal idea, invention, regulatory change, or competitive pressure.

**High-level subprocesses.**
Typical subprocesses are: identify opportunity, capture ideas, assess feasibility, define business case, design solution, develop prototype, test with users, validate commercial model, prepare launch, release to market, monitor adoption, and refine product/service.

**Typical IT systems.**
Supporting systems include idea management platform, product lifecycle management system, project portfolio management system, CRM, market research tools, design/prototyping tools, requirements management tools, collaboration tools, document management, analytics/BI, and marketing automation.

**Policies and procedures.**
Key policies include innovation governance, product development methodology, business case approval procedure, intellectual property policy, customer research policy, privacy policy, regulatory compliance procedure, product safety policy, pricing policy, launch readiness checklist, and change control procedure.

**Information flow between external participants and process.**
Customers and market participants provide needs, feedback, complaints, survey responses, test results, buying signals, and usage data. Inventors or partners provide concepts, prototypes, technical details, or research findings. The process provides concept descriptions, prototypes, trial invitations, product information, launch communications, and post-launch updates.

**Information flow between process and IT systems.**
The process records ideas, opportunity assessments, requirements, designs, business cases, approvals, test results, launch plans, product data, pricing data, campaign assets, and performance metrics. Systems provide market insights, customer data, portfolio status, development progress, risk/compliance status, and launch performance reporting.

## V07 — Issue to Resolution

**Teams and roles involved.**
Issue to Resolution involves Customer Service, Technical Support, Service Operations, Complaints Management, Quality Assurance, Field Service, Product/Engineering, Legal, Risk, and sometimes Finance. Key roles include customer service agent, support analyst, complaints officer, case manager, service technician, product specialist, quality analyst, escalation manager, and customer experience manager.

**External participants.**
The main external participant is the Complainant, Customer, User, or Requester. The process is initiated when that participant raises an issue, complaint, defect, service request, warranty claim, incident, or query.

**High-level subprocesses.**
Typical subprocesses are: receive issue, identify customer/user, classify issue, assess severity and entitlement, investigate, diagnose root cause, resolve or fulfil request, escalate if needed, communicate outcome, obtain confirmation, close case, and analyse trends.

**Typical IT systems.**
Supporting systems include CRM, case management system, ticketing platform, customer portal, knowledge base, field service system, warranty system, product defect system, call centre/telephony platform, email management, workflow system, and analytics/BI.

**Policies and procedures.**
Key policies include complaints handling policy, service-level agreement procedure, escalation procedure, warranty policy, refund/returns policy, privacy policy, customer communication standards, incident management procedure, root cause analysis procedure, and regulatory reporting requirements.

**Information flow between external participants and process.**
The customer or complainant provides issue details, evidence, product/service information, impact description, contact details, and desired resolution. The process provides acknowledgement, case number, status updates, requests for further information, resolution advice, compensation/refund information, closure confirmation, and escalation outcomes.

**Information flow between process and IT systems.**
The process creates and updates cases, tickets, call logs, correspondence, issue categories, severity ratings, SLA timers, escalation records, knowledge articles, resolution codes, refund/credit requests, defect records, and trend reports. Systems provide customer history, product/service history, entitlement, prior issues, knowledge articles, SLA status, and reporting dashboards.

## V08 — Acquire to Retire

**Teams and roles involved.**
Acquire to Retire involves Asset Management, Finance, Procurement, IT, Facilities, Operations, Maintenance, Legal, Risk, and sometimes Health and Safety. Key roles include asset manager, procurement officer, finance accountant, maintenance planner, facilities manager, IT asset manager, operations manager, depreciation accountant, and disposal coordinator.

**External participants.**
External participants include Asset Seller, Supplier, Lessor, Service Provider, Maintenance Contractor, Insurer, and sometimes the Buyer of a disposed asset. The process is usually initiated by an internal asset need, but external parties supply, service, insure, lease, or purchase the asset.

**High-level subprocesses.**
Typical subprocesses are: identify asset need, approve investment, acquire or lease asset, receive and register asset, deploy asset, maintain asset, monitor utilisation and condition, account for depreciation, manage impairments or transfers, dispose/sell/write off asset, and close asset record.

**Typical IT systems.**
Supporting systems include ERP fixed asset register, procurement system, enterprise asset management system, maintenance management system, IT asset management system, facilities management system, inventory system, finance/general ledger, document management, and reporting/BI.

**Policies and procedures.**
Key policies include capital expenditure policy, asset capitalisation policy, procurement policy, depreciation policy, asset tagging procedure, maintenance procedure, health and safety requirements, insurance procedure, impairment policy, disposal policy, and delegation of authority.

**Information flow between external participants and process.**
Suppliers and sellers provide quotes, specifications, delivery details, warranties, invoices, and service records. Maintenance providers provide inspection reports, repair records, and condition assessments. Buyers or disposal agents receive asset details, sale terms, transfer documentation, and ownership/disposal records.

**Information flow between process and IT systems.**
The process records approved capital requests, purchase orders, asset master data, serial numbers, location, custodian, depreciation rules, maintenance schedules, work orders, condition data, impairment assessments, disposal approvals, sale proceeds, and accounting entries. Systems provide asset values, lifecycle status, maintenance history, utilisation, depreciation, and compliance reporting.

## V09 — Source to Contract

**Teams and roles involved.**
Source to Contract involves Procurement, Category Management, Legal, Business Owners, Finance, Risk, Compliance, Vendor Management, and sometimes IT Security or Data Protection. Key roles include category manager, sourcing specialist, procurement manager, contract manager, legal counsel, business owner, risk officer, vendor manager, and commercial analyst.

**External participants.**
The main external participant is the Prospective Supplier, Vendor, Seller, or Service Provider. The process is usually initiated by a sourcing need, renewal requirement, market engagement, or strategic category plan. Suppliers participate through RFIs, RFPs, RFQs, negotiations, due diligence, and contract agreement.

**High-level subprocesses.**
Typical subprocesses are: define sourcing need, analyse spend/category, identify supplier market, issue RFI/RFP/RFQ, evaluate responses, shortlist suppliers, conduct due diligence, negotiate commercial terms, draft contract, approve contract, execute contract, and hand over to supplier management or Procure to Pay.

**Typical IT systems.**
Supporting systems include sourcing platform, supplier relationship management system, contract lifecycle management system, procurement/ERP system, eTendering platform, risk management system, document management, eSignature platform, supplier portal, and analytics/BI tools.

**Policies and procedures.**
Key policies include sourcing policy, procurement thresholds, tendering procedure, supplier due diligence policy, conflict of interest policy, delegation of authority, contract approval policy, data protection/security requirements, modern slavery or ESG policy, anti-bribery policy, and contract management procedure.

**Information flow between external participants and process.**
Suppliers receive market engagement documents, tender packs, specifications, evaluation criteria, contract terms, clarification questions, and award/decline notices. Suppliers provide capability statements, proposals, pricing, compliance responses, risk attestations, insurance details, financial information, and negotiated contract positions.

**Information flow between process and IT systems.**
The process records sourcing events, supplier lists, requirements, tender documents, supplier responses, evaluation scores, risk assessments, negotiation records, approvals, contract drafts, executed contracts, obligations, pricing, and supplier master data. Systems provide spend analysis, supplier performance history, contract templates, approval workflows, risk alerts, and contract repository access.
