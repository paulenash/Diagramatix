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

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Order to Cash service area. It shows
the **Actors**, **Services**, **Processes**, **Interfaces** and **Applications**
that provide the Product Ordering Service and the related customer-facing
services across the eleven V01 processes. Each Business Process is a drill-down
anchor: link it to the matching V01.nn BPMN diagram and its marker turns green.

```text
ArchiMate: V01 — Order to Cash — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Product Ordering Service and
the related services to the Customer across the eleven V01 Order to Cash
processes, and the applications that support them. Lay it out in three
horizontal bands, top to bottom — BUSINESS SERVICES → BUSINESS PROCESSES →
APPLICATIONS — with the Customer on the far left and the delivery/settlement
actors on the far right. Read top-to-bottom as service → process → application
(ArchiMate service realisation).

1. Business Actors (Business Actor)
- Customer — the external party the services are provided to (far left, the
  recipient of every service).
- Freight Carrier, Payment Gateway, Bank — external actors that take part in
  delivery and settlement (far right).

2. Interfaces
- Business Interface "Customer Portal / Order Channel" — the channel the
  Customer uses to place orders, track delivery, receive invoices and pay.
  The Customer ACCESSES this interface; the interface SERVES the business
  services below.
- Application Interfaces (optional, only the few the Customer Portal calls):
  "Ordering API" on the OMS, "Payments API" on the Payment Gateway.

3. Business Services (Business Service) — the customer-facing services
   provided, top band, left-to-right in customer-journey order:
- Product Ordering Service — take, validate, price and confirm the order.
- Order Fulfilment & Delivery Service — pick, pack and deliver the goods.
- Invoicing & Billing Service — issue invoices and statements.
- Payment & Settlement Service — collect and reconcile payment.
- Dispute & Returns Service — handle disputes, deductions and returns.
- Order Closure Service — finalise and close the order.

4. Business Processes (Business Process) — the eleven V01 processes, middle
   band in V01.01 → V01.11 order. Each REALISES the business service shown and
   is the link anchor to its BPMN diagram:
- V01.01 Receive Order              -> realises Product Ordering Service
- V01.02 Validate Customer / Order  -> realises Product Ordering Service
- V01.03 Check Credit & Pricing     -> realises Product Ordering Service
- V01.04 Confirm Availability       -> realises Product Ordering Service
- V01.05 Fulfil Goods or Services   -> realises Order Fulfilment & Delivery Service
- V01.06 Deliver to Customer        -> realises Order Fulfilment & Delivery Service
- V01.07 Issue Invoice              -> realises Invoicing & Billing Service
- V01.08 Receive Payment            -> realises Payment & Settlement Service
- V01.09 Reconcile Payment          -> realises Payment & Settlement Service
- V01.10 Manage Disputes & Deductions -> realises Dispute & Returns Service
- V01.11 Close Order                -> realises Order Closure Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Order Management System (OMS)
- Customer Master Data System (CRM/ERP)
- ERP / Credit System
- Inventory / Warehouse System (WMS)
- Transport Management System (TMS)
- Billing / ERP System
- Payment Gateway / Bank Interface
- ERP / General Ledger System
- Case / Ticketing System

6. Relationships
- Customer -accesses-> Customer Portal / Order Channel.
- Customer Portal / Order Channel -serving-> each Business Service.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V01.01 <- OMS;                 V01.02 <- Customer Master Data (CRM/ERP);
    V01.03 <- ERP / Credit System; V01.04 <- Inventory / Warehouse (WMS);
    V01.05 <- Inventory / Warehouse (WMS); V01.06 <- Transport Management (TMS);
    V01.07 <- Billing / ERP;       V01.08 <- Payment Gateway / Bank;
    V01.09 <- ERP / General Ledger; V01.10 <- Case / Ticketing;
    V01.11 <- OMS + ERP / General Ledger.
- Freight Carrier -serving-> V01.06 Deliver to Customer.
- Payment Gateway and Bank -serving-> V01.08 Receive Payment and
  V01.09 Reconcile Payment.

7. Intent
The Product Ordering Service sits top-left as the headline service. The eleven
Business Processes form the backbone in V01.01 -> V01.11 order so the reader can
trace the customer journey and drill from any process straight into its detailed
BPMN model. This one ArchiMate view therefore links to all eleven V01 BPMN
process diagrams. The mapping of process -> actors/teams/applications is the
Process <-> Actors / Teams / IT Systems matrix above.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V02 - Procure to Pay (P2P)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V02.01. Identify Need
V02.02. Create Requisition
V02.03. Approve Purchase
V02.04. Issue Purchase Order
V02.05. Receive Goods / Confirm Services
V02.06. Match PO / GR / Invoice
V02.07. Approve Invoice
V02.08. Pay Supplier
V02.09. Handle Exceptions
V02.10. Close Procurement Transaction

This is the supply-side, spend-management end-to-end process: an internal
purchase need flows through requisition, approval, ordering, receipt,
three-way matching, invoice approval and payment. The main external
participant is the Supplier (Seller); the process is triggered by an
internal need (a reorder point, a project requirement or a replenishment),
and the external interaction begins when the purchase order is issued to
the supplier.
```

**Context diagram prompt.**

```text
Context Diagram: V02 — Procure to Pay (P2P).

1. Central system (process-system)
A single central process/system ellipse named "Procurement Company"
representing the whole organisation that runs the Procure to Pay process. It
is the system in context: everything inside it — requesting departments,
procurement, receiving, accounts payable, finance and the supporting IT
systems (ERP procurement, requisition, supplier portal, contract, warehouse,
accounts payable and general ledger) — is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Supplier
- Freight Carrier
- Payment Platform
- Bank

3. Layout
"Procurement Company" sits in the centre. The Supplier sits to the RIGHT
(the supply side that receives orders and is paid). Freight Carrier sits to
the RIGHT (delivery). Payment Platform and Bank sit to the RIGHT (settlement).
The demand originates INSIDE the company (an internal need), so no external
demand actor sits on the left. Every external entity connects directly to the
central system with labelled information flows; entities never connect to one
another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Procurement Company → Supplier: request for quote, purchase order, delivery
  instructions, contract terms, remittance advice, payment status.
- Supplier → Procurement Company: quote, order acknowledgement, delivery
  notice, goods / services, invoice, credit note, tax documents, bank details.
- Procurement Company → Freight Carrier: inbound collection / delivery
  booking (where the buyer arranges carriage).
- Freight Carrier → Procurement Company: delivery notification & proof of
  delivery.
- Procurement Company → Payment Platform: payment instruction / payment run.
- Payment Platform → Procurement Company: payment confirmation & settlement
  advice.
- Bank → Procurement Company: bank statement & cleared payments.
- Procurement Company → Bank: payment file & remittance details.

This Context Diagram frames the Procurement Company as a single system in
context: an internal need drives the Procure to Pay process, the Supplier
provides the goods or services and is paid, the Freight Carrier delivers, and
the Payment Platform and Bank settle payment. The four external entities are
exactly the external actors of the Process Context diagram below, so the two
views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V02 — Procure to Pay (P2P).

1. System boundary and processes
A system boundary named "V02 — Procure to Pay" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V02.01 Identify Need
- V02.02 Create Requisition
- V02.03 Approve Purchase
- V02.04 Issue Purchase Order
- V02.05 Receive Goods / Confirm Services
- V02.06 Match PO / GR / Invoice
- V02.07 Approve Invoice
- V02.08 Pay Supplier
- V02.09 Handle Exceptions
- V02.10 Close Procurement Transaction

2. Participants (outside the boundary)
External actors (actor):
- Supplier
- Freight Carrier
- Bank
- Payment Platform
Internal teams (team):
- Requesting Department
- Procurement
- Budget Holder / Approver
- Contract Management
- Receiving / Warehouse
- Accounts Payable
- Finance / Treasury
IT systems (system):
- ERP / Catalogue System
- Purchase Requisition System
- ERP / Budgeting System
- ERP Procurement System / Supplier Portal
- Inventory / Warehouse System (GRN)
- Accounts Payable / Invoice System
- Payment Platform / Banking System
- Case / Workflow System
- ERP / General Ledger System

3. Layout
The processes sit inside the boundary in V02.01 → V02.10 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V02.01 Identify Need — Requesting Department (raise need), Procurement
  (confirm category & budget); ERP / Catalogue System (catalogue & preferred
  suppliers).
- V02.02 Create Requisition — Requesting Department (raise requisition),
  Procurement (review); Purchase Requisition System (record).
- V02.03 Approve Purchase — Budget Holder / Approver (approve), Finance
  (commitment); ERP / Budgeting System (budget & commitment).
- V02.04 Issue Purchase Order — Supplier (receive PO & acknowledge);
  Procurement (issue), Contract Management (terms); ERP Procurement System /
  Supplier Portal (generate & send).
- V02.05 Receive Goods / Confirm Services — Supplier (deliver / perform),
  Freight Carrier (delivery & POD); Receiving / Warehouse (receipt), Requesting
  Department (confirm service); Inventory / Warehouse System (GRN).
- V02.06 Match PO / GR / Invoice — Supplier (submit invoice); Accounts Payable
  (three-way match); Accounts Payable / Invoice System (capture & match).
- V02.07 Approve Invoice — Supplier (query resolution); Accounts Payable
  (prepare), Budget Holder / Approver (approve), Finance (post accrual);
  Accounts Payable / Invoice System (approval & posting).
- V02.08 Pay Supplier — Supplier (receive payment & remittance), Payment
  Platform, Bank (settlement); Accounts Payable, Finance / Treasury (pay);
  Payment Platform / Banking System (execute & settle).
- V02.09 Handle Exceptions — Supplier (dispute / query); Accounts Payable,
  Procurement, Finance (log, resolve, adjust); Case / Workflow System (case
  management).
- V02.10 Close Procurement Transaction — Procurement, Finance (verify,
  finalise, archive); ERP Procurement System, ERP / General Ledger System
  (status & close).

This Process Context diagram frames the whole Procure to Pay value chain: the
ten subprocesses inside the boundary, the external actors (Supplier, Freight
Carrier, Bank, Payment Platform) and internal teams that perform them, and the
IT systems that support them — consistent with the per-process BPMN prompts
below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Buying Organisation" pool (key role in brackets), and IT systems
are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V02.01** Identify Need | — | Requesting Department (requisitioner), Procurement (procurement officer) | ERP / Catalogue System |
| **V02.02** Create Requisition | — | Requesting Department (requisitioner), Procurement (buyer) | Purchase Requisition System |
| **V02.03** Approve Purchase | — | Procurement (buyer), Budget Holder / Approver (approver), Finance / Treasury (finance controller) | ERP / Budgeting System |
| **V02.04** Issue Purchase Order | Supplier | Procurement (buyer), Contract Management (contract manager) | ERP Procurement System / Supplier Portal |
| **V02.05** Receive Goods / Confirm Services | Supplier, Freight Carrier | Receiving / Warehouse (goods receipting officer), Requesting Department (requisitioner) | Inventory / Warehouse System (GRN) |
| **V02.06** Match PO / GR / Invoice | Supplier | Accounts Payable (accounts payable officer) | Accounts Payable / Invoice System |
| **V02.07** Approve Invoice | Supplier | Accounts Payable (accounts payable officer), Budget Holder / Approver (approver), Finance / Treasury (finance controller) | Accounts Payable / Invoice System |
| **V02.08** Pay Supplier | Supplier, Payment Platform, Bank | Accounts Payable (accounts payable officer), Finance / Treasury (treasury officer) | Payment Platform / Banking System |
| **V02.09** Handle Exceptions | Supplier | Accounts Payable (accounts payable officer), Procurement (category manager), Finance / Treasury (finance controller) | Case / Workflow System |
| **V02.10** Close Procurement Transaction | — | Procurement (procurement officer), Finance / Treasury (finance controller) | ERP Procurement System, ERP / General Ledger System |

**Actor / Team / System roll-up** (every distinct participant across V02):

- **External actors:** Supplier (V02.04–V02.09); Freight Carrier (V02.05); Payment Platform (V02.08); Bank (V02.08).
- **Teams:** Requesting Department (V02.01, V02.02, V02.05); Procurement (V02.01–V02.04, V02.09, V02.10); Budget Holder / Approver (V02.03, V02.07); Contract Management (V02.04); Receiving / Warehouse (V02.05); Accounts Payable (V02.06–V02.09); Finance / Treasury (V02.03, V02.07, V02.08, V02.09, V02.10).
- **IT systems:** ERP / Catalogue System (V02.01); Purchase Requisition System (V02.02); ERP / Budgeting System (V02.03); ERP Procurement System / Supplier Portal (V02.04, V02.10); Inventory / Warehouse System / GRN (V02.05); Accounts Payable / Invoice System (V02.06, V02.07); Payment Platform / Banking System (V02.08); Case / Workflow System (V02.09); ERP / General Ledger System (V02.10).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Procure to Pay service area. It shows
the **Actors**, **Services**, **Processes**, **Interfaces** and **Applications**
that provide the Purchasing Service and the related supplier-facing services
across the ten V02 processes. Each Business Process is a drill-down anchor: link
it to the matching V02.nn BPMN diagram and its marker turns green.

```text
ArchiMate: V02 — Procure to Pay — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Purchasing Service and the
related services (to the internal requesters and to the Supplier) across the ten
V02 Procure to Pay processes, and the applications that support them. Lay it out
in three horizontal bands, top to bottom — BUSINESS SERVICES → BUSINESS
PROCESSES → APPLICATIONS — with the internal Requesting Department on the far
left and the Supplier / settlement actors on the far right. Read top-to-bottom
as service → process → application (ArchiMate service realisation).

1. Business Actors (Business Actor)
- Requesting Department — the internal party the purchasing service is provided
  to (far left, the originator of every need).
- Supplier — the external party that fulfils the order and is paid (far right).
- Freight Carrier, Payment Platform, Bank — external actors that take part in
  delivery and settlement (far right).

2. Interfaces
- Business Interface "Supplier Portal / Purchasing Channel" — the channel the
  Supplier uses to receive orders, acknowledge, deliver, invoice and be paid.
  The Supplier ACCESSES this interface; the interface SERVES the business
  services below.
- Application Interfaces (optional, only the few the portal calls): "Ordering
  API" on the ERP Procurement System, "Payments API" on the Payment Platform.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in procurement-journey order:
- Requisition & Approval Service — capture the need, requisition and approve.
- Purchasing Service — issue the purchase order to the supplier.
- Goods & Service Receipt Service — receive goods, confirm services.
- Invoice Matching & Approval Service — match and approve supplier invoices.
- Payment & Settlement Service — pay the supplier and settle.
- Exception & Closure Service — resolve exceptions and close the transaction.

4. Business Processes (Business Process) — the ten V02 processes, middle band in
   V02.01 → V02.10 order. Each REALISES the business service shown and is the
   link anchor to its BPMN diagram:
- V02.01 Identify Need                    -> realises Requisition & Approval Service
- V02.02 Create Requisition               -> realises Requisition & Approval Service
- V02.03 Approve Purchase                 -> realises Requisition & Approval Service
- V02.04 Issue Purchase Order             -> realises Purchasing Service
- V02.05 Receive Goods / Confirm Services -> realises Goods & Service Receipt Service
- V02.06 Match PO / GR / Invoice          -> realises Invoice Matching & Approval Service
- V02.07 Approve Invoice                  -> realises Invoice Matching & Approval Service
- V02.08 Pay Supplier                     -> realises Payment & Settlement Service
- V02.09 Handle Exceptions                -> realises Exception & Closure Service
- V02.10 Close Procurement Transaction    -> realises Exception & Closure Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- ERP / Catalogue System
- Purchase Requisition System
- ERP / Budgeting System
- ERP Procurement System / Supplier Portal
- Inventory / Warehouse System (GRN)
- Accounts Payable / Invoice System
- Payment Platform / Banking System
- Case / Workflow System
- ERP / General Ledger System

6. Relationships
- Supplier -accesses-> Supplier Portal / Purchasing Channel.
- Supplier Portal / Purchasing Channel -serving-> the Purchasing, Receipt,
  Invoice and Payment services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V02.01 <- ERP / Catalogue System;      V02.02 <- Purchase Requisition System;
    V02.03 <- ERP / Budgeting System;       V02.04 <- ERP Procurement / Supplier Portal;
    V02.05 <- Inventory / Warehouse (GRN);  V02.06 <- Accounts Payable / Invoice System;
    V02.07 <- Accounts Payable / Invoice System; V02.08 <- Payment Platform / Banking;
    V02.09 <- Case / Workflow System;       V02.10 <- ERP Procurement + ERP / General Ledger.
- Freight Carrier -serving-> V02.05 Receive Goods / Confirm Services.
- Payment Platform and Bank -serving-> V02.08 Pay Supplier.

7. Intent
The Purchasing Service sits top-centre as the headline service. The ten Business
Processes form the backbone in V02.01 -> V02.10 order so the reader can trace
the procurement journey and drill from any process straight into its detailed
BPMN model. This one ArchiMate view therefore links to all ten V02 BPMN process
diagrams. The mapping of process -> actors/teams/applications is the Process
<-> Actors / Teams / IT Systems matrix above.
```

**BPMN prompt conventions (V02 onward).**

The per-process BPMN prompts below follow three modelling conventions that
differ from V01, applied consistently across every stage:

1. **Rework / retry = Expanded Subprocess with a loop marker.** Any place a step
   may need to be repeated until it succeeds (correct a document, resolve a
   mismatch, chase a supplier response) is modelled as an **Expanded Subprocess**
   carrying a **standard loop marker (⟳)**. Its internals show a single attempt
   (try → optional wait → an exclusive gateway "«resolved?»" whose "Yes" reaches
   the subprocess end); the loop marker repeats the attempt while the condition
   is unmet — so no loop-back sequence flow is drawn inside the subprocess.
2. **Timeouts = interrupting timer boundary event on the Expanded Subprocess.**
   Each retry subprocess carries one **interrupting timer boundary event** on its
   boundary ("«deadline»"). When it fires it cancels the subprocess (all retries)
   and routes to an "Escalate to «manager»" task followed by an **escalation end
   event** — this stage ends abnormally and the parent value chain decides what
   happens next. **No non-interrupting boundary events are used anywhere.**
3. **Consistent numbering.** Stages are numbered V02.01 … V02.10 exactly as the
   high-level subprocess list and every other V02 diagram above.

### V02.01 — Identify Need

**BPMN diagram prompt.**

```text
BPMN: V02.01 Identify Need — first stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Buying Organisation" — the organisation running the process, with two
  lanes top-to-bottom: "Requesting Department", "Procurement".
- Pool "ERP / Catalogue System" — the supporting IT system.

2. Pool properties
- Buying Organisation: white-box (holds the process flow).
- ERP / Catalogue System: black-box, System = true, single instance.

3. Layout
- Buying Organisation pool at the top, ERP / Catalogue System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Requesting Department lane:
- Conditional start event "Need identified" (reorder point reached, project
  requirement, or replenishment)
- Expanded Subprocess (LOOP marker) "Complete requirement details":
    internals — User task "Define requirement (spec, quantity, budget code)",
    then exclusive gateway "Requirement complete?": branch "Yes" → subprocess
    end event "Requirement complete". The loop marker repeats the attempt while
    the requirement is incomplete.
- Service task "Check catalogue / preferred suppliers"
- Exclusive gateway "Catalogue item / preferred supplier available?"
    - branch "No – new source needed": End event "New source required — route to
      Source to Contract (V09)"
    - branch "Yes": continue to Procurement
Procurement lane:
- Service task "Confirm budget code and category"
- End event "Need defined — ready for Create Requisition (V02.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete requirement details"
  Expanded Subprocess: "Requirement not completed in 3 business days" → User
  task "Escalate to Department Manager" → escalation end event "Escalated —
  need not defined in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check catalogue / preferred suppliers" → ERP / Catalogue System
- ERP / Catalogue System → "Confirm budget code and category" (catalogue lines,
  preferred suppliers, budget code)

This is the internal entry point of P2P: a purchase need is raised and its
requirement fully defined (retried until complete), checked against the
catalogue and preferred suppliers, and confirmed against a budget code —
leaving a defined need ready to become a requisition.
```

### V02.02 — Create Requisition

**BPMN diagram prompt.**

```text
BPMN: V02.02 Create Requisition — second stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Buying Organisation" — the organisation, with two lanes top-to-bottom:
  "Requesting Department", "Procurement".
- Pool "Purchase Requisition System" — the supporting IT system.

2. Pool properties
- Buying Organisation: white-box (holds the process flow).
- Purchase Requisition System: black-box, System = true, single instance.

3. Layout
- Buying Organisation pool at the top, Purchase Requisition System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Requesting Department lane:
- Message start event "Defined need received"
- User task "Raise purchase requisition"
- Service task "Attach quotes / catalogue lines"
Procurement lane:
- Expanded Subprocess (LOOP marker) "Correct requisition":
    internals — User task "Review requisition (completeness, category, supplier)",
    then exclusive gateway "Requisition OK?": branch "No" → User task "Amend
    requisition" → subprocess end event "Amendment recorded" (the loop marker
    then re-reviews); branch "Yes" → subprocess end event "Requisition correct".
    The loop marker repeats while the requisition is not OK.
- Service task "Record requisition in Purchase Requisition System"
- End event "Requisition created — ready for Approve Purchase (V02.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Correct requisition" Expanded
  Subprocess: "Not corrected in 2 business days" → User task "Escalate to
  Procurement Lead" → escalation end event "Escalated — requisition not corrected
  in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Record requisition in Purchase Requisition System" → Purchase Requisition System
- Purchase Requisition System → "Review requisition (completeness, category,
  supplier)" (duplicate check, catalogue & contract references)

This stage turns a defined need into a complete, reviewed purchase requisition
(corrected until it passes review) recorded in the requisition system — leaving a
clean requisition ready for approval.
```

### V02.03 — Approve Purchase

**BPMN diagram prompt.**

```text
BPMN: V02.03 Approve Purchase — third stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Buying Organisation" — the organisation, with three lanes top-to-bottom:
  "Procurement", "Budget Holder / Approver", "Finance / Treasury".
- Pool "ERP / Budgeting System" — the supporting IT system.

2. Pool properties
- Buying Organisation: white-box (holds the process flow).
- ERP / Budgeting System: black-box, System = true, single instance.

3. Layout
- Buying Organisation pool at the top, ERP / Budgeting System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Procurement lane:
- Message start event "Requisition to approve received"
- Service task "Check budget availability"
Budget Holder / Approver lane:
- Exclusive gateway "Within delegation & budget?"
    - branch "Approved": continue to Finance / Treasury
    - branch "Refer – needs rework": Expanded Subprocess (LOOP marker) "Revise
      and re-submit for approval": internals — User task "Revise requisition /
      justification", then User task "Re-submit to approver", then exclusive
      gateway "Approved now?": branch "Yes" → subprocess end event "Approved".
      The loop marker repeats while approval is withheld.
    - branch "Rejected": End event "Purchase rejected — requisition closed"
Finance / Treasury lane:
- Service task "Record approval and commitment"
- End event "Purchase approved — ready for Issue Purchase Order (V02.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Revise and re-submit for approval"
  Expanded Subprocess: "Not approved in 3 business days" → User task "Escalate to
  Finance Controller" → escalation end event "Escalated — approval not obtained
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check budget availability" → ERP / Budgeting System
- ERP / Budgeting System → "Within delegation & budget?" (budget balance,
  delegation limits, existing commitments)
- "Record approval and commitment" → ERP / Budgeting System

This stage checks budget and delegation and approves the purchase — reworking and
re-submitting where referred, rejecting where out of policy — leaving an approved,
committed purchase ready to become a purchase order.
```

### V02.04 — Issue Purchase Order

**BPMN diagram prompt.**

```text
BPMN: V02.04 Issue Purchase Order — fourth stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party that receives the purchase order.
- Pool "Buying Organisation" — the organisation, with two lanes top-to-bottom:
  "Procurement", "Contract Management".
- Pool "ERP Procurement System / Supplier Portal" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Buying Organisation: white-box (holds the process flow).
- ERP Procurement System / Supplier Portal: black-box, System = true, single instance.

3. Layout
- Supplier pool at the top, Buying Organisation pool in the middle,
  ERP Procurement System / Supplier Portal pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Procurement lane:
- Message start event "Approved requisition received"
- Service task "Generate purchase order"
Contract Management lane:
- User task "Check contract / terms & conditions"
- Exclusive gateway "Under existing contract?"
    - branch "Yes": continue to Procurement
    - branch "No – terms needed": Expanded Subprocess (LOOP marker) "Agree PO
      terms with supplier": internals — Send task "Send PO terms to supplier",
      then intermediate message catch event "Supplier responds (accept /
      counter)", then exclusive gateway "Terms agreed?": branch "Yes" →
      subprocess end event "Terms agreed". The loop marker repeats the
      counter-offer exchange while terms are not agreed.
Procurement lane:
- Send task "Issue purchase order to supplier"
- Intermediate message catch event "PO acknowledgement received"
- End event "PO issued and acknowledged — ready for Receive Goods / Confirm
  Services (V02.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Agree PO terms with supplier"
  Expanded Subprocess: "No agreement in 5 business days" → User task "Escalate to
  Category Manager" → escalation end event "Escalated — PO terms not agreed in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Send PO terms to supplier" → Supplier
- Supplier → intermediate event "Supplier responds (accept / counter)"
- "Issue purchase order to supplier" → Supplier
- "Issue purchase order to supplier" → ERP Procurement System / Supplier Portal
- Supplier → intermediate event "PO acknowledgement received"

This stage generates the purchase order, agrees terms where no contract exists
(negotiated until agreed), and issues the PO to the supplier through the portal —
leaving an acknowledged purchase order ready for goods receipt.
```

### V02.05 — Receive Goods / Confirm Services

**BPMN diagram prompt.**

```text
BPMN: V02.05 Receive Goods / Confirm Services — fifth stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party delivering the goods or performing the service.
- Pool "Freight Carrier" — the external delivery partner.
- Pool "Buying Organisation" — the organisation, with two lanes top-to-bottom:
  "Receiving / Warehouse", "Requesting Department".
- Pool "Inventory / Warehouse System (GRN)" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Freight Carrier: black-box, single instance.
- Buying Organisation: white-box (holds the process flow).
- Inventory / Warehouse System (GRN): black-box, System = true, single instance.

3. Layout
- Supplier and Freight Carrier pools at the top, Buying Organisation pool in the
  middle, Inventory / Warehouse System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Receiving / Warehouse lane:
- Message start event "Goods / service delivery notified"
- Service task "Record goods receipt (GRN)"
- User task "Inspect goods / confirm quantity"
- Exclusive gateway "Receipt matches PO & acceptable?"
    - branch "No – discrepancy / damage": Expanded Subprocess (LOOP marker)
      "Resolve receipt discrepancy": internals — User task "Log discrepancy",
      then Send task "Notify supplier of discrepancy", then intermediate message
      catch event "Supplier responds (replace / credit)", then exclusive gateway
      "Resolved?": branch "Yes" → subprocess end event "Discrepancy resolved".
      The loop marker repeats while the discrepancy is unresolved.
    - branch "Yes": continue to Requesting Department
Requesting Department lane:
- User task "Confirm service completion / acceptance"
- Service task "Update receipt status in Inventory / Warehouse System"
- End event "Goods received / service confirmed — ready for Match PO / GR /
  Invoice (V02.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve receipt discrepancy"
  Expanded Subprocess: "Not resolved in 5 business days" → User task "Escalate to
  Procurement" → escalation end event "Escalated — receipt discrepancy not
  resolved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Supplier → start event "Goods / service delivery notified" (advance shipment /
  service completion notice)
- Freight Carrier → "Record goods receipt (GRN)" (delivery & proof of delivery)
- "Record goods receipt (GRN)" → Inventory / Warehouse System (GRN)
- "Notify supplier of discrepancy" → Supplier
- Supplier → intermediate event "Supplier responds (replace / credit)"
- "Update receipt status in Inventory / Warehouse System" → Inventory /
  Warehouse System (GRN)

This stage records the goods receipt or service confirmation, inspects it against
the PO, and resolves any discrepancy with the supplier (retried until cleared) —
leaving a confirmed receipt ready for three-way matching.
```

### V02.06 — Match PO / GR / Invoice

**BPMN diagram prompt.**

```text
BPMN: V02.06 Match PO / GR / Invoice — sixth stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party submitting the invoice.
- Pool "Buying Organisation" — the organisation, with one lane: "Accounts Payable".
- Pool "Accounts Payable / Invoice System" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Buying Organisation: white-box (holds the process flow).
- Accounts Payable / Invoice System: black-box, System = true, single instance.

3. Layout
- Supplier pool at the top, Buying Organisation pool in the middle,
  Accounts Payable / Invoice System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Accounts Payable lane:
- Message start event "Supplier invoice received"
- Service task "Capture / import e-invoice"
- Service task "Perform three-way match (PO / GR / invoice)"
- Exclusive gateway "Matched within tolerance?"
    - branch "No – mismatch": Expanded Subprocess (LOOP marker) "Resolve invoice
      mismatch": internals — User task "Investigate mismatch", then Send task
      "Query supplier / request credit note", then intermediate message catch
      event "Supplier responds", then exclusive gateway "Cleared?": branch "Yes"
      → subprocess end event "Mismatch cleared". The loop marker repeats while the
      mismatch persists.
    - branch "Yes": continue
- Service task "Flag invoice as matched"
- End event "Invoice matched — ready for Approve Invoice (V02.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve invoice mismatch" Expanded
  Subprocess: "Mismatch unresolved in 5 business days" → User task "Escalate to
  AP Supervisor" → escalation end event "Escalated — invoice mismatch not
  resolved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Supplier → start event "Supplier invoice received" (the invoice)
- "Capture / import e-invoice" → Accounts Payable / Invoice System
- Accounts Payable / Invoice System → "Perform three-way match (PO / GR /
  invoice)" (PO, goods-receipt and invoice data)
- "Query supplier / request credit note" → Supplier
- Supplier → intermediate event "Supplier responds"

This stage captures the supplier invoice and three-way matches it against the PO
and goods receipt, resolving any mismatch with the supplier (retried until
cleared) — leaving a matched invoice ready for approval.
```

### V02.07 — Approve Invoice

**BPMN diagram prompt.**

```text
BPMN: V02.07 Approve Invoice — seventh stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party whose invoice may be queried.
- Pool "Buying Organisation" — the organisation, with three lanes top-to-bottom:
  "Accounts Payable", "Budget Holder / Approver", "Finance / Treasury".
- Pool "Accounts Payable / Invoice System" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Buying Organisation: white-box (holds the process flow).
- Accounts Payable / Invoice System: black-box, System = true, single instance.

3. Layout
- Supplier pool at the top, Buying Organisation pool in the middle,
  Accounts Payable / Invoice System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Accounts Payable lane:
- Message start event "Matched invoice received"
- Service task "Prepare invoice for approval"
Budget Holder / Approver lane:
- Exclusive gateway "Approve for payment?"
    - branch "Approved": continue to Finance / Treasury
    - branch "Query – needs rework": Expanded Subprocess (LOOP marker) "Resolve
      invoice query": internals — User task "Investigate query", then Send task
      "Clarify with supplier", then intermediate message catch event "Supplier
      responds", then exclusive gateway "Cleared?": branch "Yes" → subprocess end
      event "Query cleared". The loop marker repeats while the query is open.
    - branch "Reject": End event "Invoice rejected — routed to Handle Exceptions
      (V02.09)"
Finance / Treasury lane:
- Service task "Post approved invoice to ledger (accrue payable)"
- End event "Invoice approved — ready for Pay Supplier (V02.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve invoice query" Expanded
  Subprocess: "Not cleared in 3 business days" → User task "Escalate to Finance
  Controller" → escalation end event "Escalated — invoice query not cleared in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Clarify with supplier" → Supplier
- Supplier → intermediate event "Supplier responds"
- "Post approved invoice to ledger (accrue payable)" → Accounts Payable /
  Invoice System

This stage prepares and approves the matched invoice for payment — resolving any
query with the supplier (retried until cleared), rejecting to exception handling
where needed — and posts the payable, leaving an approved invoice ready for
payment.
```

### V02.08 — Pay Supplier

**BPMN diagram prompt.**

```text
BPMN: V02.08 Pay Supplier — eighth stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party receiving the payment.
- Pool "Buying Organisation" — the organisation, with two lanes top-to-bottom:
  "Accounts Payable", "Finance / Treasury".
- Pool "Payment Platform / Banking System" — the supporting payment provider.

2. Pool properties
- Supplier: black-box, single instance.
- Buying Organisation: white-box (holds the process flow).
- Payment Platform / Banking System: black-box, System = true, single instance.

3. Layout
- Supplier pool at the top, Buying Organisation pool in the middle,
  Payment Platform / Banking System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Accounts Payable lane:
- Message start event "Approved invoice due for payment"
- Service task "Select invoice into payment run"
- Service task "Schedule payment for due date"
Finance / Treasury lane:
- Service task "Execute payment via Payment Platform"
- Intermediate message catch event "Settlement confirmation received"
- Exclusive gateway "Payment successful?"
    - branch "No – failed / returned": Expanded Subprocess (LOOP marker)
      "Resolve failed payment": internals — User task "Investigate failure (bank
      details / funds)", then Send task "Update supplier bank details / re-submit
      payment", then intermediate message catch event "Bank responds", then
      exclusive gateway "Cleared?": branch "Yes" → subprocess end event "Payment
      cleared". The loop marker repeats while the payment keeps failing.
    - branch "Yes": continue
- Send task "Send remittance advice to supplier"
- End event "Supplier paid — ready for Handle Exceptions (V02.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve failed payment" Expanded
  Subprocess: "Not cleared in 3 business days" → User task "Escalate to Treasury
  Manager" → escalation end event "Escalated — payment not cleared in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Execute payment via Payment Platform" → Payment Platform / Banking System
- Payment Platform / Banking System → intermediate event "Settlement
  confirmation received" (clearing / settlement advice)
- Payment Platform / Banking System → intermediate event "Bank responds"
  (re-submission result)
- "Send remittance advice to supplier" → Supplier

This stage selects the approved invoice into a payment run, executes payment on
the due date and confirms settlement — resolving any failed payment (retried
until cleared) — leaving the supplier paid with remittance advice sent.
```

### V02.09 — Handle Exceptions

**BPMN diagram prompt.**

```text
BPMN: V02.09 Handle Exceptions — ninth stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party in a dispute or query.
- Pool "Buying Organisation" — the organisation, with three lanes top-to-bottom:
  "Accounts Payable", "Procurement", "Finance / Treasury".
- Pool "Case / Workflow System" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Buying Organisation: white-box (holds the process flow).
- Case / Workflow System: black-box, System = true, single instance.

3. Layout
- Supplier pool at the top, Buying Organisation pool in the middle,
  Case / Workflow System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Accounts Payable lane:
- Message start event "Procurement exception raised" (blocked / rejected invoice,
  price / quantity mismatch, duplicate, over-tolerance, or supplier dispute)
- Service task "Log exception case"
- Exclusive gateway "Exception type?"
    - branch "No open exceptions": End event "No exceptions — ready for Close
      Procurement Transaction (V02.10)"
    - branch "Price / quantity mismatch": continue to Procurement
    - branch "Invoice / payment dispute": continue to Finance / Treasury
Procurement lane:
- Expanded Subprocess (LOOP marker) "Resolve mismatch with supplier":
    internals — User task "Re-check PO / GR", then Send task "Contact supplier",
    then intermediate message catch event "Supplier responds", then exclusive
    gateway "Resolved?": branch "Yes" → subprocess end event "Mismatch resolved".
    The loop marker repeats while the mismatch is open. On resolution, continue to
    Finance / Treasury.
Finance / Treasury lane:
- User task "Adjust / raise credit note or debit note"
- Service task "Update case and ledger"
- Send task "Communicate resolution to supplier"
- End event "Exception resolved — ready for Close Procurement Transaction (V02.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve mismatch with supplier"
  Expanded Subprocess: "SLA breach (case open past target)" → User task "Escalate
  to Category Manager" → escalation end event "Escalated — exception not resolved
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Supplier → start event "Procurement exception raised" (dispute / query, where
  supplier-initiated)
- "Log exception case" → Case / Workflow System
- Case / Workflow System → "Re-check PO / GR" (case history, PO & receipt data)
- "Contact supplier" → Supplier
- Supplier → intermediate event "Supplier responds"
- "Communicate resolution to supplier" → Supplier

This stage logs and resolves procurement exceptions — mismatches, blocked
invoices and disputes — adjusting with credit or debit notes and clearing the
case (retried until resolved), leaving the transaction clean for closure.
```

### V02.10 — Close Procurement Transaction

**BPMN diagram prompt.**

```text
BPMN: V02.10 Close Procurement Transaction — final stage of the Procure to Pay (P2P) value chain.

1. Pools & Lanes
- Pool "Buying Organisation" — the organisation, with two lanes top-to-bottom:
  "Procurement", "Finance / Treasury".
- Pool "ERP / General Ledger System" — the supporting IT system.

2. Pool properties
- Buying Organisation: white-box (holds the process flow).
- ERP / General Ledger System: black-box, System = true, single instance.

3. Layout
- Buying Organisation pool at the top, ERP / General Ledger System pool at the bottom.

4. Lane contents in flow order (Buying Organisation)
Procurement lane:
- Message start event "Transaction ready to close"
- Service task "Verify PO received, matched, approved and paid"
- Exclusive gateway "All complete & no open items?"
    - branch "No – open item": User task "Return to responsible stage", then
      End event "Re-opened — routed back to the open stage"
    - branch "Yes": continue to Finance / Treasury
Finance / Treasury lane:
- Service task "Finalise accruals and close PO"
- Service task "Archive procurement records"
- End event "Procurement transaction closed — Procure to Pay complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- ERP / General Ledger System → "Verify PO received, matched, approved and paid"
  (PO, receipt, invoice and payment status)
- "Finalise accruals and close PO" → ERP / General Ledger System
- "Archive procurement records" → ERP / General Ledger System

This stage confirms every prior step is complete with no open items, finalises
the accruals, archives the records and closes the purchase order — completing the
end-to-end Procure to Pay cycle.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V03 - Record to Report (R2R)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V03.01. Capture Financial Transactions
V03.02. Post Journals
V03.03. Maintain Chart of Accounts
V03.04. Reconcile Accounts
V03.05. Manage Accruals and Provisions
V03.06. Close Accounting Periods
V03.07. Consolidate Entities
V03.08. Prepare Management Reports
V03.09. Prepare Statutory Reports
V03.10. Submit Tax / Regulatory Returns
V03.11. Support Audit

This is the finance close-and-report end-to-end process: operational
transactions flow into the ledger, are posted, reconciled, accrued,
closed, consolidated and reported, then filed with the tax and
regulatory authorities and supported through the external audit. It is
cycle-driven rather than triggered by a single external party — each
accounting period drives the cycle. The external participants
(Regulators, Tax Authorities, External Auditors, Shareholders / Owners,
Banks and Board Members) are consumers of the financial outputs, and the
source of the transactions is the organisation's own operational
systems.
```

**Context diagram prompt.**

```text
Context Diagram: V03 — Record to Report (R2R).

1. Central system (process-system)
A single central process/system ellipse named "Financial Reporting
Company" representing the whole organisation that runs the Record to
Report process. It is the system in context: everything inside it —
financial accounting, management accounting, tax, treasury, external
reporting, internal audit and the supporting IT systems (source /
sub-ledger systems, ERP general ledger, reconciliation, financial close,
consolidation, reporting / BI, disclosure, tax and audit management) —
is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Tax Authority
- Regulator
- External Auditor
- Bank
- Shareholders / Owners
- Board Members

3. Layout
"Financial Reporting Company" sits in the centre. The process is
cycle-driven and its transactions originate INSIDE the company (from its
own operational systems), so no external demand actor sits on the left.
Every external entity is a consumer or reviewer of the financial
outputs, so all sit to the RIGHT: the Tax Authority and Regulator
(returns and statutory lodgements), the External Auditor (assurance),
the Bank (statements and covenant reporting), and the Shareholders /
Owners and Board Members (financial and management reporting). Every
external entity connects directly to the central system with labelled
information flows; entities never connect to one another.

4. Information flows (each a labelled connector between an external
   entity and the central system; show both directions where information
   flows both ways)
- Financial Reporting Company → Tax Authority: tax and regulatory
  submissions, supporting schedules, payment / refund advice.
- Tax Authority → Financial Reporting Company: assessments, queries,
  filing confirmations.
- Financial Reporting Company → Regulator: statutory financial
  statements, compliance and covenant reports, regulatory returns.
- Regulator → Financial Reporting Company: lodgement confirmations,
  information requests.
- Financial Reporting Company → External Auditor: financial statements,
  reconciliations, supporting schedules, audit evidence, management
  representation letter.
- External Auditor → Financial Reporting Company: sample / information
  requests, audit findings, audit opinion.
- Financial Reporting Company → Bank: covenant reporting, payment and
  cash data.
- Bank → Financial Reporting Company: bank statements, balance and
  transaction confirmations.
- Financial Reporting Company → Shareholders / Owners: financial
  statements, annual report, distribution information.
- Shareholders / Owners → Financial Reporting Company: information
  requests.
- Financial Reporting Company → Board Members: management reports and
  board packs.
- Board Members → Financial Reporting Company: review comments and
  reporting directions.

This Context Diagram frames the Financial Reporting Company as a single
system in context: an internal accounting cycle drives the Record to
Report process, the operational systems feed the transactions, and the
tax and regulatory authorities, the external auditor, the bank and the
owners and board consume or review the financial outputs. The six
external entities are exactly the external actors of the Process Context
diagram below, so the two views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V03 — Record to Report (R2R).

1. System boundary and processes
A system boundary named "V03 — Record to Report" containing these
processes (use-case ovals), stacked top-to-bottom in this order:
- V03.01 Capture Financial Transactions
- V03.02 Post Journals
- V03.03 Maintain Chart of Accounts
- V03.04 Reconcile Accounts
- V03.05 Manage Accruals and Provisions
- V03.06 Close Accounting Periods
- V03.07 Consolidate Entities
- V03.08 Prepare Management Reports
- V03.09 Prepare Statutory Reports
- V03.10 Submit Tax / Regulatory Returns
- V03.11 Support Audit

2. Participants (outside the boundary)
External actors (actor):
- Tax Authority
- Regulator
- External Auditor
- Bank
- Shareholders / Owners
- Board Members
Internal teams (team):
- Accounts Payable / Receivable
- Financial Accounting
- Finance Controller
- Management Accounting
- External Reporting
- CFO
- Tax
- Treasury
- Internal Audit
IT systems (system):
- Sub-Ledger / Source Systems
- ERP / General Ledger System
- Reconciliation System
- Financial Close System
- Consolidation System
- Reporting / BI Platform
- Disclosure Management System
- Tax System
- Audit Management System
- Document Management System

3. Layout
The processes sit inside the boundary in V03.01 → V03.11 order. Internal
teams sit to the LEFT of the boundary; external actors and IT systems
sit to the RIGHT. Each participant is positioned near the process(es) it
connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V03.01 Capture Financial Transactions — Accounts Payable / Receivable
  (feed sub-ledgers), Financial Accounting (capture); Sub-Ledger /
  Source Systems (transaction feed).
- V03.02 Post Journals — Financial Accounting (prepare), Finance
  Controller (approve); ERP / General Ledger System (post).
- V03.03 Maintain Chart of Accounts — Financial Accounting (assess),
  Finance Controller (govern); ERP / General Ledger System (apply).
- V03.04 Reconcile Accounts — Bank (statements); Financial Accounting
  (reconcile); Reconciliation System (match).
- V03.05 Manage Accruals and Provisions — Financial Accounting
  (calculate), Management Accounting (review); ERP / General Ledger
  System (post).
- V03.06 Close Accounting Periods — Financial Accounting (run close),
  Finance Controller (approve); Financial Close System (checklist &
  lock).
- V03.07 Consolidate Entities — External Reporting (consolidate),
  Finance Controller (approve); Consolidation System (translate &
  eliminate).
- V03.08 Prepare Management Reports — Board Members (receive pack);
  Management Accounting (build & analyse), Finance Controller (finalise);
  Reporting / BI Platform (report).
- V03.09 Prepare Statutory Reports — Regulator (lodgement), Shareholders
  / Owners (receive statements); External Reporting (draft), Finance
  Controller (review), CFO (approve); Disclosure Management System
  (draft & disclose).
- V03.10 Submit Tax / Regulatory Returns — Tax Authority, Regulator
  (receive returns & respond); Tax (prepare & submit), Treasury (pay);
  Tax System (calculate & file).
- V03.11 Support Audit — External Auditor (requests & opinion); Internal
  Audit, Financial Accounting (provide evidence), Finance Controller
  (sign off); Audit Management System, Document Management System
  (evidence & records).

This Process Context diagram frames the whole Record to Report value
chain: the eleven subprocesses inside the boundary, the external actors
(Tax Authority, Regulator, External Auditor, Bank, Shareholders /
Owners, Board Members) and internal teams that perform them, and the IT
systems that support them — consistent with the per-process BPMN prompts
below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN
process prompt below — external actors are the non-organisation pools,
teams are the lanes of the "Finance Organisation" pool (key role in
brackets), and IT systems are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V03.01** Capture Financial Transactions | — | Accounts Payable / Receivable (sub-ledger accountant), Financial Accounting (financial accountant) | Sub-Ledger / Source Systems |
| **V03.02** Post Journals | — | Financial Accounting (financial accountant), Finance Controller (finance controller) | ERP / General Ledger System |
| **V03.03** Maintain Chart of Accounts | — | Financial Accounting (financial accountant), Finance Controller (finance controller) | ERP / General Ledger System |
| **V03.04** Reconcile Accounts | Bank | Financial Accounting (reconciliations analyst) | Reconciliation System |
| **V03.05** Manage Accruals and Provisions | — | Financial Accounting (financial accountant), Management Accounting (management accountant) | ERP / General Ledger System |
| **V03.06** Close Accounting Periods | — | Financial Accounting (financial accountant), Finance Controller (finance controller) | Financial Close System |
| **V03.07** Consolidate Entities | — | External Reporting (reporting analyst), Finance Controller (finance controller) | Consolidation System |
| **V03.08** Prepare Management Reports | Board Members | Management Accounting (management accountant), Finance Controller (finance controller) | Reporting / BI Platform |
| **V03.09** Prepare Statutory Reports | Regulator, Shareholders / Owners | External Reporting (reporting analyst), Finance Controller (finance controller), CFO (CFO) | Disclosure Management System |
| **V03.10** Submit Tax / Regulatory Returns | Tax Authority, Regulator | Tax (tax accountant), Treasury (treasury accountant) | Tax System |
| **V03.11** Support Audit | External Auditor | Internal Audit (auditor), Financial Accounting (financial accountant), Finance Controller (finance controller) | Audit Management System, Document Management System |

**Actor / Team / System roll-up** (every distinct participant across V03):

- **External actors:** Bank (V03.04); Board Members (V03.08); Regulator (V03.09, V03.10); Shareholders / Owners (V03.09); Tax Authority (V03.10); External Auditor (V03.11).
- **Teams:** Accounts Payable / Receivable (V03.01); Financial Accounting (V03.01, V03.02, V03.03, V03.05, V03.06, V03.11); Finance Controller (V03.02, V03.03, V03.06, V03.07, V03.08, V03.09, V03.11); Management Accounting (V03.05, V03.08); External Reporting (V03.07, V03.09); CFO (V03.09); Tax (V03.10); Treasury (V03.10); Internal Audit (V03.11).
- **IT systems:** Sub-Ledger / Source Systems (V03.01); ERP / General Ledger System (V03.02, V03.03, V03.05); Reconciliation System (V03.04); Financial Close System (V03.06); Consolidation System (V03.07); Reporting / BI Platform (V03.08); Disclosure Management System (V03.09); Tax System (V03.10); Audit Management System (V03.11); Document Management System (V03.11).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Record to Report service area.
It shows the **Actors**, **Services**, **Processes**, **Interfaces** and
**Applications** that provide the Financial Reporting Service and the
related assurance and filing services across the eleven V03 processes.
Each Business Process is a drill-down anchor: link it to the matching
V03.nn BPMN diagram and its marker turns green.

```text
ArchiMate: V03 — Record to Report — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Financial Reporting
Service and the related services (to the internal board / executives and
to the external regulators, auditor, bank and owners) across the eleven
V03 Record to Report processes, and the applications that support them.
Lay it out in three horizontal bands, top to bottom — BUSINESS SERVICES
→ BUSINESS PROCESSES → APPLICATIONS — with the internal Board /
Executives on the far left and the external consumers on the far right.
Read top-to-bottom as service → process → application (ArchiMate service
realisation).

1. Business Actors (Business Actor)
- Board / Executives — the internal party the reporting service is
  provided to (far left, the primary consumer of management reporting).
- Regulator, Tax Authority — external parties that receive statutory and
  tax filings (far right).
- External Auditor — the external party that reviews and gives the audit
  opinion (far right).
- Bank, Shareholders / Owners — external actors that receive statements,
  covenant reporting and financial results (far right).

2. Interfaces
- Business Interface "Regulatory & Audit Portal / Reporting Channel" —
  the channel the external auditor, regulator and tax authority use to
  receive statements, returns and audit evidence, and through which the
  bank and owners receive reporting. The external actors ACCESS this
  interface; the interface SERVES the business services below.
- Application Interfaces (optional, only the few the portal calls):
  "Filing API" on the Tax System, "Disclosure API" on the Disclosure
  Management System.

3. Business Services (Business Service) — the services provided, top
   band, left-to-right in reporting-journey order:
- Transaction & Ledger Service — capture transactions, post journals and
  maintain the chart of accounts.
- Reconciliation & Provisions Service — reconcile accounts and manage
  accruals and provisions.
- Period Close & Consolidation Service — close periods and consolidate
  entities.
- Management Reporting Service — prepare and issue management reports.
- Statutory & Regulatory Reporting Service — prepare statutory reports
  and submit tax and regulatory returns.
- Assurance & Audit Service — support the external audit and sign off.

4. Business Processes (Business Process) — the eleven V03 processes,
   middle band in V03.01 → V03.11 order. Each REALISES the business
   service shown and is the link anchor to its BPMN diagram:
- V03.01 Capture Financial Transactions   -> realises Transaction & Ledger Service
- V03.02 Post Journals                     -> realises Transaction & Ledger Service
- V03.03 Maintain Chart of Accounts        -> realises Transaction & Ledger Service
- V03.04 Reconcile Accounts                -> realises Reconciliation & Provisions Service
- V03.05 Manage Accruals and Provisions    -> realises Reconciliation & Provisions Service
- V03.06 Close Accounting Periods          -> realises Period Close & Consolidation Service
- V03.07 Consolidate Entities              -> realises Period Close & Consolidation Service
- V03.08 Prepare Management Reports         -> realises Management Reporting Service
- V03.09 Prepare Statutory Reports          -> realises Statutory & Regulatory Reporting Service
- V03.10 Submit Tax / Regulatory Returns    -> realises Statutory & Regulatory Reporting Service
- V03.11 Support Audit                      -> realises Assurance & Audit Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Sub-Ledger / Source Systems
- ERP / General Ledger System
- Reconciliation System
- Financial Close System
- Consolidation System
- Reporting / BI Platform
- Disclosure Management System
- Tax System
- Audit Management System
- Document Management System

6. Relationships
- External Auditor, Regulator, Tax Authority -accesses-> Regulatory &
  Audit Portal / Reporting Channel.
- Regulatory & Audit Portal / Reporting Channel -serving-> the
  Statutory & Regulatory Reporting and Assurance & Audit services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V03.01 <- Sub-Ledger / Source Systems;   V03.02 <- ERP / General Ledger System;
    V03.03 <- ERP / General Ledger System;    V03.04 <- Reconciliation System;
    V03.05 <- ERP / General Ledger System;    V03.06 <- Financial Close System;
    V03.07 <- Consolidation System;           V03.08 <- Reporting / BI Platform;
    V03.09 <- Disclosure Management System;    V03.10 <- Tax System;
    V03.11 <- Audit Management System + Document Management System.
- Bank -serving-> V03.04 Reconcile Accounts.
- V03.08 Prepare Management Reports -serving-> Board / Executives.
- V03.09 Prepare Statutory Reports -serving-> Regulator and Shareholders
  / Owners.
- V03.10 Submit Tax / Regulatory Returns -serving-> Tax Authority and
  Regulator.
- V03.11 Support Audit -serving-> External Auditor.

7. Intent
The Financial Reporting Service sits top-centre as the headline service.
The eleven Business Processes form the backbone in V03.01 -> V03.11
order so the reader can trace the record-to-report cycle and drill from
any process straight into its detailed BPMN model. This one ArchiMate
view therefore links to all eleven V03 BPMN process diagrams. The
mapping of process -> actors/teams/applications is the Process <->
Actors / Teams / IT Systems matrix above.
```

### V03.01 — Capture Financial Transactions

**BPMN diagram prompt.**

```text
BPMN: V03.01 Capture Financial Transactions — first stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Finance Organisation" — the organisation running the process,
  with two lanes top-to-bottom: "Accounts Payable / Receivable",
  "Financial Accounting".
- Pool "Sub-Ledger / Source Systems" — the supporting IT system.

2. Pool properties
- Finance Organisation: white-box (holds the process flow).
- Sub-Ledger / Source Systems: black-box, System = true, single instance.

3. Layout
- Finance Organisation pool at the top, Sub-Ledger / Source Systems pool
  at the bottom.

4. Lane contents in flow order (Finance Organisation)
Accounts Payable / Receivable lane:
- Message start event "Source transactions ready for capture" (the
  operational systems signal that a batch of transactions is available)
- Service task "Import transactions from sub-ledgers / operational
  systems"
- Service task "Validate transactions (account, cost centre, currency)"
- Exclusive gateway "All transactions valid?"
    - branch "No – rejected items": Expanded Subprocess (LOOP marker)
      "Correct rejected transactions": internals — User task
      "Investigate rejected item", then User task "Correct and re-submit
      to interface", then exclusive gateway "Loaded now?": branch "Yes"
      → subprocess end event "Transactions loaded". The loop marker
      repeats the attempt while rejected items remain.
    - branch "Yes": continue to Financial Accounting
Financial Accounting lane:
- Service task "Post captured transactions to general ledger"
- End event "Transactions captured — ready for Post Journals (V03.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Correct rejected
  transactions" Expanded Subprocess: "Rejects not cleared by the daily
  cut-off" → User task "Escalate to Finance Controller" → escalation end
  event "Escalated — transactions not captured in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- Sub-Ledger / Source Systems → start event "Source transactions ready
  for capture" (transaction feed available)
- "Import transactions from sub-ledgers / operational systems" →
  Sub-Ledger / Source Systems
- Sub-Ledger / Source Systems → "Validate transactions (account, cost
  centre, currency)" (transaction detail)
- "Post captured transactions to general ledger" → Sub-Ledger / Source
  Systems

This is the internal entry point of R2R: each period's operational
transactions are imported from the sub-ledgers and source systems,
validated and corrected until every item loads (retried until clean),
then posted to the general ledger — leaving captured transactions ready
to be journalised.
```

### V03.02 — Post Journals

**BPMN diagram prompt.**

```text
BPMN: V03.02 Post Journals — second stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "Financial Accounting", "Finance Controller".
- Pool "ERP / General Ledger System" — the supporting IT system.

2. Pool properties
- Finance Organisation: white-box (holds the process flow).
- ERP / General Ledger System: black-box, System = true, single
  instance.

3. Layout
- Finance Organisation pool at the top, ERP / General Ledger System pool
  at the bottom.

4. Lane contents in flow order (Finance Organisation)
Financial Accounting lane:
- Message start event "Captured transactions ready to journalise"
- User task "Prepare journal entries (accruals, adjustments,
  allocations)"
- Service task "Validate journals (balanced, coding, approval limits)"
Finance Controller lane:
- Exclusive gateway "Journals valid and within limits?"
    - branch "No – rejected / over limit": Expanded Subprocess (LOOP
      marker) "Correct and re-submit journal": internals — User task
      "Amend journal", then User task "Re-submit for approval", then
      exclusive gateway "Approved now?": branch "Yes" → subprocess end
      event "Journal approved". The loop marker repeats while the
      journal is rejected.
    - branch "Yes": continue
- Service task "Post journals to general ledger"
- End event "Journals posted — ready for Maintain Chart of Accounts
  (V03.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Correct and re-submit
  journal" Expanded Subprocess: "Not posted within the close window" →
  User task "Escalate to CFO" → escalation end event "Escalated —
  journals not posted in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Validate journals (balanced, coding, approval limits)" → ERP /
  General Ledger System
- ERP / General Ledger System → "Journals valid and within limits?"
  (balances, coding validation, approval limits)
- "Post journals to general ledger" → ERP / General Ledger System

This stage prepares the period's journal entries, validates and approves
them (corrected and re-submitted until they pass), and posts them to the
general ledger — leaving a complete, approved set of postings ready for
chart-of-accounts maintenance.
```

### V03.03 — Maintain Chart of Accounts

**BPMN diagram prompt.**

```text
BPMN: V03.03 Maintain Chart of Accounts — third stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "Financial Accounting", "Finance Controller".
- Pool "ERP / General Ledger System" — the supporting IT system.

2. Pool properties
- Finance Organisation: white-box (holds the process flow).
- ERP / General Ledger System: black-box, System = true, single
  instance.

3. Layout
- Finance Organisation pool at the top, ERP / General Ledger System pool
  at the bottom.

4. Lane contents in flow order (Finance Organisation)
Financial Accounting lane:
- Message start event "Chart of accounts change requested" (new account,
  mapping or hierarchy change)
- User task "Assess CoA change request (new account, mapping,
  hierarchy)"
Finance Controller lane:
- Exclusive gateway "Change approved under CoA governance?"
    - branch "Rejected": End event "Change rejected — chart of accounts
      unchanged"
    - branch "Refer – needs rework": Expanded Subprocess (LOOP marker)
      "Revise chart-of-accounts change": internals — User task "Revise
      change request (mapping / hierarchy)", then User task "Re-submit
      for governance approval", then exclusive gateway "Approved now?":
      branch "Yes" → subprocess end event "Change approved". The loop
      marker repeats while approval is withheld.
    - branch "Approved": continue
- Service task "Apply change and update mappings in general ledger"
- End event "Chart of accounts maintained — ready for Reconcile Accounts
  (V03.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Revise chart-of-accounts
  change" Expanded Subprocess: "Not approved in 5 business days" → User
  task "Escalate to CFO" → escalation end event "Escalated — CoA change
  not approved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branches. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- ERP / General Ledger System → "Assess CoA change request (new account,
  mapping, hierarchy)" (existing accounts, usage, hierarchy)
- "Apply change and update mappings in general ledger" → ERP / General
  Ledger System

This stage governs the chart of accounts: a change request is assessed
and approved under governance — reworked and re-submitted where referred,
rejected where out of policy — then applied and re-mapped in the general
ledger, keeping the account structure clean before reconciliation.
```

### V03.04 — Reconcile Accounts

**BPMN diagram prompt.**

```text
BPMN: V03.04 Reconcile Accounts — fourth stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Bank" — the external party that provides statements and
  confirmations.
- Pool "Finance Organisation" — the organisation, with one lane:
  "Financial Accounting".
- Pool "Reconciliation System" — the supporting IT system.

2. Pool properties
- Bank: black-box, single instance.
- Finance Organisation: white-box (holds the process flow).
- Reconciliation System: black-box, System = true, single instance.

3. Layout
- Bank pool at the top, Finance Organisation pool in the middle,
  Reconciliation System pool at the bottom.

4. Lane contents in flow order (Finance Organisation)
Financial Accounting lane:
- Message start event "Ledgers ready to reconcile" (period sub-ledger
  and general-ledger balances available)
- Service task "Import balances and statements"
- Service task "Match sub-ledger, general ledger and bank balances"
- Exclusive gateway "All balances reconciled?"
    - branch "No – reconciling items": Expanded Subprocess (LOOP marker)
      "Resolve reconciling item": internals — User task "Investigate
      reconciling item", then Send task "Query source / bank for
      supporting detail", then intermediate message catch event "Source
      / bank responds", then exclusive gateway "Cleared?": branch "Yes"
      → subprocess end event "Reconciling item cleared". The loop marker
      repeats while reconciling items remain.
    - branch "Yes": continue
- User task "Sign off reconciliation"
- End event "Accounts reconciled — ready for Manage Accruals and
  Provisions (V03.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve reconciling item"
  Expanded Subprocess: "Not cleared within the close timetable" → User
  task "Escalate to Finance Controller" → escalation end event
  "Escalated — reconciliation not cleared in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- Bank → "Import balances and statements" (bank statements and balances)
- "Import balances and statements" → Reconciliation System
- Reconciliation System → "Match sub-ledger, general ledger and bank
  balances" (matched / unmatched items)
- "Query source / bank for supporting detail" → Bank
- Bank → intermediate event "Source / bank responds"
- "Sign off reconciliation" → Reconciliation System

This stage reconciles the sub-ledgers, general ledger and bank balances,
resolving any reconciling item with the source system or bank (retried
until cleared) and signing off — leaving reconciled accounts ready for
accruals and provisions.
```

### V03.05 — Manage Accruals and Provisions

**BPMN diagram prompt.**

```text
BPMN: V03.05 Manage Accruals and Provisions — fifth stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "Financial Accounting", "Management Accounting".
- Pool "ERP / General Ledger System" — the supporting IT system.

2. Pool properties
- Finance Organisation: white-box (holds the process flow).
- ERP / General Ledger System: black-box, System = true, single
  instance.

3. Layout
- Finance Organisation pool at the top, ERP / General Ledger System pool
  at the bottom.

4. Lane contents in flow order (Finance Organisation)
Financial Accounting lane:
- Message start event "Period accruals and provisions due"
- User task "Identify accruals, prepayments and provisions"
- Service task "Calculate and post accrual / provision journals"
- Exclusive gateway "Accruals complete and supported?"
    - branch "No – query / missing support": Expanded Subprocess (LOOP
      marker) "Resolve accrual query": internals — User task
      "Investigate accrual / provision", then User task "Obtain
      supporting information from budget owner", then exclusive gateway
      "Resolved?": branch "Yes" → subprocess end event "Accrual
      supported". The loop marker repeats while the accrual is
      unsupported.
    - branch "Yes": continue to Management Accounting
Management Accounting lane:
- Service task "Review accruals against budget and prior periods"
- End event "Accruals and provisions managed — ready for Close
  Accounting Periods (V03.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve accrual query"
  Expanded Subprocess: "Not resolved before the close cut-off" → User
  task "Escalate to Finance Controller" → escalation end event
  "Escalated — accruals not finalised in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Calculate and post accrual / provision journals" → ERP / General
  Ledger System
- ERP / General Ledger System → "Review accruals against budget and
  prior periods" (posted balances, prior-period accruals)

This stage identifies, calculates and posts the period's accruals,
prepayments and provisions, resolving any unsupported item (retried
until supported) and reviewing against budget and prior periods —
leaving the ledger fully accrued and ready to close.
```

### V03.06 — Close Accounting Periods

**BPMN diagram prompt.**

```text
BPMN: V03.06 Close Accounting Periods — sixth stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "Financial Accounting", "Finance Controller".
- Pool "Financial Close System" — the supporting IT system.

2. Pool properties
- Finance Organisation: white-box (holds the process flow).
- Financial Close System: black-box, System = true, single instance.

3. Layout
- Finance Organisation pool at the top, Financial Close System pool at
  the bottom.

4. Lane contents in flow order (Finance Organisation)
Financial Accounting lane:
- Timer start event "Period-end reached" (the month-end / period close
  timetable begins)
- Service task "Run close checklist and lock sub-ledgers"
- User task "Review close tasks and open items"
- Exclusive gateway "All close tasks complete?"
    - branch "No – open tasks": Expanded Subprocess (LOOP marker)
      "Resolve open close task": internals — User task "Complete
      outstanding close task", then exclusive gateway "Task closed?":
      branch "Yes" → subprocess end event "Close task completed". The
      loop marker repeats while close tasks remain open.
    - branch "Yes": continue to Finance Controller
Finance Controller lane:
- User task "Approve period close"
- Service task "Lock the general ledger period"
- End event "Period closed — ready for Consolidate Entities (V03.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve open close task"
  Expanded Subprocess: "Close not completed by the day-5 target" → User
  task "Escalate to CFO" → escalation end event "Escalated — period not
  closed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Run close checklist and lock sub-ledgers" → Financial Close System
- Financial Close System → "Review close tasks and open items" (close
  task status, open items)
- "Lock the general ledger period" → Financial Close System

This stage runs the period-end close: the checklist executes and the
sub-ledgers lock, open close tasks are completed (retried until every
task is closed), the close is approved and the general ledger period is
locked — leaving a closed period ready for consolidation.
```

### V03.07 — Consolidate Entities

**BPMN diagram prompt.**

```text
BPMN: V03.07 Consolidate Entities — seventh stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "External Reporting", "Finance Controller".
- Pool "Consolidation System" — the supporting IT system.

2. Pool properties
- Finance Organisation: white-box (holds the process flow).
- Consolidation System: black-box, System = true, single instance.

3. Layout
- Finance Organisation pool at the top, Consolidation System pool at the
  bottom.

4. Lane contents in flow order (Finance Organisation)
External Reporting lane:
- Message start event "Entity ledgers closed and ready to consolidate"
- Service task "Load entity trial balances into consolidation"
- Service task "Translate currencies and post eliminations"
- Exclusive gateway "Group consolidation balances?"
    - branch "No – intercompany / elimination mismatch": Expanded
      Subprocess (LOOP marker) "Resolve intercompany mismatch":
      internals — User task "Analyse intercompany / elimination
      difference", then User task "Adjust entity submission", then
      exclusive gateway "Balanced?": branch "Yes" → subprocess end event
      "Consolidation balanced". The loop marker repeats while the group
      is out of balance.
    - branch "Yes": continue to Finance Controller
Finance Controller lane:
- User task "Review and approve consolidated position"
- End event "Entities consolidated — ready for Prepare Management Reports
  (V03.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve intercompany
  mismatch" Expanded Subprocess: "Not balanced within the consolidation
  timetable" → User task "Escalate to Group Financial Controller" →
  escalation end event "Escalated — consolidation not balanced in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Load entity trial balances into consolidation" → Consolidation System
- Consolidation System → "Translate currencies and post eliminations"
  (entity balances, exchange rates, intercompany data)
- "Review and approve consolidated position" → Consolidation System

This stage consolidates the group: entity trial balances are loaded,
currencies translated and eliminations posted, any intercompany or
elimination mismatch is resolved with the entities (retried until the
group balances), and the consolidated position is approved — leaving a
consolidated result ready for reporting.
```

### V03.08 — Prepare Management Reports

**BPMN diagram prompt.**

```text
BPMN: V03.08 Prepare Management Reports — eighth stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Board Members" — the external party that receives the management
  pack.
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "Management Accounting", "Finance Controller".
- Pool "Reporting / BI Platform" — the supporting IT system.

2. Pool properties
- Board Members: black-box, single instance.
- Finance Organisation: white-box (holds the process flow).
- Reporting / BI Platform: black-box, System = true, single instance.

3. Layout
- Board Members pool at the top, Finance Organisation pool in the middle,
  Reporting / BI Platform pool at the bottom.

4. Lane contents in flow order (Finance Organisation)
Management Accounting lane:
- Message start event "Consolidated results ready for management
  reporting"
- Service task "Build management report pack (P&L, KPIs, variances)"
- User task "Analyse variances against budget and forecast"
- Exclusive gateway "Pack complete and explained?"
    - branch "No – unexplained variance": Expanded Subprocess (LOOP
      marker) "Resolve report query / variance": internals — User task
      "Investigate variance", then User task "Obtain explanation from
      budget owner", then exclusive gateway "Explained?": branch "Yes" →
      subprocess end event "Variance explained". The loop marker repeats
      while variances remain unexplained.
    - branch "Yes": continue to Finance Controller
Finance Controller lane:
- User task "Review and finalise management pack"
- Send task "Distribute management pack to board / executives"
- End event "Management reports issued — ready for Prepare Statutory
  Reports (V03.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve report query /
  variance" Expanded Subprocess: "Not explained before the reporting
  deadline" → User task "Escalate to CFO" → escalation end event
  "Escalated — management pack not finalised in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Build management report pack (P&L, KPIs, variances)" → Reporting / BI
  Platform
- Reporting / BI Platform → "Analyse variances against budget and
  forecast" (actuals, budget, forecast, KPIs)
- "Distribute management pack to board / executives" → Board Members

This stage builds the management report pack from the consolidated
results, analyses variances and resolves any unexplained movement with
the budget owners (retried until explained), then finalises and
distributes the pack to the board — leaving management reporting issued
ahead of statutory reporting.
```

### V03.09 — Prepare Statutory Reports

**BPMN diagram prompt.**

```text
BPMN: V03.09 Prepare Statutory Reports — ninth stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Regulator" — the external party the statements are lodged with.
- Pool "Shareholders / Owners" — the external party that receives the
  statements.
- Pool "Finance Organisation" — the organisation, with three lanes
  top-to-bottom: "External Reporting", "Finance Controller", "CFO".
- Pool "Disclosure Management System" — the supporting IT system.

2. Pool properties
- Regulator: black-box, single instance.
- Shareholders / Owners: black-box, single instance.
- Finance Organisation: white-box (holds the process flow).
- Disclosure Management System: black-box, System = true, single
  instance.

3. Layout
- Regulator and Shareholders / Owners pools at the top, Finance
  Organisation pool in the middle, Disclosure Management System pool at
  the bottom.

4. Lane contents in flow order (Finance Organisation)
External Reporting lane:
- Message start event "Consolidated results ready for statutory
  reporting"
- Service task "Draft financial statements and disclosures"
- User task "Review statutory disclosures against accounting standards"
Finance Controller lane:
- Exclusive gateway "Statements compliant and complete?"
    - branch "No – review point": Expanded Subprocess (LOOP marker)
      "Resolve statutory review point": internals — User task "Amend
      statement / disclosure", then User task "Re-submit for technical
      review", then exclusive gateway "Cleared?": branch "Yes" →
      subprocess end event "Review point cleared". The loop marker
      repeats while review points remain.
    - branch "Yes": continue to CFO
CFO lane:
- User task "Approve statutory financial statements"
- Send task "Publish statements and lodge with regulator"
- End event "Statutory reports prepared — ready for Submit Tax /
  Regulatory Returns (V03.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve statutory review
  point" Expanded Subprocess: "Not cleared before the reporting
  deadline" → User task "Escalate to Audit Committee" → escalation end
  event "Escalated — statutory statements not finalised in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Draft financial statements and disclosures" → Disclosure Management
  System
- Disclosure Management System → "Review statutory disclosures against
  accounting standards" (trial balance, prior year, disclosure
  checklist)
- "Publish statements and lodge with regulator" → Regulator
- "Publish statements and lodge with regulator" → Shareholders / Owners

This stage drafts the statutory financial statements and disclosures,
reviews them against accounting standards — clearing every review point
(retried until clean) — obtains CFO approval, then publishes and lodges
them with the regulator and owners, leaving statutory reporting ready for
the tax and regulatory filings.
```

### V03.10 — Submit Tax / Regulatory Returns

**BPMN diagram prompt.**

```text
BPMN: V03.10 Submit Tax / Regulatory Returns — tenth stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "Tax Authority" — the external party that receives the tax return.
- Pool "Regulator" — the external party that receives the regulatory
  return.
- Pool "Finance Organisation" — the organisation, with two lanes
  top-to-bottom: "Tax", "Treasury".
- Pool "Tax System" — the supporting IT system.

2. Pool properties
- Tax Authority: black-box, single instance.
- Regulator: black-box, single instance.
- Finance Organisation: white-box (holds the process flow).
- Tax System: black-box, System = true, single instance.

3. Layout
- Tax Authority and Regulator pools at the top, Finance Organisation
  pool in the middle, Tax System pool at the bottom.

4. Lane contents in flow order (Finance Organisation)
Tax lane:
- Timer start event "Tax / regulatory filing period due"
- Service task "Extract ledger data and calculate tax / return figures"
- User task "Prepare tax / regulatory return"
- Send task "Submit return to authority"
- Intermediate message catch event "Authority acknowledges submission"
- Exclusive gateway "Return accepted?"
    - branch "No – query / rejected": Expanded Subprocess (LOOP marker)
      "Resolve return query / re-file": internals — User task
      "Investigate authority query", then Send task "Provide
      clarification / re-file return", then intermediate message catch
      event "Authority responds", then exclusive gateway "Accepted?":
      branch "Yes" → subprocess end event "Return accepted". The loop
      marker repeats while the return is queried.
    - branch "Yes": continue to Treasury
Treasury lane:
- Service task "Arrange payment / refund and record submission"
- End event "Tax and regulatory returns submitted — ready for Support
  Audit (V03.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve return query /
  re-file" Expanded Subprocess: "Not accepted before the statutory
  deadline" → User task "Escalate to Finance Controller" → escalation
  end event "Escalated — return not accepted in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branch. The retry subprocess repeats via its loop marker (no internal
loop-back flow drawn).
Message flows:
- "Extract ledger data and calculate tax / return figures" → Tax System
- Tax System → "Prepare tax / regulatory return" (calculated figures,
  prior returns)
- "Submit return to authority" → Tax Authority
- "Submit return to authority" → Regulator
- Tax Authority → intermediate event "Authority acknowledges submission"
- "Provide clarification / re-file return" → Tax Authority
- Tax Authority → intermediate event "Authority responds"

This stage calculates and prepares the tax and regulatory returns,
submits them to the authorities and clears any query or rejection
(re-filed until accepted), then arranges the payment or refund and
records the submission — leaving the filings accepted ahead of audit.
```

### V03.11 — Support Audit

**BPMN diagram prompt.**

```text
BPMN: V03.11 Support Audit — final stage of the Record to Report (R2R) value chain.

1. Pools & Lanes
- Pool "External Auditor" — the external party conducting the audit.
- Pool "Finance Organisation" — the organisation, with three lanes
  top-to-bottom: "Internal Audit", "Financial Accounting", "Finance
  Controller".
- Pool "Audit Management System" — the supporting IT system.
- Pool "Document Management System" — the supporting IT system.

2. Pool properties
- External Auditor: black-box, single instance.
- Finance Organisation: white-box (holds the process flow).
- Audit Management System: black-box, System = true, single instance.
- Document Management System: black-box, System = true, single instance.

3. Layout
- External Auditor pool at the top, Finance Organisation pool in the
  middle, Audit Management System and Document Management System pools at
  the bottom.

4. Lane contents in flow order (Finance Organisation)
Internal Audit lane:
- Message start event "Audit engagement opened"
- Intermediate message catch event "Auditor sample / information request
  received"
Financial Accounting lane:
- Service task "Assemble audit evidence and supporting schedules"
- User task "Respond to auditor requests and queries"
- Exclusive gateway "Audit findings raised?"
    - branch "Yes – findings": User task "Agree and action audit
      adjustments", then Service task "Post audit adjustments and update
      records", then continue to Finance Controller
    - branch "No – clean": continue to Finance Controller
Finance Controller lane:
- User task "Confirm final financial statements with auditor"
- Send task "Send signed statements and management representation letter"
- End event "Audit supported and accounts signed off — Record to Report
  complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway
branches.
Message flows:
- External Auditor → start event "Audit engagement opened"
- External Auditor → intermediate event "Auditor sample / information
  request received"
- Document Management System → "Assemble audit evidence and supporting
  schedules" (source documents and schedules)
- "Assemble audit evidence and supporting schedules" → Audit Management
  System
- "Respond to auditor requests and queries" → External Auditor
- "Post audit adjustments and update records" → Audit Management System
- "Send signed statements and management representation letter" →
  External Auditor

This stage supports the external audit: evidence and schedules are
assembled, auditor requests answered, any findings agreed, actioned and
posted, and the final financial statements confirmed and signed off with
the representation letter — completing the end-to-end Record to Report
cycle.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V04 - Hire to Retire (H2R)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V04.01. Workforce Planning
V04.02. Create Vacancy
V04.03. Attract Candidates
V04.04. Assess and Interview Candidates
V04.05. Make Offer
V04.06. Onboard Employee
V04.07. Provision Access / Equipment
V04.08. Manage Payroll and Benefits
V04.09. Manage Performance
V04.10. Develop Employee
V04.11. Manage Changes
V04.12. Handle Leave / Absence
V04.13. Offboard / Retire Employee

This is the people, or workforce, end-to-end process: the employee
lifecycle flows from workforce planning through recruitment, selection,
offer and onboarding, into ongoing pay, performance, development and
change, and finally to offboarding and retirement. The main external
participant at the start is the Applicant / Candidate, who becomes the
Employee once hired; the process is triggered by an internal workforce
need (a new or vacant role identified in workforce planning), and the
external interaction begins when the vacancy is advertised and candidates
apply.
```

**Context diagram prompt.**

```text
Context Diagram: V04 — Hire to Retire (H2R).

1. Central system (process-system)
A single central process/system ellipse named "Employer Company"
representing the whole organisation that runs the Hire to Retire process. It
is the system in context: everything inside it — human resources,
recruitment, hiring and people managers, payroll, IT, facilities, learning
and development, legal and finance, together with the supporting IT systems
(HRIS / HCM, applicant tracking, payroll, learning, identity and access,
workforce, and performance management) — is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Applicant / Candidate
- Employee
- Recruitment Agency
- Referee
- Background Check Provider
- Training Provider
- Benefits Provider
- Superannuation / Pension Fund

3. Layout
"Employer Company" sits in the centre. The Applicant / Candidate sits to the
LEFT (the labour-market party who responds to job adverts and applies), with
the Recruitment Agency and Referee also to the LEFT (candidate sourcing and
vetting). The Employee sits to the RIGHT (the ongoing employment
relationship once hired). Background Check Provider, Training Provider,
Benefits Provider and Superannuation / Pension Fund sit to the RIGHT (the
service providers in the employment relationship). The workforce need
originates INSIDE the company (an internal need), so no external demand
actor drives it. Every external entity connects directly to the central
system with labelled information flows; entities never connect to one
another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Employer Company → Applicant / Candidate: job advertisements, interview
  invitations, assessment instructions, offer letters, contracts, onboarding
  instructions.
- Applicant / Candidate → Employer Company: resumes, applications, interview
  availability, identity documents, references, employment history.
- Employer Company → Employee: employment communications, payslips,
  performance feedback, exit documentation.
- Employee → Employer Company: personal / bank / tax details, leave and
  absence requests, timesheets, acknowledgements.
- Employer Company → Recruitment Agency: vacancy briefs and candidate
  requirements.
- Recruitment Agency → Employer Company: sourced candidates and shortlists.
- Employer Company → Referee: reference requests.
- Referee → Employer Company: reference responses.
- Employer Company → Background Check Provider: check requests (identity,
  right-to-work, criminal record, credentials).
- Background Check Provider → Employer Company: check results and clearance.
- Employer Company → Training Provider: course bookings and enrolments.
- Training Provider → Employer Company: course completions and certifications.
- Employer Company → Benefits Provider: benefit enrolments and elections.
- Benefits Provider → Employer Company: benefit confirmations and statements.
- Employer Company → Superannuation / Pension Fund: contributions and member
  registrations.
- Superannuation / Pension Fund → Employer Company: membership confirmations
  and statements.

This Context Diagram frames the Employer Company as a single system in
context: an internal workforce need drives the Hire to Retire process, the
Applicant / Candidate applies and becomes the Employee once hired, and the
recruitment, background, training, benefit and superannuation providers
support recruitment and the ongoing employment relationship. The eight
external entities are exactly the external actors of the Process Context
diagram below, so the two views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V04 — Hire to Retire (H2R).

1. System boundary and processes
A system boundary named "V04 — Hire to Retire" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V04.01 Workforce Planning
- V04.02 Create Vacancy
- V04.03 Attract Candidates
- V04.04 Assess and Interview Candidates
- V04.05 Make Offer
- V04.06 Onboard Employee
- V04.07 Provision Access / Equipment
- V04.08 Manage Payroll and Benefits
- V04.09 Manage Performance
- V04.10 Develop Employee
- V04.11 Manage Changes
- V04.12 Handle Leave / Absence
- V04.13 Offboard / Retire Employee

2. Participants (outside the boundary)
External actors (actor):
- Applicant / Candidate
- Employee
- Recruitment Agency
- Referee
- Background Check Provider
- Training Provider
- Benefits Provider
- Superannuation / Pension Fund
Internal teams (team):
- Human Resources
- Recruitment
- Hiring Manager / People Manager
- Learning & Development
- Payroll
- Finance
- IT
- Facilities
- Legal
IT systems (system):
- HRIS / HCM System
- Applicant Tracking System (ATS)
- Payroll System
- Learning Management System (LMS)
- Identity & Access Management (IAM) System
- Workforce Management System
- Performance Management System

3. Layout
The processes sit inside the boundary in V04.01 → V04.13 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V04.01 Workforce Planning — Hiring Manager / People Manager (forecast
  demand), Human Resources (analyse workforce), Finance (endorse headcount &
  budget); HRIS / HCM System (workforce data).
- V04.02 Create Vacancy — Hiring Manager / People Manager (define role),
  Recruitment (raise requisition); Applicant Tracking System (open vacancy).
- V04.03 Attract Candidates — Applicant / Candidate (apply), Recruitment Agency
  (source candidates); Recruitment (advertise & shortlist); Applicant Tracking
  System (record shortlist).
- V04.04 Assess and Interview Candidates — Applicant / Candidate (attend &
  interview), Referee (provide references); Recruitment (arrange), Hiring
  Manager / People Manager (assess); Applicant Tracking System (record outcome).
- V04.05 Make Offer — Applicant / Candidate (receive & accept offer),
  Background Check Provider (screen); Recruitment (prepare offer), Human
  Resources (confirm), Legal (contract); HRIS / HCM System (create record).
- V04.06 Onboard Employee — Employee (submit documents), Superannuation /
  Pension Fund (register member), Benefits Provider (enrol); Human Resources
  (onboard), Payroll (set up); HRIS / HCM System (employee master data).
- V04.07 Provision Access / Equipment — Employee (receive access & equipment);
  IT (provision accounts), Facilities (issue equipment & pass); Identity &
  Access Management (IAM) System (identity & access).
- V04.08 Manage Payroll and Benefits — Employee (receive payslips),
  Superannuation / Pension Fund, Benefits Provider (contributions); Payroll
  (run pay), Finance (remit); Payroll System (calculate & pay).
- V04.09 Manage Performance — Employee (objectives & feedback); Hiring Manager /
  People Manager (review), Human Resources (record); Performance Management
  System (ratings & reviews).
- V04.10 Develop Employee — Employee (learn), Training Provider (deliver
  training); Learning & Development (plan & book); Learning Management System
  (training records).
- V04.11 Manage Changes — Employee (notified of change); Human Resources
  (approve), Hiring Manager / People Manager (request), Payroll (apply pay
  change); HRIS / HCM System (update record).
- V04.12 Handle Leave / Absence — Employee (request leave); Hiring Manager /
  People Manager (approve), Human Resources (record), Payroll (apply);
  Workforce Management System (balances & rosters).
- V04.13 Offboard / Retire Employee — Employee (final pay & exit),
  Superannuation / Pension Fund, Benefits Provider (cessation); Human Resources
  (offboard), Payroll (final pay), IT (revoke access); HRIS / HCM System
  (termination & archive).

This Process Context diagram frames the whole Hire to Retire value chain: the
thirteen subprocesses inside the boundary, the external actors (Applicant /
Candidate, Employee, Recruitment Agency, Referee, Background Check Provider,
Training Provider, Benefits Provider, Superannuation / Pension Fund) and
internal teams that perform them, and the IT systems that support them —
consistent with the per-process BPMN prompts below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Employing Organisation" pool (key role in brackets), and IT
systems are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V04.01** Workforce Planning | — | Hiring Manager / People Manager (people manager), Human Resources (HR business partner), Finance (finance controller) | HRIS / HCM System |
| **V04.02** Create Vacancy | — | Hiring Manager / People Manager (hiring manager), Recruitment (recruiter) | Applicant Tracking System |
| **V04.03** Attract Candidates | Applicant / Candidate, Recruitment Agency | Recruitment (recruiter) | Applicant Tracking System |
| **V04.04** Assess and Interview Candidates | Applicant / Candidate, Referee | Recruitment (recruiter), Hiring Manager / People Manager (hiring manager) | Applicant Tracking System |
| **V04.05** Make Offer | Applicant / Candidate, Background Check Provider | Recruitment (recruiter), Human Resources (HR business partner), Legal (employment lawyer) | HRIS / HCM System |
| **V04.06** Onboard Employee | Employee, Superannuation / Pension Fund, Benefits Provider | Human Resources (onboarding coordinator), Payroll (payroll officer) | HRIS / HCM System |
| **V04.07** Provision Access / Equipment | Employee | IT (IT provisioning officer), Facilities (facilities officer) | Identity & Access Management (IAM) System |
| **V04.08** Manage Payroll and Benefits | Employee, Superannuation / Pension Fund, Benefits Provider | Payroll (payroll officer), Finance (finance controller) | Payroll System |
| **V04.09** Manage Performance | Employee | Hiring Manager / People Manager (people manager), Human Resources (HR business partner) | Performance Management System |
| **V04.10** Develop Employee | Employee, Training Provider | Learning & Development (training manager) | Learning Management System |
| **V04.11** Manage Changes | Employee | Human Resources (HR business partner), Hiring Manager / People Manager (people manager), Payroll (payroll officer) | HRIS / HCM System |
| **V04.12** Handle Leave / Absence | Employee | Hiring Manager / People Manager (people manager), Human Resources (employee relations adviser), Payroll (payroll officer) | Workforce Management System |
| **V04.13** Offboard / Retire Employee | Employee, Superannuation / Pension Fund, Benefits Provider | Human Resources (employee relations adviser), Payroll (payroll officer), IT (IT provisioning officer) | HRIS / HCM System |

**Actor / Team / System roll-up** (every distinct participant across V04):

- **External actors:** Applicant / Candidate (V04.03–V04.05); Employee (V04.06–V04.13); Recruitment Agency (V04.03); Referee (V04.04); Background Check Provider (V04.05); Training Provider (V04.10); Benefits Provider (V04.06, V04.08, V04.13); Superannuation / Pension Fund (V04.06, V04.08, V04.13).
- **Teams:** Human Resources (V04.01, V04.05, V04.06, V04.09, V04.11, V04.12, V04.13); Recruitment (V04.02–V04.05); Hiring Manager / People Manager (V04.01, V04.02, V04.04, V04.09, V04.11, V04.12); Learning & Development (V04.10); Payroll (V04.06, V04.08, V04.11, V04.12, V04.13); Finance (V04.01, V04.08); IT (V04.07, V04.13); Facilities (V04.07); Legal (V04.05).
- **IT systems:** HRIS / HCM System (V04.01, V04.05, V04.06, V04.11, V04.13); Applicant Tracking System (V04.02, V04.03, V04.04); Payroll System (V04.08); Learning Management System (V04.10); Identity & Access Management (IAM) System (V04.07); Workforce Management System (V04.12); Performance Management System (V04.09).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Hire to Retire service area. It shows
the **Actors**, **Services**, **Processes**, **Interfaces** and **Applications**
that provide the Recruitment & Selection Service and the related people services
across the thirteen V04 processes. Each Business Process is a drill-down anchor:
link it to the matching V04.nn BPMN diagram and its marker turns green.

```text
ArchiMate: V04 — Hire to Retire — Service & Application Landscape (high level).

Purpose: show how the organisation provides the workforce and employment
services (to the internal managers, to the Applicant / Candidate and to the
Employee) across the thirteen V04 Hire to Retire processes, and the
applications that support them. Lay it out in three horizontal bands, top to
bottom — BUSINESS SERVICES → BUSINESS PROCESSES → APPLICATIONS — with the
Applicant / Candidate on the far left and the Employee and provider actors on
the far right. Read top-to-bottom as service → process → application (ArchiMate
service realisation).

1. Business Actors (Business Actor)
- Applicant / Candidate — the external party the recruitment service is
  provided to (far left, the party who applies for the vacancy).
- Employee — the person the ongoing employment service is provided to (once
  hired), centre-right of the view.
- Recruitment Agency, Referee, Background Check Provider, Training Provider,
  Benefits Provider, Superannuation / Pension Fund — external actors that take
  part in sourcing, vetting, development and the employment relationship (far
  right).

2. Interfaces
- Business Interface "Careers Portal / Employee Self-Service" — the channel the
  Applicant / Candidate uses to view vacancies and apply, and the Employee uses
  to self-serve pay, leave and personal details. The Applicant / Candidate and
  Employee ACCESS this interface; the interface SERVES the business services
  below.
- Application Interfaces (optional, only the few the portal calls): "Recruitment
  API" on the Applicant Tracking System, "Payroll API" on the Payroll System.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in employee-lifecycle order:
- Workforce Planning Service — plan roles, headcount and budget.
- Recruitment & Selection Service — advertise, attract, assess and select.
- Offer & Onboarding Service — offer, onboard and provision the new hire.
- Pay & Benefits Service — pay the employee and manage benefits.
- Performance & Development Service — manage performance and develop the
  employee.
- Change & Leave Service — manage employment changes and leave / absence.
- Offboarding & Retirement Service — offboard and retire the employee.

4. Business Processes (Business Process) — the thirteen V04 processes, middle
   band in V04.01 → V04.13 order. Each REALISES the business service shown and is
   the link anchor to its BPMN diagram:
- V04.01 Workforce Planning                 -> realises Workforce Planning Service
- V04.02 Create Vacancy                     -> realises Recruitment & Selection Service
- V04.03 Attract Candidates                 -> realises Recruitment & Selection Service
- V04.04 Assess and Interview Candidates    -> realises Recruitment & Selection Service
- V04.05 Make Offer                         -> realises Offer & Onboarding Service
- V04.06 Onboard Employee                   -> realises Offer & Onboarding Service
- V04.07 Provision Access / Equipment       -> realises Offer & Onboarding Service
- V04.08 Manage Payroll and Benefits        -> realises Pay & Benefits Service
- V04.09 Manage Performance                 -> realises Performance & Development Service
- V04.10 Develop Employee                   -> realises Performance & Development Service
- V04.11 Manage Changes                     -> realises Change & Leave Service
- V04.12 Handle Leave / Absence             -> realises Change & Leave Service
- V04.13 Offboard / Retire Employee         -> realises Offboarding & Retirement Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- HRIS / HCM System
- Applicant Tracking System (ATS)
- Payroll System
- Learning Management System (LMS)
- Identity & Access Management (IAM) System
- Workforce Management System
- Performance Management System

6. Relationships
- Applicant / Candidate -accesses-> Careers Portal / Employee Self-Service.
- Employee -accesses-> Careers Portal / Employee Self-Service.
- Careers Portal / Employee Self-Service -serving-> the Recruitment,
  Onboarding, Pay and Leave services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V04.01 <- HRIS / HCM System;            V04.02 <- Applicant Tracking System;
    V04.03 <- Applicant Tracking System;    V04.04 <- Applicant Tracking System;
    V04.05 <- HRIS / HCM System;            V04.06 <- HRIS / HCM System;
    V04.07 <- Identity & Access Management (IAM) System;
    V04.08 <- Payroll System;               V04.09 <- Performance Management System;
    V04.10 <- Learning Management System;   V04.11 <- HRIS / HCM System;
    V04.12 <- Workforce Management System;  V04.13 <- HRIS / HCM System.
- Recruitment Agency -serving-> V04.03 Attract Candidates.
- Referee -serving-> V04.04 Assess and Interview Candidates.
- Background Check Provider -serving-> V04.05 Make Offer.
- Training Provider -serving-> V04.10 Develop Employee.
- Benefits Provider and Superannuation / Pension Fund -serving-> V04.06 Onboard
  Employee, V04.08 Manage Payroll and Benefits, and V04.13 Offboard / Retire
  Employee.

7. Intent
The Recruitment & Selection Service sits top-centre-left as the headline
attraction service, with the employment services running to its right. The
thirteen Business Processes form the backbone in V04.01 -> V04.13 order so the
reader can trace the employee lifecycle and drill from any process straight into
its detailed BPMN model. This one ArchiMate view therefore links to all thirteen
V04 BPMN process diagrams. The mapping of process -> actors/teams/applications is
the Process <-> Actors / Teams / IT Systems matrix above.
```

### V04.01 — Workforce Planning

**BPMN diagram prompt.**

```text
BPMN: V04.01 Workforce Planning — first stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employing Organisation" — the organisation running the process, with
  three lanes top-to-bottom: "Hiring Manager / People Manager", "Human
  Resources", "Finance".
- Pool "HRIS / HCM System" — the supporting IT system.

2. Pool properties
- Employing Organisation: white-box (holds the process flow).
- HRIS / HCM System: black-box, System = true, single instance.

3. Layout
- Employing Organisation pool at the top, HRIS / HCM System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Hiring Manager / People Manager lane:
- Conditional start event "Workforce planning cycle begins" (annual cycle,
  business change, or an identified vacancy)
- User task "Forecast role demand and skills gaps"
Human Resources lane:
- Service task "Analyse current workforce, turnover and cost"
- Expanded Subprocess (LOOP marker) "Agree workforce plan and headcount":
    internals — User task "Draft workforce plan (roles, budget, timing)", then
    exclusive gateway "Plan approved within budget?": branch "Yes" → subprocess
    end event "Plan approved". The loop marker repeats the attempt while the
    plan is not approved.
Finance lane:
- Service task "Record approved headcount and budget"
- End event "Workforce plan approved — ready for Create Vacancy (V04.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Agree workforce plan and headcount"
  Expanded Subprocess: "Plan not approved in 10 business days" → User task
  "Escalate to HR Director" → escalation end event "Escalated — workforce plan
  not approved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Analyse current workforce, turnover and cost" → HRIS / HCM System
- HRIS / HCM System → "Draft workforce plan (roles, budget, timing)" (headcount,
  turnover and cost data)
- "Record approved headcount and budget" → HRIS / HCM System

This is the internal entry point of H2R: demand and skills gaps are forecast,
the current workforce analysed, and a workforce plan drafted and approved
within budget (retried until approved) — leaving an approved headcount ready to
become a vacancy.
```

### V04.02 — Create Vacancy

**BPMN diagram prompt.**

```text
BPMN: V04.02 Create Vacancy — second stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employing Organisation" — the organisation, with two lanes top-to-bottom:
  "Hiring Manager / People Manager", "Recruitment".
- Pool "Applicant Tracking System" — the supporting IT system.

2. Pool properties
- Employing Organisation: white-box (holds the process flow).
- Applicant Tracking System: black-box, System = true, single instance.

3. Layout
- Employing Organisation pool at the top, Applicant Tracking System pool at the
  bottom.

4. Lane contents in flow order (Employing Organisation)
Hiring Manager / People Manager lane:
- Message start event "Approved workforce plan received"
- User task "Define role requirements (job description, criteria, grade)"
Recruitment lane:
- Expanded Subprocess (LOOP marker) "Finalise job requisition":
    internals — User task "Review requisition (job description, grade, budget)",
    then exclusive gateway "Requisition OK?": branch "No" → User task "Amend
    requisition" → subprocess end event "Amendment recorded" (the loop marker
    then re-reviews); branch "Yes" → subprocess end event "Requisition correct".
    The loop marker repeats while the requisition is not OK.
- Service task "Open vacancy in Applicant Tracking System"
- End event "Vacancy created — ready for Attract Candidates (V04.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Finalise job requisition" Expanded
  Subprocess: "Not finalised in 3 business days" → User task "Escalate to
  Recruitment Lead" → escalation end event "Escalated — requisition not finalised
  in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Open vacancy in Applicant Tracking System" → Applicant Tracking System
- Applicant Tracking System → "Review requisition (job description, grade,
  budget)" (job templates, grading and approval rules)

This stage turns an approved plan into a complete, reviewed job requisition
(corrected until it passes review) and opens the vacancy in the tracking
system — leaving a live vacancy ready to attract candidates.
```

### V04.03 — Attract Candidates

**BPMN diagram prompt.**

```text
BPMN: V04.03 Attract Candidates — third stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Applicant / Candidate" — the external party who applies for the vacancy.
- Pool "Recruitment Agency" — the external candidate-sourcing partner.
- Pool "Employing Organisation" — the organisation, with one lane: "Recruitment".
- Pool "Applicant Tracking System" — the supporting IT system.

2. Pool properties
- Applicant / Candidate: black-box, single instance.
- Recruitment Agency: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Applicant Tracking System: black-box, System = true, single instance.

3. Layout
- Applicant / Candidate and Recruitment Agency pools at the top, Employing
  Organisation pool in the middle, Applicant Tracking System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Recruitment lane:
- Message start event "Vacancy opened"
- Service task "Publish job advertisement (boards, careers site)"
- Send task "Brief recruitment agency"
- Expanded Subprocess (LOOP marker) "Build candidate shortlist":
    internals — Service task "Receive and screen applications", then intermediate
    message catch event "Candidate / agency submissions received", then exclusive
    gateway "Enough qualified candidates?": branch "Yes" → subprocess end event
    "Shortlist ready". The loop marker repeats the re-advertise / re-source
    attempt while the shortlist is too thin.
- Service task "Record shortlist in Applicant Tracking System"
- End event "Candidates attracted — ready for Assess and Interview Candidates
  (V04.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Build candidate shortlist" Expanded
  Subprocess: "Shortlist not reached in 15 business days" → User task "Escalate
  to Hiring Manager" → escalation end event "Escalated — shortlist not reached in
  time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Publish job advertisement (boards, careers site)" → Applicant / Candidate
  (job advertisement)
- "Brief recruitment agency" → Recruitment Agency
- Applicant / Candidate → intermediate event "Candidate / agency submissions
  received" (applications, resumes)
- Recruitment Agency → intermediate event "Candidate / agency submissions
  received" (sourced candidates)
- "Record shortlist in Applicant Tracking System" → Applicant Tracking System

This stage advertises the vacancy, briefs the agency and builds a qualified
shortlist from candidate and agency submissions (re-sourced until strong
enough) — leaving a shortlist ready for assessment.
```

### V04.04 — Assess and Interview Candidates

**BPMN diagram prompt.**

```text
BPMN: V04.04 Assess and Interview Candidates — fourth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Applicant / Candidate" — the external party attending assessment.
- Pool "Referee" — the external party providing references.
- Pool "Employing Organisation" — the organisation, with two lanes top-to-bottom:
  "Recruitment", "Hiring Manager / People Manager".
- Pool "Applicant Tracking System" — the supporting IT system.

2. Pool properties
- Applicant / Candidate: black-box, single instance.
- Referee: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Applicant Tracking System: black-box, System = true, single instance.

3. Layout
- Applicant / Candidate and Referee pools at the top, Employing Organisation
  pool in the middle, Applicant Tracking System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Recruitment lane:
- Message start event "Shortlist ready"
- Send task "Invite candidates to interview / assessment"
- Intermediate message catch event "Candidate confirms availability"
Hiring Manager / People Manager lane:
- User task "Conduct interviews / assessments"
- Exclusive gateway "Suitable candidate identified?"
    - branch "No – re-open sourcing": End event "No suitable candidate — routed
      back to Attract Candidates (V04.03)"
    - branch "Yes": continue to Recruitment
Recruitment lane:
- Expanded Subprocess (LOOP marker) "Complete reference checks":
    internals — Send task "Request references from referees", then intermediate
    message catch event "Referee responds", then exclusive gateway "References
    received and satisfactory?": branch "Yes" → subprocess end event "References
    cleared". The loop marker repeats, chasing outstanding referees, while
    references are missing.
- Service task "Record assessment outcome in Applicant Tracking System"
- End event "Preferred candidate selected — ready for Make Offer (V04.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete reference checks" Expanded
  Subprocess: "References not received in 5 business days" → User task "Escalate
  to Recruitment Lead" → escalation end event "Escalated — references not
  received in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Invite candidates to interview / assessment" → Applicant / Candidate
- Applicant / Candidate → intermediate event "Candidate confirms availability"
- "Request references from referees" → Referee
- Referee → intermediate event "Referee responds"
- "Record assessment outcome in Applicant Tracking System" → Applicant Tracking
  System

This stage invites, interviews and assesses the shortlist, re-opening sourcing
where no one is suitable, and completes reference checks with the referees
(chased until received) — leaving a preferred candidate ready for an offer.
```

### V04.05 — Make Offer

**BPMN diagram prompt.**

```text
BPMN: V04.05 Make Offer — fifth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Applicant / Candidate" — the external party who receives the offer.
- Pool "Background Check Provider" — the external pre-employment screening party.
- Pool "Employing Organisation" — the organisation, with three lanes
  top-to-bottom: "Recruitment", "Human Resources", "Legal".
- Pool "HRIS / HCM System" — the supporting IT system.

2. Pool properties
- Applicant / Candidate: black-box, single instance.
- Background Check Provider: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- HRIS / HCM System: black-box, System = true, single instance.

3. Layout
- Applicant / Candidate and Background Check Provider pools at the top, Employing
  Organisation pool in the middle, HRIS / HCM System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Recruitment lane:
- Message start event "Preferred candidate received"
- Service task "Prepare offer (package, grade, start date)"
Legal lane:
- User task "Prepare employment contract and terms"
Human Resources lane:
- Expanded Subprocess (LOOP marker) "Negotiate and confirm offer":
    internals — Send task "Send offer letter to candidate", then intermediate
    message catch event "Candidate responds (accept / negotiate)", then exclusive
    gateway "Offer accepted?": branch "Yes" → subprocess end event "Offer
    accepted". The loop marker repeats the negotiation while the offer is not
    accepted.
- Service task "Initiate pre-employment background checks"
- Intermediate message catch event "Background check results received"
- Exclusive gateway "Checks clear?"
    - branch "No – adverse result": End event "Offer withdrawn — routed back to
      Assess and Interview Candidates (V04.04)"
    - branch "Yes": continue
- Service task "Create employee record and confirm start date in HRIS"
- End event "Offer accepted and cleared — ready for Onboard Employee (V04.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Negotiate and confirm offer"
  Expanded Subprocess: "Offer not accepted in 5 business days" → User task
  "Escalate to Hiring Manager" → escalation end event "Escalated — offer not
  accepted in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Send offer letter to candidate" → Applicant / Candidate
- Applicant / Candidate → intermediate event "Candidate responds (accept /
  negotiate)"
- "Initiate pre-employment background checks" → Background Check Provider
- Background Check Provider → intermediate event "Background check results
  received"
- "Create employee record and confirm start date in HRIS" → HRIS / HCM System

This stage prepares the offer and contract, negotiates and confirms it with the
candidate (retried until accepted), screens the hire with the background check
provider, withdrawing on an adverse result — and creates the employee record,
leaving an accepted, cleared hire ready for onboarding.
```

### V04.06 — Onboard Employee

**BPMN diagram prompt.**

```text
BPMN: V04.06 Onboard Employee — sixth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the new hire (the Applicant / Candidate, now an Employee).
- Pool "Superannuation / Pension Fund" — the external retirement-savings party.
- Pool "Benefits Provider" — the external benefits party.
- Pool "Employing Organisation" — the organisation, with two lanes top-to-bottom:
  "Human Resources", "Payroll".
- Pool "HRIS / HCM System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Superannuation / Pension Fund: black-box, single instance.
- Benefits Provider: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- HRIS / HCM System: black-box, System = true, single instance.

3. Layout
- Employee, Superannuation / Pension Fund and Benefits Provider pools at the top,
  Employing Organisation pool in the middle, HRIS / HCM System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Human Resources lane:
- Message start event "New hire confirmed"
- Send task "Send onboarding pack and first-day instructions"
- Expanded Subprocess (LOOP marker) "Collect and verify new-hire information":
    internals — Send task "Request personal, tax and bank details", then
    intermediate message catch event "Employee submits documents", then User task
    "Verify documents and right-to-work", then exclusive gateway "Information
    complete and valid?": branch "Yes" → subprocess end event "New-hire data
    verified". The loop marker repeats, chasing missing or invalid documents,
    while the information is incomplete.
Payroll lane:
- Service task "Set up employee in HRIS and payroll"
- Service task "Register with superannuation / pension fund"
- Service task "Enrol in benefits"
- End event "Employee onboarded — ready for Provision Access / Equipment
  (V04.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Collect and verify new-hire
  information" Expanded Subprocess: "Documents not complete by start date" → User
  task "Escalate to HR Business Partner" → escalation end event "Escalated —
  new-hire information not complete in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Send onboarding pack and first-day instructions" → Employee
- "Request personal, tax and bank details" → Employee
- Employee → intermediate event "Employee submits documents"
- "Set up employee in HRIS and payroll" → HRIS / HCM System
- "Register with superannuation / pension fund" → Superannuation / Pension Fund
- "Enrol in benefits" → Benefits Provider

This stage welcomes the new hire, collects and verifies their personal, tax and
right-to-work information (chased until complete), and sets them up in HRIS,
payroll, superannuation and benefits — leaving an onboarded employee ready for
access and equipment.
```

### V04.07 — Provision Access / Equipment

**BPMN diagram prompt.**

```text
BPMN: V04.07 Provision Access / Equipment — seventh stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the new hire receiving access and equipment.
- Pool "Employing Organisation" — the organisation, with two lanes top-to-bottom:
  "IT", "Facilities".
- Pool "Identity & Access Management (IAM) System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Identity & Access Management (IAM) System: black-box, System = true, single
  instance.

3. Layout
- Employee pool at the top, Employing Organisation pool in the middle, Identity &
  Access Management (IAM) System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
IT lane:
- Message start event "Onboarding completed — provisioning requested"
- Service task "Create identity and accounts (email, network, applications)"
- User task "Assign role-based access"
- Expanded Subprocess (LOOP marker) "Resolve access provisioning issues":
    internals — User task "Test access / provisioning", then exclusive gateway
    "Access working correctly?": branch "Yes" → subprocess end event "Access
    confirmed". The loop marker repeats the fix-and-retest attempt while access
    is not working.
Facilities lane:
- User task "Issue equipment and workplace access (desk, pass, devices)"
- Service task "Record assets and access in IAM / asset register"
- End event "Access and equipment provisioned — ready for Manage Payroll and
  Benefits (V04.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve access provisioning issues"
  Expanded Subprocess: "Access not working within 2 business days of start" →
  User task "Escalate to IT Service Manager" → escalation end event "Escalated —
  access not provisioned in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Create identity and accounts (email, network, applications)" → Identity &
  Access Management (IAM) System
- Identity & Access Management (IAM) System → "Test access / provisioning"
  (account and entitlement status)
- "Issue equipment and workplace access (desk, pass, devices)" → Employee
- "Record assets and access in IAM / asset register" → Identity & Access
  Management (IAM) System

This stage creates the employee's identity and role-based access, resolving any
provisioning issue (retried until access works), and issues equipment and
workplace access — leaving the employee fully provisioned and ready to be paid.
```

### V04.08 — Manage Payroll and Benefits

**BPMN diagram prompt.**

```text
BPMN: V04.08 Manage Payroll and Benefits — eighth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the party who is paid and receives payslips.
- Pool "Superannuation / Pension Fund" — the external retirement-savings party.
- Pool "Benefits Provider" — the external benefits party.
- Pool "Employing Organisation" — the organisation, with two lanes top-to-bottom:
  "Payroll", "Finance".
- Pool "Payroll System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Superannuation / Pension Fund: black-box, single instance.
- Benefits Provider: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Payroll System: black-box, System = true, single instance.

3. Layout
- Employee, Superannuation / Pension Fund and Benefits Provider pools at the top,
  Employing Organisation pool in the middle, Payroll System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Payroll lane:
- Message start event "Pay cycle due"
- Service task "Import time, attendance and changes"
- Service task "Calculate gross-to-net pay"
- Exclusive gateway "Payroll validated within tolerance?"
    - branch "No – exceptions": Expanded Subprocess (LOOP marker) "Resolve payroll
      exceptions": internals — User task "Investigate pay exception", then Send
      task "Query employee / manager", then intermediate message catch event
      "Response received", then exclusive gateway "Cleared?": branch "Yes" →
      subprocess end event "Exception cleared". The loop marker repeats while
      exceptions remain.
    - branch "Yes": continue
- Service task "Run payroll and issue payslips"
Finance lane:
- Service task "Remit tax, superannuation and benefit contributions"
- End event "Pay and benefits processed — ready for Manage Performance (V04.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve payroll exceptions" Expanded
  Subprocess: "Not cleared before pay run cut-off" → User task "Escalate to
  Payroll Manager" → escalation end event "Escalated — payroll exception not
  cleared in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Import time, attendance and changes" → Payroll System
- Payroll System → "Calculate gross-to-net pay" (pay rules, rates and
  deductions)
- "Query employee / manager" → Employee
- Employee → intermediate event "Response received"
- "Run payroll and issue payslips" → Employee (payslips)
- "Remit tax, superannuation and benefit contributions" → Superannuation /
  Pension Fund
- "Remit tax, superannuation and benefit contributions" → Benefits Provider

This stage imports time and changes, calculates pay and clears any payroll
exception with the employee or manager (retried until cleared), then runs
payroll, issues payslips and remits superannuation and benefit contributions —
leaving the employee paid and contributions settled.
```

### V04.09 — Manage Performance

**BPMN diagram prompt.**

```text
BPMN: V04.09 Manage Performance — ninth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the party whose performance is managed.
- Pool "Employing Organisation" — the organisation, with two lanes top-to-bottom:
  "Hiring Manager / People Manager", "Human Resources".
- Pool "Performance Management System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Performance Management System: black-box, System = true, single instance.

3. Layout
- Employee pool at the top, Employing Organisation pool in the middle,
  Performance Management System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Hiring Manager / People Manager lane:
- Message start event "Performance cycle / review due"
- Service task "Set objectives and expectations"
- User task "Review performance against objectives"
- Exclusive gateway "Performance meeting expectations?"
    - branch "Yes": continue to Human Resources
    - branch "No – underperformance": Expanded Subprocess (LOOP marker) "Run
      performance improvement plan": internals — User task "Agree improvement
      actions with employee", then intermediate message catch event "Employee
      progress reviewed", then exclusive gateway "Improved to standard?": branch
      "Yes" → subprocess end event "Performance restored". The loop marker repeats
      each review cycle while performance is below standard.
Human Resources lane:
- Service task "Record review and rating in Performance Management System"
- End event "Performance reviewed — ready for Develop Employee (V04.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Run performance improvement plan"
  Expanded Subprocess: "Not improved within the improvement-plan period" → User
  task "Escalate to HR Business Partner" → escalation end event "Escalated —
  performance not restored in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Set objectives and expectations" → Employee
- Employee → intermediate event "Employee progress reviewed"
- "Record review and rating in Performance Management System" → Performance
  Management System

This stage sets objectives and reviews performance, running an improvement plan
where the employee is below standard (retried each cycle until restored) and
recording the review and rating — leaving performance reviewed and ready for
development.
```

### V04.10 — Develop Employee

**BPMN diagram prompt.**

```text
BPMN: V04.10 Develop Employee — tenth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the party being developed.
- Pool "Training Provider" — the external training-delivery party.
- Pool "Employing Organisation" — the organisation, with one lane: "Learning &
  Development".
- Pool "Learning Management System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Training Provider: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Learning Management System: black-box, System = true, single instance.

3. Layout
- Employee and Training Provider pools at the top, Employing Organisation pool in
  the middle, Learning Management System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Learning & Development lane:
- Message start event "Development need identified" (from review, role change or
  compliance requirement)
- User task "Agree development plan with employee and manager"
- Service task "Book training / enrol in courses"
- Expanded Subprocess (LOOP marker) "Complete training and confirm competency":
    internals — intermediate message catch event "Training completion received",
    then User task "Assess competency", then exclusive gateway "Competency
    achieved?": branch "Yes" → subprocess end event "Competency confirmed". The
    loop marker repeats the re-training attempt while competency is not achieved.
- Service task "Update training records and skills in Learning Management System"
- End event "Employee developed — ready for Manage Changes (V04.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete training and confirm
  competency" Expanded Subprocess: "Not completed in the agreed period" → User
  task "Escalate to Learning & Development Manager" → escalation end event
  "Escalated — training not completed in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Agree development plan with employee and manager" → Employee
- "Book training / enrol in courses" → Training Provider
- "Book training / enrol in courses" → Learning Management System
- Training Provider → intermediate event "Training completion received"
- "Update training records and skills in Learning Management System" → Learning
  Management System

This stage agrees a development plan, books training with the provider and
confirms competency (re-trained until achieved), then updates the employee's
training records and skills — leaving the employee developed and ready for any
employment change.
```

### V04.11 — Manage Changes

**BPMN diagram prompt.**

```text
BPMN: V04.11 Manage Changes — eleventh stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the party affected by the change.
- Pool "Employing Organisation" — the organisation, with three lanes
  top-to-bottom: "Human Resources", "Hiring Manager / People Manager", "Payroll".
- Pool "HRIS / HCM System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- HRIS / HCM System: black-box, System = true, single instance.

3. Layout
- Employee pool at the top, Employing Organisation pool in the middle, HRIS / HCM
  System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Hiring Manager / People Manager lane:
- Message start event "Employment change requested" (promotion, transfer, pay or
  hours change)
- User task "Raise change request (role, grade, pay, hours)"
Human Resources lane:
- Expanded Subprocess (LOOP marker) "Review and approve change":
    internals — User task "Review change against policy and budget", then
    exclusive gateway "Change approved?": branch "No" → User task "Amend /
    rejustify change" → subprocess end event "Amendment recorded" (the loop marker
    then re-reviews); branch "Yes" → subprocess end event "Change approved". The
    loop marker repeats while the change is not approved.
- Service task "Update contract and employee record in HRIS"
Payroll lane:
- Service task "Apply pay / entitlement changes"
- Send task "Notify employee of change"
- End event "Change applied — ready for Handle Leave / Absence (V04.12)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Review and approve change" Expanded
  Subprocess: "Not approved in 5 business days" → User task "Escalate to HR
  Business Partner" → escalation end event "Escalated — change not approved in
  time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Update contract and employee record in HRIS" → HRIS / HCM System
- HRIS / HCM System → "Review change against policy and budget" (current role,
  grade and budget)
- "Notify employee of change" → Employee

This stage raises an employment change, reviews and approves it against policy
and budget (corrected until approved), updates the contract and employee record
and applies the pay change — leaving the change applied and the employee
notified.
```

### V04.12 — Handle Leave / Absence

**BPMN diagram prompt.**

```text
BPMN: V04.12 Handle Leave / Absence — twelfth stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the party requesting leave or reporting absence.
- Pool "Employing Organisation" — the organisation, with three lanes
  top-to-bottom: "Hiring Manager / People Manager", "Human Resources", "Payroll".
- Pool "Workforce Management System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- Workforce Management System: black-box, System = true, single instance.

3. Layout
- Employee pool at the top, Employing Organisation pool in the middle, Workforce
  Management System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Hiring Manager / People Manager lane:
- Message start event "Leave / absence request received"
- User task "Review leave request (balance, coverage)"
- Exclusive gateway "Leave approved?"
    - branch "No – needs discussion": Expanded Subprocess (LOOP marker) "Resolve
      leave request": internals — Send task "Discuss options with employee", then
      intermediate message catch event "Employee responds (revised dates)", then
      exclusive gateway "Agreed?": branch "Yes" → subprocess end event "Leave
      agreed". The loop marker repeats while the leave is not agreed.
    - branch "Yes": continue to Human Resources
Human Resources lane:
- Service task "Record leave and update balances"
Payroll lane:
- Service task "Apply leave to pay / entitlements"
- Send task "Confirm leave to employee"
- End event "Leave / absence handled — ready for Offboard / Retire Employee
  (V04.13)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve leave request" Expanded
  Subprocess: "Not agreed in 3 business days" → User task "Escalate to HR
  Business Partner" → escalation end event "Escalated — leave request not agreed
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Employee → start event "Leave / absence request received"
- "Discuss options with employee" → Employee
- Employee → intermediate event "Employee responds (revised dates)"
- "Record leave and update balances" → Workforce Management System
- "Confirm leave to employee" → Employee

This stage reviews the leave request, resolving it with the employee where it
cannot be approved as asked (retried until agreed), records the leave and
updates balances, and applies it to pay — leaving the leave or absence handled
and confirmed to the employee.
```

### V04.13 — Offboard / Retire Employee

**BPMN diagram prompt.**

```text
BPMN: V04.13 Offboard / Retire Employee — final stage of the Hire to Retire (H2R) value chain.

1. Pools & Lanes
- Pool "Employee" — the departing or retiring party.
- Pool "Superannuation / Pension Fund" — the external retirement-savings party.
- Pool "Benefits Provider" — the external benefits party.
- Pool "Employing Organisation" — the organisation, with three lanes
  top-to-bottom: "Human Resources", "Payroll", "IT".
- Pool "HRIS / HCM System" — the supporting IT system.

2. Pool properties
- Employee: black-box, single instance.
- Superannuation / Pension Fund: black-box, single instance.
- Benefits Provider: black-box, single instance.
- Employing Organisation: white-box (holds the process flow).
- HRIS / HCM System: black-box, System = true, single instance.

3. Layout
- Employee, Superannuation / Pension Fund and Benefits Provider pools at the top,
  Employing Organisation pool in the middle, HRIS / HCM System pool at the bottom.

4. Lane contents in flow order (Employing Organisation)
Human Resources lane:
- Message start event "Termination / retirement notified" (resignation,
  retirement, end of contract, or dismissal)
- Service task "Confirm leaving type and last day"
- Service task "Record termination and reason in HRIS"
- User task "Conduct exit interview and knowledge handover"
Payroll lane:
- Service task "Calculate final pay and entitlements"
IT lane:
- Service task "Revoke access and recover equipment"
- Exclusive gateway "All exit steps complete & no open items?"
    - branch "No – open item": User task "Return to responsible team", then End
      event "Re-opened — routed back to the open step"
    - branch "Yes": continue to Human Resources
Human Resources lane:
- Service task "Issue exit documentation and archive records"
- End event "Employee offboarded — Hire to Retire complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- "Record termination and reason in HRIS" → HRIS / HCM System
- "Calculate final pay and entitlements" → Employee (final payslip)
- "Calculate final pay and entitlements" → Superannuation / Pension Fund
  (cessation and final contribution)
- "Calculate final pay and entitlements" → Benefits Provider (termination of
  benefits)
- "Revoke access and recover equipment" → HRIS / HCM System
- "Issue exit documentation and archive records" → Employee

This stage confirms the leaving type and last day, records the termination,
calculates final pay and settles superannuation and benefits, revokes access and
recovers equipment, and — once every exit step is complete with no open items —
issues exit documentation and archives the records, completing the end-to-end
Hire to Retire cycle.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V05 - Plan to Produce (Make)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V05.01. Forecast Demand
V05.02. Plan Supply
V05.03. Create Production Plan
V05.04. Check Capacity and Materials
V05.05. Schedule Production
V05.06. Issue Materials
V05.07. Manufacture Product
V05.08. Inspect Quality
V05.09. Manage Exceptions
V05.10. Record Production Output
V05.11. Move Finished Goods to Inventory
V05.12. Close Production Orders

This is the make / produce end-to-end process: a demand forecast flows
through supply and production planning, capacity and material checks,
scheduling, material issue, manufacture, quality inspection, output
recording and finished-goods put-away before the production orders are
closed. The external participants are mostly indirect — demand comes from
Customers, Distributors and Retailers as the market signal, and materials
from Suppliers and Contract Manufacturers; the process is triggered by a
demand signal or a forecast rather than a single external order.
```

**Context diagram prompt.**

```text
Context Diagram: V05 — Plan to Produce (Make).

1. Central system (process-system)
A single central process/system ellipse named "Manufacturing Company"
representing the whole organisation that runs the Plan to Produce process. It
is the system in context: everything inside it — demand and supply planning,
production planning, manufacturing operations, warehouse, quality, maintenance,
engineering, finance, logistics and the supporting IT systems (ERP
manufacturing, MRP, APS, MES, WMS, QMS, maintenance, PLM and reporting/BI) — is
treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Customer
- Distributor
- Retailer
- Supplier
- Contract Manufacturer

3. Layout
"Manufacturing Company" sits in the centre. The demand side — Customer,
Distributor and Retailer — sits to the LEFT, as the market channels whose
demand signals and forecasts trigger the chain. The supply side — Supplier and
Contract Manufacturer — sits to the RIGHT, providing materials and outsourced
production. Every external entity connects directly to the central system with
labelled information flows; entities never connect to one another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Customer / Distributor / Retailer → Manufacturing Company: demand signals,
  orders, forecasts, service-level expectations, product requirements.
- Manufacturing Company → Customer / Distributor / Retailer: production
  availability, delivery promise dates, shortage notices, fulfilment
  commitments.
- Manufacturing Company → Supplier: material requirements, purchase schedules,
  delivery instructions.
- Supplier → Manufacturing Company: material availability, lead times,
  substitutions, delivery confirmations.
- Manufacturing Company → Contract Manufacturer: production orders,
  specifications, schedules.
- Contract Manufacturer → Manufacturing Company: capacity confirmation,
  production confirmations, finished goods.

This Context Diagram frames the Manufacturing Company as a single system in
context: demand from the Customers, Distributors and Retailers drives the Plan
to Produce process, while the Suppliers and Contract Manufacturers provide the
materials and outsourced capacity that let the company produce. The five
external entities are exactly the external actors of the Process Context
diagram below, so the two views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V05 — Plan to Produce (Make).

1. System boundary and processes
A system boundary named "V05 — Plan to Produce" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V05.01 Forecast Demand
- V05.02 Plan Supply
- V05.03 Create Production Plan
- V05.04 Check Capacity and Materials
- V05.05 Schedule Production
- V05.06 Issue Materials
- V05.07 Manufacture Product
- V05.08 Inspect Quality
- V05.09 Manage Exceptions
- V05.10 Record Production Output
- V05.11 Move Finished Goods to Inventory
- V05.12 Close Production Orders

2. Participants (outside the boundary)
External actors (actor):
- Customer
- Distributor
- Retailer
- Supplier
- Contract Manufacturer
Internal teams (team):
- Demand Planning
- Supply Planning
- Production Planning
- Manufacturing Operations
- Procurement
- Warehouse
- Quality Assurance
- Maintenance
- Engineering
- Finance
- Logistics
IT systems (system):
- Reporting / BI Tools
- Material Requirements Planning (MRP) System
- Product Lifecycle Management (PLM) System
- ERP Manufacturing Module
- Advanced Planning & Scheduling (APS) System
- Warehouse Management System (WMS)
- Manufacturing Execution System (MES)
- Quality Management System (QMS)
- Maintenance Management System (CMMS)

3. Layout
The processes sit inside the boundary in V05.01 → V05.12 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V05.01 Forecast Demand — Customer, Distributor, Retailer (demand signals &
  orders); Demand Planning (build forecast), Supply Planning (confirm);
  Reporting / BI Tools (history & analytics).
- V05.02 Plan Supply — Supplier, Contract Manufacturer (availability & lead
  times); Supply Planning (net demand), Procurement (planned orders); Material
  Requirements Planning (MRP) System (netting).
- V05.03 Create Production Plan — Production Planning (draft plan), Engineering
  (specs & routings); Product Lifecycle Management (PLM) System (BOM &
  routings).
- V05.04 Check Capacity and Materials — Supplier (material availability);
  Production Planning (capacity), Warehouse (material check); ERP Manufacturing
  Module (inventory & load).
- V05.05 Schedule Production — Production Planning (sequence), Manufacturing
  Operations (release); Advanced Planning & Scheduling (APS) System (finite
  schedule).
- V05.06 Issue Materials — Warehouse (pick & stage), Manufacturing Operations
  (issue to work centre); Warehouse Management System (WMS) (reservation &
  goods issue).
- V05.07 Manufacture Product — Contract Manufacturer (outsourced support);
  Manufacturing Operations (run), Maintenance (stoppage support); Manufacturing
  Execution System (MES) (shop-floor data).
- V05.08 Inspect Quality — Quality Assurance (inspect & disposition),
  Manufacturing Operations (release); Quality Management System (QMS) (specs &
  results).
- V05.09 Manage Exceptions — Supplier, Contract Manufacturer (supply / support
  response); Manufacturing Operations, Maintenance, Quality Assurance (log,
  resolve, disposition); Maintenance Management System (CMMS) (case management).
- V05.10 Record Production Output — Manufacturing Operations (confirm output),
  Finance (cost postings); Manufacturing Execution System (MES) (run & yield
  data).
- V05.11 Move Finished Goods to Inventory — Warehouse (put away), Logistics
  (availability); Warehouse Management System (WMS) (goods receipt & stock).
- V05.12 Close Production Orders — Production Planning, Finance (verify, settle,
  archive); ERP Manufacturing Module (status & close).

This Process Context diagram frames the whole Plan to Produce value chain: the
twelve subprocesses inside the boundary, the external actors (Customer,
Distributor, Retailer, Supplier, Contract Manufacturer) and internal teams that
perform them, and the IT systems that support them — consistent with the
per-process BPMN prompts below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Manufacturing Organisation" pool (key role in brackets), and IT
systems are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V05.01** Forecast Demand | Customer, Distributor, Retailer | Demand Planning (demand planner), Supply Planning (supply chain manager) | Reporting / BI Tools |
| **V05.02** Plan Supply | Supplier, Contract Manufacturer | Supply Planning (supply chain manager), Procurement (procurement officer) | Material Requirements Planning (MRP) System |
| **V05.03** Create Production Plan | — | Production Planning (production planner), Engineering (engineer) | Product Lifecycle Management (PLM) System |
| **V05.04** Check Capacity and Materials | Supplier | Production Planning (production planner), Warehouse (inventory controller) | ERP Manufacturing Module |
| **V05.05** Schedule Production | — | Production Planning (production planner), Manufacturing Operations (plant manager) | Advanced Planning & Scheduling (APS) System |
| **V05.06** Issue Materials | — | Warehouse (inventory controller), Manufacturing Operations (production supervisor) | Warehouse Management System (WMS) |
| **V05.07** Manufacture Product | Contract Manufacturer | Manufacturing Operations (production supervisor / machine operator), Maintenance (maintenance technician) | Manufacturing Execution System (MES) |
| **V05.08** Inspect Quality | — | Quality Assurance (quality inspector), Manufacturing Operations (production supervisor) | Quality Management System (QMS) |
| **V05.09** Manage Exceptions | Supplier, Contract Manufacturer | Manufacturing Operations (production supervisor), Maintenance (maintenance technician), Quality Assurance (quality inspector) | Maintenance Management System (CMMS) |
| **V05.10** Record Production Output | — | Manufacturing Operations (production supervisor), Finance (finance controller) | Manufacturing Execution System (MES) |
| **V05.11** Move Finished Goods to Inventory | — | Warehouse (inventory controller), Logistics (logistics coordinator) | Warehouse Management System (WMS) |
| **V05.12** Close Production Orders | — | Production Planning (production planner), Finance (finance controller) | ERP Manufacturing Module |

**Actor / Team / System roll-up** (every distinct participant across V05):

- **External actors:** Customer (V05.01); Distributor (V05.01); Retailer (V05.01); Supplier (V05.02, V05.04, V05.09); Contract Manufacturer (V05.02, V05.07, V05.09).
- **Teams:** Demand Planning (V05.01); Supply Planning (V05.01, V05.02); Procurement (V05.02); Production Planning (V05.03, V05.04, V05.05, V05.12); Engineering (V05.03); Warehouse (V05.04, V05.06, V05.11); Manufacturing Operations (V05.05–V05.10); Maintenance (V05.07, V05.09); Quality Assurance (V05.08, V05.09); Finance (V05.10, V05.12); Logistics (V05.11).
- **IT systems:** Reporting / BI Tools (V05.01); Material Requirements Planning (MRP) System (V05.02); Product Lifecycle Management (PLM) System (V05.03); ERP Manufacturing Module (V05.04, V05.12); Advanced Planning & Scheduling (APS) System (V05.05); Warehouse Management System / WMS (V05.06, V05.11); Manufacturing Execution System / MES (V05.07, V05.10); Quality Management System (QMS) (V05.08); Maintenance Management System (CMMS) (V05.09).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Plan to Produce service area. It shows
the **Actors**, **Services**, **Processes**, **Interfaces** and **Applications**
that provide the Manufacturing Service and the related planning and supply
services across the twelve V05 processes. Each Business Process is a drill-down
anchor: link it to the matching V05.nn BPMN diagram and its marker turns green.

```text
ArchiMate: V05 — Plan to Produce — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Manufacturing Service and the
related services (to the market channels that signal demand and via the
suppliers that provide materials) across the twelve V05 Plan to Produce
processes, and the applications that support them. Lay it out in three
horizontal bands, top to bottom — BUSINESS SERVICES → BUSINESS PROCESSES →
APPLICATIONS — with the demand-side Customer / Distributor / Retailer on the far
left and the supply-side Supplier / Contract Manufacturer on the far right. Read
top-to-bottom as service → process → application (ArchiMate service
realisation).

1. Business Actors (Business Actor)
- Customer, Distributor, Retailer — the external market channels the production
  availability is provided to and whose demand signals trigger the chain (far
  left).
- Supplier — the external party that provides materials (far right).
- Contract Manufacturer — the external party that provides outsourced capacity
  (far right).

2. Interfaces
- Business Interface "Demand & Sales Channel" — the channel the Customers,
  Distributors and Retailers use to send demand signals and receive fulfilment
  commitments. The demand actors ACCESS this interface; the interface SERVES the
  business services below.
- Business Interface "Supplier / Manufacturing Portal" — the channel the
  Supplier and Contract Manufacturer use to confirm availability, take
  production orders and confirm production. They ACCESS this interface.
- Application Interfaces (optional, only the few the portals call): "Planning
  API" on the APS System, "Manufacturing API" on the MES.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in production-journey order:
- Demand & Supply Planning Service — forecast demand and plan supply.
- Production Planning & Scheduling Service — create the plan, check capacity and
  materials, and schedule production.
- Manufacturing Execution Service — issue materials and manufacture the product.
- Quality Assurance Service — inspect and release the product.
- Exception & Output Service — resolve exceptions and record production output.
- Fulfilment & Closure Service — move finished goods to inventory and close the
  production orders.

4. Business Processes (Business Process) — the twelve V05 processes, middle band
   in V05.01 → V05.12 order. Each REALISES the business service shown and is the
   link anchor to its BPMN diagram:
- V05.01 Forecast Demand                   -> realises Demand & Supply Planning Service
- V05.02 Plan Supply                       -> realises Demand & Supply Planning Service
- V05.03 Create Production Plan            -> realises Production Planning & Scheduling Service
- V05.04 Check Capacity and Materials      -> realises Production Planning & Scheduling Service
- V05.05 Schedule Production               -> realises Production Planning & Scheduling Service
- V05.06 Issue Materials                   -> realises Manufacturing Execution Service
- V05.07 Manufacture Product               -> realises Manufacturing Execution Service
- V05.08 Inspect Quality                   -> realises Quality Assurance Service
- V05.09 Manage Exceptions                 -> realises Exception & Output Service
- V05.10 Record Production Output          -> realises Exception & Output Service
- V05.11 Move Finished Goods to Inventory  -> realises Fulfilment & Closure Service
- V05.12 Close Production Orders           -> realises Fulfilment & Closure Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Reporting / BI Tools
- Material Requirements Planning (MRP) System
- Product Lifecycle Management (PLM) System
- ERP Manufacturing Module
- Advanced Planning & Scheduling (APS) System
- Warehouse Management System (WMS)
- Manufacturing Execution System (MES)
- Quality Management System (QMS)
- Maintenance Management System (CMMS)

6. Relationships
- Customer, Distributor, Retailer -accesses-> Demand & Sales Channel.
- Supplier, Contract Manufacturer -accesses-> Supplier / Manufacturing Portal.
- Demand & Sales Channel -serving-> the Demand & Supply Planning and Fulfilment
  services; Supplier / Manufacturing Portal -serving-> the Planning,
  Manufacturing Execution and Exception services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V05.01 <- Reporting / BI Tools;        V05.02 <- MRP System;
    V05.03 <- PLM System;                  V05.04 <- ERP Manufacturing Module;
    V05.05 <- APS System;                  V05.06 <- Warehouse Management System (WMS);
    V05.07 <- Manufacturing Execution System (MES); V05.08 <- Quality Management System (QMS);
    V05.09 <- Maintenance Management System (CMMS); V05.10 <- Manufacturing Execution System (MES);
    V05.11 <- Warehouse Management System (WMS); V05.12 <- ERP Manufacturing Module.
- Supplier -serving-> V05.02 Plan Supply, V05.04 Check Capacity and Materials and
  V05.09 Manage Exceptions.
- Contract Manufacturer -serving-> V05.02 Plan Supply, V05.07 Manufacture Product
  and V05.09 Manage Exceptions.

7. Intent
The Manufacturing Execution Service sits top-centre as the headline service. The
twelve Business Processes form the backbone in V05.01 -> V05.12 order so the
reader can trace the production journey and drill from any process straight into
its detailed BPMN model. This one ArchiMate view therefore links to all twelve
V05 BPMN process diagrams. The mapping of process -> actors/teams/applications is
the Process <-> Actors / Teams / IT Systems matrix above.
```

### V05.01 — Forecast Demand

**BPMN diagram prompt.**

```text
BPMN: V05.01 Forecast Demand — first stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Customer" — the external market channel providing demand.
- Pool "Distributor" — the external channel providing demand.
- Pool "Retailer" — the external channel providing demand.
- Pool "Manufacturing Organisation" — the organisation running the process, with
  two lanes top-to-bottom: "Demand Planning", "Supply Planning".
- Pool "Reporting / BI Tools" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Distributor: black-box, single instance.
- Retailer: black-box, single instance.
- Manufacturing Organisation: white-box (holds the process flow).
- Reporting / BI Tools: black-box, System = true, single instance.

3. Layout
- Customer, Distributor and Retailer pools at the top, Manufacturing
  Organisation pool in the middle, Reporting / BI Tools pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Demand Planning lane:
- Conditional start event "Planning cycle started" (demand signals received or
  forecast cycle due)
- Service task "Gather demand signals (orders, POS, history)"
- Expanded Subprocess (LOOP marker) "Reconcile demand forecast":
    internals — User task "Build statistical forecast", then exclusive gateway
    "Forecast within tolerance / consensus?": branch "Yes" → subprocess end event
    "Forecast agreed". The loop marker repeats the attempt while the forecast is
    not agreed.
- Service task "Publish demand forecast"
Supply Planning lane:
- Service task "Confirm forecast for supply planning"
- End event "Demand forecast published — ready for Plan Supply (V05.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Reconcile demand forecast" Expanded
  Subprocess: "Forecast not agreed in 3 business days" → User task "Escalate to
  Demand Planning Manager" → escalation end event "Escalated — forecast not
  agreed in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- Customer → "Gather demand signals (orders, POS, history)" (orders, demand
  signal)
- Distributor → "Gather demand signals (orders, POS, history)" (channel demand)
- Retailer → "Gather demand signals (orders, POS, history)" (point-of-sale demand)
- "Publish demand forecast" → Reporting / BI Tools
- Reporting / BI Tools → "Build statistical forecast" (sales history & analytics)

This is the entry point of Plan to Produce: demand signals from the market
channels are gathered and reconciled into an agreed statistical forecast
(retried until consensus is reached) and published — leaving a demand forecast
ready to drive supply planning.
```

### V05.02 — Plan Supply

**BPMN diagram prompt.**

```text
BPMN: V05.02 Plan Supply — second stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party providing materials.
- Pool "Contract Manufacturer" — the external party providing outsourced capacity.
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Supply Planning", "Procurement".
- Pool "Material Requirements Planning (MRP) System" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Contract Manufacturer: black-box, single instance.
- Manufacturing Organisation: white-box (holds the process flow).
- Material Requirements Planning (MRP) System: black-box, System = true, single
  instance.

3. Layout
- Supplier and Contract Manufacturer pools at the top, Manufacturing
  Organisation pool in the middle, Material Requirements Planning (MRP) System
  pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Supply Planning lane:
- Message start event "Demand forecast received"
- Service task "Net demand against inventory and open supply"
- Exclusive gateway "Supply covers demand?"
    - branch "No – supply gap": Expanded Subprocess (LOOP marker) "Resolve supply
      gap": internals — User task "Evaluate sourcing options", then Send task
      "Request availability from supplier / contract manufacturer", then
      intermediate message catch event "Supplier / contract manufacturer responds
      (availability, lead time)", then exclusive gateway "Gap closed?": branch
      "Yes" → subprocess end event "Supply gap closed". The loop marker repeats
      the request exchange while the gap is open.
    - branch "Yes": continue to Procurement
Procurement lane:
- Service task "Confirm supply plan and planned orders"
- End event "Supply plan agreed — ready for Create Production Plan (V05.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve supply gap" Expanded
  Subprocess: "Gap not closed in 5 business days" → User task "Escalate to Supply
  Chain Manager" → escalation end event "Escalated — supply gap not closed in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Net demand against inventory and open supply" → Material Requirements Planning
  (MRP) System
- Material Requirements Planning (MRP) System → "Confirm supply plan and planned
  orders" (net requirements, planned orders)
- "Request availability from supplier / contract manufacturer" → Supplier
- "Request availability from supplier / contract manufacturer" → Contract
  Manufacturer
- Supplier → intermediate event "Supplier / contract manufacturer responds
  (availability, lead time)"
- Contract Manufacturer → intermediate event "Supplier / contract manufacturer
  responds (availability, lead time)"

This stage nets the demand forecast against inventory and open supply and, where
a gap exists, closes it with the supplier or contract manufacturer (retried
until covered) — leaving an agreed supply plan ready to become a production plan.
```

### V05.03 — Create Production Plan

**BPMN diagram prompt.**

```text
BPMN: V05.03 Create Production Plan — third stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Production Planning", "Engineering".
- Pool "Product Lifecycle Management (PLM) System" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- Product Lifecycle Management (PLM) System: black-box, System = true, single
  instance.

3. Layout
- Manufacturing Organisation pool at the top, Product Lifecycle Management (PLM)
  System pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Production Planning lane:
- Message start event "Supply plan received"
- Service task "Explode BOM and routings"
- Expanded Subprocess (LOOP marker) "Correct production plan":
    internals — User task "Draft production plan (quantities, sequence)", then
    exclusive gateway "Plan feasible and complete?": branch "No" → User task
    "Adjust plan" → subprocess end event "Adjustment recorded" (the loop marker
    then re-drafts); branch "Yes" → subprocess end event "Plan correct". The loop
    marker repeats while the plan is not feasible.
Engineering lane:
- Service task "Validate engineering specs and routings"
- End event "Production plan created — ready for Check Capacity and Materials
  (V05.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Correct production plan" Expanded
  Subprocess: "Not corrected in 2 business days" → User task "Escalate to Planning
  Lead" → escalation end event "Escalated — production plan not corrected in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Explode BOM and routings" → Product Lifecycle Management (PLM) System
- Product Lifecycle Management (PLM) System → "Validate engineering specs and
  routings" (bill of materials, routings, specifications)

This stage explodes the bill of materials and routings and drafts a feasible
production plan (corrected until it passes review), validated against the
engineering specifications — leaving a production plan ready for capacity and
material checks.
```

### V05.04 — Check Capacity and Materials

**BPMN diagram prompt.**

```text
BPMN: V05.04 Check Capacity and Materials — fourth stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party confirming material availability.
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Production Planning", "Warehouse".
- Pool "ERP Manufacturing Module" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Manufacturing Organisation: white-box (holds the process flow).
- ERP Manufacturing Module: black-box, System = true, single instance.

3. Layout
- Supplier pool at the top, Manufacturing Organisation pool in the middle,
  ERP Manufacturing Module pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Production Planning lane:
- Message start event "Production plan to validate received"
- Service task "Check work-centre capacity"
Warehouse lane:
- Service task "Check material availability against BOM"
- Exclusive gateway "Capacity and materials sufficient?"
    - branch "No – shortage": Expanded Subprocess (LOOP marker) "Resolve material
      shortage": internals — User task "Assess shortfall", then Send task "Chase
      material availability from supplier", then intermediate message catch event
      "Supplier responds (availability / substitution)", then exclusive gateway
      "Shortfall covered?": branch "Yes" → subprocess end event "Shortfall
      covered". The loop marker repeats while the shortfall is open.
    - branch "No – not sourceable in time": End event "Materials to be procured —
      routed to Procure to Pay (V02.01)"
    - branch "Yes": continue to Production Planning
Production Planning lane:
- Service task "Confirm capacity and materials committed"
- End event "Capacity and materials confirmed — ready for Schedule Production
  (V05.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve material shortage" Expanded
  Subprocess: "Not resolved in 4 business days" → User task "Escalate to
  Procurement Lead" → escalation end event "Escalated — material shortage not
  resolved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check material availability against BOM" → ERP Manufacturing Module
- ERP Manufacturing Module → "Capacity and materials sufficient?" (inventory
  levels, work-centre load)
- "Chase material availability from supplier" → Supplier
- Supplier → intermediate event "Supplier responds (availability / substitution)"

This stage checks work-centre capacity and material availability against the bill
of materials, resolving any shortfall with the supplier (retried until covered)
and routing unsourceable materials to Procure to Pay — leaving capacity and
materials committed ready for scheduling.
```

### V05.05 — Schedule Production

**BPMN diagram prompt.**

```text
BPMN: V05.05 Schedule Production — fifth stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Production Planning", "Manufacturing Operations".
- Pool "Advanced Planning & Scheduling (APS) System" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- Advanced Planning & Scheduling (APS) System: black-box, System = true, single
  instance.

3. Layout
- Manufacturing Organisation pool at the top, Advanced Planning & Scheduling
  (APS) System pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Production Planning lane:
- Message start event "Confirmed plan received"
- Service task "Sequence orders on work centres"
- Exclusive gateway "Schedule conflict?"
    - branch "Yes – conflict": Expanded Subprocess (LOOP marker) "Resolve
      scheduling conflict": internals — User task "Re-sequence / re-allocate
      resources", then exclusive gateway "Conflict cleared?": branch "Yes" →
      subprocess end event "Conflict cleared". The loop marker repeats while the
      conflict remains.
    - branch "No": continue to Manufacturing Operations
Manufacturing Operations lane:
- Service task "Release work orders to shop floor"
- End event "Production scheduled — ready for Issue Materials (V05.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve scheduling conflict" Expanded
  Subprocess: "Not cleared in 2 business days" → User task "Escalate to Plant
  Manager" → escalation end event "Escalated — schedule conflict not cleared in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Sequence orders on work centres" → Advanced Planning & Scheduling (APS) System
- Advanced Planning & Scheduling (APS) System → "Schedule conflict?" (finite
  capacity schedule, resource load)
- "Release work orders to shop floor" → Advanced Planning & Scheduling (APS)
  System

This stage sequences the confirmed orders on the work centres and resolves any
capacity conflict (retried until cleared), then releases the work orders to the
shop floor — leaving production scheduled ready for material issue.
```

### V05.06 — Issue Materials

**BPMN diagram prompt.**

```text
BPMN: V05.06 Issue Materials — sixth stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Warehouse", "Manufacturing Operations".
- Pool "Warehouse Management System (WMS)" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- Warehouse Management System (WMS): black-box, System = true, single instance.

3. Layout
- Manufacturing Organisation pool at the top, Warehouse Management System (WMS)
  pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Warehouse lane:
- Message start event "Work order released"
- Service task "Generate picking list / material reservation"
- User task "Pick and stage materials"
- Exclusive gateway "All materials picked in full?"
    - branch "No – short pick": Expanded Subprocess (LOOP marker) "Resolve picking
      shortfall": internals — User task "Investigate short pick", then exclusive
      gateway "Shortfall cleared?": branch "Yes" → subprocess end event "Shortfall
      cleared". The loop marker repeats while the pick is short.
    - branch "Yes": continue to Manufacturing Operations
Manufacturing Operations lane:
- Service task "Issue materials to work centre"
- End event "Materials issued — ready for Manufacture Product (V05.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve picking shortfall" Expanded
  Subprocess: "Not cleared in 1 business day" → User task "Escalate to Warehouse
  Supervisor" → escalation end event "Escalated — picking shortfall not cleared
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Generate picking list / material reservation" → Warehouse Management System
  (WMS)
- Warehouse Management System (WMS) → "Pick and stage materials" (bin locations,
  stock on hand)
- "Issue materials to work centre" → Warehouse Management System (WMS) (goods
  issue posting)

This stage reserves and picks the materials for the released work order,
resolving any short pick (retried until cleared), and issues the materials to the
work centre — leaving materials issued ready for manufacture.
```

### V05.07 — Manufacture Product

**BPMN diagram prompt.**

```text
BPMN: V05.07 Manufacture Product — seventh stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Contract Manufacturer" — the external party providing outsourced support.
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Manufacturing Operations", "Maintenance".
- Pool "Manufacturing Execution System (MES)" — the supporting IT system.

2. Pool properties
- Contract Manufacturer: black-box, single instance.
- Manufacturing Organisation: white-box (holds the process flow).
- Manufacturing Execution System (MES): black-box, System = true, single instance.

3. Layout
- Contract Manufacturer pool at the top, Manufacturing Organisation pool in the
  middle, Manufacturing Execution System (MES) pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Manufacturing Operations lane:
- Message start event "Materials issued to work centre"
- Service task "Execute production operations"
- User task "Monitor run and record parameters"
- Exclusive gateway "Run within parameters?"
    - branch "No – stoppage / deviation": continue to Maintenance
    - branch "Yes": continue to "Complete production run"
Maintenance lane:
- Expanded Subprocess (LOOP marker) "Resolve production stoppage":
    internals — User task "Diagnose stoppage", then Send task "Request
    contract-manufacturer / spare-parts support", then intermediate message catch
    event "Support responds (fix / rework instruction)", then exclusive gateway
    "Run restored?": branch "Yes" → subprocess end event "Run restored". The loop
    marker repeats while the stoppage persists. On restoration, continue to
    Manufacturing Operations.
Manufacturing Operations lane:
- Service task "Complete production run"
- End event "Product manufactured — ready for Inspect Quality (V05.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve production stoppage" Expanded
  Subprocess: "Not restored in 4 hours" → User task "Escalate to Plant Manager" →
  escalation end event "Escalated — production stoppage not restored in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Execute production operations" → Manufacturing Execution System (MES)
- Manufacturing Execution System (MES) → "Monitor run and record parameters"
  (machine data, process values)
- "Request contract-manufacturer / spare-parts support" → Contract Manufacturer
- Contract Manufacturer → intermediate event "Support responds (fix / rework
  instruction)"
- "Complete production run" → Manufacturing Execution System (MES)

This stage executes and monitors the production run, resolving any stoppage or
deviation with maintenance and outsourced support (retried until the run is
restored), then completes the run — leaving a manufactured product ready for
quality inspection.
```

### V05.08 — Inspect Quality

**BPMN diagram prompt.**

```text
BPMN: V05.08 Inspect Quality — eighth stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Quality Assurance", "Manufacturing Operations".
- Pool "Quality Management System (QMS)" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- Quality Management System (QMS): black-box, System = true, single instance.

3. Layout
- Manufacturing Organisation pool at the top, Quality Management System (QMS)
  pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Quality Assurance lane:
- Message start event "Manufactured batch received"
- Service task "Perform quality inspection / tests"
- Exclusive gateway "Batch conforms to specification?"
    - branch "No – non-conformance": Expanded Subprocess (LOOP marker) "Resolve
      quality non-conformance": internals — User task "Raise non-conformance and
      disposition", then User task "Rework / re-test batch", then exclusive
      gateway "Now conforming?": branch "Yes" → subprocess end event
      "Non-conformance cleared". The loop marker repeats while the batch is
      non-conforming.
    - branch "No – reject": End event "Batch scrapped — routed to Manage
      Exceptions (V05.09)"
    - branch "Yes": continue to Manufacturing Operations
Manufacturing Operations lane:
- Service task "Confirm batch release"
- End event "Quality confirmed — ready for Manage Exceptions (V05.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve quality non-conformance"
  Expanded Subprocess: "Not cleared in 3 business days" → User task "Escalate to
  Quality Manager" → escalation end event "Escalated — non-conformance not cleared
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Perform quality inspection / tests" → Quality Management System (QMS)
- Quality Management System (QMS) → "Batch conforms to specification?"
  (specification limits, test results)
- "Confirm batch release" → Quality Management System (QMS)

This stage inspects and tests the manufactured batch against specification,
reworking and re-testing any non-conformance (retried until cleared), scrapping
where it cannot be saved, and releasing conforming batches — leaving a quality
outcome ready for exception handling.
```

### V05.09 — Manage Exceptions

**BPMN diagram prompt.**

```text
BPMN: V05.09 Manage Exceptions — ninth stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party in a material or supply exception.
- Pool "Contract Manufacturer" — the external party in an outsourced-capacity
  exception.
- Pool "Manufacturing Organisation" — the organisation, with three lanes
  top-to-bottom: "Manufacturing Operations", "Maintenance", "Quality Assurance".
- Pool "Maintenance Management System (CMMS)" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Contract Manufacturer: black-box, single instance.
- Manufacturing Organisation: white-box (holds the process flow).
- Maintenance Management System (CMMS): black-box, System = true, single instance.

3. Layout
- Supplier and Contract Manufacturer pools at the top, Manufacturing Organisation
  pool in the middle, Maintenance Management System (CMMS) pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Manufacturing Operations lane:
- Message start event "Production exception raised" (material shortage, equipment
  breakdown, quality reject, or schedule slip)
- Service task "Log exception case"
- Exclusive gateway "Exception type?"
    - branch "No open exceptions": End event "No exceptions — ready for Record
      Production Output (V05.10)"
    - branch "Equipment / supply exception": continue to Maintenance
    - branch "Quality / material non-conformance": continue to Quality Assurance
Maintenance lane:
- Expanded Subprocess (LOOP marker) "Resolve equipment / supply exception":
    internals — User task "Diagnose issue", then Send task "Contact supplier /
    contract manufacturer", then intermediate message catch event "Supplier /
    contract manufacturer responds", then exclusive gateway "Resolved?": branch
    "Yes" → subprocess end event "Exception resolved". The loop marker repeats
    while the exception is open. On resolution, continue to Quality Assurance.
Quality Assurance lane:
- User task "Disposition affected material / batch"
- Service task "Update case and production records"
- Send task "Communicate resolution to supplier"
- End event "Exception resolved — ready for Record Production Output (V05.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve equipment / supply exception"
  Expanded Subprocess: "SLA breach (case open past target)" → User task "Escalate
  to Plant Manager" → escalation end event "Escalated — exception not resolved in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Supplier → start event "Production exception raised" (material shortage / supply
  issue, where supplier-initiated)
- "Log exception case" → Maintenance Management System (CMMS)
- Maintenance Management System (CMMS) → "Diagnose issue" (asset history, case
  data)
- "Contact supplier / contract manufacturer" → Supplier
- "Contact supplier / contract manufacturer" → Contract Manufacturer
- Supplier → intermediate event "Supplier / contract manufacturer responds"
- Contract Manufacturer → intermediate event "Supplier / contract manufacturer
  responds"
- "Communicate resolution to supplier" → Supplier

This stage logs and resolves production exceptions — shortages, breakdowns,
quality rejects and slips — with the supplier and contract manufacturer,
dispositioning the affected material and clearing the case (retried until
resolved), leaving the run clean for output recording.
```

### V05.10 — Record Production Output

**BPMN diagram prompt.**

```text
BPMN: V05.10 Record Production Output — tenth stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Manufacturing Operations", "Finance".
- Pool "Manufacturing Execution System (MES)" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- Manufacturing Execution System (MES): black-box, System = true, single instance.

3. Layout
- Manufacturing Organisation pool at the top, Manufacturing Execution System
  (MES) pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Manufacturing Operations lane:
- Message start event "Production run completed"
- Service task "Confirm output quantity and consumption"
- Expanded Subprocess (LOOP marker) "Correct production confirmation":
    internals — User task "Reconcile output vs consumption", then exclusive
    gateway "Postings balanced?": branch "No" → User task "Adjust confirmation" →
    subprocess end event "Adjustment recorded" (the loop marker then re-reconciles);
    branch "Yes" → subprocess end event "Confirmation correct". The loop marker
    repeats while the postings are unbalanced.
Finance lane:
- Service task "Post production costs and variances"
- End event "Production output recorded — ready for Move Finished Goods to
  Inventory (V05.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Correct production confirmation"
  Expanded Subprocess: "Not corrected in 1 business day" → User task "Escalate to
  Production Lead" → escalation end event "Escalated — production confirmation not
  corrected in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Confirm output quantity and consumption" → Manufacturing Execution System (MES)
- Manufacturing Execution System (MES) → "Reconcile output vs consumption" (run
  data, yields, scrap)
- "Post production costs and variances" → Manufacturing Execution System (MES)

This stage confirms the output quantity and material consumption, correcting the
confirmation until the postings balance, and posts the production costs and
variances — leaving the production output recorded ready for finished-goods
put-away.
```

### V05.11 — Move Finished Goods to Inventory

**BPMN diagram prompt.**

```text
BPMN: V05.11 Move Finished Goods to Inventory — eleventh stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Warehouse", "Logistics".
- Pool "Warehouse Management System (WMS)" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- Warehouse Management System (WMS): black-box, System = true, single instance.

3. Layout
- Manufacturing Organisation pool at the top, Warehouse Management System (WMS)
  pool at the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Warehouse lane:
- Message start event "Finished goods ready for putaway"
- Service task "Generate goods receipt for finished goods"
- User task "Put away to storage location"
- Exclusive gateway "Putaway matches production output?"
    - branch "No – discrepancy": Expanded Subprocess (LOOP marker) "Resolve
      putaway discrepancy": internals — User task "Investigate stock discrepancy",
      then exclusive gateway "Discrepancy cleared?": branch "Yes" → subprocess end
      event "Discrepancy cleared". The loop marker repeats while the discrepancy
      is open.
    - branch "Yes": continue to Logistics
Logistics lane:
- Service task "Update finished-goods inventory and availability"
- End event "Finished goods in inventory — ready for Close Production Orders
  (V05.12)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve putaway discrepancy" Expanded
  Subprocess: "Not cleared in 1 business day" → User task "Escalate to Warehouse
  Supervisor" → escalation end event "Escalated — putaway discrepancy not cleared
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Generate goods receipt for finished goods" → Warehouse Management System (WMS)
- Warehouse Management System (WMS) → "Put away to storage location" (storage
  bins, capacity)
- "Update finished-goods inventory and availability" → Warehouse Management System
  (WMS)

This stage receipts the finished goods and puts them away, resolving any stock
discrepancy (retried until cleared), and updates finished-goods inventory and
availability — leaving finished goods in inventory ready for order closure.
```

### V05.12 — Close Production Orders

**BPMN diagram prompt.**

```text
BPMN: V05.12 Close Production Orders — final stage of the Plan to Produce (Make) value chain.

1. Pools & Lanes
- Pool "Manufacturing Organisation" — the organisation, with two lanes
  top-to-bottom: "Production Planning", "Finance".
- Pool "ERP Manufacturing Module" — the supporting IT system.

2. Pool properties
- Manufacturing Organisation: white-box (holds the process flow).
- ERP Manufacturing Module: black-box, System = true, single instance.

3. Layout
- Manufacturing Organisation pool at the top, ERP Manufacturing Module pool at
  the bottom.

4. Lane contents in flow order (Manufacturing Organisation)
Production Planning lane:
- Message start event "Order ready to close"
- Service task "Verify output confirmed, quality released and stock posted"
- Exclusive gateway "All complete & no open items?"
    - branch "No – open item": User task "Return to responsible stage", then
      End event "Re-opened — routed back to the open stage"
    - branch "Yes": continue to Finance
Finance lane:
- Service task "Settle order costs and variances"
- Service task "Close production order and archive records"
- End event "Production order closed — Plan to Produce complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- ERP Manufacturing Module → "Verify output confirmed, quality released and stock
  posted" (output, quality and stock status)
- "Settle order costs and variances" → ERP Manufacturing Module
- "Close production order and archive records" → ERP Manufacturing Module

This stage confirms every prior step is complete with no open items, settles the
order costs and variances, archives the records and closes the production order —
completing the end-to-end Plan to Produce cycle.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V06 - Idea to Market (I2M)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V06.01. Identify Opportunity
V06.02. Capture Ideas
V06.03. Assess Feasibility
V06.04. Define Business Case
V06.05. Design Solution
V06.06. Develop Prototype
V06.07. Test with Users
V06.08. Validate Commercial Model
V06.09. Prepare Launch
V06.10. Release to Market
V06.11. Monitor Adoption
V06.12. Refine Product / Service

This is the innovation and commercialisation end-to-end process: a market
opportunity, customer need or internal idea flows through feasibility, a
business case, design, prototyping, user testing and commercial validation,
into launch, release, adoption monitoring and refinement. The main external
participant is the Customer; the process may be triggered by a market
opportunity, a customer need or an internal idea, and the external
interaction begins when concept descriptions, trial invitations and launch
communications reach the market.
```

**Context diagram prompt.**

```text
Context Diagram: V06 — Idea to Market (I2M).

1. Central system (process-system)
A single central process/system ellipse named "Product Development Company"
representing the whole organisation that runs the Idea to Market process. It
is the system in context: everything inside it — strategy, innovation,
product management, research and development, engineering, marketing, sales,
finance, legal and compliance, operations and the supporting IT systems (idea
management, product lifecycle, project portfolio, CRM, market research,
design/prototyping, requirements, collaboration, document management,
analytics/BI and marketing automation) — is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Customer
- Research / Design Partner
- Regulator
- Beta User
- Investor

3. Layout
"Product Development Company" sits in the centre. The Customer sits to the
LEFT (the market that supplies needs and buying signals, and later receives
the product) and the Research / Design Partner sits to the LEFT (the source
of concepts and research findings). The Regulator, Beta User and Investor sit
to the RIGHT (clearance, trialling and funding). Every external entity
connects directly to the central system with labelled information flows;
entities never connect to one another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Product Development Company → Customer: concept descriptions, product
  information, launch communications, post-launch updates.
- Customer → Product Development Company: needs, feedback, complaints, survey
  responses, buying signals, usage data.
- Product Development Company → Research / Design Partner: design briefs,
  concept descriptions, collaboration requests.
- Research / Design Partner → Product Development Company: concepts,
  prototypes, technical details, research findings.
- Product Development Company → Regulator: product safety / compliance
  submissions, launch notifications.
- Regulator → Product Development Company: regulatory requirements, approvals
  and clearances.
- Product Development Company → Beta User: trial invitations, product
  information.
- Beta User → Product Development Company: test results, usage data, feedback.
- Product Development Company → Investor: business case, funding requests,
  performance updates.
- Investor → Product Development Company: funding decisions, investment terms.

This Context Diagram frames the Product Development Company as a single system
in context: a market opportunity, customer need or internal idea drives the
Idea to Market process, the Research / Design Partner contributes concepts and
findings, the Beta User trials the product, the Regulator clears it and the
Investor funds it, while concepts, trials and launch communications flow back
to the market. The five external entities are exactly the external actors of
the Process Context diagram below, so the two views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V06 — Idea to Market (I2M).

1. System boundary and processes
A system boundary named "V06 — Idea to Market" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V06.01 Identify Opportunity
- V06.02 Capture Ideas
- V06.03 Assess Feasibility
- V06.04 Define Business Case
- V06.05 Design Solution
- V06.06 Develop Prototype
- V06.07 Test with Users
- V06.08 Validate Commercial Model
- V06.09 Prepare Launch
- V06.10 Release to Market
- V06.11 Monitor Adoption
- V06.12 Refine Product / Service

2. Participants (outside the boundary)
External actors (actor):
- Customer
- Research / Design Partner
- Regulator
- Beta User
- Investor
Internal teams (team):
- Strategy
- Innovation
- Product Management
- Research and Development
- Engineering
- Customer Experience
- Finance
- Sales
- Marketing
- Legal / Compliance
- Operations
IT systems (system):
- Market Research Tools
- Idea Management Platform
- Collaboration Tools
- Project Portfolio Management System
- Design / Prototyping Tools
- Product Lifecycle Management System
- Requirements Management Tools
- CRM
- Document Management
- Marketing Automation
- Analytics / BI

3. Layout
The processes sit inside the boundary in V06.01 → V06.12 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V06.01 Identify Opportunity — Customer (needs & buying signals); Strategy
  (scan & qualify), Product Management (record); Market Research Tools (market
  data).
- V06.02 Capture Ideas — Customer, Research / Design Partner (submit concepts);
  Innovation (collect), Product Management (refine & shortlist); Idea
  Management Platform (log).
- V06.03 Assess Feasibility — Research / Design Partner (findings &
  constraints); Research and Development (assess), Product Management (record);
  Collaboration Tools (shared analysis).
- V06.04 Define Business Case — Investor (funding decision); Product Management
  (draft), Finance (model & approve); Project Portfolio Management System
  (portfolio & budget).
- V06.05 Design Solution — Research / Design Partner (design input); Research
  and Development (design), Engineering (review); Design / Prototyping Tools
  (design assets).
- V06.06 Develop Prototype — Research / Design Partner (components); Engineering
  (build & fix), Research and Development (record); Product Lifecycle
  Management System (build records).
- V06.07 Test with Users — Beta User (trial & results); Customer Experience
  (recruit & test), Product Management (assess); Requirements Management Tools
  (test outcomes).
- V06.08 Validate Commercial Model — Customer, Investor (market response);
  Finance (price & model), Sales (validate); CRM (customer & pipeline).
- V06.09 Prepare Launch — Regulator (approvals); Marketing (plan & assets),
  Legal / Compliance (approvals); Document Management (readiness records).
- V06.10 Release to Market — Customer (launch communications); Marketing
  (activate), Sales (enable channels); Marketing Automation (go-live).
- V06.11 Monitor Adoption — Customer (feedback & usage); Customer Experience
  (track), Product Management (report); Analytics / BI (adoption metrics).
- V06.12 Refine Product / Service — Product Management (prioritise), Operations
  (update & close); Product Lifecycle Management System, Analytics / BI
  (status & performance).

This Process Context diagram frames the whole Idea to Market value chain: the
twelve subprocesses inside the boundary, the external actors (Customer,
Research / Design Partner, Regulator, Beta User, Investor) and internal teams
that perform them, and the IT systems that support them — consistent with the
per-process BPMN prompts below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Product Organisation" pool (key role in brackets), and IT
systems are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V06.01** Identify Opportunity | Customer | Strategy (market researcher), Product Management (product manager) | Market Research Tools |
| **V06.02** Capture Ideas | Customer, Research / Design Partner | Innovation (innovation lead), Product Management (product owner) | Idea Management Platform |
| **V06.03** Assess Feasibility | Research / Design Partner | Research and Development (engineer), Product Management (business analyst) | Collaboration Tools |
| **V06.04** Define Business Case | Investor | Product Management (product manager), Finance (pricing analyst) | Project Portfolio Management System |
| **V06.05** Design Solution | Research / Design Partner | Research and Development (designer), Engineering (engineer) | Design / Prototyping Tools |
| **V06.06** Develop Prototype | Research / Design Partner | Engineering (engineer), Research and Development (designer) | Product Lifecycle Management System |
| **V06.07** Test with Users | Beta User | Customer Experience (business analyst), Product Management (product owner) | Requirements Management Tools |
| **V06.08** Validate Commercial Model | Customer, Investor | Finance (pricing analyst), Sales (product manager) | CRM |
| **V06.09** Prepare Launch | Regulator | Marketing (launch manager), Legal / Compliance (compliance adviser) | Document Management |
| **V06.10** Release to Market | Customer | Marketing (launch manager), Sales (product manager) | Marketing Automation |
| **V06.11** Monitor Adoption | Customer | Customer Experience (market researcher), Product Management (product manager) | Analytics / BI |
| **V06.12** Refine Product / Service | — | Product Management (product owner), Operations (product manager) | Product Lifecycle Management System, Analytics / BI |

**Actor / Team / System roll-up** (every distinct participant across V06):

- **External actors:** Customer (V06.01, V06.02, V06.08, V06.10, V06.11); Research / Design Partner (V06.02, V06.03, V06.05, V06.06); Investor (V06.04, V06.08); Beta User (V06.07); Regulator (V06.09).
- **Teams:** Strategy (V06.01); Product Management (V06.01–V06.04, V06.07, V06.11, V06.12); Innovation (V06.02); Research and Development (V06.03, V06.05, V06.06); Finance (V06.04, V06.08); Engineering (V06.05, V06.06); Customer Experience (V06.07, V06.11); Sales (V06.08, V06.10); Marketing (V06.09, V06.10); Legal / Compliance (V06.09); Operations (V06.12).
- **IT systems:** Market Research Tools (V06.01); Idea Management Platform (V06.02); Collaboration Tools (V06.03); Project Portfolio Management System (V06.04); Design / Prototyping Tools (V06.05); Product Lifecycle Management System (V06.06, V06.12); Requirements Management Tools (V06.07); CRM (V06.08); Document Management (V06.09); Marketing Automation (V06.10); Analytics / BI (V06.11, V06.12).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Idea to Market service area. It shows
the **Actors**, **Services**, **Processes**, **Interfaces** and **Applications**
that provide the Launch & Release Service and the related innovation and
commercialisation services across the twelve V06 processes. Each Business
Process is a drill-down anchor: link it to the matching V06.nn BPMN diagram and
its marker turns green.

```text
ArchiMate: V06 — Idea to Market — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Launch & Release Service and
the related services (to the Customer and market, and across the innovation
lifecycle) over the twelve V06 Idea to Market processes, and the applications
that support them. Lay it out in three horizontal bands, top to bottom —
BUSINESS SERVICES → BUSINESS PROCESSES → APPLICATIONS — with the Customer on
the far left and the delivery / funding actors on the far right. Read
top-to-bottom as service → process → application (ArchiMate service
realisation).

1. Business Actors (Business Actor)
- Customer — the market party the product is provided to and the source of the
  need (far left, the originator of opportunity and the recipient of launch).
- Research / Design Partner — the external party that contributes concepts,
  design input and prototypes (far right).
- Beta User, Regulator, Investor — external actors that trial, clear and fund
  the product (far right).

2. Interfaces
- Business Interface "Customer / Market Channel" — the channel the Customer
  uses to share needs and feedback and to receive concepts, trials and launch
  communications. The Customer ACCESSES this interface; the interface SERVES
  the business services below.
- Application Interfaces (optional, only the few the channel calls): "Insights
  API" on Analytics / BI, "Campaign API" on Marketing Automation.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in idea-to-market journey order:
- Opportunity & Ideation Service — identify opportunities and capture ideas.
- Feasibility & Business Case Service — assess feasibility and justify
  investment.
- Design & Prototyping Service — design the solution and build prototypes.
- Validation & Testing Service — test with users and validate the commercial
  model.
- Launch & Release Service — prepare launch and release to market.
- Adoption & Refinement Service — monitor adoption and refine the product /
  service.

4. Business Processes (Business Process) — the twelve V06 processes, middle band
   in V06.01 → V06.12 order. Each REALISES the business service shown and is the
   link anchor to its BPMN diagram:
- V06.01 Identify Opportunity       -> realises Opportunity & Ideation Service
- V06.02 Capture Ideas              -> realises Opportunity & Ideation Service
- V06.03 Assess Feasibility         -> realises Feasibility & Business Case Service
- V06.04 Define Business Case       -> realises Feasibility & Business Case Service
- V06.05 Design Solution            -> realises Design & Prototyping Service
- V06.06 Develop Prototype          -> realises Design & Prototyping Service
- V06.07 Test with Users            -> realises Validation & Testing Service
- V06.08 Validate Commercial Model  -> realises Validation & Testing Service
- V06.09 Prepare Launch             -> realises Launch & Release Service
- V06.10 Release to Market          -> realises Launch & Release Service
- V06.11 Monitor Adoption           -> realises Adoption & Refinement Service
- V06.12 Refine Product / Service   -> realises Adoption & Refinement Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Market Research Tools
- Idea Management Platform
- Collaboration Tools
- Project Portfolio Management System
- Design / Prototyping Tools
- Product Lifecycle Management System
- Requirements Management Tools
- CRM
- Document Management
- Marketing Automation
- Analytics / BI

6. Relationships
- Customer -accesses-> Customer / Market Channel.
- Customer / Market Channel -serving-> the Opportunity & Ideation, Validation
  & Testing, Launch & Release and Adoption & Refinement services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V06.01 <- Market Research Tools;   V06.02 <- Idea Management Platform;
    V06.03 <- Collaboration Tools;     V06.04 <- Project Portfolio Management System;
    V06.05 <- Design / Prototyping Tools; V06.06 <- Product Lifecycle Management System;
    V06.07 <- Requirements Management Tools; V06.08 <- CRM;
    V06.09 <- Document Management;      V06.10 <- Marketing Automation;
    V06.11 <- Analytics / BI;          V06.12 <- Product Lifecycle Management + Analytics / BI.
- Research / Design Partner -serving-> V06.02 Capture Ideas, V06.03 Assess
  Feasibility, V06.05 Design Solution and V06.06 Develop Prototype.
- Investor -serving-> V06.04 Define Business Case and V06.08 Validate
  Commercial Model.
- Beta User -serving-> V06.07 Test with Users.
- Regulator -serving-> V06.09 Prepare Launch.

7. Intent
The Launch & Release Service sits top-centre as the headline service. The
twelve Business Processes form the backbone in V06.01 -> V06.12 order so the
reader can trace the idea-to-market journey and drill from any process straight
into its detailed BPMN model. This one ArchiMate view therefore links to all
twelve V06 BPMN process diagrams. The mapping of process -> actors/teams/
applications is the Process <-> Actors / Teams / IT Systems matrix above.
```

### V06.01 — Identify Opportunity

**BPMN diagram prompt.**

```text
BPMN: V06.01 Identify Opportunity — first stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Customer" — the external market party that signals a need.
- Pool "Product Organisation" — the organisation running the process, with two
  lanes top-to-bottom: "Strategy", "Product Management".
- Pool "Market Research Tools" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Market Research Tools: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Product Organisation pool in the middle,
  Market Research Tools pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Strategy lane:
- Conditional start event "Opportunity signal detected" (a market opportunity,
  a customer need, or an internal idea)
- Service task "Scan market and gather signals"
- Expanded Subprocess (LOOP marker) "Qualify the opportunity":
    internals — User task "Analyse signal (size, fit, timing)", then exclusive
    gateway "Opportunity qualified?": branch "Yes" → subprocess end event
    "Opportunity qualified". The loop marker repeats the attempt while the
    opportunity is not yet qualified.
- Exclusive gateway "Worth pursuing?"
    - branch "No – park": End event "Opportunity parked — no further action"
    - branch "Yes": continue to Product Management
Product Management lane:
- Service task "Record opportunity in pipeline"
- End event "Opportunity identified — ready for Capture Ideas (V06.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Qualify the opportunity" Expanded
  Subprocess: "Not qualified in 5 business days" → User task "Escalate to Head
  of Strategy" → escalation end event "Escalated — opportunity not qualified in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Customer → start event "Opportunity signal detected" (needs, feedback, buying
  signals)
- "Scan market and gather signals" → Market Research Tools
- Market Research Tools → "Analyse signal (size, fit, timing)" (market data,
  survey responses, trends)

This is the entry point of I2M: a market opportunity, customer need or internal
idea is picked up, its signal qualified (retried until it stands up) and, where
worth pursuing, recorded in the pipeline — leaving a qualified opportunity ready
to become ideas.
```

### V06.02 — Capture Ideas

**BPMN diagram prompt.**

```text
BPMN: V06.02 Capture Ideas — second stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Customer" — the external party that contributes needs and concepts.
- Pool "Research / Design Partner" — the external party that contributes
  concepts and research findings.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Innovation", "Product Management".
- Pool "Idea Management Platform" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Research / Design Partner: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Idea Management Platform: black-box, System = true, single instance.

3. Layout
- Customer and Research / Design Partner pools at the top, Product Organisation
  pool in the middle, Idea Management Platform pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Innovation lane:
- Message start event "Qualified opportunity received"
- Service task "Open idea campaign"
- User task "Collect and log ideas"
Product Management lane:
- Expanded Subprocess (LOOP marker) "Refine idea submission":
    internals — User task "Review idea (clarity, novelty, fit)", then exclusive
    gateway "Idea well-formed?": branch "No" → User task "Request more detail" →
    subprocess end event "Detail requested" (the loop marker then re-reviews);
    branch "Yes" → subprocess end event "Idea refined". The loop marker repeats
    while the idea is not well-formed.
- Service task "Shortlist ideas in Idea Management Platform"
- End event "Ideas captured — ready for Assess Feasibility (V06.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Refine idea submission" Expanded
  Subprocess: "Not refined in 5 business days" → User task "Escalate to
  Innovation Lead" → escalation end event "Escalated — ideas not refined in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Customer → "Collect and log ideas" (needs, feedback, concepts)
- Research / Design Partner → "Collect and log ideas" (concepts, research
  findings)
- "Shortlist ideas in Idea Management Platform" → Idea Management Platform
- Idea Management Platform → "Review idea (clarity, novelty, fit)" (duplicate
  check, related ideas)

This stage opens a campaign, collects ideas from customers and partners, and
refines each submission until it is well-formed (retried until clear) before
shortlisting in the idea platform — leaving a set of captured ideas ready for
feasibility assessment.
```

### V06.03 — Assess Feasibility

**BPMN diagram prompt.**

```text
BPMN: V06.03 Assess Feasibility — third stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Research / Design Partner" — the external party providing technical
  input.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Research and Development", "Product Management".
- Pool "Collaboration Tools" — the supporting IT system.

2. Pool properties
- Research / Design Partner: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Collaboration Tools: black-box, System = true, single instance.

3. Layout
- Research / Design Partner pool at the top, Product Organisation pool in the
  middle, Collaboration Tools pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Research and Development lane:
- Message start event "Shortlisted idea received"
- Service task "Assess technical feasibility"
- User task "Assess operational and regulatory feasibility"
Product Management lane:
- Exclusive gateway "Feasible?"
    - branch "No – not feasible": End event "Idea not feasible — archived"
    - branch "Unclear – needs partner input": Expanded Subprocess (LOOP marker)
      "Clarify feasibility with partner": internals — Send task "Send
      feasibility questions to partner", then intermediate message catch event
      "Partner responds (findings / constraints)", then exclusive gateway
      "Feasibility clear?": branch "Yes" → subprocess end event "Feasibility
      clarified". The loop marker repeats the exchange while feasibility is
      unclear.
    - branch "Yes": continue
- Service task "Record feasibility assessment"
- End event "Feasibility assessed — ready for Define Business Case (V06.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Clarify feasibility with partner"
  Expanded Subprocess: "No partner response in 10 business days" → User task
  "Escalate to R&D Manager" → escalation end event "Escalated — feasibility not
  clarified in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Send feasibility questions to partner" → Research / Design Partner
- Research / Design Partner → intermediate event "Partner responds (findings /
  constraints)"
- "Assess technical feasibility" → Collaboration Tools
- Collaboration Tools → "Record feasibility assessment" (shared analysis,
  feasibility notes)

This stage tests technical, operational and regulatory feasibility, clarifying
open questions with the partner where the picture is unclear (retried until
clear) and archiving unfeasible ideas — leaving an assessed idea ready for a
business case.
```

### V06.04 — Define Business Case

**BPMN diagram prompt.**

```text
BPMN: V06.04 Define Business Case — fourth stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Investor" — the external party whose funding decision is sought.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Product Management", "Finance".
- Pool "Project Portfolio Management System" — the supporting IT system.

2. Pool properties
- Investor: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Project Portfolio Management System: black-box, System = true, single instance.

3. Layout
- Investor pool at the top, Product Organisation pool in the middle,
  Project Portfolio Management System pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Product Management lane:
- Message start event "Feasible idea received"
- User task "Draft business case (value, cost, risk)"
Finance lane:
- Service task "Model costs, benefits and funding need"
- Exclusive gateway "Business case approved?"
    - branch "Approved": continue
    - branch "Refer – needs rework": Expanded Subprocess (LOOP marker) "Revise
      and re-submit business case": internals — User task "Revise business
      case", then Send task "Re-submit to investment board / investor", then
      intermediate message catch event "Decision received", then exclusive
      gateway "Approved now?": branch "Yes" → subprocess end event "Business
      case approved". The loop marker repeats while approval is withheld.
    - branch "Rejected": End event "Business case rejected — idea closed"
- Service task "Record approved business case and budget"
- End event "Business case defined — ready for Design Solution (V06.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Revise and re-submit business case"
  Expanded Subprocess: "Not approved in 10 business days" → User task "Escalate
  to Finance Director" → escalation end event "Escalated — business case not
  approved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Investor → "Model costs, benefits and funding need" (funding appetite, terms)
- "Re-submit to investment board / investor" → Investor
- Investor → intermediate event "Decision received"
- "Record approved business case and budget" → Project Portfolio Management System
- Project Portfolio Management System → "Model costs, benefits and funding need"
  (portfolio status, budget availability)

This stage builds and models the business case, revising and re-submitting for
funding where referred (retried until approved) and closing where rejected —
leaving an approved, funded case ready for solution design.
```

### V06.05 — Design Solution

**BPMN diagram prompt.**

```text
BPMN: V06.05 Design Solution — fifth stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Research / Design Partner" — the external party contributing design
  input.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Research and Development", "Engineering".
- Pool "Design / Prototyping Tools" — the supporting IT system.

2. Pool properties
- Research / Design Partner: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Design / Prototyping Tools: black-box, System = true, single instance.

3. Layout
- Research / Design Partner pool at the top, Product Organisation pool in the
  middle, Design / Prototyping Tools pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Research and Development lane:
- Message start event "Approved business case received"
- User task "Define requirements and design brief"
- Service task "Produce solution design"
Engineering lane:
- Expanded Subprocess (LOOP marker) "Review and revise design":
    internals — User task "Review design (requirements, feasibility, standards)",
    then exclusive gateway "Design accepted?": branch "No" → User task "Revise
    design" → subprocess end event "Revision recorded" (the loop marker then
    re-reviews); branch "Yes" → subprocess end event "Design accepted". The loop
    marker repeats while the design is not accepted.
- Service task "Baseline design in Design / Prototyping Tools"
- End event "Solution designed — ready for Develop Prototype (V06.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Review and revise design" Expanded
  Subprocess: "Not accepted in 10 business days" → User task "Escalate to Head
  of Engineering" → escalation end event "Escalated — design not accepted in
  time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Define requirements and design brief" → Research / Design Partner (design
  collaboration request)
- Research / Design Partner → "Produce solution design" (design input, technical
  details)
- "Baseline design in Design / Prototyping Tools" → Design / Prototyping Tools
- Design / Prototyping Tools → "Review design (requirements, feasibility,
  standards)" (design assets, versions)

This stage turns the approved case into requirements and a solution design,
reviewing and revising with engineering until accepted (retried until it passes)
and baselining it in the design tools — leaving an accepted design ready for a
prototype.
```

### V06.06 — Develop Prototype

**BPMN diagram prompt.**

```text
BPMN: V06.06 Develop Prototype — sixth stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Research / Design Partner" — the external party supplying components and
  detail.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Engineering", "Research and Development".
- Pool "Product Lifecycle Management System" — the supporting IT system.

2. Pool properties
- Research / Design Partner: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Product Lifecycle Management System: black-box, System = true, single instance.

3. Layout
- Research / Design Partner pool at the top, Product Organisation pool in the
  middle, Product Lifecycle Management System pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Engineering lane:
- Message start event "Accepted design received"
- Service task "Build prototype / minimum viable product"
- User task "Verify prototype against design"
- Exclusive gateway "Prototype meets design?"
    - branch "No – defects": Expanded Subprocess (LOOP marker) "Fix prototype
      defects": internals — User task "Log defects", then User task "Rework
      prototype", then exclusive gateway "Defects cleared?": branch "Yes" →
      subprocess end event "Defects cleared". The loop marker repeats while
      defects remain.
    - branch "Yes": continue to Research and Development
Research and Development lane:
- Service task "Record prototype build in PLM"
- End event "Prototype developed — ready for Test with Users (V06.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Fix prototype defects" Expanded
  Subprocess: "Not cleared in 10 business days" → User task "Escalate to
  Engineering Manager" → escalation end event "Escalated — prototype defects not
  cleared in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Research / Design Partner → "Build prototype / minimum viable product"
  (components, technical details)
- "Record prototype build in PLM" → Product Lifecycle Management System
- Product Lifecycle Management System → "Verify prototype against design"
  (design baseline, build records)

This stage builds the prototype or minimum viable product, verifies it against
the design and clears any defects (retried until clean) before recording the
build in PLM — leaving a working prototype ready to test with users.
```

### V06.07 — Test with Users

**BPMN diagram prompt.**

```text
BPMN: V06.07 Test with Users — seventh stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Beta User" — the external party trialling the prototype.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Customer Experience", "Product Management".
- Pool "Requirements Management Tools" — the supporting IT system.

2. Pool properties
- Beta User: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Requirements Management Tools: black-box, System = true, single instance.

3. Layout
- Beta User pool at the top, Product Organisation pool in the middle,
  Requirements Management Tools pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Customer Experience lane:
- Message start event "Prototype ready to test"
- Service task "Recruit beta users and plan test"
- Send task "Invite beta users to trial"
- Intermediate message catch event "Test results received"
Product Management lane:
- Exclusive gateway "Results acceptable?"
    - branch "No – issues found": Expanded Subprocess (LOOP marker) "Resolve
      test issues": internals — User task "Triage feedback and defects", then
      Send task "Request clarification from beta users", then intermediate
      message catch event "Beta users respond", then exclusive gateway "Issues
      resolved?": branch "Yes" → subprocess end event "Issues resolved". The
      loop marker repeats while issues remain.
    - branch "Yes": continue
- Service task "Record test outcomes in Requirements Management Tools"
- End event "Users tested — ready for Validate Commercial Model (V06.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve test issues" Expanded
  Subprocess: "Not resolved in 10 business days" → User task "Escalate to
  Product Owner" → escalation end event "Escalated — test issues not resolved in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Invite beta users to trial" → Beta User
- Beta User → intermediate event "Test results received" (test results, usage
  data)
- "Request clarification from beta users" → Beta User
- Beta User → intermediate event "Beta users respond"
- "Record test outcomes in Requirements Management Tools" → Requirements
  Management Tools

This stage recruits beta users, runs the trial and gathers results, resolving
any issues with the users (retried until cleared) before recording the outcomes
— leaving a user-tested product ready for commercial validation.
```

### V06.08 — Validate Commercial Model

**BPMN diagram prompt.**

```text
BPMN: V06.08 Validate Commercial Model — eighth stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Customer" — the external market party whose demand is tested.
- Pool "Investor" — the external party validating the commercial case.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Finance", "Sales".
- Pool "CRM" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Investor: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- CRM: black-box, System = true, single instance.

3. Layout
- Customer and Investor pools at the top, Product Organisation pool in the
  middle, CRM pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Finance lane:
- Message start event "Tested product received"
- User task "Define pricing and revenue model"
- Service task "Test willingness to pay and demand"
Sales lane:
- Exclusive gateway "Commercial model viable?"
    - branch "No – needs adjustment": Expanded Subprocess (LOOP marker) "Adjust
      commercial model": internals — User task "Revise pricing / packaging",
      then Send task "Validate offer with customers / investor", then
      intermediate message catch event "Market response received", then
      exclusive gateway "Viable now?": branch "Yes" → subprocess end event
      "Model validated". The loop marker repeats while the model is not viable.
    - branch "Yes": continue
- Service task "Record validated commercial model in CRM"
- End event "Commercial model validated — ready for Prepare Launch (V06.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Adjust commercial model" Expanded
  Subprocess: "Not validated in 10 business days" → User task "Escalate to
  Commercial Director" → escalation end event "Escalated — commercial model not
  validated in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Customer → "Test willingness to pay and demand" (buying signals, survey
  responses)
- "Validate offer with customers / investor" → Customer
- "Validate offer with customers / investor" → Investor
- Customer → intermediate event "Market response received"
- Investor → intermediate event "Market response received"
- "Record validated commercial model in CRM" → CRM
- CRM → "Test willingness to pay and demand" (customer data, pipeline)

This stage sets the pricing and revenue model and tests demand, adjusting the
offer with customers and investor where it does not stack up (retried until
viable) — leaving a validated commercial model ready for launch preparation.
```

### V06.09 — Prepare Launch

**BPMN diagram prompt.**

```text
BPMN: V06.09 Prepare Launch — ninth stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Regulator" — the external party granting clearances and approvals.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Marketing", "Legal / Compliance".
- Pool "Document Management" — the supporting IT system.

2. Pool properties
- Regulator: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Document Management: black-box, System = true, single instance.

3. Layout
- Regulator pool at the top, Product Organisation pool in the middle,
  Document Management pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Marketing lane:
- Message start event "Validated model received"
- User task "Build launch plan and readiness checklist"
- Service task "Prepare campaign assets and collateral"
Legal / Compliance lane:
- User task "Check regulatory and safety requirements"
- Exclusive gateway "Approvals in place?"
    - branch "Yes": continue to Marketing
    - branch "No – approval needed": Expanded Subprocess (LOOP marker) "Obtain
      regulatory approval": internals — Send task "Submit for regulatory
      approval", then intermediate message catch event "Regulator responds
      (approve / query)", then exclusive gateway "Approved?": branch "Yes" →
      subprocess end event "Approval obtained". The loop marker repeats the
      submission while approval is outstanding.
Marketing lane:
- Service task "Finalise launch readiness in Document Management"
- End event "Launch prepared — ready for Release to Market (V06.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Obtain regulatory approval" Expanded
  Subprocess: "No approval in 20 business days" → User task "Escalate to Head of
  Compliance" → escalation end event "Escalated — regulatory approval not
  obtained in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Submit for regulatory approval" → Regulator
- Regulator → intermediate event "Regulator responds (approve / query)"
- "Finalise launch readiness in Document Management" → Document Management
- Document Management → "Build launch plan and readiness checklist" (templates,
  prior launch records)

This stage builds the launch plan and campaign assets and checks regulatory and
safety requirements, obtaining any outstanding approval from the regulator
(retried until granted) — leaving a launch that is ready and cleared to go to
market.
```

### V06.10 — Release to Market

**BPMN diagram prompt.**

```text
BPMN: V06.10 Release to Market — tenth stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Customer" — the external market party the product is released to.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Marketing", "Sales".
- Pool "Marketing Automation" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Marketing Automation: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Product Organisation pool in the middle,
  Marketing Automation pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Marketing lane:
- Message start event "Launch approved and ready"
- Service task "Activate launch campaign"
- Send task "Publish launch communications"
Sales lane:
- User task "Enable sales and channels"
- Exclusive gateway "Release stable?"
    - branch "No – launch issue": Expanded Subprocess (LOOP marker) "Resolve
      launch issue": internals — User task "Diagnose launch issue", then User
      task "Apply fix / hotfix", then exclusive gateway "Stable now?": branch
      "Yes" → subprocess end event "Launch stabilised". The loop marker repeats
      while the release is unstable.
    - branch "Yes": continue
- Service task "Confirm go-live in Marketing Automation"
- End event "Released to market — ready for Monitor Adoption (V06.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve launch issue" Expanded
  Subprocess: "Not stabilised in 3 business days" → User task "Escalate to
  Launch Manager" → escalation end event "Escalated — launch not stabilised in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Publish launch communications" → Customer (launch communications, product
  information)
- "Activate launch campaign" → Marketing Automation
- Marketing Automation → "Enable sales and channels" (campaign status, leads)
- "Confirm go-live in Marketing Automation" → Marketing Automation

This stage activates the campaign, publishes launch communications and enables
sales channels, stabilising any launch issue (retried until stable) before
confirming go-live — leaving the product released to market and ready for
adoption monitoring.
```

### V06.11 — Monitor Adoption

**BPMN diagram prompt.**

```text
BPMN: V06.11 Monitor Adoption — eleventh stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Customer" — the external market party whose adoption is tracked.
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Customer Experience", "Product Management".
- Pool "Analytics / BI" — the supporting IT system.

2. Pool properties
- Customer: black-box, single instance.
- Product Organisation: white-box (holds the process flow).
- Analytics / BI: black-box, System = true, single instance.

3. Layout
- Customer pool at the top, Product Organisation pool in the middle,
  Analytics / BI pool at the bottom.

4. Lane contents in flow order (Product Organisation)
Customer Experience lane:
- Message start event "Product released to market"
- Service task "Track adoption and usage metrics"
- User task "Gather customer feedback"
Product Management lane:
- Exclusive gateway "Adoption on target?"
    - branch "No – underperforming": Expanded Subprocess (LOOP marker) "Address
      adoption gap": internals — User task "Analyse adoption gap", then Send
      task "Run corrective campaign / outreach", then intermediate message catch
      event "Customer response received", then exclusive gateway "Back on
      target?": branch "Yes" → subprocess end event "Adoption recovered". The
      loop marker repeats while adoption is off target.
    - branch "Yes": continue
- Service task "Publish adoption report in Analytics / BI"
- End event "Adoption monitored — ready for Refine Product / Service (V06.12)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Address adoption gap" Expanded
  Subprocess: "Not recovered in 15 business days" → User task "Escalate to Head
  of Product" → escalation end event "Escalated — adoption gap not closed in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Customer → "Gather customer feedback" (feedback, usage data, complaints)
- "Run corrective campaign / outreach" → Customer
- Customer → intermediate event "Customer response received"
- "Track adoption and usage metrics" → Analytics / BI
- Analytics / BI → "Analyse adoption gap" (adoption metrics, cohort data)
- "Publish adoption report in Analytics / BI" → Analytics / BI

This stage tracks adoption and gathers customer feedback, closing any adoption
gap with corrective outreach where the product underperforms (retried until
recovered) before publishing the adoption report — leaving monitored adoption
ready to drive refinement.
```

### V06.12 — Refine Product / Service

**BPMN diagram prompt.**

```text
BPMN: V06.12 Refine Product / Service — final stage of the Idea to Market (I2M) value chain.

1. Pools & Lanes
- Pool "Product Organisation" — the organisation, with two lanes top-to-bottom:
  "Product Management", "Operations".
- Pool "Product Lifecycle Management System" — a supporting IT system.
- Pool "Analytics / BI" — a supporting IT system.

2. Pool properties
- Product Organisation: white-box (holds the process flow).
- Product Lifecycle Management System: black-box, System = true, single instance.
- Analytics / BI: black-box, System = true, single instance.

3. Layout
- Product Organisation pool at the top, Product Lifecycle Management System and
  Analytics / BI pools at the bottom.

4. Lane contents in flow order (Product Organisation)
Product Management lane:
- Message start event "Adoption insights ready"
- Service task "Review performance against objectives"
- Exclusive gateway "Refinements needed?"
    - branch "Yes – iterate": User task "Prioritise improvements into backlog",
      then End event "Improvements queued — routed to next Idea to Market cycle"
    - branch "No": continue to Operations
Operations lane:
- Service task "Update product record and lifecycle status"
- Service task "Capture lessons learned and close cycle"
- End event "Product refined — Idea to Market complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- Analytics / BI → "Review performance against objectives" (adoption,
  performance metrics)
- "Update product record and lifecycle status" → Product Lifecycle Management System
- "Capture lessons learned and close cycle" → Product Lifecycle Management System

This stage reviews performance against objectives, queues prioritised
improvements back into a fresh cycle where refinement is needed, and otherwise
updates the product record, captures lessons learned and closes the cycle —
completing the end-to-end Idea to Market value chain.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V07 - Issue to Resolution
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V07.01. Receive Issue
V07.02. Identify Customer / User
V07.03. Classify Issue
V07.04. Assess Severity & Entitlement
V07.05. Investigate
V07.06. Diagnose Root Cause
V07.07. Resolve or Fulfil Request
V07.08. Escalate if Needed
V07.09. Communicate Outcome
V07.10. Obtain Confirmation
V07.11. Close Case
V07.12. Analyse Trends

This is the customer-facing, issue-management end-to-end process: a raised
issue flows through intake, identification, classification, assessment,
investigation, diagnosis, resolution, escalation, communication,
confirmation, closure and trend analysis. The main external participant is
the Complainant / Customer / User; the process is triggered when that
participant raises an issue, complaint, defect, service request, warranty
claim, incident or query, and the external interaction begins the moment the
issue is received.
```

**Context diagram prompt.**

```text
Context Diagram: V07 — Issue to Resolution.

1. Central system (process-system)
A single central process/system ellipse named "Service Company" representing
the whole organisation that runs the Issue to Resolution process. It is the
system in context: everything inside it — customer service, technical support,
service operations, complaints management, quality assurance, field service,
product / engineering, legal and risk and the supporting IT systems (CRM, case
management, ticketing, knowledge base, field service, warranty, product defect
and analytics) — is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Complainant / Customer / User
- Field Service Partner
- Regulator

3. Layout
"Service Company" sits in the centre. The Complainant / Customer / User sits to
the LEFT (the demand side that raises the issue and receives the outcome).
Field Service Partner sits to the RIGHT (on-site fulfilment). Regulator sits to
the RIGHT (statutory reporting). The demand originates OUTSIDE the company (a
raised issue), so the customer sits on the left. Every external entity connects
directly to the central system with labelled information flows; entities never
connect to one another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Complainant / Customer / User → Service Company: issue details, evidence,
  product / service information, impact description, contact details, desired
  resolution.
- Service Company → Complainant / Customer / User: acknowledgement, case
  number, status updates, requests for further information, resolution advice,
  compensation / refund information, closure confirmation, escalation outcomes.
- Service Company → Field Service Partner: service request / work order, site
  and asset details, resolution instructions.
- Field Service Partner → Service Company: field diagnosis, completion report,
  parts used.
- Service Company → Regulator: regulatory notification / incident report.
- Regulator → Service Company: acknowledgement, directions, findings.

This Context Diagram frames the Service Company as a single system in context:
the Complainant / Customer / User raises the issue and receives the outcome, the
Field Service Partner performs on-site fulfilment, and the Regulator receives
statutory notifications and issues directions. The three external entities are
exactly the external actors of the Process Context diagram below, so the two
views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V07 — Issue to Resolution.

1. System boundary and processes
A system boundary named "V07 — Issue to Resolution" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V07.01 Receive Issue
- V07.02 Identify Customer / User
- V07.03 Classify Issue
- V07.04 Assess Severity & Entitlement
- V07.05 Investigate
- V07.06 Diagnose Root Cause
- V07.07 Resolve or Fulfil Request
- V07.08 Escalate if Needed
- V07.09 Communicate Outcome
- V07.10 Obtain Confirmation
- V07.11 Close Case
- V07.12 Analyse Trends

2. Participants (outside the boundary)
External actors (actor):
- Complainant / Customer / User
- Field Service Partner
- Regulator
Internal teams (team):
- Customer Service
- Complaints Management
- Technical Support
- Product / Engineering
- Service Operations
- Field Service
- Legal / Risk
- Quality Assurance
IT systems (system):
- Ticketing / Customer Contact Platform
- CRM System
- Case Management System
- Warranty / Entitlement System
- Knowledge Base
- Product Defect System
- Field Service System
- Workflow / Escalation System
- Email / Correspondence System
- Customer Portal
- Analytics / BI System

3. Layout
The processes sit inside the boundary in V07.01 → V07.12 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V07.01 Receive Issue — Complainant / Customer / User (raise issue, receive
  acknowledgement); Customer Service (intake); Ticketing / Customer Contact
  Platform (log & case number).
- V07.02 Identify Customer / User — Complainant / Customer / User (verify
  identity); Customer Service (identify); CRM System (customer history &
  entitlement).
- V07.03 Classify Issue — Customer Service (determine type), Complaints
  Management (categorise); Case Management System (record classification).
- V07.04 Assess Severity & Entitlement — Complainant / Customer / User (provide
  further information); Customer Service (check entitlement), Complaints
  Management (set severity); Warranty / Entitlement System (entitlement & SLA).
- V07.05 Investigate — Complainant / Customer / User (provide evidence);
  Technical Support (investigate); Knowledge Base (known issues & fixes).
- V07.06 Diagnose Root Cause — Technical Support (analyse), Product /
  Engineering (root cause); Product Defect System (defects & product history).
- V07.07 Resolve or Fulfil Request — Field Service Partner (on-site service);
  Service Operations (resolve), Field Service (dispatch); Field Service System
  (work order & completion).
- V07.08 Escalate if Needed — Regulator (regulatory notification); Complaints
  Management (escalate), Legal / Risk (review); Workflow / Escalation System
  (escalation records).
- V07.09 Communicate Outcome — Complainant / Customer / User (receive outcome);
  Customer Service (communicate); Email / Correspondence System (correspondence).
- V07.10 Obtain Confirmation — Complainant / Customer / User (confirm /
  satisfaction); Customer Service (confirm); Customer Portal (survey & response).
- V07.11 Close Case — Service Operations (verify), Quality Assurance (quality
  review & close); Case Management System, CRM System (close & update).
- V07.12 Analyse Trends — Quality Assurance (analyse), Product / Engineering
  (improvement actions); Analytics / BI System (dashboards & reports).

This Process Context diagram frames the whole Issue to Resolution value chain:
the twelve subprocesses inside the boundary, the external actors (Complainant /
Customer / User, Field Service Partner, Regulator) and internal teams that
perform them, and the IT systems that support them — consistent with the
per-process BPMN prompts below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Service Organisation" pool (key role in brackets), and IT systems
are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V07.01** Receive Issue | Complainant / Customer / User | Customer Service (customer service agent) | Ticketing / Customer Contact Platform |
| **V07.02** Identify Customer / User | Complainant / Customer / User | Customer Service (customer service agent) | CRM System |
| **V07.03** Classify Issue | — | Customer Service (customer service agent), Complaints Management (complaints officer) | Case Management System |
| **V07.04** Assess Severity & Entitlement | Complainant / Customer / User | Customer Service (customer service agent), Complaints Management (case manager) | Warranty / Entitlement System |
| **V07.05** Investigate | Complainant / Customer / User | Technical Support (support analyst) | Knowledge Base |
| **V07.06** Diagnose Root Cause | — | Technical Support (support analyst), Product / Engineering (product specialist) | Product Defect System |
| **V07.07** Resolve or Fulfil Request | Field Service Partner | Service Operations (case manager), Field Service (service technician) | Field Service System |
| **V07.08** Escalate if Needed | Regulator | Complaints Management (escalation manager), Legal / Risk (compliance officer) | Workflow / Escalation System |
| **V07.09** Communicate Outcome | Complainant / Customer / User | Customer Service (customer experience manager) | Email / Correspondence System |
| **V07.10** Obtain Confirmation | Complainant / Customer / User | Customer Service (customer service agent) | Customer Portal |
| **V07.11** Close Case | — | Service Operations (case manager), Quality Assurance (quality analyst) | Case Management System, CRM System |
| **V07.12** Analyse Trends | — | Quality Assurance (quality analyst), Product / Engineering (product specialist) | Analytics / BI System |

**Actor / Team / System roll-up** (every distinct participant across V07):

- **External actors:** Complainant / Customer / User (V07.01, V07.02, V07.04, V07.05, V07.09, V07.10); Field Service Partner (V07.07); Regulator (V07.08).
- **Teams:** Customer Service (V07.01, V07.02, V07.04, V07.09, V07.10); Complaints Management (V07.03, V07.04, V07.08); Technical Support (V07.05, V07.06); Product / Engineering (V07.06, V07.12); Service Operations (V07.07, V07.11); Field Service (V07.07); Legal / Risk (V07.08); Quality Assurance (V07.11, V07.12).
- **IT systems:** Ticketing / Customer Contact Platform (V07.01); CRM System (V07.02, V07.11); Case Management System (V07.03, V07.11); Warranty / Entitlement System (V07.04); Knowledge Base (V07.05); Product Defect System (V07.06); Field Service System (V07.07); Workflow / Escalation System (V07.08); Email / Correspondence System (V07.09); Customer Portal (V07.10); Analytics / BI System (V07.12).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Issue to Resolution service area. It
shows the **Actors**, **Services**, **Processes**, **Interfaces** and
**Applications** that provide the Issue Resolution Service and the related
customer-facing services across the twelve V07 processes. Each Business Process
is a drill-down anchor: link it to the matching V07.nn BPMN diagram and its
marker turns green.

```text
ArchiMate: V07 — Issue to Resolution — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Issue Resolution Service and the
related services (to the Complainant / Customer / User and to the Field Service
Partner and Regulator) across the twelve V07 Issue to Resolution processes, and
the applications that support them. Lay it out in three horizontal bands, top to
bottom — BUSINESS SERVICES → BUSINESS PROCESSES → APPLICATIONS — with the
Complainant / Customer / User on the far left and the Field Service Partner /
Regulator on the far right. Read top-to-bottom as service → process →
application (ArchiMate service realisation).

1. Business Actors (Business Actor)
- Complainant / Customer / User — the external party the issue-resolution
  service is provided to (far left, the originator of every issue).
- Field Service Partner — the external party that performs on-site fulfilment
  (far right).
- Regulator — the external party that receives statutory notifications (far
  right).

2. Interfaces
- Business Interface "Customer Contact / Service Channel" — the channel the
  customer uses to raise the issue, receive updates and confirm the outcome.
  The Complainant / Customer / User ACCESSES this interface; the interface
  SERVES the business services below.
- Application Interfaces (optional, only the few the channel calls): "Portal
  API" on the Customer Portal, "Field Service API" on the Field Service System.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in resolution-journey order:
- Issue Intake Service — receive the issue and identify the customer.
- Triage & Assessment Service — classify, assess severity and entitlement.
- Investigation & Diagnosis Service — investigate and diagnose root cause.
- Resolution Service — resolve or fulfil the request.
- Escalation & Regulatory Service — escalate and notify where required.
- Customer Communication Service — communicate the outcome and obtain
  confirmation.
- Case Closure & Improvement Service — close the case and analyse trends.

4. Business Processes (Business Process) — the twelve V07 processes, middle band
   in V07.01 → V07.12 order. Each REALISES the business service shown and is the
   link anchor to its BPMN diagram:
- V07.01 Receive Issue                    -> realises Issue Intake Service
- V07.02 Identify Customer / User         -> realises Issue Intake Service
- V07.03 Classify Issue                   -> realises Triage & Assessment Service
- V07.04 Assess Severity & Entitlement    -> realises Triage & Assessment Service
- V07.05 Investigate                      -> realises Investigation & Diagnosis Service
- V07.06 Diagnose Root Cause              -> realises Investigation & Diagnosis Service
- V07.07 Resolve or Fulfil Request        -> realises Resolution Service
- V07.08 Escalate if Needed               -> realises Escalation & Regulatory Service
- V07.09 Communicate Outcome              -> realises Customer Communication Service
- V07.10 Obtain Confirmation              -> realises Customer Communication Service
- V07.11 Close Case                       -> realises Case Closure & Improvement Service
- V07.12 Analyse Trends                   -> realises Case Closure & Improvement Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Ticketing / Customer Contact Platform
- CRM System
- Case Management System
- Warranty / Entitlement System
- Knowledge Base
- Product Defect System
- Field Service System
- Workflow / Escalation System
- Email / Correspondence System
- Customer Portal
- Analytics / BI System

6. Relationships
- Complainant / Customer / User -accesses-> Customer Contact / Service Channel.
- Customer Contact / Service Channel -serving-> the Intake, Assessment,
  Communication and Confirmation services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V07.01 <- Ticketing / Customer Contact Platform; V07.02 <- CRM System;
    V07.03 <- Case Management System;      V07.04 <- Warranty / Entitlement System;
    V07.05 <- Knowledge Base;              V07.06 <- Product Defect System;
    V07.07 <- Field Service System;        V07.08 <- Workflow / Escalation System;
    V07.09 <- Email / Correspondence System; V07.10 <- Customer Portal;
    V07.11 <- Case Management System + CRM System; V07.12 <- Analytics / BI System.
- Field Service Partner -serving-> V07.07 Resolve or Fulfil Request.
- Regulator -serving-> V07.08 Escalate if Needed.

7. Intent
The Issue Resolution Service sits top-centre as the headline service. The twelve
Business Processes form the backbone in V07.01 -> V07.12 order so the reader can
trace the issue-resolution journey and drill from any process straight into its
detailed BPMN model. This one ArchiMate view therefore links to all twelve V07
BPMN process diagrams. The mapping of process -> actors/teams/applications is the
Process <-> Actors / Teams / IT Systems matrix above.
```

### V07.01 — Receive Issue

**BPMN diagram prompt.**

```text
BPMN: V07.01 Receive Issue — first stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Complainant / Customer / User" — the external party that raises the issue.
- Pool "Service Organisation" — the organisation running the process, with one
  lane: "Customer Service".
- Pool "Ticketing / Customer Contact Platform" — the supporting IT system.

2. Pool properties
- Complainant / Customer / User: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Ticketing / Customer Contact Platform: black-box, System = true, single instance.

3. Layout
- Complainant / Customer / User pool at the top, Service Organisation pool in the
  middle, Ticketing / Customer Contact Platform pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Customer Service lane:
- Message start event "Issue / complaint raised" (complaint, defect, service
  request, warranty claim, incident or query)
- Expanded Subprocess (LOOP marker) "Capture complete issue details":
    internals — User task "Record issue (channel, description, impact, contact)",
    then exclusive gateway "Details complete?": branch "Yes" → subprocess end
    event "Details captured". The loop marker repeats the attempt while the
    issue details are incomplete.
- Service task "Create case / ticket and assign reference"
- Send task "Acknowledge receipt and issue case number"
- End event "Issue received — ready for Identify Customer / User (V07.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Capture complete issue details"
  Expanded Subprocess: "Details not completed in 1 business day" → User task
  "Escalate to Customer Service Lead" → escalation end event "Escalated — issue
  details not captured in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Complainant / Customer / User → start event "Issue / complaint raised"
- "Create case / ticket and assign reference" → Ticketing / Customer Contact
  Platform
- "Acknowledge receipt and issue case number" → Complainant / Customer / User

This is the entry point of Issue to Resolution: a customer raises an issue, its
details are captured (retried until complete), a case is created and a case
number acknowledged — leaving a logged issue ready for customer identification.
```

### V07.02 — Identify Customer / User

**BPMN diagram prompt.**

```text
BPMN: V07.02 Identify Customer / User — second stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Complainant / Customer / User" — the external party being identified.
- Pool "Service Organisation" — the organisation, with one lane: "Customer Service".
- Pool "CRM System" — the supporting IT system.

2. Pool properties
- Complainant / Customer / User: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- CRM System: black-box, System = true, single instance.

3. Layout
- Complainant / Customer / User pool at the top, Service Organisation pool in the
  middle, CRM System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Customer Service lane:
- Message start event "Case ready to identify customer"
- Service task "Search CRM for customer / user record"
- Exclusive gateway "Customer record found?"
    - branch "No – new customer": Service task "Create customer record"
    - branch "Yes": continue
- Expanded Subprocess (LOOP marker) "Verify customer identity":
    internals — User task "Check identity and contact details", then Send task
    "Request verification from customer", then intermediate message catch event
    "Customer confirms details", then exclusive gateway "Identity verified?":
    branch "Yes" → subprocess end event "Identity verified". The loop marker
    repeats the attempt while the identity is unverified.
- Service task "Link case to customer and pull history"
- End event "Customer identified — ready for Classify Issue (V07.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Verify customer identity" Expanded
  Subprocess: "Not verified in 2 business days" → User task "Escalate to Customer
  Service Lead" → escalation end event "Escalated — customer not identified in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Search CRM for customer / user record" → CRM System
- CRM System → "Customer record found?" (customer history, prior issues,
  entitlement)
- "Request verification from customer" → Complainant / Customer / User
- Complainant / Customer / User → intermediate event "Customer confirms details"
- "Link case to customer and pull history" → CRM System

This stage matches the issue to a customer record — creating one where new —
verifies the customer's identity (retried until confirmed) and pulls their
history, leaving an identified customer ready for classification.
```

### V07.03 — Classify Issue

**BPMN diagram prompt.**

```text
BPMN: V07.03 Classify Issue — third stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Customer Service", "Complaints Management".
- Pool "Case Management System" — the supporting IT system.

2. Pool properties
- Service Organisation: white-box (holds the process flow).
- Case Management System: black-box, System = true, single instance.

3. Layout
- Service Organisation pool at the top, Case Management System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Customer Service lane:
- Message start event "Identified case ready to classify"
- Service task "Determine issue type (complaint / defect / service request / query)"
Complaints Management lane:
- User task "Assign category and priority"
- Exclusive gateway "Classification clear?"
    - branch "No – ambiguous": Expanded Subprocess (LOOP marker) "Resolve
      classification": internals — User task "Review issue against classification
      rules", then exclusive gateway "Classification agreed?": branch "Yes" →
      subprocess end event "Classification agreed". The loop marker repeats while
      the classification is ambiguous.
    - branch "Yes": continue
- Service task "Record classification in Case Management System"
- End event "Issue classified — ready for Assess Severity & Entitlement (V07.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve classification" Expanded
  Subprocess: "Not classified in 1 business day" → User task "Escalate to
  Complaints Manager" → escalation end event "Escalated — issue not classified in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Record classification in Case Management System" → Case Management System
- Case Management System → "Assign category and priority" (case data,
  classification rules)

This stage determines the issue type and assigns a category and priority —
resolving any ambiguous classification (retried until agreed) — and records it,
leaving a classified issue ready for severity and entitlement assessment.
```

### V07.04 — Assess Severity & Entitlement

**BPMN diagram prompt.**

```text
BPMN: V07.04 Assess Severity & Entitlement — fourth stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Complainant / Customer / User" — the external party supplying further
  information.
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Customer Service", "Complaints Management".
- Pool "Warranty / Entitlement System" — the supporting IT system.

2. Pool properties
- Complainant / Customer / User: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Warranty / Entitlement System: black-box, System = true, single instance.

3. Layout
- Complainant / Customer / User pool at the top, Service Organisation pool in the
  middle, Warranty / Entitlement System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Customer Service lane:
- Message start event "Classified case ready to assess"
- Service task "Check entitlement / warranty / SLA"
Complaints Management lane:
- User task "Assess severity and impact"
- Exclusive gateway "Entitlement and information sufficient?"
    - branch "No – more information needed": Expanded Subprocess (LOOP marker)
      "Obtain further information": internals — Send task "Request further
      information from customer", then intermediate message catch event "Customer
      provides information", then exclusive gateway "Sufficient now?": branch
      "Yes" → subprocess end event "Information sufficient". The loop marker
      repeats while the information is insufficient.
    - branch "Yes": continue
- Service task "Set severity, SLA timer and entitlement"
- End event "Severity & entitlement assessed — ready for Investigate (V07.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Obtain further information" Expanded
  Subprocess: "No response in 5 business days" → User task "Escalate to Complaints
  Manager" → escalation end event "Escalated — information not received in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check entitlement / warranty / SLA" → Warranty / Entitlement System
- Warranty / Entitlement System → "Assess severity and impact" (entitlement,
  warranty status, SLA)
- "Request further information from customer" → Complainant / Customer / User
- Complainant / Customer / User → intermediate event "Customer provides
  information"

This stage checks entitlement and warranty, assesses severity and impact —
obtaining any further information from the customer (retried until sufficient) —
and sets the SLA timer, leaving an assessed case ready for investigation.
```

### V07.05 — Investigate

**BPMN diagram prompt.**

```text
BPMN: V07.05 Investigate — fifth stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Complainant / Customer / User" — the external party supplying evidence.
- Pool "Service Organisation" — the organisation, with one lane: "Technical Support".
- Pool "Knowledge Base" — the supporting IT system.

2. Pool properties
- Complainant / Customer / User: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Knowledge Base: black-box, System = true, single instance.

3. Layout
- Complainant / Customer / User pool at the top, Service Organisation pool in the
  middle, Knowledge Base pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Technical Support lane:
- Message start event "Assessed case ready to investigate"
- Service task "Search knowledge base and case history"
- User task "Reproduce / examine the issue"
- Exclusive gateway "Enough evidence to proceed?"
    - branch "No – need customer evidence": Expanded Subprocess (LOOP marker)
      "Gather evidence from customer": internals — Send task "Request evidence /
      logs from customer", then intermediate message catch event "Customer
      provides evidence", then exclusive gateway "Evidence sufficient?": branch
      "Yes" → subprocess end event "Evidence gathered". The loop marker repeats
      while the evidence is insufficient.
    - branch "Yes": continue
- Service task "Record investigation findings"
- End event "Investigation complete — ready for Diagnose Root Cause (V07.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Gather evidence from customer"
  Expanded Subprocess: "Evidence not received in 5 business days" → User task
  "Escalate to Support Lead" → escalation end event "Escalated — evidence not
  received in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Search knowledge base and case history" → Knowledge Base
- Knowledge Base → "Reproduce / examine the issue" (knowledge articles, prior
  issues)
- "Request evidence / logs from customer" → Complainant / Customer / User
- Complainant / Customer / User → intermediate event "Customer provides evidence"

This stage investigates the issue against the knowledge base and case history and
reproduces it — gathering any further evidence from the customer (retried until
sufficient) — and records the findings, leaving the investigation ready for root
cause diagnosis.
```

### V07.06 — Diagnose Root Cause

**BPMN diagram prompt.**

```text
BPMN: V07.06 Diagnose Root Cause — sixth stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Technical Support", "Product / Engineering".
- Pool "Product Defect System" — the supporting IT system.

2. Pool properties
- Service Organisation: white-box (holds the process flow).
- Product Defect System: black-box, System = true, single instance.

3. Layout
- Service Organisation pool at the top, Product Defect System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Technical Support lane:
- Message start event "Investigated case ready to diagnose"
- Service task "Analyse findings and symptoms"
Product / Engineering lane:
- User task "Determine root cause"
- Exclusive gateway "Root cause confirmed?"
    - branch "No – needs deeper analysis": Expanded Subprocess (LOOP marker)
      "Perform root cause analysis": internals — User task "Run diagnostic /
      test hypothesis", then exclusive gateway "Cause identified?": branch "Yes"
      → subprocess end event "Cause identified". The loop marker repeats while the
      root cause is unconfirmed.
    - branch "Yes": continue
- Service task "Record root cause and defect (if any)"
- End event "Root cause diagnosed — ready for Resolve or Fulfil Request (V07.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Perform root cause analysis" Expanded
  Subprocess: "Root cause not found in 10 business days" → User task "Escalate to
  Engineering Manager" → escalation end event "Escalated — root cause not
  diagnosed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Record root cause and defect (if any)" → Product Defect System
- Product Defect System → "Determine root cause" (known defects, product history)

This stage analyses the investigation findings and determines the root cause —
running deeper analysis where the cause is unconfirmed (retried until identified)
— and records any defect, leaving a diagnosed cause ready for resolution.
```

### V07.07 — Resolve or Fulfil Request

**BPMN diagram prompt.**

```text
BPMN: V07.07 Resolve or Fulfil Request — seventh stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Field Service Partner" — the external party performing on-site service.
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Service Operations", "Field Service".
- Pool "Field Service System" — the supporting IT system.

2. Pool properties
- Field Service Partner: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Field Service System: black-box, System = true, single instance.

3. Layout
- Field Service Partner pool at the top, Service Organisation pool in the middle,
  Field Service System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Service Operations lane:
- Message start event "Diagnosed case ready to resolve"
- Service task "Determine resolution / remedy (repair, replace, refund, fulfil)"
- Exclusive gateway "On-site service required?"
    - branch "Yes – field service": continue to Field Service
    - branch "No – remote resolution": continue to "Apply resolution and update case"
Field Service lane:
- Expanded Subprocess (LOOP marker) "Complete field service": internals — Send
    task "Dispatch work order to field service partner", then intermediate message
    catch event "Partner reports completion", then exclusive gateway "Issue
    resolved on site?": branch "Yes" → subprocess end event "Field service
    complete". The loop marker repeats the attempt while the issue is unresolved.
Service Operations lane:
- Service task "Apply resolution and update case"
- End event "Issue resolved / request fulfilled — ready for Escalate if Needed
  (V07.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete field service" Expanded
  Subprocess: "Not resolved on site in 3 business days" → User task "Escalate to
  Service Operations Manager" → escalation end event "Escalated — field service
  not completed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Dispatch work order to field service partner" → Field Service Partner
- Field Service Partner → intermediate event "Partner reports completion"
- "Dispatch work order to field service partner" → Field Service System
- "Apply resolution and update case" → Field Service System

This stage determines and applies the resolution or fulfils the request —
dispatching field service where on-site work is needed (retried until resolved) —
and updates the case, leaving a resolved issue ready for the escalation check.
```

### V07.08 — Escalate if Needed

**BPMN diagram prompt.**

```text
BPMN: V07.08 Escalate if Needed — eighth stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Regulator" — the external party receiving statutory notifications.
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Complaints Management", "Legal / Risk".
- Pool "Workflow / Escalation System" — the supporting IT system.

2. Pool properties
- Regulator: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Workflow / Escalation System: black-box, System = true, single instance.

3. Layout
- Regulator pool at the top, Service Organisation pool in the middle,
  Workflow / Escalation System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Complaints Management lane:
- Message start event "Resolved case ready to check for escalation"
- Service task "Check SLA, severity and regulatory triggers"
- Exclusive gateway "Escalation required?"
    - branch "No – no escalation": End event "No escalation needed — ready for
      Communicate Outcome (V07.09)"
    - branch "Yes – escalate": continue to Legal / Risk
Legal / Risk lane:
- User task "Review escalation (legal, risk, regulatory)"
- Exclusive gateway "Regulatory reporting required?"
    - branch "Yes – notify regulator": Expanded Subprocess (LOOP marker)
      "Complete regulatory notification": internals — Send task "Submit
      notification to regulator", then intermediate message catch event
      "Regulator acknowledges / requests more", then exclusive gateway
      "Notification accepted?": branch "Yes" → subprocess end event "Notification
      accepted". The loop marker repeats while further information is required.
    - branch "No": continue
- Service task "Record escalation and actions"
- End event "Escalation handled — ready for Communicate Outcome (V07.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete regulatory notification"
  Expanded Subprocess: "Notification not accepted within statutory deadline" →
  User task "Escalate to Head of Compliance" → escalation end event "Escalated —
  regulatory notification not completed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check SLA, severity and regulatory triggers" → Workflow / Escalation System
- Workflow / Escalation System → "Review escalation (legal, risk, regulatory)"
  (SLA status, severity, escalation records)
- "Submit notification to regulator" → Regulator
- Regulator → intermediate event "Regulator acknowledges / requests more"
- "Record escalation and actions" → Workflow / Escalation System

This stage checks whether the case needs escalation — reviewing legal, risk and
regulatory triggers and completing any regulatory notification (retried until
accepted) — leaving an escalated or cleared case ready for outcome communication.
```

### V07.09 — Communicate Outcome

**BPMN diagram prompt.**

```text
BPMN: V07.09 Communicate Outcome — ninth stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Complainant / Customer / User" — the external party receiving the outcome.
- Pool "Service Organisation" — the organisation, with one lane: "Customer Service".
- Pool "Email / Correspondence System" — the supporting IT system.

2. Pool properties
- Complainant / Customer / User: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Email / Correspondence System: black-box, System = true, single instance.

3. Layout
- Complainant / Customer / User pool at the top, Service Organisation pool in the
  middle, Email / Correspondence System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Customer Service lane:
- Message start event "Case ready to communicate outcome"
- User task "Prepare outcome / resolution communication"
- Expanded Subprocess (LOOP marker) "Deliver outcome to customer": internals —
    Send task "Send resolution advice and any compensation / refund details",
    then intermediate message catch event "Customer acknowledges receipt", then
    exclusive gateway "Outcome received?": branch "Yes" → subprocess end event
    "Outcome delivered". The loop marker repeats the attempt while the outcome is
    unacknowledged.
- Service task "Record communication on case"
- End event "Outcome communicated — ready for Obtain Confirmation (V07.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Deliver outcome to customer" Expanded
  Subprocess: "No acknowledgement in 5 business days" → User task "Escalate to
  Customer Experience Manager" → escalation end event "Escalated — outcome not
  delivered in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Send resolution advice and any compensation / refund details" → Complainant /
  Customer / User
- Complainant / Customer / User → intermediate event "Customer acknowledges
  receipt"
- "Record communication on case" → Email / Correspondence System

This stage prepares and delivers the outcome to the customer — resolution advice
and any compensation or refund details (retried until acknowledged) — and records
the correspondence, leaving a communicated outcome ready for confirmation.
```

### V07.10 — Obtain Confirmation

**BPMN diagram prompt.**

```text
BPMN: V07.10 Obtain Confirmation — tenth stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Complainant / Customer / User" — the external party confirming the outcome.
- Pool "Service Organisation" — the organisation, with one lane: "Customer Service".
- Pool "Customer Portal" — the supporting IT system.

2. Pool properties
- Complainant / Customer / User: black-box, single instance.
- Service Organisation: white-box (holds the process flow).
- Customer Portal: black-box, System = true, single instance.

3. Layout
- Complainant / Customer / User pool at the top, Service Organisation pool in the
  middle, Customer Portal pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Customer Service lane:
- Message start event "Outcome communicated — awaiting confirmation"
- Send task "Request confirmation / satisfaction rating"
- Expanded Subprocess (LOOP marker) "Chase confirmation": internals — Send task
    "Remind customer to confirm", then intermediate message catch event "Customer
    responds", then exclusive gateway "Response received?": branch "Yes" →
    subprocess end event "Response received". The loop marker repeats the attempt
    while the confirmation is outstanding.
- Exclusive gateway "Customer satisfied?"
    - branch "No – not satisfied": End event "Not satisfied — re-opened, routed
      back to Resolve or Fulfil Request (V07.07)"
    - branch "Yes": continue
- Service task "Record confirmation and satisfaction"
- End event "Confirmation obtained — ready for Close Case (V07.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Chase confirmation" Expanded
  Subprocess: "No response in 10 business days" → User task "Escalate to Customer
  Service Lead" → escalation end event "Escalated — confirmation not obtained in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Request confirmation / satisfaction rating" → Complainant / Customer / User
- "Remind customer to confirm" → Complainant / Customer / User
- Complainant / Customer / User → intermediate event "Customer responds"
- "Record confirmation and satisfaction" → Customer Portal

This stage requests the customer's confirmation and satisfaction rating — chasing
a response where outstanding (retried until received) — re-opening to resolution
where the customer is not satisfied, and records the confirmation, leaving a
confirmed case ready for closure.
```

### V07.11 — Close Case

**BPMN diagram prompt.**

```text
BPMN: V07.11 Close Case — eleventh stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Service Operations", "Quality Assurance".
- Pool "Case Management System" — the supporting IT system.
- Pool "CRM System" — the supporting IT system.

2. Pool properties
- Service Organisation: white-box (holds the process flow).
- Case Management System: black-box, System = true, single instance.
- CRM System: black-box, System = true, single instance.

3. Layout
- Service Organisation pool at the top, Case Management System and CRM System
  pools at the bottom.

4. Lane contents in flow order (Service Organisation)
Service Operations lane:
- Message start event "Confirmed case ready to close"
- Expanded Subprocess (LOOP marker) "Complete closure checklist": internals —
    User task "Verify resolution, communications and approvals recorded", then
    exclusive gateway "Checklist complete?": branch "Yes" → subprocess end event
    "Closure checklist complete". The loop marker repeats the attempt while items
    are outstanding.
Quality Assurance lane:
- User task "Quality review and capture knowledge article"
- Service task "Apply resolution code and close case"
- Service task "Archive case records"
- End event "Case closed — ready for Analyse Trends (V07.12)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete closure checklist" Expanded
  Subprocess: "Not completed in 3 business days" → User task "Escalate to Service
  Operations Manager" → escalation end event "Escalated — case not closed in
  time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- Case Management System → "Verify resolution, communications and approvals
  recorded" (case status, actions, correspondence)
- "Apply resolution code and close case" → Case Management System
- "Apply resolution code and close case" → CRM System (resolution outcome on
  customer record)
- "Archive case records" → Case Management System

This stage completes the closure checklist (retried until complete), quality
reviews the case and captures a knowledge article, applies the resolution code
and archives the records — leaving a closed case ready for trend analysis.
```

### V07.12 — Analyse Trends

**BPMN diagram prompt.**

```text
BPMN: V07.12 Analyse Trends — final stage of the Issue to Resolution value chain.

1. Pools & Lanes
- Pool "Service Organisation" — the organisation, with two lanes top-to-bottom:
  "Quality Assurance", "Product / Engineering".
- Pool "Analytics / BI System" — the supporting IT system.

2. Pool properties
- Service Organisation: white-box (holds the process flow).
- Analytics / BI System: black-box, System = true, single instance.

3. Layout
- Service Organisation pool at the top, Analytics / BI System pool at the bottom.

4. Lane contents in flow order (Service Organisation)
Quality Assurance lane:
- Message start event "Closed cases ready for trend analysis"
- Service task "Extract case, resolution and SLA data"
- Service task "Analyse trends, recurring issues and root causes"
- Exclusive gateway "Systemic issue or improvement identified?"
    - branch "No – none": End event "No systemic issues — trend review noted,
      Issue to Resolution complete"
    - branch "Yes": continue to Product / Engineering
Product / Engineering lane:
- User task "Raise improvement / defect action and update knowledge base"
- Service task "Publish trend report and recommendations"
- End event "Trends analysed and actions raised — Issue to Resolution complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- "Extract case, resolution and SLA data" → Analytics / BI System
- Analytics / BI System → "Analyse trends, recurring issues and root causes"
  (dashboards, case and resolution data)
- "Publish trend report and recommendations" → Analytics / BI System

This stage extracts and analyses closed-case data for recurring issues and root
causes, raises improvement or defect actions and publishes a trend report where a
systemic issue is found — completing the end-to-end Issue to Resolution cycle.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V08 - Acquire to Retire (A2R)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V08.01. Identify Asset Need
V08.02. Approve Investment
V08.03. Acquire or Lease Asset
V08.04. Receive and Register Asset
V08.05. Deploy Asset
V08.06. Maintain Asset
V08.07. Monitor Utilisation and Condition
V08.08. Account for Depreciation
V08.09. Manage Impairments or Transfers
V08.10. Dispose / Sell / Write Off Asset
V08.11. Close Asset Record

This is the whole-of-life asset-management end-to-end process: an internal
asset need flows through investment approval, acquisition or lease, receipt
and registration, deployment, maintenance, utilisation and condition
monitoring, depreciation, impairment or transfer, disposal and record
closure. The main external participants are the Asset Seller / Supplier and
Lessor upstream and the Buyer at disposal, with Service Providers, the
Maintenance Contractor and the Insurer taking part across the asset's life.
The chain is triggered by an internal asset need (a capacity gap, a
replacement due, or a new project requirement), and the external interaction
begins when the asset is acquired or leased.
```

**Context diagram prompt.**

```text
Context Diagram: V08 — Acquire to Retire (A2R).

1. Central system (process-system)
A single central process/system ellipse named "Asset-Owning Company"
representing the whole organisation that runs the Acquire to Retire process. It
is the system in context: everything inside it — asset management, finance,
procurement, IT, facilities, operations, maintenance, legal, risk and the
supporting IT systems (ERP fixed asset register, procurement, enterprise asset
management, maintenance management, IT asset management, facilities management,
finance / general ledger, document management and reporting / BI) — is treated
as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Asset Seller
- Supplier
- Lessor
- Service Provider
- Maintenance Contractor
- Insurer
- Buyer

3. Layout
"Asset-Owning Company" sits in the centre. The acquisition-side parties sit to
the LEFT — Asset Seller, Supplier and Lessor (they supply or lease the asset).
Service Provider, Maintenance Contractor and Insurer sit ABOVE / around the
centre (they service, maintain and insure the asset in life). The Buyer sits to
the RIGHT (the disposal side that receives the asset at end of life). The demand
originates INSIDE the company (an internal asset need), so no external demand
actor sits alone. Every external entity connects directly to the central system
with labelled information flows; entities never connect to one another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Asset-Owning Company → Asset Seller: request for quote, specification,
  purchase order.
- Asset Seller → Asset-Owning Company: quote, specification, delivery details,
  warranty, invoice.
- Asset-Owning Company → Supplier: purchase order, delivery instructions,
  discrepancy notices.
- Supplier → Asset-Owning Company: order acknowledgement, delivery details,
  warranties, service records, invoices.
- Asset-Owning Company → Lessor: lease request, terms acceptance, lease
  payments.
- Lessor → Asset-Owning Company: lease proposal, lease terms, lease schedule
  and conditions.
- Asset-Owning Company → Service Provider: installation / commissioning
  request, service order.
- Service Provider → Asset-Owning Company: installation / commissioning
  confirmation, service records.
- Asset-Owning Company → Maintenance Contractor: work order, dispatch,
  condition-assessment request.
- Maintenance Contractor → Asset-Owning Company: inspection reports, repair
  records, condition assessments.
- Asset-Owning Company → Insurer: cover request, claim, disposal / write-off
  notice.
- Insurer → Asset-Owning Company: insurance cover, claim settlement,
  confirmation.
- Asset-Owning Company → Buyer: asset details, sale terms, transfer
  documentation, ownership / disposal records.
- Buyer → Asset-Owning Company: offer / acceptance, payment, transfer
  confirmation.

This Context Diagram frames the Asset-Owning Company as a single system in
context: an internal asset need drives the Acquire to Retire process, the Asset
Seller / Supplier and Lessor provide or lease the asset, the Service Provider,
Maintenance Contractor and Insurer service, maintain and insure it in life, and
the Buyer receives it at disposal. The seven external entities are exactly the
external actors of the Process Context diagram below, so the two views stay
consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V08 — Acquire to Retire (A2R).

1. System boundary and processes
A system boundary named "V08 — Acquire to Retire" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V08.01 Identify Asset Need
- V08.02 Approve Investment
- V08.03 Acquire or Lease Asset
- V08.04 Receive and Register Asset
- V08.05 Deploy Asset
- V08.06 Maintain Asset
- V08.07 Monitor Utilisation and Condition
- V08.08 Account for Depreciation
- V08.09 Manage Impairments or Transfers
- V08.10 Dispose / Sell / Write Off Asset
- V08.11 Close Asset Record

2. Participants (outside the boundary)
External actors (actor):
- Asset Seller
- Supplier
- Lessor
- Service Provider
- Maintenance Contractor
- Insurer
- Buyer
Internal teams (team):
- Operations
- Asset Management
- Investment Approver
- Finance
- Procurement
- Legal
- Facilities / Receiving
- IT / Facilities
- Maintenance
- Risk
- Disposal Coordination
IT systems (system):
- Enterprise Asset Management System
- Finance / General Ledger System
- Procurement System
- ERP Fixed Asset Register
- IT Asset Management System / Facilities Management System
- Maintenance Management System
- Reporting / BI System
- Document Management System

3. Layout
The processes sit inside the boundary in V08.01 → V08.11 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V08.01 Identify Asset Need — Operations (raise need), Asset Management
  (confirm asset class & budget); Enterprise Asset Management System (existing
  assets & register).
- V08.02 Approve Investment — Asset Management (prepare case), Investment
  Approver (approve), Finance (commitment); Finance / General Ledger System
  (capital budget & commitment).
- V08.03 Acquire or Lease Asset — Asset Seller, Supplier (quote & supply),
  Lessor (lease terms); Procurement (source & order), Legal (contract / lease);
  Procurement System (order & contract).
- V08.04 Receive and Register Asset — Supplier (deliver), Insurer (arrange
  cover); Facilities / Receiving (receipt & tag), Asset Management (register);
  ERP Fixed Asset Register (asset master data).
- V08.05 Deploy Asset — Service Provider (install / commission); IT / Facilities
  (assign & commission), Operations (accept into use); IT Asset Management
  System / Facilities Management System (deployment record).
- V08.06 Maintain Asset — Maintenance Contractor (repair & service); Maintenance
  (work orders), Operations (return to service); Maintenance Management System
  (work orders & history).
- V08.07 Monitor Utilisation and Condition — Maintenance Contractor (condition
  assessments); Operations (collect data), Asset Management (analyse);
  Reporting / BI System (utilisation & condition data).
- V08.08 Account for Depreciation — Finance (run & post depreciation); ERP Fixed
  Asset Register (depreciation calculation & postings).
- V08.09 Manage Impairments or Transfers — Insurer (claim settlement); Asset
  Management (assess), Risk (classify), Finance (adjust); Finance / General
  Ledger System (carrying value & adjustment).
- V08.10 Dispose / Sell / Write Off Asset — Buyer (offer & transfer), Insurer
  (write-off notice); Disposal Coordination (method), Legal (terms & documents),
  Finance (proceeds & gain / loss); Document Management System (sale & disposal
  records).
- V08.11 Close Asset Record — Asset Management, Finance (verify, finalise,
  archive); ERP Fixed Asset Register, Finance / General Ledger System (status &
  close).

This Process Context diagram frames the whole Acquire to Retire value chain: the
eleven subprocesses inside the boundary, the external actors (Asset Seller,
Supplier, Lessor, Service Provider, Maintenance Contractor, Insurer, Buyer) and
internal teams that perform them, and the IT systems that support them —
consistent with the per-process BPMN prompts below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Asset Management Organisation" pool (key role in brackets), and IT
systems are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V08.01** Identify Asset Need | — | Operations (operations manager), Asset Management (asset manager) | Enterprise Asset Management System |
| **V08.02** Approve Investment | — | Asset Management (asset manager), Investment Approver (budget holder), Finance (finance accountant) | Finance / General Ledger System |
| **V08.03** Acquire or Lease Asset | Asset Seller, Supplier, Lessor | Procurement (procurement officer), Legal (legal counsel) | Procurement System |
| **V08.04** Receive and Register Asset | Supplier, Insurer | Facilities / Receiving (facilities manager), Asset Management (asset manager) | ERP Fixed Asset Register |
| **V08.05** Deploy Asset | Service Provider | IT / Facilities (IT asset manager), Operations (operations manager) | IT Asset Management System / Facilities Management System |
| **V08.06** Maintain Asset | Maintenance Contractor | Maintenance (maintenance planner), Operations (operations manager) | Maintenance Management System |
| **V08.07** Monitor Utilisation and Condition | Maintenance Contractor | Operations (operations manager), Asset Management (asset manager) | Reporting / BI System |
| **V08.08** Account for Depreciation | — | Finance (depreciation accountant) | ERP Fixed Asset Register |
| **V08.09** Manage Impairments or Transfers | Insurer | Asset Management (asset manager), Risk (risk officer), Finance (finance accountant) | Finance / General Ledger System |
| **V08.10** Dispose / Sell / Write Off Asset | Buyer, Insurer | Disposal Coordination (disposal coordinator), Legal (legal counsel), Finance (finance accountant) | Document Management System |
| **V08.11** Close Asset Record | — | Asset Management (asset manager), Finance (finance accountant) | ERP Fixed Asset Register, Finance / General Ledger System |

**Actor / Team / System roll-up** (every distinct participant across V08):

- **External actors:** Asset Seller (V08.03); Supplier (V08.03, V08.04); Lessor (V08.03); Service Provider (V08.05); Maintenance Contractor (V08.06, V08.07); Insurer (V08.04, V08.09, V08.10); Buyer (V08.10).
- **Teams:** Operations (V08.01, V08.05, V08.06, V08.07); Asset Management (V08.01, V08.02, V08.04, V08.07, V08.09, V08.11); Investment Approver (V08.02); Finance (V08.02, V08.08, V08.09, V08.10, V08.11); Procurement (V08.03); Legal (V08.03, V08.10); Facilities / Receiving (V08.04); IT / Facilities (V08.05); Maintenance (V08.06); Risk (V08.09); Disposal Coordination (V08.10).
- **IT systems:** Enterprise Asset Management System (V08.01); Finance / General Ledger System (V08.02, V08.09, V08.11); Procurement System (V08.03); ERP Fixed Asset Register (V08.04, V08.08, V08.11); IT Asset Management System / Facilities Management System (V08.05); Maintenance Management System (V08.06); Reporting / BI System (V08.07); Document Management System (V08.10).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Acquire to Retire service area. It
shows the **Actors**, **Services**, **Processes**, **Interfaces** and
**Applications** that provide the Asset Lifecycle Service and the related
supplier-, contractor- and buyer-facing services across the eleven V08
processes. Each Business Process is a drill-down anchor: link it to the matching
V08.nn BPMN diagram and its marker turns green.

```text
ArchiMate: V08 — Acquire to Retire — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Asset Lifecycle Service and the
related services (to the internal asset owners and to the Asset Seller /
Supplier, Lessor, Service Provider, Maintenance Contractor, Insurer and Buyer)
across the eleven V08 Acquire to Retire processes, and the applications that
support them. Lay it out in three horizontal bands, top to bottom — BUSINESS
SERVICES → BUSINESS PROCESSES → APPLICATIONS — with the internal Operations /
Asset Management on the far left and the supply, service and disposal actors on
the far right. Read top-to-bottom as service → process → application (ArchiMate
service realisation).

1. Business Actors (Business Actor)
- Asset Management — the internal party the asset lifecycle service is provided
  to (far left, the owner of every asset need).
- Asset Seller, Supplier, Lessor — external parties that supply or lease the
  asset (far right, acquisition side).
- Service Provider, Maintenance Contractor, Insurer — external parties that
  install, maintain and insure the asset in life (far right).
- Buyer — the external party that receives the asset at disposal (far right,
  retirement side).

2. Interfaces
- Business Interface "Supplier & Contractor Portal / Asset Channel" — the
  channel the Supplier, Lessor, Service Provider, Maintenance Contractor,
  Insurer and Buyer use to quote, supply, service, insure and take title. Those
  actors ACCESS this interface; the interface SERVES the business services
  below.
- Application Interfaces (optional, only the few the portal calls): "Procurement
  API" on the Procurement System, "Work Order API" on the Maintenance
  Management System.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in asset-lifecycle order:
- Asset Planning & Approval Service — identify the need, approve the investment.
- Asset Acquisition Service — buy or lease the asset.
- Asset Onboarding Service — receive, register and deploy the asset.
- Asset Operation & Maintenance Service — maintain and monitor the asset in
  service.
- Asset Accounting Service — depreciate, impair and transfer the asset.
- Asset Retirement Service — dispose of the asset and close its record.

4. Business Processes (Business Process) — the eleven V08 processes, middle band
   in V08.01 → V08.11 order. Each REALISES the business service shown and is the
   link anchor to its BPMN diagram:
- V08.01 Identify Asset Need                 -> realises Asset Planning & Approval Service
- V08.02 Approve Investment                  -> realises Asset Planning & Approval Service
- V08.03 Acquire or Lease Asset              -> realises Asset Acquisition Service
- V08.04 Receive and Register Asset          -> realises Asset Onboarding Service
- V08.05 Deploy Asset                        -> realises Asset Onboarding Service
- V08.06 Maintain Asset                      -> realises Asset Operation & Maintenance Service
- V08.07 Monitor Utilisation and Condition   -> realises Asset Operation & Maintenance Service
- V08.08 Account for Depreciation            -> realises Asset Accounting Service
- V08.09 Manage Impairments or Transfers     -> realises Asset Accounting Service
- V08.10 Dispose / Sell / Write Off Asset    -> realises Asset Retirement Service
- V08.11 Close Asset Record                  -> realises Asset Retirement Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Enterprise Asset Management System
- Finance / General Ledger System
- Procurement System
- ERP Fixed Asset Register
- IT Asset Management System / Facilities Management System
- Maintenance Management System
- Reporting / BI System
- Document Management System

6. Relationships
- Asset Seller / Supplier, Lessor, Service Provider, Maintenance Contractor,
  Insurer and Buyer -accesses-> Supplier & Contractor Portal / Asset Channel.
- Supplier & Contractor Portal / Asset Channel -serving-> the Acquisition,
  Onboarding, Operation & Maintenance, Accounting and Retirement services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V08.01 <- Enterprise Asset Management System;  V08.02 <- Finance / General Ledger System;
    V08.03 <- Procurement System;                  V08.04 <- ERP Fixed Asset Register;
    V08.05 <- IT Asset Management / Facilities Mgmt System; V08.06 <- Maintenance Management System;
    V08.07 <- Reporting / BI System;               V08.08 <- ERP Fixed Asset Register;
    V08.09 <- Finance / General Ledger System;      V08.10 <- Document Management System;
    V08.11 <- ERP Fixed Asset Register + Finance / General Ledger System.
- Maintenance Contractor -serving-> V08.06 Maintain Asset and V08.07 Monitor
  Utilisation and Condition.
- Insurer -serving-> V08.04 Receive and Register Asset, V08.09 Manage
  Impairments or Transfers and V08.10 Dispose / Sell / Write Off Asset.
- Buyer -serving-> V08.10 Dispose / Sell / Write Off Asset.

7. Intent
The Asset Lifecycle Service sits top-centre as the headline service. The eleven
Business Processes form the backbone in V08.01 -> V08.11 order so the reader can
trace the asset's whole-of-life journey and drill from any process straight into
its detailed BPMN model. This one ArchiMate view therefore links to all eleven
V08 BPMN process diagrams. The mapping of process -> actors/teams/applications is
the Process <-> Actors / Teams / IT Systems matrix above.
```

### V08.01 — Identify Asset Need

**BPMN diagram prompt.**

```text
BPMN: V08.01 Identify Asset Need — first stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Asset Management Organisation" — the organisation running the process,
  with two lanes top-to-bottom: "Operations", "Asset Management".
- Pool "Enterprise Asset Management System" — the supporting IT system.

2. Pool properties
- Asset Management Organisation: white-box (holds the process flow).
- Enterprise Asset Management System: black-box, System = true, single instance.

3. Layout
- Asset Management Organisation pool at the top, Enterprise Asset Management
  System pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Operations lane:
- Conditional start event "Asset need identified" (capacity gap, replacement
  due, or new project requirement)
- Expanded Subprocess (LOOP marker) "Complete asset requirement details":
    internals — User task "Define asset requirement (specification, quantity,
    capex estimate)", then exclusive gateway "Requirement complete?": branch
    "Yes" → subprocess end event "Requirement complete". The loop marker repeats
    the attempt while the requirement is incomplete.
- Service task "Check asset register / existing assets"
- Exclusive gateway "Existing asset available / reusable?"
    - branch "Yes – redeploy existing": End event "Redeploy existing asset —
      route to Deploy Asset (V08.05)"
    - branch "No – new asset needed": continue to Asset Management
Asset Management lane:
- Service task "Confirm asset class and budget code"
- End event "Asset need defined — ready for Approve Investment (V08.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete asset requirement details"
  Expanded Subprocess: "Requirement not completed in 3 business days" → User
  task "Escalate to Asset Manager" → escalation end event "Escalated — asset
  need not defined in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check asset register / existing assets" → Enterprise Asset Management System
- Enterprise Asset Management System → "Confirm asset class and budget code"
  (existing assets, asset classes, budget code)

This is the internal entry point of A2R: an asset need is raised and its
requirement fully defined (retried until complete), checked against the asset
register and existing assets, and confirmed against an asset class and budget
code — leaving a defined need ready to become an investment case.
```

### V08.02 — Approve Investment

**BPMN diagram prompt.**

```text
BPMN: V08.02 Approve Investment — second stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Asset Management Organisation" — the organisation, with three lanes
  top-to-bottom: "Asset Management", "Investment Approver", "Finance".
- Pool "Finance / General Ledger System" — the supporting IT system.

2. Pool properties
- Asset Management Organisation: white-box (holds the process flow).
- Finance / General Ledger System: black-box, System = true, single instance.

3. Layout
- Asset Management Organisation pool at the top, Finance / General Ledger System
  pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Asset Management lane:
- Message start event "Defined asset need received"
- User task "Prepare investment case (business case, whole-of-life cost)"
- Service task "Check capital budget availability"
Investment Approver lane:
- Exclusive gateway "Within delegation & capex budget?"
    - branch "Approved": continue to Finance
    - branch "Refer – needs rework": Expanded Subprocess (LOOP marker) "Revise
      and re-submit investment case": internals — User task "Revise business
      case / justification", then User task "Re-submit for approval", then
      exclusive gateway "Approved now?": branch "Yes" → subprocess end event
      "Approved". The loop marker repeats while approval is withheld.
    - branch "Rejected": End event "Investment rejected — asset need closed"
Finance lane:
- Service task "Record approval and capital commitment"
- End event "Investment approved — ready for Acquire or Lease Asset (V08.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Revise and re-submit investment
  case" Expanded Subprocess: "Not approved in 5 business days" → User task
  "Escalate to Finance Controller" → escalation end event "Escalated —
  investment not approved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check capital budget availability" → Finance / General Ledger System
- Finance / General Ledger System → "Within delegation & capex budget?" (budget
  balance, delegation limits, existing commitments)
- "Record approval and capital commitment" → Finance / General Ledger System

This stage builds the investment case, checks capital budget and delegation and
approves the spend — reworking and re-submitting where referred, rejecting where
out of policy — leaving an approved, committed investment ready to acquire.
```

### V08.03 — Acquire or Lease Asset

**BPMN diagram prompt.**

```text
BPMN: V08.03 Acquire or Lease Asset — third stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Asset Seller / Supplier" — the external party that sells or supplies the asset.
- Pool "Lessor" — the external party that leases the asset.
- Pool "Asset Management Organisation" — the organisation, with two lanes
  top-to-bottom: "Procurement", "Legal".
- Pool "Procurement System" — the supporting IT system.

2. Pool properties
- Asset Seller / Supplier: black-box, single instance.
- Lessor: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- Procurement System: black-box, System = true, single instance.

3. Layout
- Asset Seller / Supplier and Lessor pools at the top, Asset Management
  Organisation pool in the middle, Procurement System pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Procurement lane:
- Message start event "Approved investment received"
- Service task "Select acquisition route (buy vs lease)"
- Service task "Request quotes / lease proposals"
Legal lane:
- User task "Review contract / lease terms"
- Exclusive gateway "Terms acceptable?"
    - branch "Yes": continue to Procurement
    - branch "No – negotiate": Expanded Subprocess (LOOP marker) "Negotiate
      purchase / lease terms": internals — Send task "Send terms to seller /
      lessor", then intermediate message catch event "Seller / lessor responds
      (accept / counter)", then exclusive gateway "Terms agreed?": branch "Yes"
      → subprocess end event "Terms agreed". The loop marker repeats the
      counter-offer exchange while terms are not agreed.
Procurement lane:
- Send task "Place order / sign lease"
- Intermediate message catch event "Order / lease confirmation received"
- End event "Asset acquired / leased — ready for Receive and Register Asset
  (V08.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Negotiate purchase / lease terms"
  Expanded Subprocess: "No agreement in 10 business days" → User task "Escalate
  to Category Manager" → escalation end event "Escalated — acquisition terms not
  agreed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Request quotes / lease proposals" → Asset Seller / Supplier
- "Request quotes / lease proposals" → Lessor
- "Send terms to seller / lessor" → Asset Seller / Supplier
- "Send terms to seller / lessor" → Lessor
- Asset Seller / Supplier → intermediate event "Seller / lessor responds
  (accept / counter)"
- Lessor → intermediate event "Seller / lessor responds (accept / counter)"
- "Place order / sign lease" → Asset Seller / Supplier
- "Place order / sign lease" → Procurement System
- Asset Seller / Supplier → intermediate event "Order / lease confirmation
  received"

This stage selects the acquisition route, sources quotes or lease proposals,
negotiates terms where they are not acceptable (negotiated until agreed), and
places the order or signs the lease through the procurement system — leaving a
confirmed acquisition ready for receipt and registration.
```

### V08.04 — Receive and Register Asset

**BPMN diagram prompt.**

```text
BPMN: V08.04 Receive and Register Asset — fourth stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Supplier" — the external party delivering the asset.
- Pool "Insurer" — the external party providing insurance cover.
- Pool "Asset Management Organisation" — the organisation, with two lanes
  top-to-bottom: "Facilities / Receiving", "Asset Management".
- Pool "ERP Fixed Asset Register" — the supporting IT system.

2. Pool properties
- Supplier: black-box, single instance.
- Insurer: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- ERP Fixed Asset Register: black-box, System = true, single instance.

3. Layout
- Supplier and Insurer pools at the top, Asset Management Organisation pool in
  the middle, ERP Fixed Asset Register pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Facilities / Receiving lane:
- Message start event "Asset delivery notified"
- Service task "Receive and inspect asset"
- User task "Tag asset (asset tag / serial number)"
- Exclusive gateway "Delivery matches order & acceptable?"
    - branch "No – discrepancy / damage": Expanded Subprocess (LOOP marker)
      "Resolve delivery discrepancy": internals — User task "Log discrepancy",
      then Send task "Notify supplier of discrepancy", then intermediate message
      catch event "Supplier responds (replace / credit)", then exclusive gateway
      "Resolved?": branch "Yes" → subprocess end event "Discrepancy resolved".
      The loop marker repeats while the discrepancy is unresolved.
    - branch "Yes": continue to Asset Management
Asset Management lane:
- Service task "Register asset in fixed asset register (master data, custodian,
  location)"
- Send task "Arrange insurance cover"
- End event "Asset received and registered — ready for Deploy Asset (V08.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve delivery discrepancy"
  Expanded Subprocess: "Not resolved in 5 business days" → User task "Escalate
  to Procurement" → escalation end event "Escalated — delivery discrepancy not
  resolved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Supplier → start event "Asset delivery notified" (delivery details, warranty)
- "Notify supplier of discrepancy" → Supplier
- Supplier → intermediate event "Supplier responds (replace / credit)"
- "Register asset in fixed asset register (master data, custodian, location)" →
  ERP Fixed Asset Register
- "Arrange insurance cover" → Insurer

This stage receives and inspects the asset, tags it, resolves any delivery
discrepancy with the supplier (retried until cleared), registers it in the fixed
asset register and arranges insurance cover — leaving a registered, insured
asset ready for deployment.
```

### V08.05 — Deploy Asset

**BPMN diagram prompt.**

```text
BPMN: V08.05 Deploy Asset — fifth stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Service Provider" — the external party installing / commissioning the asset.
- Pool "Asset Management Organisation" — the organisation, with two lanes
  top-to-bottom: "IT / Facilities", "Operations".
- Pool "IT Asset Management System / Facilities Management System" — the
  supporting IT system.

2. Pool properties
- Service Provider: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- IT Asset Management System / Facilities Management System: black-box,
  System = true, single instance.

3. Layout
- Service Provider pool at the top, Asset Management Organisation pool in the
  middle, IT Asset Management System / Facilities Management System pool at the
  bottom.

4. Lane contents in flow order (Asset Management Organisation)
IT / Facilities lane:
- Message start event "Registered asset ready to deploy"
- Service task "Assign asset to custodian / location"
- User task "Install / commission asset"
- Exclusive gateway "Commissioning successful?"
    - branch "No – commissioning issue": Expanded Subprocess (LOOP marker)
      "Resolve commissioning issue": internals — User task "Diagnose issue",
      then Send task "Request service provider support", then intermediate
      message catch event "Service provider responds", then exclusive gateway
      "Commissioned?": branch "Yes" → subprocess end event "Commissioning
      complete". The loop marker repeats while commissioning fails.
    - branch "Yes": continue to Operations
Operations lane:
- User task "Accept asset into operational use"
- Service task "Update deployment status"
- End event "Asset deployed — ready for Maintain Asset (V08.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve commissioning issue"
  Expanded Subprocess: "Not commissioned in 5 business days" → User task
  "Escalate to Operations Manager" → escalation end event "Escalated — asset not
  commissioned in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Assign asset to custodian / location" → IT Asset Management System /
  Facilities Management System
- "Request service provider support" → Service Provider
- Service Provider → intermediate event "Service provider responds"
- "Update deployment status" → IT Asset Management System / Facilities
  Management System

This stage assigns the asset to a custodian and location, installs and
commissions it, resolves any commissioning issue with the service provider
(retried until commissioned), and accepts it into operational use — leaving a
live asset ready for maintenance.
```

### V08.06 — Maintain Asset

**BPMN diagram prompt.**

```text
BPMN: V08.06 Maintain Asset — sixth stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Maintenance Contractor" — the external party carrying out repairs / service.
- Pool "Asset Management Organisation" — the organisation, with two lanes
  top-to-bottom: "Maintenance", "Operations".
- Pool "Maintenance Management System" — the supporting IT system.

2. Pool properties
- Maintenance Contractor: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- Maintenance Management System: black-box, System = true, single instance.

3. Layout
- Maintenance Contractor pool at the top, Asset Management Organisation pool in
  the middle, Maintenance Management System pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Maintenance lane:
- Message start event "Asset in service — maintenance due"
- Service task "Raise maintenance work order"
- User task "Carry out maintenance / inspection"
- Exclusive gateway "Fault found requiring rectification?"
    - branch "Yes – rectify": Expanded Subprocess (LOOP marker) "Resolve
      maintenance fault": internals — User task "Assess fault", then Send task
      "Dispatch to maintenance contractor", then intermediate message catch
      event "Contractor responds (repair complete)", then exclusive gateway
      "Fault rectified?": branch "Yes" → subprocess end event "Fault rectified".
      The loop marker repeats while the fault persists.
    - branch "No – routine only": continue to Operations
Operations lane:
- Service task "Confirm asset returned to service"
- Service task "Update maintenance history / work order"
- End event "Asset maintained — ready for Monitor Utilisation and Condition
  (V08.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve maintenance fault" Expanded
  Subprocess: "Fault not rectified within agreed SLA" → User task "Escalate to
  Maintenance Manager" → escalation end event "Escalated — maintenance fault not
  rectified in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Raise maintenance work order" → Maintenance Management System
- "Dispatch to maintenance contractor" → Maintenance Contractor
- Maintenance Contractor → intermediate event "Contractor responds (repair
  complete)"
- Maintenance Contractor → "Update maintenance history / work order" (repair
  records)
- "Update maintenance history / work order" → Maintenance Management System

This stage raises the maintenance work order, carries out the maintenance or
inspection, rectifies any fault with the maintenance contractor (retried until
fixed), and returns the asset to service — leaving a maintained asset ready for
utilisation and condition monitoring.
```

### V08.07 — Monitor Utilisation and Condition

**BPMN diagram prompt.**

```text
BPMN: V08.07 Monitor Utilisation and Condition — seventh stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Maintenance Contractor" — the external party providing condition assessments.
- Pool "Asset Management Organisation" — the organisation, with two lanes
  top-to-bottom: "Operations", "Asset Management".
- Pool "Reporting / BI System" — the supporting IT system.

2. Pool properties
- Maintenance Contractor: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- Reporting / BI System: black-box, System = true, single instance.

3. Layout
- Maintenance Contractor pool at the top, Asset Management Organisation pool in
  the middle, Reporting / BI System pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Operations lane:
- Message start event "Monitoring cycle due"
- Service task "Collect utilisation and condition data"
Asset Management lane:
- Service task "Analyse utilisation and condition"
- Exclusive gateway "Condition within target?"
    - branch "No – condition exception": Expanded Subprocess (LOOP marker)
      "Resolve condition exception": internals — User task "Investigate
      condition alert", then Send task "Request contractor condition
      assessment", then intermediate message catch event "Contractor provides
      assessment", then exclusive gateway "Exception cleared?": branch "Yes" →
      subprocess end event "Exception cleared". The loop marker repeats while the
      exception is open.
    - branch "Yes": continue
- Service task "Record review outcome / update asset status"
- End event "Utilisation and condition reviewed — ready for Account for
  Depreciation (V08.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve condition exception"
  Expanded Subprocess: "Assessment not received in 5 business days" → User task
  "Escalate to Asset Manager" → escalation end event "Escalated — condition
  exception not cleared in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Collect utilisation and condition data" → Reporting / BI System
- Reporting / BI System → "Analyse utilisation and condition" (utilisation,
  condition and performance data)
- "Request contractor condition assessment" → Maintenance Contractor
- Maintenance Contractor → intermediate event "Contractor provides assessment"
- "Record review outcome / update asset status" → Reporting / BI System

This stage collects and analyses utilisation and condition data, resolves any
condition exception with the maintenance contractor (retried until cleared), and
records the review outcome — leaving a reviewed asset ready for depreciation
accounting.
```

### V08.08 — Account for Depreciation

**BPMN diagram prompt.**

```text
BPMN: V08.08 Account for Depreciation — eighth stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Asset Management Organisation" — the organisation, with one lane: "Finance".
- Pool "ERP Fixed Asset Register" — the supporting IT system.

2. Pool properties
- Asset Management Organisation: white-box (holds the process flow).
- ERP Fixed Asset Register: black-box, System = true, single instance.

3. Layout
- Asset Management Organisation pool at the top, ERP Fixed Asset Register pool at
  the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Finance lane:
- Message start event "Depreciation run due (period close)"
- Service task "Run depreciation calculation"
- Service task "Review depreciation postings"
- Exclusive gateway "Postings correct?"
    - branch "No – exception": Expanded Subprocess (LOOP marker) "Correct
      depreciation exception": internals — User task "Investigate exception
      (rate, useful life, cost)", then User task "Adjust asset parameters", then
      exclusive gateway "Corrected?": branch "Yes" → subprocess end event
      "Exception corrected". The loop marker repeats while the exception is
      unresolved.
    - branch "Yes": continue
- Service task "Post depreciation to ledger"
- End event "Depreciation posted — ready for Manage Impairments or Transfers
  (V08.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Correct depreciation exception"
  Expanded Subprocess: "Not corrected in 2 business days" → User task "Escalate
  to Financial Controller" → escalation end event "Escalated — depreciation
  exception not corrected in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Run depreciation calculation" → ERP Fixed Asset Register
- ERP Fixed Asset Register → "Review depreciation postings" (asset values,
  useful lives, accumulated depreciation)
- "Post depreciation to ledger" → ERP Fixed Asset Register

This stage runs the periodic depreciation calculation, reviews the postings and
corrects any exception in rate, life or cost (retried until corrected), and
posts depreciation to the ledger — leaving accurate carrying values ready for
impairment and transfer assessment.
```

### V08.09 — Manage Impairments or Transfers

**BPMN diagram prompt.**

```text
BPMN: V08.09 Manage Impairments or Transfers — ninth stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Insurer" — the external party settling any insurance claim.
- Pool "Asset Management Organisation" — the organisation, with three lanes
  top-to-bottom: "Asset Management", "Risk", "Finance".
- Pool "Finance / General Ledger System" — the supporting IT system.

2. Pool properties
- Insurer: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- Finance / General Ledger System: black-box, System = true, single instance.

3. Layout
- Insurer pool at the top, Asset Management Organisation pool in the middle,
  Finance / General Ledger System pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Asset Management lane:
- Message start event "Impairment / transfer trigger raised" (damage,
  obsolescence, relocation, or revaluation)
- Service task "Assess impairment / transfer"
Risk lane:
- Exclusive gateway "Action type?"
    - branch "No change required": End event "No adjustment — ready for Dispose /
      Sell / Write Off Asset (V08.10)"
    - branch "Impairment / loss": continue to Asset Management (claim)
    - branch "Transfer / reclassification": continue to Finance
Asset Management lane:
- Expanded Subprocess (LOOP marker) "Resolve impairment / insurance claim":
    internals — User task "Prepare impairment assessment / claim", then Send task
    "Submit claim to insurer", then intermediate message catch event "Insurer
    responds", then exclusive gateway "Settled / confirmed?": branch "Yes" →
    subprocess end event "Claim settled". The loop marker repeats while the claim
    is open. On settlement, continue to Finance.
Finance lane:
- User task "Record impairment / transfer adjustment"
- Service task "Update asset value and ledger"
- End event "Impairment / transfer accounted — ready for Dispose / Sell / Write
  Off Asset (V08.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve impairment / insurance
  claim" Expanded Subprocess: "Not resolved in 5 business days" → User task
  "Escalate to Finance Controller" → escalation end event "Escalated — impairment
  claim not resolved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Finance / General Ledger System → "Assess impairment / transfer" (carrying
  value, useful life, history)
- "Submit claim to insurer" → Insurer
- Insurer → intermediate event "Insurer responds"
- "Update asset value and ledger" → Finance / General Ledger System

This stage assesses the impairment or transfer trigger, resolves any insurance
claim with the insurer (retried until settled), records the adjustment or
reclassification and updates the ledger — leaving an accurately valued asset
ready for the disposal decision.
```

### V08.10 — Dispose / Sell / Write Off Asset

**BPMN diagram prompt.**

```text
BPMN: V08.10 Dispose / Sell / Write Off Asset — tenth stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Buyer" — the external party that buys or receives the disposed asset.
- Pool "Insurer" — the external party notified of a write-off.
- Pool "Asset Management Organisation" — the organisation, with three lanes
  top-to-bottom: "Disposal Coordination", "Legal", "Finance".
- Pool "Document Management System" — the supporting IT system.

2. Pool properties
- Buyer: black-box, single instance.
- Insurer: black-box, single instance.
- Asset Management Organisation: white-box (holds the process flow).
- Document Management System: black-box, System = true, single instance.

3. Layout
- Buyer and Insurer pools at the top, Asset Management Organisation pool in the
  middle, Document Management System pool at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Disposal Coordination lane:
- Message start event "Asset flagged for disposal" (end of life, surplus, or
  write-off)
- Service task "Determine disposal method (sale / transfer / write-off / scrap)"
- Exclusive gateway "Disposal method?"
    - branch "Write-off / scrap": continue to Finance
    - branch "Sale / transfer": continue to Legal
Legal lane:
- Expanded Subprocess (LOOP marker) "Agree sale / transfer terms with buyer":
    internals — Send task "Send sale / transfer terms to buyer", then
    intermediate message catch event "Buyer responds (accept / counter)", then
    exclusive gateway "Terms agreed?": branch "Yes" → subprocess end event
    "Terms agreed". The loop marker repeats the counter-offer exchange while
    terms are not agreed.
- User task "Prepare transfer / disposal documentation"
Finance lane:
- Service task "Record disposal, proceeds and gain / loss"
- Send task "Notify insurer of disposal / write-off"
- Send task "Confirm ownership transfer / disposal to buyer"
- End event "Asset disposed — ready for Close Asset Record (V08.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Agree sale / transfer terms with
  buyer" Expanded Subprocess: "No agreement in 10 business days" → User task
  "Escalate to Disposal Manager" → escalation end event "Escalated — disposal
  terms not agreed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Send sale / transfer terms to buyer" → Buyer
- Buyer → intermediate event "Buyer responds (accept / counter)"
- "Prepare transfer / disposal documentation" → Document Management System
- "Record disposal, proceeds and gain / loss" → Document Management System
- "Notify insurer of disposal / write-off" → Insurer
- "Confirm ownership transfer / disposal to buyer" → Buyer

This stage determines the disposal method, agrees sale or transfer terms with
the buyer where the asset is sold (negotiated until agreed), prepares the
transfer documentation, records the disposal, proceeds and gain or loss, and
notifies the insurer and buyer — leaving a disposed asset ready for record
closure.
```

### V08.11 — Close Asset Record

**BPMN diagram prompt.**

```text
BPMN: V08.11 Close Asset Record — final stage of the Acquire to Retire (A2R) value chain.

1. Pools & Lanes
- Pool "Asset Management Organisation" — the organisation, with two lanes
  top-to-bottom: "Asset Management", "Finance".
- Pool "ERP Fixed Asset Register" — a supporting IT system.
- Pool "Finance / General Ledger System" — a supporting IT system.

2. Pool properties
- Asset Management Organisation: white-box (holds the process flow).
- ERP Fixed Asset Register: black-box, System = true, single instance.
- Finance / General Ledger System: black-box, System = true, single instance.

3. Layout
- Asset Management Organisation pool at the top, ERP Fixed Asset Register and
  Finance / General Ledger System pools at the bottom.

4. Lane contents in flow order (Asset Management Organisation)
Asset Management lane:
- Message start event "Asset ready for record closure"
- Service task "Verify asset deployed, maintained, depreciated and disposed"
- Exclusive gateway "All complete & no open items?"
    - branch "No – open item": User task "Return to responsible stage", then
      End event "Re-opened — routed back to the open stage"
    - branch "Yes": continue to Finance
Finance lane:
- Service task "Finalise retirement and close asset in register"
- Service task "Archive asset records"
- End event "Asset record closed — Acquire to Retire complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- ERP Fixed Asset Register → "Verify asset deployed, maintained, depreciated and
  disposed" (lifecycle status, depreciation and disposal records)
- "Finalise retirement and close asset in register" → ERP Fixed Asset Register
- "Archive asset records" → Finance / General Ledger System

This stage confirms every prior step is complete with no open items, finalises
the asset's retirement, closes it in the fixed asset register, archives the
records and posts the final accounting position — completing the end-to-end
Acquire to Retire cycle.
```

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

**Value Chain diagram prompt.**

```text
Value Chain V09 - Source to Contract (S2C)
Lay out a single left-to-right sequence of high-level process stages
(chevrons), one chevron per stage, in this order:

V09.01. Define Sourcing Need
V09.02. Analyse Spend / Category
V09.03. Identify Supplier Market
V09.04. Issue RFI / RFP / RFQ
V09.05. Evaluate Responses
V09.06. Shortlist Suppliers
V09.07. Conduct Due Diligence
V09.08. Negotiate Commercial Terms
V09.09. Draft Contract
V09.10. Approve Contract
V09.11. Execute Contract
V09.12. Hand Over to Supplier Management / Procure to Pay

This is the demand-side, supplier-selection end-to-end process: a sourcing
need flows through spend analysis, market identification, tendering,
evaluation, due diligence, negotiation and contracting to an executed,
handed-over agreement. The main external participant is the Prospective
Supplier (Vendor / Seller / Service Provider), who takes part through the
RFI / RFP / RFQ, due diligence, negotiation and contract agreement; the
process is triggered by a sourcing need, a renewal requirement or a
strategic category plan. Source to Contract is the sister chain to V02
Procure to Pay and feeds it: the executed contract it produces becomes the
approved supplier and contract pricing that Procure to Pay draws on.
```

**Context diagram prompt.**

```text
Context Diagram: V09 — Source to Contract (S2C).

1. Central system (process-system)
A single central process/system ellipse named "Sourcing Company"
representing the whole organisation that runs the Source to Contract
process. It is the system in context: everything inside it — business
owners, category management, procurement, legal, finance, risk, compliance,
vendor management and the supporting IT systems (sourcing platform,
eTendering, supplier relationship management, contract lifecycle management,
risk and analytics) — is treated as one black box.

2. External entities (external-entity)
The parties OUTSIDE the company that exchange information with it, one
rectangle each:
- Prospective Supplier
- Due Diligence / Reference Agency
- eSignature Provider

3. Layout
"Sourcing Company" sits in the centre. The Prospective Supplier sits to the
RIGHT (the supply side that responds to tenders, is assessed, negotiates and
signs). The Due Diligence / Reference Agency sits to the RIGHT (checks). The
eSignature Provider sits to the RIGHT (signing). The demand originates INSIDE
the company (a sourcing need, renewal or category plan), so no external
demand actor sits on the left. Every external entity connects directly to the
central system with labelled information flows; entities never connect to one
another.

4. Information flows (each a labelled connector between an external entity and
   the central system; show both directions where information flows both ways)
- Sourcing Company → Prospective Supplier: market engagement documents,
  tender pack (RFI / RFP / RFQ), specifications, evaluation criteria,
  clarification questions, contract terms, award / decline notice.
- Prospective Supplier → Sourcing Company: capability statement, proposal,
  pricing, compliance responses, risk attestations, insurance & financial
  information, negotiated contract positions, signed contract.
- Sourcing Company → Due Diligence / Reference Agency: due-diligence check
  request (supplier identity & scope).
- Due Diligence / Reference Agency → Sourcing Company: credit report,
  sanctions / adverse-media results, financial standing.
- Sourcing Company → eSignature Provider: contract for signature / signing
  request.
- eSignature Provider → Sourcing Company: counter-signature & completion
  certificate.

This Context Diagram frames the Sourcing Company as a single system in
context: an internal sourcing need drives the Source to Contract process, the
Prospective Supplier responds to the tender, is assessed, negotiates and
signs, the Due Diligence / Reference Agency provides the checks, and the
eSignature Provider completes execution. The three external entities are
exactly the external actors of the Process Context diagram below, so the two
views stay consistent.
```

**Process Context diagram prompt.**

```text
Process Context Diagram: V09 — Source to Contract (S2C).

1. System boundary and processes
A system boundary named "V09 — Source to Contract" containing these processes
(use-case ovals), stacked top-to-bottom in this order:
- V09.01 Define Sourcing Need
- V09.02 Analyse Spend / Category
- V09.03 Identify Supplier Market
- V09.04 Issue RFI / RFP / RFQ
- V09.05 Evaluate Responses
- V09.06 Shortlist Suppliers
- V09.07 Conduct Due Diligence
- V09.08 Negotiate Commercial Terms
- V09.09 Draft Contract
- V09.10 Approve Contract
- V09.11 Execute Contract
- V09.12 Hand Over to Supplier Management / Procure to Pay

2. Participants (outside the boundary)
External actors (actor):
- Prospective Supplier
- Due Diligence / Reference Agency
- eSignature Provider
Internal teams (team):
- Business Owner
- Category Management
- Procurement
- Legal
- Finance
- Risk
- Compliance
- IT Security / Data Protection
- Contract Management
- Vendor Management
IT systems (system):
- Sourcing Platform
- Analytics / BI Tools
- Supplier Relationship Management System
- eTendering Platform
- Risk Management System
- Contract Lifecycle Management System
- eSignature Platform
- Procurement / ERP System

3. Layout
The processes sit inside the boundary in V09.01 → V09.12 order. Internal teams
sit to the LEFT of the boundary; external actors and IT systems sit to the
RIGHT. Each participant is positioned near the process(es) it connects to.

4. Flow connectors (participant ↔ process, with a short label)
- V09.01 Define Sourcing Need — Business Owner (raise need), Category
  Management (confirm approach); Sourcing Platform (brief & category).
- V09.02 Analyse Spend / Category — Category Management (analyse), Procurement
  (review); Analytics / BI Tools (spend analysis).
- V09.03 Identify Supplier Market — Category Management (scan market),
  Procurement (long list); Supplier Relationship Management System (history).
- V09.04 Issue RFI / RFP / RFQ — Prospective Supplier (receive tender & respond);
  Procurement (issue), Legal (terms); eTendering Platform (publish & collect).
- V09.05 Evaluate Responses — Prospective Supplier (clarifications); Procurement
  (score), Business Owner (confirm); Sourcing Platform (scoring).
- V09.06 Shortlist Suppliers — Procurement (rank), Category Management
  (moderate), Business Owner (confirm); Sourcing Platform (shortlist).
- V09.07 Conduct Due Diligence — Prospective Supplier (evidence), Due Diligence
  / Reference Agency (checks); Risk, Compliance, IT Security / Data Protection
  (assess); Risk Management System (record).
- V09.08 Negotiate Commercial Terms — Prospective Supplier (negotiate);
  Procurement (mandate), Category Management (negotiate), Finance (validate);
  Sourcing Platform (agreed terms).
- V09.09 Draft Contract — Prospective Supplier (redlines); Legal (draft),
  Contract Management (finalise); Contract Lifecycle Management System (draft).
- V09.10 Approve Contract — Procurement (compile), Business Owner (approve),
  Finance (commitment); Contract Lifecycle Management System (approval workflow).
- V09.11 Execute Contract — Prospective Supplier (sign), eSignature Provider
  (counter-sign); Contract Management (execute), Legal (activate); eSignature
  Platform (signing).
- V09.12 Hand Over to Supplier Management / Procure to Pay — Contract Management
  (verify), Vendor Management (hand over); Supplier Relationship Management
  System, Procurement / ERP System (set up & close).

This Process Context diagram frames the whole Source to Contract value chain:
the twelve subprocesses inside the boundary, the external actors (Prospective
Supplier, Due Diligence / Reference Agency, eSignature Provider) and internal
teams that perform them, and the IT systems that support them — consistent with
the per-process BPMN prompts below.
```

**Process ↔ Actors / Teams / IT Systems association matrix.**

Each row matches the pools, lanes and roles of the corresponding BPMN process
prompt below — external actors are the non-organisation pools, teams are the
lanes of the "Sourcing Organisation" pool (key role in brackets), and IT systems
are the `System = true` black-box pools.

| Process | External Actors | Teams (key role) | IT Systems |
| --- | --- | --- | --- |
| **V09.01** Define Sourcing Need | — | Business Owner (business owner), Category Management (category manager) | Sourcing Platform |
| **V09.02** Analyse Spend / Category | — | Category Management (category manager), Procurement (commercial analyst) | Analytics / BI Tools |
| **V09.03** Identify Supplier Market | — | Category Management (category manager), Procurement (sourcing specialist) | Supplier Relationship Management System |
| **V09.04** Issue RFI / RFP / RFQ | Prospective Supplier | Procurement (sourcing specialist), Legal (legal counsel) | eTendering Platform |
| **V09.05** Evaluate Responses | Prospective Supplier | Procurement (commercial analyst), Business Owner (business owner) | Sourcing Platform |
| **V09.06** Shortlist Suppliers | — | Procurement (procurement manager), Category Management (category manager), Business Owner (business owner) | Sourcing Platform |
| **V09.07** Conduct Due Diligence | Prospective Supplier, Due Diligence / Reference Agency | Risk (risk officer), Compliance (compliance officer), IT Security / Data Protection (security lead) | Risk Management System |
| **V09.08** Negotiate Commercial Terms | Prospective Supplier | Procurement (procurement manager), Category Management (category manager), Finance (commercial analyst) | Sourcing Platform |
| **V09.09** Draft Contract | Prospective Supplier | Legal (legal counsel), Contract Management (contract manager) | Contract Lifecycle Management System |
| **V09.10** Approve Contract | — | Procurement (procurement manager), Business Owner (business owner), Finance (finance controller) | Contract Lifecycle Management System |
| **V09.11** Execute Contract | Prospective Supplier, eSignature Provider | Contract Management (contract manager), Legal (legal counsel) | eSignature Platform |
| **V09.12** Hand Over to Supplier Management / Procure to Pay | — | Contract Management (contract manager), Vendor Management (vendor manager) | Supplier Relationship Management System, Procurement / ERP System |

**Actor / Team / System roll-up** (every distinct participant across V09):

- **External actors:** Prospective Supplier (V09.04–V09.05, V09.07–V09.09, V09.11); Due Diligence / Reference Agency (V09.07); eSignature Provider (V09.11).
- **Teams:** Business Owner (V09.01, V09.05, V09.06, V09.10); Category Management (V09.01, V09.02, V09.03, V09.06, V09.08); Procurement (V09.02–V09.06, V09.08, V09.10); Legal (V09.04, V09.09, V09.11); Finance (V09.08, V09.10); Risk (V09.07); Compliance (V09.07); IT Security / Data Protection (V09.07); Contract Management (V09.09, V09.11, V09.12); Vendor Management (V09.12).
- **IT systems:** Sourcing Platform (V09.01, V09.05, V09.06, V09.08); Analytics / BI Tools (V09.02); Supplier Relationship Management System (V09.03, V09.12); eTendering Platform (V09.04); Risk Management System (V09.07); Contract Lifecycle Management System (V09.09, V09.10); eSignature Platform (V09.11); Procurement / ERP System (V09.12).

**ArchiMate diagram prompt.**

A single high-level ArchiMate view of the Source to Contract service area. It
shows the **Actors**, **Services**, **Processes**, **Interfaces** and
**Applications** that provide the Sourcing Service and the related
supplier-facing services across the twelve V09 processes. Each Business Process
is a drill-down anchor: link it to the matching V09.nn BPMN diagram and its
marker turns green.

```text
ArchiMate: V09 — Source to Contract — Service & Application Landscape (high level).

Purpose: show how the organisation provides the Sourcing Service and the
related services (to the internal business owners and to the Prospective
Supplier) across the twelve V09 Source to Contract processes, and the
applications that support them. Lay it out in three horizontal bands, top to
bottom — BUSINESS SERVICES → BUSINESS PROCESSES → APPLICATIONS — with the
internal Business Owner on the far left and the Prospective Supplier /
assurance actors on the far right. Read top-to-bottom as service → process →
application (ArchiMate service realisation).

1. Business Actors (Business Actor)
- Business Owner — the internal party the sourcing service is provided to (far
  left, the originator of the sourcing need).
- Prospective Supplier — the external party that responds to the tender, is
  assessed, negotiates and signs (far right).
- Due Diligence / Reference Agency, eSignature Provider — external actors that
  take part in assurance and execution (far right).

2. Interfaces
- Business Interface "Supplier Portal / Sourcing Channel" — the channel the
  Prospective Supplier uses to receive the tender, submit responses, be
  assessed, negotiate and sign. The Prospective Supplier ACCESSES this
  interface; the interface SERVES the business services below.
- Application Interfaces (optional, only the few the portal calls): "Tender
  API" on the eTendering Platform, "Signing API" on the eSignature Platform.

3. Business Services (Business Service) — the services provided, top band,
   left-to-right in sourcing-journey order:
- Sourcing Strategy Service — define the need, analyse the category, identify
  the market.
- Tendering Service — issue the RFI / RFP / RFQ, evaluate and shortlist.
- Supplier Assurance Service — conduct due diligence on the supplier.
- Negotiation Service — negotiate the commercial terms.
- Contracting Service — draft, approve and execute the contract.
- Supplier Onboarding & Handover Service — hand over to supplier management
  and Procure to Pay.

4. Business Processes (Business Process) — the twelve V09 processes, middle
   band in V09.01 → V09.12 order. Each REALISES the business service shown and
   is the link anchor to its BPMN diagram:
- V09.01 Define Sourcing Need           -> realises Sourcing Strategy Service
- V09.02 Analyse Spend / Category        -> realises Sourcing Strategy Service
- V09.03 Identify Supplier Market        -> realises Sourcing Strategy Service
- V09.04 Issue RFI / RFP / RFQ           -> realises Tendering Service
- V09.05 Evaluate Responses              -> realises Tendering Service
- V09.06 Shortlist Suppliers             -> realises Tendering Service
- V09.07 Conduct Due Diligence           -> realises Supplier Assurance Service
- V09.08 Negotiate Commercial Terms      -> realises Negotiation Service
- V09.09 Draft Contract                  -> realises Contracting Service
- V09.10 Approve Contract                -> realises Contracting Service
- V09.11 Execute Contract                -> realises Contracting Service
- V09.12 Hand Over to Supplier Mgmt / P2P -> realises Supplier Onboarding & Handover Service

5. Applications (Application Component) — the IT systems that support the
   processes, bottom band:
- Sourcing Platform
- Analytics / BI Tools
- Supplier Relationship Management System
- eTendering Platform
- Risk Management System
- Contract Lifecycle Management System
- eSignature Platform
- Procurement / ERP System

6. Relationships
- Prospective Supplier -accesses-> Supplier Portal / Sourcing Channel.
- Supplier Portal / Sourcing Channel -serving-> the Tendering, Assurance,
  Negotiation and Contracting services.
- Each Business Process -realisation-> its Business Service (section 4).
- Each Business Process -served by-> its supporting Application Component
  (serving, application -> process):
    V09.01 <- Sourcing Platform;            V09.02 <- Analytics / BI Tools;
    V09.03 <- Supplier Relationship Mgmt;   V09.04 <- eTendering Platform;
    V09.05 <- Sourcing Platform;            V09.06 <- Sourcing Platform;
    V09.07 <- Risk Management System;       V09.08 <- Sourcing Platform;
    V09.09 <- Contract Lifecycle Mgmt;      V09.10 <- Contract Lifecycle Mgmt;
    V09.11 <- eSignature Platform;          V09.12 <- Supplier Relationship Mgmt + Procurement / ERP System.
- Due Diligence / Reference Agency -serving-> V09.07 Conduct Due Diligence.
- eSignature Provider -serving-> V09.11 Execute Contract.

7. Intent
The Sourcing Service sits top-centre as the headline service. The twelve
Business Processes form the backbone in V09.01 -> V09.12 order so the reader
can trace the sourcing journey and drill from any process straight into its
detailed BPMN model. This one ArchiMate view therefore links to all twelve V09
BPMN process diagrams. The mapping of process -> actors/teams/applications is
the Process <-> Actors / Teams / IT Systems matrix above.
```

### V09.01 — Define Sourcing Need

**BPMN diagram prompt.**

```text
BPMN: V09.01 Define Sourcing Need — first stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Sourcing Organisation" — the organisation running the process, with two
  lanes top-to-bottom: "Business Owner", "Category Management".
- Pool "Sourcing Platform" — the supporting IT system.

2. Pool properties
- Sourcing Organisation: white-box (holds the process flow).
- Sourcing Platform: black-box, System = true, single instance.

3. Layout
- Sourcing Organisation pool at the top, Sourcing Platform pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Business Owner lane:
- Conditional start event "Sourcing need identified" (new requirement, renewal
  due, or strategic category plan)
- Expanded Subprocess (LOOP marker) "Complete sourcing brief":
    internals — User task "Define sourcing brief (scope, requirements, budget,
    timeline)", then exclusive gateway "Brief complete?": branch "Yes" →
    subprocess end event "Brief complete". The loop marker repeats the attempt
    while the brief is incomplete.
- Service task "Check category strategy / existing contracts"
- Exclusive gateway "Existing contract covers the need?"
    - branch "Yes – renew": End event "Covered by existing contract — route to
      Approve Contract (V09.10)"
    - branch "No – new source required": continue to Category Management
Category Management lane:
- Service task "Confirm sourcing approach and category"
- End event "Sourcing need defined — ready for Analyse Spend / Category (V09.02)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Complete sourcing brief" Expanded
  Subprocess: "Brief not completed in 3 business days" → User task "Escalate to
  Category Manager" → escalation end event "Escalated — sourcing need not
  defined in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Check category strategy / existing contracts" → Sourcing Platform
- Sourcing Platform → "Confirm sourcing approach and category" (category
  strategy, existing contracts, preferred routes)

This is the internal entry point of S2C: a sourcing need is raised and its brief
fully defined (retried until complete), checked against the category strategy
and existing contracts, and confirmed against a sourcing approach — leaving a
defined need ready for spend and category analysis.
```

### V09.02 — Analyse Spend / Category

**BPMN diagram prompt.**

```text
BPMN: V09.02 Analyse Spend / Category — second stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Category Management", "Procurement".
- Pool "Analytics / BI Tools" — the supporting IT system.

2. Pool properties
- Sourcing Organisation: white-box (holds the process flow).
- Analytics / BI Tools: black-box, System = true, single instance.

3. Layout
- Sourcing Organisation pool at the top, Analytics / BI Tools pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Category Management lane:
- Message start event "Defined sourcing need received"
- User task "Gather spend and demand data"
- Service task "Run spend / category analysis"
Procurement lane:
- Expanded Subprocess (LOOP marker) "Refine category analysis":
    internals — User task "Review analysis (coverage, savings, risk)", then
    exclusive gateway "Analysis robust?": branch "No" → User task "Refine
    assumptions / data" → subprocess end event "Refinement recorded" (the loop
    marker then re-reviews); branch "Yes" → subprocess end event "Analysis
    robust". The loop marker repeats while the analysis is not robust.
- Service task "Record category strategy in Analytics / BI Tools"
- End event "Category analysis complete — ready for Identify Supplier Market
  (V09.03)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Refine category analysis" Expanded
  Subprocess: "Not refined in 3 business days" → User task "Escalate to
  Procurement Manager" → escalation end event "Escalated — category analysis not
  completed in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Run spend / category analysis" → Analytics / BI Tools
- Analytics / BI Tools → "Review analysis (coverage, savings, risk)" (spend,
  savings potential, supplier concentration)
- "Record category strategy in Analytics / BI Tools" → Analytics / BI Tools

This stage turns a defined need into a robust spend and category analysis
(refined until robust) recorded in the analytics tools — leaving a category
strategy ready for market identification.
```

### V09.03 — Identify Supplier Market

**BPMN diagram prompt.**

```text
BPMN: V09.03 Identify Supplier Market — third stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Category Management", "Procurement".
- Pool "Supplier Relationship Management System" — the supporting IT system.

2. Pool properties
- Sourcing Organisation: white-box (holds the process flow).
- Supplier Relationship Management System: black-box, System = true, single instance.

3. Layout
- Sourcing Organisation pool at the top, Supplier Relationship Management System
  pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Category Management lane:
- Message start event "Category strategy received"
- Service task "Scan supplier market / SRM history"
- User task "Build long list of potential suppliers"
- Exclusive gateway "Enough qualified suppliers?"
    - branch "No – market too thin": Expanded Subprocess (LOOP marker) "Broaden
      market search": internals — User task "Extend search (new sources, market
      notice)", then exclusive gateway "Sufficient suppliers now?": branch "Yes"
      → subprocess end event "Market sufficient". The loop marker repeats while
      the market is too thin.
    - branch "Yes": continue to Procurement
Procurement lane:
- Service task "Record long list in SRM"
- End event "Supplier market identified — ready for Issue RFI / RFP / RFQ
  (V09.04)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Broaden market search" Expanded
  Subprocess: "Market not sufficient in 5 business days" → User task "Escalate to
  Category Manager" → escalation end event "Escalated — supplier market not
  identified in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Scan supplier market / SRM history" → Supplier Relationship Management System
- Supplier Relationship Management System → "Build long list of potential
  suppliers" (supplier performance history, market data)
- "Record long list in SRM" → Supplier Relationship Management System

This stage scans the market and builds a qualified long list of potential
suppliers (broadened until sufficient) recorded in the SRM — leaving an
identified supplier market ready for the tender.
```

### V09.04 — Issue RFI / RFP / RFQ

**BPMN diagram prompt.**

```text
BPMN: V09.04 Issue RFI / RFP / RFQ — fourth stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Prospective Supplier" — the external party that receives the tender.
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Procurement", "Legal".
- Pool "eTendering Platform" — the supporting IT system.

2. Pool properties
- Prospective Supplier: black-box, single instance.
- Sourcing Organisation: white-box (holds the process flow).
- eTendering Platform: black-box, System = true, single instance.

3. Layout
- Prospective Supplier pool at the top, Sourcing Organisation pool in the middle,
  eTendering Platform pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Procurement lane:
- Message start event "Supplier market identified"
- Service task "Prepare tender pack (RFI / RFP / RFQ, criteria)"
Legal lane:
- User task "Review terms and evaluation criteria"
- Exclusive gateway "Tender pack approved to issue?"
    - branch "No – needs revision": Expanded Subprocess (LOOP marker) "Revise
      tender pack": internals — User task "Update tender documents", then
      exclusive gateway "Approved to issue?": branch "Yes" → subprocess end event
      "Pack approved". The loop marker repeats while the pack is not approved.
    - branch "Yes": continue to Procurement
Procurement lane:
- Send task "Issue RFI / RFP / RFQ to shortlisted market"
- Intermediate message catch event "Supplier submissions received"
- End event "Tender issued and responses received — ready for Evaluate Responses
  (V09.05)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Revise tender pack" Expanded
  Subprocess: "Not approved in 3 business days" → User task "Escalate to Category
  Manager" → escalation end event "Escalated — tender not issued in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Issue RFI / RFP / RFQ to shortlisted market" → Prospective Supplier
- "Issue RFI / RFP / RFQ to shortlisted market" → eTendering Platform
- Prospective Supplier → intermediate event "Supplier submissions received"

This stage prepares the tender pack, reviews and revises the terms and criteria
where needed (revised until approved), and issues the RFI / RFP / RFQ to the
market through the eTendering platform — leaving supplier submissions received
ready for evaluation.
```

### V09.05 — Evaluate Responses

**BPMN diagram prompt.**

```text
BPMN: V09.05 Evaluate Responses — fifth stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Prospective Supplier" — the external party whose response may be clarified.
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Procurement", "Business Owner".
- Pool "Sourcing Platform" — the supporting IT system.

2. Pool properties
- Prospective Supplier: black-box, single instance.
- Sourcing Organisation: white-box (holds the process flow).
- Sourcing Platform: black-box, System = true, single instance.

3. Layout
- Prospective Supplier pool at the top, Sourcing Organisation pool in the middle,
  Sourcing Platform pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Procurement lane:
- Message start event "Supplier responses received"
- Service task "Load responses into evaluation"
- Service task "Score against criteria"
- Exclusive gateway "Responses clear & complete?"
    - branch "No – clarification needed": Expanded Subprocess (LOOP marker)
      "Resolve evaluation clarification": internals — User task "Raise
      clarification question", then Send task "Send clarification to supplier",
      then intermediate message catch event "Supplier responds", then exclusive
      gateway "Clarified?": branch "Yes" → subprocess end event "Clarification
      cleared". The loop marker repeats while the clarification is open.
    - branch "Yes": continue to Business Owner
Business Owner lane:
- User task "Confirm evaluation scores"
- Service task "Record scores in Sourcing Platform"
- End event "Responses evaluated — ready for Shortlist Suppliers (V09.06)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve evaluation clarification"
  Expanded Subprocess: "Not cleared in 3 business days" → User task "Escalate to
  Procurement Manager" → escalation end event "Escalated — evaluation
  clarification not cleared in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Send clarification to supplier" → Prospective Supplier
- Prospective Supplier → intermediate event "Supplier responds"
- Sourcing Platform → "Score against criteria" (weighted criteria, scoring model)
- "Record scores in Sourcing Platform" → Sourcing Platform

This stage loads and scores the supplier responses against the criteria,
resolving any clarification with the supplier (retried until cleared) and
confirming the scores — leaving evaluated responses ready for shortlisting.
```

### V09.06 — Shortlist Suppliers

**BPMN diagram prompt.**

```text
BPMN: V09.06 Shortlist Suppliers — sixth stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Sourcing Organisation" — the organisation, with three lanes top-to-bottom:
  "Procurement", "Category Management", "Business Owner".
- Pool "Sourcing Platform" — the supporting IT system.

2. Pool properties
- Sourcing Organisation: white-box (holds the process flow).
- Sourcing Platform: black-box, System = true, single instance.

3. Layout
- Sourcing Organisation pool at the top, Sourcing Platform pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Procurement lane:
- Message start event "Evaluated responses received"
- Service task "Rank suppliers by score"
Category Management lane:
- Exclusive gateway "Shortlist agreed at moderation?"
    - branch "Agreed": continue to Business Owner
    - branch "Refer – needs re-moderation": Expanded Subprocess (LOOP marker)
      "Re-moderate shortlist": internals — User task "Review scoring and
      rationale", then User task "Adjust shortlist", then exclusive gateway
      "Shortlist agreed now?": branch "Yes" → subprocess end event "Shortlist
      agreed". The loop marker repeats while the shortlist is not agreed.
    - branch "Reject all – re-tender": End event "No viable suppliers — routed
      back to Issue RFI / RFP / RFQ (V09.04)"
Business Owner lane:
- Service task "Confirm shortlist and record decision"
- End event "Suppliers shortlisted — ready for Conduct Due Diligence (V09.07)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Re-moderate shortlist" Expanded
  Subprocess: "Not agreed in 3 business days" → User task "Escalate to
  Procurement Manager" → escalation end event "Escalated — shortlist not agreed
  in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Sourcing Platform → "Rank suppliers by score" (evaluation scores, weightings)
- "Confirm shortlist and record decision" → Sourcing Platform

This stage ranks the evaluated suppliers and agrees a shortlist at moderation
(re-moderated until agreed, re-tendered where none are viable) — leaving a
confirmed shortlist ready for due diligence.
```

### V09.07 — Conduct Due Diligence

**BPMN diagram prompt.**

```text
BPMN: V09.07 Conduct Due Diligence — seventh stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Prospective Supplier" — the external party being assessed.
- Pool "Due Diligence / Reference Agency" — the external checks provider.
- Pool "Sourcing Organisation" — the organisation, with three lanes
  top-to-bottom: "Risk", "Compliance", "IT Security / Data Protection".
- Pool "Risk Management System" — the supporting IT system.

2. Pool properties
- Prospective Supplier: black-box, single instance.
- Due Diligence / Reference Agency: black-box, single instance.
- Sourcing Organisation: white-box (holds the process flow).
- Risk Management System: black-box, System = true, single instance.

3. Layout
- Prospective Supplier and Due Diligence / Reference Agency pools at the top,
  Sourcing Organisation pool in the middle, Risk Management System pool at the
  bottom.

4. Lane contents in flow order (Sourcing Organisation)
Risk lane:
- Message start event "Shortlist ready for due diligence"
- Send task "Request due-diligence pack from supplier"
- Service task "Request checks from reference agency"
Compliance lane:
- Service task "Assess financial, sanctions & compliance results"
- Exclusive gateway "All checks satisfactory?"
    - branch "No – finding / gap": Expanded Subprocess (LOOP marker) "Resolve
      due-diligence finding": internals — User task "Log finding", then Send task
      "Request evidence / remediation from supplier", then intermediate message
      catch event "Supplier responds (evidence / attestation)", then exclusive
      gateway "Finding cleared?": branch "Yes" → subprocess end event "Finding
      cleared". The loop marker repeats while the finding is open.
    - branch "Yes": continue to IT Security / Data Protection
    - branch "Fail – disqualify": End event "Supplier failed due diligence —
      routed back to Shortlist Suppliers (V09.06)"
IT Security / Data Protection lane:
- User task "Confirm security & data-protection assurance"
- Service task "Record due-diligence outcome in Risk Management System"
- End event "Due diligence complete — ready for Negotiate Commercial Terms
  (V09.08)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve due-diligence finding"
  Expanded Subprocess: "Not cleared in 10 business days" → User task "Escalate to
  Head of Risk" → escalation end event "Escalated — due-diligence finding not
  resolved in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Request due-diligence pack from supplier" → Prospective Supplier
- "Request checks from reference agency" → Due Diligence / Reference Agency
- Due Diligence / Reference Agency → "Assess financial, sanctions & compliance
  results" (credit report, sanctions, adverse media)
- "Request evidence / remediation from supplier" → Prospective Supplier
- Prospective Supplier → intermediate event "Supplier responds (evidence /
  attestation)"
- "Record due-diligence outcome in Risk Management System" → Risk Management
  System

This stage assesses the supplier's financial, sanctions, compliance and
security position with the reference agency and the supplier, resolving any
finding (retried until cleared) and disqualifying where the supplier fails —
leaving a cleared supplier ready for negotiation.
```

### V09.08 — Negotiate Commercial Terms

**BPMN diagram prompt.**

```text
BPMN: V09.08 Negotiate Commercial Terms — eighth stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Prospective Supplier" — the external party negotiating the terms.
- Pool "Sourcing Organisation" — the organisation, with three lanes
  top-to-bottom: "Procurement", "Category Management", "Finance".
- Pool "Sourcing Platform" — the supporting IT system.

2. Pool properties
- Prospective Supplier: black-box, single instance.
- Sourcing Organisation: white-box (holds the process flow).
- Sourcing Platform: black-box, System = true, single instance.

3. Layout
- Prospective Supplier pool at the top, Sourcing Organisation pool in the middle,
  Sourcing Platform pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Procurement lane:
- Message start event "Due-diligence-cleared supplier received"
- Service task "Prepare negotiation mandate (targets, walk-away)"
Category Management lane:
- Expanded Subprocess (LOOP marker) "Negotiate terms with supplier":
    internals — Send task "Table commercial position", then intermediate message
    catch event "Supplier responds (accept / counter)", then exclusive gateway
    "Terms agreed?": branch "Yes" → subprocess end event "Terms agreed". The loop
    marker repeats the counter-offer exchange while terms are not agreed. On
    agreement, continue to Finance.
Finance lane:
- Service task "Validate pricing and record agreed terms"
- End event "Commercial terms agreed — ready for Draft Contract (V09.09)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Negotiate terms with supplier"
  Expanded Subprocess: "No agreement in 10 business days" → User task "Escalate to
  Category Manager" → escalation end event "Escalated — commercial terms not
  agreed in time".

6. Connectors
Sequence flows: follow the lane order above. The retry subprocess repeats via its
loop marker (no internal loop-back flow drawn).
Message flows:
- "Table commercial position" → Prospective Supplier
- Prospective Supplier → intermediate event "Supplier responds (accept / counter)"
- "Validate pricing and record agreed terms" → Sourcing Platform

This stage prepares the negotiation mandate and negotiates the commercial terms
with the supplier (negotiated until agreed), then validates and records the
agreed pricing — leaving agreed commercial terms ready for contract drafting.
```

### V09.09 — Draft Contract

**BPMN diagram prompt.**

```text
BPMN: V09.09 Draft Contract — ninth stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Prospective Supplier" — the external party reviewing the draft.
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Legal", "Contract Management".
- Pool "Contract Lifecycle Management System" — the supporting IT system.

2. Pool properties
- Prospective Supplier: black-box, single instance.
- Sourcing Organisation: white-box (holds the process flow).
- Contract Lifecycle Management System: black-box, System = true, single instance.

3. Layout
- Prospective Supplier pool at the top, Sourcing Organisation pool in the middle,
  Contract Lifecycle Management System pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Legal lane:
- Message start event "Agreed terms received"
- Service task "Assemble contract from template and agreed terms"
Contract Management lane:
- Send task "Issue draft contract to supplier for review"
- Intermediate message catch event "Supplier responds (accept / redlines)"
- Exclusive gateway "Draft accepted by supplier?"
    - branch "No – redlines returned": Expanded Subprocess (LOOP marker) "Resolve
      contract redlines": internals — User task "Review supplier redlines", then
      Send task "Send revised draft to supplier", then intermediate message catch
      event "Supplier responds (accept / further redlines)", then exclusive
      gateway "Redlines resolved?": branch "Yes" → subprocess end event "Redlines
      resolved". The loop marker repeats while redlines are open.
    - branch "Yes": continue
- Service task "Finalise draft and store in CLM"
- End event "Contract drafted — ready for Approve Contract (V09.10)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Resolve contract redlines" Expanded
  Subprocess: "Not resolved in 10 business days" → User task "Escalate to Head of
  Legal" → escalation end event "Escalated — contract redlines not resolved in
  time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- Contract Lifecycle Management System → "Assemble contract from template and
  agreed terms" (templates, clause library)
- "Issue draft contract to supplier for review" → Prospective Supplier
- Prospective Supplier → intermediate event "Supplier responds (accept / redlines)"
- "Send revised draft to supplier" → Prospective Supplier
- Prospective Supplier → intermediate event "Supplier responds (accept / further
  redlines)"
- "Finalise draft and store in CLM" → Contract Lifecycle Management System

This stage assembles the contract from the template and agreed terms, issues it
to the supplier and resolves any redlines (retried until resolved), then
finalises and stores it in the CLM — leaving a drafted contract ready for
approval.
```

### V09.10 — Approve Contract

**BPMN diagram prompt.**

```text
BPMN: V09.10 Approve Contract — tenth stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Sourcing Organisation" — the organisation, with three lanes
  top-to-bottom: "Procurement", "Business Owner", "Finance".
- Pool "Contract Lifecycle Management System" — the supporting IT system.

2. Pool properties
- Sourcing Organisation: white-box (holds the process flow).
- Contract Lifecycle Management System: black-box, System = true, single instance.

3. Layout
- Sourcing Organisation pool at the top, Contract Lifecycle Management System
  pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Procurement lane:
- Message start event "Drafted contract received"
- Service task "Compile approval pack (terms, risk, spend)"
Business Owner lane:
- Exclusive gateway "Within delegation & approved?"
    - branch "Approved": continue to Finance
    - branch "Refer – needs rework": Expanded Subprocess (LOOP marker) "Revise
      and re-submit for approval": internals — User task "Address approver
      feedback", then User task "Re-submit for approval", then exclusive gateway
      "Approved now?": branch "Yes" → subprocess end event "Approved". The loop
      marker repeats while approval is withheld.
    - branch "Rejected": End event "Contract rejected — routed back to Negotiate
      Commercial Terms (V09.08)"
Finance lane:
- Service task "Record approval and commitment"
- End event "Contract approved — ready for Execute Contract (V09.11)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Revise and re-submit for approval"
  Expanded Subprocess: "Not approved in 5 business days" → User task "Escalate to
  Finance Controller" → escalation end event "Escalated — contract approval not
  obtained in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Compile approval pack (terms, risk, spend)" → Contract Lifecycle Management
  System
- Contract Lifecycle Management System → "Within delegation & approved?"
  (approval workflow, delegation limits)
- "Record approval and commitment" → Contract Lifecycle Management System

This stage compiles the approval pack and approves the contract within
delegation — reworking and re-submitting where referred, rejecting back to
negotiation where out of policy — leaving an approved, committed contract ready
for execution.
```

### V09.11 — Execute Contract

**BPMN diagram prompt.**

```text
BPMN: V09.11 Execute Contract — eleventh stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Prospective Supplier" — the external party that counter-signs.
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Contract Management", "Legal".
- Pool "eSignature Platform" — the supporting IT system and signing provider.

2. Pool properties
- Prospective Supplier: black-box, single instance.
- Sourcing Organisation: white-box (holds the process flow).
- eSignature Platform: black-box, System = true, single instance.

3. Layout
- Prospective Supplier pool at the top, Sourcing Organisation pool in the middle,
  eSignature Platform pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Contract Management lane:
- Message start event "Approved contract received"
- Service task "Prepare execution copy"
- Send task "Send contract for signature"
- Intermediate message catch event "Counter-signature received"
- Exclusive gateway "Fully executed?"
    - branch "No – not yet signed": Expanded Subprocess (LOOP marker) "Chase
      counter-signature": internals — Send task "Remind supplier / signatory",
      then intermediate message catch event "Signature status received", then
      exclusive gateway "Signed?": branch "Yes" → subprocess end event "Signed".
      The loop marker repeats while the contract is unsigned.
    - branch "Yes": continue to Legal
Legal lane:
- Service task "Store executed contract and activate obligations"
- End event "Contract executed — ready for Hand Over to Supplier Management /
  Procure to Pay (V09.12)"

5. Edge-mounted (boundary) events
- INTERRUPTING timer boundary event on the "Chase counter-signature" Expanded
  Subprocess: "Not signed in 5 business days" → User task "Escalate to Legal
  Counsel" → escalation end event "Escalated — contract not executed in time".

6. Connectors
Sequence flows: follow the lane order above, including the gateway branch. The
retry subprocess repeats via its loop marker (no internal loop-back flow drawn).
Message flows:
- "Send contract for signature" → eSignature Platform
- eSignature Platform → intermediate event "Counter-signature received"
- "Remind supplier / signatory" → Prospective Supplier
- Prospective Supplier → intermediate event "Signature status received"
- "Store executed contract and activate obligations" → eSignature Platform

This stage prepares and sends the contract for signature through the eSignature
platform and chases the counter-signature where needed (retried until signed),
then stores the executed contract and activates its obligations — leaving an
executed contract ready for handover.
```

### V09.12 — Hand Over to Supplier Management / Procure to Pay

**BPMN diagram prompt.**

```text
BPMN: V09.12 Hand Over to Supplier Management / Procure to Pay — final stage of the Source to Contract (S2C) value chain.

1. Pools & Lanes
- Pool "Sourcing Organisation" — the organisation, with two lanes top-to-bottom:
  "Contract Management", "Vendor Management".
- Pool "Supplier Relationship Management System" — the supporting IT system.

2. Pool properties
- Sourcing Organisation: white-box (holds the process flow).
- Supplier Relationship Management System: black-box, System = true, single instance.

3. Layout
- Sourcing Organisation pool at the top, Supplier Relationship Management System
  pool at the bottom.

4. Lane contents in flow order (Sourcing Organisation)
Contract Management lane:
- Message start event "Executed contract ready to hand over"
- Service task "Verify contract executed, approved and stored"
- Exclusive gateway "All complete & no open items?"
    - branch "No – open item": User task "Return to responsible stage", then
      End event "Re-opened — routed back to the open stage"
    - branch "Yes": continue to Vendor Management
Vendor Management lane:
- Service task "Set up supplier & contract in SRM / ERP"
- Service task "Hand over to Supplier Management and Procure to Pay"
- End event "Contract handed over — Source to Contract complete"

5. Edge-mounted (boundary) events
- None.

6. Connectors
Sequence flows: follow the lane order above, including the gateway branches.
Message flows:
- Supplier Relationship Management System → "Verify contract executed, approved
  and stored" (contract status, obligations)
- "Set up supplier & contract in SRM / ERP" → Supplier Relationship Management
  System
- "Hand over to Supplier Management and Procure to Pay" → Supplier Relationship
  Management System

This stage confirms the contract is executed, approved and stored with no open
items, sets the supplier and contract up in the SRM and ERP, and hands over to
Supplier Management and Procure to Pay — completing the end-to-end Source to
Contract cycle and feeding the sister Procure to Pay chain (V02).
```
