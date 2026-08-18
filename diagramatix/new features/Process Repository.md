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
