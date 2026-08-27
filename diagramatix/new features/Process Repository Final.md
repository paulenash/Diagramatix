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
BPMN: V01.01 Receive Order — first subprocess of the Order to Cash value
chain, capturing every inbound order from the Customer and handing a
recorded order to Validate Customer / Order (V01.02).

1. Pools & Lanes

Pool "Customer" — the external buyer placing the order.
Pool "Sales Organisation" — the internal teams that receive and record
  the order; lanes: Customer Service, Order Processing.
Pool "Order Management System (OMS)" — the IT system in which the
  order is created and stored.

2. Pool properties

Pool "Customer" — black-box, single instance.
Pool "Sales Organisation" — white-box, single instance.
Pool "Order Management System (OMS)" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Order Management System (OMS)

4. Lane contents in flow order (Sales Organisation)

Customer Service lane:
  Message start event "Order received from Customer (phone, email,
    portal, or eCommerce)"
  User task "Log initial order contact and channel"
  User task "Capture order details from Customer"
  Exclusive gateway "Order details complete?"
    - branch "No": Expanded Subprocess "Repeat Until Details Complete"
        (standard loop) containing, in order: Send task "Request
        missing information from Customer", Intermediate message catch
        event "Customer responds with missing details", User task
        "Update captured order details"
    - branch "Yes": continue to exclusive merge gateway
  Exclusive merge gateway "Order details complete"
  User task "Confirm order type and channel"
  Send task "Send order acknowledgement to Customer"

Order Processing lane:
  User task "Review and classify order"
  User task "Assign order reference number"
  Service task "Create order record in OMS"
  User task "Attach supporting documents to order"
  Exclusive gateway "Order record complete and ready?"
    - branch "No": User task "Correct or supplement order record",
        rejoins exclusive merge gateway "Order record ready"
    - branch "Yes": continue to exclusive merge gateway
  Exclusive merge gateway "Order record ready"
  End event "Order recorded — ready for Validate Customer / Order
    (V01.02)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Details Complete" — label "48-hour response deadline exceeded" —
  flow continues to: End event "Order abandoned — Customer
  unresponsive" (does not rejoin main flow).

6. Connectors

Sequence flows: work begins in the Customer Service lane with the
message start event and flows through order logging, detail capture,
and the completeness loop; once details are confirmed and the
acknowledgement sent, flow passes to the Order Processing lane for
classification, reference assignment, OMS creation, document
attachment, and the readiness check before the end event. The
"Order details complete?" gateway branches to the loop subprocess on
"No" and to the merge on "Yes"; both branches converge at the
exclusive merge gateway "Order details complete" before continuing.
The "Order record complete and ready?" gateway branches to the
correction task on "No" and to the merge on "Yes"; both converge at
the exclusive merge gateway "Order record ready".

Message flows:
  Customer → Customer Service lane (inbound order — phone, email,
    portal, or eCommerce platform)
  Customer Service lane → Customer (order acknowledgement)
  Customer Service lane → Customer (request for missing information,
    within loop subprocess)
  Customer → Customer Service lane (missing details response, within
    loop subprocess)
  Order Processing lane → Order Management System (OMS) (new order
    record creation request)
  Order Management System (OMS) → Order Processing lane (confirmed
    order reference and record status)

7. Data objects

Data Object "Inbound Order" — written by "Capture order details
  from Customer"; read by "Review and classify order".
Data Object "Order Acknowledgement" — written by "Send order
  acknowledgement to Customer".
Data Object "Supporting Documents" — written by "Attach supporting
  documents to order"; read by "Create order record in OMS".
Data Store "Order Management System (OMS)" — written by "Create
  order record in OMS"; read by "Assign order reference number".

V01.01 Receive Order captures every inbound purchase request regardless
of channel, ensures all required order details are collected from the
Customer, and creates a complete, referenced order record in the Order
Management System. The recorded order — with its reference number and
supporting documents — is handed to V01.02 Validate Customer / Order
for data and eligibility checks.
```

### V01.02 — Validate Customer / Order

**BPMN diagram prompt.**

```text
BPMN: V01.02 Validate Customer / Order — second subprocess in the
Order to Cash value chain, receiving a captured order from V01.01
and handing a fully validated order to Credit & Pricing (V01.03).

1. Pools & Lanes

Pool "Sales Organisation" — the company running the Order to Cash
process, containing all active lanes for this subprocess.
  Lane "Order Processing" — order processor who leads validation
  Lane "Customer Service" — customer support agent who contacts the
  customer when information is missing or incorrect
Pool "Customer" — the external buyer who submitted the order
Pool "Customer Master Data System (CRM/ERP)" — IT system holding
customer master data and order records used for validation

2. Pool properties

Pool "Sales Organisation": white-box, single instance
Pool "Customer": black-box, single instance
Pool "Customer Master Data System (CRM/ERP)": black-box,
  System = true, single instance

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Customer Master Data System (CRM/ERP)

4. Lane contents in flow order (Sales Organisation)

Order Processing lane:
  Message start event "Validated order request received from
    Receive Order (V01.01)"
  Service task "Retrieve customer master record"
  Exclusive gateway "Customer record found?"
  - branch "No — customer unknown":
      User task "Create new customer master record"
      (continues to exclusive merge gateway
      "Customer record found")
  - branch "Yes — existing customer":
      (continues directly to exclusive merge gateway
      "Customer record found")
  Exclusive merge gateway "Customer record found"
  Service task "Retrieve order details from OMS"
  Expanded Subprocess "Repeat Until Order Details Complete"
    (standard loop) containing, in order:
      User task "Check order line items and quantities",
      User task "Check delivery address and instructions",
      User task "Check pricing references and currency",
      Exclusive gateway "All mandatory fields present and
        consistent?"
      - branch "No — details incomplete or inconsistent":
          Send task "Request missing or corrected information
            from customer"
          Intermediate message catch event "Customer provides
            corrected information"
          (loop repeats)
      - branch "Yes — details complete":
          (exits subprocess)
  User task "Validate customer credit account status"
  Exclusive gateway "Customer account in good standing?"
  - branch "No — account flagged or on hold":
      User task "Flag order for Credit Control review"
      End event "Order flagged — referred to Credit Control
        for manual review; does not proceed to V01.03
        automatically"
  - branch "Yes — account acceptable":
      (continues to exclusive merge gateway
      "Account standing check")
  Exclusive merge gateway "Account standing check"
  Service task "Record validated order in CRM/ERP"
  User task "Confirm order acceptance and assign order reference"

Customer Service lane:
  Send task "Send order confirmation to customer"
  End event "Order validated and confirmed — ready for
    Check Credit & Pricing (V01.03)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess
  "Repeat Until Order Details Complete", labelled "5-business-day
  response deadline exceeded"; on trigger: escalation flows to
  User task "Escalate unresponsive order to Customer Service
  supervisor" in Customer Service lane, then to an End event
  "Order cancelled — customer unresponsive".

6. Connectors

Sequence flows: flow begins in Order Processing lane with the
  message start event, passes through customer record lookup,
  the create-new-record branch rejoining at the exclusive merge
  gateway "Customer record found", then through order retrieval
  and the standard-loop subprocess (with its internal
  incomplete/complete gateway branches, the incomplete branch
  sending a message and catching a reply before looping, the
  complete branch exiting), then to credit account status check
  whose "flagged" branch ends at its own end event and whose
  "acceptable" branch rejoins at the exclusive merge gateway
  "Account standing check", then through CRM/ERP recording and
  order-reference assignment in Order Processing, continuing into
  Customer Service lane for the confirmation send task, and
  closing at the Customer Service end event.

Message flows:
  Customer → Order Processing (corrected order information in
    response to information request)
  Order Processing → Customer (request for missing or corrected
    order information, via Send task inside loop subprocess)
  Customer Service → Customer (order confirmation and assigned
    order reference)
  Order Processing → Customer Master Data System (CRM/ERP)
    (customer master record query and new-record creation)
  Customer Master Data System (CRM/ERP) → Order Processing
    (customer master record, credit account status, and order
    data retrieved)
  Order Processing → Customer Master Data System (CRM/ERP)
    (validated order written back to system)

7. Data objects

Data Object "Captured Order" — read by Service task "Retrieve
  order details from OMS"
Data Object "Customer Master Record" — read by Service task
  "Retrieve customer master record"; written by User task
  "Create new customer master record"
Data Object "Validated Order" — written by Service task "Record
  validated order in CRM/ERP"; read by User task "Confirm order
  acceptance and assign order reference"
Data Object "Order Confirmation" — written by Send task "Send
  order confirmation to customer"
Data Store "Customer Master Data System (CRM/ERP)" — read and
  written by Service task "Retrieve customer master record",
  Service task "Record validated order in CRM/ERP", and User
  task "Create new customer master record"

V01.02 validates that the customer exists in the master data
system, that all order lines, quantities, addresses, and pricing
references are complete and consistent, and that the customer
account carries no block that would prevent fulfilment. Once
every check passes, an order reference is assigned and a
confirmation is sent to the customer. The subprocess hands a
fully validated, reference-stamped order to Check Credit &
Pricing (V01.03) for credit limit assessment and final price
confirmation.
```

### V01.03 — Check Credit & Pricing

**BPMN diagram prompt.**

```text
BPMN: V01.03 Check Credit & Pricing — third subprocess in the Order to
Cash value chain, receiving a validated order from V01.02 and handing a
credit-confirmed, priced order to V01.04 Confirm Availability.

1. Pools & Lanes

Pool "Sales Organisation" — the internal teams performing credit and pricing
checks.
  Lanes (top to bottom):
  - Sales / Pricing (sales operations analyst, pricing analyst)
  - Credit Control (credit officer)

Pool "Customer" — the external buyer, contacted if credit issues arise.

Pool "ERP / Credit System" — IT system providing credit status and pricing
data.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "ERP / Credit System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. ERP / Credit System

4. Lane contents in flow order (Sales Organisation)

Sales / Pricing lane:
  Message start event "Validated order received from V01.02"
  Service task "Retrieve pricing and discount schedule from ERP"
  User task "Apply pricing rules, discounts and tax to order"
  User task "Confirm final order price and margin"
  Exclusive gateway "Pricing approved?"
    - branch "Yes": continue to Credit Control lane
    - branch "No — pricing exception": User task "Escalate pricing exception
      to sales operations analyst"
      Intermediate message catch event "Pricing decision received"
      Exclusive merge gateway "Pricing approved?"
      continue to Credit Control lane
  Exclusive merge gateway "Pricing approved?"

Credit Control lane:
  Service task "Retrieve customer credit status from ERP / Credit System"
  Exclusive gateway "Credit limit sufficient?"
    - branch "Yes": continue to final steps
    - branch "No — insufficient credit":
      Expanded Subprocess "Repeat Until Credit Resolution" (standard loop)
      containing, in order: User task "Review credit exposure and payment
      history", Send task "Notify customer of credit hold",
      Intermediate message catch event "Customer response received",
      User task "Assess customer response and supporting documents"
      Exclusive gateway "Credit resolved?"
        - branch "Yes": continue to final steps
        - branch "No — credit denied": Send task "Notify customer of credit
          rejection"
          End event "Order rejected — process ends"
      Exclusive merge gateway "Credit resolved?"
  Exclusive merge gateway "Credit limit sufficient?"
  User task "Record credit approval and pricing confirmation in ERP"
  End event "Credit and pricing confirmed — ready for Confirm
  Availability (V01.04)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until Credit
Resolution" — label "Credit resolution deadline exceeded (5 business days)"
— on trigger: User task "Escalate unresolved credit hold to finance
controller", then End event "Order escalated — process ends".

6. Connectors

Sequence flows: flow begins in the Sales / Pricing lane with the start event,
proceeds through pricing retrieval and rule application, then through the
pricing approval gateway; the exception branch loops through escalation and an
intermediate catch event before rejoining at the exclusive merge gateway;
approved flow crosses into the Credit Control lane for credit status retrieval,
then through the credit sufficiency gateway; the insufficient-credit branch
enters the standard-loop subprocess, rejoining the credit sufficiency merge
gateway on resolution; the main path ends with ERP recording and the end event.

Message flows:
ERP / Credit System → Sales / Pricing lane — pricing schedule and discount
  data (retrieved by "Retrieve pricing and discount schedule from ERP").
Sales / Pricing lane → ERP / Credit System — confirmed pricing and margin
  data (written by "Confirm final order price and margin").
ERP / Credit System → Credit Control lane — customer credit status and limit
  data (retrieved by "Retrieve customer credit status from ERP / Credit
  System").
Credit Control lane → Customer — credit hold notification (sent by "Notify
  customer of credit hold").
Customer → Credit Control lane — customer response and supporting documents
  (caught by "Customer response received").
Credit Control lane → Customer — credit rejection notification (sent by
  "Notify customer of credit rejection").
Credit Control lane → ERP / Credit System — credit approval and pricing
  confirmation record (written by "Record credit approval and pricing
  confirmation in ERP").

7. Data objects

Data Object "Validated Order" — read by "Apply pricing rules, discounts and
  tax to order".
Data Object "Pricing and Discount Schedule" — read by "Apply pricing rules,
  discounts and tax to order"; written by "Retrieve pricing and discount
  schedule from ERP".
Data Object "Priced Order" — written by "Confirm final order price and
  margin"; read by "Record credit approval and pricing confirmation in ERP".
Data Object "Customer Credit Status Report" — written by "Retrieve customer
  credit status from ERP / Credit System"; read by "Review credit exposure and
  payment history".
Data Object "Credit Resolution Documents" — read by "Assess customer response
  and supporting documents".
Data Store "ERP / Credit System Master" — read by "Retrieve customer credit
  status from ERP / Credit System"; written by "Record credit approval and
  pricing confirmation in ERP".

V01.03 Check Credit & Pricing takes the validated order from V01.02, applies
the organisation's pricing rules, discounts, and tax treatment to produce a
confirmed order value, then verifies that the customer holds sufficient credit
to proceed. Where credit is insufficient, the subprocess engages the customer
to resolve the hold within a defined deadline, escalating or rejecting the
order if resolution fails. On successful completion it passes a credit-approved,
fully priced order to V01.04 Confirm Availability.
```

### V01.04 — Confirm Availability

**BPMN diagram prompt.**

```text
BPMN: V01.04 Confirm Availability — fourth subprocess in the Order to Cash
value chain, receiving a credit-confirmed order and reserving inventory before
passing to fulfilment.

1. Pools & Lanes

Pool "Sales Organisation" — the organisation running the Confirm Availability
process, containing Order Processing and Planning / Inventory lanes.
Pool "Customer" — the external buyer who placed the order.
Pool "Inventory / Warehouse System (WMS)" — the warehouse management system
that holds inventory availability data and processes reservations.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Inventory / Warehouse System (WMS)" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Inventory / Warehouse System (WMS)

4. Lane contents in flow order (Sales Organisation)

Order Processing lane:
  Message start event "Credit-confirmed order received from V01.03"
  Service task "Retrieve order lines for availability check"
  Send task "Send availability enquiry to WMS"
  Intermediate message catch event "WMS availability response received"
  Exclusive gateway "All items available?"
  - branch "Yes — fully available": continues to "Reserve inventory in WMS"
  - branch "Partial — some items unavailable": User task
    "Review partial availability and determine fulfilment option"
    Exclusive gateway "Acceptable partial fulfilment?"
    - branch "Yes — proceed with partial": continues to merge gateway
      "Availability resolution"
    - branch "No — escalate to planner": passes to Planning / Inventory lane
      via sequence flow to task "Assess sourcing or backorder options"
  - branch "No — nothing available": User task
    "Review full stock-out and determine action"
    Exclusive gateway "Order can be backordered or sourced?"
    - branch "Yes": passes to Planning / Inventory lane via sequence flow to
      task "Assess sourcing or backorder options"
    - branch "No — cancel line": Send task "Notify Customer of unavailability"
      End event "Order line cancelled — no stock available"
  Exclusive merge gateway "Availability resolution"
  Service task "Reserve inventory in WMS"
  Send task "Send order confirmation and availability update to Customer"
  End event "Inventory reserved and confirmed — ready for Fulfil Goods or
  Services (V01.05)"

Planning / Inventory lane:
  User task "Assess sourcing or backorder options"
  Expanded Subprocess "Repeat Until Sourcing Decision Reached" (standard loop)
    containing, in order: User task "Contact alternate warehouse or supplier",
    User task "Update expected availability date"
  Exclusive gateway "Sourcing or backorder confirmed?"
  - branch "Yes": sequence flow returns to Order Processing lane at
    exclusive merge gateway "Availability resolution"
  - branch "No — cannot fulfil": sequence flow to Send task "Notify Customer
    of unavailability" End event "Order line cancelled — no stock available"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Sourcing Decision Reached" — label "Sourcing timeout: 48 hours exceeded" —
on expiry, flow moves to Send task "Notify Customer of unavailability" then
to End event "Order line cancelled — no stock available".

6. Connectors

Sequence flows: flow begins in the Order Processing lane at the message
start event, moves through retrieval and enquiry tasks to the WMS response
catch event, then enters the "All items available?" gateway. The "Yes" branch
and the resolved partial and backorder branches all rejoin at the exclusive
merge gateway "Availability resolution" before continuing to inventory
reservation, customer notification, and the end event. The "partial —
unacceptable" and "no stock — backorderable" branches cross into the Planning
/ Inventory lane; once sourcing is confirmed, flow crosses back to the
merge gateway in Order Processing. Unresolvable branches terminate at their
own end events without rejoining.

Message flows:
Customer → Sales Organisation / Order Processing (credit-confirmed order
details, initiating the subprocess via V01.03 handoff)
Sales Organisation / Order Processing → Inventory / Warehouse System (WMS)
(availability enquiry carrying order lines)
Inventory / Warehouse System (WMS) → Sales Organisation / Order Processing
(availability response with stock levels and reservation confirmation)
Sales Organisation / Order Processing → Inventory / Warehouse System (WMS)
(inventory reservation instruction)
Sales Organisation / Order Processing → Customer (order confirmation and
availability update)
Sales Organisation / Order Processing → Customer (unavailability notification,
on cancelled branches)

7. Data objects

Data Object "Credit-Confirmed Order" — read by "Retrieve order lines for
availability check".
Data Object "Availability Enquiry" — written by "Send availability enquiry
to WMS"; read by Inventory / Warehouse System (WMS).
Data Object "WMS Availability Response" — written by Inventory / Warehouse
System (WMS); read by Order Processing lane after intermediate message catch
event.
Data Object "Sourcing or Backorder Record" — written by "Assess sourcing
or backorder options"; read by "Update expected availability date".
Data Store "Inventory Reservation Register" — written by "Reserve inventory
in WMS"; read by V01.05 Fulfil Goods or Services.
Data Object "Order Confirmation Notice" — written by "Send order confirmation
and availability update to Customer".

V01.04 Confirm Availability takes the credit-confirmed sales order from
V01.03, queries the WMS for stock levels across all ordered lines, and either
reserves inventory immediately or routes shortfalls through the Planning /
Inventory team for sourcing or backorder decisions. Unavailable lines that
cannot be resolved are closed with a customer notification, while all
confirmed lines exit with a firm inventory reservation recorded in the WMS.
The subprocess hands a fully reserved order to V01.05 Fulfil Goods or
Services.
```

### V01.05 — Fulfil Goods or Services

**BPMN diagram prompt.**

```text
BPMN: V01.05 Fulfil Goods or Services — the internal fulfilment subprocess
that picks, packs, and quality-checks goods before handoff to delivery
within the Order to Cash value chain.

1. Pools & Lanes

Pool "Sales Organisation" — the company running the fulfilment process,
containing the Warehouse / Operations and Quality Assurance lanes.
Pool "Inventory / Warehouse System (WMS)" — the warehouse management
system that drives inventory updates and records fulfilment activity.

2. Pool properties

Pool "Sales Organisation": white-box, single instance.
Pool "Inventory / Warehouse System (WMS)": black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Sales Organisation (white-box, spans full width)
2. Inventory / Warehouse System (WMS) (black-box, foot of diagram)

4. Lane contents in flow order (Sales Organisation)

Warehouse / Operations lane:
  Message start event "Confirmed availability received from V01.04"
  Service task "Retrieve pick list from WMS"
  Expanded Subprocess "Repeat Until All Lines Picked" (standard loop)
    containing, in order: User task "Pick order line from stock",
    User task "Scan and confirm picked item", Service task "Update
    pick status in WMS"
  User task "Stage picked goods at packing station"
  User task "Pack goods per delivery and labelling requirements"
  Service task "Record packed order in WMS"
  User task "Print shipping label and packing documentation"
  Send task "Transfer packed goods to Quality Assurance"

Quality Assurance lane:
  Intermediate message catch event "Packed goods received from
    Warehouse / Operations"
  User task "Inspect goods against order and quality standards"
  Exclusive gateway "Quality check passed?"
    - branch "Yes": Service task "Record quality clearance in WMS",
      then continue to End event
    - branch "No — minor defect": User task "Quarantine defective
      items and log defect", then User task "Notify Warehouse /
      Operations to repick or repack", then Intermediate message
      catch event "Replacement goods received", then loop back
      into inspect step via Exclusive merge gateway "Quality
      check passed"
    - branch "No — critical failure": User task "Raise fulfilment
      exception and notify fulfilment coordinator", End event
      "Fulfilment exception raised — order placed on hold" (does
      not rejoin)
  Exclusive merge gateway "Quality check passed"
  Service task "Record quality clearance in WMS"
  End event "Goods cleared and ready for Deliver to Customer (V01.06)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
All Lines Picked" — label "Pick time limit exceeded (e.g. 4 hours)" —
triggers User task "Escalate picking delay to fulfilment coordinator",
then End event "Fulfilment delayed — order placed on hold".

6. Connectors

Sequence flows: flow begins in the Warehouse / Operations lane and
passes through the picking loop, packing steps, and documentation tasks
before crossing to the Quality Assurance lane via the transfer send
task. In Quality Assurance, the inspect-and-check gateway branches to
clearance (rejoining at the Exclusive merge gateway "Quality check
passed"), to a minor-defect loop returning to the same merge gateway
after replacement goods arrive, or to the critical-failure End event
which does not rejoin.

Message flows:
Inventory / Warehouse System (WMS) → Warehouse / Operations lane
  (pick list delivered to "Retrieve pick list from WMS").
Warehouse / Operations lane → Inventory / Warehouse System (WMS)
  (pick status update sent from "Update pick status in WMS").
Warehouse / Operations lane → Inventory / Warehouse System (WMS)
  (packed order record sent from "Record packed order in WMS").
Quality Assurance lane → Inventory / Warehouse System (WMS)
  (quality clearance record sent from "Record quality clearance
  in WMS").

7. Data objects

Data Object "Pick List" — read by "Retrieve pick list from WMS",
  read by User task "Pick order line from stock".
Data Object "Packing Documentation" — written by "Pack goods per
  delivery and labelling requirements", read by "Print shipping
  label and packing documentation".
Data Object "Shipping Label" — written by "Print shipping label
  and packing documentation".
Data Object "Quality Inspection Record" — written by "Inspect
  goods against order and quality standards", written by
  "Record quality clearance in WMS".
Data Object "Defect / Exception Log" — written by "Quarantine
  defective items and log defect", written by "Raise fulfilment
  exception and notify fulfilment coordinator".
Data Store "WMS Inventory Ledger" — updated by "Update pick status
  in WMS", updated by "Record packed order in WMS", updated by
  "Record quality clearance in WMS".

V01.05 Fulfil Goods or Services covers all internal activity from the
receipt of a confirmed availability signal through picking, packing,
labelling, and quality inspection. Minor defects trigger a controlled
repick-and-reinspect cycle; critical failures raise a hold that routes
the order to exception management. On successful quality clearance the
subprocess hands packed, labelled, and approved goods to V01.06 Deliver
to Customer, carrying the shipping documentation and updated WMS records
needed by the logistics team.
```

### V01.06 — Deliver to Customer

**BPMN diagram prompt.**

```text
BPMN: V01.06 Deliver to Customer — the sixth subprocess in the Order to
Cash value chain, covering dispatch through to confirmed delivery.

1. Pools & Lanes

Pool "Sales Organisation" — the company executing the delivery process,
  with lanes for Logistics / Dispatch and the delivering role.
Pool "Customer" — the external buyer receiving the shipment.
Pool "Freight Carrier" — the external party transporting the goods.
Pool "Transport Management System (TMS)" — the IT system managing
  shipment records, carrier bookings, and delivery confirmations.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Freight Carrier" — black-box, single instance.
Pool "Transport Management System (TMS)" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Freight Carrier
4. Transport Management System (TMS)

4. Lane contents in flow order (Sales Organisation)

Logistics / Dispatch lane:
  Message start event "Fulfilment complete — ready for Deliver to
    Customer (V01.06)"
  User task "Review dispatch instructions and delivery terms"
  Service task "Create shipment record in TMS"
  User task "Book freight carrier and confirm collection slot"
  Send task "Send shipment booking confirmation to Freight Carrier"
  Intermediate message catch event "Carrier collection confirmed"
  User task "Prepare shipping documentation (packing list, bill of
    lading, delivery note)"
  Service task "Record shipping documents in TMS"
  User task "Hand goods over to Freight Carrier"
  Send task "Send shipment notification to Customer"
  Service task "Update shipment status to In Transit in TMS"
  Intermediate timer catch event "Delivery window elapsed"
  Exclusive gateway "Delivery confirmed by Carrier?"
  - branch "Yes — proof of delivery received":
      Service task "Record delivery confirmation in TMS"
      Send task "Send delivery confirmation to Customer"
      Exclusive merge gateway "Delivery confirmed by Carrier?"
  - branch "No — delivery not confirmed":
      User task "Investigate delivery status with Freight Carrier"
      Intermediate message catch event "Updated delivery status
        received from Carrier"
      Exclusive gateway "Issue resolved?"
      - branch "Yes — delivery now confirmed":
            Service task "Record delivery confirmation in TMS"
            Send task "Send delivery confirmation to Customer"
            Exclusive merge gateway "Issue resolved?"
      - branch "No — delivery failed or lost":
            User task "Escalate failed delivery and arrange
              remedial action"
            Exclusive merge gateway "Issue resolved?"
      Exclusive merge gateway "Delivery confirmed by Carrier?"
  End event "Delivery confirmed — ready for Issue Invoice (V01.07)"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on user task "Investigate
  delivery status with Freight Carrier", labelled "48-hour
  escalation deadline", triggering user task "Escalate failed
  delivery and arrange remedial action" if no response is received
  within 48 hours.

6. Connectors

Sequence flows: the flow runs entirely within the Logistics / Dispatch
lane from the message start event through preparation, booking, and
handover tasks, pausing at the intermediate timer catch event before
reaching the Exclusive gateway "Delivery confirmed by Carrier?". The
Yes branch records confirmation and notifies the customer, then merges.
The No branch investigates, waits for a carrier update, reaches the
nested "Issue resolved?" gateway, whose Yes sub-branch also records
confirmation and notifies the customer before merging at "Issue
resolved?" and then at "Delivery confirmed by Carrier?". The No
sub-branch escalates and also merges at "Issue resolved?" before
rejoining at "Delivery confirmed by Carrier?". All branches converge
before the end event.

Message flows:
  Sales Organisation (Send task "Send shipment booking confirmation
    to Freight Carrier") → Freight Carrier (shipment booking and
    collection slot details)
  Freight Carrier → Sales Organisation (Intermediate message catch
    event "Carrier collection confirmed") (collection confirmation)
  Sales Organisation (Send task "Send shipment notification to
    Customer") → Customer (shipment notification with tracking
    details)
  Freight Carrier → Sales Organisation (Intermediate message catch
    event "Updated delivery status received from Carrier") (delivery
    status update or proof of delivery)
  Sales Organisation (Send task "Send delivery confirmation to
    Customer") → Customer (delivery confirmation)
  Sales Organisation (Service task "Create shipment record in TMS")
    → Transport Management System (TMS) (new shipment record)
  Sales Organisation (Service task "Record shipping documents in
    TMS") → Transport Management System (TMS) (shipping
    documentation)
  Sales Organisation (Service task "Update shipment status to In
    Transit in TMS") → Transport Management System (TMS) (in-transit
    status update)
  Sales Organisation (Service task "Record delivery confirmation in
    TMS") → Transport Management System (TMS) (delivery confirmation
    record)
  Transport Management System (TMS) → Sales Organisation (Service
    task "Create shipment record in TMS") (carrier rates, routing,
    and scheduling data)

7. Data objects

Data Object "Dispatch Instructions" — read by user task "Review
  dispatch instructions and delivery terms".
Data Object "Shipment Record" — written by service task "Create
  shipment record in TMS"; read by service task "Update shipment
  status to In Transit in TMS".
Data Object "Freight Booking Confirmation" — written by user task
  "Book freight carrier and confirm collection slot"; read by send
  task "Send shipment booking confirmation to Freight Carrier".
Data Object "Shipping Documentation (Packing List, Bill of Lading,
  Delivery Note)" — written by user task "Prepare shipping
  documentation (packing list, bill of lading, delivery note)";
  read by service task "Record shipping documents in TMS".
Data Object "Shipment Notification" — written by send task "Send
  shipment notification to Customer".
Data Object "Proof of Delivery" — written by service task "Record
  delivery confirmation in TMS"; read by send task "Send delivery
  confirmation to Customer".
Data Store "Transport Management System Record Store" — written by
  service task "Create shipment record in TMS"; updated by service
  task "Record delivery confirmation in TMS".

This subprocess takes fulfilled goods from the warehouse and manages
their handover to the Freight Carrier, in-transit tracking, and final
delivery confirmation to the Customer. It produces a verified proof of
delivery and updates the shipment record in the TMS, providing the
confirmed-delivery event that the Billing team needs to trigger invoice
generation in V01.07 Issue Invoice.
```

### V01.07 — Issue Invoice

**BPMN diagram prompt.**

```text
BPMN: V01.07 Issue Invoice — the billing subprocess that generates and
delivers a tax-compliant invoice to the customer after goods or services
have been delivered, and hands a posted receivable to Receive Payment
(V01.08).

1. Pools & Lanes

Pool "Sales Organisation" — the company running the Order to Cash process,
  containing the Billing and Finance lanes.
  Lanes (top to bottom):
  - Billing (billing officer)
  - Finance (finance controller)
Pool "Customer" — the external buyer who receives and acknowledges the
  invoice.
Pool "Billing / ERP System" — the IT system that generates, stores, and
  posts invoices and receivables.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Billing / ERP System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation (white-box; Billing lane above Finance lane)
3. Billing / ERP System

4. Lane contents in flow order (Sales Organisation)

Billing lane:
  Message start event "Delivery confirmation received from V01.06"
  User task "Retrieve order and delivery details"
  Service task "Pull pricing, tax, and discount data from Billing / ERP
    System"
  User task "Prepare invoice draft"
  Exclusive gateway "Invoice data complete and accurate?"
    - branch "No — corrections needed":
        Expanded Subprocess "Repeat Until Invoice Data Correct" (standard
          loop) containing, in order: User task "Identify and correct data
          errors", Service task "Re-pull updated data from Billing / ERP
          System"
        (rejoins at Exclusive merge gateway "Invoice data complete and
          accurate?")
    - branch "Yes":
        (continues to Exclusive merge gateway "Invoice data complete and
          accurate?")
  Exclusive merge gateway "Invoice data complete and accurate?"
  User task "Apply tax rules and finalise invoice"
  Service task "Generate and post invoice in Billing / ERP System"
  Exclusive gateway "Invoice requires finance approval?"
    - branch "Yes — value above threshold":
        Send task "Submit invoice for finance approval"
        (passes to Finance lane)
    - branch "No — within billing authority":
        (continues to Exclusive merge gateway "Invoice approved?")

Finance lane:
  Intermediate message catch event "Invoice submitted for approval"
  User task "Review invoice for compliance and accuracy"
  Exclusive gateway "Approved?"
    - branch "Rejected — amend required":
        Send task "Return invoice with comments"
        Intermediate message catch event "Amended invoice received"
        (rejoins at Exclusive merge gateway "Approved?")
    - branch "Approved":
        (continues to Exclusive merge gateway "Approved?")
  Exclusive merge gateway "Approved?"
  Send task "Confirm approval to Billing"
  (returns to Billing lane)

Billing lane (continued):
  Intermediate message catch event "Finance approval confirmed"
  Exclusive merge gateway "Invoice approved?"
  Send task "Transmit invoice to Customer"
  Intermediate message catch event "Customer invoice acknowledgement
    received"
  Exclusive gateway "Customer acknowledges without query?"
    - branch "Query raised":
        Send task "Log query and notify Customer Service"
        End event "Invoice query raised — routed to Manage Disputes &
          Deductions (V01.10)"
    - branch "Acknowledged — no query":
        (continues to Exclusive merge gateway "Customer acknowledges
          without query?")
  Exclusive merge gateway "Customer acknowledges without query?"
  Service task "Confirm receivable posted in Billing / ERP System"
  End event "Invoice posted and receivable confirmed — ready for Receive
    Payment (V01.08)"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Invoice Data Correct" — label "Data correction time limit exceeded (24
  hours)" — triggers Send task "Escalate data issue to Finance controller".
Non-interrupting timer boundary event on User task "Review invoice for
  compliance and accuracy" — label "Finance approval overdue (4 business
  hours)" — triggers Send task "Send approval reminder to finance
  controller".
Interrupting timer boundary event on Intermediate message catch event
  "Customer invoice acknowledgement received" — label "No acknowledgement
  within 5 business days" — triggers Send task "Re-send invoice and request
  acknowledgement".

6. Connectors

Sequence flows: Flow begins in the Billing lane with the Message start
event, passes through invoice preparation and the completeness gateway
(with the correction loop rejoining at the merge gateway), through
finalisation and posting, then branches at the approval gateway — the
"Yes" branch sends the submission to the Finance lane, where the approval
gateway (with its rejection branch re-entering at the merge gateway)
concludes with a confirmation message returning to the Billing lane, while
the "No" branch bypasses Finance and rejoins at the "Invoice approved?"
merge gateway in Billing; flow then continues through invoice transmission,
the customer acknowledgement catch event, and the query gateway, whose
"query" branch ends in its own End event and whose "no query" branch
rejoins at the merge gateway before concluding with receivable confirmation
and the closing End event.

Message flows:
Billing / ERP System → Billing lane, "Pull pricing, tax, and discount
  data" (pricing, tax, and discount data returned to Billing officer).
Billing lane → Billing / ERP System (invoice draft submitted for
  generation and posting).
Billing / ERP System → Billing lane, "Invoice and receivable record
  confirmed" (posted invoice reference).
Billing lane → Customer (invoice document transmitted to customer).
Customer → Billing lane (invoice acknowledgement or query response).

7. Data objects

Data Object "Delivery Confirmation" — read by User task "Retrieve order
  and delivery details".
Data Object "Invoice Draft" — written by User task "Prepare invoice
  draft"; read by User task "Apply tax rules and finalise invoice".
Data Object "Tax and Pricing Data" — read by User task "Apply tax rules
  and finalise invoice"; written by Service task "Pull pricing, tax, and
  discount data from Billing / ERP System".
Data Object "Final Invoice" — written by Service task "Generate and post
  invoice in Billing / ERP System"; read by Send task "Transmit invoice to
  Customer".
Data Object "Finance Approval Record" — written by User task "Review
  invoice for compliance and accuracy"; read by Send task "Confirm approval
  to Billing".
Data Store "Accounts Receivable Ledger" — written by Service task
  "Confirm receivable posted in Billing / ERP System".

V01.07 Issue Invoice takes the delivery confirmation from V01.06 and
produces a tax-compliant, finance-approved invoice that is transmitted to
the customer and acknowledged. Once the invoice is posted to the Accounts
Receivable Ledger and the customer has confirmed receipt without query, the
subprocess closes and passes the open receivable record to V01.08 Receive
Payment for collection.
```

### V01.08 — Receive Payment

**BPMN diagram prompt.**

```text
BPMN: V01.08 Receive Payment — the subprocess that captures, records,
and confirms incoming customer payments within the Order to Cash value chain.

1. Pools & Lanes

Pool "Sales Organisation" — the company receiving and processing payment.
  Lane "Accounts Receivable" — collections officer managing payment receipt.
  Lane "Finance" — finance controller overseeing posting and confirmation.
Pool "Customer" — the external buyer remitting payment.
Pool "Payment Gateway / Bank" — external system processing and clearing funds.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Payment Gateway / Bank" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Payment Gateway / Bank

4. Lane contents in flow order (Sales Organisation)

Accounts Receivable lane:
  Message start event "Invoice payment due — received from Issue Invoice
    (V01.07)"
  User task "Identify expected payment"
  Intermediate message catch event "Payment remittance received from customer"
  User task "Match remittance advice to open invoice"
  Exclusive gateway "Payment method?"
    - branch "Electronic / bank transfer": Service task "Retrieve payment
      confirmation from Payment Gateway / Bank"
      Exclusive merge gateway "Payment method"
    - branch "Cheque / other": User task "Log manual payment receipt"
      Exclusive merge gateway "Payment method"
  User task "Verify payment amount against invoice"
  Exclusive gateway "Payment complete and correct?"
    - branch "Yes — full payment": Exclusive merge gateway "Payment complete
      and correct" (continues to Finance lane)
    - branch "Partial payment": User task "Record partial payment and flag
      outstanding balance"
      Send task "Notify customer of outstanding balance"
      Exclusive merge gateway "Payment complete and correct"
    - branch "Payment not received by due date": Expanded Subprocess "Repeat
      Until Payment Received or Escalated" (standard loop) containing:
        Send task "Send payment chaser to customer",
        Intermediate timer catch event "Chaser wait period (3 business days)",
        User task "Review payment status"
      Exclusive merge gateway "Payment complete and correct"
  User task "Update accounts receivable ledger"
  Send task "Forward payment details to Finance for posting"

Finance lane:
  User task "Post payment to general ledger"
  User task "Issue payment receipt confirmation to customer"
  End event "Payment received and posted — ready for Reconcile Payment
    (V01.09)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until Payment
  Received or Escalated" — label "Escalation deadline exceeded (14 days)" —
  triggers End event "Payment unresolved — escalated to Manage Disputes &
  Deductions (V01.10)".

6. Connectors

Sequence flows: work begins in the Accounts Receivable lane with the message
start event, proceeds through identification and matching tasks to the payment
method gateway, whose two branches — electronic and manual — rejoin at the
"Payment method" merge gateway, then continue to verification and the "Payment
complete and correct" exclusive gateway; the full-payment branch, the partial-
payment branch (after customer notification), and the loop subprocess branch
all rejoin at the "Payment complete and correct" merge gateway before the
ledger update task and handoff to Finance; Finance posts and confirms, then the
process ends.

Message flows:
  Customer → Accounts Receivable lane (remittance advice / payment
    notification)
  Payment Gateway / Bank → Accounts Receivable lane (electronic payment
    confirmation)
  Accounts Receivable lane → Customer (outstanding balance notification)
  Accounts Receivable lane → Customer (payment chaser, inside loop subprocess)
  Finance lane → Customer (payment receipt confirmation)
  Finance lane → Payment Gateway / Bank (payment posting acknowledgement)

7. Data objects

Data Object "Remittance Advice" — read by "Match remittance advice to open
  invoice" / written by "Identify expected payment".
Data Object "Open Invoice" — read by "Match remittance advice to open invoice"
  / read by "Verify payment amount against invoice".
Data Object "Payment Confirmation" — written by "Retrieve payment confirmation
  from Payment Gateway / Bank" / read by "Verify payment amount against
  invoice".
Data Object "Partial Payment Record" — written by "Record partial payment and
  flag outstanding balance" / read by "Update accounts receivable ledger".
Data Store "Accounts Receivable Ledger" — written by "Update accounts
  receivable ledger" / read by "Post payment to general ledger".
Data Store "General Ledger" — written by "Post payment to general ledger".
Data Object "Payment Receipt" — written by "Issue payment receipt confirmation
  to customer".

V01.08 Receive Payment captures incoming customer payments, matches them to
open invoices, resolves shortfalls through chasing or partial-payment logging,
and posts confirmed amounts to both the accounts receivable ledger and the
general ledger. Unresolved payments beyond the escalation deadline are routed
to V01.10 Manage Disputes & Deductions, while successfully posted payments are
handed to V01.09 Reconcile Payment for bank and ledger reconciliation.
```

### V01.09 — Reconcile Payment

**BPMN diagram prompt.**

```text
BPMN: V01.09 Reconcile Payment — the subprocess that matches incoming
payments to open receivables and posts confirmed settlements to the
general ledger, sitting between Receive Payment (V01.08) and Manage
Disputes & Deductions (V01.10) or Close Order (V01.11) in the
Order to Cash chain.

1. Pools & Lanes

Pool "Sales Organisation" — the company performing reconciliation,
  with the following lanes top to bottom:
  - Accounts Receivable (reconciliations analyst)
  - Finance (finance controller)
Pool "Bank" — external bank providing the bank statement / transaction
  feed.
Pool "ERP / General Ledger System" — IT system that records matched
  payments and financial postings.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Bank" — black-box, single instance.
Pool "ERP / General Ledger System" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Bank
2. Sales Organisation
3. ERP / General Ledger System

4. Lane contents in flow order (Sales Organisation)

Accounts Receivable lane:
  Message start event "Payment record received from V01.08"
  Service task "Retrieve bank statement / transaction feed"
  Intermediate message catch event "Bank statement data received"
  User task "Match payment transactions to open receivables"
  Exclusive gateway "All items matched?"
  - branch "Unmatched items remain":
      Expanded Subprocess "Repeat Until All Items Resolved" (standard
      loop) containing, in order: User task "Investigate unmatched
      transaction", User task "Apply manual matching or flag for
      dispute", Exclusive gateway "Item resolved?"
      - branch "Resolved": continue to merge
      - branch "Escalate to Finance": Send task "Escalate unresolved
        item to Finance"
  - branch "Fully matched":
      continue to Exclusive merge gateway "All items matched"
  Exclusive merge gateway "All items matched"
  User task "Review matched payment register"
  Send task "Send matched payment register to Finance for approval"

Finance lane:
  Intermediate message catch event "Matched payment register received"
  User task "Review and approve payment reconciliation"
  Exclusive gateway "Reconciliation approved?"
  - branch "Rejected — rework required":
      Send task "Return reconciliation to Accounts Receivable with
      comments"
      Intermediate message catch event "Revised register received"
      continue to Exclusive merge gateway "Reconciliation approved"
  - branch "Approved":
      continue to Exclusive merge gateway "Reconciliation approved"
  Exclusive merge gateway "Reconciliation approved"
  Service task "Post settled payments to General Ledger"
  Intermediate message catch event "Posting confirmation received
  from ERP / General Ledger System"
  User task "Confirm period reconciliation is complete"
  Exclusive gateway "Unresolved items require dispute handling?"
  - branch "Yes — disputes exist":
      End event "Unresolved items escalated — ready for Manage
      Disputes & Deductions (V01.10)"
  - branch "No — all items cleared":
      End event "Reconciliation complete — ready for Close Order
      (V01.11)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
All Items Resolved" — label "Resolution deadline exceeded (2 business
days)" — triggers escalation Send task "Notify Finance of overdue
unmatched items"; flow continues to Finance lane for manual review.

6. Connectors

Sequence flows: work begins in the Accounts Receivable lane with the
message start event, proceeds through statement retrieval, matching,
and the "All items matched?" gateway; the unmatched branch loops
inside the expanded subprocess until resolved or escalated, then
rejoins at the exclusive merge gateway "All items matched"; the
matched flow continues to review and a send task that crosses to the
Finance lane; Finance reviews and the "Reconciliation approved?"
gateway either returns the register to Accounts Receivable (rejoining
at the merge gateway "Reconciliation approved") or approves and
proceeds to general ledger posting; after posting confirmation the
"Unresolved items require dispute handling?" gateway routes to one of
two end events.

Message flows:
Bank → Accounts Receivable lane (bank statement / transaction feed
  carrying payment transaction data)
Accounts Receivable lane → ERP / General Ledger System (matched
  payment register submitted for posting)
ERP / General Ledger System → Finance lane (posting confirmation
  and updated ledger balances)

7. Data objects

Data Object "Bank Statement / Transaction Feed" — written by Service
  task "Retrieve bank statement / transaction feed"; read by User task
  "Match payment transactions to open receivables".
Data Object "Open Receivables Register" — read by User task "Match
  payment transactions to open receivables"; read by User task
  "Investigate unmatched transaction".
Data Object "Matched Payment Register" — written by User task "Match
  payment transactions to open receivables"; read by User task "Review
  matched payment register"; read by User task "Review and approve
  payment reconciliation".
Data Object "Reconciliation Approval Record" — written by User task
  "Review and approve payment reconciliation"; read by Service task
  "Post settled payments to General Ledger".
Data Store "General Ledger" — written by Service task "Post settled
  payments to General Ledger"; read by User task "Confirm period
  reconciliation is complete".

V01.09 Reconcile Payment matches every incoming payment transaction
from the bank statement against open receivable items, resolves or
escalates unmatched entries, and posts approved settlements to the
General Ledger. Where the reconciliation surfaces items that cannot be
matched — short payments, deductions, or disputed amounts — it hands
those to Manage Disputes & Deductions (V01.10). Where all items are
cleared it passes a fully reconciled receivables position to Close
Order (V01.11).
```

### V01.10 — Manage Disputes & Deductions

**BPMN diagram prompt.**

```text
BPMN: V01.10 Manage Disputes & Deductions — subprocess within the Order to
Cash value chain that receives and resolves customer-raised disputes and
deductions before the order can be closed.

1. Pools & Lanes

Pool "Sales Organisation" — the company managing the dispute resolution
  process, with lanes for Customer Service, Accounts Receivable, and Finance.
Pool "Customer" — external buyer raising the dispute or deduction.
Pool "Case / Ticketing System" — IT system used to log, track, and manage
  dispute cases.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Case / Ticketing System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Sales Organisation
3. Case / Ticketing System

4. Lane contents in flow order (Sales Organisation)

Customer Service lane:
  Message start event "Dispute or deduction request received from V01.09"
  User task "Log and categorise dispute or deduction"
  Service task "Create case record in Case / Ticketing System"
  User task "Acknowledge dispute to customer"
  Send task "Send acknowledgement to customer"
  Intermediate message catch event "Supporting documentation received from
    customer"
  User task "Review dispute documentation and determine case type"
  Exclusive gateway "Case type?"
  - branch "Pricing or billing dispute": User task "Refer to Accounts
    Receivable for AR review", then continue to Exclusive merge gateway
    "Case type resolved"
  - branch "Deduction or short payment": User task "Refer to Accounts
    Receivable for deduction assessment", then continue to Exclusive merge
    gateway "Case type resolved"
  - branch "Delivery or quality complaint": User task "Escalate to relevant
    operations team for investigation", then continue to Exclusive merge
    gateway "Case type resolved"
  Exclusive merge gateway "Case type resolved"

Accounts Receivable lane:
  User task "Investigate dispute and verify against order and invoice records"
  Expanded Subprocess "Repeat Until Resolution Determined" (standard loop)
    containing, in order: User task "Gather additional evidence or contact
    customer for clarification", Intermediate message catch event "Customer
    response received", User task "Assess updated information"
  Exclusive gateway "Resolution outcome?"
  - branch "Dispute upheld — credit due": User task "Prepare credit note"
    then continue to Exclusive merge gateway "Resolution outcome merged"
  - branch "Dispute partially upheld": User task "Prepare partial credit note
    and revised payment request", then continue to Exclusive merge gateway
    "Resolution outcome merged"
  - branch "Dispute rejected": User task "Draft rejection notice with
    supporting rationale", then continue to Exclusive merge gateway
    "Resolution outcome merged"
  Exclusive merge gateway "Resolution outcome merged"
  User task "Submit resolution recommendation to Finance for approval"

Finance lane:
  User task "Review and approve resolution recommendation"
  Exclusive gateway "Resolution approved?"
  - branch "Approved": continue to Exclusive merge gateway "Approval outcome"
  - branch "Rejected — refer back": User task "Return to Accounts Receivable
    with guidance", then continue to Exclusive merge gateway "Approval
    outcome"
  Exclusive merge gateway "Approval outcome"
  User task "Post financial adjustment or write-off to general ledger"
  Service task "Update case status in Case / Ticketing System"
  Send task "Send resolution outcome to customer"
  User task "Close dispute case"
  End event "Dispute resolved — ready for Close Order (V01.11)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Resolution Determined", labelled "Resolution deadline exceeded (30 days)",
  leading to User task "Escalate overdue case to Finance controller" in the
  Finance lane, which then joins the flow at User task "Review and approve
  resolution recommendation".
Interrupting error boundary event on Service task "Create case record in Case
  / Ticketing System", labelled "Case system unavailable", leading to User
  task "Log case manually and notify IT support" in the Customer Service lane,
  then rejoining at User task "Acknowledge dispute to customer".

6. Connectors

Sequence flows: work begins in the Customer Service lane with case logging and
  acknowledgement, then moves to the Accounts Receivable lane for
  investigation and resolution determination, with the "Repeat Until
  Resolution Determined" loop handling iterative clarification; the three
  outcome branches of the "Resolution outcome?" gateway each rejoin at the
  "Resolution outcome merged" gateway before the recommendation passes to the
  Finance lane; the "Resolution approved?" gateway either proceeds to posting
  or loops back to Accounts Receivable, with both branches rejoining at the
  "Approval outcome" gateway before adjustment, case closure, and the end
  event.

Message flows:
  Customer → Customer Service lane (dispute or deduction request, including
    purchase order reference and reason)
  Customer → Customer Service lane (supporting documentation, such as proof
    of delivery discrepancy or pricing evidence)
  Customer Service lane → Customer (acknowledgement of dispute receipt)
  Accounts Receivable lane → Customer (request for additional clarification
    or evidence)
  Customer → Accounts Receivable lane (customer response with clarification)
  Finance lane → Customer (resolution outcome notification — credit note,
    partial credit, or rejection letter)
  Customer Service lane → Case / Ticketing System (create case record)
  Finance lane → Case / Ticketing System (update case status and closure)
  Case / Ticketing System → Customer Service lane (case reference and current
    status)
  Case / Ticketing System → Accounts Receivable lane (case details and
    investigation history)

7. Data objects

Data Object "Dispute Request" — written by User task "Log and categorise
  dispute or deduction"; read by User task "Review dispute documentation and
  determine case type".
Data Object "Supporting Documentation" — written by Intermediate message
  catch event "Supporting documentation received from customer"; read by User
  task "Investigate dispute and verify against order and invoice records".
Data Object "Credit Note" — written by User task "Prepare credit note"; read
  by User task "Review and approve resolution recommendation".
Data Object "Partial Credit Note" — written by User task "Prepare partial
  credit note and revised payment request"; read by User task "Review and
  approve resolution recommendation".
Data Object "Rejection Notice" — written by User task "Draft rejection notice
  with supporting rationale"; read by User task "Review and approve resolution
  recommendation".
Data Object "Resolution Recommendation" — written by User task "Submit
  resolution recommendation to Finance for approval"; read by User task
  "Review and approve resolution recommendation".
Data Store "General Ledger" — written by User task "Post financial adjustment
  or write-off to general ledger".
Data Store "Case Register" — written by Service task "Create case record in
  Case / Ticketing System"; read by User task "Investigate dispute and verify
  against order and invoice records"; written by Service task "Update case
  status in Case / Ticketing System".

V01.10 Manage Disputes & Deductions receives dispute or deduction requests
raised by the customer following invoicing or payment, logs and categorises
each case, investigates the underlying cause against order and invoice records,
iterates with the customer for clarification, and determines a resolution
— credit note, partial credit, or rejection — subject to Finance approval and
general ledger posting. Upon closure the subprocess hands a fully resolved case
status and any financial adjustment to V01.11 Close Order.
```

### V01.11 — Close Order

**BPMN diagram prompt.**

```text
BPMN: V01.11 Close Order — the final subprocess of the Order to Cash
value chain, confirming all obligations are met, closing the sales order,
and making the final financial posting to the general ledger.

1. Pools & Lanes

Pool "Sales Organisation" — the internal organisation running the close-order
process, with lanes for Order Processing and Finance.
Pool "Order Management System (OMS)" — IT system used to close and archive
the sales order record.
Pool "ERP / General Ledger System" — IT system used to post the final
financial entries and archive the closed order financially.

2. Pool properties

Pool "Sales Organisation" — white-box, single instance.
Pool "Order Management System (OMS)" — black-box, System = true,
single instance.
Pool "ERP / General Ledger System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Sales Organisation (white-box, process owner)
2. Order Management System (OMS)
3. ERP / General Ledger System

4. Lane contents in flow order (Sales Organisation)

Order Processing lane (order processor):

Message start event "Delivery confirmed and invoice settled — ready for
Close Order (V01.11)"

User task "Review order completion checklist"

Exclusive gateway "All order obligations met?"
- branch "Yes — all obligations met": continue to Service task
  "Mark sales order as closed in OMS"
- branch "No — obligations outstanding": continue to User task
  "Resolve outstanding obligations"
  Intermediate message catch event "Resolution or confirmation received"
  then rejoin at Exclusive merge gateway "All order obligations met"

Exclusive merge gateway "All order obligations met"

Service task "Mark sales order as closed in OMS"

User task "Confirm closure and archive order documentation"

Send task "Send order closure notification to Finance"

Finance lane (finance controller):

Intermediate message catch event "Order closure notification received"

User task "Verify final revenue recognition and tax postings"

Exclusive gateway "Financial postings complete and correct?"
- branch "Yes — postings correct": continue to Service task
  "Post final entries to General Ledger"
- branch "No — corrections needed": continue to User task
  "Correct financial postings"
  then rejoin at Exclusive merge gateway "Financial postings complete
  and correct"

Exclusive merge gateway "Financial postings complete and correct"

Service task "Post final entries to General Ledger"

User task "Archive closed order in ERP / General Ledger System"

End event "Order fully closed — Order to Cash cycle complete"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on User task "Resolve outstanding
obligations" — label "Obligations unresolved after 5 business days" —
triggers Escalation task "Escalate unresolved obligations to Finance
controller"; flow continues after escalation.

Non-interrupting timer boundary event on User task "Correct financial
postings" — label "Posting corrections not completed within 2 business
days" — triggers Escalation task "Escalate posting errors to Finance
controller"; flow continues after escalation.

6. Connectors

Sequence flows: Flow begins in the Order Processing lane at the message
start event, passes through the completion checklist review, then the
"All order obligations met?" gateway; the outstanding-obligations branch
runs through the resolution task and intermediate message catch event
before rejoining at the merge gateway; both branches converge at the
merge, continue to OMS closure, documentation archiving, and the send
task notifying Finance. Flow crosses to the Finance lane at the
intermediate message catch event, proceeds through revenue verification,
the "Financial postings complete and correct?" gateway; the
corrections branch loops through the correction task before rejoining
at the merge gateway; both branches converge at the merge, continue to
the general ledger posting, ERP archiving, and the end event.

Message flows:
Sales Organisation (Send task "Send order closure notification to
Finance") → Sales Organisation Finance lane (Intermediate message
catch event "Order closure notification received") (internal closure
notification).
Sales Organisation (Service task "Mark sales order as closed in OMS")
→ Order Management System (OMS) (close-order instruction).
Order Management System (OMS) → Sales Organisation (User task
"Confirm closure and archive order documentation") (closed order
confirmation).
Sales Organisation (Service task "Post final entries to General
Ledger") → ERP / General Ledger System (final financial postings).
Sales Organisation (User task "Archive closed order in ERP / General
Ledger System") → ERP / General Ledger System (archived order record).
ERP / General Ledger System → Sales Organisation (User task "Verify
final revenue recognition and tax postings") (ledger status and
posting confirmation).

7. Data objects

Data Object "Order Completion Checklist" — read by / written by
"Review order completion checklist".
Data Object "Outstanding Obligations Record" — read by / written by
"Resolve outstanding obligations".
Data Object "Order Closure Notification" — written by "Send order
closure notification to Finance"; read by "Verify final revenue
recognition and tax postings".
Data Store "Sales Order Record (OMS)" — written by "Mark sales order
as closed in OMS"; read by "Confirm closure and archive order
documentation".
Data Store "General Ledger (ERP)" — written by "Post final entries to
General Ledger"; read by "Verify final revenue recognition and tax
postings".
Data Object "Archived Order Documentation" — written by "Archive
closed order in ERP / General Ledger System".

V01.11 Close Order confirms that every commercial, operational, and
financial obligation attached to the sales order has been discharged,
marks the order closed in the Order Management System, verifies and
posts the final revenue-recognition and tax entries to the General
Ledger, and archives the complete order record. It is the terminal
subprocess of the Order to Cash value chain; there is no handoff to a
successor subprocess.
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
BPMN: V02.01 Identify Need — first subprocess of the Procure to Pay
value chain, in which the Requesting Department recognises a purchase
need and Procurement validates and classifies it before passing a
confirmed need statement to Create Requisition (V02.02).

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that identify and
  confirm the purchase need.
  Lanes (top to bottom):
    - Requesting Department (requisitioner)
    - Procurement (procurement officer)
Pool "ERP / Catalogue System" — IT system providing catalogue data,
  approved supplier lists, and budget availability checks.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "ERP / Catalogue System" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
  1. Buying Organisation (white-box, spans both lanes)
  2. ERP / Catalogue System

4. Lane contents in flow order (Buying Organisation)

Requesting Department lane:
  None start event "Need identified"
  User task "Describe and document the purchase need"
  User task "Check catalogue for existing items or contracts"
  Intermediate message catch event "Catalogue and supplier data
    received"
  User task "Assess whether need can be met from existing
    contract or stock"
  Exclusive gateway "Met by existing contract or stock?"
    - branch "Yes — existing contract": End event "Need met
        without new purchase — no further action"
    - branch "No — new purchase required": continue to
        Procurement lane
  Exclusive merge gateway "Met by existing contract or stock?"

Procurement lane:
  User task "Review and validate need description"
  Expanded Subprocess "Repeat Until Need Description Accepted"
    (standard loop) containing, in order:
    User task "Request clarification or additional detail from
      requisitioner",
    Intermediate message catch event "Clarification received",
    Exclusive gateway "Description sufficient?"
      - branch "Yes": reach subprocess end
      - branch "No": loop repeats
  Interrupting timer boundary event on "Repeat Until Need
    Description Accepted" — label "5-business-day deadline";
    on fire: User task "Escalate to Procurement Manager",
    Escalation end event "Need description unresolved —
      escalated"
  User task "Classify need by category and spending threshold"
  Service task "Check budget availability in ERP / Catalogue
    System"
  Intermediate message catch event "Budget availability
    confirmed"
  Exclusive gateway "Budget available?"
    - branch "No — insufficient budget": User task "Notify
        requisitioner of budget shortfall", End event "Need
        rejected — insufficient budget"
    - branch "Yes — budget confirmed": continue
  Exclusive merge gateway "Budget available?"
  User task "Record confirmed need and assign procurement
    reference"
  Service task "Log need in ERP / Catalogue System"
  End event "Need confirmed — ready for Create Requisition
    (V02.02)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on expanded subprocess "Repeat
Until Need Description Accepted", attached to that subprocess
boundary, label "5-business-day deadline"; fires if clarification
is not received and accepted within five business days; routes to
User task "Escalate to Procurement Manager", then to Escalation
end event "Need description unresolved — escalated"; cancels all
remaining iterations of the subprocess.

6. Connectors

Sequence flows: Flow begins in the Requesting Department lane with
the None start event, proceeds through documenting the need and
checking the catalogue, pauses at the intermediate message catch
event while catalogue data is retrieved, then moves to the
assessment gateway. The "Yes" branch ends immediately; the "No"
branch crosses into the Procurement lane at the merge gateway and
continues to need validation, the expanded clarification
subprocess, classification, budget check, and — on a confirmed
budget — recording and logging, ending at the confirmed-need end
event. The "No" branch of the budget gateway ends in its own end
event without rejoining.

Message flows:
  Requesting Department "Check catalogue for existing items or
    contracts" → ERP / Catalogue System (catalogue query and
    supplier list request)
  ERP / Catalogue System → Requesting Department Intermediate
    message catch event "Catalogue and supplier data received"
    (catalogue items, approved suppliers, contract data)
  Procurement "Check budget availability in ERP / Catalogue
    System" → ERP / Catalogue System (budget availability
    request)
  ERP / Catalogue System → Procurement Intermediate message
    catch event "Budget availability confirmed" (budget
    status and available balance)
  Procurement "Log need in ERP / Catalogue System" → ERP /
    Catalogue System (confirmed need record and procurement
    reference)

7. Data objects

Data Object "Purchase Need Description" — written by "Describe
  and document the purchase need"; read by "Review and validate
  need description".
Data Object "Catalogue and Supplier Data" — written by ERP /
  Catalogue System (message flow); read by "Assess whether need
  can be met from existing contract or stock".
Data Object "Need Classification Record" — written by "Classify
  need by category and spending threshold"; read by "Check budget
  availability in ERP / Catalogue System".
Data Store "ERP / Catalogue System Master Data" — read by
  "Check catalogue for existing items or contracts"; written by
  "Log need in ERP / Catalogue System".

V02.01 Identify Need takes an unstructured internal purchase
impulse and turns it into a validated, classified, and
budget-confirmed need statement. The Requesting Department
describes and screens the need against existing contracts and
stock; Procurement validates the description, classifies the
spend, and confirms budget headroom in the ERP / Catalogue
System. The subprocess hands a procurement-referenced need
record to V02.02 Create Requisition, where a formal purchase
requisition will be raised.
```

### V02.02 — Create Requisition

**BPMN diagram prompt.**

```text
BPMN: V02.02 Create Requisition — second subprocess in the Procure to Pay
value chain, converting an identified need into a fully detailed and validated
purchase requisition ready for approval.

1. Pools & Lanes

Pool "Buying Organisation" — the internal organisation performing the
requisition creation process, with two lanes.
  Lane "Requesting Department" — the requisitioner who drafts and
  submits the requisition.
  Lane "Procurement" — the buyer who validates the requisition and
  confirms it is ready for approval.
Pool "Purchase Requisition System" — the IT system that stores
requisitions, enforces completeness rules, checks catalogue pricing,
and routes the document to approval.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Purchase Requisition System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Buying Organisation (white-box, two lanes top to bottom:
   Requesting Department, Procurement)
2. Purchase Requisition System

4. Lane contents in flow order (Buying Organisation)

Requesting Department lane:
  Message start event "Identified need received from Identify
  Need (V02.01)"
  User task "Draft requisition details"
  Service task "Check catalogue and pricing in Purchase
  Requisition System"
  Exclusive gateway "Item on approved catalogue?"
    - branch "Yes": Intermediate message catch event "Catalogue
      price confirmed" — continue to Exclusive merge gateway
      "Item on approved catalogue?"
    - branch "No": User task "Specify non-catalogue item details
      and justification" — continue to Exclusive merge gateway
      "Item on approved catalogue?"
  Exclusive merge gateway "Item on approved catalogue?"
  User task "Attach supporting documents"
  Expanded Subprocess "Repeat Until Requisition Complete" (standard
  loop) containing, in order: User task "Complete or correct
  requisition fields", Service task "Run completeness check in
  Purchase Requisition System", Exclusive gateway "Requisition
  complete?" — branch "Yes" reaches subprocess end, branch "No"
  continues loop
    Timer boundary event (interrupting) on "Repeat Until Requisition
    Complete" labelled "3-day submission deadline" — routes to User
    task "Escalate incomplete requisition to procurement officer"
    then Escalation end event "Requisition not completed — escalated"
  Service task "Submit requisition to Purchase Requisition System"
  Send task "Notify Procurement that requisition is submitted"

Procurement lane:
  Intermediate message catch event "Requisition submission
  notification received"
  User task "Review requisition for policy compliance"
  Exclusive gateway "Requisition valid and policy-compliant?"
    - branch "No": Send task "Return requisition to requisitioner
      with comments" — routes back to Requesting Department;
      Intermediate message catch event "Revised requisition
      received" — continue to Exclusive merge gateway "Requisition
      valid and policy-compliant?"
    - branch "Yes": continue to Exclusive merge gateway "Requisition
      valid and policy-compliant?"
  Exclusive merge gateway "Requisition valid and policy-compliant?"
  Service task "Record validated requisition in Purchase Requisition
  System"
  User task "Confirm requisition ready for approval"
  End event "Validated requisition ready for Approve Purchase
  (V02.03)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Repeat Until Requisition
Complete", labelled "3-day submission deadline", attached to that
expanded subprocess in the Requesting Department lane; when fired,
cancels all retries, routes to User task "Escalate incomplete
requisition to procurement officer" then Escalation end event
"Requisition not completed — escalated".

6. Connectors

Sequence flows: flow begins in the Requesting Department lane at the
message start event, proceeds through drafting, catalogue check, the
exclusive gateway with its two branches merging at the exclusive merge
gateway, supporting-document attachment, the completeness-retry
subprocess, submission, and the send task notifying Procurement; flow
then crosses to the Procurement lane at the intermediate message catch
event, through policy review, the validity gateway whose "No" branch
sends a return task and an intermediate catch event for the revised
requisition before both branches converge at the exclusive merge
gateway, then through recording, confirmation, and the end event.

Message flows:
Purchase Requisition System → Requesting Department lane, Service task
"Check catalogue and pricing in Purchase Requisition System"
(catalogue and pricing data returned).
Requesting Department lane, Service task "Submit requisition to
Purchase Requisition System" → Purchase Requisition System (draft
requisition submitted).
Purchase Requisition System → Procurement lane, Service task "Record
validated requisition in Purchase Requisition System" (requisition
record stored and acknowledgement returned).

7. Data objects

Data Object "Draft Requisition" — written by "Draft requisition
details"; read by "Run completeness check in Purchase Requisition
System".
Data Object "Non-Catalogue Justification" — written by "Specify
non-catalogue item details and justification"; read by "Review
requisition for policy compliance".
Data Object "Supporting Documents" — written by "Attach supporting
documents"; read by "Review requisition for policy compliance".
Data Object "Validated Requisition" — written by "Record validated
requisition in Purchase Requisition System"; read by "Confirm
requisition ready for approval".
Data Store "Purchase Requisition System Record" — written by "Submit
requisition to Purchase Requisition System"; read by "Record
validated requisition in Purchase Requisition System".

V02.02 Create Requisition takes the identified need from V02.01 and
converts it into a fully documented, catalogue-checked, and
policy-compliant purchase requisition. The requisitioner drafts and
corrects the requisition until it is complete, then submits it to the
Purchase Requisition System; the Procurement buyer validates it for
compliance before recording it as ready for onward processing. The
subprocess hands a validated requisition to V02.03 Approve Purchase,
where budget holders and finance will authorise the spend.
```

### V02.03 — Approve Purchase

**BPMN diagram prompt.**

```text
BPMN: V02.03 Approve Purchase — third subprocess in the Procure to Pay
value chain, receiving an approved requisition and returning a budget-confirmed
purchase approval ready for purchase order issue.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that approve the purchase.
  Lane "Procurement" — buyer who prepares the approval package.
  Lane "Budget Holder / Approver" — approver who reviews and approves or
    rejects the purchase.
  Lane "Finance / Treasury" — finance controller who confirms budget
    availability and signs off high-value purchases.
Pool "ERP / Budgeting System" — system that checks budget availability and
  records approval decisions.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "ERP / Budgeting System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Buying Organisation (white-box, process flow)
2. ERP / Budgeting System (black-box, IT system)

4. Lane contents in flow order (Buying Organisation)

Procurement lane:
  Message start event "Approved requisition received from Create
    Requisition (V02.02)"
  User task "Review requisition and prepare approval package"
  Service task "Check budget availability in ERP / Budgeting System"
  Exclusive gateway "Budget available?"
  - branch "No": User task "Notify requisitioner of budget shortfall"
    followed by End event "Budget shortfall — escalated, process
    ends abnormally"
  - branch "Yes": continue to Exclusive gateway merge "Budget
    available"
  Exclusive merge gateway "Budget available"
  User task "Route approval request to Budget Holder / Approver"

Budget Holder / Approver lane:
  Expanded Subprocess "Repeat Until Approval Decision Reached"
    (standard loop) containing, in order:
    User task "Review approval package",
    Intermediate message catch event "Awaiting approver response",
    Exclusive gateway "Decision?"
    - branch "Approved": reach subprocess end
    - branch "Rejected": User task "Record rejection reason",
      followed by End event "Purchase rejected — ends abnormally"
    - branch "More information required": User task "Return package
      to Procurement for clarification", loop continues
  Interrupting timer boundary event on "Repeat Until Approval
    Decision Reached" labelled "Approval deadline exceeded" — routes
    to: User task "Escalate to Finance / Treasury controller",
    then Escalation end event "Approval timeout — escalated,
    process ends abnormally"
  Exclusive merge gateway "Decision"
  Exclusive gateway "High-value purchase requiring Finance sign-off?"
  - branch "Yes": continue to Finance / Treasury lane
  - branch "No": continue to Exclusive gateway merge "Finance
    sign-off required"

Finance / Treasury lane:
  Expanded Subprocess "Repeat Until Finance Sign-off Reached"
    (standard loop) containing, in order:
    User task "Review purchase for financial compliance and
      budget confirmation",
    Intermediate message catch event "Awaiting finance controller
      response",
    Exclusive gateway "Finance decision?"
    - branch "Confirmed": reach subprocess end
    - branch "Rejected": User task "Record finance rejection
      reason", followed by End event "Finance rejected purchase —
      ends abnormally"
    - branch "Clarification required": User task "Request further
      detail from Procurement", loop continues
  Interrupting timer boundary event on "Repeat Until Finance
    Sign-off Reached" labelled "Finance sign-off deadline exceeded"
    — routes to: User task "Escalate to Finance / Treasury manager",
    then Escalation end event "Finance timeout — escalated, process
    ends abnormally"
  Exclusive merge gateway "Finance sign-off required"
  Service task "Record approved purchase decision in ERP /
    Budgeting System"
  End event "Purchase approved — ready for Issue Purchase Order
    (V02.04)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Repeat Until Approval
  Decision Reached" — labelled "Approval deadline exceeded" —
  cancels subprocess; routes to User task "Escalate to Finance /
  Treasury controller" then Escalation end event "Approval timeout
  — escalated, process ends abnormally". Attached in Budget Holder /
  Approver lane.
Interrupting timer boundary event on "Repeat Until Finance Sign-off
  Reached" — labelled "Finance sign-off deadline exceeded" — cancels
  subprocess; routes to User task "Escalate to Finance / Treasury
  manager" then Escalation end event "Finance timeout — escalated,
  process ends abnormally". Attached in Finance / Treasury lane.

6. Connectors

Sequence flows: work begins in the Procurement lane where the buyer
reviews the requisition and checks budget; a "Budget available?"
gateway branches to an abnormal end on "No" and continues on "Yes"
through the merge. The buyer routes the request to the Budget Holder /
Approver lane where the loop subprocess seeks a decision; the "More
information required" branch cycles within the subprocess, the
"Rejected" branch ends abnormally, and "Approved" exits the subprocess.
A "High-value purchase?" gateway branches: "Yes" enters the Finance /
Treasury lane's loop subprocess for sign-off, while "No" bypasses it;
both branches rejoin at the "Finance sign-off required" merge gateway
in the Finance / Treasury lane. From the merge, the approved decision
is recorded and the process ends normally. Timer boundary events on
each loop subprocess route to escalation tasks and escalation end
events outside the normal flow.

Message flows:
  Procurement lane (Service task "Check budget availability in ERP /
    Budgeting System") → ERP / Budgeting System (budget availability
    query).
  ERP / Budgeting System → Procurement lane (Service task "Check
    budget availability in ERP / Budgeting System") (budget
    availability response).
  Finance / Treasury lane (Service task "Record approved purchase
    decision in ERP / Budgeting System") → ERP / Budgeting System
    (approved purchase decision record).

7. Data objects

Data Object "Requisition Package" — read by "Review requisition and
  prepare approval package"; read by "Review approval package".
Data Object "Budget Check Result" — written by "Check budget
  availability in ERP / Budgeting System"; read by exclusive gateway
  "Budget available?".
Data Object "Approval Decision Record" — written by "Record rejection
  reason"; written by "Record finance rejection reason"; written by
  "Record approved purchase decision in ERP / Budgeting System".
Data Store "ERP / Budgeting System Budget Ledger" — written by
  "Record approved purchase decision in ERP / Budgeting System";
  read by "Check budget availability in ERP / Budgeting System".

V02.03 Approve Purchase takes the approved requisition produced in
V02.02, verifies budget availability in the ERP / Budgeting System,
routes the purchase through the Budget Holder / Approver and, where
the value threshold demands it, through Finance / Treasury for
financial compliance sign-off. Each approval stage is wrapped in a
looping subprocess with a hard deadline; budget shortfalls, rejections,
and timeouts all terminate the subprocess abnormally via escalation end
events. A successful run records the confirmed approval decision and
hands a budget-cleared, fully authorised purchase to V02.04 Issue
Purchase Order.
```

### V02.04 — Issue Purchase Order

**BPMN diagram prompt.**

```text
BPMN: V02.04 Issue Purchase Order — fourth subprocess of the Procure
to Pay value chain, converting an approved purchase into a formally
issued purchase order sent to the supplier.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that draft, review,
  and issue the purchase order.
  Lanes (top to bottom):
  - Procurement (buyer)
  - Contract Management (contract manager)
Pool "Supplier" — external party that receives and acknowledges the
  purchase order.
Pool "ERP Procurement System / Supplier Portal" — IT system that
  records and transmits purchase orders.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "ERP Procurement System / Supplier Portal" — black-box,
  System = true, single instance.

3. Layout

Top to bottom:
1. Supplier
2. Buying Organisation
3. ERP Procurement System / Supplier Portal

4. Lane contents in flow order (Buying Organisation)

Procurement lane:
  Message start event "Approved purchase received from V02.03"
  User task "Select or confirm supplier"
  Exclusive gateway "Existing contract in place?"
  - branch "Yes": Exclusive merge gateway "Contract check complete"
  - branch "No": User task "Engage Contract Management for
    contract or one-off terms review"
    Exclusive merge gateway "Contract check complete"
  Service task "Retrieve contract pricing and approved supplier
    details from ERP Procurement System / Supplier Portal"
  User task "Draft purchase order"
  Send task "Send draft PO to Contract Management for review"

Contract Management lane:
  User task "Review PO against contract terms"
  Exclusive gateway "PO terms acceptable?"
  - branch "No": User task "Return PO to Procurement with
    amendments"
    Intermediate message catch event "Revised PO received"
    Exclusive merge gateway "PO terms acceptable?"
  - branch "Yes": Exclusive merge gateway "PO terms acceptable?"
  Send task "Confirm PO approved for issue"

Procurement lane (continued):
  Service task "Record approved PO in ERP Procurement System /
    Supplier Portal"
  Exclusive gateway "Supplier portal available?"
  - branch "Yes": Service task "Transmit PO via Supplier Portal"
    Exclusive merge gateway "PO transmission method resolved"
  - branch "No": Send task "Transmit PO by alternative channel
    (email / EDI)"
    Exclusive merge gateway "PO transmission method resolved"
  Expanded Subprocess "Repeat Until Acknowledgement Received"
    (standard loop) containing, in order:
    Intermediate message catch event "Await supplier
      acknowledgement",
    Exclusive gateway "Acknowledgement received?"
    - branch "Yes": subprocess end
    - branch "No": User task "Chase supplier for acknowledgement"
  [Interrupting timer boundary event "3 business days" on
    Expanded Subprocess — fires if no acknowledgement within
    deadline; see section 5]
  User task "Record supplier acknowledgement on PO"
  Service task "Update PO status to Issued in ERP Procurement
    System / Supplier Portal"
  End event "PO issued and acknowledged — ready for Receive
    Goods / Confirm Services (V02.05)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event "3 business days" on Expanded
  Subprocess "Repeat Until Acknowledgement Received" — fires when
  acknowledgement deadline is exceeded; routes to User task
  "Escalate non-acknowledgement to category manager", followed by
  Escalation end event "PO acknowledgement escalated — no supplier
  response".

6. Connectors

Sequence flows: flow begins in the Procurement lane with the message
  start event, passes through supplier selection and the contract
  check gateway (merging both branches at "Contract check
  complete"), continues to ERP retrieval, PO drafting, and handoff
  to Contract Management; after the terms-acceptable gateway (No
  branch loops back via message catch and merges at "PO terms
  acceptable?", Yes branch proceeds), control returns to Procurement
  via the confirm task; the PO is recorded and the transmission
  gateway splits to portal or alternative channel, merging at "PO
  transmission method resolved"; the acknowledgement subprocess
  follows, with its timer boundary routing to escalation; on normal
  completion the flow proceeds to record acknowledgement, update PO
  status, and the end event.

Message flows:
  Buying Organisation (Send task "Transmit PO via Supplier Portal")
    → ERP Procurement System / Supplier Portal (purchase order
    transmitted)
  Buying Organisation (Send task "Transmit PO by alternative
    channel") → Supplier (purchase order document)
  ERP Procurement System / Supplier Portal → Supplier (purchase
    order via portal)
  Supplier → Buying Organisation (Intermediate message catch event
    "Await supplier acknowledgement") (order acknowledgement)
  Buying Organisation (Service task "Record approved PO in ERP
    Procurement System / Supplier Portal") → ERP Procurement System
    / Supplier Portal (approved PO record written)
  ERP Procurement System / Supplier Portal → Buying Organisation
    (Service task "Retrieve contract pricing and approved supplier
    details") (contract pricing and approved supplier data)

7. Data objects

Data Object "Approved Purchase Request" — read by User task
  "Select or confirm supplier".
Data Object "Purchase Order (Draft)" — written by User task
  "Draft purchase order"; read by User task "Review PO against
  contract terms".
Data Object "Purchase Order (Approved)" — written by Send task
  "Confirm PO approved for issue"; read by Service task "Record
  approved PO in ERP Procurement System / Supplier Portal".
Data Object "Supplier Acknowledgement" — written by User task
  "Record supplier acknowledgement on PO".
Data Store "ERP Procurement System / Supplier Portal — PO
  Register" — written by Service task "Record approved PO in ERP
  Procurement System / Supplier Portal"; written by Service task
  "Update PO status to Issued in ERP Procurement System / Supplier
  Portal"; read by Service task "Retrieve contract pricing and
  approved supplier details from ERP Procurement System / Supplier
  Portal".

V02.04 Issue Purchase Order takes an approved purchase request and
converts it into a formally documented, contracted, and transmitted
purchase order. Contract Management validates terms before issue,
and the ERP Procurement System / Supplier Portal records and
dispatches the order. The subprocess completes only when the
supplier has acknowledged receipt, at which point a confirmed,
issued PO is handed to V02.05 Receive Goods / Confirm Services.
```

### V02.05 — Receive Goods / Confirm Services

**BPMN diagram prompt.**

```text
BPMN: V02.05 Receive Goods / Confirm Services — fifth subprocess of the
Procure to Pay value chain, triggered when a Supplier delivers goods or
confirms services and closing when a Goods Receipt Note is posted and
available for three-way matching in V02.06.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that receive, inspect, and
confirm the delivery.
  Lane "Receiving / Warehouse" (goods receipting officer)
  Lane "Requesting Department" (requisitioner)
Pool "Supplier" — external party that delivers goods or performs services
  and provides delivery documentation.
Pool "Freight Carrier" — external party that physically transports goods
  and provides proof of delivery.
Pool "Inventory / Warehouse System" — warehouse management and goods
  receipt system that records GRNs.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Freight Carrier" — black-box, single instance.
Pool "Inventory / Warehouse System" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Freight Carrier
2. Supplier
3. Buying Organisation
4. Inventory / Warehouse System

4. Lane contents in flow order (Buying Organisation)

Receiving / Warehouse lane:
  Message start event "Delivery arrived from Freight Carrier (V02.04)"
  User task "Check delivery against purchase order and packing slip"
  Exclusive gateway "Delivery acceptable?"
  - branch "No — damaged, short, or wrong goods":
      User task "Record delivery discrepancy"
      Expanded Subprocess "Repeat Until Discrepancy Resolved" (standard
        loop) containing, in order: User task "Contact Supplier to resolve
        discrepancy", Intermediate message catch event "Supplier resolution
        response received", Exclusive gateway "Discrepancy resolved?"
        - branch "Yes": reach subprocess end
        - branch "No": loop continues
      Interrupting timer boundary event on subprocess "5 business days
        elapsed" → User task "Escalate discrepancy to category manager"
        → Escalation end event "Unresolved delivery discrepancy —
        escalated to V02.09"
  - branch "Yes — delivery acceptable":
      (continue to Exclusive merge gateway below)
  Exclusive merge gateway "Delivery acceptable"
  User task "Record goods receipt and quantity in system"
  Service task "Post Goods Receipt Note (GRN) in Inventory / Warehouse
    System"
  Send task "Send GRN confirmation to Requesting Department"

Requesting Department lane:
  Intermediate message catch event "GRN confirmation received"
  Exclusive gateway "Goods match requisition requirement?"
  - branch "No — goods do not match requirement":
      User task "Raise service or quality issue with Receiving / Warehouse"
      (rejoins at Exclusive merge gateway "Requirement check")
  - branch "Yes — goods match requirement":
      (continue to Exclusive merge gateway below)
  Exclusive merge gateway "Requirement check"
  User task "Confirm acceptance of goods or services"
  End event "GRN posted and acceptance confirmed — ready for Match
    PO / GR / Invoice (V02.06)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Discrepancy Resolved", labelled "5 business days elapsed"; fires to
  cancel all retry attempts, routing to User task "Escalate discrepancy
  to category manager", then to Escalation end event "Unresolved delivery
  discrepancy — escalated to V02.09".

6. Connectors

Sequence flows: flow begins in the Receiving / Warehouse lane with the
  message start event, proceeds through the delivery check gateway; the
  "No" branch enters the discrepancy-resolution subprocess whose timer
  boundary routes to escalation; the "Yes" branch and the resolved
  subprocess output both rejoin at the "Delivery acceptable" merge
  gateway, continuing to GRN recording and posting, then a send task
  passes a notification to the Requesting Department lane; there the
  requirement-check gateway "No" branch raises an issue and rejoins the
  "Requirement check" merge gateway alongside the "Yes" branch, continuing
  to acceptance confirmation and the end event.

Message flows:
  Freight Carrier → Receiving / Warehouse lane (delivery arrival
    notification and proof of delivery)
  Supplier → Receiving / Warehouse lane (packing slip and delivery
    documentation)
  Receiving / Warehouse lane → Supplier (discrepancy notification during
    resolution subprocess)
  Supplier → Receiving / Warehouse lane (resolution response during
    resolution subprocess)
  Receiving / Warehouse lane → Inventory / Warehouse System (GRN data
    for posting)
  Inventory / Warehouse System → Receiving / Warehouse lane (posted GRN
    confirmation)

7. Data objects

Data Object "Purchase Order" — read by "Check delivery against purchase
  order and packing slip".
Data Object "Packing Slip / Delivery Note" — read by "Check delivery
  against purchase order and packing slip".
Data Object "Delivery Discrepancy Record" — written by "Record delivery
  discrepancy"; read by "Contact Supplier to resolve discrepancy".
Data Store "Goods Receipt Note (GRN)" — written by "Post Goods Receipt
  Note (GRN) in Inventory / Warehouse System"; read by "Confirm acceptance
  of goods or services".
Data Object "Acceptance Confirmation" — written by "Confirm acceptance
  of goods or services".

V02.05 captures physical or service delivery by verifying the incoming
shipment against the purchase order, resolving any discrepancies with the
Supplier within a five-day deadline, recording and posting the Goods
Receipt Note in the Inventory / Warehouse System, and obtaining formal
acceptance from the Requesting Department. The posted GRN and acceptance
confirmation are then handed to V02.06 Match PO / GR / Invoice, where
they form one leg of the three-way match against the Supplier's invoice.
```

### V02.06 — Match PO / GR / Invoice

**BPMN diagram prompt.**

```text
BPMN: V02.06 Match PO / GR / Invoice — the accounts payable matching
stage of the Procure to Pay value chain, receiving the approved invoice and
open purchase order/goods receipt and confirming three-way match before
handing a matched invoice to invoice approval.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams performing PO/GR/invoice
matching.
  Lanes (top to bottom):
  - Accounts Payable (accounts payable officer)

Pool "Supplier" — external party that submitted the invoice and may need
to be contacted to resolve discrepancies.

Pool "Accounts Payable / Invoice System" — system that holds invoices,
purchase orders, and goods receipt records and performs automated matching.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Accounts Payable / Invoice System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Supplier
2. Buying Organisation
3. Accounts Payable / Invoice System

4. Lane contents in flow order (Buying Organisation)

Accounts Payable lane:
  Message start event "Approved PO, GR record, and supplier invoice
    received from V02.05"
  Service task "Retrieve open PO and GR record from system"
  Service task "Load invoice into matching queue"
  Service task "Run automated three-way match (PO / GR / Invoice)"
  Exclusive gateway "Match result?"
    - branch "Full match": Intermediate message catch event "Matching
        confirmed by Accounts Payable / Invoice System"
      User task "Review and approve matched invoice record"
      Service task "Record matched invoice in Accounts Payable /
        Invoice System"
      End event "Invoice matched — ready for Approve Invoice (V02.07)"
    - branch "Discrepancy identified": User task "Classify discrepancy
        (price, quantity, or missing document)"
      Exclusive gateway "Discrepancy type?"
        - branch "Price or quantity variance": Expanded Subprocess
            "Repeat Until Variance Resolved" (standard loop) containing,
            in order: User task "Raise discrepancy with Supplier",
            Intermediate message catch event "Supplier response received",
            User task "Evaluate Supplier response or credit note",
            Service task "Re-run automated match in Accounts Payable /
            Invoice System", Exclusive gateway "Variance resolved?" whose
            Yes branch reaches the subprocess end and No branch repeats
            the loop.
            Interrupting timer boundary event "10-business-day resolution
            deadline" — on the subprocess boundary — fires, cancels the
            subprocess, routes to: User task "Escalate unresolved variance
            to finance controller", then Escalation end event "Variance
            escalated — routed to Handle Exceptions (V02.09)".
        - branch "Missing document": Expanded Subprocess "Repeat Until
            Document Received" (standard loop) containing, in order:
            User task "Request missing document from Supplier or internal
            team", Intermediate message catch event "Document or
            confirmation received", User task "Verify document
            completeness", Exclusive gateway "Document sufficient?" whose
            Yes branch reaches the subprocess end and No branch repeats
            the loop.
            Interrupting timer boundary event "5-business-day document
            deadline" — on the subprocess boundary — fires, cancels the
            subprocess, routes to: User task "Escalate missing document
            to procurement officer", then Escalation end event "Document
            escalated — routed to Handle Exceptions (V02.09)".
      Exclusive merge gateway "Discrepancy type"
      Service task "Re-run automated three-way match after resolution"
      Exclusive merge gateway "Match result"
      (flow continues to the Full match branch at: User task "Review and
        approve matched invoice record")

5. Edge-mounted (boundary) events

Interrupting timer boundary event "10-business-day resolution deadline"
  — attached to Expanded Subprocess "Repeat Until Variance Resolved"
  — fires when the deadline expires, cancels the subprocess, routes to
  User task "Escalate unresolved variance to finance controller" then
  Escalation end event "Variance escalated — routed to Handle
  Exceptions (V02.09)".

Interrupting timer boundary event "5-business-day document deadline"
  — attached to Expanded Subprocess "Repeat Until Document Received"
  — fires when the deadline expires, cancels the subprocess, routes to
  User task "Escalate missing document to procurement officer" then
  Escalation end event "Document escalated — routed to Handle
  Exceptions (V02.09)".

6. Connectors

Sequence flows: All sequence flows run within the Accounts Payable lane.
From the message start event the flow passes through retrieval and load
tasks to the automated match service task, then to the "Match result?"
gateway. The Full match branch proceeds through the message catch event,
review task, record task, and ends at the matched end event. The
Discrepancy branch passes through the classify task to the "Discrepancy
type?" gateway; the Price/quantity variance branch enters the variance
loop subprocess and, on normal exit, rejoins the discrepancy-type merge
gateway; the Missing document branch enters the document loop subprocess
and, on normal exit, also rejoins the discrepancy-type merge gateway.
After the merge the flow runs a further automated match, then rejoins
the "Match result?" merge gateway, continuing to the review and record
tasks before the normal end event. Timer boundary events on each
subprocess exit to their respective escalation tasks and escalation
end events without rejoining the main flow.

Message flows:
Accounts Payable / Invoice System → Buying Organisation / Accounts
  Payable lane (PO record, GR record, and invoice data loaded into
  matching queue; automated match result returned).
Buying Organisation / Accounts Payable lane → Supplier (discrepancy
  notification and request for credit note or corrected invoice;
  missing-document request).
Supplier → Buying Organisation / Accounts Payable lane (supplier
  response, credit note, or corrected invoice; missing document or
  confirmation).
Buying Organisation / Accounts Payable lane → Accounts Payable /
  Invoice System (re-run match instruction; matched invoice record
  written back).

7. Data objects

Data Object "Supplier Invoice" — read by "Load invoice into matching
  queue"; read by "Evaluate Supplier response or credit note"; read by
  "Verify document completeness".
Data Object "Purchase Order" — read by "Retrieve open PO and GR record
  from system"; read by "Run automated three-way match (PO / GR /
  Invoice)".
Data Object "Goods Receipt Record" — read by "Retrieve open PO and GR
  record from system"; read by "Run automated three-way match (PO / GR /
  Invoice)".
Data Object "Discrepancy Notice" — written by "Classify discrepancy
  (price, quantity, or missing document)"; read by "Raise discrepancy
  with Supplier"; read by "Request missing document from Supplier or
  internal team".
Data Object "Supplier Response / Credit Note" — read by "Evaluate
  Supplier response or credit note".
Data Store "Accounts Payable / Invoice System ledger" — written by
  "Record matched invoice in Accounts Payable / Invoice System"; read by
  "Retrieve open PO and GR record from system".

V02.06 Match PO / GR / Invoice performs a three-way comparison of the
approved purchase order, the goods receipt or service confirmation
record, and the supplier invoice. Discrepancies — whether price or
quantity variances or missing documents — are resolved through structured
retry loops, each protected by an interrupting deadline that escalates
unresolvable cases to V02.09 Handle Exceptions. When all three documents
agree, the matched invoice record is written to the Accounts Payable /
Invoice System and passed to V02.07 Approve Invoice for final
authorisation.
```

### V02.07 — Approve Invoice

**BPMN diagram prompt.**

```text
BPMN: V02.07 Approve Invoice — the fifth stage of the invoice-to-payment
segment of the Procure to Pay value chain, in which a matched invoice is
reviewed, approved by the budget holder and finance controller, and released
for payment.

1. Pools & Lanes

Pool "Buying Organisation" — the internal organisation running the approval
process, with lanes for Accounts Payable, Budget Holder / Approver, and
Finance / Treasury.
Pool "Supplier" — the external supplier who submitted the invoice and who
may receive a rejection notice.
Pool "Accounts Payable / Invoice System" — IT system that holds invoice
records, routes approval tasks, and records approval decisions.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Accounts Payable / Invoice System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Supplier
2. Buying Organisation
3. Accounts Payable / Invoice System

4. Lane contents in flow order (Buying Organisation)

Accounts Payable lane:
  Message start event "Matched invoice received from V02.06"
  User task "Review matched invoice package"
  Exclusive gateway "Invoice acceptable for approval routing?"
  - branch "No — discrepancy found": User task "Return invoice to
    matching" then End event "Invoice returned to V02.06 for
    re-matching" (does not rejoin)
  - branch "Yes": continues to next element
  Exclusive merge gateway "Invoice acceptable for approval routing"
  Service task "Submit invoice for budget holder approval in Accounts
    Payable / Invoice System"

Budget Holder / Approver lane:
  Intermediate message catch event "Approval task assigned"
  Expanded Subprocess "Repeat Until Budget Holder Approves"
    (standard loop) containing, in order:
    User task "Review invoice against purchase order and budget",
    Exclusive gateway "Budget holder decision?",
    - branch "Approved": reaches subprocess end
    - branch "Rejected — query raised": User task "Record rejection
      reason and notify Accounts Payable",
      Intermediate message catch event "Accounts Payable responds
      to query"
  Timer boundary event (interrupting) on "Repeat Until Budget Holder
    Approves" labelled "Budget holder approval deadline exceeded" —
    fires, cancels subprocess, routes to: User task "Escalate to
    Finance / Treasury controller", then Escalation end event
    "Budget holder approval escalated — process ends abnormally"
    (does not rejoin)
  Exclusive gateway "Budget holder outcome?"
  - branch "Rejected — invoice declined": Send task "Notify supplier
    of invoice rejection", then End event "Invoice rejected —
    supplier notified" (does not rejoin)
  - branch "Approved": continues to next element
  Exclusive merge gateway "Budget holder outcome"
  Service task "Record budget holder approval in Accounts Payable /
    Invoice System"

Finance / Treasury lane:
  Intermediate message catch event "Finance review task assigned"
  Expanded Subprocess "Repeat Until Finance Controller Approves"
    (standard loop) containing, in order:
    User task "Validate invoice against policy, contract, and
      financial controls",
    Exclusive gateway "Finance controller decision?",
    - branch "Approved": reaches subprocess end
    - branch "Query — further information needed": User task
      "Request clarification from Accounts Payable or supplier",
      Intermediate message catch event "Clarification received"
  Timer boundary event (interrupting) on "Repeat Until Finance
    Controller Approves" labelled "Finance approval deadline
    exceeded" — fires, cancels subprocess, routes to: User task
    "Escalate to senior finance management", then Escalation end
    event "Finance approval escalated — process ends abnormally"
    (does not rejoin)
  Exclusive gateway "Finance controller outcome?"
  - branch "Rejected — invoice declined": Send task "Notify supplier
    of invoice rejection and reason", then End event "Invoice
    rejected at finance review — supplier notified" (does not
    rejoin)
  - branch "Approved": continues to next element
  Exclusive merge gateway "Finance controller outcome"
  Service task "Record final finance approval in Accounts Payable /
    Invoice System"
  End event "Invoice approved — ready for Pay Supplier (V02.08)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Repeat Until Budget Holder
Approves" — label "Budget holder approval deadline exceeded" —
cancels subprocess, routes to "Escalate to Finance / Treasury
controller" task, ends at escalation end event in Budget Holder /
Approver lane.
Interrupting timer boundary event on "Repeat Until Finance Controller
Approves" — label "Finance approval deadline exceeded" — cancels
subprocess, routes to "Escalate to senior finance management" task,
ends at escalation end event in Finance / Treasury lane.

6. Connectors

Sequence flows: flow begins in the Accounts Payable lane at the
message start event, passes through invoice review and the
acceptability gateway (with the "No" branch ending separately), then
the "Yes" branch crosses into the Budget Holder / Approver lane via
the approval submission service task. After the budget holder
expanded subprocess, the outcome gateway routes rejections to the
supplier notification send task (ending separately) and approvals
forward to the Finance / Treasury lane. After the finance controller
expanded subprocess, the outcome gateway again routes rejections to a
supplier notification task (ending separately) and approvals to the
final approval recording service task, closing at the approval end
event.

Message flows:
Accounts Payable / Invoice System → Buying Organisation / Budget
  Holder / Approver lane (approval task assignment notification)
Buying Organisation / Budget Holder / Approver lane → Accounts
  Payable / Invoice System (budget holder approval decision recorded)
Accounts Payable / Invoice System → Buying Organisation / Finance /
  Treasury lane (finance review task assignment notification)
Buying Organisation / Finance / Treasury lane → Accounts Payable /
  Invoice System (finance controller approval decision recorded)
Buying Organisation / Budget Holder / Approver lane → Supplier
  (invoice rejection notice — budget holder rejection path)
Buying Organisation / Finance / Treasury lane → Supplier
  (invoice rejection notice — finance rejection path)

7. Data objects

Data Object "Matched Invoice Package" — read by "Review matched
  invoice package"; written by V02.06 upstream.
Data Object "Approval Routing Record" — written by "Submit invoice
  for budget holder approval in Accounts Payable / Invoice System";
  read by "Review invoice against purchase order and budget".
Data Object "Budget Holder Rejection Reason" — written by "Record
  rejection reason and notify Accounts Payable"; read by "Accounts
  Payable responds to query".
Data Object "Finance Clarification Request" — written by "Request
  clarification from Accounts Payable or supplier"; read by
  "Clarification received".
Data Store "Accounts Payable / Invoice System" — written by "Record
  budget holder approval in Accounts Payable / Invoice System" and
  "Record final finance approval in Accounts Payable / Invoice
  System"; read by both finance and budget holder review tasks.

V02.07 Approve Invoice takes the three-way matched invoice package
produced by V02.06 and subjects it to a two-stage internal approval:
first the budget holder confirms the expenditure is authorised and
within budget, then the finance controller validates compliance with
policy and financial controls. Each approval stage operates as a
retrying loop with a hard deadline, and any rejection at either stage
generates a notification to the supplier. A successfully approved
invoice, with both decisions recorded in the Accounts Payable /
Invoice System, is handed to V02.08 Pay Supplier for settlement.
```

### V02.08 — Pay Supplier

**BPMN diagram prompt.**

```text
BPMN: V02.08 Pay Supplier — the subprocess in the Procure to Pay value
chain that executes approved payment runs, transfers funds to the supplier,
and records the resulting accounting entries.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that prepare, authorise,
and execute supplier payments.
  Lane "Accounts Payable (accounts payable officer)"
  Lane "Finance / Treasury (treasury officer)"
Pool "Payment Platform" — external payment platform that processes
payment instructions.
Pool "Bank" — the organisation's bank that executes the fund transfer.
Pool "Supplier" — the supplier receiving payment and remittance advice.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Payment Platform" — black-box, System = true, single instance.
Pool "Bank" — black-box, single instance.
Pool "Supplier" — black-box, single instance.

3. Layout

Top to bottom:
1. Supplier
2. Buying Organisation
3. Payment Platform
4. Bank

4. Lane contents in flow order (Buying Organisation)

Accounts Payable (accounts payable officer) lane:
  Message start event "Approved invoice received from V02.07"
  User task "Compile payment run"
  Service task "Validate payment details against supplier master"
  Exclusive gateway "Payment details valid?"
    - branch "No": Expanded Subprocess "Repeat Until Details Confirmed"
      (standard loop) containing, in order: User task "Request corrected
      payment details from supplier", Intermediate message catch event
      "Corrected details received from supplier", Exclusive gateway
      "Details now valid?"
        - branch "Yes": reach subprocess end
        - branch "No": loop continues
      Timer boundary event on subprocess "5 business days" —
      interrupting; fires if details not confirmed within deadline;
      routes to User task "Escalate unresolved payment details to
      finance controller" then Escalation end event "Payment details
      escalated — stops abnormally"
    - branch "Yes": continue to Exclusive merge gateway
      "Payment details valid"
  Exclusive merge gateway "Payment details valid"
  User task "Generate payment file"
  Service task "Submit payment file to Payment Platform"

Finance / Treasury (treasury officer) lane:
  User task "Authorise payment release"
  Exclusive gateway "Payment authorised?"
    - branch "No": Expanded Subprocess "Repeat Until Authorisation
      Granted" (standard loop) containing, in order: User task "Return
      payment file for amendment", User task "Resubmit amended payment
      file", Exclusive gateway "Authorisation granted?"
        - branch "Yes": reach subprocess end
        - branch "No": loop continues
      Timer boundary event on subprocess "2 business days" —
      interrupting; fires if authorisation not granted within deadline;
      routes to User task "Escalate unauthorised payment to finance
      controller" then Escalation end event "Payment authorisation
      escalated — stops abnormally"
    - branch "Yes": continue to Exclusive merge gateway
      "Payment authorised"
  Exclusive merge gateway "Payment authorised"
  Intermediate message catch event "Payment confirmation received from
  Bank"
  User task "Reconcile payment confirmation against payment run"
  Service task "Post payment accounting entries to ERP / General Ledger"
  Send task "Send remittance advice to supplier"
  End event "Payment made and recorded — ready for Close Procurement
  Transaction (V02.10)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event "5 business days" on Expanded
Subprocess "Repeat Until Details Confirmed" — cancels subprocess and
routes to User task "Escalate unresolved payment details to finance
controller", then Escalation end event "Payment details escalated —
stops abnormally".

Interrupting timer boundary event "2 business days" on Expanded
Subprocess "Repeat Until Authorisation Granted" — cancels subprocess
and routes to User task "Escalate unauthorised payment to finance
controller", then Escalation end event "Payment authorisation escalated
— stops abnormally".

6. Connectors

Sequence flows: flow begins in the Accounts Payable lane with the
message start event, passes through payment compilation, validation,
and the "Payment details valid?" gateway; the "No" branch enters the
retry subprocess and rejoins the exclusive merge gateway "Payment
details valid" on the "Yes" branch; flow continues to payment file
generation and submission, then crosses to the Finance / Treasury lane
for authorisation; the "No" branch of "Payment authorised?" enters the
second retry subprocess and rejoins the exclusive merge gateway "Payment
authorised" on the "Yes" branch; flow then waits on the intermediate
message catch event for bank confirmation, continues to reconciliation,
ledger posting, remittance sending, and the end event.

Message flows:
Service task "Submit payment file to Payment Platform" → Pool "Payment
Platform" (payment instruction file).
Pool "Payment Platform" → Pool "Bank" (processed payment instruction).
Pool "Bank" → Intermediate message catch event "Payment confirmation
received from Bank" (payment confirmation / settlement advice).
Send task "Send remittance advice to supplier" → Pool "Supplier"
(remittance advice).
Pool "Supplier" → Intermediate message catch event "Corrected details
received from supplier" (corrected bank / payment details).

7. Data objects

Data Object "Approved Invoice" — read by User task "Compile payment
run".
Data Object "Payment Run File" — written by User task "Generate payment
file"; read by User task "Authorise payment release"; read by Service
task "Submit payment file to Payment Platform".
Data Object "Corrected Payment Details" — written by User task "Request
corrected payment details from supplier"; read by Service task "Validate
payment details against supplier master".
Data Object "Payment Confirmation" — read by User task "Reconcile
payment confirmation against payment run".
Data Object "Remittance Advice" — written by Send task "Send remittance
advice to supplier".
Data Store "Supplier Master Data" — read by Service task "Validate
payment details against supplier master".
Data Store "ERP / General Ledger System" — written by Service task
"Post payment accounting entries to ERP / General Ledger".

V02.08 Pay Supplier takes the approved invoice from V02.07 and executes
the end-to-end payment cycle: compiling and validating the payment run,
securing treasury authorisation, submitting the payment file to the
Payment Platform and Bank, and reconciling the bank confirmation against
the run. Once funds are transferred and accounting entries are posted,
the subprocess sends remittance advice to the supplier and hands a fully
settled, ledger-recorded payment to V02.10 Close Procurement Transaction.
```

### V02.09 — Handle Exceptions

**BPMN diagram prompt.**

```text
BPMN: V02.09 Handle Exceptions — the exception-resolution subprocess within
the Procure to Pay value chain, triggered when a mismatch, disputed invoice,
delivery discrepancy, or payment query cannot be cleared by routine processing
and must be escalated for investigation and resolution before the transaction
can proceed.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that investigate, negotiate,
and resolve procurement exceptions.
  Lane "Accounts Payable (accounts payable officer)" — receives the exception,
    logs it, coordinates resolution steps, and closes the case.
  Lane "Procurement (category manager)" — investigates commercial and supplier
    discrepancies; leads supplier negotiation.
  Lane "Finance / Treasury (finance controller)" — reviews financial impact,
    authorises write-offs or adjustments, and approves resolution outcome.

Pool "Supplier" — external party that receives queries, provides supporting
documents, issues credit notes, and confirms agreed resolutions.

Pool "Case / Workflow System" — IT system that records, tracks, and updates
exception cases and workflow tasks.

2. Pool properties

Pool "Buying Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Case / Workflow System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Supplier
2. Buying Organisation
3. Case / Workflow System

4. Lane contents in flow order (Buying Organisation)

Accounts Payable lane:
  Message start event "Exception raised — received from Match PO / GR /
    Invoice (V02.06) or Approve Invoice (V02.07)"
  Service task "Log exception in Case / Workflow System"
  User task "Classify exception type"
  Exclusive gateway "Exception type?"
  - branch "Invoice discrepancy": Send task "Send query to Supplier"
      Intermediate message catch event "Supplier response received"
      User task "Review supplier response and supporting documents"
      Exclusive gateway "Discrepancy resolved?"
      - branch "Yes": User task "Post adjustment or credit note in Accounts
          Payable system" — continue to Exclusive merge gateway
          "Discrepancy resolved"
      - branch "No": (enter Expanded Subprocess — see below)
      Exclusive merge gateway "Discrepancy resolved"
      continue to Exclusive merge gateway "Exception type"
  - branch "Delivery discrepancy": (route to Procurement lane — see below)
  - branch "Payment query": User task "Investigate payment query against
      payment records"
      Exclusive gateway "Payment query resolved?"
      - branch "Yes": continue to Exclusive merge gateway "Exception type"
      - branch "No": User task "Escalate payment query to Finance / Treasury"
          continue to Finance / Treasury lane
  Exclusive merge gateway "Exception type"
  User task "Confirm exception resolved and update case record"
  Service task "Close case in Case / Workflow System"
  End event "Exception resolved — ready for Pay Supplier (V02.08) or
    Close Procurement Transaction (V02.10)"

Accounts Payable lane — Expanded Subprocess (invoice discrepancy retry):
  Expanded Subprocess "Repeat Until Invoice Discrepancy Resolved"
    (standard loop) containing, in order:
    Send task "Re-issue query to Supplier with additional detail",
    Intermediate message catch event "Supplier response received",
    User task "Re-evaluate supplier response",
    Exclusive gateway "Resolved?" — Yes branch reaches subprocess end; No
      branch loops
  Interrupting timer boundary event on this subprocess labelled
    "14-day resolution deadline" — on firing: User task "Escalate to
    Finance Controller and Category Manager", then Escalation end event
    "Invoice discrepancy unresolved — escalated"

Procurement lane:
  User task "Receive delivery discrepancy details from Accounts Payable"
  User task "Investigate delivery discrepancy with Freight Carrier records"
  Send task "Send discrepancy notice to Supplier"
  Intermediate message catch event "Supplier acknowledgement received"
  Expanded Subprocess "Repeat Until Delivery Discrepancy Resolved"
    (standard loop) containing, in order:
    User task "Negotiate resolution with Supplier (replacement, credit,
      or return)",
    Intermediate message catch event "Supplier resolution response received",
    Exclusive gateway "Delivery discrepancy resolved?" — Yes branch reaches
      subprocess end; No branch loops
  Interrupting timer boundary event on this subprocess labelled
    "21-day delivery resolution deadline" — on firing: User task "Escalate
    delivery dispute to Finance Controller", then Escalation end event
    "Delivery discrepancy unresolved — escalated"
  User task "Confirm delivery resolution and return case to Accounts Payable"
  (sequence flow returns to Exclusive merge gateway "Exception type" in
    Accounts Payable lane)

Finance / Treasury lane:
  User task "Review financial impact of unresolved payment query"
  Exclusive gateway "Authorise write-off or adjustment?"
  - branch "Approve": User task "Authorise financial adjustment or write-off"
      continue to Exclusive merge gateway "Authorise write-off or adjustment"
  - branch "Reject": User task "Return case to Accounts Payable with
      instructions" — sequence flow routes to Exclusive merge gateway
      "Exception type" in Accounts Payable lane
  Exclusive merge gateway "Authorise write-off or adjustment"
  (sequence flow routes to Exclusive merge gateway "Exception type" in
    Accounts Payable lane)

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Invoice Discrepancy Resolved" — label "14-day resolution deadline" —
  fires when deadline expires — routes to User task "Escalate to Finance
  Controller and Category Manager" then Escalation end event "Invoice
  discrepancy unresolved — escalated".
Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Delivery Discrepancy Resolved" — label "21-day delivery resolution
  deadline" — fires when deadline expires — routes to User task "Escalate
  delivery dispute to Finance Controller" then Escalation end event
  "Delivery discrepancy unresolved — escalated".

6. Connectors

Sequence flows: flow begins in the Accounts Payable lane with the message
start event, moves through exception classification, then branches by type —
invoice discrepancy stays in Accounts Payable and loops via the expanded
subprocess until resolved or escalated; delivery discrepancy crosses to the
Procurement lane for investigation and supplier negotiation, looping via its
own expanded subprocess until resolved or escalated, then returns to Accounts
Payable; payment query stays in Accounts Payable and, if unresolved, crosses
to Finance / Treasury for authorisation before returning to Accounts Payable.
All resolved branches merge at the "Exception type" exclusive merge gateway in
Accounts Payable, then flow to case confirmation, case closure, and the end
event. Escalation end events terminate abnormally and do not rejoin the main
flow.

Message flows:
Accounts Payable (Send task "Send query to Supplier") → Supplier (invoice
  query message)
Supplier → Accounts Payable (Intermediate message catch event "Supplier
  response received") (supplier response and supporting documents)
Accounts Payable (Send task "Re-issue query to Supplier with additional
  detail") → Supplier (follow-up query)
Supplier → Accounts Payable (Intermediate message catch event "Supplier
  response received" inside expanded subprocess) (revised supplier response)
Procurement (Send task "Send discrepancy notice to Supplier") → Supplier
  (delivery discrepancy notice)
Supplier → Procurement (Intermediate message catch event "Supplier
  acknowledgement received") (acknowledgement of discrepancy)
Supplier → Procurement (Intermediate message catch event "Supplier resolution
  response received" inside expanded subprocess) (proposed resolution)
Accounts Payable (Service task "Log exception in Case / Workflow System") →
  Case / Workflow System (new exception case record)
Accounts Payable (Service task "Close case in Case / Workflow System") →
  Case / Workflow System (case closure update)
Case / Workflow System → Accounts Payable (workflow task assignments and
  exception status updates)

7. Data objects

Data Object "Exception Case Record" — written by Service task "Log exception
  in Case / Workflow System"; read by User task "Classify exception type";
  written by User task "Confirm exception resolved and update case record";
  written by Service task "Close case in Case / Workflow System".
Data Object "Supplier Query" — written by Send task "Send query to Supplier";
  written by Send task "Re-issue query to Supplier with additional detail".
Data Object "Supplier Response" — read by User task "Review supplier response
  and supporting documents"; read by User task "Re-evaluate supplier response".
Data Object "Credit Note" — read by User task "Post adjustment or credit note
  in Accounts Payable system".
Data Object "Discrepancy Notice" — written by Send task "Send discrepancy
  notice to Supplier"; read by User task "Investigate delivery discrepancy
  with Freight Carrier records".
Data Object "Financial Adjustment Authority" — written by User task "Authorise
  financial adjustment or write-off"; read by User task "Confirm exception
  resolved and update case record".

V02.09 Handle Exceptions investigates and resolves procurement exceptions —
including invoice discrepancies, delivery shortfalls, and payment queries —
that have been escalated from earlier matching or approval stages. Each
exception type is classified and routed to the appropriate team; supplier
engagement and internal negotiation are retried under firm deadlines, with
unresolved cases terminated as escalations. Once every exception is cleared,
the subprocess hands a resolved, fully documented case to Pay Supplier
(V02.08) or Close Procurement Transaction (V02.10) so that the transaction
can be completed without outstanding disputes.
```

### V02.10 — Close Procurement Transaction

**BPMN diagram prompt.**

```text
BPMN: V02.10 Close Procurement Transaction — final subprocess of the
Procure to Pay value chain, closing all records and posting final accounting
entries after payment has been made.

1. Pools & Lanes

Pool "Buying Organisation" — the internal teams that close the procurement
transaction.
  Lane "Procurement" — procurement officer reviews and closes the PO.
  Lane "Finance / Treasury" — finance controller reconciles and posts final
  accounting entries.
Pool "ERP Procurement System / Supplier Portal" — system that holds purchase
orders and supplier records.
Pool "ERP / General Ledger System" — system that holds accounting entries
and the general ledger.

2. Pool properties

Pool "Buying Organisation": white-box, single instance.
Pool "ERP Procurement System / Supplier Portal": black-box, System = true,
single instance.
Pool "ERP / General Ledger System": black-box, System = true, single
instance.

3. Layout

Top to bottom:
1. Buying Organisation
2. ERP Procurement System / Supplier Portal
3. ERP / General Ledger System

4. Lane contents in flow order (Buying Organisation)

Procurement lane:
  Message start event "Payment confirmed — received from Pay Supplier
  (V02.08)"
  User task "Review purchase order and transaction status"
  Service task "Retrieve open PO and goods receipt records from ERP
  Procurement System / Supplier Portal"
  Exclusive gateway "All deliverables received and invoiced?"
  - branch "No — outstanding items remain": Expanded Subprocess "Resolve
    Outstanding Items Until Complete" (standard loop) containing, in
    order: User task "Identify and document outstanding item or
    discrepancy", Intermediate message catch event "Response or
    confirmation received", Exclusive gateway "Outstanding item
    resolved?"
    - branch "Yes": reach subprocess end
    - branch "No": loop repeats
    Timer boundary event on subprocess "5 business days" (interrupting):
    cancels subprocess, routes to User task "Escalate unresolved items to
    category manager", then Escalation end event "Escalation raised —
    close process cannot complete"
  - branch "Yes — all items confirmed": Exclusive merge gateway "All
    deliverables received and invoiced?"
  Exclusive merge gateway "All deliverables received and invoiced?"
  User task "Mark purchase order as closed in ERP Procurement System /
  Supplier Portal"
  Service task "Send PO closure confirmation to ERP Procurement System /
  Supplier Portal"

Finance / Treasury lane:
  Intermediate message catch event "PO closure signal received from
  Procurement"
  User task "Reconcile procurement transaction against payment records"
  Exclusive gateway "Reconciliation complete and entries balanced?"
  - branch "No — entries unbalanced": Expanded Subprocess "Resolve
    Reconciliation Discrepancy Until Balanced" (standard loop)
    containing, in order: User task "Investigate and correct accounting
    entry discrepancy", Intermediate message catch event "Corrected entry
    or credit note available", Exclusive gateway "Entries balanced?"
    - branch "Yes": reach subprocess end
    - branch "No": loop repeats
    Timer boundary event on subprocess "3 business days" (interrupting):
    cancels subprocess, routes to User task "Escalate reconciliation
    failure to finance controller", then Escalation end event "Escalation
    raised — reconciliation cannot close"
  - branch "Yes — balanced": Exclusive merge gateway "Reconciliation
    complete and entries balanced?"
  Exclusive merge gateway "Reconciliation complete and entries balanced?"
  Service task "Post final accounting entries to ERP / General Ledger
  System"
  User task "Archive procurement transaction documents"
  User task "Record lessons learned and update supplier performance data"
  Service task "Update supplier master data in ERP Procurement System /
  Supplier Portal"
  End event "Procurement transaction closed — Procure to Pay cycle
  complete"

5. Edge-mounted (boundary) events

Interrupting timer boundary event "5 business days" on Expanded Subprocess
"Resolve Outstanding Items Until Complete" in Procurement lane: cancels
the subprocess and routes to User task "Escalate unresolved items to
category manager", ending in Escalation end event "Escalation raised —
close process cannot complete".

Interrupting timer boundary event "3 business days" on Expanded Subprocess
"Resolve Reconciliation Discrepancy Until Balanced" in Finance / Treasury
lane: cancels the subprocess and routes to User task "Escalate
reconciliation failure to finance controller", ending in Escalation end
event "Escalation raised — reconciliation cannot close".

6. Connectors

Sequence flows: flow begins in the Procurement lane at the message start
event, passes through the PO status review and ERP retrieval task, reaches
the "All deliverables received and invoiced?" gateway whose "No" branch
enters the loop subprocess and whose "Yes" branch passes directly to the
merge gateway, continues to PO closure tasks, then crosses to the Finance /
Treasury lane via a message catch event; from there flow passes through
reconciliation, the "Reconciliation complete and entries balanced?" gateway
whose "No" branch enters the reconciliation loop subprocess and whose "Yes"
branch passes to the merge gateway, then continues through ledger posting,
archiving, lessons-learned recording, supplier data update, and the end
event. Both escalation paths terminate in their own escalation end events
without rejoining the main flow.

Message flows:
ERP Procurement System / Supplier Portal → Procurement lane, "Retrieve
open PO and goods receipt records" task (open PO and GR record data).
Procurement lane, "Mark purchase order as closed" task → ERP Procurement
System / Supplier Portal (PO closure instruction).
Procurement lane, "Send PO closure confirmation" task → ERP Procurement
System / Supplier Portal (PO closed status).
Procurement lane, "Update supplier master data" task → ERP Procurement
System / Supplier Portal (updated supplier performance data).
Finance / Treasury lane, "Post final accounting entries" task → ERP /
General Ledger System (final accounting entries).
ERP / General Ledger System → Finance / Treasury lane, "Reconcile
procurement transaction" task (payment and ledger records).

7. Data objects

Data Object "Purchase Order" — read by "Review purchase order and
transaction status"; read by "Mark purchase order as closed in ERP
Procurement System / Supplier Portal".
Data Object "Goods Receipt Record" — read by "Retrieve open PO and goods
receipt records from ERP Procurement System / Supplier Portal"; read by
"Reconcile procurement transaction against payment records".
Data Object "Payment Confirmation" — read by "Reconcile procurement
transaction against payment records".
Data Object "Accounting Entry" — written by "Post final accounting entries
to ERP / General Ledger System".
Data Object "Transaction Archive Package" — written by "Archive procurement
transaction documents".
Data Object "Lessons Learned Record" — written by "Record lessons learned
and update supplier performance data".
Data Store "Supplier Master Data" — written by "Update supplier master data
in ERP Procurement System / Supplier Portal".
Data Store "General Ledger" — written by "Post final accounting entries to
ERP / General Ledger System".

V02.10 closes the Procure to Pay cycle by confirming that all goods and
services have been received, all invoices matched and paid, and all purchase
orders formally closed in the ERP Procurement System. The Finance / Treasury
lane reconciles every transaction, posts the final accounting entries to the
General Ledger, and archives the complete procurement record. Supplier
performance data is updated and lessons learned are recorded, leaving the
organisation with a clean audit trail and no open obligations — the full
V02 value chain is thereby complete.
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
BPMN: V03.01 Capture Financial Transactions — the entry point of the
Record to Report value chain, where operational activity from source and
sub-ledger systems is drawn into finance as validated transaction data.

1. Pools & Lanes
Pool "Finance Organisation" — the white-box pool holding the process flow,
with lanes top-to-bottom: Accounts Payable / Receivable, Financial
Accounting.
Pool "Sub-Ledger / Source Systems" — the sales, procurement, payroll,
assets, inventory and banking systems that originate financial
transactions and hold the sub-ledgers.

2. Pool properties
Pool "Finance Organisation" — white-box, holds the full process flow,
single instance.
Pool "Sub-Ledger / Source Systems" — black-box, System = true, single
instance.

3. Layout
Top to bottom: "Finance Organisation" (lanes Accounts Payable /
Receivable, then Financial Accounting), then "Sub-Ledger / Source
Systems" at the bottom as the supporting IT system pool. There is no
external participant pool in this subprocess; the trigger arrives from
the source systems.

4. Lane contents in flow order (Finance Organisation)

Accounts Payable / Receivable lane:
- Message start event "Daily transaction feed available from Sub-Ledger /
  Source Systems"
- Service task "Retrieve transaction feed from Sub-Ledger / Source
  Systems"
- User task "Identify sub-ledgers in scope for the capture cycle"
- Expanded Subprocess "Repeat Until All Sub-Ledger Feeds Captured"
  (standard loop) containing, in order: Service task "Extract transaction
  batch from source system", Service task "Check batch control totals and
  record counts", User task "Classify transactions to sub-ledger and
  posting category", Service task "Stage validated batch for general
  ledger interface"
- Exclusive gateway "All batches validated?"
  - branch "yes — control totals agree": proceed to the merge
  - branch "no — rejected or suspended items": User task "Investigate
    rejected transactions against source records"; Send task "Return
    correction request to Sub-Ledger / Source Systems"; Intermediate
    message catch event "Corrected transaction batch received"; then
    proceed to the merge
- Exclusive merge gateway "Batches validated"
- User task "Confirm capture completeness for the cycle"

Financial Accounting lane:
- User task "Review sub-ledger to general ledger interface report"
- Exclusive gateway "Sub-ledger and interface totals agree?"
  - branch "yes — agreed": proceed to the merge
  - branch "no — variance identified": User task "Analyse interface
    variance against accounting policy"; User task "Record capture
    exception and remediation note"; then proceed to the merge
  - branch "feed unusable — source system reload required": User task
    "Escalate failed capture to finance controller"; End event "Capture
    cycle abandoned — source reload required, no hand-off to V03.02".
    This branch does not rejoin.
- Exclusive merge gateway "Interface reconciled"
- Service task "Confirm captured batches in Sub-Ledger / Source Systems"
- User task "Sign off captured transaction population for posting"
- End event "Captured transactions ready for Post Journals (V03.02)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  All Sub-Ledger Feeds Captured", labelled "Capture window closes
  (4 hours)" — flow continues to User task "Investigate rejected
  transactions against source records".
- Interrupting error boundary event on Service task "Retrieve transaction
  feed from Sub-Ledger / Source Systems", labelled "Feed extract failed"
  — flow continues to User task "Escalate failed capture to finance
  controller" in the Financial Accounting lane.
- Non-interrupting timer boundary event on User task "Review sub-ledger to
  general ledger interface report", labelled "Review overdue by one
  business day" — triggers Send task "Notify finance controller of delayed
  capture review", which then rejoins before the "Interface reconciled"
  merge gateway.

6. Connectors
Sequence flows: the flow runs from the message start event through the
Accounts Payable / Receivable lane — retrieve feed, identify sub-ledgers,
the standard-loop subprocess, the "All batches validated?" gateway whose
two branches rejoin at "Batches validated", then capture completeness
confirmation — and crosses into the Financial Accounting lane for the
interface review, where the "Sub-ledger and interface totals agree?"
gateway sends its "yes" and "variance identified" branches to the
"Interface reconciled" merge while the "feed unusable" branch terminates
at its own end event; from the merge the flow runs through confirmation
in the source systems and sign-off to the end event handing to V03.02.
Message flows:
- Sub-Ledger / Source Systems → Message start event "Daily transaction
  feed available from Sub-Ledger / Source Systems" (transaction feed
  notification)
- Sub-Ledger / Source Systems → Service task "Retrieve transaction feed
  from Sub-Ledger / Source Systems" (raw transaction records from sales,
  procurement, payroll, assets, inventory and banking)
- Service task "Extract transaction batch from source system" →
  Sub-Ledger / Source Systems (batch extract request)
- Sub-Ledger / Source Systems → Service task "Check batch control totals
  and record counts" (control totals and record counts)
- Send task "Return correction request to Sub-Ledger / Source Systems" →
  Sub-Ledger / Source Systems (rejected item correction request)
- Sub-Ledger / Source Systems → Intermediate message catch event
  "Corrected transaction batch received" (corrected batch)
- Service task "Confirm captured batches in Sub-Ledger / Source Systems" →
  Sub-Ledger / Source Systems (capture confirmation and batch status)

7. Data objects
Data Object "Transaction Feed File" — read by "Retrieve transaction feed
from Sub-Ledger / Source Systems", read by "Extract transaction batch from
source system".
Data Object "Batch Control Report" — written by "Check batch control
totals and record counts", read by "Review sub-ledger to general ledger
interface report".
Data Object "Capture Exception Log" — written by "Record capture exception
and remediation note", read by "Escalate failed capture to finance
controller".
Data Object "Sub-Ledger to General Ledger Interface Report" — written by
"Stage validated batch for general ledger interface", read by "Review
sub-ledger to general ledger interface report".
Data Store "Sub-Ledger Transaction Register" — written by "Stage validated
batch for general ledger interface", read by "Confirm capture completeness
for the cycle".
Data Store "Fixed Asset Register" — read by "Classify transactions to
sub-ledger and posting category".

This subprocess turns raw operational activity from the sales,
procurement, payroll, asset, inventory and banking source systems into a
validated, classified and complete population of financial transactions,
with control totals agreed and exceptions logged. It hands the signed-off
captured transaction population and its interface report to Post Journals
(V03.02), where the entries are drafted, approved and posted to the
general ledger.
```

### V03.02 — Post Journals

**BPMN diagram prompt.**

```text
BPMN: V03.02 Post Journals — the step that turns captured transactions and
manual adjustments into approved, posted entries in the general ledger.

1. Pools & Lanes
Pool "Finance Organisation" — the organisation running the process; lanes,
top to bottom: Financial Accounting, Finance Controller.
Pool "ERP / General Ledger System" — the system of record for the general
ledger, journal templates, posting rules and period status.

2. Pool properties
Pool "Finance Organisation" — white-box, holds the entire process flow,
single instance.
Pool "ERP / General Ledger System" — black-box, System = true, single
instance.

3. Layout
Top to bottom: "Finance Organisation" (lanes Financial Accounting, then
Finance Controller), then "ERP / General Ledger System" at the bottom as the
supporting IT system. This subprocess is cycle-driven and has no external
participant pool.

4. Lane contents in flow order (Finance Organisation)

Financial Accounting lane:
- Message start event "Captured transactions and adjustment requests received
  from V03.01"
- Service task "Retrieve trial balance and open period status from ERP /
  General Ledger System"
- User task "Determine journal type — recurring, correcting or manual
  adjustment"
- Expanded Subprocess "Repeat Until Journal Validated" (standard loop)
  containing, in order: User task "Enter journal header and line detail";
  User task "Attach supporting documentation and narrative"; Service task
  "Run journal validation in ERP / General Ledger System"; User task "Correct
  rejected lines and balancing errors"
- Service task "Record validated journal as parked entry in ERP / General
  Ledger System"
- Exclusive gateway "Approval required under financial delegation policy?"
  - branch "Below delegated threshold and system-generated": continue to
    Service task "Auto-approve journal under standing delegation"
  - branch "Above threshold or manual adjustment": Send task "Submit journal
    to Finance Controller for approval" and continue in the Finance
    Controller lane
- Exclusive merge gateway "Journal approval resolved"

Finance Controller lane:
- Intermediate message catch event "Journal submitted for approval"
- User task "Review journal against accounting policy and journal posting
  procedure"
- User task "Check supporting evidence and account coding"
- Exclusive gateway "Journal approved?"
  - branch "Approved": Service task "Record approval decision in ERP /
    General Ledger System"; flow rejoins "Journal approval resolved" in the
    Financial Accounting lane
  - branch "Rejected — rework required": Send task "Return journal to
    preparer with rejection reason"; flow rejoins "Journal approval resolved"
    in the Financial Accounting lane
  - branch "Rejected — journal withdrawn": User task "Cancel parked journal
    in ERP / General Ledger System"; End event "Journal withdrawn — no
    posting made" (this branch does not rejoin)

Financial Accounting lane (continued):
- Exclusive gateway "Outcome of approval?"
  - branch "Approved": Service task "Post journal to general ledger in ERP /
    General Ledger System"
  - branch "Returned for rework": User task "Amend journal and resubmit for
    approval"; flow continues to Service task "Post journal to general ledger
    in ERP / General Ledger System" once approval is granted
- Exclusive merge gateway "Posting complete"
- Service task "Refresh trial balance and posting audit trail in ERP /
  General Ledger System"
- User task "Review posting exception listing and unposted items"
- Data-based exclusive gateway "Coding gap or missing account identified?"
  - branch "Yes — account structure change needed": Send task "Raise chart of
    accounts change request"; continue to merge
  - branch "No": continue to merge
- Exclusive merge gateway "Journal register reconciled"
- End event "Journals posted and ledger updated — ready for Maintain Chart of
  Accounts (V03.03)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Journal Validated", labelled "Close cut-off reached", leading to User task
  "Escalate unvalidated journal to Finance Controller" in the Finance
  Controller lane, then to the "Journal approval resolved" merge.
- Interrupting error boundary event on Service task "Post journal to general
  ledger in ERP / General Ledger System", labelled "Posting rejected — period
  closed or account blocked", leading to User task "Investigate posting
  failure and re-date journal", which returns the flow to the "Posting
  complete" merge gateway.
- Non-interrupting message boundary event on User task "Review journal against
  accounting policy and journal posting procedure", labelled "Additional
  evidence supplied", leading to User task "Re-check supporting evidence" in
  the Finance Controller lane.

6. Connectors
Sequence flows: the flow runs from the message start event in Financial
Accounting through retrieval, journal typing and the "Repeat Until Journal
Validated" subprocess to the parking of the journal; the "Approval required
under financial delegation policy?" gateway splits into the auto-approval
branch and the controller submission branch, both rejoining at "Journal
approval resolved". In the Finance Controller lane, "Journal approved?"
splits into approved, returned-for-rework and withdrawn branches; the first
two rejoin "Journal approval resolved", the third terminates at its own end
event. The "Outcome of approval?" gateway splits into approved and rework
branches, both rejoining at "Posting complete". "Coding gap or missing
account identified?" splits into yes and no branches, both rejoining at
"Journal register reconciled" before the end event.

Message flows:
- ERP / General Ledger System → Service task "Retrieve trial balance and open
  period status from ERP / General Ledger System" (trial balance, open period
  status, posting rules).
- Service task "Run journal validation in ERP / General Ledger System" → ERP
  / General Ledger System (draft journal lines for validation).
- ERP / General Ledger System → Expanded Subprocess "Repeat Until Journal
  Validated" (validation errors and balancing exceptions).
- Service task "Record validated journal as parked entry in ERP / General
  Ledger System" → ERP / General Ledger System (parked journal and
  attachments).
- Service task "Record approval decision in ERP / General Ledger System" →
  ERP / General Ledger System (approver identity, decision, timestamp).
- Service task "Post journal to general ledger in ERP / General Ledger
  System" → ERP / General Ledger System (approved journal for posting).
- ERP / General Ledger System → Service task "Refresh trial balance and
  posting audit trail in ERP / General Ledger System" (posted document
  number, updated trial balance, exception listing).

7. Data objects
Data Object "Journal Entry" — written by "Enter journal header and line
detail", read by "Review journal against accounting policy and journal
posting procedure".
Data Object "Supporting Documentation Pack" — written by "Attach supporting
documentation and narrative", read by "Check supporting evidence and account
coding".
Data Object "Journal Approval Record" — written by "Record approval decision
in ERP / General Ledger System", read by "Post journal to general ledger in
ERP / General Ledger System".
Data Object "Posting Exception Listing" — written by "Refresh trial balance
and posting audit trail in ERP / General Ledger System", read by "Review
posting exception listing and unposted items".
Data Object "Chart of Accounts Change Request" — written by "Raise chart of
accounts change request".
Data Store "General Ledger" — written by "Post journal to general ledger in
ERP / General Ledger System", read by "Retrieve trial balance and open period
status from ERP / General Ledger System".
Data Store "Journal Audit Trail" — written by "Refresh trial balance and
posting audit trail in ERP / General Ledger System".

Post Journals converts validated transactions and manual adjustments into
approved, auditable entries in the general ledger, applying the journal
posting procedure and the financial delegation policy to every entry above
threshold. It leaves a complete approval and posting audit trail and an
updated trial balance. It hands an accurate posted ledger, plus any chart of
accounts change requests it has raised, to Maintain Chart of Accounts
(V03.03) and on to the reconciliation and close steps that follow.
```

### V03.03 — Maintain Chart of Accounts

**BPMN diagram prompt.**

```text
BPMN: V03.03 Maintain Chart of Accounts — the general ledger structure
governance step that keeps account codes valid for posting, reconciliation and
consolidation across the Record to Report chain.

1. Pools & Lanes
Pool "Finance Organisation" — the organisation running the process, with lanes
top-to-bottom: Financial Accounting; Finance Controller.
Pool "ERP / General Ledger System" — the system of record holding the chart of
accounts master data, account hierarchies and posting rules.

2. Pool properties
Pool "Finance Organisation" — white-box, holds the process flow, single
instance.
Pool "ERP / General Ledger System" — black-box, System = true, single instance.

3. Layout
Top to bottom: "Finance Organisation" (lanes Financial Accounting, then Finance
Controller), then "ERP / General Ledger System" at the bottom as the supporting
IT system.

4. Lane contents in flow order (Finance Organisation)

Financial Accounting lane:
- Message start event "Chart of accounts change request received from V03.02"
- User task "Register account change request"
- Service task "Retrieve current chart of accounts structure from ERP / General
  Ledger System"
- Expanded Subprocess "Repeat Until Request Details Complete" (standard loop)
  containing, in order: User task "Review request against chart of accounts
  governance policy", User task "Query missing account attributes with
  requesting team", User task "Update account change request record"
- User task "Classify change type"
- Exclusive gateway "Change type?"
  - branch "New account or hierarchy node": User task "Draft new account
    definition and posting rules"
  - branch "Amend existing account": User task "Draft amendment to account
    attributes"
  - branch "Deactivate or block account": User task "Check open balances and
    in-flight postings before deactivation"
- Exclusive merge gateway "Change drafted"
- User task "Prepare impact assessment on reporting and consolidation mappings"
- Send task "Submit change for governance approval"

Finance Controller lane:
- User task "Review change against accounting policy and financial delegation
  policy"
- Exclusive gateway "Change approved?"
  - branch "Rejected": User task "Record rejection rationale"; Send task
    "Notify requesting team of rejection"; End event "Change request rejected —
    chart of accounts unchanged" (this branch does not rejoin)
  - branch "Approved": User task "Authorise chart of accounts change"
- User task "Confirm effective period for the change"

Financial Accounting lane:
- Intermediate timer catch event "Next scheduled master data release window"
- Service task "Apply account change in ERP / General Ledger System"
- Service task "Update account hierarchies and reporting mappings in ERP /
  General Ledger System"
- User task "Validate test posting against changed account"
- Exclusive gateway "Validation clean?"
  - branch "Errors found": User task "Correct account configuration"; rejoins
    the merge below
  - branch "Clean": User task "Confirm account available for posting"
- Exclusive merge gateway "Account validated"
- Service task "Record change in chart of accounts change log"
- Send task "Publish updated chart of accounts to finance teams"
- End event "Chart of accounts maintained — ready for Reconcile Accounts
  (V03.04)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Request Details Complete", labelled "10 working days without complete
  details" → User task "Return request to originator as incomplete" → End event
  "Change request withdrawn — chart of accounts unchanged".
- Interrupting error boundary event on Service task "Apply account change in ERP
  / General Ledger System", labelled "Master data update rejected by ERP" →
  User task "Investigate ERP validation error" → flow returns into User task
  "Correct account configuration".
- Non-interrupting timer boundary event on User task "Review change against
  accounting policy and financial delegation policy", labelled "5 working days
  elapsed" → Send task "Escalate pending approval to finance controller".

6. Connectors
Sequence flows: the flow runs Financial Accounting (registration, completeness
loop, classification, drafting, impact assessment, submission) → Finance
Controller (policy review, approval gateway, effective period) → Financial
Accounting (release window wait, ERP application, validation, logging,
publication). Gateway "Change type?" branches to new account, amend existing
account, and deactivate or block, all merging at "Change drafted". Gateway
"Change approved?" branches to Rejected, which terminates at its own end event
and does not rejoin, and Approved, which continues. Gateway "Validation clean?"
branches to Errors found and Clean, both merging at "Account validated".

Message flows:
- ERP / General Ledger System → Service task "Retrieve current chart of accounts
  structure from ERP / General Ledger System" (current account codes,
  hierarchies and posting rules).
- Service task "Apply account change in ERP / General Ledger System" → ERP /
  General Ledger System (new, amended or deactivated account definitions).
- Service task "Update account hierarchies and reporting mappings in ERP /
  General Ledger System" → ERP / General Ledger System (hierarchy and mapping
  updates).
- ERP / General Ledger System → User task "Validate test posting against changed
  account" (test posting result and validation messages).
- Service task "Record change in chart of accounts change log" → ERP / General
  Ledger System (approved change record with effective date).

7. Data objects
Data Object "Account Change Request" — written by "Register account change
request", read by "Review request against chart of accounts governance policy".
Data Object "Impact Assessment" — written by "Prepare impact assessment on
reporting and consolidation mappings", read by "Review change against accounting
policy and financial delegation policy".
Data Object "Account Definition Draft" — written by "Draft new account
definition and posting rules" and "Draft amendment to account attributes", read
by "Apply account change in ERP / General Ledger System".
Data Store "Chart of Accounts Master" — read by "Retrieve current chart of
accounts structure from ERP / General Ledger System", written by "Update account
hierarchies and reporting mappings in ERP / General Ledger System".
Data Store "Chart of Accounts Change Log" — written by "Record change in chart
of accounts change log", read by "Record rejection rationale".
Data Object "Published Chart of Accounts" — written by "Publish updated chart of
accounts to finance teams".

This subprocess keeps the general ledger structure governed and current:
requests to add, amend or retire accounts are completed, assessed for reporting
impact, approved under the delegation policy, applied in the ERP general ledger
and validated by test posting. It hands a published, effective-dated chart of
accounts and a logged change record to Reconcile Accounts (V03.04), so that
balances are reconciled against account codes that are valid for the period.
```

### V03.04 — Reconcile Accounts

**BPMN diagram prompt.**

```text
BPMN: V03.04 Reconcile Accounts — the control step of Record to Report
that proves ledger balances against external and sub-ledger evidence
before accruals are raised and the period is closed.

1. Pools & Lanes
Pool "Finance Organisation" — the white-box pool holding the whole
reconciliation flow. Lanes, top to bottom:
- Financial Accounting (reconciliations analyst)
Pool "Bank" — external party supplying statements and balance
confirmations for cash and loan accounts.
Pool "Reconciliation System" — IT system holding reconciliation
templates, matching rules, breaks and sign-off records.

2. Pool properties
Pool "Bank" — black-box, single instance, System = false.
Pool "Finance Organisation" — white-box, single instance, holds the
process flow.
Pool "Reconciliation System" — black-box, System = true, single
instance.

3. Layout
Top to bottom: "Bank", then "Finance Organisation", then
"Reconciliation System" at the bottom as the supporting IT system.

4. Lane contents in flow order (Finance Organisation)

Financial Accounting lane:
- Message start event "Period ledger balances available from V03.03"
- Service task "Extract ledger and sub-ledger balances into
  Reconciliation System"
- User task "Identify accounts in scope under reconciliation policy"
- Send task "Request bank statements and balance confirmations"
- Intermediate message catch event "Bank statement received"
- Service task "Load statements and supporting schedules into
  Reconciliation System"
- Service task "Run automated matching rules"
- Exclusive gateway "Reconciling items found?"
  - branch "no items — balances agree": continue to "Exclusive merge
    gateway 'Reconciliation outcome known'"
  - branch "items found": Expanded Subprocess "Repeat Until All
    Reconciling Items Cleared" (standard loop) containing, in order:
    User task "Investigate reconciling item"; User task "Obtain
    supporting evidence for item"; User task "Classify item as timing
    difference, error or unexplained break"; User task "Raise
    correcting journal request for V03.02"; Service task "Update item
    status in Reconciliation System". Then continue to "Exclusive merge
    gateway 'Reconciliation outcome known'"
- Exclusive merge gateway "Reconciliation outcome known"
- User task "Prepare reconciliation statement and break schedule"
- Service task "Record completed reconciliation in Reconciliation
  System"
- Exclusive gateway "Unexplained breaks above tolerance?"
  - branch "within tolerance": continue to "Exclusive merge gateway
    'Reconciliation position agreed'"
  - branch "above tolerance": User task "Escalate break to finance
    controller for decision"; User task "Agree remediation or write-off
    treatment"; then continue to "Exclusive merge gateway
    'Reconciliation position agreed'"
- Exclusive merge gateway "Reconciliation position agreed"
- User task "Review and sign off reconciliation"
- Service task "Publish signed reconciliation pack to Reconciliation
  System"
- End event "Accounts reconciled — ready for Manage Accruals and
  Provisions (V03.05)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  All Reconciling Items Cleared", labelled "Close deadline reached",
  leading to User task "Escalate break to finance controller for
  decision".
- Non-interrupting timer boundary event on Intermediate message catch
  event handling — mounted instead on Send task "Request bank statements
  and balance confirmations", labelled "No statement after 3 working
  days", leading to Send task "Chase bank for outstanding statement",
  which returns no flow of its own and completes.
- Interrupting error boundary event on Service task "Run automated
  matching rules", labelled "Matching rules failed", leading to User task
  "Reconcile manually from source schedules", which then joins
  "Exclusive merge gateway 'Reconciliation outcome known'".

6. Connectors
Sequence flows: the flow runs entirely within the Financial Accounting
lane, from the message start event through extraction, scoping, the bank
request and its catch event, loading and matching, the gateway
"Reconciling items found?" whose two branches rejoin at "Exclusive merge
gateway 'Reconciliation outcome known'", then statement preparation and
recording, the gateway "Unexplained breaks above tolerance?" whose two
branches rejoin at "Exclusive merge gateway 'Reconciliation position
agreed'", then review, sign-off, publication and the end event.

Message flows:
- Finance Organisation "Request bank statements and balance
  confirmations" → Bank (statement and confirmation request).
- Finance Organisation "Chase bank for outstanding statement" → Bank
  (reminder for outstanding statement).
- Bank → Finance Organisation "Bank statement received" (bank statements
  and balance confirmations).
- Finance Organisation "Extract ledger and sub-ledger balances into
  Reconciliation System" → Reconciliation System (ledger and sub-ledger
  balance extract).
- Finance Organisation "Load statements and supporting schedules into
  Reconciliation System" → Reconciliation System (statements and
  supporting schedules).
- Reconciliation System → Finance Organisation "Run automated matching
  rules" (match results and break list).
- Finance Organisation "Record completed reconciliation in
  Reconciliation System" → Reconciliation System (completed
  reconciliation and item statuses).
- Finance Organisation "Publish signed reconciliation pack to
  Reconciliation System" → Reconciliation System (signed reconciliation
  pack).

7. Data objects
Data Store "General Ledger Balances" — read by "Extract ledger and
sub-ledger balances into Reconciliation System".
Data Store "Sub-Ledger Balances" — read by "Extract ledger and
sub-ledger balances into Reconciliation System".
Data Object "Bank Statement" — read by "Load statements and supporting
schedules into Reconciliation System".
Data Object "Supporting Schedule" — read by "Obtain supporting evidence
for item".
Data Object "Break Schedule" — written by "Prepare reconciliation
statement and break schedule".
Data Object "Journal Request" — written by "Raise correcting journal
request for V03.02".
Data Object "Reconciliation Statement" — written by "Prepare
reconciliation statement and break schedule", read by "Review and sign
off reconciliation".
Data Store "Reconciliation Register" — written by "Record completed
reconciliation in Reconciliation System" and by "Publish signed
reconciliation pack to Reconciliation System".

This subprocess proves that every in-scope ledger balance agrees to
external or sub-ledger evidence, clears or explains each reconciling
item, and obtains sign-off within the reconciliation policy. It hands a
signed reconciliation pack, an explained break schedule and any
correcting journal requests to Manage Accruals and Provisions (V03.05)
and, through it, to Close Accounting Periods (V03.06).
```

### V03.05 — Manage Accruals and Provisions

**BPMN diagram prompt.**

```text
BPMN: V03.05 Manage Accruals and Provisions — the fifth subprocess of the
Record to Report value chain, recognising costs and obligations that belong
to the period before the ledger is closed.

1. Pools & Lanes
Pool "Finance Organisation" — the organisation running the process, with
lanes top-to-bottom: Financial Accounting, Management Accounting.
Pool "ERP / General Ledger System" — the general ledger of record holding
accrual and provision journals, balances and reversals.

2. Pool properties
Pool "Finance Organisation" — white-box, holds the entire process flow,
single instance per accounting period.
Pool "ERP / General Ledger System" — black-box, System = true, single
instance.

3. Layout
Top to bottom: Finance Organisation (lanes Financial Accounting, then
Management Accounting), then ERP / General Ledger System at the bottom as
the supporting IT system.

4. Lane contents in flow order (Finance Organisation)

Financial Accounting lane:
- Message start event "Reconciled ledger balances received from V03.04"
- Service task "Extract period cost and obligation data from ERP / General
  Ledger System"
- User task "Identify candidate accruals, prepayments and provisions
  against accruals policy"
- Expanded Subprocess "Repeat Until All Accrual Items Assessed" (standard
  loop) containing, in order: User task "Select accrual or provision item";
  User task "Gather supporting evidence and estimate basis"; User task
  "Calculate accrual or provision amount"; User task "Record calculation in
  accruals schedule"
- Service task "Compile draft accruals and provisions schedule"
- Send task "Send draft schedule to Management Accounting for review"

Management Accounting lane:
- Intermediate message catch event "Draft accruals and provisions schedule
  received"
- User task "Review accrual estimates against budget and operational
  expectation"
- User task "Challenge or confirm provision assumptions with cost owners"
- Exclusive gateway "Estimates supportable?"
  - branch "Adjustment required": User task "Record requested adjustment and
    rationale"; Send task "Return schedule to Financial Accounting for
    revision"; continues to Expanded Subprocess "Do Until Schedule Agreed"
  - branch "Estimates accepted": Send task "Confirm schedule to Financial
    Accounting"; continues to Exclusive merge gateway "Schedule reviewed"
- Expanded Subprocess "Do Until Schedule Agreed" (standard loop) containing,
  in order: User task "Revise estimate and supporting basis"; User task
  "Re-review revised estimate"; User task "Update accruals schedule"
- Exclusive merge gateway "Schedule reviewed"

Financial Accounting lane:
- User task "Prepare accrual and provision journal entries for posting"
- Exclusive gateway "Value within delegated posting limit?"
  - branch "Within limit": continues to Exclusive merge gateway "Journals
    authorised"
  - branch "Above limit — controller approval needed": Send task "Submit
    high-value provision for finance controller approval"; Intermediate
    message catch event "Approval decision received"; continues to Exclusive
    merge gateway "Journals authorised"
- Exclusive merge gateway "Journals authorised"
- Service task "Post accrual and provision journals to ERP / General Ledger
  System"
- Service task "Set automatic reversal dates for reversing accruals"
- User task "Update provisions register with movement, utilisation and
  release"
- Service task "Reconcile posted accruals to accruals schedule"
- End event "Accruals and provisions recognised — ready for Close
  Accounting Periods (V03.06)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until All
  Accrual Items Assessed", labelled "Close calendar cut-off reached" —
  routes to User task "Escalate incomplete accrual items to finance
  controller" in the Financial Accounting lane, then to Service task
  "Compile draft accruals and provisions schedule".
- Non-interrupting timer boundary event on Intermediate message catch event
  path — instead mount an interrupting timer boundary event on Expanded
  Subprocess "Do Until Schedule Agreed", labelled "Review window expired" —
  routes to Exclusive merge gateway "Schedule reviewed" with the latest
  estimate carried forward.
- Interrupting error boundary event on Service task "Post accrual and
  provision journals to ERP / General Ledger System", labelled "Posting
  rejected by ledger", routing to User task "Correct journal and repost" in
  the Financial Accounting lane, which returns the flow to Service task "Set
  automatic reversal dates for reversing accruals".

6. Connectors
Sequence flows: the flow runs from the message start event through data
extraction, item identification and the "Repeat Until All Accrual Items
Assessed" subprocess in the Financial Accounting lane, crosses to the
Management Accounting lane for review at the gateway "Estimates
supportable?" — the "Adjustment required" branch runs through the "Do Until
Schedule Agreed" subprocess and the "Estimates accepted" branch passes
straight on, both rejoining at the merge gateway "Schedule reviewed" — then
returns to the Financial Accounting lane where the gateway "Value within
delegated posting limit?" splits into "Within limit" and "Above limit —
controller approval needed", both rejoining at the merge gateway "Journals
authorised", after which posting, reversal setting, register update and
reconciliation lead to the end event.

Message flows:
- ERP / General Ledger System → Service task "Extract period cost and
  obligation data from ERP / General Ledger System" (period cost data,
  open commitments, prior-period accrual balances).
- Service task "Post accrual and provision journals to ERP / General Ledger
  System" → ERP / General Ledger System (accrual and provision journal
  entries).
- Service task "Set automatic reversal dates for reversing accruals" → ERP /
  General Ledger System (reversal instructions and effective dates).
- ERP / General Ledger System → Service task "Reconcile posted accruals to
  accruals schedule" (posted ledger balances and journal confirmations).
- ERP / General Ledger System → Interrupting error boundary event "Posting
  rejected by ledger" (posting rejection message).

7. Data objects
Data Object "Accruals and Provisions Schedule" — written by "Record
calculation in accruals schedule" and "Update accruals schedule", read by
"Review accrual estimates against budget and operational expectation".
Data Object "Supporting Evidence Pack" — written by "Gather supporting
evidence and estimate basis", read by "Challenge or confirm provision
assumptions with cost owners".
Data Object "Accrual and Provision Journal Entries" — written by "Prepare
accrual and provision journal entries for posting", read by "Post accrual
and provision journals to ERP / General Ledger System".
Data Object "Controller Approval Record" — written by "Submit high-value
provision for finance controller approval", read by "Prepare accrual and
provision journal entries for posting".
Data Store "Provisions Register" — written by "Update provisions register
with movement, utilisation and release", read by "Identify candidate
accruals, prepayments and provisions against accruals policy".
Data Store "General Ledger" — written by "Post accrual and provision
journals to ERP / General Ledger System", read by "Reconcile posted
accruals to accruals schedule".

This subprocess ensures that costs and obligations belonging to the period
are recognised in the ledger before it is frozen, with each estimate
supported by evidence, reviewed by Management Accounting and authorised
within the financial delegation policy. It hands a ledger carrying complete
accrual and provision entries, agreed reversal dates and an updated
provisions register to Close Accounting Periods (V03.06).
```

### V03.06 — Close Accounting Periods

**BPMN diagram prompt.**

```text
BPMN: V03.06 Close Accounting Periods — the period-end control step that
locks the ledger once all close tasks are complete, between managing accruals
and provisions (V03.05) and consolidating entities (V03.07).

1. Pools & Lanes
Pool "Finance Organisation" — the white-box pool holding the whole close
process, with lanes top-to-bottom: Financial Accounting, Finance Controller.
Pool "Financial Close System" — the close task checklist, milestone and
period-lock application.

2. Pool properties
Pool "Finance Organisation" — white-box, holds the process flow, single
instance per accounting period.
Pool "Financial Close System" — black-box, System = true, single instance.

3. Layout
Top to bottom: "Finance Organisation" (lanes Financial Accounting, then
Finance Controller), then "Financial Close System" at the bottom as the
supporting IT system.

4. Lane contents in flow order (Finance Organisation)

Financial Accounting lane:
- Message start event "Accruals and provisions posted — period-end close due
  (from V03.05)".
- Service task "Open close calendar and task list in Financial Close System".
- User task "Confirm sub-ledger cut-off for payables, receivables, payroll
  and assets".
- Service task "Run sub-ledger to general ledger interface check".
- Expanded Subprocess "Repeat Until All Close Tasks Complete" (standard loop)
  containing, in order: User task "Work next close checklist task"; User task
  "Attach supporting schedule and sign-off evidence"; Service task "Update
  close task status in Financial Close System"; User task "Escalate blocked
  close tasks to owners".
- User task "Prepare trial balance and period-end variance pack".
- Send task "Submit close pack to Finance Controller for review".

Finance Controller lane:
- Intermediate message catch event "Close pack received for review".
- User task "Review trial balance, reconciliation status and open items
  against month-end close procedure".
- Exclusive gateway "Close pack acceptable?".
  - branch "Exceptions found": User task "Return exceptions with correction
    instructions to Financial Accounting"; Expanded Subprocess "Do Until
    Exceptions Cleared" (standard loop) containing, in order: User task
    "Post correcting adjustment in the period", User task "Re-run trial
    balance", User task "Re-review corrected close pack"; then to the merge.
  - branch "Clean": straight to the merge.
- Exclusive merge gateway "Close pack approved".
- User task "Approve period close under financial delegation policy".
- Service task "Lock accounting period in Financial Close System".
- Service task "Publish period-close certificate and archive close evidence".
- End event "Period closed and locked — ready for Consolidate Entities
  (V03.07)".

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until All
  Close Tasks Complete", labelled "Close day deadline reached"; flows to User
  task "Escalate overdue close tasks to Finance Controller" in the Finance
  Controller lane, which then rejoins before "Review trial balance,
  reconciliation status and open items against month-end close procedure".
- Non-interrupting message boundary event on User task "Review trial balance,
  reconciliation status and open items against month-end close procedure",
  labelled "Late journal notified"; flows to User task "Assess late journal
  for inclusion in the period" and back into the review branch decision.
- Interrupting error boundary event on Service task "Lock accounting period in
  Financial Close System", labelled "Period lock failed"; flows to User task
  "Resolve lock failure and retry period lock".

6. Connectors
Sequence flows: the flow runs from the message start event through the
Financial Accounting lane (open close calendar, confirm cut-off, interface
check, the standard-loop subprocess of close tasks, trial balance preparation,
submission) into the Finance Controller lane at the intermediate message catch
event; the exclusive gateway "Close pack acceptable?" splits into the
"Exceptions found" branch, which runs the "Do Until Exceptions Cleared"
subprocess, and the "Clean" branch, and both rejoin at the exclusive merge
gateway "Close pack approved"; from there the flow continues through approval,
period lock and publication to the single end event. The timer boundary escape
rejoins before the controller review; the error boundary escape rejoins after
the retry task.
Message flows:
- Financial Close System → "Open close calendar and task list in Financial
  Close System" (close calendar, task list and owners).
- "Run sub-ledger to general ledger interface check" → Financial Close System
  (interface completeness query).
- Financial Close System → "Prepare trial balance and period-end variance
  pack" (trial balance and sub-ledger balances).
- "Update close task status in Financial Close System" → Financial Close
  System (task completion and evidence references).
- Financial Close System → "Escalate blocked close tasks to owners" (overdue
  and blocked task alerts).
- "Lock accounting period in Financial Close System" → Financial Close System
  (period lock instruction).
- Financial Close System → "Publish period-close certificate and archive close
  evidence" (lock confirmation and close audit trail).

7. Data objects
Data Object "Close Checklist" — read by / written by "Work next close
checklist task" and "Update close task status in Financial Close System".
Data Object "Trial Balance" — written by "Prepare trial balance and period-end
variance pack", read by "Review trial balance, reconciliation status and open
items against month-end close procedure".
Data Object "Close Pack" — written by "Submit close pack to Finance
Controller for review", read by "Re-review corrected close pack".
Data Object "Correcting Journal" — written by "Post correcting adjustment in
the period".
Data Object "Period-Close Certificate" — written by "Publish period-close
certificate and archive close evidence".
Data Store "General Ledger" — read by "Run sub-ledger to general ledger
interface check", written by "Lock accounting period in Financial Close
System".
Data Store "Close Evidence Archive" — written by "Attach supporting schedule
and sign-off evidence" and "Publish period-close certificate and archive close
evidence".

This subprocess drives the month-end close procedure to completion: cut-off is
confirmed, every checklist task is worked and evidenced, the trial balance is
reviewed and exceptions corrected, and the controller approves and locks the
period. It hands a closed, locked and certified ledger, with its trial balance
and close evidence, to Consolidate Entities (V03.07), which relies on the
period being final before group elimination and translation entries are made.
```

### V03.07 — Consolidate Entities

**BPMN diagram prompt.**

```text
BPMN: V03.07 Consolidate Entities — the group-level roll-up that turns closed
entity ledgers into a single consolidated set of figures for reporting.

1. Pools & Lanes
Pool "Finance Organisation" — the organisation running the consolidation, with
lanes top-to-bottom: External Reporting, Finance Controller.
Pool "Consolidation System" — the group consolidation application holding entity
submissions, translation rates, elimination rules and consolidated balances.

2. Pool properties
Pool "Finance Organisation" — white-box, holds the entire process flow, single
instance.
Pool "Consolidation System" — black-box, System = true, single instance.

3. Layout
Top to bottom: Finance Organisation (lane External Reporting, then lane Finance
Controller), then Consolidation System at the bottom as the supporting IT
system.

4. Lane contents in flow order (Finance Organisation)

External Reporting lane:
- Message start event "Closed period ledgers received from V03.06"
- Service task "Open consolidation cycle in Consolidation System"
- Service task "Load entity trial balances into Consolidation System"
- Intermediate message catch event "All entity submissions received"
- User task "Check entity submission completeness and mapping"
- Exclusive gateway "All entities submitted and mapped?"
  - branch "Submissions missing or unmapped": User task "Chase entity
    submission and correct account mapping"; then rejoin
  - branch "Complete": proceed to currency translation
- Exclusive merge gateway "Entity data complete"
- Service task "Apply currency translation rates in Consolidation System"
- Expanded Subprocess "Repeat Until Eliminations Balance" (standard loop)
  containing, in order: User task "Identify intercompany balances and
  transactions"; User task "Post elimination entries"; Service task "Run
  consolidation calculation in Consolidation System"; User task "Review
  intercompany mismatch report"
- User task "Post minority interest and equity accounting adjustments"
- Service task "Generate consolidated trial balance from Consolidation System"
- User task "Prepare consolidation pack and movement analysis"
- Send task "Submit consolidated result to Finance Controller for review"

Finance Controller lane:
- User task "Review consolidated trial balance and elimination entries"
- Exclusive gateway "Consolidation approved?"
  - branch "Adjustments required": User task "Record controller adjustment
    instructions"; Service task "Post top-side adjustment in Consolidation
    System"; then rejoin
  - branch "Approved": proceed to lock
- Exclusive merge gateway "Consolidation reviewed"
- User task "Approve consolidated position under accounting policy"
- Service task "Lock consolidation cycle in Consolidation System"
- Send task "Release consolidated figures to reporting teams"
- End event "Consolidated group figures released — ready for Prepare Management
  Reports (V03.08) and Prepare Statutory Reports (V03.09)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Eliminations Balance", labelled "Elimination deadline reached", leading to
  User task "Escalate unresolved intercompany difference to Finance
  Controller", which rejoins at "Post minority interest and equity accounting
  adjustments".
- Interrupting error boundary event on Service task "Run consolidation
  calculation in Consolidation System" (inside the loop subprocess), labelled
  "Consolidation calculation failed", leading to User task "Correct
  consolidation rules and rerun".
- Non-interrupting timer boundary event on Intermediate message catch event is
  not used; instead, non-interrupting timer boundary event on User task "Chase
  entity submission and correct account mapping", labelled "Submission
  reminder due", leading to Send task "Issue submission reminder to entity
  finance team".

6. Connectors
Sequence flows: the flow runs down the External Reporting lane from the message
start event through cycle opening, data load, the "All entity submissions
received" catch event and the completeness check; the "All entities submitted
and mapped?" gateway branches to chasing or straight through, and both branches
rejoin at "Entity data complete"; translation, the "Repeat Until Eliminations
Balance" subprocess, minority interest adjustments, consolidated trial balance
generation and pack preparation follow in sequence; the send task hands the flow
to the Finance Controller lane, where the "Consolidation approved?" gateway
branches to adjustment posting or straight through, both rejoining at
"Consolidation reviewed" before approval, locking, release and the end event.

Message flows:
- Consolidation System → Finance Organisation "Load entity trial balances into
  Consolidation System" (entity trial balance files and mapping status).
- Consolidation System → Finance Organisation, intermediate message catch event
  "All entity submissions received" (submission-complete notification).
- Finance Organisation "Apply currency translation rates in Consolidation
  System" → Consolidation System (translation rate set and effective dates).
- Finance Organisation "Post elimination entries" → Consolidation System
  (intercompany elimination journals).
- Consolidation System → Finance Organisation "Review intercompany mismatch
  report" (mismatch and out-of-balance report).
- Finance Organisation "Post top-side adjustment in Consolidation System" →
  Consolidation System (controller adjustment entries).
- Consolidation System → Finance Organisation "Generate consolidated trial
  balance from Consolidation System" (consolidated trial balance).
- Finance Organisation "Lock consolidation cycle in Consolidation System" →
  Consolidation System (cycle lock instruction).

7. Data objects
Data Object "Entity Trial Balance" — read by "Check entity submission
completeness and mapping", written by "Load entity trial balances into
Consolidation System".
Data Object "Intercompany Elimination Entries" — written by "Post elimination
entries".
Data Object "Currency Translation Rate Table" — read by "Apply currency
translation rates in Consolidation System".
Data Object "Intercompany Mismatch Report" — read by "Review intercompany
mismatch report".
Data Object "Top-Side Adjustment Entry" — written by "Post top-side adjustment
in Consolidation System".
Data Object "Consolidation Pack" — written by "Prepare consolidation pack and
movement analysis", read by "Review consolidated trial balance and elimination
entries".
Data Store "Consolidated Ledger" — written by "Lock consolidation cycle in
Consolidation System", read by "Generate consolidated trial balance from
Consolidation System".
Data Store "Group Chart of Accounts Mapping" — read by "Check entity submission
completeness and mapping".

This subprocess takes the closed ledgers of each entity, aligns them to the
group chart of accounts, translates currencies, eliminates intercompany
positions and records minority interest, then puts the result through
controller review and approval. It hands a locked, approved consolidated trial
balance and consolidation pack to Prepare Management Reports (V03.08) and
Prepare Statutory Reports (V03.09), and leaves an audit trail of eliminations
and adjustments for Support Audit (V03.11).
```

### V03.08 — Prepare Management Reports

**BPMN diagram prompt.**

```text
BPMN: V03.08 Prepare Management Reports — turns the consolidated group
figures into the internal performance reporting pack for management and
the Board, ahead of statutory reporting.

1. Pools & Lanes
Pool "Finance Organisation" — the white-box pool holding the whole flow,
with lanes top-to-bottom: Management Accounting, Finance Controller.
Pool "Board Members" — external recipients who review and question the
management reporting pack.
Pool "Reporting / BI Platform" — IT system holding the reporting data
model, report templates and published packs.

2. Pool properties
Pool "Board Members" — black-box, single instance per reporting cycle.
Pool "Finance Organisation" — white-box, holds the process flow; the only
white-box pool in the diagram.
Pool "Reporting / BI Platform" — black-box, System = true.

3. Layout
Top to bottom: "Board Members", then "Finance Organisation" (lanes
Management Accounting above Finance Controller), then "Reporting / BI
Platform" at the bottom.

4. Lane contents in flow order (Finance Organisation)

Management Accounting lane:
- Message start event "Consolidated group figures received from V03.07"
- Service task "Refresh reporting data from Reporting / BI Platform"
- User task "Confirm reporting calendar and pack scope"
- Service task "Extract actuals by entity, cost centre and account"
- User task "Compare actuals to budget and forecast"
- Expanded Subprocess "Repeat Until Variances Explained" (standard loop)
  containing, in order: User task "Identify material variance";
  Send task "Request explanation from budget owner"; Intermediate message
  catch event "Budget owner responds"; User task "Record variance
  commentary"
  - Timer boundary event on this subprocess caps the commentary window.
- User task "Draft management commentary and KPI narrative"
- Service task "Assemble management reporting pack in Reporting / BI
  Platform"
- Send task "Submit draft pack to Finance Controller"

Finance Controller lane:
- User task "Review pack for accuracy and consistency with consolidation"
- Exclusive gateway "Pack approved?"
  - branch "changes required": User task "Record review comments and
    required changes"; Send task "Return pack to Management Accounting for
    rework"; Intermediate message catch event "Revised pack received";
    rejoins the merge below.
  - branch "approved": User task "Sign off management reporting pack";
    rejoins the merge below.
- Exclusive merge gateway "Pack review complete"
- Service task "Publish approved pack on Reporting / BI Platform"
- Send task "Distribute management reporting pack to Board Members"
- Intermediate message catch event "Board questions or acceptance
  received"
- Exclusive gateway "Board questions raised?"
  - branch "questions raised": User task "Prepare responses to Board
    questions"; Send task "Send responses to Board Members"; rejoins the
    merge below.
  - branch "pack accepted": no further action; rejoins the merge below.
- Exclusive merge gateway "Board feedback closed"
- User task "Archive pack and file reporting cycle record"
- End event "Management reports issued — ready for Prepare Statutory
  Reports (V03.09)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Variances Explained", labelled "Commentary deadline reached", leading to
  User task "Draft management commentary and KPI narrative" with
  outstanding variances flagged as unexplained.
- Non-interrupting timer boundary event on User task "Review pack for
  accuracy and consistency with consolidation", labelled "Review overdue",
  triggering Send task "Escalate review delay to Finance Controller".
- Interrupting error boundary event on Service task "Assemble management
  reporting pack in Reporting / BI Platform", labelled "Data extract
  failed", leading to Service task "Refresh reporting data from Reporting
  / BI Platform".

6. Connectors
Sequence flows: the flow runs from the message start event through the
Management Accounting lane in the order listed, crosses to the Finance
Controller lane at "Submit draft pack to Finance Controller", and
continues in that lane to the end event. The gateway "Pack approved?"
splits into "changes required" and "approved", both rejoining at
"Exclusive merge gateway 'Pack review complete'". The gateway "Board
questions raised?" splits into "questions raised" and "pack accepted",
both rejoining at "Exclusive merge gateway 'Board feedback closed'".

Message flows:
- Reporting / BI Platform → "Refresh reporting data from Reporting / BI
  Platform" (consolidated actuals, budget and forecast data).
- "Extract actuals by entity, cost centre and account" → Reporting / BI
  Platform (extract request and filter parameters).
- "Assemble management reporting pack in Reporting / BI Platform" →
  Reporting / BI Platform (pack structure, tables, charts and commentary).
- "Publish approved pack on Reporting / BI Platform" → Reporting / BI
  Platform (approved pack version and distribution list).
- "Distribute management reporting pack to Board Members" → Board Members
  (management reporting pack and commentary).
- Board Members → "Board questions or acceptance received" (questions,
  requests for additional analysis, or acceptance).
- "Send responses to Board Members" → Board Members (answers and
  supporting schedules).

7. Data objects
Data Object "Management Reporting Pack" — written by "Assemble management
reporting pack in Reporting / BI Platform", read by "Review pack for
accuracy and consistency with consolidation".
Data Object "Variance Commentary" — written by "Record variance
commentary", read by "Draft management commentary and KPI narrative".
Data Object "Review Comments" — written by "Record review comments and
required changes", read by "Assemble management reporting pack in
Reporting / BI Platform".
Data Object "Board Response Note" — written by "Prepare responses to Board
questions", read by "Send responses to Board Members".
Data Store "Consolidated Ledger Figures" — read by "Extract actuals by
entity, cost centre and account".
Data Store "Budget and Forecast Data" — read by "Compare actuals to budget
and forecast".
Data Store "Reporting Pack Archive" — written by "Archive pack and file
reporting cycle record".

This subprocess converts the consolidated group figures into an explained,
reviewed and approved management reporting pack, with variances commented
on by budget owners and Board questions answered and closed. It hands the
signed-off internal view of period performance, together with its
commentary and archived pack, to Prepare Statutory Reports (V03.09).
```

### V03.09 — Prepare Statutory Reports

**BPMN diagram prompt.**

```text
BPMN: V03.09 Prepare Statutory Reports — the statutory reporting step of the
Record to Report value chain, turning consolidated group results into signed
annual and interim financial statements filed with the regulator and issued
to shareholders.

1. Pools & Lanes
Pool "Regulator" — external body that receives and acknowledges the filed
statutory financial statements.
Pool "Shareholders / Owners" — external recipients of the published annual
and interim financial statements.
Pool "Finance Organisation" — the organisation running the process, with
lanes top-to-bottom: External Reporting, Finance Controller, CFO.
Pool "Disclosure Management System" — system of record for statement
drafting, note tagging, version control and filing packages.

2. Pool properties
Pool "Regulator" — black-box, single instance.
Pool "Shareholders / Owners" — black-box, single instance.
Pool "Finance Organisation" — white-box, holds the process flow.
Pool "Disclosure Management System" — black-box, System = true.

3. Layout
Top to bottom: "Regulator", "Shareholders / Owners", "Finance Organisation"
(lanes External Reporting, Finance Controller, CFO), then "Disclosure
Management System" at the bottom.

4. Lane contents in flow order (Finance Organisation)

External Reporting lane:
- Message start event "Consolidated group results received from V03.07"
- Service task "Retrieve consolidated trial balance and consolidation
  entries"
- User task "Confirm statutory reporting requirements and filing calendar"
- Service task "Open statutory reporting pack in Disclosure Management
  System"
- User task "Draft primary financial statements"
- Expanded Subprocess "Repeat Until Disclosures Complete" (standard loop)
  containing, in order: User task "Draft notes and disclosures", User task
  "Collect supporting schedules from Finance teams", Service task "Tag and
  version disclosures in Disclosure Management System", User task "Run
  disclosure checklist against statutory reporting requirements"
- Service task "Compile draft statutory report pack"
- Send task "Submit draft pack to Finance Controller for review"

Finance Controller lane:
- User task "Review statements against accounting policy and statutory
  reporting requirements"
- Exclusive gateway "Review outcome?"
  - branch "Corrections required": User task "Log review corrections",
    Service task "Return pack to External Reporting for rework in Disclosure
    Management System"
  - branch "Review passed": User task "Confirm consistency with consolidated
    ledger balances"
- Exclusive merge gateway "Controller review resolved"
- User task "Prepare CFO briefing on key judgements and disclosures"
- Send task "Forward statutory pack to CFO for approval"

CFO lane:
- User task "Review statutory financial statements and key judgements"
- Exclusive gateway "CFO approves for signature?"
  - branch "Approved": User task "Sign statutory financial statements"
  - branch "Not approved": User task "Record CFO objections and required
    changes", Service task "Reissue pack for revision in Disclosure
    Management System"
- Exclusive merge gateway "CFO decision resolved"
- Service task "Record approval and signature in Disclosure Management
  System"

External Reporting lane:
- Service task "Generate final filing package in Disclosure Management
  System"
- Send task "File statutory financial statements with Regulator"
- Intermediate message catch event "Regulator filing acknowledgement
  received"
- Send task "Publish annual and interim statements to Shareholders / Owners"
- Service task "Archive signed statements and supporting schedules"
- End event "Statutory reports filed and published — ready for Submit Tax /
  Regulatory Returns (V03.10)"

5. Edge-mounted (boundary) events
- Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Disclosures Complete", labelled "Disclosure drafting deadline reached",
  leading to User task "Escalate incomplete disclosures to Finance
  Controller" in the Finance Controller lane, which rejoins the flow at
  Service task "Compile draft statutory report pack".
- Interrupting timer boundary event on Intermediate message catch event is
  not used; instead an interrupting timer boundary event on Send task "File
  statutory financial statements with Regulator", labelled "Statutory filing
  deadline at risk", leading to User task "Notify CFO of filing deadline
  risk" in the CFO lane, which rejoins before the acknowledgement catch
  event.
- Interrupting error boundary event on Service task "Generate final filing
  package in Disclosure Management System", labelled "Filing package
  validation failed", leading to User task "Correct filing package errors"
  in the External Reporting lane, which rejoins before Send task "File
  statutory financial statements with Regulator".

6. Connectors
Sequence flows: the flow runs External Reporting (start, retrieval,
drafting, disclosure loop, pack compilation) to Finance Controller (review,
"Review outcome?" branching into corrections or pass, both rejoining at
"Controller review resolved") to CFO ("CFO approves for signature?"
branching into approval or objections, both rejoining at "CFO decision
resolved") and back to External Reporting for filing, acknowledgement,
publication, archiving and the end event. No branch terminates in its own
end event; all rejoin at the named merge gateways.

Message flows:
- Disclosure Management System → Service task "Retrieve consolidated trial
  balance and consolidation entries" (consolidated trial balance and
  consolidation entries).
- Service task "Open statutory reporting pack in Disclosure Management
  System" → Disclosure Management System (statutory reporting pack shell).
- Service task "Tag and version disclosures in Disclosure Management System"
  → Disclosure Management System (tagged and versioned disclosure text).
- Service task "Record approval and signature in Disclosure Management
  System" → Disclosure Management System (CFO approval and signature
  record).
- Disclosure Management System → Service task "Generate final filing package
  in Disclosure Management System" (validated filing package).
- Send task "File statutory financial statements with Regulator" → Regulator
  (signed statutory financial statements and filing package).
- Regulator → Intermediate message catch event "Regulator filing
  acknowledgement received" (filing acknowledgement or receipt reference).
- Send task "Publish annual and interim statements to Shareholders / Owners"
  → Shareholders / Owners (published annual and interim financial
  statements).

7. Data objects
Data Store "Consolidated Ledger Balances" — read by "Retrieve consolidated
trial balance and consolidation entries".
Data Object "Draft Statutory Report Pack" — written by "Compile draft
statutory report pack", read by "Review statements against accounting policy
and statutory reporting requirements".
Data Object "Disclosure Checklist" — read by "Run disclosure checklist
against statutory reporting requirements".
Data Object "Supporting Schedules" — written by "Collect supporting
schedules from Finance teams", read by "Confirm consistency with
consolidated ledger balances".
Data Object "Review Corrections Log" — written by "Log review corrections".
Data Object "Signed Statutory Financial Statements" — written by "Sign
statutory financial statements", read by "Generate final filing package in
Disclosure Management System".
Data Object "Regulatory Filing Package" — written by "Generate final filing
package in Disclosure Management System", read by "File statutory financial
statements with Regulator".
Data Store "Statutory Reporting Archive" — written by "Archive signed
statements and supporting schedules".

This subprocess converts the consolidated group position into statutory
financial statements that satisfy accounting policy and statutory reporting
requirements, secures Finance Controller review and CFO signature, files the
package with the Regulator and publishes it to Shareholders / Owners.
It hands the signed statements, supporting schedules and filing archive to
Submit Tax / Regulatory Returns (V03.10) and, later, to Support Audit
(V03.11) as evidence.
```

### V03.10 — Submit Tax / Regulatory Returns

**BPMN diagram prompt.**

```text
BPMN: V03.10 Submit Tax / Regulatory Returns — the filing subprocess of the
Record to Report value chain, converting approved statutory figures into tax
and regulatory submissions lodged with the authorities.

1. Pools & Lanes
Pool "Tax Authority" — external revenue authority receiving tax returns and
issuing filing receipts, assessments and queries.
Pool "Regulator" — external supervisory body receiving regulatory and
covenant-related compliance returns.
Pool "Finance Organisation" — the organisation running the process, with lanes
top-to-bottom: Tax, Treasury.
Pool "Tax System" — IT system holding tax calculations, return templates and
filing records.

2. Pool properties
Pool "Tax Authority" — black-box, single instance.
Pool "Regulator" — black-box, single instance.
Pool "Finance Organisation" — white-box, holds the process flow; lanes Tax and
Treasury.
Pool "Tax System" — black-box, System = true.

3. Layout
Top to bottom: "Tax Authority", "Regulator", "Finance Organisation" (lanes Tax
then Treasury), "Tax System".

4. Lane contents in flow order (Finance Organisation)

Tax lane:
- Message start event "Approved statutory figures received from V03.09"
- Service task "Extract ledger and statutory balances into Tax System"
- User task "Determine returns due in the filing calendar"
- Expanded Subprocess "Repeat Until All Returns Prepared" (standard loop)
  containing, in order: User task "Select next return in scope"; User task
  "Compute tax position under tax compliance policy"; Service task "Draft
  return in Tax System"; User task "Reconcile return to statutory figures";
  User task "Attach supporting schedules to the return"
- Timer boundary event on the subprocess (see section 5)
- User task "Review draft returns against tax compliance policy"
- Exclusive gateway "Return type?"
  - branch "Tax return": Send task "Submit tax return to Tax Authority"
  - branch "Regulatory return": passes to the Treasury lane for compilation and
    filing of the regulatory return
  - branch "Both due": both branches run and rejoin at the merge gateway
- Exclusive merge gateway "Returns lodged"
- Intermediate message catch event "Filing acknowledgement received"
- Exclusive gateway "Authority query raised?"
  - branch "Query raised": User task "Prepare response to authority query";
    Send task "Send query response to Tax Authority"; then to the merge
  - branch "No query": straight to the merge
- Exclusive merge gateway "Filing settled"
- Service task "Record filing confirmations and payment position in Tax System"
- End event "Returns submitted and filings evidenced — ready for Support Audit
  (V03.11)"

Treasury lane:
- User task "Compile regulatory and covenant reporting data"
- User task "Confirm settlement of tax and levy payments due"
- Send task "Submit regulatory return to Regulator"
- Intermediate message catch event "Regulator confirms receipt"
- Service task "Log regulatory filing outcome in Tax System"

5. Edge-mounted (boundary) events
Interrupting timer boundary event on Expanded Subprocess "Repeat Until All
Returns Prepared", labelled "Statutory filing deadline minus five days" —
escalates to User task "Review draft returns against tax compliance policy"
with the returns prepared so far flagged for controller attention.
Non-interrupting message boundary event on Send task "Submit tax return to Tax
Authority", labelled "Submission rejected by Tax Authority" — triggers User
task "Correct and resubmit return", which rejoins at Exclusive merge gateway
"Returns lodged".

6. Connectors
Sequence flows: the flow starts in the Tax lane at the message start event,
runs through extraction, calendar determination and the looped preparation
subprocess to the review task, then diverges at "Return type?"; the tax branch
files directly from the Tax lane, the regulatory branch crosses to the Treasury
lane for compilation, payment confirmation and filing before returning, and
both rejoin at "Returns lodged". After the acknowledgement catch event the flow
diverges at "Authority query raised?" and both branches rejoin at "Filing
settled" before the recording service task and the end event.
Message flows:
- Finance Organisation "Submit tax return to Tax Authority" → Tax Authority
  (completed tax return and supporting schedules).
- Tax Authority → Finance Organisation "Filing acknowledgement received"
  (filing receipt, assessment or query).
- Finance Organisation "Send query response to Tax Authority" → Tax Authority
  (explanations and additional evidence).
- Finance Organisation "Submit regulatory return to Regulator" → Regulator
  (regulatory and covenant compliance return).
- Regulator → Finance Organisation "Regulator confirms receipt" (acceptance
  confirmation).
- Finance Organisation "Extract ledger and statutory balances into Tax System"
  → Tax System (balance extraction request) and Tax System → the task (ledger
  and statutory balances).
- Finance Organisation "Draft return in Tax System" → Tax System (computed tax
  positions and draft return).
- Finance Organisation "Record filing confirmations and payment position in Tax
  System" → Tax System (filing receipts and payment status).
- Finance Organisation "Log regulatory filing outcome in Tax System" → Tax
  System (regulatory filing confirmation).

7. Data objects
Data Object "Tax Return" — written by "Draft return in Tax System", read by
"Submit tax return to Tax Authority".
Data Object "Regulatory / Covenant Return" — written by "Compile regulatory and
covenant reporting data", read by "Submit regulatory return to Regulator".
Data Object "Tax Calculation" — written by "Compute tax position under tax
compliance policy", read by "Reconcile return to statutory figures".
Data Object "Supporting Schedules" — read by "Attach supporting schedules to
the return".
Data Object "Authority Query Response" — written by "Prepare response to
authority query".
Data Store "Filing Register" — written by "Record filing confirmations and
payment position in Tax System" and "Log regulatory filing outcome in Tax
System".
Data Store "Filing Calendar" — read by "Determine returns due in the filing
calendar".

This subprocess turns the approved statutory position into the tax and
regulatory returns the organisation is obliged to lodge, files them with the
Tax Authority and the Regulator, and settles any queries arising. It hands
forward confirmed submissions, tax calculations and filing evidence, which
Support Audit (V03.11) uses as audit evidence for external review.
```

### V03.11 — Support Audit

**BPMN diagram prompt.**

```text
BPMN: V03.11 Support Audit — the closing subprocess of the Record to
Report value chain, in which Finance answers external audit requests and
clears findings on the reported figures.

1. Pools & Lanes
Pool "External Auditor" — the independent audit firm examining the
financial statements and supporting records.
Pool "Finance Organisation" — the organisation running the process, with
lanes top-to-bottom: Internal Audit, Financial Accounting, Finance
Controller.
Pool "Audit Management System" — the tool holding audit requests, evidence
logs and findings.
Pool "Document Management System" — the repository holding supporting
documents and evidence packs.

2. Pool properties
Pool "External Auditor" — black-box, single instance.
Pool "Finance Organisation" — white-box, holds the process flow.
Pool "Audit Management System" — black-box, System = true, single instance.
Pool "Document Management System" — black-box, System = true, single
instance.

3. Layout
Top to bottom: External Auditor; Finance Organisation (lanes Internal
Audit, Financial Accounting, Finance Controller); Audit Management System;
Document Management System.

4. Lane contents in flow order (Finance Organisation)

Internal Audit lane:
- Message start event "Audit request received from External Auditor"
- User task "Log audit request and prepared-by-client list"
- Service task "Record audit request in Audit Management System"
- User task "Assess scope and assign evidence owners"
- Exclusive gateway "Request within agreed audit scope?"
  - branch "In scope": continue to Financial Accounting lane
  - branch "Out of scope or requires clarification": Send task "Query scope
    with External Auditor", then Intermediate message catch event "Auditor
    clarifies request", then rejoin
- Exclusive merge gateway "Audit scope agreed"

Financial Accounting lane:
- Expanded Subprocess "Repeat Until All Audit Requests Satisfied"
  (standard loop) containing, in order: User task "Extract ledger balances
  and supporting schedules"; Service task "Retrieve source documents from
  Document Management System"; User task "Compile evidence pack"; User task
  "Perform internal quality check on evidence pack"; Service task "Attach
  evidence pack to request in Audit Management System"; Send task "Submit
  evidence pack to External Auditor"; Intermediate message catch event
  "Auditor acknowledges or raises follow-up"
- Service task "Update evidence log in Audit Management System"
- Intermediate message catch event "Audit findings received from External
  Auditor"

Finance Controller lane:
- User task "Review audit findings and proposed adjustments"
- Exclusive gateway "Adjustments or corrective actions required?"
  - branch "Adjustments required": User task "Agree correcting entries and
    remediation actions"; Service task "Raise adjustment and action items
    in Audit Management System"; Send task "Send management response to
    External Auditor"
  - branch "No adjustments": User task "Record clean outcome on findings
    log"
- Exclusive merge gateway "Findings resolved"
- User task "Prepare and sign management representation letter"
- Send task "Issue management representation letter to External Auditor"
- Intermediate message catch event "Audit opinion and closure notice
  received"
- Service task "Archive audit file in Document Management System"
- End event "Audit supported and closed — Record to Report cycle complete"

5. Edge-mounted (boundary) events
Interrupting timer boundary event on Expanded Subprocess "Repeat Until All
Audit Requests Satisfied", labelled "Audit deadline reached", leading to
User task "Escalate outstanding requests to Finance Controller" in the
Finance Controller lane, which rejoins at Exclusive merge gateway "Findings
resolved".
Non-interrupting message boundary event on User task "Review audit findings
and proposed adjustments", labelled "Additional auditor request arrives",
leading to Service task "Log supplementary request in Audit Management
System".
Interrupting escalation boundary event on User task "Agree correcting
entries and remediation actions", labelled "Material misstatement
identified", leading to Send task "Escalate material issue to CFO and Audit
Committee" and End event "Material issue escalated — handled outside this
subprocess" (this branch does not rejoin).

6. Connectors
Sequence flows: the flow runs from the message start event in the Internal
Audit lane through request logging, scoping and the "Request within agreed
audit scope?" gateway, whose two branches rejoin at "Audit scope agreed";
into the Financial Accounting lane for the looped evidence subprocess, the
evidence log update and the catch of audit findings; then into the Finance
Controller lane, where the "Adjustments or corrective actions required?"
gateway branches rejoin at "Findings resolved" before the representation
letter, the closure catch event, archiving and the end event. The
escalation branch terminates in its own end event.

Message flows:
External Auditor → Finance Organisation "Log audit request and
prepared-by-client list" (audit request and PBC list).
External Auditor → Finance Organisation "Auditor clarifies request" (scope
clarification).
Finance Organisation "Query scope with External Auditor" → External Auditor
(scope query).
Finance Organisation "Submit evidence pack to External Auditor" → External
Auditor (evidence pack and supporting schedules).
External Auditor → Finance Organisation "Auditor acknowledges or raises
follow-up" (acknowledgement or follow-up question).
External Auditor → Finance Organisation "Audit findings received from
External Auditor" (draft findings and proposed adjustments).
Finance Organisation "Send management response to External Auditor" →
External Auditor (management response and remediation plan).
Finance Organisation "Issue management representation letter to External
Auditor" → External Auditor (signed representation letter).
External Auditor → Finance Organisation "Audit opinion and closure notice
received" (audit opinion and closure notice).
Finance Organisation "Record audit request in Audit Management System" →
Audit Management System (request record).
Finance Organisation "Attach evidence pack to request in Audit Management
System" → Audit Management System (evidence reference).
Finance Organisation "Update evidence log in Audit Management System" →
Audit Management System (evidence status).
Finance Organisation "Raise adjustment and action items in Audit Management
System" → Audit Management System (findings and actions).
Finance Organisation "Log supplementary request in Audit Management System"
→ Audit Management System (supplementary request).
Audit Management System → Finance Organisation "Assess scope and assign
evidence owners" (open request list and owners).
Document Management System → Finance Organisation "Retrieve source
documents from Document Management System" (source documents and
contracts).
Finance Organisation "Archive audit file in Document Management System" →
Document Management System (closed audit file).

7. Data objects
Data Object "Audit request / PBC list" — read by "Log audit request and
prepared-by-client list", read by "Assess scope and assign evidence
owners".
Data Object "Supporting schedule" — written by "Extract ledger balances and
supporting schedules", read by "Compile evidence pack".
Data Object "Audit evidence pack" — written by "Compile evidence pack",
read by "Perform internal quality check on evidence pack", read by "Submit
evidence pack to External Auditor".
Data Object "Audit findings report" — read by "Review audit findings and
proposed adjustments".
Data Object "Management response" — written by "Agree correcting entries
and remediation actions", read by "Send management response to External
Auditor".
Data Object "Management representation letter" — written by "Prepare and
sign management representation letter", read by "Issue management
representation letter to External Auditor".
Data Store "Audit evidence log" — written by "Update evidence log in Audit
Management System", read by "Escalate outstanding requests to Finance
Controller".
Data Store "Audit findings and actions register" — written by "Raise
adjustment and action items in Audit Management System", read by "Record
clean outcome on findings log".
Data Store "Audit file archive" — written by "Archive audit file in
Document Management System".

This subprocess gives external audit a single controlled channel into the
closed ledger, turning audit requests into quality-checked evidence packs,
tracked findings and agreed corrective actions. It ends with a signed
management representation letter, a received audit opinion and an archived
audit file. As the last subprocess in V03, it hands no work forward: it
closes the Record to Report cycle with assured, filed and defensible
financial records.
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
BPMN: V04.01 Workforce Planning — the first subprocess of the Hire to
Retire value chain, in which the organisation identifies staffing needs,
validates them against budget, and releases approved headcount requests
to initiate vacancy creation.

1. Pools & Lanes

Pool "Employing Organisation" — the organisation running the workforce
planning process, containing three lanes top to bottom:
  Lane "Hiring Manager / People Manager" (key role: people manager)
  Lane "Human Resources" (key role: HR business partner)
  Lane "Finance" (key role: finance controller)
Pool "HRIS / HCM System" — the HR information and headcount management
system used to record workforce data and generate reports.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "HRIS / HCM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Employing Organisation (white-box, three lanes)
2. HRIS / HCM System (black-box, bottom)

4. Lane contents in flow order (Employing Organisation)

Hiring Manager / People Manager lane:
  None start event "Workforce planning cycle begins"
  User task "Review team capacity and identify staffing gaps"
  User task "Document headcount requirements and justification"
  Send task "Submit headcount request to Human Resources"

Human Resources lane:
  Intermediate message catch event "Headcount request received"
  User task "Consolidate headcount requests across business units"
  Service task "Retrieve current workforce data from HRIS / HCM System"
  User task "Analyse workforce data and validate requests against
    workforce plan"
  Exclusive gateway "Requests aligned with workforce plan?"
    - branch "Yes — proceed": Send task "Forward validated requests
        to Finance for budget review"
    - branch "No — return for revision": Send task "Return request
        to Hiring Manager with feedback"
        Intermediate message catch event "Revised request received"
        (then continues to "Consolidate headcount requests across
        business units" via the exclusive merge gateway)
  Exclusive merge gateway "Requests aligned with workforce plan"
  Send task "Forward validated requests to Finance for budget review"

Finance lane:
  Intermediate message catch event "Validated headcount request
    received"
  User task "Assess headcount request against approved budget"
  Exclusive gateway "Budget available?"
    - branch "Approved": User task "Record budget approval"
      Send task "Notify Human Resources of budget approval"
    - branch "Not approved": User task "Document budget rejection
        or deferral rationale"
      Send task "Notify Human Resources of rejection or deferral"
  Exclusive merge gateway "Budget available"

Human Resources lane (continued):
  Intermediate message catch event "Finance decision received"
  Exclusive gateway "Request approved by Finance?"
    - branch "Approved": Service task "Record approved headcount
        in HRIS / HCM System"
      User task "Confirm approved headcount to Hiring Manager"
      End event "Approved headcount confirmed — ready for
        Create Vacancy (V04.02)"
    - branch "Rejected or deferred": User task "Advise Hiring
        Manager of outcome and document rationale"
      End event "Request rejected or deferred — workforce planning
        closed without proceeding to V04.02"
  Exclusive merge gateway "Request approved by Finance"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess (implicit
  in the revision loop) — not applicable as a separate boundary here.
Interrupting timer boundary event on "Assess headcount request against
  approved budget" — label "Budget review overdue (10 business days)";
  on trigger: Send task "Escalate overdue budget review to finance
  controller"; flow rejoins after the Finance decision gateway.

6. Connectors

Sequence flows: work begins in the Hiring Manager / People Manager
lane, passes via message to Human Resources, which may loop back
through itself for revision before passing to Finance; Finance returns
its decision to Human Resources, which then takes the approved branch
to an end event or the rejected branch to a separate end event.
The timer boundary on the Finance task routes an escalation send task
that rejoins the flow after the budget gateway.

Message flows:
  Hiring Manager / People Manager "Submit headcount request" →
    Human Resources "Headcount request received" (headcount request
    with justification)
  Human Resources "Return request to Hiring Manager with feedback" →
    Hiring Manager / People Manager "Revised request received"
    (revision feedback)
  Human Resources "Forward validated requests to Finance" →
    Finance "Validated headcount request received" (validated
    headcount request)
  Finance "Notify Human Resources of budget approval" →
    Human Resources "Finance decision received" (budget approval
    notification)
  Finance "Notify Human Resources of rejection or deferral" →
    Human Resources "Finance decision received" (rejection or
    deferral notification)
  Human Resources "Retrieve current workforce data" →
    HRIS / HCM System (workforce data request)
  HRIS / HCM System → Human Resources "Retrieve current workforce
    data" (current workforce data and headcount report)
  Human Resources "Record approved headcount in HRIS / HCM System" →
    HRIS / HCM System (approved headcount record)

7. Data objects

Data Object "Headcount Request" — written by "Document headcount
  requirements and justification"; read by "Consolidate headcount
  requests across business units"; read by "Assess headcount request
  against approved budget".
Data Object "Workforce Plan" — read by "Analyse workforce data and
  validate requests against workforce plan".
Data Object "Budget Approval Record" — written by "Record budget
  approval"; read by "Record approved headcount in HRIS / HCM System".
Data Object "Rejection or Deferral Rationale" — written by "Document
  budget rejection or deferral rationale"; read by "Advise Hiring
  Manager of outcome and document rationale".
Data Store "HRIS / HCM System — Workforce Data" — read by "Retrieve
  current workforce data from HRIS / HCM System"; written by "Record
  approved headcount in HRIS / HCM System".

V04.01 Workforce Planning establishes the authorised headcount that
drives all subsequent hiring activity. People managers surface
capacity gaps, Human Resources validates them against the workforce
plan, and Finance confirms budget availability. The subprocess hands
an approved headcount record to V04.02 Create Vacancy, where a formal
job requisition is raised for each approved position.
```

### V04.02 — Create Vacancy

**BPMN diagram prompt.**

```text
BPMN: V04.02 Create Vacancy — second subprocess in the Hire to Retire
value chain, converting an approved workforce need into a published vacancy
ready for candidate attraction.

1. Pools & Lanes

Pool "Employing Organisation" — the internal teams that create and approve
the vacancy.
  Lane "Hiring Manager / People Manager" — hiring manager who initiates
  and approves the vacancy details.
  Lane "Recruitment" — recruiter who drafts, refines, and publishes the
  job requisition.
Pool "Applicant Tracking System" — ATS that stores and manages vacancy
records.

2. Pool properties

Pool "Employing Organisation": white-box, single instance.
Pool "Applicant Tracking System": black-box, System = true, single instance.

3. Layout

Top: Employing Organisation (white-box, spanning both lanes).
Bottom: Applicant Tracking System.

4. Lane contents in flow order (Employing Organisation)

Hiring Manager / People Manager lane:
  Message start event "Approved headcount need received from V04.01"
  User task "Raise job requisition"
  User task "Define role requirements and selection criteria"
  Send task "Submit requisition for HR / Recruitment review"

Recruitment lane:
  Intermediate message catch event "Requisition received"
  User task "Review and validate requisition"
  Exclusive gateway "Requisition complete?"
    - branch "No — details missing": Expanded Subprocess "Repeat Until
      Requisition Complete" (standard loop) containing, in order:
      Send task "Return requisition with feedback",
      Intermediate message catch event "Revised requisition received",
      User task "Review revised requisition"
    - branch "Yes — requisition valid": continue to draft job advertisement
  Exclusive merge gateway "Requisition complete"
  User task "Draft job advertisement and posting details"
  User task "Set vacancy parameters (salary band, location, close date)"
  Exclusive gateway "Approval required?"
    - branch "Yes — requires hiring manager sign-off": Send task
      "Send advertisement draft to hiring manager for approval"
      Intermediate message catch event "Hiring manager approval received"
      Exclusive gateway "Advertisement approved?"
        - branch "Not approved — amendments needed": Expanded Subprocess
          "Repeat Until Advertisement Approved" (standard loop) containing,
          in order:
          User task "Revise advertisement per feedback",
          Send task "Resubmit revised advertisement to hiring manager",
          Intermediate message catch event "Hiring manager response received",
          User task "Check hiring manager decision"
        - branch "Approved": continue to publish
      Exclusive merge gateway "Advertisement approved"
    - branch "No — auto-approved": continue to publish
  Exclusive merge gateway "Approval required"
  Service task "Create vacancy record in ATS"
  User task "Publish vacancy"
  End event "Vacancy published — ready for Attract Candidates (V04.03)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Requisition Complete", labelled "Requisition overdue (5 business days)",
leading to End event "Requisition timed out — escalate to HR business
partner".
Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Advertisement Approved", labelled "Approval overdue (3 business days)",
leading to End event "Approval timed out — escalate to HR business
partner".

6. Connectors

Sequence flows: work begins in the Hiring Manager / People Manager lane
with the start event, passes to Recruitment after requisition submission,
loops within Recruitment until the requisition is complete (merging at
"Requisition complete"), then proceeds through drafting and the approval
gateway; the "Yes" approval branch loops until the advertisement is
approved (merging at "Advertisement approved") and the "No" branch
bypasses that loop, both rejoining at "Approval required" before the ATS
service task, the publish task, and the end event.

Message flows:
Employing Organisation (Send task "Submit requisition for HR / Recruitment
review") → Employing Organisation Recruitment lane (Intermediate message
catch event "Requisition received") (job requisition document).
Employing Organisation (Send task "Return requisition with feedback") →
Employing Organisation Hiring Manager / People Manager lane (implied
revision loop feedback).
Employing Organisation (Send task "Send advertisement draft to hiring
manager for approval") → Employing Organisation Hiring Manager / People
Manager lane (advertisement draft for approval).
Employing Organisation Hiring Manager / People Manager lane → Employing
Organisation Recruitment lane (Intermediate message catch event "Hiring
manager approval received") (approval decision).
Employing Organisation (Service task "Create vacancy record in ATS") →
Applicant Tracking System (vacancy record creation request).
Applicant Tracking System → Employing Organisation (Service task "Create
vacancy record in ATS") (vacancy ID and confirmation).

7. Data objects

Data Object "Job Requisition" — written by User task "Raise job
requisition"; read by User task "Review and validate requisition".
Data Object "Role Requirements and Selection Criteria" — written by User
task "Define role requirements and selection criteria"; read by User task
"Draft job advertisement and posting details".
Data Object "Job Advertisement" — written by User task "Draft job
advertisement and posting details"; read by Send task "Send advertisement
draft to hiring manager for approval"; updated by User task "Revise
advertisement per feedback".
Data Object "Vacancy Parameters" — written by User task "Set vacancy
parameters (salary band, location, close date)"; read by Service task
"Create vacancy record in ATS".
Data Store "Applicant Tracking System Vacancy Register" — written by
Service task "Create vacancy record in ATS".

V04.02 Create Vacancy transforms an approved headcount need into a fully
validated and published vacancy record. The hiring manager raises the
requisition, Recruitment refines and gains approval for the job
advertisement, and the vacancy is opened in the Applicant Tracking System.
The published vacancy and its ATS record are then handed to V04.03 Attract
Candidates, which uses them to source and receive applications.
```

### V04.03 — Attract Candidates

**BPMN diagram prompt.**

```text
BPMN: V04.03 Attract Candidates — third subprocess in the Hire to
Retire value chain, receiving an approved vacancy from Create Vacancy
(V04.02) and delivering a pool of registered applicants to Assess and
Interview Candidates (V04.04).

1. Pools & Lanes

Pool "Employing Organisation" — the organisation running the attraction
  process, containing the Recruitment team.
  Lanes top to bottom:
  - Recruiter lane

Pool "Applicant / Candidate" — external individuals who discover and
  respond to the job advertisement.

Pool "Recruitment Agency" — external agency optionally sourcing and
  submitting candidates on behalf of the organisation.

Pool "Applicant Tracking System" — the ATS that stores vacancy and
  candidate data and routes applications.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Applicant / Candidate" — black-box, single instance.
Pool "Recruitment Agency" — black-box, single instance.
Pool "Applicant Tracking System" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Applicant / Candidate
2. Recruitment Agency
3. Employing Organisation
4. Applicant Tracking System

4. Lane contents in flow order (Employing Organisation)

Recruiter lane:
  Message start event "Approved vacancy received from Create Vacancy
    (V04.02)"
  Service task "Publish vacancy in Applicant Tracking System"
  Parallel gateway "Advertise across channels" (split)
  - branch "Direct channels": Send task "Post advertisement on careers
      site and job boards"
  - branch "Agency channel": Send task "Send vacancy brief to
      Recruitment Agency"
  Parallel merge gateway "Advertise across channels"
  Intermediate timer catch event "Application window open (closing
    date reached)"
  Service task "Retrieve submitted applications from Applicant
    Tracking System"
  Exclusive gateway "Applications received?"
  - branch "No applications": Send task "Extend or re-advertise
      vacancy"
    Intermediate timer catch event "Extended application window
      closed"
    Service task "Retrieve submitted applications from Applicant
      Tracking System"
    Exclusive merge gateway "Applications received?"
  - branch "Applications received": (continue to next step)
  Exclusive merge gateway "Applications received?"
  Expanded Subprocess "Repeat Until All Applications Screened"
    (standard loop) containing, in order: User task "Review
    application against vacancy criteria", Exclusive gateway
    "Application meets minimum criteria?",
    - branch "Yes": User task "Mark application as shortlisted in
        Applicant Tracking System",
    - branch "No": User task "Record application as unsuccessful in
        Applicant Tracking System"
  User task "Compile shortlist and notify hiring manager"
  End event "Shortlisted candidates confirmed — ready for Assess
    and Interview Candidates (V04.04)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Send task "Extend or re-advertise
  vacancy" — label "Maximum re-advertisement period elapsed" — leads to
  End event "Vacancy withdrawn — no suitable applications received"
  (terminates without proceeding to V04.04).

6. Connectors

Sequence flows: work begins in the Recruiter lane at the message start
  event, proceeds to publish the vacancy, then splits at the parallel
  gateway into the direct-channels branch and the agency branch,
  both rejoining at the parallel merge gateway. A timer catch event
  marks the close of the application window before applications are
  retrieved. An exclusive gateway tests whether applications were
  received; the "No" branch loops through re-advertisement and a
  second timer before rejoining the merge gateway; the "Yes" branch
  continues to the screening subprocess. After screening, the recruiter
  compiles the shortlist and the process ends.

Message flows:
  Employing Organisation (Send task "Post advertisement on careers
    site and job boards") → Applicant / Candidate (job advertisement
    published on careers site and job boards)
  Applicant / Candidate → Applicant Tracking System (application
    submission including resume, employment history, and availability)
  Employing Organisation (Send task "Send vacancy brief to Recruitment
    Agency") → Recruitment Agency (vacancy brief)
  Recruitment Agency → Applicant Tracking System (candidate profiles
    and applications submitted on behalf of candidates)
  Applicant Tracking System → Employing Organisation (Service task
    "Retrieve submitted applications from Applicant Tracking System")
    (submitted application records)
  Employing Organisation (Service task "Publish vacancy in Applicant
    Tracking System") → Applicant Tracking System (vacancy record
    created)
  Employing Organisation (User task "Mark application as shortlisted
    in Applicant Tracking System") → Applicant Tracking System
    (shortlist status update)
  Employing Organisation (User task "Record application as unsuccessful
    in Applicant Tracking System") → Applicant Tracking System
    (unsuccessful status update)

7. Data objects

Data Object "Vacancy Brief" — read by Send task "Send vacancy brief
  to Recruitment Agency"; read by Service task "Publish vacancy in
  Applicant Tracking System".
Data Object "Job Advertisement" — written by Send task "Post
  advertisement on careers site and job boards".
Data Object "Candidate Application" — written by Service task
  "Retrieve submitted applications from Applicant Tracking System";
  read by User task "Review application against vacancy criteria".
Data Object "Shortlist" — written by User task "Compile shortlist
  and notify hiring manager".

V04.03 Attract Candidates opens the approved vacancy to the labour
market by publishing advertisements through direct channels and,
optionally, a recruitment agency, then holds the process open until
the application window closes. All received applications are screened
against the vacancy criteria inside a repeating loop, and those that
meet the minimum standard are marked as shortlisted in the Applicant
Tracking System. The confirmed shortlist is handed to Assess and
Interview Candidates (V04.04) for evaluation.
```

### V04.04 — Assess and Interview Candidates

**BPMN diagram prompt.**

```text
BPMN: V04.04 Assess and Interview Candidates — the fourth subprocess in the
Hire to Retire value chain, receiving shortlisted candidates from Attract
Candidates (V04.03) and handing a ranked outcome to Make Offer (V04.05).

1. Pools & Lanes

Pool "Employing Organisation" — the organisation running the assessment and
interview process, containing Recruitment and Hiring Manager / People
Manager lanes.
Pool "Applicant / Candidate" — external individual being assessed and
interviewed.
Pool "Referee" — external individual providing a reference for the candidate.
Pool "Applicant Tracking System" — IT system recording candidate
assessments, interview scheduling, and outcomes.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Applicant / Candidate" — black-box, single instance.
Pool "Referee" — black-box, single instance.
Pool "Applicant Tracking System" — black-box, System = true, single
instance.

3. Layout

Top to bottom:
1. Applicant / Candidate
2. Employing Organisation
3. Referee
4. Applicant Tracking System

4. Lane contents in flow order (Employing Organisation)

Recruitment lane:
  Message start event "Shortlisted candidate list received from Attract
    Candidates (V04.03)"
  Service task "Retrieve candidate applications from ATS"
  User task "Review shortlisted applications and confirm assessment
    approach"
  User task "Design assessment and interview plan"
  Service task "Record assessment plan in ATS"
  User task "Schedule assessments and interviews"
  Send task "Send assessment instructions and interview invitation to
    candidate"
  Intermediate message catch event "Candidate confirms availability"
  Service task "Update interview schedule in ATS"
  Exclusive gateway "Assessment type required?"
    - branch "Written / online assessment": User task "Administer online
      or written assessment"; Intermediate message catch event "Assessment
      response received from candidate"; User task "Score and record
      assessment results"
    - branch "Skills test": User task "Conduct skills test"; User task
      "Score and record test results"
    - branch "Interview only": (no assessment task — continue to merge)
  Exclusive merge gateway "Assessment type required"
  Send task "Send interview confirmation and logistics to candidate"

Hiring Manager / People Manager lane:
  User task "Conduct panel or structured interview"
  User task "Complete interview evaluation and scoring"
  Exclusive gateway "Reference check required?"
    - branch "Yes": Send task "Request reference from referee"; Intermediate
      message catch event "Reference received from referee"; User task
      "Review reference and record outcome"
    - branch "No": (continue to merge)
  Exclusive merge gateway "Reference check required"
  User task "Consolidate assessment scores and interview evaluations"
  Exclusive gateway "Candidate suitable to proceed?"
    - branch "Yes": Service task "Record candidate outcome as progressed
      in ATS"; End event "Assessed candidate outcome confirmed — ready
      for Make Offer (V04.05)"
    - branch "No": User task "Prepare candidate rejection rationale";
      Service task "Record candidate outcome as unsuccessful in ATS";
      Send task "Send outcome notification to candidate"; End event
      "Candidate unsuccessful — process ends for this candidate"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on User task "Conduct panel or
structured interview", labelled "Interview overrun — 30 minutes", leading
to Send task "Notify participants of extended interview duration".
Interrupting timer boundary event on Intermediate message catch event
"Candidate confirms availability", labelled "No response after 3 business
days", leading to User task "Chase candidate or withdraw from shortlist",
then End event "Candidate withdrew or non-responsive — process ends".

6. Connectors

Sequence flows: The flow begins in the Recruitment lane with receipt of the
shortlisted candidate list, proceeds through application review, assessment
planning, scheduling, and invitation tasks, then diverges at the "Assessment
type required" gateway into three branches — written/online assessment,
skills test, or interview only — each rejoining at the "Assessment type
required" merge gateway before the interview confirmation send task. Flow
crosses into the Hiring Manager / People Manager lane for the interview,
evaluation, and the "Reference check required" gateway, whose Yes branch
sends a reference request and awaits the reply before rejoining the merge
gateway; the No branch passes straight through. Both branches converge,
scores are consolidated, and the "Candidate suitable to proceed" gateway
routes to one of two end events.

Message flows:
Employing Organisation (Recruitment) → Applicant / Candidate (Send task
  "Send assessment instructions and interview invitation to candidate") —
  assessment instructions and interview invitation.
Applicant / Candidate → Employing Organisation (Recruitment) (Intermediate
  message catch event "Candidate confirms availability") — availability
  confirmation.
Applicant / Candidate → Employing Organisation (Recruitment) (Intermediate
  message catch event "Assessment response received from candidate") —
  completed assessment response.
Employing Organisation (Recruitment) → Applicant Tracking System (Service
  task "Record assessment plan in ATS") — assessment plan data.
Employing Organisation (Recruitment) → Applicant Tracking System (Service
  task "Update interview schedule in ATS") — updated interview schedule.
Employing Organisation (Recruitment) → Applicant Tracking System (Service
  task "Retrieve candidate applications from ATS") — candidate application
  records retrieved.
Employing Organisation (Hiring Manager / People Manager) → Referee (Send
  task "Request reference from referee") — reference request.
Referee → Employing Organisation (Hiring Manager / People Manager)
  (Intermediate message catch event "Reference received from referee") —
  reference response.
Employing Organisation (Hiring Manager / People Manager) → Applicant
  Tracking System (Service task "Record candidate outcome as progressed
  in ATS") — candidate progressed status.
Employing Organisation (Hiring Manager / People Manager) → Applicant
  Tracking System (Service task "Record candidate outcome as unsuccessful
  in ATS") — candidate unsuccessful status.
Employing Organisation (Hiring Manager / People Manager) → Applicant /
  Candidate (Send task "Send outcome notification to candidate") —
  rejection notification.

7. Data objects

Data Object "Shortlisted Candidate List" — read by Service task "Retrieve
  candidate applications from ATS".
Data Object "Assessment and Interview Plan" — written by User task "Design
  assessment and interview plan"; read by User task "Schedule assessments
  and interviews".
Data Object "Interview Schedule" — written by Service task "Update interview
  schedule in ATS"; read by User task "Conduct panel or structured
  interview".
Data Object "Assessment Response" — read by User task "Score and record
  assessment results"; read by User task "Score and record test results".
Data Object "Interview Evaluation and Scoring Form" — written by User task
  "Complete interview evaluation and scoring"; read by User task
  "Consolidate assessment scores and interview evaluations".
Data Object "Reference Response" — read by User task "Review reference and
  record outcome".
Data Object "Candidate Rejection Rationale" — written by User task "Prepare
  candidate rejection rationale".
Data Store "Applicant Tracking System Record" — written by Service task
  "Record assessment plan in ATS"; written by Service task "Update interview
  schedule in ATS"; written by Service task "Record candidate outcome as
  progressed in ATS"; written by Service task "Record candidate outcome as
  unsuccessful in ATS".

V04.04 Assess and Interview Candidates takes shortlisted applicants from the
Attract Candidates subprocess and subjects them to a structured sequence of
assessments, interviews, and optionally reference checks. Recruitment coordinates
scheduling and administers any written or skills assessments, while the Hiring
Manager conducts structured interviews, scores candidates, and consolidates
results. Candidates who are found suitable are marked as progressed in the
Applicant Tracking System and passed to Make Offer (V04.05); those who do not
meet the bar receive a rejection notification and the process ends for them.
```

### V04.05 — Make Offer

**BPMN diagram prompt.**

```text
BPMN: V04.05 Make Offer — sits between Assess and Interview Candidates
(V04.04) and Onboard Employee (V04.06) in the Hire to Retire value chain.

1. Pools & Lanes

Pool "Employing Organisation" — the organisation making the offer, containing
all internal teams as lanes.
  Lane "Recruitment" — recruiter who coordinates the offer process.
  Lane "Human Resources" — HR business partner who approves terms and
    prepares the contract.
  Lane "Legal" — employment lawyer who reviews the contract.
Pool "Applicant / Candidate" — the individual receiving and responding to
  the offer.
Pool "Background Check Provider" — third-party provider conducting pre-
  employment screening.
Pool "HRIS / HCM System" — system of record for employee master data and
  contract storage.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Applicant / Candidate" — black-box, single instance.
Pool "Background Check Provider" — black-box, single instance.
Pool "HRIS / HCM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Applicant / Candidate
2. Employing Organisation
3. Background Check Provider
4. HRIS / HCM System

4. Lane contents in flow order (Employing Organisation)

Recruitment lane:
  Message start event "Preferred candidate confirmed from Assess and
    Interview Candidates (V04.04)"
  User task "Confirm verbal offer intent with hiring manager"
  Send task "Request background check"
  Intermediate message catch event "Background check results received"
  Exclusive gateway "Background check passed?"
  - branch "No — disqualifying result": End event "Offer withdrawn —
    candidate notified"
  - branch "Yes — clear to proceed": User task "Prepare offer package"
  Exclusive merge gateway "Background check passed"
  User task "Extend verbal offer to candidate"
  Send task "Send written offer letter to candidate"
  Intermediate message catch event "Candidate responds to offer"
  Exclusive gateway "Offer accepted?"
  - branch "Declined": User task "Record decline and close requisition"
    End event "Offer declined — vacancy returned to Attract Candidates
    (V04.03)"
  - branch "Negotiation requested": Expanded Subprocess "Repeat Until
    Offer Agreed" (standard loop) containing, in order: User task
    "Receive candidate counteroffer or query", User task "Consult HR
    business partner on revised terms", User task "Communicate revised
    offer to candidate", Intermediate message catch event "Candidate
    responds to revised offer"
  - branch "Accepted": (continue to merge)
  Exclusive merge gateway "Offer accepted"
  User task "Notify candidate of next steps and onboarding instructions"

Human Resources lane:
  User task "Review and approve offer terms against remuneration policy"
  User task "Draft employment contract"
  Send task "Route contract to Legal for review"
  Intermediate message catch event "Reviewed contract received from Legal"
  User task "Finalise contract and obtain authorised signature"
  Send task "Send signed contract to candidate"
  Service task "Create employee master record in HRIS / HCM System"
  User task "Record accepted offer and close requisition"

Legal lane:
  Intermediate message catch event "Contract received for review"
  User task "Review employment contract for compliance"
  Send task "Return reviewed contract to Human Resources"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Offer Agreed", labelled "Negotiation deadline exceeded (5 business
  days)" — triggers End event "Offer withdrawn — negotiation timed out".
Interrupting timer boundary event on Intermediate message catch event
  "Candidate responds to offer", labelled "Offer response deadline
  exceeded (3 business days)" — triggers User task "Follow up with
  candidate on outstanding offer".

6. Connectors

Sequence flows: Flow begins in the Recruitment lane with the message start
event and moves through background check coordination and offer extension.
The "Background check passed?" gateway branches to an immediate End event
on failure or continues to offer preparation on success, rejoining at the
"Background check passed" merge gateway. After the written offer is sent,
an intermediate message catch event pauses flow until the candidate
responds; the "Offer accepted?" gateway then branches to decline (ending),
negotiation (looping subprocess), or acceptance, all rejoining at the
"Offer accepted" merge gateway. In parallel, the Human Resources lane
handles remuneration approval, contract drafting, Legal review, contract
finalisation, and HRIS / HCM System record creation, with Legal review
coordinated via message catch events in the Legal lane. Both streams
conclude before the final notify-candidate task.

Message flows:
Recruitment lane "Request background check" → Background Check Provider
  (background check request).
Background Check Provider → Recruitment lane "Background check results
  received" (screening results report).
Recruitment lane "Send written offer letter to candidate" → Applicant /
  Candidate (written offer letter).
Applicant / Candidate → Recruitment lane "Candidate responds to offer"
  (offer acceptance, decline, or counteroffer).
Applicant / Candidate → Recruitment lane "Candidate responds to revised
  offer" (response to revised offer).
Human Resources lane "Route contract to Legal for review" → Legal lane
  "Contract received for review" (draft employment contract).
Legal lane "Return reviewed contract to Human Resources" → Human Resources
  lane "Reviewed contract received from Legal" (reviewed contract with
  annotations).
Human Resources lane "Send signed contract to candidate" → Applicant /
  Candidate (signed employment contract).
Human Resources lane "Create employee master record in HRIS / HCM System"
  → HRIS / HCM System (new employee master record and contract data).
HRIS / HCM System → Human Resources lane "Record accepted offer and close
  requisition" (confirmation of record creation).

7. Data objects

Data Object "Background Check Request" — written by "Request background
  check"; read by Background Check Provider.
Data Object "Background Check Results" — read by "Background check passed?"
  gateway; written by Background Check Provider.
Data Object "Offer Letter" — written by "Prepare offer package"; read by
  "Send written offer letter to candidate".
Data Object "Employment Contract" — written by "Draft employment contract";
  read by "Review employment contract for compliance"; read by "Finalise
  contract and obtain authorised signature"; read by "Send signed contract
  to candidate".
Data Object "Candidate Response" — written by Applicant / Candidate;
  read by "Offer accepted?" gateway.
Data Store "HRIS / HCM System" — written by "Create employee master record
  in HRIS / HCM System"; read by "Record accepted offer and close
  requisition".

Make Offer takes a confirmed preferred candidate through background
screening, remuneration approval, legal review, and contract execution,
resulting in a signed employment contract and an accepted offer. A new
employee master record is created in the HRIS / HCM System and the closed
requisition is handed to Onboard Employee (V04.06), where the candidate's
transition to active employment begins.
```

### V04.06 — Onboard Employee

**BPMN diagram prompt.**

```text
BPMN: V04.06 Onboard Employee — the subprocess that transitions a
newly hired individual into an active employee within the Hire to
Retire value chain, following Make Offer (V04.05) and preceding
Provision Access / Equipment (V04.07).

1. Pools & Lanes

Pool "Employing Organisation" — the organisation running the
onboarding process, containing Human Resources and Payroll lanes.
Pool "Employee" — the new hire completing onboarding steps.
Pool "Superannuation / Pension Fund" — external fund receiving
enrolment instructions.
Pool "Benefits Provider" — external provider receiving benefits
enrolment instructions.
Pool "HRIS / HCM System" — the HR information system that stores
and manages employee master data, contracts, and benefits records.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Employee" — black-box, single instance.
Pool "Superannuation / Pension Fund" — black-box, single instance.
Pool "Benefits Provider" — black-box, single instance.
Pool "HRIS / HCM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation
3. Superannuation / Pension Fund
4. Benefits Provider
5. HRIS / HCM System

4. Lane contents in flow order (Employing Organisation)

Human Resources lane:
  Message start event "Accepted offer received from Make Offer
  (V04.05)"
  User task "Prepare onboarding pack and welcome communication"
  Send task "Send onboarding instructions and document checklist
  to employee"
  Intermediate message catch event "Completed onboarding documents
  received from employee"
  User task "Verify identity documents and right-to-work evidence"
  Exclusive gateway "Documents acceptable?"
    - branch "No — documents incomplete or invalid": User task
      "Notify employee of outstanding requirements"
      Expanded Subprocess "Repeat Until Documents Complete"
      (standard loop) containing, in order: Send task "Re-send
      document checklist to employee", Intermediate message catch
      event "Revised documents received from employee", User task
      "Re-verify documents"
      Timer boundary event on subprocess "5 business days" —
      interrupting; if triggered, escalate to employee relations
      adviser and raise an error end event "Onboarding stalled —
      documents not received"
    - branch "Yes — documents verified": continue to exclusive
      merge gateway "Documents acceptable"
  Exclusive merge gateway "Documents acceptable"
  User task "Create employee master record in HRIS / HCM System"
  Service task "Trigger contract generation in HRIS / HCM System"
  Send task "Issue signed employment contract to employee"
  Intermediate message catch event "Signed contract returned by
  employee"
  User task "File executed contract in HRIS / HCM System"
  User task "Brief employee on policies, induction schedule, and
  workplace conduct requirements"
  User task "Enrol employee in superannuation / pension fund"
  User task "Enrol employee in benefits schemes"
  End event "Employee onboarded — ready for Provision Access /
  Equipment (V04.07)"

Payroll lane:
  User task "Capture tax file details and banking information"
  User task "Set up employee payroll record in HRIS / HCM System"
  User task "Confirm pay schedule and first payment date to
  employee"

5. Edge-mounted (boundary) events

Interrupting timer boundary event "5 business days" — mounted on
the expanded subprocess "Repeat Until Documents Complete" in the
Human Resources lane; if the document deadline elapses before
verified documents are received, the subprocess is cancelled and
flow moves to an error end event "Onboarding stalled — documents
not received".

6. Connectors

Sequence flows: Flow begins in the Human Resources lane with the
message start event, proceeds through pack preparation and
document collection, through the "Documents acceptable?" gateway
with the incomplete branch entering the standard-loop subprocess
before rejoining at the exclusive merge gateway "Documents
acceptable", then continues through master record creation,
contract issuance, policy briefing, and superannuation and
benefits enrolment, ending at the end event. The Payroll lane
tasks — capturing tax and banking details, setting up the payroll
record, and confirming pay schedule — run in parallel with the
Human Resources contract and enrolment steps after document
verification, rejoining the main flow before the end event.

Message flows:
Human Resources lane "Send onboarding instructions and document
checklist to employee" → Employee (onboarding pack and document
checklist).
Employee → Human Resources lane "Intermediate message catch event
Completed onboarding documents received from employee" (completed
documents and identity evidence).
Human Resources lane "Send task Re-send document checklist to
employee" → Employee (revised document request).
Employee → Human Resources lane "Intermediate message catch event
Revised documents received from employee" (resubmitted documents).
Human Resources lane "Issue signed employment contract to
employee" → Employee (employment contract for signature).
Employee → Human Resources lane "Intermediate message catch event
Signed contract returned by employee" (executed contract).
Payroll lane "Confirm pay schedule and first payment date to
employee" → Employee (pay schedule confirmation).
Human Resources lane "Enrol employee in superannuation / pension
fund" → Superannuation / Pension Fund (enrolment instruction and
employee details).
Human Resources lane "Enrol employee in benefits schemes" →
Benefits Provider (benefits enrolment instruction and employee
details).
Human Resources lane "Create employee master record in HRIS / HCM
System" → HRIS / HCM System (new employee master data).
Human Resources lane "Service task Trigger contract generation in
HRIS / HCM System" → HRIS / HCM System (contract generation
request).
Human Resources lane "File executed contract in HRIS / HCM
System" → HRIS / HCM System (signed contract document).
Payroll lane "Set up employee payroll record in HRIS / HCM
System" → HRIS / HCM System (payroll record and tax details).

7. Data objects

Data Object "Onboarding Pack" — written by "Prepare onboarding
pack and welcome communication"; read by "Send onboarding
instructions and document checklist to employee".
Data Object "Identity and Right-to-Work Documents" — read by
"Verify identity documents and right-to-work evidence"; read by
"Re-verify documents".
Data Object "Employment Contract" — written by "Service task
Trigger contract generation in HRIS / HCM System"; read by "Issue
signed employment contract to employee"; read by "File executed
contract in HRIS / HCM System".
Data Object "Superannuation / Pension Enrolment Form" — written by
"Enrol employee in superannuation / pension fund".
Data Object "Benefits Enrolment Form" — written by "Enrol employee
in benefits schemes".
Data Object "Tax and Banking Details" — written by "Capture tax
file details and banking information"; read by "Set up employee
payroll record in HRIS / HCM System".
Data Store "HRIS / HCM Employee Master Record" — written by
"Create employee master record in HRIS / HCM System"; written by
"Set up employee payroll record in HRIS / HCM System"; written by
"File executed contract in HRIS / HCM System".

V04.06 Onboard Employee transforms an accepted offer into a fully
registered, contracted, and briefed new employee. Human Resources
coordinates document verification, master record creation, contract
execution, policy induction, and external fund and benefits
enrolment, while Payroll captures tax and banking details and
establishes the payroll record. On completion, the employee record
is live in the HRIS / HCM System and the subprocess hands a
confirmed, pay-ready employee to Provision Access / Equipment
(V04.07).
```

### V04.07 — Provision Access / Equipment

**BPMN diagram prompt.**

```text
BPMN: V04.07 Provision Access / Equipment — the subprocess that sets up
system access and physical equipment for a newly onboarded employee,
sitting between Onboard Employee (V04.06) and Manage Payroll and
Benefits (V04.08) in the Hire to Retire value chain.

1. Pools & Lanes

Pool "Employing Organisation" — the organisation executing the
provisioning process, containing IT and Facilities lanes.
  Lane "IT" — IT provisioning officer responsible for access setup.
  Lane "Facilities" — facilities officer responsible for physical
  equipment and workspace.
Pool "Employee" — the newly onboarded employee receiving access
and equipment.
Pool "Identity & Access Management (IAM) System" — the system that
creates and records user accounts and access rights.

2. Pool properties

Pool "Employing Organisation": white-box, single instance.
Pool "Employee": black-box, single instance.
Pool "Identity & Access Management (IAM) System": black-box,
System = true, single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation (IT lane above Facilities lane)
3. Identity & Access Management (IAM) System

4. Lane contents in flow order (Employing Organisation)

IT lane:
  Message start event "Onboarded employee record received from
  V04.06"
  User task "Review provisioning requirements"
  Service task "Create user account and access profile"
  Send task "Submit access request to IAM System"
  Intermediate message catch event "Account creation confirmed"
  User task "Assign system roles and permissions"
  Service task "Record access details in IAM System"
  Exclusive gateway "All system access provisioned?"
    - branch "No — access gaps identified":
        Expanded Subprocess "Repeat Until All Access Provisioned"
        (standard loop) containing, in order: User task "Identify
        missing access entitlements", Service task "Resubmit access
        request to IAM System", Intermediate message catch event
        "Access update confirmed"
    - branch "Yes":
        Exclusive merge gateway "All system access provisioned"
  Send task "Send access credentials to Employee"
  Parallel gateway "Provisioning streams" (split)
    - branch "IT stream": continues to Send task above (IT
      provisioning complete, proceed to join)
    - branch "Facilities stream": passes to Facilities lane
  Parallel merge gateway "Provisioning streams" (join)
  End event "Access and equipment provisioned — ready for Manage
  Payroll and Benefits (V04.08)"

Facilities lane:
  User task "Identify equipment and workspace requirements"
  Service task "Allocate equipment and workspace"
  Exclusive gateway "Equipment available?"
    - branch "No — equipment on order":
        Expanded Subprocess "Repeat Until Equipment Available"
        (standard loop) containing, in order: User task "Follow up
        equipment order", Intermediate timer catch event "Wait
        period elapsed"
    - branch "Yes":
        Exclusive merge gateway "Equipment available"
  User task "Prepare and label equipment for employee"
  Send task "Notify Employee of equipment collection or delivery"
  Intermediate message catch event "Employee receipt confirmed"
  User task "Record equipment allocation"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat
Until All Access Provisioned" — label "48-hour escalation deadline"
— on expiry, flow continues to User task "Escalate access
provisioning delay to IT manager".
Interrupting timer boundary event on Expanded Subprocess "Repeat
Until Equipment Available" — label "5-day escalation deadline" —
on expiry, flow continues to User task "Escalate equipment delay
to Facilities manager".

6. Connectors

Sequence flows: within the IT lane, flow runs from the message
start event through requirements review, account creation, IAM
submission, confirmation catch, role assignment, and access
recording to the "All system access provisioned?" gateway; the
"No" branch enters the access loop subprocess and rejoins at the
exclusive merge gateway; the "Yes" branch also rejoins there;
flow then reaches the parallel split, with the IT stream
proceeding directly to the parallel join and the Facilities stream
passing control to the Facilities lane; within the Facilities
lane, flow runs from requirements identification through
allocation, the availability gateway (loop subprocess on the "No"
branch, merge on "Yes"), equipment preparation, employee
notification, receipt confirmation, and allocation recording,
then returns to the parallel join in the IT lane; the parallel
join feeds the end event.

Message flows:
Employing Organisation (IT lane, "Submit access request to IAM
System") → Identity & Access Management (IAM) System (access
provisioning request).
Identity & Access Management (IAM) System → Employing Organisation
(IT lane, "Account creation confirmed") (account creation
confirmation).
Employing Organisation (IT lane, "Record access details in IAM
System") → Identity & Access Management (IAM) System (role and
permission record update).
Employing Organisation (IT lane, "Send access credentials to
Employee") → Employee (access credentials and login instructions).
Employing Organisation (Facilities lane, "Notify Employee of
equipment collection or delivery") → Employee (equipment
readiness notification).
Employee → Employing Organisation (Facilities lane, "Employee
receipt confirmed") (equipment receipt acknowledgement).

7. Data objects

Data Object "Provisioning Requirements" — written by User task
"Review provisioning requirements"; read by Service task "Create
user account and access profile".
Data Object "Access Request" — written by Service task "Create
user account and access profile"; read by Send task "Submit
access request to IAM System".
Data Store "IAM System Access Record" — written by Service task
"Record access details in IAM System".
Data Object "Access Credentials" — written by Service task
"Record access details in IAM System"; read by Send task "Send
access credentials to Employee".
Data Object "Equipment Allocation Record" — written by User task
"Record equipment allocation"; read by User task "Prepare and
label equipment for employee".

V04.07 Provision Access / Equipment takes the confirmed onboarded
employee record from V04.06 and coordinates the IT provisioning
officer and facilities officer to create system accounts, assign
access rights, allocate physical equipment, and confirm receipt by
the employee. Once all access credentials have been issued and
equipment acknowledged, the subprocess closes with a fully
provisioned employee record, handing the process forward to
Manage Payroll and Benefits (V04.08).
```

### V04.08 — Manage Payroll and Benefits

**BPMN diagram prompt.**

```text
BPMN: V04.08 Manage Payroll and Benefits — recurring subprocess within the
Hire to Retire value chain that calculates and disburses employee pay, manages
benefit enrolments, and remits contributions to external funds and providers.

1. Pools & Lanes

Pool "Employing Organisation" — the organisation running payroll and benefits
  administration, containing Payroll and Finance lanes.
Pool "Employee" — the worker receiving pay and benefits.
Pool "Superannuation / Pension Fund" — external fund receiving employer and
  employee retirement contributions.
Pool "Benefits Provider" — external provider administering health, insurance,
  or other employee benefits.
Pool "Payroll System" — IT system that performs pay calculations, deductions,
  and payslip generation.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Employee" — black-box, single instance.
Pool "Superannuation / Pension Fund" — black-box, single instance.
Pool "Benefits Provider" — black-box, single instance.
Pool "Payroll System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation
3. Superannuation / Pension Fund
4. Benefits Provider
5. Payroll System

4. Lane contents in flow order (Employing Organisation)

Payroll lane:
  Timer start event "Payroll period opens (scheduled cycle)"
  User task "Collect and verify payroll inputs"
  Exclusive gateway "Inputs complete and accurate?"
  - branch "No": Expanded Subprocess "Repeat Until Inputs Complete" (standard
    loop) containing, in order: User task "Request missing or corrected data
    from employee or manager", Intermediate message catch event "Correction
    received"
  - branch "Yes": continue to Exclusive merge gateway "Inputs complete"
  Exclusive merge gateway "Inputs complete"
  Service task "Submit payroll run to Payroll System"
  Intermediate message catch event "Payroll calculation results received"
  User task "Review payroll calculation results"
  Exclusive gateway "Payroll approved?"
  - branch "No": User task "Raise payroll exception and correct inputs",
    then rejoin before Service task "Submit payroll run to Payroll System"
    via Exclusive merge gateway "Resubmit payroll"
  - branch "Yes": continue to Exclusive merge gateway "Resubmit payroll"
  Exclusive merge gateway "Resubmit payroll"
  User task "Authorise net pay disbursement"
  Send task "Instruct bank payment run"
  Service task "Record payroll journal entries in Payroll System"
  Send task "Transmit superannuation / pension contributions"
  Send task "Notify Benefits Provider of benefit deductions and enrolment
    changes"
  User task "Verify contribution and benefit payment confirmations"
  Exclusive gateway "All confirmations received?"
  - branch "No": User task "Follow up outstanding confirmations", then
    rejoin at Exclusive merge gateway "Confirmations resolved"
  - branch "Yes": continue to Exclusive merge gateway "Confirmations
    resolved"
  Exclusive merge gateway "Confirmations resolved"
  End event "Payroll cycle complete — employee paid and contributions
    remitted, ready for Manage Performance (V04.09)"

Finance lane:
  User task "Review payroll cost report against budget"
  Exclusive gateway "Within budget tolerance?"
  - branch "No": User task "Escalate variance to finance controller"
  - branch "Yes": continue to Exclusive merge gateway "Budget check done"
  Exclusive merge gateway "Budget check done"
  User task "Approve payroll cost for general ledger posting"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until Inputs
  Complete" — label "Input deadline exceeded (48 hours)" — triggers User task
  "Escalate missing inputs to HR business partner" in Payroll lane, then
  rejoins main flow at Exclusive merge gateway "Inputs complete".
Interrupting timer boundary event on User task "Verify contribution and
  benefit payment confirmations" — label "Confirmation overdue (5 business
  days)" — triggers User task "Escalate unconfirmed payments to payroll
  officer" in Payroll lane, then rejoins at Exclusive merge gateway
  "Confirmations resolved".

6. Connectors

Sequence flows: Flow begins in the Payroll lane at the timer start event,
  passes through input collection and the "Inputs complete and accurate?"
  gateway (looping via the expanded subprocess on the No branch and merging
  at "Inputs complete" on the Yes branch), proceeds to payroll submission and
  review, diverges at "Payroll approved?" (returning to resubmission on the
  No branch and merging at "Resubmit payroll"), advances through
  authorisation, disbursement, journal posting, and contribution transmission,
  then diverges at "All confirmations received?" (looping on the No branch
  and merging at "Confirmations resolved"), before the end event. The Finance
  lane receives the payroll cost report after journal entries are recorded,
  diverges at "Within budget tolerance?" (escalating on the No branch and
  merging at "Budget check done"), and completes with general ledger approval.

Message flows:
  Payroll lane "Submit payroll run to Payroll System" → Payroll System
    (payroll run data including gross pay, deductions, tax, and period dates).
  Payroll System → Payroll lane "Payroll calculation results received"
    (calculated net pay, deductions breakdown, and exception report).
  Payroll System → Payroll lane "Record payroll journal entries in Payroll
    System" (posted journal confirmation).
  Payroll lane "Instruct bank payment run" → Employee (net pay transfer /
    payslip notification).
  Payroll lane "Transmit superannuation / pension contributions" →
    Superannuation / Pension Fund (contribution schedule and payment).
  Superannuation / Pension Fund → Payroll lane "Verify contribution and
    benefit payment confirmations" (contribution receipt confirmation).
  Payroll lane "Notify Benefits Provider of benefit deductions and enrolment
    changes" → Benefits Provider (deduction amounts and enrolment updates).
  Benefits Provider → Payroll lane "Verify contribution and benefit payment
    confirmations" (benefit payment and enrolment confirmation).
  Employee → Payroll lane "Collect and verify payroll inputs" (timesheets,
    leave taken, expense claims, tax file details, and benefit elections).

7. Data objects

Data Object "Payroll Inputs Package" — written by User task "Collect and
  verify payroll inputs"; read by Service task "Submit payroll run to
  Payroll System".
Data Object "Payroll Calculation Results" — written by Intermediate message
  catch event "Payroll calculation results received"; read by User task
  "Review payroll calculation results".
Data Object "Payroll Exception Report" — written by User task "Raise payroll
  exception and correct inputs"; read by Service task "Submit payroll run to
  Payroll System".
Data Object "Net Pay Disbursement Instruction" — written by User task
  "Authorise net pay disbursement"; read by Send task "Instruct bank payment
  run".
Data Object "Contribution Schedule" — written by Send task "Transmit
  superannuation / pension contributions"; read by User task "Verify
  contribution and benefit payment confirmations".
Data Object "Benefit Deduction and Enrolment Notice" — written by Send task
  "Notify Benefits Provider of benefit deductions and enrolment changes";
  read by User task "Verify contribution and benefit payment confirmations".
Data Object "Payment and Contribution Confirmations" — written by User task
  "Verify contribution and benefit payment confirmations"; read by Exclusive
  gateway "All confirmations received?".
Data Store "Payroll System Records" — written by Service task "Record payroll
  journal entries in Payroll System"; read by User task "Review payroll cost
  report against budget".
Data Object "Payroll Cost Report" — written by Service task "Record payroll
  journal entries in Payroll System"; read by User task "Review payroll cost
  report against budget".

V04.08 Manage Payroll and Benefits collects, validates, and processes all pay
inputs each scheduled cycle, submits them to the Payroll System for calculation,
obtains Finance approval, authorises net pay disbursement, and remits
superannuation and benefit contributions to the relevant external parties. Once
all confirmations are received and the payroll cost is posted to the general
ledger, the subprocess hands a fully settled payroll record to the ongoing
employee lifecycle, with the next recurring process being Manage Performance
(V04.09).
```

### V04.09 — Manage Performance

**BPMN diagram prompt.**

```text
BPMN: V04.09 Manage Performance — subprocess within the Hire to Retire
value chain in which the organisation sets goals, conducts performance
reviews, manages underperformance, and records outcomes for each employee.

1. Pools & Lanes

Pool "Employing Organisation" — the internal teams that run the performance
management cycle.
  Lane "Hiring Manager / People Manager" — people manager who sets goals,
  holds review conversations, and escalates performance concerns.
  Lane "Human Resources" — HR business partner who supports the process,
  manages formal performance plans, and records outcomes.
Pool "Employee" — the employee whose performance is being managed.
Pool "Performance Management System" — IT system that stores goals,
review records, ratings, and performance improvement plans.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Employee" — black-box, single instance.
Pool "Performance Management System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation (Hiring Manager / People Manager lane above
   Human Resources lane)
3. Performance Management System

4. Lane contents in flow order (Employing Organisation)

Hiring Manager / People Manager lane:
  Message start event "Employee performance cycle initiated — ready for
  Manage Performance (V04.09)"
  User task "Set and agree performance goals with employee"
  Send task "Send agreed goals to employee for acknowledgement"
  Intermediate message catch event "Employee acknowledges goals"
  Intermediate timer catch event "Review period elapses"
  User task "Gather performance evidence and prepare review"
  User task "Conduct performance review conversation with employee"
  User task "Assign performance rating"
  Exclusive gateway "Rating outcome?"
  - branch "Meets expectations or above": Send task "Communicate
    positive outcome to employee"
    Exclusive merge gateway "Rating outcome"
  - branch "Below expectations": User task "Identify performance
    concerns and agree improvement actions"
    Send task "Notify HR of underperformance case"
    Exclusive merge gateway "Rating outcome"
  Exclusive gateway "Further review cycle required?"
  - branch "Yes — new cycle": End event "New performance cycle
    triggered — loop to next cycle (V04.09)"
  - branch "No — cycle complete": continue to Human Resources lane

Human Resources lane:
  Receive task "Receive performance rating and review record"
  Exclusive gateway "Formal performance improvement plan required?"
  - branch "Yes": User task "Initiate and manage performance
    improvement plan (PIP)"
    Intermediate timer catch event "PIP review period elapses"
    User task "Assess PIP outcome"
    Exclusive gateway "PIP outcome?"
    - branch "Improved — close PIP": Service task "Record PIP closure
      in Performance Management System"
      Exclusive merge gateway "PIP outcome"
    - branch "No improvement": User task "Escalate to formal
      disciplinary or termination process"
      Send task "Notify people manager of escalation decision"
      End event "Escalated to disciplinary action — feeds into
      Offboard / Retire Employee (V04.13)" (does not rejoin)
    Exclusive merge gateway "PIP outcome"
    Exclusive merge gateway "Formal performance improvement plan
    required"
  - branch "No — record outcome only": Service task "Record
    performance outcome in Performance Management System"
    Exclusive merge gateway "Formal performance improvement plan
    required"
  End event "Performance cycle complete — record confirmed in
  Performance Management System (V04.09)"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on user task "Initiate and manage
performance improvement plan (PIP)" — label "PIP deadline exceeded" —
triggers send task "Escalate overdue PIP to HR business partner for
urgent review".

6. Connectors

Sequence flows: flow begins in the Hiring Manager / People Manager lane
from the message start event through goal-setting, acknowledgement wait,
review period wait, review conversation, and rating tasks to the rating
outcome gateway; the "meets expectations" branch rejoins at the rating
outcome merge gateway and proceeds to the further review cycle gateway,
where the "no" branch continues into the Human Resources lane; the "below
expectations" branch notifies HR then rejoins at the same merge before
the further review cycle gateway; in the Human Resources lane the PIP
required gateway splits into the PIP branch (with its own PIP outcome
merge and possible escalation end event) and the record-only branch,
reuniting at the formal PIP required merge gateway before the final end
event.

Message flows:
Employee → Employing Organisation, Hiring Manager / People Manager lane
(employee acknowledges agreed goals)
Employing Organisation, Hiring Manager / People Manager lane → Employee
(agreed goals sent for acknowledgement)
Employing Organisation, Hiring Manager / People Manager lane → Employee
(positive performance outcome communicated)
Employing Organisation, Human Resources lane → Performance Management
System (performance outcome or PIP closure recorded)
Employing Organisation, Human Resources lane → Performance Management
System (PIP record created and updated)
Performance Management System → Employing Organisation, Human Resources
lane (review record and rating data retrieved)

7. Data objects

Data Object "Performance Goals" — written by user task "Set and agree
performance goals with employee"; read by user task "Gather performance
evidence and prepare review".
Data Object "Performance Review Record" — written by user task "Conduct
performance review conversation with employee"; read by receive task
"Receive performance rating and review record".
Data Object "Performance Rating" — written by user task "Assign
performance rating"; read by service task "Record performance outcome in
Performance Management System".
Data Object "Performance Improvement Plan" — written by user task
"Initiate and manage performance improvement plan (PIP)"; read by user
task "Assess PIP outcome".
Data Store "Performance Management System record" — written by service
task "Record performance outcome in Performance Management System" and
service task "Record PIP closure in Performance Management System"; read
by receive task "Receive performance rating and review record".

V04.09 Manage Performance takes an active employee through the full
performance cycle: goal-setting, a structured review conversation,
outcome rating, and, where needed, a formal improvement plan. Positive
outcomes are recorded and a new cycle may begin immediately. Where
performance does not improve after a PIP, the subprocess escalates and
hands control to V04.13 Offboard / Retire Employee; all other completed
cycles leave a confirmed performance record in the Performance Management
System for use in development and remuneration decisions.
```

### V04.10 — Develop Employee

**BPMN diagram prompt.**

```text
BPMN: V04.10 Develop Employee — subprocess within the Hire to Retire
value chain in which Learning & Development coordinates the identification,
delivery, and recording of employee learning and development activity.

1. Pools & Lanes

Pool "Employing Organisation" — the organisation running the development
process, containing Learning & Development lane.
Pool "Employee" — the employee who undertakes learning.
Pool "Training Provider" — external provider delivering training
programmes.
Pool "Learning Management System" — the LMS that records enrolments,
completions, and training histories.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Employee" — black-box, single instance.
Pool "Training Provider" — black-box, single instance.
Pool "Learning Management System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation
3. Training Provider
4. Learning Management System

4. Lane contents in flow order (Employing Organisation)

Learning & Development lane:
  Message start event "Development need received from Manage Performance
  (V04.09)"
  User task "Review development need and agree learning objectives"
  User task "Identify suitable learning programme or provider"
  Exclusive gateway "Internal or external programme?"
  - branch "Internal": Service task "Enrol employee in internal
    programme via LMS"
    Intermediate message catch event "Completion confirmed by LMS"
  - branch "External": Send task "Send enrolment request to Training
    Provider"
    Intermediate message catch event "Enrolment confirmed by Training
    Provider"
    Intermediate message catch event "Completion confirmation received
    from Training Provider"
  Exclusive merge gateway "Programme delivery complete"
  User task "Assess learning outcomes against objectives"
  Exclusive gateway "Objectives met?"
  - branch "Yes": Service task "Record completion and update training
    record in LMS"
    End event "Development activity complete — training record updated,
    ready for Manage Performance (V04.09) or Manage Changes (V04.11)"
  - branch "No": User task "Identify remedial or alternative learning
    action"
    Expanded Subprocess "Repeat Until Objectives Met" (standard loop)
    containing, in order: User task "Arrange follow-up learning
    activity", Send task "Notify employee of follow-up requirement",
    Intermediate message catch event "Follow-up completion confirmed"
    Service task "Record completion and update training record in LMS"
    End event "Development activity complete — training record updated,
    ready for Manage Performance (V04.09) or Manage Changes (V04.11)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Objectives Met", labelled "Maximum development period elapsed", leading
to User task "Escalate unresolved development need to HR business
partner" and then an End event "Development need escalated — no further
action in this subprocess".

6. Connectors

Sequence flows: work begins in the Learning & Development lane, moves
from reviewing the development need through provider identification to
the exclusive gateway splitting on programme type. The internal branch
flows through LMS enrolment and an LMS completion event; the external
branch flows through provider enrolment, provider confirmation, and
provider completion. Both branches rejoin at the exclusive merge gateway
"Programme delivery complete". Flow continues through outcome assessment
to the objectives gateway; the "Yes" branch goes to LMS recording and
ends; the "No" branch enters the standard-loop subprocess with a timer
boundary, then if resolved goes to LMS recording and ends, or if the
timer fires escalates and ends separately.

Message flows:
Learning & Development "Review development need and agree learning
objectives" → Employee (learning objectives communicated).
Employee → Learning & Development "Review development need and agree
learning objectives" (development need and preferences provided).
Learning & Development "Send enrolment request to Training Provider" →
Training Provider (enrolment request).
Training Provider → Learning & Development "Enrolment confirmed by
Training Provider" (enrolment confirmation).
Training Provider → Learning & Development "Completion confirmation
received from Training Provider" (completion certificate or record).
Learning & Development "Enrol employee in internal programme via LMS"
→ Learning Management System (enrolment instruction).
Learning Management System → Learning & Development "Completion
confirmed by LMS" (completion status notification).
Learning & Development "Record completion and update training record
in LMS" → Learning Management System (completion and outcome data).
Learning & Development "Notify employee of follow-up requirement" →
Employee (follow-up learning instruction).

7. Data objects

Data Object "Development Need" — read by "Review development need and
agree learning objectives"; written by trigger arriving from V04.09.
Data Object "Learning Objectives" — written by "Review development need
and agree learning objectives"; read by "Assess learning outcomes against
objectives".
Data Object "Enrolment Request" — written by "Send enrolment request to
Training Provider"; read by Training Provider.
Data Object "Completion Certificate" — written by Training Provider
confirmation; read by "Assess learning outcomes against objectives".
Data Store "Training Record" — written by "Record completion and update
training record in LMS"; read by Learning Management System across the
employee lifecycle.

This subprocess takes a development need signalled by Manage Performance
and manages the full learning cycle: agreeing objectives, selecting and
arranging a suitable programme (internal or external), confirming
delivery, assessing whether objectives are met, and recording the outcome
in the LMS. Where objectives are not met a structured loop arranges
remedial activity until resolved or the deadline triggers escalation. On
completion it hands an updated training record back to support ongoing
performance management (V04.09) or any resulting employment changes
(V04.11).
```

### V04.11 — Manage Changes

**BPMN diagram prompt.**

```text
BPMN: V04.11 Manage Changes — handles employee lifecycle change events
within the Hire to Retire value chain, sitting between Develop Employee
(V04.10) and Handle Leave / Absence (V04.12).

1. Pools & Lanes

Pool "Employing Organisation" — the organisation processing the employee
change request, containing all internal lanes.
  Lanes top to bottom:
  - Hiring Manager / People Manager (people manager)
  - Human Resources (HR business partner)
  - Payroll (payroll officer)

Pool "Employee" — the individual requesting or subject to the change.
Pool "HRIS / HCM System" — the core HR information system that records
employee master data and lifecycle changes.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Employee" — black-box, single instance.
Pool "HRIS / HCM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation (white-box; lanes: Hiring Manager / People
   Manager, then Human Resources, then Payroll)
3. HRIS / HCM System

4. Lane contents in flow order (Employing Organisation)

Hiring Manager / People Manager lane:
  Message start event "Employee change request received from Employee"
  User task "Review and validate change request"
  Exclusive gateway "Change type?"
  - branch "Remuneration or contract change": Send task "Refer to HR for
    remuneration or contract review" — continues in Human Resources lane
  - branch "Role or reporting change": User task "Confirm role or
    reporting line details" — continues in Human Resources lane
  - branch "Personal details change": User task "Endorse personal details
    update" — continues in Human Resources lane
  Exclusive merge gateway "Change type"
  (all branches rejoin here; control passes to Human Resources lane)

Human Resources lane:
  User task "Assess change and check policy compliance"
  Exclusive gateway "Approval required?"
  - branch "Yes — approval needed":
    Expanded Subprocess "Repeat Until Approved" (standard loop)
    containing, in order: User task "Prepare change documentation",
    User task "Submit change for approval", Intermediate message catch
    event "Approval decision received", Exclusive gateway "Approved?",
    - branch "Approved": (exit loop)
    - branch "Rejected — revise": (continue loop iteration)
    Exclusive merge gateway "Approved?"
  - branch "No — auto-approved":
    User task "Prepare change documentation"
  Exclusive merge gateway "Approval required?"
  User task "Issue updated contract or change letter to Employee"
  Send task "Notify Payroll of confirmed change"
  (control passes to Payroll lane)

Payroll lane:
  Intermediate message catch event "Change notification received from HR"
  User task "Update payroll and benefits records"
  Service task "Submit updated payroll data to HRIS / HCM System"
  User task "Confirm change effective date and verify calculations"
  Exclusive gateway "Payroll update correct?"
  - branch "Yes": (continue)
  - branch "No — discrepancy found": User task "Correct payroll data and
    resubmit" — rejoins after gateway
  Exclusive merge gateway "Payroll update correct?"
  Send task "Send change confirmation to Employee"
  End event "Employee change recorded — ready for Handle Leave /
  Absence (V04.12)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Approved" — label "Approval deadline exceeded (10 business days)" —
flow continues to: User task "Escalate unapproved change to HR business
partner" in Human Resources lane, then to Exclusive merge gateway
"Approval required?" to continue normal flow.

6. Connectors

Sequence flows: work begins in the Hiring Manager / People Manager lane,
routes through an exclusive gateway splitting on change type; all three
branches rejoin at the exclusive merge gateway before flowing into the
Human Resources lane; within HR an exclusive gateway splits on whether
approval is needed, the "Yes" branch entering the approval loop
subprocess and the "No" branch going direct to documentation, rejoining
at the exclusive merge gateway before HR notifies Payroll; the Payroll
lane receives the notification via an intermediate catch event, processes
the update, tests correctness at an exclusive gateway with a correction
branch that rejoins the exclusive merge gateway, and ends with the
confirmation send task.

Message flows:
Employee → Hiring Manager / People Manager lane (employee change
  request)
Human Resources lane → Employee (updated contract or change letter)
Human Resources lane → Payroll lane (confirmed change notification —
  internal message)
Payroll lane → Employee (change confirmation)
Payroll lane → HRIS / HCM System (updated payroll and employee master
  data)
HRIS / HCM System → Payroll lane (confirmation of data recorded)

7. Data objects

Data Object "Employee Change Request" — written by Employee (external),
  read by User task "Review and validate change request".
Data Object "Change Documentation" — written by User task "Prepare
  change documentation", read by User task "Submit change for approval".
Data Object "Updated Contract or Change Letter" — written by User task
  "Issue updated contract or change letter to Employee", read by Send
  task "Issue updated contract or change letter to Employee".
Data Store "Employee Master Data (HRIS / HCM System)" — written by
  Service task "Submit updated payroll data to HRIS / HCM System",
  read by User task "Update payroll and benefits records".
Data Object "Payroll Change Record" — written by User task "Update
  payroll and benefits records", read by User task "Confirm change
  effective date and verify calculations".

Manage Changes handles all mid-employment lifecycle events — remuneration
adjustments, role and reporting changes, and personal data updates —
ensuring each is policy-checked, approved where required, documented,
and recorded accurately in the HRIS / HCM System and payroll. It hands a
fully updated employee master record and confirmed payroll position to
Handle Leave / Absence (V04.12).
```

### V04.12 — Handle Leave / Absence

**BPMN diagram prompt.**

```text
BPMN: V04.12 Handle Leave / Absence — subprocess of the Hire to Retire
value chain in which an employee's leave or absence is requested, reviewed,
approved or declined, recorded, and tracked against entitlements.

1. Pools & Lanes

Pool "Employing Organisation" — the organisation managing leave and absence
  Lane "Hiring Manager / People Manager" (people manager)
  Lane "Human Resources" (employee relations adviser)
  Lane "Payroll" (payroll officer)
Pool "Employee" — the employee submitting a leave request or absence
  notification
Pool "Workforce Management System" — system recording leave balances,
  approvals, and absence tracking

2. Pool properties

Pool "Employing Organisation" — white-box, single instance
Pool "Employee" — black-box, single instance
Pool "Workforce Management System" — black-box, System = true, single instance

3. Layout

Top to bottom:
  1. Employee
  2. Employing Organisation
  3. Workforce Management System

4. Lane contents in flow order (Employing Organisation)

Hiring Manager / People Manager lane:
  Message start event "Leave request or absence notification received from
    Employee"
  User task "Review leave request details"
  Exclusive gateway "Leave type requires HR involvement?"
  - branch "Yes — complex or sensitive case": Send task "Refer case to HR
      adviser"
      Intermediate message catch event "HR advice received"
      Exclusive merge gateway "Leave type requires HR involvement"
  - branch "No — standard request": Exclusive merge gateway "Leave type
      requires HR involvement"
  Exclusive gateway "Sufficient entitlement and timing acceptable?"
  - branch "Yes — approve": User task "Approve leave request"
      Service task "Submit approval to Workforce Management System"
      Send task "Send approval notification to Employee"
      Exclusive merge gateway "Request outcome determined"
  - branch "No — decline": User task "Record reason for declining"
      Send task "Send decline notification with reason to Employee"
      Exclusive merge gateway "Request outcome determined"
  Exclusive gateway "Absence already occurring (unplanned)?"
  - branch "Yes — unplanned absence": Expanded Subprocess "Repeat Until
      Return Confirmed" (standard loop) containing, in order: Intermediate
      timer catch event "Daily absence check", User task "Log ongoing
      absence day in Workforce Management System", User task "Attempt
      contact with Employee or notify HR if unresolved"
      Exclusive merge gateway "Absence already occurring (unplanned)"
  - branch "No — planned leave approved": Exclusive merge gateway "Absence
      already occurring (unplanned)"
  User task "Monitor leave period and coverage arrangements"

Human Resources lane:
  User task "Assess complex or sensitive leave case"
  User task "Advise on entitlement, policy, or legislative requirements"
  Send task "Provide HR advice to people manager"
  Exclusive gateway "Formal absence management required?"
  - branch "Yes": User task "Initiate absence management or return-to-work
      plan"
      Send task "Notify Payroll of leave type and duration adjustment"
      End event "Absence management plan initiated — flows to Manage
        Changes (V04.11) if employment conditions change"
  - branch "No": End event "HR advisory role concluded"

Payroll lane:
  Message start event "Payroll notified of approved leave or absence
    adjustment"
  Service task "Retrieve current leave balances from Workforce Management
    System"
  User task "Validate leave type against pay entitlement rules"
  Exclusive gateway "Pay adjustment required?"
  - branch "Yes": User task "Apply pay adjustment or unpaid leave coding"
      Service task "Update payroll records in Workforce Management System"
      Exclusive merge gateway "Pay adjustment required"
  - branch "No — standard paid leave": Service task "Confirm leave coded
      correctly in Workforce Management System"
      Exclusive merge gateway "Pay adjustment required"
  User task "Reconcile leave balances post-period"
  End event "Leave and pay records reconciled — ready for Manage Payroll
    and Benefits (V04.08) payroll run"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Return Confirmed" — label "Absence exceeds policy threshold" — triggers
  User task "Initiate formal absence management" in Human Resources lane.
Interrupting message boundary event on User task "Assess complex or
  sensitive leave case" — label "Medical certificate or supporting
  documentation received from Employee" — triggers User task "Attach
  documentation to case record".

6. Connectors

Sequence flows: the process begins in the Hiring Manager / People Manager
lane with the message start event, flows through review and the gateway
testing HR involvement — the "Yes" branch passes to HR lane and returns via
message catch, the "No" branch skips directly — both branches merge before
the entitlement gateway, whose "approve" branch submits to the system and
notifies the Employee while the "decline" branch records and notifies, both
rejoining before the unplanned-absence gateway; the "Yes" branch loops
inside the expanded subprocess until return is confirmed while "No" passes
through, both merging before the monitoring task; a separate payroll flow
begins when HR or the people manager notifies Payroll, proceeding through
balance retrieval, validation, the pay-adjustment gateway whose branches
both merge before reconciliation, and ending at the reconciled end event.

Message flows:
  Employee → Employing Organisation / Hiring Manager / People Manager lane
    (leave request or absence notification)
  Employing Organisation / Hiring Manager / People Manager lane → Employee
    (approval or decline notification)
  Employing Organisation / Hiring Manager / People Manager lane →
    Workforce Management System (leave approval submission)
  Workforce Management System → Employing Organisation / Payroll lane
    (current leave balances)
  Employing Organisation / Payroll lane → Workforce Management System
    (updated leave and absence records)
  Employing Organisation / Human Resources lane → Employing Organisation /
    Payroll lane (leave type and duration adjustment notification)
  Employee → Employing Organisation / Human Resources lane (medical
    certificate or supporting documentation)

7. Data objects

Data Object "Leave Request" — written by Employee (implied submission),
  read by User task "Review leave request details"
Data Object "HR Advice Note" — written by User task "Advise on entitlement,
  policy, or legislative requirements", read by Intermediate message catch
  event "HR advice received"
Data Object "Absence Management Plan" — written by User task "Initiate
  absence management or return-to-work plan", read by Send task "Notify
  Payroll of leave type and duration adjustment"
Data Object "Pay Adjustment Record" — written by User task "Apply pay
  adjustment or unpaid leave coding", read by User task "Reconcile leave
  balances post-period"
Data Store "Workforce Management System Leave Register" — read by Service
  task "Retrieve current leave balances from Workforce Management System",
  written by Service task "Update payroll records in Workforce Management
  System" and Service task "Confirm leave coded correctly in Workforce
  Management System"

This subprocess receives a leave request or absence notification from the
Employee and carries it through managerial review, optional HR advisory
involvement, approval or decline, real-time absence tracking for unplanned
events, and payroll coding and balance reconciliation. Where a formal
absence management or return-to-work plan is raised, the outcome is handed
to Manage Changes (V04.11) if employment conditions must be adjusted, and
all finalised leave and pay records flow into the next payroll run handled
by Manage Payroll and Benefits (V04.08).
```

### V04.13 — Offboard / Retire Employee

**BPMN diagram prompt.**

```text
BPMN: V04.13 Offboard / Retire Employee — the final subprocess of the
Hire to Retire value chain, triggered when an employee separates from the
organisation through resignation, retirement, or termination, and ending
when all exit obligations have been discharged.

1. Pools & Lanes

Pool "Employing Organisation" — the internal teams that execute the
offboarding process.
  Lanes (top to bottom):
  - Human Resources (employee relations adviser)
  - Payroll (payroll officer)
  - IT (IT provisioning officer)

Pool "Employee" — the departing employee providing acknowledgements,
returning assets, and receiving exit documentation.

Pool "Superannuation / Pension Fund" — external fund receiving final
contribution and member status notification.

Pool "Benefits Provider" — external provider notified of benefit
termination.

Pool "HRIS / HCM System" — records employee lifecycle status, termination
details, and final payroll data.

2. Pool properties

Pool "Employing Organisation" — white-box, single instance.
Pool "Employee" — black-box, single instance.
Pool "Superannuation / Pension Fund" — black-box, single instance.
Pool "Benefits Provider" — black-box, single instance.
Pool "HRIS / HCM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Employee
2. Employing Organisation
3. Superannuation / Pension Fund
4. Benefits Provider
5. HRIS / HCM System

4. Lane contents in flow order (Employing Organisation)

Human Resources lane:
  Message start event "Separation notice received (resignation, retirement,
    or termination decision) — arriving from V04.11 or external trigger"
  User task "Confirm separation type, reason, and effective date"
  Service task "Record separation details in HRIS / HCM System"
  User task "Issue formal separation acknowledgement to Employee"
  User task "Schedule and conduct exit interview"
  Intermediate message catch event "Exit interview response received
    from Employee"
  User task "Compile exit interview findings"
  User task "Draft and issue exit documentation to Employee"
  Intermediate message catch event "Signed exit documentation received
    from Employee"
  User task "Confirm asset return checklist with Employee"
  Intermediate message catch event "Asset return confirmed by Employee"
  Exclusive gateway "All clearances obtained?"
    - branch "Yes": proceed to Payroll lane
    - branch "No": Expanded Subprocess "Repeat Until All Clearances
      Obtained" (standard loop) containing:
        User task "Follow up outstanding clearance items with Employee",
        Intermediate message catch event "Clearance update received"
      Timer boundary event on subprocess "5 business days" —
        interrupting — leads to User task "Escalate overdue clearances
        to HR manager" then rejoins merge gateway
  Exclusive merge gateway "All clearances obtained"
  User task "Close employee file and archive records"
  End event "Offboarding complete — employee separation finalised"

Payroll lane:
  User task "Calculate final pay entitlements including accrued leave
    and termination payments"
  User task "Process final payroll run for departing employee"
  Service task "Submit final superannuation / pension contribution to
    Superannuation / Pension Fund"
  Service task "Notify Benefits Provider of benefit termination"
  User task "Issue final payslip and payment summary to Employee"
  Service task "Update termination record in HRIS / HCM System"

IT lane:
  User task "Receive deprovisioning request and generate revocation
    checklist"
  Service task "Revoke system access and deactivate accounts in IAM
    System"
  User task "Collect and process returned equipment and assets"
  Service task "Record equipment return and access revocation in
    HRIS / HCM System"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  All Clearances Obtained" — label "5 business days" — leads to User
  task "Escalate overdue clearances to HR manager" in Human Resources
  lane, which then rejoins the Exclusive merge gateway "All clearances
  obtained".

6. Connectors

Sequence flows: Flow begins in the Human Resources lane with the message
start event, proceeds through separation confirmation, HRIS recording,
acknowledgement, exit interview, documentation exchange, asset return, and
the clearance gateway. The "No" branch enters the standard-loop subprocess
(with timer boundary escalation rejoining the merge) and the "Yes" branch
meets the Exclusive merge gateway "All clearances obtained". After the
merge, control passes to the Payroll lane for final pay calculation,
payroll processing, fund and provider notifications, payslip issue, and
HRIS update; in parallel the IT lane handles deprovisioning, access
revocation, equipment collection, and HRIS recording. Both lanes complete
before Human Resources closes and archives the employee file and reaches
the end event.

Message flows:
  Human Resources (User task "Issue formal separation acknowledgement to
    Employee") → Employee (separation acknowledgement)
  Human Resources (User task "Draft and issue exit documentation to
    Employee") → Employee (exit documentation package)
  Employee → Human Resources (Intermediate message catch event "Signed
    exit documentation received from Employee") (signed exit documents)
  Human Resources (User task "Schedule and conduct exit interview") →
    Employee (exit interview invitation)
  Employee → Human Resources (Intermediate message catch event "Exit
    interview response received from Employee") (exit interview response)
  Human Resources (User task "Confirm asset return checklist with
    Employee") → Employee (asset return checklist)
  Employee → Human Resources (Intermediate message catch event "Asset
    return confirmed by Employee") (asset return confirmation)
  Payroll (Service task "Submit final superannuation / pension
    contribution to Superannuation / Pension Fund") →
    Superannuation / Pension Fund (final contribution and member
    cessation notification)
  Payroll (Service task "Notify Benefits Provider of benefit
    termination") → Benefits Provider (benefit termination notice)
  Payroll (User task "Issue final payslip and payment summary to
    Employee") → Employee (final payslip and payment summary)
  Human Resources (Service task "Record separation details in HRIS /
    HCM System") → HRIS / HCM System (separation and termination record)
  Payroll (Service task "Update termination record in HRIS / HCM
    System") → HRIS / HCM System (final pay and termination status)
  IT (Service task "Record equipment return and access revocation in
    HRIS / HCM System") → HRIS / HCM System (equipment return and
    access revocation record)

7. Data objects

Data Object "Separation Notice" — read by Human Resources / User task
  "Confirm separation type, reason, and effective date".
Data Object "Exit Documentation Package" — written by Human Resources /
  User task "Draft and issue exit documentation to Employee"; read by
  Employee.
Data Object "Asset Return Checklist" — written by Human Resources / User
  task "Confirm asset return checklist with Employee"; read by IT /
  User task "Collect and process returned equipment and assets".
Data Object "Final Pay Calculation" — written by Payroll / User task
  "Calculate final pay entitlements including accrued leave and
  termination payments"; read by Payroll / User task "Process final
  payroll run for departing employee".
Data Object "Final Payslip" — written by Payroll / User task "Issue
  final payslip and payment summary to Employee".
Data Object "Deprovisioning Checklist" — written by IT / User task
  "Receive deprovisioning request and generate revocation checklist";
  read by IT / Service task "Revoke system access and deactivate
  accounts in IAM System".
Data Store "HRIS / HCM System" — updated by Human Resources / Service
  task "Record separation details in HRIS / HCM System"; updated by
  Payroll / Service task "Update termination record in HRIS / HCM
  System"; updated by IT / Service task "Record equipment return and
  access revocation in HRIS / HCM System".

V04.13 Offboard / Retire Employee manages the complete separation
lifecycle from the moment a separation notice is received through exit
interview, documentation, asset return, clearance, final pay, fund and
benefit notifications, and access revocation, culminating in the closure
and archiving of the employee file. All termination records, final payroll
data, and access revocation confirmations are committed to the HRIS / HCM
System. Because this is the final subprocess of the Hire to Retire value
chain, no handoff to a successor subprocess occurs; the process ends when
all exit obligations have been formally discharged and the employee record
is archived.
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
BPMN: V05.01 Forecast Demand — first subprocess of the Plan to Produce
value chain, converting demand signals from customers, distributors, and
retailers into a validated demand forecast ready for supply planning.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the company running the planning process,
  with two lanes: Demand Planning (demand planner) and Supply Planning
  (supply chain manager).
Pool "Customer" — external party providing demand signals and orders.
Pool "Distributor" — external party providing demand signals and forecasts.
Pool "Retailer" — external party providing demand signals and product
  requirements.
Pool "Reporting / BI Tools" — IT system supplying historical demand data
  and forecast outputs.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Distributor" — black-box, single instance.
Pool "Retailer" — black-box, single instance.
Pool "Reporting / BI Tools" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Distributor
3. Retailer
4. Manufacturing Organisation
5. Reporting / BI Tools

4. Lane contents in flow order (Manufacturing Organisation)

Demand Planning lane:
  Message start event "Demand signals received from Customer, Distributor,
    and Retailer"
  Service task "Retrieve historical demand data from Reporting / BI Tools"
  User task "Consolidate demand signals and market inputs"
  User task "Apply statistical forecasting model"
  User task "Review and adjust raw forecast"
  Exclusive gateway "Forecast acceptable?"
  - branch "No — forecast requires revision":
      Expanded Subprocess "Repeat Until Forecast Acceptable" (standard loop)
        containing, in order: User task "Identify gaps or anomalies in
        forecast data", User task "Adjust forecast assumptions and
        parameters", User task "Re-run statistical forecasting model"
  - branch "Yes — forecast meets criteria":
      continue to Exclusive merge gateway "Forecast acceptable"
  Exclusive merge gateway "Forecast acceptable"
  Service task "Publish draft forecast to Reporting / BI Tools"
  Send task "Send draft forecast to Supply Planning for review"

Supply Planning lane:
  Intermediate message catch event "Draft forecast received from Demand
    Planning"
  User task "Review demand forecast against supply constraints"
  Exclusive gateway "Forecast agreed?"
  - branch "No — revisions required":
      Send task "Return forecast with comments to Demand Planning"
      Intermediate message catch event "Revised forecast received from
        Demand Planning"
      continue to Exclusive merge gateway "Forecast agreed"
  - branch "Yes — forecast accepted":
      continue to Exclusive merge gateway "Forecast agreed"
  Exclusive merge gateway "Forecast agreed"
  User task "Approve and sign off validated demand forecast"
  Service task "Record validated forecast in Reporting / BI Tools"
  End event "Validated demand forecast confirmed — ready for
    Plan Supply (V05.02)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Forecast Acceptable" — label "Forecast revision deadline exceeded" —
  leads to End event "Forecast process escalated — unable to complete
  within cycle time".

6. Connectors

Sequence flows: work begins in the Demand Planning lane with the message
start event, proceeds through data retrieval, consolidation, modelling,
and the loop subprocess for revision cycles, then moves to Reporting /
BI Tools publication and a send task to Supply Planning; the Supply
Planning lane picks up with a message catch event and moves through
review and the "Forecast agreed?" gateway — the "No" branch returns
a message to Demand Planning and waits for a revised forecast before
rejoining at the Exclusive merge gateway "Forecast agreed"; the "Yes"
branch goes directly to that same merge; from the merge the lane
continues to approval, recording, and the end event.

Message flows:
  Customer → Demand Planning lane (demand signals, orders, service-level
    expectations)
  Distributor → Demand Planning lane (forecasts and demand signals)
  Retailer → Demand Planning lane (product requirements and demand
    signals)
  Reporting / BI Tools → Demand Planning lane (historical demand data
    and analytics)
  Demand Planning lane → Reporting / BI Tools (draft forecast published
    for storage and BI access)
  Supply Planning lane → Reporting / BI Tools (validated forecast
    recorded)
  Supply Planning lane → Demand Planning lane (forecast comments and
    revision request, "No" branch only)

7. Data objects

Data Object "Demand Signal Package" — written by Demand Planning lane
  task "Consolidate demand signals and market inputs".
Data Object "Raw Statistical Forecast" — written by Demand Planning lane
  task "Apply statistical forecasting model"; read by Demand Planning
  lane task "Review and adjust raw forecast".
Data Object "Adjusted Draft Forecast" — written by Demand Planning lane
  task "Review and adjust raw forecast"; read by Supply Planning lane
  task "Review demand forecast against supply constraints".
Data Object "Forecast Review Comments" — written by Supply Planning lane
  send task "Return forecast with comments to Demand Planning"; read by
  Demand Planning lane task "Identify gaps or anomalies in forecast data".
Data Store "Reporting / BI Tools Forecast Repository" — written by
  Demand Planning lane service task "Publish draft forecast to Reporting
  / BI Tools" and Supply Planning lane service task "Record validated
  forecast in Reporting / BI Tools"; read by Demand Planning lane service
  task "Retrieve historical demand data from Reporting / BI Tools".

V05.01 Forecast Demand gathers demand signals from customers,
distributors, and retailers, applies statistical modelling, and drives an
iterative review cycle between Demand Planning and Supply Planning until
both teams agree on a validated demand forecast. The approved forecast is
stored in the Reporting / BI Tools repository and handed to Plan Supply
(V05.02), where it becomes the primary input for material and supplier
planning decisions.
```

### V05.02 — Plan Supply

**BPMN diagram prompt.**

```text
BPMN: V05.02 Plan Supply — second subprocess in the Plan to Produce value
chain, translating demand forecasts into a confirmed supply plan by engaging
suppliers and contract manufacturers through the Procurement and Supply
Planning teams.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the company running the Plan to Produce
process, containing Supply Planning and Procurement lanes.
Pool "Supplier" — external supplier providing material availability, lead
times, substitutions, and delivery confirmations.
Pool "Contract Manufacturer" — external contract manufacturer providing
production capacity and delivery commitments.
Pool "Material Requirements Planning (MRP) System" — IT system that
processes demand signals and generates material and supply requirements.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Contract Manufacturer" — black-box, single instance.
Pool "Material Requirements Planning (MRP) System" — black-box,
System = true, single instance.

3. Layout

Top to bottom:
1. Supplier
2. Contract Manufacturer
3. Manufacturing Organisation
4. Material Requirements Planning (MRP) System

4. Lane contents in flow order (Manufacturing Organisation)

Supply Planning lane:
  Message start event "Validated demand forecast received from V05.01"
  Service task "Run MRP to generate supply requirements"
  User task "Review MRP output and identify supply gaps"
  Exclusive gateway "Supply gaps identified?"
  - branch "No gaps": Exclusive merge gateway "Supply gaps identified"
  - branch "Yes — material shortages": User task "Initiate supplier
    enquiry for materials"
    Intermediate message catch event "Supplier availability response
    received"
    Exclusive merge gateway "Supply gaps identified"
  - branch "Yes — capacity shortages": User task "Initiate contract
    manufacturer enquiry"
    Intermediate message catch event "Contract manufacturer capacity
    response received"
    Exclusive merge gateway "Supply gaps identified"
  Exclusive merge gateway "Supply gaps identified"
  User task "Consolidate supplier and capacity responses"
  Exclusive gateway "Supply plan feasible?"
  - branch "Feasible": Exclusive merge gateway "Supply plan feasible"
  - branch "Not feasible": Expanded Subprocess "Repeat Until Supply Plan
    Agreed" (standard loop) containing, in order: User task "Negotiate
    revised terms or quantities with supply partners", Send task "Send
    revised requirements to supply partners", Intermediate message catch
    event "Revised confirmation received"
    Exclusive merge gateway "Supply plan feasible"
  Exclusive merge gateway "Supply plan feasible"
  User task "Document agreed supply plan"
  Send task "Publish supply plan to Production Planning"

Procurement lane:
  User task "Raise or confirm purchase orders with suppliers"
  User task "Confirm contract manufacturer agreements"
  User task "Record procurement commitments in MRP System"
  End event "Supply plan confirmed — ready for Create Production
  Plan (V05.03)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Supply Plan Agreed" — labelled "Negotiation deadline exceeded (5 business
days)" — triggers End event "Supply plan escalated — exception raised".

6. Connectors

Sequence flows: flow begins in the Supply Planning lane with the message
start event, passes through the MRP run and gap review, then branches at
the "Supply gaps identified?" gateway — the no-gap branch merges
immediately, the material-shortage branch passes through supplier enquiry
and an intermediate message catch event before merging, and the
capacity-shortage branch passes through contract manufacturer enquiry and
its own intermediate message catch event before merging — all three
rejoin at the "Supply gaps identified" merge gateway. Flow continues to
consolidation and the "Supply plan feasible?" gateway — the feasible
branch merges immediately, the not-feasible branch enters the standard-
loop subprocess before merging — both rejoin at the "Supply plan
feasible" merge gateway. Flow then passes to documenting the supply plan
and the send task before handing off to the Procurement lane for purchase
order and commitment recording, ending at the end event.

Message flows:
Supplier → Supply Planning lane (material availability, lead times, and
substitution options).
Supply Planning lane → Supplier (material requirement enquiry).
Contract Manufacturer → Supply Planning lane (capacity confirmation and
delivery commitment).
Supply Planning lane → Contract Manufacturer (capacity requirement
enquiry).
Supply Planning lane → Material Requirements Planning (MRP) System
(demand signal input to MRP run).
Material Requirements Planning (MRP) System → Supply Planning lane (MRP
output: requirements, shortages, and suggested orders).
Procurement lane → Material Requirements Planning (MRP) System
(purchase order and commitment data).

7. Data objects

Data Object "Demand Forecast" — read by Supply Planning lane task "Run
MRP to generate supply requirements".
Data Object "MRP Output Report" — written by Material Requirements
Planning (MRP) System; read by Supply Planning lane task "Review MRP
output and identify supply gaps".
Data Object "Supplier Enquiry" — written by Supply Planning lane task
"Initiate supplier enquiry for materials"; read by Supplier pool.
Data Object "Supplier Availability Response" — written by Supplier pool;
read by Supply Planning lane intermediate message catch event "Supplier
availability response received".
Data Object "Contract Manufacturer Enquiry" — written by Supply Planning
lane task "Initiate contract manufacturer enquiry"; read by Contract
Manufacturer pool.
Data Object "Contract Manufacturer Capacity Response" — written by
Contract Manufacturer pool; read by Supply Planning lane intermediate
message catch event "Contract manufacturer capacity response received".
Data Object "Agreed Supply Plan" — written by Supply Planning lane task
"Document agreed supply plan"; read by Supply Planning lane send task
"Publish supply plan to Production Planning".
Data Store "Purchase Order Register" — written by Procurement lane task
"Raise or confirm purchase orders with suppliers".
Data Store "Procurement Commitment Record" — written by Procurement lane
task "Record procurement commitments in MRP System".

V05.02 Plan Supply transforms the validated demand forecast from V05.01
into a confirmed, feasible supply plan by running MRP, identifying
material and capacity gaps, engaging suppliers and contract manufacturers
through structured enquiry and negotiation cycles, and locking in purchase
orders and agreements. It hands the agreed supply plan to V05.03 Create
Production Plan, where production planners translate supply commitments
into a detailed manufacturing schedule.
```

### V05.03 — Create Production Plan

**BPMN diagram prompt.**

```text
BPMN: V05.03 Create Production Plan — third subprocess in the Plan to
Produce value chain, converting a confirmed supply plan into a structured
production plan validated against bills of materials and engineering data.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal teams that create and
validate the production plan.
  Lane "Production Planning" — production planner who owns plan creation.
  Lane "Engineering" — engineer who validates BOMs and routings.

Pool "Product Lifecycle Management (PLM) System" — IT system providing
bills of materials, routings, and product specifications.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Product Lifecycle Management (PLM) System" — black-box,
System = true, single instance.

3. Layout

Top to bottom:
1. Manufacturing Organisation (white-box, two lanes)
2. Product Lifecycle Management (PLM) System (black-box, bottom)

4. Lane contents in flow order (Manufacturing Organisation)

Production Planning lane:
  Message start event "Supply plan received from Plan Supply (V05.02)"
  User task "Review confirmed supply plan"
  Service task "Retrieve BOM and routing data from PLM System"
  User task "Draft production plan"
  User task "Define production quantities and timelines"
  Send task "Submit draft production plan for engineering review"
  Intermediate message catch event "Engineering review response received"
  Exclusive gateway "Plan approved by Engineering?"
    - branch "Yes": Exclusive merge gateway "Plan approved by Engineering?"
    - branch "No": User task "Revise production plan per engineering
      feedback"
      then rejoin Exclusive merge gateway "Plan approved by Engineering?"
  Exclusive merge gateway "Plan approved by Engineering?"
  User task "Finalise and confirm production plan"
  Service task "Record confirmed production plan in PLM System"
  End event "Production plan confirmed — ready for Check Capacity
    and Materials (V05.04)"

Engineering lane:
  Intermediate message catch event "Draft production plan received"
  User task "Review BOM and routing completeness"
  User task "Validate technical feasibility of production plan"
  Exclusive gateway "BOM and routing complete?"
    - branch "Complete": Send task "Approve and return plan to
      Production Planning"
      ends this branch (no separate end event; flows to send task only)
    - branch "Incomplete": User task "Flag gaps and request BOM
      or routing correction"
      Service task "Update BOM or routing in PLM System"
      Send task "Return corrected plan with feedback to Production
        Planning"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on User task "Submit draft production
plan for engineering review" — label "Engineering review overdue (2 business
days)" — triggers Send task "Escalate review delay to plant manager",
which ends in a non-interrupting flow back to the waiting state.

6. Connectors

Sequence flows: Flow begins in the Production Planning lane with receipt
of the supply plan, moves through plan drafting and BOM retrieval, then
crosses to the Engineering lane via a send task. Engineering reviews and
either approves (returning approval to Production Planning) or flags
issues (returning feedback); the "No" branch in Production Planning loops
through revision before rejoining the merge gateway, after which the plan
is finalised and recorded.

Message flows:
  Manufacturing Organisation (Service task "Retrieve BOM and routing data
    from PLM System") → Product Lifecycle Management (PLM) System
    (BOM and routing retrieval request)
  Product Lifecycle Management (PLM) System → Manufacturing Organisation
    (Service task "Retrieve BOM and routing data from PLM System")
    (BOM, routings, and product specifications)
  Engineering lane (User task "Update BOM or routing in PLM System") →
    Product Lifecycle Management (PLM) System (corrected BOM or routing
    record)
  Manufacturing Organisation (Service task "Record confirmed production
    plan in PLM System") → Product Lifecycle Management (PLM) System
    (confirmed production plan)

7. Data objects

Data Object "Confirmed Supply Plan" — read by User task "Review confirmed
  supply plan".
Data Object "Bill of Materials (BOM)" — read by User task "Review BOM and
  routing completeness"; written by Service task "Update BOM or routing in
  PLM System".
Data Object "Routing Data" — read by User task "Validate technical
  feasibility of production plan"; written by Service task "Update BOM or
  routing in PLM System".
Data Object "Draft Production Plan" — written by User task "Draft
  production plan"; read by User task "Review BOM and routing completeness".
Data Object "Engineering Review Feedback" — written by User task "Flag
  gaps and request BOM or routing correction"; read by User task "Revise
  production plan per engineering feedback".
Data Store "PLM System Product Data" — read by Service task "Retrieve
  BOM and routing data from PLM System"; written by Service task "Record
  confirmed production plan in PLM System".

V05.03 Create Production Plan takes the confirmed supply plan from V05.02
and transforms it into a structured, engineering-validated production plan
backed by verified bills of materials and routings stored in the PLM
System. The Engineering lane ensures technical feasibility before the plan
is finalised, and any BOM or routing gaps are resolved before sign-off.
The confirmed production plan is then handed to V05.04 Check Capacity and
Materials, where it is tested against actual capacity and stock levels.
```

### V05.04 — Check Capacity and Materials

**BPMN diagram prompt.**

```text
BPMN: V05.04 Check Capacity and Materials — the fourth subprocess in the
Plan to Produce value chain, verifying that production capacity and
materials are available before scheduling begins.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal organisation running the
capacity and materials check.
  Lanes (top to bottom):
  - Production Planning (production planner)
  - Warehouse (inventory controller)

Pool "Supplier" — external party providing material availability and lead
time information when shortfalls are identified.

Pool "ERP Manufacturing Module" — IT system used to check capacity,
reservations, and material requirements.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "ERP Manufacturing Module" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Supplier
2. Manufacturing Organisation
3. ERP Manufacturing Module

4. Lane contents in flow order (Manufacturing Organisation)

Production Planning lane:
  Message start event "Approved production plan received from V05.03"
  User task "Review production plan and capacity requirements"
  Service task "Retrieve capacity data from ERP Manufacturing Module"
  Exclusive gateway "Sufficient capacity available?"
  - branch "Yes": Exclusive merge gateway "Capacity resolved"
  - branch "No": User task "Identify capacity shortfall and options"
               Exclusive gateway "Shortfall resolvable internally?"
               - branch "Yes": User task "Adjust work centre allocation
                 or shift pattern"
                              Exclusive merge gateway "Shortfall resolved"
                              Exclusive merge gateway "Capacity resolved"
               - branch "No": Send task "Notify Warehouse of capacity
                 constraint"
                              Exclusive merge gateway "Shortfall resolved"
                              Exclusive merge gateway "Capacity resolved"
  Exclusive merge gateway "Capacity resolved"
  User task "Confirm capacity check result and document findings"

Warehouse lane:
  Service task "Retrieve material requirements from ERP Manufacturing
    Module"
  User task "Check stock levels against bill of materials"
  Exclusive gateway "Materials sufficient?"
  - branch "Yes": Exclusive merge gateway "Materials resolved"
  - branch "No": User task "Identify material shortfalls"
               Exclusive gateway "Shortfall coverable from safety stock?"
               - branch "Yes": User task "Reserve safety stock in ERP
                 Manufacturing Module"
                              Exclusive merge gateway "Material shortfall
                              addressed"
                              Exclusive merge gateway "Materials resolved"
               - branch "No": Send task "Request material availability
                 and lead time from Supplier"
                              Intermediate message catch event "Supplier
                              availability confirmation received"
                              User task "Assess supplier response and
                              update material plan"
                              Exclusive merge gateway "Material shortfall
                              addressed"
                              Exclusive merge gateway "Materials resolved"
  Exclusive merge gateway "Materials resolved"
  Service task "Record material reservations in ERP Manufacturing Module"
  User task "Confirm material availability status"
  Exclusive gateway "Capacity and materials both confirmed?"
  - branch "Yes": End event "Capacity and materials confirmed —
    ready for Schedule Production (V05.05)"
  - branch "No": User task "Escalate unresolved constraints to
    production planner"
               End event "Constraints escalated — returned for
               re-planning"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Request material availability and
lead time from Supplier", labelled "Supplier response overdue (48 hours)";
flow continues to User task "Escalate unresolved constraints to production
planner".

6. Connectors

Sequence flows: Work begins in the Production Planning lane, which
retrieves capacity data and resolves any capacity shortfall before
documenting findings. In parallel, the Warehouse lane retrieves material
requirements and checks stock; a shortfall branch contacts the Supplier
and awaits a reply before recording reservations. Both lanes converge at
the final gateway in the Warehouse lane, where a confirmed outcome routes
to the success end event and an unresolved outcome routes to escalation.

Message flows:
ERP Manufacturing Module → Production Planning lane "Retrieve capacity
  data from ERP Manufacturing Module" (capacity and work-centre data).
ERP Manufacturing Module → Warehouse lane "Retrieve material requirements
  from ERP Manufacturing Module" (bill of materials and stock levels).
Warehouse lane "Send task: Request material availability and lead time
  from Supplier" → Supplier (material shortfall and requirements notice).
Supplier → Warehouse lane "Intermediate message catch event: Supplier
  availability confirmation received" (material availability, lead times,
  and substitution options).
Warehouse lane "Record material reservations in ERP Manufacturing Module"
  → ERP Manufacturing Module (material reservation records).

7. Data objects

Data Object "Approved Production Plan" — read by "Review production plan
  and capacity requirements".
Data Object "Capacity Requirements Report" — written by "Retrieve capacity
  data from ERP Manufacturing Module"; read by "Review production plan and
  capacity requirements".
Data Object "Bill of Materials" — read by "Check stock levels against bill
  of materials"; read by "Retrieve material requirements from ERP
  Manufacturing Module".
Data Object "Material Shortfall Notice" — written by "Identify material
  shortfalls"; read by "Request material availability and lead time from
  Supplier".
Data Object "Supplier Availability Confirmation" — read by "Assess
  supplier response and update material plan".
Data Store "ERP Manufacturing Module — Capacity and Inventory Ledger" —
  written by "Record material reservations in ERP Manufacturing Module";
  read by "Retrieve capacity data from ERP Manufacturing Module" and
  "Retrieve material requirements from ERP Manufacturing Module".
Data Object "Capacity and Materials Check Record" — written by "Confirm
  capacity check result and document findings" and "Confirm material
  availability status"; read by "Escalate unresolved constraints to
  production planner".

V05.04 Check Capacity and Materials validates that the manufacturing
organisation has both the machine or work-centre capacity and the raw
materials needed to execute the approved production plan. The Production
Planning lane verifies capacity against ERP data and resolves any
shortfall through reallocation, while the Warehouse lane checks stock,
reserves safety stock where possible, and contacts Suppliers when
external replenishment is needed. A confirmed outcome — with reservations
recorded in the ERP — is handed to Schedule Production (V05.05); any
unresolved constraint is escalated for re-planning before the schedule
is committed.
```

### V05.05 — Schedule Production

**BPMN diagram prompt.**

```text
BPMN: V05.05 Schedule Production — the subprocess that converts the
approved production plan into a detailed, time-sequenced shop-floor
schedule and hands confirmed work orders to manufacturing operations.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal organisation running
the scheduling process, containing Production Planning and Manufacturing
Operations lanes.
Pool "Advanced Planning & Scheduling (APS) System" — the scheduling
engine that receives planning inputs and returns an optimised schedule.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Advanced Planning & Scheduling (APS) System" — black-box,
System = true, single instance.

3. Layout

Top to bottom:
1. Manufacturing Organisation (white-box)
2. Advanced Planning & Scheduling (APS) System (black-box)

4. Lane contents in flow order (Manufacturing Organisation)

Production Planning lane (production planner):
  Message start event "Approved production plan received from
    Create Production Plan (V05.04)"
  User task "Review approved production plan and capacity check results"
  User task "Define scheduling parameters and constraints"
  Service task "Submit plan and constraints to APS System"
  Intermediate message catch event "Optimised schedule received from
    APS System"
  User task "Review and validate optimised schedule"
  Exclusive gateway "Schedule acceptable?"
    - branch "No — adjustments required":
        Expanded Subprocess "Repeat Until Schedule Accepted"
          (standard loop) containing, in order:
          User task "Identify and document scheduling conflicts",
          User task "Revise scheduling parameters or constraints",
          Service task "Resubmit revised parameters to APS System",
          Intermediate message catch event "Revised schedule received
            from APS System",
          User task "Review revised schedule"
    - branch "Yes — schedule approved":
        continues to exclusive merge gateway
  Exclusive merge gateway "Schedule acceptable"
  User task "Approve and publish finalised schedule"
  Service task "Release confirmed work orders to MES via APS System"

Manufacturing Operations lane (plant manager):
  User task "Receive and acknowledge published schedule"
  User task "Assign work orders to production lines and shifts"
  User task "Confirm resource and material readiness with supervisors"
  End event "Confirmed schedule handed to Manufacture Product (V05.07)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Schedule Accepted" — labelled "Scheduling deadline exceeded (48 hours)"
— triggers an End event "Scheduling escalated to plant manager —
process terminated for replanning".

6. Connectors

Sequence flows: work begins in the Production Planning lane with the
message start event and flows through plan review, parameter definition,
APS submission, schedule receipt, and validation to the "Schedule
acceptable?" gateway. The "No" branch enters the loop subprocess where
conflicts are resolved and parameters resubmitted; on each iteration the
revised schedule is reviewed, and when accepted the branch rejoins at
the "Schedule acceptable" merge gateway. The "Yes" branch also rejoins
there. Flow then continues through approval, publishing, and work-order
release, crossing into the Manufacturing Operations lane where the plant
manager acknowledges the schedule, assigns work orders, and confirms
readiness before the end event.

Message flows:
Manufacturing Organisation (Production Planning) →
  Advanced Planning & Scheduling (APS) System
  (plan, constraints, and scheduling parameters)
Advanced Planning & Scheduling (APS) System →
  Manufacturing Organisation (Production Planning)
  (optimised or revised schedule)
Manufacturing Organisation (Production Planning) →
  Advanced Planning & Scheduling (APS) System
  (approval confirmation and work-order release instruction)
Advanced Planning & Scheduling (APS) System →
  Manufacturing Organisation (Manufacturing Operations)
  (confirmed work orders pushed to MES)

7. Data objects

Data Object "Approved Production Plan" — read by User task "Review
  approved production plan and capacity check results".
Data Object "Scheduling Parameters and Constraints" — written by User
  task "Define scheduling parameters and constraints"; read by Service
  task "Submit plan and constraints to APS System".
Data Object "Optimised Schedule" — written by Intermediate message
  catch event "Optimised schedule received from APS System"; read by
  User task "Review and validate optimised schedule".
Data Object "Scheduling Conflict Log" — written by User task "Identify
  and document scheduling conflicts"; read by User task "Revise
  scheduling parameters or constraints".
Data Object "Confirmed Work Orders" — written by Service task "Release
  confirmed work orders to MES via APS System"; read by User task
  "Receive and acknowledge published schedule".
Data Store "Production Schedule Register" — written by User task
  "Approve and publish finalised schedule"; read by User task "Assign
  work orders to production lines and shifts".

V05.05 Schedule Production transforms the approved production plan and
capacity check results into a time-sequenced, resource-assigned shop-
floor schedule. The APS System optimises sequencing against constraints,
conflicts are resolved through an iterative loop, and the plant manager
confirms resource and material readiness. The subprocess hands a set of
confirmed work orders and a published schedule to Manufacture Product
(V05.07), giving production supervisors and machine operators clear,
actionable instructions for shop-floor execution.
```

### V05.06 — Issue Materials

**BPMN diagram prompt.**

```text
BPMN: V05.06 Issue Materials — the subprocess in which the Warehouse
picks and issues raw materials and components to the shop floor, sitting
between Schedule Production (V05.05) and Manufacture Product (V05.07)
in the Plan to Produce value chain.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the organisation running the
Issue Materials process, containing Warehouse and Manufacturing
Operations lanes.
Pool "Warehouse Management System (WMS)" — the IT system that records
stock movements and confirms inventory updates.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Warehouse Management System (WMS)" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Manufacturing Organisation (white-box, two lanes)
2. Warehouse Management System (WMS) (black-box)

4. Lane contents in flow order (Manufacturing Organisation)

Warehouse lane (inventory controller):
  Message start event "Production schedule and material requirements
    received from Schedule Production (V05.05)"
  User task "Review material requirements and pick list"
  Service task "Check stock availability in WMS"
  Exclusive gateway "Stock available?"
  - branch "Yes — sufficient stock": continue to "Generate material
      issue order in WMS"
  - branch "No — stock shortfall": Send task "Raise shortage notice to
      Production Planning"; End event "Material shortage escalated —
      ready for Manage Exceptions (V05.09)"
  Exclusive merge gateway "Stock available"
  Service task "Generate material issue order in WMS"
  User task "Pick materials from warehouse locations"
  User task "Verify picked materials against pick list"
  Exclusive gateway "Pick correct and complete?"
  - branch "Yes": continue to "Stage materials for issue"
  - branch "No — discrepancy found": User task "Resolve picking
      discrepancy"; sequence rejoins before "Stage materials for issue"
  Exclusive merge gateway "Pick correct and complete"
  User task "Stage materials for issue at production staging area"
  Send task "Notify Manufacturing Operations that materials are staged"

Manufacturing Operations lane (production supervisor):
  Intermediate message catch event "Materials staged notification
    received"
  User task "Inspect and accept materials at staging area"
  Exclusive gateway "Materials acceptable?"
  - branch "Yes": continue to "Confirm material receipt"
  - branch "No — materials rejected": Send task "Return materials and
      notify Warehouse of rejection"; sequence rejoins Warehouse lane
      at "Resolve picking discrepancy"
  Exclusive merge gateway "Materials acceptable"
  User task "Confirm material receipt on shop floor"
  Service task "Record material consumption against work order in WMS"
  End event "Materials issued and recorded — ready for Manufacture
    Product (V05.07)"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on "Pick materials from warehouse
locations" — label "Pick taking too long (time limit exceeded)" —
triggers Send task "Escalate pick delay to production supervisor".

6. Connectors

Sequence flows: The flow begins in the Warehouse lane, checks stock
availability and branches; the shortage branch ends independently with
an escalation end event. The main branch continues through material
issue order generation, picking, verification (with an internal
discrepancy loop), and staging. Control passes to the Manufacturing
Operations lane via the staged notification, where materials are
inspected and either accepted or returned to the Warehouse lane to
re-enter at the discrepancy resolution step; on acceptance the lane
records receipt and ends.

Message flows:
Manufacturing Organisation (Warehouse lane) → Warehouse Management
  System (WMS) (check stock availability request).
Warehouse Management System (WMS) → Manufacturing Organisation
  (Warehouse lane) (stock availability confirmation).
Manufacturing Organisation (Warehouse lane) → Warehouse Management
  System (WMS) (material issue order).
Warehouse Management System (WMS) → Manufacturing Organisation
  (Warehouse lane) (issue order confirmation).
Manufacturing Organisation (Manufacturing Operations lane) →
  Warehouse Management System (WMS) (material consumption
  confirmation against work order).
Warehouse Management System (WMS) → Manufacturing Organisation
  (Manufacturing Operations lane) (consumption posting
  acknowledgement).

7. Data objects

Data Object "Material Requirements List" — read by "Review material
  requirements and pick list".
Data Object "Pick List" — written by "Generate material issue order
  in WMS"; read by "Pick materials from warehouse locations" and
  "Verify picked materials against pick list".
Data Object "Material Issue Order" — written by "Generate material
  issue order in WMS"; read by "Record material consumption against
  work order in WMS".
Data Object "Shortage Notice" — written by "Raise shortage notice to
  Production Planning".
Data Store "WMS Inventory Ledger" — read by "Check stock availability
  in WMS"; written by "Record material consumption against work order
  in WMS".

V05.06 Issue Materials takes the released production schedule from
V05.05 and translates it into physical stock movements: the Warehouse
verifies availability, generates issue orders, picks and stages
components, and Manufacturing Operations accepts them on the shop floor.
Any stock shortfall is routed immediately to Manage Exceptions (V05.09).
On successful completion, confirmed material issues and updated inventory
records are handed to Manufacture Product (V05.07) so production can
begin against the open work orders.
```

### V05.07 — Manufacture Product

**BPMN diagram prompt.**

```text
BPMN: V05.07 Manufacture Product — the subprocess in which Manufacturing
Operations executes work orders on the shop floor, coordinating with
Maintenance and Contract Manufacturer to transform issued materials into
finished product within the Plan to Produce value chain.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal organisation executing
  production, with lanes for Manufacturing Operations and Maintenance.
Pool "Contract Manufacturer" — external party that performs or supports
  portions of production work.
Pool "Manufacturing Execution System (MES)" — IT system recording shop-floor
  instructions, production confirmations, and machine data.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Contract Manufacturer" — black-box, single instance.
Pool "Manufacturing Execution System (MES)" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Contract Manufacturer
2. Manufacturing Organisation
3. Manufacturing Execution System (MES)

4. Lane contents in flow order (Manufacturing Organisation)

Manufacturing Operations lane:

  Message start event "Work order and issued materials received from
    Issue Materials (V05.06)"
  Service task "Retrieve work order and shop-floor instructions from MES"
  User task "Confirm materials and components against bill of materials"
  Exclusive gateway "Materials correct and complete?"
    - branch "Yes": continue to next task
    - branch "No": End event "Material discrepancy — escalate to Manage
        Exceptions (V05.09)" (does not rejoin)
  Exclusive merge gateway "Materials correct and complete?"
  User task "Set up machines and tooling per routing"
  Expanded Subprocess "Repeat Until Batch Complete" (standard loop)
    containing, in order:
    User task "Assign machine operators to work centres",
    User task "Execute production operation at work centre",
    Service task "Record operation progress and machine data in MES",
    User task "Perform in-process checks against quality specification"
  Exclusive gateway "In-process check passed?"
    - branch "Yes": continue to next task
    - branch "No — non-conformance detected": Send task "Notify Quality
        Assurance of non-conformance" then End event "Non-conformance
        flagged — route to Manage Exceptions (V05.09)" (does not rejoin)
  Exclusive merge gateway "In-process check passed?"
  Exclusive gateway "Internal capacity sufficient?"
    - branch "Yes": continue to next task
    - branch "No — outsource required": Send task "Send production work
        package to Contract Manufacturer"
        Intermediate message catch event "Production output received from
          Contract Manufacturer"
  Exclusive merge gateway "Internal capacity sufficient?"
  User task "Consolidate completed output from all work centres"
  Service task "Post production confirmation to MES"
  End event "Manufactured product ready — ready for Inspect Quality
    (V05.08)"

Maintenance lane:

  Intermediate message catch event "Equipment fault reported by operator"
  User task "Assess and carry out maintenance or repair"
  User task "Return equipment to production-ready state"
  Send task "Confirm equipment availability to Manufacturing Operations"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Batch Complete", labelled "Production shift deadline exceeded", leading
  to Send task "Notify plant manager of schedule overrun" and then End
  event "Schedule overrun — escalate to Manage Exceptions (V05.09)".
Interrupting message boundary event on User task "Execute production
  operation at work centre", labelled "Equipment fault raised", leading
  to the Maintenance lane Intermediate message catch event "Equipment
  fault reported by operator".

6. Connectors

Sequence flows: the flow begins in the Manufacturing Operations lane with
the message start event and proceeds through materials confirmation, setup,
and the standard-loop batch subprocess. The in-process gateway branches to
a non-conformance end or merges and continues; the capacity gateway branches
to Contract Manufacturer coordination or merges and continues through
consolidation and MES confirmation to the end event. The Maintenance lane
handles the equipment fault detour as an interrupting boundary path,
rejoining Manufacturing Operations when equipment availability is confirmed
via a send task back to the lane.

Message flows:
  Manufacturing Organisation (Manufacturing Operations) →
    Manufacturing Execution System (MES) (work order retrieval request and
    operation progress data)
  Manufacturing Execution System (MES) →
    Manufacturing Organisation (Manufacturing Operations) (shop-floor
    instructions and work order details)
  Manufacturing Organisation (Manufacturing Operations) →
    Contract Manufacturer (production work package for outsourced
    operations)
  Contract Manufacturer →
    Manufacturing Organisation (Manufacturing Operations) (completed
    production output and confirmation)
  Manufacturing Organisation (Manufacturing Operations) →
    Manufacturing Execution System (MES) (production confirmation posting)
  Manufacturing Organisation (Maintenance) →
    Manufacturing Execution System (MES) (equipment status update after
    repair)

7. Data objects

Data Object "Work Order" — read by "Retrieve work order and shop-floor
  instructions from MES"; read by "Confirm materials and components against
  bill of materials".
Data Object "Bill of Materials" — read by "Confirm materials and components
  against bill of materials".
Data Object "Routing" — read by "Set up machines and tooling per routing".
Data Object "Quality Specification" — read by "Perform in-process checks
  against quality specification".
Data Object "Production Work Package" — written by "Send production work
  package to Contract Manufacturer"; read by Contract Manufacturer.
Data Object "In-Process Check Record" — written by "Perform in-process
  checks against quality specification".
Data Store "Manufacturing Execution System (MES) Production Log" — written
  by "Record operation progress and machine data in MES"; written by "Post
  production confirmation to MES".

V05.07 Manufacture Product transforms issued materials into finished product
by executing work orders across internal work centres under the direction of
production supervisors and machine operators, with Maintenance resolving
equipment faults and Contract Manufacturer absorbing overflow work. In-process
quality checks screen out non-conformances early, routing them to V05.09.
Once all batches are confirmed and posted to the MES, the subprocess hands
fully manufactured product to Inspect Quality (V05.08).
```

### V05.08 — Inspect Quality

**BPMN diagram prompt.**

```text
BPMN: V05.08 Inspect Quality — subprocess within the Plan to Produce
value chain, executed after manufacturing is complete and before exceptions
are managed or output is recorded.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal organisation running the
quality inspection process, with lanes for Quality Assurance and
Manufacturing Operations.
Pool "Quality Management System (QMS)" — IT system that records inspection
specifications, results, and non-conformance reports.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Quality Management System (QMS)" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Manufacturing Organisation (white-box, two lanes)
2. Quality Management System (QMS) (black-box, IT system)

4. Lane contents in flow order (Manufacturing Organisation)

Quality Assurance lane (quality inspector):
  Message start event "Manufactured batch ready for inspection received
  from V05.07"
  Service task "Retrieve inspection specifications from QMS"
  User task "Perform incoming inspection of manufactured batch"
  User task "Record inspection results"
  Service task "Log inspection results in QMS"
  Exclusive gateway "Inspection result?"
    - branch "Pass": User task "Approve batch and release for next
      stage"
      Service task "Update batch status to Released in QMS"
      End event "Batch approved — ready for Record Production
      Output (V05.10)"
    - branch "Fail — minor non-conformance": User task "Raise
      non-conformance report"
      Service task "Submit non-conformance report to QMS"
      Intermediate message catch event "Disposition decision
      received"
      Exclusive gateway "Disposition?"
        - branch "Rework": Send task "Send rework instruction to
          Manufacturing Operations"
          Intermediate message catch event "Rework complete
          notification received"
          Exclusive merge gateway "Disposition resolved"
        - branch "Concession accepted": User task "Record
          concession approval"
          Exclusive merge gateway "Disposition resolved"
        - branch "Reject": User task "Quarantine and reject batch"
          Service task "Record rejection in QMS"
          Send task "Send rejection notification to Manufacturing
          Operations"
          End event "Batch rejected — escalate to Manage
          Exceptions (V05.09)"
      Exclusive merge gateway "Disposition resolved"
      Service task "Update batch status in QMS"
      End event "Non-conformance resolved — ready for Record
      Production Output (V05.10)"
    - branch "Fail — critical non-conformance": User task "Quarantine
      batch immediately"
      Service task "Record critical non-conformance in QMS"
      Send task "Send critical failure alert to Manufacturing
      Operations"
      End event "Critical non-conformance — escalate to Manage
      Exceptions (V05.09)"
  Exclusive merge gateway "Inspection result"

Manufacturing Operations lane (production supervisor):
  Intermediate message catch event "Rework instruction received"
  Expanded Subprocess "Repeat Until Rework Accepted" (standard loop)
  containing, in order: User task "Perform rework on batch",
  User task "Notify Quality Assurance rework complete"
  Send task "Send rework complete notification to Quality Assurance"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Rework Accepted" — label "Rework time limit exceeded" — triggers Send
task "Notify Quality Assurance rework cannot be completed in time",
followed by End event "Rework timed out — escalate to Manage Exceptions
(V05.09)".

6. Connectors

Sequence flows: The process starts in the Quality Assurance lane, moves
through retrieval of specifications, inspection, and result logging, then
diverges at the "Inspection result?" gateway into three branches: Pass
(batch approved, ends), Fail-minor (non-conformance raised, disposition
decided, Rework branch hands off to Manufacturing Operations lane and
awaits rework-complete message before merging back at "Disposition
resolved", Concession branch merges directly, Reject branch ends without
rejoining), and Fail-critical (quarantine and ends). The "Inspection
result" merge gateway is reached only by the Pass path before its own
End event; the minor and critical fail paths carry their own End events
or rejoin at "Disposition resolved".

Message flows:
Manufacturing Organisation (Quality Assurance lane) →
Quality Management System (QMS) (retrieve inspection specifications
request).
Quality Management System (QMS) → Manufacturing Organisation (Quality
Assurance lane) (inspection specifications).
Manufacturing Organisation (Quality Assurance lane) →
Quality Management System (QMS) (inspection results submission).
Manufacturing Organisation (Quality Assurance lane) →
Quality Management System (QMS) (non-conformance report submission).
Quality Management System (QMS) → Manufacturing Organisation (Quality
Assurance lane) (disposition decision).
Manufacturing Organisation (Quality Assurance lane) →
Quality Management System (QMS) (batch status update — Released or
Rejected or Resolved).
Manufacturing Organisation (Quality Assurance lane) →
Manufacturing Organisation (Manufacturing Operations lane) (rework
instruction).
Manufacturing Organisation (Manufacturing Operations lane) →
Manufacturing Organisation (Quality Assurance lane) (rework complete
notification).

7. Data objects

Data Object "Inspection Specification" — read by "Retrieve inspection
specifications from QMS"; written by Quality Management System (QMS).
Data Object "Inspection Results Record" — written by "Record inspection
results"; read by "Log inspection results in QMS".
Data Object "Non-Conformance Report" — written by "Raise non-conformance
report"; read by "Submit non-conformance report to QMS".
Data Object "Disposition Decision" — read by "Record concession approval"
and by "Quarantine and reject batch".
Data Object "Rework Instruction" — written by "Send rework instruction to
Manufacturing Operations"; read by "Perform rework on batch".
Data Store "QMS Batch Status Register" — written by "Update batch status
to Released in QMS" and "Record rejection in QMS" and "Update batch
status in QMS" and "Record critical non-conformance in QMS".

V05.08 Inspect Quality takes a completed manufactured batch from V05.07,
retrieves the relevant quality specifications from the QMS, and puts the
batch through a structured inspection. Batches that pass are released and
handed to V05.10 Record Production Output. Batches with minor
non-conformances are subjected to a disposition process — rework,
concession, or rejection — before being resolved or escalated. Batches
with critical failures are quarantined immediately. All non-passing
outcomes that cannot be resolved within the subprocess are handed to
V05.09 Manage Exceptions for further action.
```

### V05.09 — Manage Exceptions

**BPMN diagram prompt.**

```text
BPMN: V05.09 Manage Exceptions — handles disruptions, non-conformances,
and equipment failures during production execution within the Plan to
Produce value chain.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal teams who detect, assess,
  and resolve production exceptions.
  Lanes (top to bottom):
  - Manufacturing Operations (production supervisor)
  - Maintenance (maintenance technician)
  - Quality Assurance (quality inspector)
Pool "Supplier" — external supplier contacted for emergency material
  support or substitution.
Pool "Contract Manufacturer" — external contract manufacturer engaged
  when internal production capacity cannot be recovered.
Pool "Maintenance Management System (CMMS)" — IT system used to raise,
  track, and close maintenance work orders.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Contract Manufacturer" — black-box, single instance.
Pool "Maintenance Management System (CMMS)" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Supplier
2. Contract Manufacturer
3. Manufacturing Organisation
4. Maintenance Management System (CMMS)

4. Lane contents in flow order (Manufacturing Organisation)

Manufacturing Operations lane:
  Message start event "Production exception raised from V05.07 or V05.08"
  User task "Log and classify exception"
  Exclusive gateway "Exception type?"
  - branch "Equipment failure": sequence continues in Maintenance lane
    (see below); Manufacturing Operations waits at Intermediate message
    catch event "Repair confirmation received from Maintenance"
    after which continue to Exclusive merge gateway "Exception type"
  - branch "Material shortage": Send task "Request emergency material
    supply or substitution"
    Intermediate message catch event "Supplier response received"
    User task "Assess supplier response"
    Exclusive gateway "Material resolved?"
    - branch "Yes": continue to Exclusive merge gateway
      "Material resolved"
    - branch "No": Send task "Escalate to contract manufacturer"
      Intermediate message catch event "Contract manufacturer
      confirmation received"
      Exclusive merge gateway "Material resolved"
    Exclusive merge gateway "Material resolved"
    continue to Exclusive merge gateway "Exception type"
  - branch "Quality non-conformance": sequence continues in Quality
    Assurance lane (see below); Manufacturing Operations waits at
    Intermediate message catch event "Disposition decision received
    from Quality Assurance"
    after which continue to Exclusive merge gateway "Exception type"
  Exclusive merge gateway "Exception type"
  User task "Update production schedule and notify stakeholders"
  Exclusive gateway "Exception fully resolved?"
  - branch "Yes": continue to end
  - branch "No": User task "Escalate to plant manager"
    Exclusive merge gateway "Exception fully resolved"
  Exclusive merge gateway "Exception fully resolved"
  End event "Exception resolved — ready for Record Production Output
    (V05.10)"

Maintenance lane:
  User task "Assess equipment failure"
  Service task "Raise maintenance work order in CMMS"
  Expanded Subprocess "Repeat Until Equipment Restored"
    (standard loop) containing, in order:
    User task "Execute repair or replacement activity",
    User task "Test equipment after repair"
  User task "Confirm equipment restored and close work order in CMMS"
  Send task "Send repair confirmation to Manufacturing Operations"

Quality Assurance lane:
  User task "Review non-conformance report"
  User task "Inspect affected batch or lot"
  Exclusive gateway "Disposition decision?"
  - branch "Rework": User task "Instruct rework of non-conforming
    product"
    Exclusive merge gateway "Disposition decision"
  - branch "Scrap": User task "Authorise scrap and record in QMS"
    Exclusive merge gateway "Disposition decision"
  - branch "Accept with deviation": User task "Issue deviation
    approval"
    Exclusive merge gateway "Disposition decision"
  Exclusive merge gateway "Disposition decision"
  Send task "Send disposition decision to Manufacturing Operations"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Equipment Restored" — label "Max repair window exceeded" — triggers
  Send task "Escalate unresolved equipment failure to plant manager"
  followed by End event "Escalation raised — awaits management decision".
Interrupting message boundary event on User task "Assess supplier
  response" — label "Supplier confirms no stock available" — triggers
  direct flow to Send task "Escalate to contract manufacturer".

6. Connectors

Sequence flows: work begins in the Manufacturing Operations lane with
exception logging and classification; the exclusive gateway branches to
the Maintenance lane (equipment failure), remains in Manufacturing
Operations for supplier contact (material shortage), or passes to the
Quality Assurance lane (non-conformance); each branch eventually returns
a confirmation message to Manufacturing Operations and rejoins the
"Exception type" merge gateway; the flow then progresses to schedule
update and a final resolution check, with unresolved items escalated
before reaching the end event.

Message flows:
Manufacturing Operations "Request emergency material supply or
  substitution" → Supplier (emergency material request).
Supplier → Manufacturing Operations "Supplier response received"
  (material availability or substitution confirmation).
Manufacturing Operations "Escalate to contract manufacturer" →
  Contract Manufacturer (production overflow or material request).
Contract Manufacturer → Manufacturing Operations "Contract manufacturer
  confirmation received" (capacity or supply confirmation).
Maintenance lane "Raise maintenance work order in CMMS" →
  Maintenance Management System (CMMS) (work order creation).
Maintenance Management System (CMMS) → Maintenance lane "User task
  Execute repair or replacement activity" (work order details and
  instructions).
Maintenance lane "Confirm equipment restored and close work order in
  CMMS" → Maintenance Management System (CMMS) (work order closure).

7. Data objects

Data Object "Exception Log" — written by User task "Log and classify
  exception"; read by User task "Update production schedule and notify
  stakeholders".
Data Object "Maintenance Work Order" — written by Service task "Raise
  maintenance work order in CMMS"; read by User task "Confirm equipment
  restored and close work order in CMMS".
Data Object "Non-Conformance Report" — read by User task "Review
  non-conformance report"; written by User task "Authorise scrap and
  record in QMS".
Data Object "Disposition Decision" — written by User task "Issue
  deviation approval"; read by Send task "Send disposition decision to
  Manufacturing Operations".
Data Object "Supplier Response" — written by Intermediate message catch
  event "Supplier response received"; read by User task "Assess supplier
  response".
Data Store "Quality Management System (QMS)" — written by User task
  "Authorise scrap and record in QMS"; read by User task "Inspect
  affected batch or lot".

V05.09 Manage Exceptions detects and resolves production disruptions —
equipment failures, material shortages, and quality non-conformances —
that arise during or after manufacturing execution. It coordinates
internal teams (Maintenance, Quality Assurance, and Manufacturing
Operations) and, where necessary, engages Suppliers or the Contract
Manufacturer to restore normal flow. Once all exceptions are closed and
the production schedule is updated, the subprocess hands a resolved
production status to Record Production Output (V05.10).
```

### V05.10 — Record Production Output

**BPMN diagram prompt.**

```text
BPMN: V05.10 Record Production Output — subprocess in the Plan to Produce
value chain where Manufacturing Operations and Finance capture confirmed
production quantities, post cost transactions, and hand completed output
records to Close Production Orders (V05.12).

1. Pools & Lanes

Pool "Manufacturing Organisation" — the company running the Plan to Produce
process, containing all internal teams for this subprocess.
  Lane "Manufacturing Operations" — production supervisor who confirms
  output quantities and closes shop-floor activity on the MES.
  Lane "Finance" — finance controller who reviews cost postings and
  approves the production cost record.

Pool "Manufacturing Execution System (MES)" — system that holds
shop-floor production confirmations and output data.

Pool "ERP Manufacturing Module" — system that receives cost postings,
updates inventory values, and stores the production order record.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Manufacturing Execution System (MES)" — black-box, System = true,
single instance.
Pool "ERP Manufacturing Module" — black-box, System = true, single
instance.

3. Layout

Top to bottom:
1. Manufacturing Execution System (MES)
2. Manufacturing Organisation
3. ERP Manufacturing Module

4. Lane contents in flow order (Manufacturing Organisation)

Manufacturing Operations lane:
  Message start event "Production output data received from Manufacture
  Product (V05.07)"
  User task "Review shop-floor production confirmation"
  Service task "Retrieve output quantities and scrap data from MES"
  User task "Verify actual versus planned output quantities"
  Exclusive gateway "Output quantities acceptable?"
    - branch "Yes, within tolerance": continue to next task
    - branch "No, discrepancy identified": User task "Raise output
      discrepancy note and escalate to Manage Exceptions (V05.09)"
      End event "Discrepancy escalated — routed to Manage Exceptions
      (V05.09)" (does not rejoin)
  Exclusive merge gateway "Output quantities acceptable"
  User task "Confirm production completion in MES"
  Service task "Post production confirmation to ERP Manufacturing Module"
  Send task "Notify Finance of production cost posting"

Finance lane:
  Intermediate message catch event "Production cost posting notification
  received"
  User task "Review cost posting against standard cost"
  Exclusive gateway "Cost posting approved?"
    - branch "Approved": continue to next task
    - branch "Rejected — variance exceeds threshold": User task
      "Request correction from Manufacturing Operations"
      Intermediate message catch event "Corrected posting received"
      continue to merge
  Exclusive merge gateway "Cost posting approved"
  User task "Approve and confirm production cost record in ERP"
  Service task "Record production output and cost in ERP Manufacturing
  Module"
  End event "Production output recorded — ready for Close Production
  Orders (V05.12)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on User task "Review shop-floor
production confirmation" — label "Review overdue (24 hours)" — triggers
Send task "Escalate overdue review to plant manager" then flow rejoins
after the task.
Interrupting timer boundary event on User task "Review cost posting
against standard cost" — label "Finance review overdue (48 hours)" —
triggers Send task "Escalate overdue cost review to finance manager"
then flow rejoins after the task.

6. Connectors

Sequence flows: the flow begins in the Manufacturing Operations lane
with the message start event, passes through output review and quantity
verification, splits at the "Output quantities acceptable?" gateway —
the discrepancy branch ends at its own end event; the approved branch
merges at "Output quantities acceptable" and continues through MES
confirmation and ERP posting before the send task notifies Finance. The
Finance lane picks up at the intermediate message catch event, moves
through cost review, splits at "Cost posting approved?" — the rejected
branch loops through a correction request and a catch event before
rejoining at "Cost posting approved" — and ends with the ERP record
task and the final end event.

Message flows:
Manufacturing Execution System (MES) → Manufacturing Operations lane
  (shop-floor production confirmation and output quantity data)
Manufacturing Operations lane → Manufacturing Execution System (MES)
  (production completion confirmation)
Manufacturing Operations lane → ERP Manufacturing Module (production
  confirmation posting)
ERP Manufacturing Module → Finance lane (cost posting data for review)
Finance lane → ERP Manufacturing Module (approved production cost
  record and output confirmation)

7. Data objects

Data Object "Shop-Floor Production Confirmation" — read by User task
"Review shop-floor production confirmation"; written by Service task
"Retrieve output quantities and scrap data from MES".
Data Object "Output Discrepancy Note" — written by User task "Raise
output discrepancy note and escalate to Manage Exceptions (V05.09)".
Data Object "Production Completion Record" — written by User task
"Confirm production completion in MES"; read by Service task "Post
production confirmation to ERP Manufacturing Module".
Data Object "Cost Posting Document" — written by Service task "Post
production confirmation to ERP Manufacturing Module"; read by User task
"Review cost posting against standard cost".
Data Object "Corrected Cost Posting" — written by User task "Request
correction from Manufacturing Operations"; read by Intermediate message
catch event "Corrected posting received".
Data Store "ERP Production Output Register" — written by Service task
"Record production output and cost in ERP Manufacturing Module".

V05.10 Record Production Output captures confirmed shop-floor quantities
and scrap data from the MES, reconciles actual against planned output,
and posts approved cost transactions to the ERP Manufacturing Module.
Discrepancies beyond tolerance are escalated to Manage Exceptions
(V05.09), while clean records are finalised by Finance and stored in the
ERP production output register, providing the verified production cost
and quantity data that Close Production Orders (V05.12) requires to
settle and archive each work order.
```

### V05.11 — Move Finished Goods to Inventory

**BPMN diagram prompt.**

```text
BPMN: V05.11 Move Finished Goods to Inventory — the subprocess that transfers
inspected finished goods from the production floor to warehouse storage,
updating inventory records and confirming fulfilment readiness within the
Plan to Produce value chain.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the organisation running the
Move Finished Goods to Inventory subprocess, with lanes for Warehouse
and Logistics.
Pool "Warehouse Management System (WMS)" — the WMS that records stock
movements, putaway locations, and inventory balances.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "Warehouse Management System (WMS)" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Manufacturing Organisation (white-box, contains all lanes)
2. Warehouse Management System (WMS)

4. Lane contents in flow order (Manufacturing Organisation)

Warehouse lane (inventory controller):
  Message start event "Inspected finished goods ready — received from
    Inspect Quality (V05.08)"
  User task "Verify finished goods quantity and lot identification"
  User task "Prepare transfer documentation"
  Service task "Create goods movement request in WMS"
  Intermediate message catch event "Putaway location confirmed by WMS"
  User task "Label and stage finished goods for transfer"
  User task "Execute physical transfer to warehouse storage location"
  Service task "Confirm goods receipt and putaway in WMS"
  Exclusive gateway "Inventory record updated correctly?"
  - branch "Yes": proceed to Logistics lane handoff
  - branch "No": Expanded Subprocess "Repeat Until Record Reconciled"
      (standard loop) containing, in order: User task "Identify
      discrepancy in inventory record", Service task "Submit correction
      to WMS", Intermediate message catch event "Correction
      acknowledgement received from WMS"
  Exclusive merge gateway "Inventory record updated correctly"
  User task "Update lot and batch traceability register"
  Intermediate message catch event "Logistics transfer note received"
  User task "Close warehouse transfer task and file documentation"
  End event "Finished goods in inventory — ready for Close Production
    Orders (V05.12)"

Logistics lane (logistics coordinator):
  User task "Review finished goods transfer note"
  User task "Confirm storage zone and capacity availability"
  Send task "Issue transfer note to Warehouse"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Record Reconciled" — label "Reconciliation time limit exceeded" —
triggers End event "Escalate inventory discrepancy to Production
Planning" (terminates the loop and raises the issue for manual
resolution).

6. Connectors

Sequence flows: Flow begins in the Warehouse lane with the message
start event and proceeds through verification, documentation
preparation, and WMS goods movement request. After the putaway
confirmation catch event, flow continues through labelling, physical
transfer, and WMS receipt confirmation to the exclusive gateway. The
"No" branch enters the reconciliation loop subprocess; on normal
completion it rejoins at the exclusive merge gateway. The "Yes" branch
joins at the same merge gateway. Flow then moves to the Logistics lane
for transfer note review and capacity confirmation, then the send task
issues the transfer note back to the Warehouse lane, where the
intermediate message catch event receives it, closing tasks and
documentation before the end event.

Message flows:
  Manufacturing Organisation (Warehouse lane, "Create goods movement
    request in WMS") → Warehouse Management System (WMS) (goods
    movement request)
  Warehouse Management System (WMS) → Manufacturing Organisation
    (Warehouse lane, "Putaway location confirmed by WMS") (putaway
    location assignment)
  Manufacturing Organisation (Warehouse lane, "Confirm goods receipt
    and putaway in WMS") → Warehouse Management System (WMS) (goods
    receipt and putaway confirmation)
  Warehouse Management System (WMS) → Manufacturing Organisation
    (Warehouse lane, "Correction acknowledgement received from WMS")
    (inventory correction acknowledgement)
  Manufacturing Organisation (Warehouse lane, "Confirm goods receipt
    and putaway in WMS") → Warehouse Management System (WMS) (lot and
    batch traceability data)

7. Data objects

Data Object "Finished Goods Transfer Documentation" — written by
  "Prepare transfer documentation"; read by "Review finished goods
  transfer note".
Data Object "Goods Movement Request" — written by "Create goods
  movement request in WMS"; read by Warehouse Management System (WMS).
Data Object "Putaway Location Assignment" — read by "Label and stage
  finished goods for transfer".
Data Object "Inventory Discrepancy Record" — written by "Identify
  discrepancy in inventory record"; read by "Submit correction to WMS".
Data Object "Transfer Note" — written by "Issue transfer note to
  Warehouse"; read by "Close warehouse transfer task and file
  documentation".
Data Store "Lot and Batch Traceability Register" — written by "Update
  lot and batch traceability register".
Data Store "Warehouse Inventory Ledger" — written by "Confirm goods
  receipt and putaway in WMS"; read by "Verify finished goods quantity
  and lot identification".

V05.11 Move Finished Goods to Inventory takes inspected and approved
finished goods from the production floor and physically transfers them
to their designated warehouse storage locations, confirming putaway in
the WMS and reconciling any inventory discrepancies along the way. Lot
and batch traceability records are updated to maintain full genealogy.
The subprocess hands a fully receipted and located inventory position
to Close Production Orders (V05.12), where work orders are financially
settled and the production cycle is formally concluded.
```

### V05.12 — Close Production Orders

**BPMN diagram prompt.**

```text
BPMN: V05.12 Close Production Orders — the final subprocess of the
Plan to Produce value chain, confirming completion, posting costs, and
archiving all production order records.

1. Pools & Lanes

Pool "Manufacturing Organisation" — the internal organisation that runs
the close-out process.
  Lane "Production Planning" — production planner who initiates closure
  and verifies order completion.
  Lane "Finance" — finance controller who posts costs and closes the
  financial period for the order.
Pool "ERP Manufacturing Module" — the ERP system used to update and
archive production orders and cost postings.

2. Pool properties

Pool "Manufacturing Organisation" — white-box, single instance.
Pool "ERP Manufacturing Module" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Manufacturing Organisation (white-box, two lanes top to bottom:
   Production Planning, Finance)
2. ERP Manufacturing Module

4. Lane contents in flow order (Manufacturing Organisation)

Production Planning lane:
  Message start event "Production output recorded — received from
  V05.10 Record Production Output"
  User task "Review production order for completeness"
  Service task "Retrieve open production orders from ERP"
  Exclusive gateway "All operations and confirmations complete?"
  - branch "Yes": proceed to Service task "Trigger order closure in ERP"
  - branch "No": Expanded Subprocess "Repeat Until Order Complete"
    (standard loop) containing, in order: User task "Identify
    outstanding operations or confirmations", User task "Coordinate
    resolution with responsible team", Intermediate message catch event
    "Outstanding items resolved"
    Exclusive merge gateway "Repeat Until Order Complete"
    then proceed to Service task "Trigger order closure in ERP"
  Exclusive merge gateway "All operations and confirmations complete"
  Service task "Trigger order closure in ERP"
  Send task "Notify Finance of order closure and cost data"

Finance lane:
  Intermediate message catch event "Order closure notification received"
  User task "Review actual versus planned production costs"
  Exclusive gateway "Cost variances within tolerance?"
  - branch "Yes": proceed to Service task "Post final cost to ERP"
  - branch "No": User task "Investigate and document cost variances",
    then Service task "Post final cost to ERP"
  Exclusive merge gateway "Cost variances within tolerance"
  Service task "Post final cost to ERP"
  Service task "Mark production order as financially closed in ERP"
  User task "Archive production order documentation"
  End event "Production order fully closed and archived — Plan to
  Produce (V05) complete"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Order Complete" — label "Resolution deadline exceeded (48 hours)" —
flow continues to User task "Escalate unresolved items to plant manager"
followed by a Terminate end event "Order closure escalated — process
halted for manual intervention".

6. Connectors

Sequence flows: work begins in the Production Planning lane with the
message start event, passes through the completeness review and ERP
retrieval tasks, reaches the exclusive gateway; the "No" branch enters
the loop subprocess and rejoins at the merge gateway; the "Yes" branch
and the merge gateway both lead to the ERP closure trigger task and then
the send task notifying Finance. In the Finance lane the intermediate
catch event receives the notification, the cost review task leads to the
variance gateway; the "No" branch runs through variance investigation
before rejoining the merge gateway; both branches reach the cost-posting
service task, then the financial closure task, then documentation
archival, then the end event.

Message flows:
ERP Manufacturing Module → Production Planning lane (open production
order data and operation confirmations retrieved by "Retrieve open
production orders from ERP").
Production Planning lane → ERP Manufacturing Module (closure instruction
sent by "Trigger order closure in ERP").
Production Planning lane → Finance lane (order closure notification and
cost data sent by "Notify Finance of order closure and cost data").
Finance lane → ERP Manufacturing Module (final cost posting submitted by
"Post final cost to ERP").
Finance lane → ERP Manufacturing Module (financial closure status
written by "Mark production order as financially closed in ERP").

7. Data objects

Data Object "Production Order" — read by "Review production order for
completeness"; read by "Retrieve open production orders from ERP".
Data Object "Operations Confirmation Record" — read by "Review
production order for completeness"; read by "Identify outstanding
operations or confirmations".
Data Object "Actual vs Planned Cost Report" — written by "Review actual
versus planned production costs"; read by "Investigate and document cost
variances".
Data Object "Cost Variance Report" — written by "Investigate and
document cost variances"; read by "Post final cost to ERP".
Data Store "ERP Production Order Register" — written by "Trigger order
closure in ERP"; written by "Mark production order as financially closed
in ERP".
Data Store "Financial Ledger" — written by "Post final cost to ERP".
Data Object "Archived Production Order Documentation" — written by
"Archive production order documentation".

Close Production Orders confirms that every manufacturing operation has
been completed and confirmed, reconciles actual costs against plan,
posts final cost entries to the financial ledger, and sets each
production order to a fully closed status in the ERP. With this
subprocess the Plan to Produce value chain reaches its conclusion: all
records are archived, variances are documented, and the organisation
holds a complete, auditable account of the production cycle.
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
BPMN: V06.01 Identify Opportunity — first subprocess of the Idea to
Market value chain, where market signals are gathered and a validated
opportunity is passed to Capture Ideas (V06.02).

1. Pools & Lanes

Pool "Product Organisation" — the internal teams running the opportunity
identification process, with lanes for Strategy and Product Management.
Pool "Customer" — external customers who supply market needs, complaints,
and buying signals.
Pool "Market Research Tools" — IT system used to retrieve market insights
and record opportunity assessments.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Market Research Tools" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Product Organisation
3. Market Research Tools

4. Lane contents in flow order (Product Organisation)

Strategy lane (market researcher):
  Message start event "Market signal received from Customer"
  User task "Gather market intelligence"
  Service task "Retrieve market insights from Market Research Tools"
  User task "Analyse market trends and competitive landscape"
  User task "Identify and describe potential opportunity"
  Exclusive gateway "Opportunity worth pursuing?"
  - branch "No — insufficient signal": End event "Opportunity dismissed —
    no further action"
  - branch "Yes — proceed": User task "Document opportunity statement"
  Exclusive merge gateway "Opportunity worth pursuing?"
  User task "Prioritise opportunity against portfolio"
  Service task "Record opportunity assessment in Market Research Tools"
  Send task "Hand opportunity to Product Management for qualification"

Product Management lane (product manager):
  Intermediate message catch event "Opportunity statement received from
  Strategy"
  User task "Review and qualify opportunity"
  User task "Confirm alignment with product strategy"
  Exclusive gateway "Opportunity qualified?"
  - branch "No — return for revision":
    Expanded Subprocess "Repeat Until Opportunity Qualified" (standard loop)
    containing, in order: User task "Revise opportunity statement",
    User task "Re-qualify opportunity"
  - branch "Yes — proceed": User task "Assign opportunity owner and
    priority"
  Exclusive merge gateway "Opportunity qualified?"
  User task "Prepare opportunity brief"
  End event "Opportunity brief confirmed — ready for Capture Ideas (V06.02)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Opportunity Qualified" — label "Qualification deadline exceeded (5 business
days)" — triggers End event "Opportunity timed out — escalate to Strategy
lead".

6. Connectors

Sequence flows: flow runs Strategy lane top to bottom, then a send task
passes work to Product Management lane via an internal message; Product
Management lane runs to its end event. The "Opportunity worth pursuing?"
gateway splits to a dismissal end event or continues to document the
statement, rejoining at the merge gateway before prioritisation. The
"Opportunity qualified?" gateway splits to the revision loop or continues
to assign ownership, rejoining at the merge gateway before the opportunity
brief is prepared.

Message flows:
Customer → Strategy lane "Gather market intelligence" (market needs,
complaints, buying signals).
Strategy lane "Retrieve market insights from Market Research Tools" →
Market Research Tools (insight query).
Market Research Tools → Strategy lane "Retrieve market insights from
Market Research Tools" (market insights, competitive data).
Strategy lane "Record opportunity assessment in Market Research Tools" →
Market Research Tools (opportunity assessment record).
Strategy lane "Send task: Hand opportunity to Product Management for
qualification" → Product Management lane "Intermediate message catch event:
Opportunity statement received from Strategy" (opportunity statement).

7. Data objects

Data Object "Market Signal" — read by "Gather market intelligence".
Data Object "Market Insights Report" — written by "Retrieve market insights
from Market Research Tools"; read by "Analyse market trends and competitive
landscape".
Data Object "Opportunity Statement" — written by "Document opportunity
statement"; read by "Review and qualify opportunity".
Data Store "Opportunity Assessment Register" — written by "Record
opportunity assessment in Market Research Tools".
Data Object "Opportunity Brief" — written by "Prepare opportunity brief";
read by End event "Opportunity brief confirmed — ready for Capture Ideas
(V06.02)".

V06.01 Identify Opportunity translates raw market signals — customer
needs, competitive pressure, and trend data — into a structured, qualified
opportunity brief. The Strategy team gathers and analyses intelligence,
while Product Management qualifies and prioritises the result. The
confirmed opportunity brief, recorded in the Market Research Tools register,
is handed directly to V06.02 Capture Ideas where it becomes the anchor for
idea submission and collection.
```

### V06.02 — Capture Ideas

**BPMN diagram prompt.**

```text
BPMN: V06.02 Capture Ideas — second subprocess in the Idea to Market
value chain, receiving signals from V06.01 and feeding into V06.03.

1. Pools & Lanes

Pool "Product Organisation" — the organisation running the Capture Ideas
process, with lanes for Innovation and Product Management.
Pool "Customer" — external participant providing ideas and needs.
Pool "Research / Design Partner" — external participant providing concepts,
technical details, and research findings.
Pool "Idea Management Platform" — IT system used to record, store, and
surface ideas.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Research / Design Partner" — black-box, single instance.
Pool "Idea Management Platform" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Research / Design Partner
3. Product Organisation
4. Idea Management Platform

4. Lane contents in flow order (Product Organisation)

Innovation lane (innovation lead):
  Message start event "Opportunity signal received from Identify
  Opportunity (V06.01)"
  User task "Open idea submission campaign"
  Send task "Invite customers and partners to submit ideas"
  Intermediate message catch event "Ideas received from Customer and
  Research / Design Partner"
  User task "Review and categorise incoming ideas"
  Service task "Log ideas in Idea Management Platform"
  User task "Enrich idea records with source and context notes"
  Exclusive gateway "Sufficient ideas captured?"
  - branch "No — submission window still open":
      Expanded Subprocess "Repeat Until Sufficient Ideas Captured"
      (standard loop) containing, in order: User task "Issue reminder
      to participants", Intermediate message catch event "Further ideas
      received", User task "Review and categorise further ideas",
      Service task "Log additional ideas in Idea Management Platform"
  - branch "Yes — threshold met":
      Exclusive merge gateway "Sufficient ideas captured"
  User task "Consolidate idea long-list"

Product Management lane (product owner):
  User task "Screen ideas against strategic opportunity"
  Exclusive gateway "Idea meets initial criteria?"
  - branch "No — below threshold":
      User task "Record rejection rationale"
      End event "Idea rejected — no further action"
  - branch "Yes — meets criteria":
      Exclusive merge gateway "Idea meets initial criteria"
  User task "Prioritise shortlisted ideas"
  Service task "Publish shortlist to Idea Management Platform"
  User task "Assign idea owners and prepare idea briefs"
  End event "Shortlisted ideas handed to Assess Feasibility (V06.03)"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on Expanded Subprocess "Repeat Until
Sufficient Ideas Captured", labelled "Submission window deadline reached",
leading to a User task "Close submission early and proceed with ideas
received" in the Innovation lane, rejoining the flow at "Consolidate idea
long-list".

6. Connectors

Sequence flows: work begins in the Innovation lane with the message start
event, proceeds through campaign opening, invitations, idea receipt, review,
logging, and enrichment, then reaches the "Sufficient ideas captured?"
gateway; the "No" branch enters the standard-loop subprocess before merging
back; the "Yes" branch bypasses it; both rejoin at the exclusive merge
gateway and continue to "Consolidate idea long-list", where control passes
to the Product Management lane for screening, the "No" branch ends in its
own end event, the "Yes" branch merges at the exclusive merge gateway and
continues through prioritisation, publishing, and brief assignment to the
final end event.

Message flows:
Customer → Innovation lane (ideas, needs, and concepts submitted in
response to campaign invitation).
Research / Design Partner → Innovation lane (concepts, technical details,
and research findings submitted in response to campaign invitation).
Innovation lane "Invite customers and partners to submit ideas" →
Customer (campaign invitation).
Innovation lane "Invite customers and partners to submit ideas" →
Research / Design Partner (campaign invitation).
Innovation lane "Service task Log ideas in Idea Management Platform" →
Idea Management Platform (idea records written).
Product Management lane "Service task Publish shortlist to Idea Management
Platform" → Idea Management Platform (shortlisted idea data written).
Idea Management Platform → Product Management lane "Screen ideas against
strategic opportunity" (idea records retrieved for screening).

7. Data objects

Data Object "Idea Submission" — written by User task "Review and categorise
incoming ideas"; read by User task "Enrich idea records with source and
context notes".
Data Object "Idea Long-list" — written by User task "Consolidate idea
long-list"; read by User task "Screen ideas against strategic opportunity".
Data Object "Rejection Record" — written by User task "Record rejection
rationale".
Data Object "Idea Brief" — written by User task "Assign idea owners and
prepare idea briefs"; read by End event "Shortlisted ideas handed to
Assess Feasibility (V06.03)".
Data Store "Idea Management Platform Record" — written by Service task
"Log ideas in Idea Management Platform" and Service task "Publish shortlist
to Idea Management Platform"; read by User task "Screen ideas against
strategic opportunity".

V06.02 Capture Ideas opens a structured submission campaign, collects
concepts and needs from Customers and Research / Design Partners, logs and
enriches every submission in the Idea Management Platform, and screens and
prioritises the results against strategic opportunity. It hands a set of
owner-assigned idea briefs — the shortlisted ideas — to V06.03 Assess
Feasibility, where each idea will be evaluated for technical and commercial
viability.
```

### V06.03 — Assess Feasibility

**BPMN diagram prompt.**

```text
BPMN: V06.03 Assess Feasibility — third subprocess in the Idea to
Market value chain, receiving captured ideas from V06.02 and passing
feasibility-assessed concepts forward to Define Business Case (V06.04).

1. Pools & Lanes

Pool "Product Organisation" — the internal organisation running the
feasibility assessment process, white-box with two lanes.
  Lane "Research and Development" — led by the engineer, responsible for
  technical investigation and feasibility analysis.
  Lane "Product Management" — led by the business analyst, responsible for
  coordinating assessment, collating findings, and deciding whether to
  proceed.
Pool "Research / Design Partner" — external partner providing technical
input, research findings, and specialist knowledge during assessment.
Pool "Collaboration Tools" — IT system supporting shared workspaces,
document exchange, and assessment recording.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Research / Design Partner" — black-box, single instance.
Pool "Collaboration Tools" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Research / Design Partner
2. Product Organisation (white-box; lanes top to bottom: Research and
   Development, Product Management)
3. Collaboration Tools

4. Lane contents in flow order (Product Organisation)

Research and Development lane:
  Message start event "Captured idea set received from Capture Ideas
  (V06.02)"
  User task "Review idea brief and scope assessment"
  Service task "Log assessment scope in Collaboration Tools"
  User task "Conduct technical feasibility investigation"
  Expanded Subprocess "Repeat Until Partner Input Complete" (standard
  loop) containing, in order: Send task "Request technical input from
  Research / Design Partner", Intermediate message catch event "Partner
  findings received", User task "Incorporate partner findings into
  technical assessment"
  User task "Prepare technical feasibility findings"
  Send task "Share technical findings with Product Management"

Product Management lane:
  Intermediate message catch event "Technical findings received"
  User task "Conduct commercial and market feasibility review"
  Service task "Record feasibility assessment in Collaboration Tools"
  Exclusive gateway "Feasibility outcome?"
    - branch "Feasible — proceed": User task "Compile feasibility
      assessment report"
      Exclusive merge gateway "Feasibility outcome"
    - branch "Not feasible — revise idea": User task "Document reasons
      for rejection and recommend revision"
      End event "Idea returned for revision — exits to Capture Ideas
      (V06.02)"
    - branch "Partially feasible — further analysis needed": User task
      "Define additional analysis requirements"
      Exclusive merge gateway "Feasibility outcome"
  Exclusive merge gateway "Feasibility outcome"
  User task "Obtain internal sign-off on feasibility assessment"
  End event "Feasibility confirmed — ready for Define Business Case
  (V06.04)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Partner Input Complete" — label "Partner response overdue (5 business
days)" — flow continues to User task "Escalate partner engagement and
notify Product Management".

6. Connectors

Sequence flows: flow begins in Research and Development with the message
start event, proceeds through review, logging, investigation, and the
partner-input loop subprocess, then moves to preparation and sharing of
findings; in Product Management, flow picks up at the message catch event,
moves through commercial review and recording, reaches the Exclusive gateway
"Feasibility outcome?" whose feasible and partially-feasible branches both
rejoin at Exclusive merge gateway "Feasibility outcome", and whose not-
feasible branch ends at its own End event; merged flow continues to sign-off
and the concluding End event.

Message flows:
Research / Design Partner → Product Organisation, Research and Development
lane (partner technical findings and research input).
Product Organisation, Research and Development lane → Research / Design
Partner (request for technical input and assessment scope).
Product Organisation, Research and Development lane → Collaboration Tools
(assessment scope record written at log task).
Product Organisation, Product Management lane → Collaboration Tools
(feasibility assessment results written at record task).
Collaboration Tools → Product Organisation, Product Management lane
(assessment data retrieved to support review and sign-off).

7. Data objects

Data Object "Captured Idea Brief" — read by User task "Review idea brief
and scope assessment".
Data Object "Assessment Scope" — written by User task "Review idea brief
and scope assessment"; read by Service task "Log assessment scope in
Collaboration Tools".
Data Object "Partner Findings" — read by User task "Incorporate partner
findings into technical assessment"; written by Intermediate message catch
event "Partner findings received".
Data Object "Technical Feasibility Findings" — written by User task
"Prepare technical feasibility findings"; read by User task "Conduct
commercial and market feasibility review".
Data Object "Feasibility Assessment Report" — written by User task "Compile
feasibility assessment report"; read by User task "Obtain internal sign-off
on feasibility assessment".
Data Object "Rejection Record" — written by User task "Document reasons for
rejection and recommend revision".
Data Store "Collaboration Tools Workspace" — written by Service task "Log
assessment scope in Collaboration Tools" and Service task "Record
feasibility assessment in Collaboration Tools"; read by User task "Conduct
commercial and market feasibility review".

V06.03 Assess Feasibility evaluates each captured idea against technical,
commercial, and market criteria, drawing on input from the Research / Design
Partner and recording all findings in the Collaboration Tools workspace. Ideas
judged not feasible are returned with documented reasons; ideas requiring more
work trigger a defined additional-analysis cycle; ideas confirmed as feasible
are signed off internally. The subprocess hands a completed, approved
feasibility assessment report forward to Define Business Case (V06.04),
giving that subprocess the evidence base it needs to construct a rigorous
investment proposal.
```

### V06.04 — Define Business Case

**BPMN diagram prompt.**

```text
BPMN: V06.04 Define Business Case — fourth subprocess in the Idea to
Market value chain, converting a feasibility-cleared opportunity into an
approved business case ready for solution design.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams that define and approve
the business case.
  Lane "Product Management" — product manager who owns and drives the
  business case.
  Lane "Finance" — pricing analyst who models costs, revenue, and pricing.
Pool "Investor" — external investor or funding body whose approval may be
sought.
Pool "Project Portfolio Management System" — IT system that records the
business case and tracks portfolio status.

2. Pool properties

Pool "Product Organisation": white-box, single instance.
Pool "Investor": black-box, single instance.
Pool "Project Portfolio Management System": black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Investor
2. Product Organisation
3. Project Portfolio Management System

4. Lane contents in flow order (Product Organisation)

Product Management lane:
  Message start event "Feasibility assessment received from V06.03"
  User task "Review feasibility assessment and scope business case"
  User task "Define strategic objectives and success metrics"
  Send task "Request financial modelling inputs from Finance"

Finance lane:
  Intermediate message catch event "Financial modelling request received"
  User task "Model costs, revenue streams, and break-even analysis"
  User task "Develop pricing options and margin scenarios"
  Send task "Return financial model to Product Management"

Product Management lane:
  Intermediate message catch event "Financial model received"
  User task "Draft business case document"
  User task "Identify risks, assumptions, and dependencies"
  Expanded Subprocess "Repeat Until Business Case Complete" (standard
    loop) containing, in order: User task "Refine business case with
    Finance inputs", User task "Review and update risk register",
    User task "Validate alignment with strategic objectives"
  Service task "Submit business case to Project Portfolio Management
    System"
  Exclusive gateway "Approval required from Investor?"
    - branch "Yes — investor funding involved": Send task "Send business
      case to Investor for review"
      Intermediate message catch event "Investor decision received"
      Exclusive gateway "Investor approves?"
        - branch "Approved": continue to exclusive merge gateway
          "Investor decision resolved"
        - branch "Not approved": User task "Revise business case to
          address investor concerns"
          continue to exclusive merge gateway "Investor decision resolved"
      Exclusive merge gateway "Investor decision resolved"
      continue to exclusive merge gateway "Approval path rejoined"
    - branch "No — internal approval only": User task "Obtain internal
      governance sign-off"
      continue to exclusive merge gateway "Approval path rejoined"
  Exclusive merge gateway "Approval path rejoined"
  Service task "Record approval decision in Project Portfolio Management
    System"
  Exclusive gateway "Business case approved?"
    - branch "Approved": End event "Business case approved — ready for
      Design Solution (V06.05)"
    - branch "Not approved — rework required": User task "Document
      rejection rationale and required changes"
      End event "Business case rejected — returned for revision"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on Expanded Subprocess "Repeat
Until Business Case Complete", labelled "Review cycle exceeds 10 business
days", triggers escalation task "Escalate delay to product manager".

6. Connectors

Sequence flows: flow runs top to bottom within Product Management,
crossing to Finance when financial modelling is requested, then returning
to Product Management on receipt of the financial model. The Expanded
Subprocess completes before the business case is submitted to the system.
The "Approval required from Investor?" gateway splits into two branches —
the investor branch sends to Investor pool, waits for reply, then tests
the investor decision at a nested gateway before both outcomes rejoin at
"Investor decision resolved", which continues to "Approval path rejoined";
the internal branch obtains sign-off and flows directly to "Approval path
rejoined". From there, the approval decision is recorded and the "Business
case approved?" gateway branches to one of two end events.

Message flows:
Product Management "Request financial modelling inputs from Finance" →
  Finance lane (financial modelling request).
Finance "Return financial model to Product Management" → Product
  Management lane (financial model).
Product Management "Send business case to Investor for review" → Investor
  (business case document).
Investor → Product Management "Investor decision received" (approval
  decision or conditions).
Product Management "Submit business case to Project Portfolio Management
  System" → Project Portfolio Management System (business case record).
Product Management "Record approval decision in Project Portfolio
  Management System" → Project Portfolio Management System (approval
  status update).
Project Portfolio Management System → Product Management (portfolio
  status and prior project data — background read at case submission).

7. Data objects

Data Object "Feasibility Assessment" — read by User task "Review
feasibility assessment and scope business case".
Data Object "Business Case Document" — written by User task "Draft
business case document"; read by Send task "Send business case to
Investor for review"; read by Service task "Submit business case to
Project Portfolio Management System".
Data Object "Financial Model" — written by User task "Model costs,
revenue streams, and break-even analysis"; read by User task "Draft
business case document".
Data Object "Pricing Options" — written by User task "Develop pricing
options and margin scenarios"; read by User task "Refine business case
with Finance inputs".
Data Object "Risk Register" — written by User task "Identify risks,
assumptions, and dependencies"; updated by User task "Review and update
risk register".
Data Store "Project Portfolio Management System Record" — written by
Service task "Submit business case to Project Portfolio Management System"
and by Service task "Record approval decision in Project Portfolio
Management System".

Define Business Case takes the feasibility-cleared opportunity, builds a
fully costed and risk-assessed business case with pricing options, seeks
investor or internal governance approval, and records the outcome in the
Project Portfolio Management System. A formally approved business case is
then handed to V06.05 Design Solution so that detailed solution design
can begin on a financially and strategically validated foundation.
```

### V06.05 — Design Solution

**BPMN diagram prompt.**

```text
BPMN: V06.05 Design Solution — the fifth subprocess of the Idea to
Market value chain, in which the approved business case is translated
into a detailed solution design ready for prototype development.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams that execute the
design process.
  Lane "Research and Development" — designer leads solution design
  and coordinates with the external design partner.
  Lane "Engineering" — engineer reviews technical feasibility and
  validates the emerging design.
Pool "Research / Design Partner" — external party providing design
input, co-design support, and specialist expertise.
Pool "Design / Prototyping Tools" — IT system used to create,
store, and share design artefacts.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Research / Design Partner" — black-box, single instance.
Pool "Design / Prototyping Tools" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Research / Design Partner
2. Product Organisation (lanes: Research and Development, then
   Engineering)
3. Design / Prototyping Tools

4. Lane contents in flow order (Product Organisation)

Research and Development lane:
  Message start event "Approved business case received from
  Define Business Case (V06.04)"
  User task "Review approved business case and design brief"
  Send task "Issue design brief to Research / Design Partner"
  Intermediate message catch event "Design Partner concepts
  received"
  User task "Consolidate design concepts into solution options"
  User task "Facilitate solution design workshops"
  Expanded Subprocess "Repeat Until Design Agreed" (standard loop)
  containing, in order: User task "Refine solution design",
  Service task "Upload revised design to Design / Prototyping
  Tools", Send task "Share updated design with Engineering for
  review", Intermediate message catch event "Engineering review
  response received", User task "Incorporate engineering
  feedback into design"
  User task "Finalise solution design documentation"
  Service task "Record finalised design in Design / Prototyping
  Tools"
  User task "Conduct intellectual property and compliance check"
  Exclusive gateway "IP and compliance check passed?"
  - branch "Yes": continue to end event
  - branch "No": User task "Resolve IP or compliance issues",
    then rejoin
  Exclusive merge gateway "IP and compliance check passed"
  End event "Solution design approved — ready for Develop
  Prototype (V06.06)"

Engineering lane:
  User task "Assess technical feasibility of solution options"
  Service task "Retrieve design artefacts from Design /
  Prototyping Tools"
  User task "Produce engineering feasibility assessment"
  Send task "Return engineering review to Research and
  Development"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat
Until Design Agreed" — label "Design iteration deadline reached"
— triggers End event "Design process escalated — iteration
limit exceeded" without rejoining the main flow.

6. Connectors

Sequence flows: within the Research and Development lane the flow
runs start event → Review business case → Send brief →
intermediate catch (concepts received) → Consolidate concepts →
Facilitate workshops → Repeat Until Design Agreed subprocess →
Finalise documentation → Record in tools → IP and compliance
check → exclusive gateway, with the "No" branch routing to
Resolve issues and rejoining at the exclusive merge gateway,
and the "Yes" branch passing directly to the merge gateway →
end event. Within the Engineering lane the flow runs Assess
feasibility → Retrieve artefacts → Produce assessment → Return
review, triggered after the design brief is sent.

Message flows:
Research and Development (Send task "Issue design brief") →
Research / Design Partner (design brief)
Research / Design Partner → Research and Development
(Intermediate message catch event "Design Partner concepts
received") (design concepts and specialist input)
Research and Development (Send task "Share updated design with
Engineering for review") → Engineering lane (updated design
artefact)
Engineering (Send task "Return engineering review") → Research
and Development (Intermediate message catch event "Engineering
review response received") (feasibility assessment)
Service task "Upload revised design to Design / Prototyping
Tools" → Design / Prototyping Tools (revised design artefact)
Service task "Retrieve design artefacts from Design /
Prototyping Tools" ← Design / Prototyping Tools (current
design artefacts)
Service task "Record finalised design in Design / Prototyping
Tools" → Design / Prototyping Tools (finalised solution design
record)

7. Data objects

Data Object "Approved Business Case" — read by User task "Review
approved business case and design brief".
Data Object "Design Brief" — written by User task "Review
approved business case and design brief"; read by Send task
"Issue design brief to Research / Design Partner".
Data Object "Design Partner Concepts" — read by User task
"Consolidate design concepts into solution options".
Data Object "Engineering Feasibility Assessment" — written by
User task "Produce engineering feasibility assessment"; read by
User task "Incorporate engineering feedback into design".
Data Object "Solution Design Documentation" — written by User
task "Finalise solution design documentation"; read by Service
task "Record finalised design in Design / Prototyping Tools".
Data Object "IP and Compliance Check Record" — written by User
task "Conduct intellectual property and compliance check".
Data Store "Design / Prototyping Tools Repository" — written by
Service task "Upload revised design to Design / Prototyping
Tools" and Service task "Record finalised design in Design /
Prototyping Tools"; read by Service task "Retrieve design
artefacts from Design / Prototyping Tools".

V06.05 Design Solution takes the approved business case from V06.04
and works it into a fully specified, technically validated solution
design. The Research and Development designer drives iterative design
workshops with the external Research / Design Partner while
Engineering stress-tests each iteration for technical feasibility.
Once all parties agree and an intellectual property and compliance
check is passed, the finalised design is recorded in the Design /
Prototyping Tools repository and handed to V06.06 Develop Prototype
as the authoritative specification for building the prototype.
```

### V06.06 — Develop Prototype

**BPMN diagram prompt.**

```text
BPMN: V06.06 Develop Prototype — the subprocess in which Engineering and
Research and Development build a working prototype from the approved solution
design, coordinating with Research / Design Partner, and recording all
artefacts in the Product Lifecycle Management System before handing off to
Test with Users (V06.07).

1. Pools & Lanes

Pool "Product Organisation" — the internal teams that plan, build, and
  review the prototype.
  Lanes (top to bottom):
  - Research and Development (designer)
  - Engineering (engineer)

Pool "Research / Design Partner" — external partner supplying specialist
  components, materials, or technical input during prototype build.

Pool "Product Lifecycle Management System" — PLM system that stores design
  specifications, prototype records, and build artefacts.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Research / Design Partner" — black-box, single instance.
Pool "Product Lifecycle Management System" — black-box, System = true,
  single instance.

3. Layout

Top to bottom:
1. Research / Design Partner
2. Product Organisation (white-box; lanes: Research and Development top,
   Engineering below)
3. Product Lifecycle Management System

4. Lane contents in flow order (Product Organisation)

Research and Development lane:
  Message start event "Approved solution design received from Design
    Solution (V06.05)"
  User task "Review solution design and confirm prototype scope"
  Service task "Retrieve design specifications from PLM System"
  User task "Define prototype build plan and assign responsibilities"
  Send task "Issue build brief to Research / Design Partner"
  Intermediate message catch event "Partner input received"
  User task "Integrate partner input into prototype specification"
  Exclusive gateway "Specification complete?"
  - branch "No — gaps remain": Expanded Subprocess "Repeat Until
      Specification Agreed" (standard loop) containing, in order:
      User task "Identify specification gaps",
      Send task "Request clarification from Research / Design Partner",
      Intermediate message catch event "Clarification received",
      User task "Update specification"
  - branch "Yes": continue to Exclusive merge gateway
      "Specification complete"
  Exclusive merge gateway "Specification complete"
  User task "Hand specification to Engineering for build"

Engineering lane:
  User task "Plan prototype build schedule and resource allocation"
  User task "Develop prototype components"
  Exclusive gateway "Build issue encountered?"
  - branch "Yes — issue found": Expanded Subprocess "Repeat Until Build
      Issue Resolved" (standard loop) containing, in order:
      User task "Log and analyse build issue",
      User task "Rework or redesign affected component",
      User task "Re-test component"
  - branch "No": continue to Exclusive merge gateway "Build issue
      encountered"
  Exclusive merge gateway "Build issue encountered"
  User task "Assemble prototype"
  User task "Conduct internal engineering review"
  Exclusive gateway "Prototype meets build criteria?"
  - branch "No — rework needed": Expanded Subprocess "Repeat Until
      Prototype Accepted" (standard loop) containing, in order:
      User task "Document rework requirements",
      User task "Rework prototype",
      User task "Re-run engineering review"
  - branch "Yes": continue to Exclusive merge gateway "Prototype meets
      build criteria"
  Exclusive merge gateway "Prototype meets build criteria"
  Service task "Record completed prototype in PLM System"
  Send task "Notify Research and Development of completed prototype"

Research and Development lane (continued):
  Intermediate message catch event "Prototype completion notified"
  User task "Conduct design quality review of prototype"
  Exclusive gateway "Design quality accepted?"
  - branch "No — quality issues": User task "Raise quality findings and
      return to Engineering" — ends at an intermediate message throw
      event "Quality findings sent to Engineering"; Engineering receives
      these via an intermediate message catch event "Quality findings
      received" and re-enters the rework subprocess above; on
      completion Engineering re-notifies Research and Development, which
      loops back to design quality review via Expanded Subprocess
      "Repeat Until Design Quality Accepted" (standard loop) containing,
      in order:
      User task "Review quality findings",
      Send task "Send quality findings to Engineering",
      Intermediate message catch event "Rework complete notification
        received",
      User task "Re-inspect prototype"
  - branch "Yes — quality confirmed": continue to Exclusive merge
      gateway "Design quality accepted"
  Exclusive merge gateway "Design quality accepted"
  Service task "Update prototype record with quality sign-off in PLM
    System"
  User task "Prepare prototype handover documentation"
  End event "Prototype complete and documented — ready for Test with
    Users (V06.07)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Specification Agreed" — label "Specification deadline exceeded (5 days)"
  — on trigger, flow moves to User task "Escalate specification delay to
  innovation lead" then to an Error end event "Specification escalated".

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Prototype Accepted" — label "Rework deadline exceeded (10 days)" — on
  trigger, flow moves to User task "Escalate prototype build failure to
  product manager" then to an Error end event "Build escalated".

6. Connectors

Sequence flows: work begins in Research and Development, transfers to
Engineering when the specification is handed over, and returns to Research
and Development for design quality review after the prototype is assembled.
The "Specification complete?" gateway branches to the rework subprocess or
merges at "Specification complete" before handover. The "Build issue
encountered?" gateway branches to the issue-resolution subprocess or
merges at "Build issue encountered" before assembly. The "Prototype meets
build criteria?" gateway branches to the rework subprocess or merges at
"Prototype meets build criteria" before PLM recording. The "Design quality
accepted?" gateway branches to the quality-rework subprocess or merges at
"Design quality accepted" before final PLM update and end.

Message flows:
Product Organisation (Send task "Issue build brief to Research / Design
  Partner") → Research / Design Partner (build brief).
Research / Design Partner → Product Organisation (Intermediate message
  catch event "Partner input received") (partner technical input and
  components).
Product Organisation (Send task "Request clarification from Research /
  Design Partner") → Research / Design Partner (clarification request).
Research / Design Partner → Product Organisation (Intermediate message
  catch event "Clarification received") (clarification response).
Product Organisation (Service task "Retrieve design specifications from
  PLM System") → Product Lifecycle Management System (design
  specification retrieval request).
Product Lifecycle Management System → Product Organisation (Service task
  "Retrieve design specifications from PLM System") (design
  specifications).
Product Organisation (Service task "Record completed prototype in PLM
  System") → Product Lifecycle Management System (completed prototype
  record).
Product Organisation (Service task "Update prototype record with quality
  sign-off in PLM System") → Product Lifecycle Management System
  (quality sign-off update).

7. Data objects

Data Object "Solution Design Package" — read by User task "Review solution
  design and confirm prototype scope"; read by Service task "Retrieve
  design specifications from PLM System".
Data Object "Build Brief" — written by User task "Define prototype build
  plan and assign responsibilities"; read by Send task "Issue build brief
  to Research / Design Partner".
Data Object "Prototype Specification" — written by User task "Integrate
  partner input into prototype specification"; read by User task "Hand
  specification to Engineering for build".
Data Object "Build Schedule" — written by User task "Plan prototype build
  schedule and resource allocation"; read by User task "Develop prototype
  components".
Data Object "Build Issue Log" — written by User task "Log and analyse
  build issue"; read by User task "Rework or redesign affected component".
Data Object "Prototype Assembly" — written by User task "Assemble
  prototype"; read by User task "Conduct internal engineering review".
Data Object "Quality Findings Report" — written by User task "Conduct
  design quality review of prototype"; read by User task "Review quality
  findings".
Data Store "Product Lifecycle Management System Record" — written by
  Service task "Record completed prototype in PLM System"; written by
  Service task "Update prototype record with quality sign-off in PLM
  System"; read by Service task "Retrieve design specifications from PLM
  System".
Data Object "Prototype Handover Documentation" — written by User task
  "Prepare prototype handover documentation".

V06.06 Develop Prototype takes the approved solution design from V06.05
and produces a fully built, internally reviewed, and quality-signed-off
prototype recorded in the Product Lifecycle Management System. Engineering
leads the physical or digital build, resolving issues iteratively, while
Research and Development maintains design integrity through quality review.
The completed prototype and its handover documentation are passed to
V06.07 Test with Users, where Beta Users will validate the prototype
against real user needs.
```

### V06.07 — Test with Users

**BPMN diagram prompt.**

```text
BPMN: V06.07 Test with Users — the user-testing subprocess within the
Idea to Market value chain, sitting between Develop Prototype (V06.06)
and Validate Commercial Model (V06.08).

1. Pools & Lanes

Pool "Product Organisation" — the internal teams running the testing
process, with lanes for Customer Experience and Product Management.
Pool "Beta User" — external users who participate in prototype testing
and provide feedback.
Pool "Requirements Management Tools" — the IT system used to record
test plans, results, and updated requirements.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Beta User" — black-box, single instance.
Pool "Requirements Management Tools" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Beta User
2. Product Organisation
3. Requirements Management Tools

4. Lane contents in flow order (Product Organisation)

Customer Experience lane (business analyst):
  Message start event "Prototype received from Develop Prototype
  (V06.06)"
  User task "Define test objectives and acceptance criteria"
  Service task "Log test plan in Requirements Management Tools"
  Send task "Issue trial invitations to Beta Users"
  Intermediate message catch event "Beta User confirms participation"
  User task "Prepare test environment and materials"
  User task "Facilitate user testing sessions"
  User task "Collect and consolidate feedback"
  User task "Analyse test results against acceptance criteria"
  Exclusive gateway "Acceptance criteria met?"
  - branch "Yes": Exclusive merge gateway "Acceptance criteria met"
  - branch "No": Expanded Subprocess "Repeat Until Criteria Met"
    (standard loop) containing, in order: User task "Identify gaps
    and improvement areas", Send task "Communicate issues to Product
    Management", Intermediate message catch event "Revised prototype
    received", User task "Re-run affected test sessions", User task
    "Collect and consolidate updated feedback", User task "Re-analyse
    results against acceptance criteria"
  Exclusive merge gateway "Acceptance criteria met"
  User task "Compile test summary report"
  Service task "Record final test results in Requirements Management
  Tools"

Product Management lane (product owner):
  User task "Review test summary report"
  User task "Update requirements and product backlog"
  Service task "Store updated requirements in Requirements Management
  Tools"
  End event "Test results accepted — ready for Validate Commercial
  Model (V06.08)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Criteria Met" — label "Maximum iteration period elapsed" — triggers
an escalation end event "Escalate unresolved test failures to Product
Management for decision".

6. Connectors

Sequence flows: flow runs top to bottom within the Customer Experience
lane from the message start event through test planning, invitation,
session facilitation, feedback collection, and analysis to the
exclusive gateway; the "No" branch enters the standard-loop subprocess
and rejoins at the exclusive merge gateway; the "Yes" branch goes
directly to the exclusive merge gateway; flow then continues to
reporting tasks in Customer Experience and crosses to the Product
Management lane for review, requirements update, and the end event.

Message flows:
Beta User → Product Organisation / Customer Experience lane (trial
participation confirmation and session feedback).
Product Organisation / Customer Experience lane → Beta User (trial
invitations and test session materials).
Product Organisation / Customer Experience lane → Requirements
Management Tools (test plan submission and final test result record).
Product Organisation / Product Management lane → Requirements
Management Tools (updated requirements and product backlog stored).
Requirements Management Tools → Product Organisation / Customer
Experience lane (confirmation of test plan and results logged).

7. Data objects

Data Object "Test Plan" — written by User task "Define test objectives
and acceptance criteria"; read by Service task "Log test plan in
Requirements Management Tools".
Data Object "Trial Invitation" — written by Send task "Issue trial
invitations to Beta Users"; read by Beta User pool.
Data Object "User Feedback" — written by User task "Collect and
consolidate feedback"; read by User task "Analyse test results against
acceptance criteria".
Data Object "Test Summary Report" — written by User task "Compile test
summary report"; read by User task "Review test summary report".
Data Store "Requirements Management Tools Repository" — written by
Service task "Store updated requirements in Requirements Management
Tools"; read by Product Management lane during requirements review.

V06.07 Test with Users systematically validates the prototype developed
in V06.06 by recruiting Beta Users, running structured test sessions,
collecting feedback, and iterating until acceptance criteria are met.
The subprocess produces a finalised test summary report and an updated
product backlog, which are handed to V06.08 Validate Commercial Model
as the evidence base for assessing pricing assumptions and commercial
viability.
```

### V06.08 — Validate Commercial Model

**BPMN diagram prompt.**

```text
BPMN: V06.08 Validate Commercial Model — subprocess within the Idea to
Market value chain in which Finance and Sales test pricing, revenue
assumptions, and commercial terms against real customer and investor
signals before the product is cleared for launch preparation.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams executing the commercial
validation process, with lanes for Finance and Sales.
Pool "Customer" — external customers providing buying signals, willingness-
to-pay data, and commercial feedback.
Pool "Investor" — external investors providing funding signals, financial
scrutiny, and commercial model feedback.
Pool "CRM" — IT system that stores customer and prospect interaction data,
pricing responses, and commercial validation records.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Investor" — black-box, single instance.
Pool "CRM" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Investor
3. Product Organisation
4. CRM

4. Lane contents in flow order (Product Organisation)

Finance lane (pricing analyst):
  Message start event "Validated commercial model inputs received from
  Define Business Case (V06.04)"
  User task "Review business case assumptions and pricing parameters"
  Service task "Retrieve customer and prospect data from CRM"
  User task "Develop pricing scenarios and commercial model variants"
  Send task "Send commercial model and pricing scenarios to Investor for
  review"
  Intermediate message catch event "Investor financial feedback received"
  User task "Incorporate investor feedback into commercial model"
  Send task "Send pricing and commercial terms to Customer for response"
  Intermediate message catch event "Customer buying signal and willingness-
  to-pay data received"
  Expanded Subprocess "Repeat Until Pricing Model Validated" (standard
  loop) containing, in order: User task "Analyse customer and investor
  feedback", User task "Revise pricing scenarios and commercial terms",
  Service task "Update pricing model records in CRM", User task "Review
  revised model against commercial viability thresholds"
  Exclusive gateway "Commercial model viable?"
  - branch "Yes — model viable": continue to Sales lane
  - branch "No — not viable": End event "Commercial model not viable —
    escalate to Product Management for redesign" (does not rejoin)
  Exclusive merge gateway "Commercial model viable"
  User task "Finalise validated commercial model and document assumptions"
  Service task "Record finalised commercial model in CRM"

Sales lane (product manager):
  User task "Review validated pricing and commercial terms"
  User task "Assess sales channel fit and distributor viability"
  User task "Confirm sales approach and revenue forecast"
  Send task "Confirm commercial validation outcome to Finance"
  End event "Commercial model validated — ready for Prepare Launch
  (V06.09)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Pricing Model Validated" — label "Validation deadline exceeded" — triggers
End event "Validation timed out — escalate to product manager".

6. Connectors

Sequence flows: work begins in the Finance lane with the start event and
proceeds through assumption review, CRM data retrieval, pricing scenario
development, and investor engagement before entering the Customer
feedback loop; the standard loop subprocess repeats until pricing is
validated; the exclusive gateway branches to the Sales lane on "Yes —
model viable" or to a terminal end event on "No — not viable"; in the
Sales lane flow continues through channel assessment, revenue forecast
confirmation, and a send task back to Finance before reaching the end
event.

Message flows:
Finance lane "Send commercial model and pricing scenarios to Investor
for review" → Investor (commercial model and pricing scenarios).
Investor → Finance lane Intermediate message catch event "Investor
financial feedback received" (financial scrutiny and funding signals).
Finance lane "Send pricing and commercial terms to Customer for response"
→ Customer (pricing and commercial terms for response).
Customer → Finance lane Intermediate message catch event "Customer buying
signal and willingness-to-pay data received" (buying signals and
willingness-to-pay data).
Finance lane "Retrieve customer and prospect data from CRM" → CRM
(data retrieval request).
CRM → Finance lane "Retrieve customer and prospect data from CRM"
(customer and prospect interaction data).
Finance lane "Update pricing model records in CRM" → CRM (revised
pricing model records).
Finance lane "Record finalised commercial model in CRM" → CRM
(finalised commercial model and validated assumptions).

7. Data objects

Data Object "Pricing Scenarios" — written by "Develop pricing scenarios
and commercial model variants"; read by "Send commercial model and pricing
scenarios to Investor for review"; read by "Send pricing and commercial
terms to Customer for response".
Data Object "Investor Feedback" — written by Intermediate message catch
event "Investor financial feedback received"; read by "Incorporate investor
feedback into commercial model".
Data Object "Customer Buying Signal Data" — written by Intermediate
message catch event "Customer buying signal and willingness-to-pay data
received"; read by "Analyse customer and investor feedback".
Data Object "Validated Commercial Model" — written by "Finalise validated
commercial model and document assumptions"; read by "Review validated
pricing and commercial terms".
Data Object "Revenue Forecast" — written by "Confirm sales approach and
revenue forecast"; read by "Confirm commercial validation outcome to
Finance".
Data Store "CRM" — read by "Retrieve customer and prospect data from CRM";
written by "Update pricing model records in CRM"; written by "Record
finalised commercial model in CRM".

V06.08 Validate Commercial Model puts pricing scenarios and commercial
terms in front of real customers and investors, cycling through revisions
until buying signals and financial scrutiny confirm the model is viable.
Finance governs the pricing analysis and investor dialogue while Sales
assesses channel fit and locks in the revenue forecast. The subprocess
hands a fully validated commercial model and documented assumptions to
V06.09 Prepare Launch, where Marketing and Legal take the product through
regulatory clearance and launch-readiness checks.
```

### V06.09 — Prepare Launch

**BPMN diagram prompt.**

```text
BPMN: V06.09 Prepare Launch — the subprocess in which Marketing and
Legal/Compliance ready all materials, approvals, and plans needed before
the product is released to market.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams executing the launch
preparation process.
  Lanes (top to bottom):
  - Marketing (launch manager)
  - Legal / Compliance (compliance adviser)

Pool "Regulator" — the external authority that reviews and approves
regulatory submissions before launch.

Pool "Document Management" — the document management system that stores
and version-controls all launch artefacts.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Regulator" — black-box, single instance.
Pool "Document Management" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Regulator
2. Product Organisation (Marketing lane above Legal / Compliance lane)
3. Document Management

4. Lane contents in flow order (Product Organisation)

Marketing lane:
  Message start event "Validated commercial model received from V06.08"
  User task "Develop launch plan"
  User task "Create marketing and campaign assets"
  Service task "Upload draft assets to Document Management"
  Parallel gateway "Prepare compliance and pricing submissions in parallel"
    - branch "Regulatory submission": Send task "Submit regulatory
      filing to Regulator"
    - branch "Internal approval": User task "Assemble internal launch
      readiness pack"
  Parallel merge gateway "Prepare compliance and pricing submissions
    in parallel"
  User task "Consolidate launch readiness checklist"
  Exclusive gateway "Launch readiness checklist passed?"
    - branch "Yes": User task "Finalise and publish launch plan"
    - branch "No": Expanded Subprocess "Repeat Until Launch Readiness
      Confirmed" (standard loop) containing, in order: User task
      "Identify and remediate checklist gaps", User task "Update
      launch readiness checklist"
  Exclusive merge gateway "Launch readiness checklist passed"
  User task "Finalise and publish launch plan"
  Service task "Store approved launch plan in Document Management"
  End event "Launch preparation complete — ready for Release to
    Market (V06.10)"

Legal / Compliance lane:
  User task "Review product against regulatory compliance procedure"
  User task "Advise on intellectual property and privacy policy
    requirements"
  Intermediate message catch event "Regulatory decision received
    from Regulator"
  User task "Record regulatory outcome and update compliance status"
  User task "Sign off compliance clearance"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat
Until Launch Readiness Confirmed", label "Readiness deadline
exceeded" — triggers an error end event "Launch preparation
escalated — deadline breach".

Interrupting timer boundary event on Send task "Submit regulatory
filing to Regulator", label "Regulatory response overdue" —
triggers escalation to Legal / Compliance lane via intermediate
escalation throw event "Regulatory delay escalated".

6. Connectors

Sequence flows: Flow begins in the Marketing lane at the message
start event and proceeds through launch plan development and asset
creation before a service task uploads to Document Management. A
parallel gateway splits into the regulatory submission branch
(Marketing sends to Regulator; Legal / Compliance awaits the
response via an intermediate message catch event, records the
outcome, and signs off compliance clearance) and the internal
approval branch (Marketing assembles the launch readiness pack).
Both branches rejoin at the parallel merge gateway. Marketing then
consolidates the launch readiness checklist; an exclusive gateway
tests whether it has passed. If not, the loop subprocess runs until
the checklist passes, subject to a timer boundary event that
triggers escalation on deadline breach. When passed, Marketing
finalises and publishes the launch plan, stores it in Document
Management, and the process ends.

Message flows:
  Marketing lane (Send task "Submit regulatory filing to Regulator")
    → Regulator (regulatory filing for review)
  Regulator → Legal / Compliance lane (Intermediate message catch
    event "Regulatory decision received from Regulator")
    (regulatory decision / approval notice)
  Marketing lane (Service task "Upload draft assets to Document
    Management") → Document Management (draft campaign assets and
    launch materials)
  Marketing lane (Service task "Store approved launch plan in
    Document Management") → Document Management (approved launch
    plan and readiness checklist)

7. Data objects

Data Object "Launch Plan" — written by "Develop launch plan";
  read by "Consolidate launch readiness checklist"; written by
  "Finalise and publish launch plan".
Data Object "Campaign Assets" — written by "Create marketing and
  campaign assets"; read by "Upload draft assets to Document
  Management".
Data Object "Regulatory Filing" — written by "Submit regulatory
  filing to Regulator"; read by "Record regulatory outcome and
  update compliance status".
Data Object "Compliance Clearance Record" — written by "Sign off
  compliance clearance"; read by "Consolidate launch readiness
  checklist".
Data Object "Launch Readiness Checklist" — written by "Consolidate
  launch readiness checklist"; read by "Identify and remediate
  checklist gaps"; written by "Update launch readiness checklist".
Data Store "Document Management Repository" — written by "Upload
  draft assets to Document Management"; written by "Store approved
  launch plan in Document Management".

V06.09 Prepare Launch coordinates Marketing and Legal / Compliance
to build a complete, approved launch package — campaign assets,
regulatory clearances, intellectual property sign-off, and a
passed launch readiness checklist — before any customer-facing
activity begins. On completion it hands a published launch plan
and full compliance clearance to V06.10 Release to Market, enabling
the product to go live with confidence.
```

### V06.10 — Release to Market

**BPMN diagram prompt.**

```text
BPMN: V06.10 Release to Market — the subprocess within the Idea to Market
value chain that executes go-live activities, delivers the product or service
to Customers, and hands adoption monitoring to V06.11.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams executing the release.
  Lane "Marketing" (launch manager)
  Lane "Sales" (product manager)
Pool "Customer" — external party receiving launch communications and purchasing.
Pool "Marketing Automation" — IT system orchestrating campaign delivery and
  tracking.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Marketing Automation" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Product Organisation
3. Marketing Automation

4. Lane contents in flow order (Product Organisation)

Marketing lane:
  Message start event "Launch-ready package received from Prepare
    Launch (V06.09)"
  User task "Confirm launch readiness checklist"
  Exclusive gateway "Readiness confirmed?"
  - branch "No — gaps identified": User task "Resolve outstanding
      launch items"
    Exclusive merge gateway "Readiness confirmed?"
  - branch "Yes": continue to next task
  Service task "Activate campaign assets in Marketing Automation"
  Send task "Distribute launch communications to Customers"
  Intermediate message catch event "Customer engagement signals received"
  User task "Review campaign performance data"
  Exclusive gateway "Campaign on track?"
  - branch "No — underperforming": User task "Adjust campaign
      parameters"
    Send task "Re-issue updated communications to Customers"
    Exclusive merge gateway "Campaign on track?"
  - branch "Yes": continue to next task
  Exclusive merge gateway "Campaign on track?"
  User task "Confirm market release is complete"

Sales lane:
  User task "Brief sales team on product availability and pricing"
  User task "Enable sales channels and distribution access"
  Intermediate message catch event "First customer orders received"
  User task "Record sales activity in CRM"
  User task "Confirm channel readiness with Sales management"
  End event "Market release confirmed — ready for Monitor Adoption
    (V06.11)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on User task "Resolve outstanding launch
  items" — label "Resolution deadline exceeded (48 h)" — triggers escalation
  end event "Launch readiness escalated to governance".
Non-interrupting timer boundary event on Intermediate message catch event
  "Customer engagement signals received" — label "Engagement window elapsed
  (72 h)" — triggers User task "Escalate low engagement to Marketing manager".

6. Connectors

Sequence flows: flow begins in the Marketing lane with the message start
event, passes through the readiness gateway (looping until gaps are resolved
via the merge gateway), then activates campaign assets, sends launch
communications, waits for engagement signals, and reviews performance through
the campaign-on-track gateway (looping through adjustment and re-issue until
on track, rejoining at the merge gateway), before passing to the Sales lane
where the sales team is briefed, channels are enabled, first orders are
awaited, sales activity is recorded, and the end event closes the subprocess.

Message flows:
Customer → Marketing lane (Customer engagement signals received — open rates,
  click-throughs, enquiries).
Customer → Sales lane (First customer orders received — order records).
Marketing lane → Customer (Launch communications — product announcements,
  campaign materials).
Marketing lane → Marketing Automation (Campaign assets and parameters
  submitted for activation).
Marketing Automation → Marketing lane (Campaign performance data returned —
  delivery metrics, engagement statistics).
Marketing lane → Marketing Automation (Adjusted campaign parameters
  re-submitted after underperformance review).
Sales lane → Marketing Automation (Sales channel activation confirmation).

7. Data objects

Data Object "Launch Readiness Checklist" — read by / written by "Confirm
  launch readiness checklist"; read by "Resolve outstanding launch items".
Data Object "Campaign Assets Package" — read by "Activate campaign assets in
  Marketing Automation"; written by "Confirm launch readiness checklist".
Data Object "Launch Communications" — written by "Distribute launch
  communications to Customers"; read by "Re-issue updated communications to
  Customers".
Data Object "Campaign Performance Report" — written by "Review campaign
  performance data"; read by "Adjust campaign parameters".
Data Object "Sales Enablement Brief" — written by "Brief sales team on product
  availability and pricing"; read by "Enable sales channels and distribution
  access".
Data Store "CRM" — written by "Record sales activity in CRM".

V06.10 Release to Market executes the coordinated go-live by confirming launch
readiness, activating campaign assets through Marketing Automation, distributing
launch communications to Customers, and tracking early engagement and order
signals through both Marketing and Sales lanes. Any readiness gaps or
underperforming campaign elements are resolved before the release is declared
complete. The subprocess hands a confirmed market-live status and initial sales
activity records to V06.11 Monitor Adoption.
```

### V06.11 — Monitor Adoption

**BPMN diagram prompt.**

```text
BPMN: V06.11 Monitor Adoption — the eleventh subprocess of the Idea to
Market value chain, tracking live product performance and customer
adoption after release to market.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams running the monitoring
process, with lanes for Customer Experience and Product Management.
Pool "Customer" — external customers whose usage data and feedback are
captured.
Pool "Analytics / BI" — the analytics and business intelligence system
that stores and surfaces performance metrics.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Customer" — black-box, single instance.
Pool "Analytics / BI" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Customer
2. Product Organisation
3. Analytics / BI

4. Lane contents in flow order (Product Organisation)

Customer Experience lane (market researcher):

Message start event "Adoption monitoring triggered — product released
from V06.10"
User task "Define adoption metrics and KPIs"
Service task "Configure data collection in Analytics / BI"
Intermediate message catch event "Usage data and feedback received
from Customer"
User task "Aggregate and cleanse adoption data"
Service task "Retrieve performance report from Analytics / BI"
User task "Analyse adoption trends and identify issues"
Exclusive gateway "Adoption performance acceptable?"
  - branch "Yes — on track": proceed to Intermediate message catch
    event "Next monitoring cycle due" (timer), then loop back via
    Expanded Subprocess below
  - branch "No — below threshold": User task "Document adoption
    shortfalls and root causes", then pass to Product Management lane

Expanded Subprocess "Repeat Until Metrics Threshold Met" (standard
loop) containing, in order: User task "Re-collect updated usage data",
Service task "Retrieve refreshed report from Analytics / BI", User task
"Re-analyse adoption trends"

Exclusive merge gateway "Adoption performance acceptable?"

Product Management lane (product manager):

User task "Review adoption shortfall report"
User task "Prioritise corrective actions and improvement
recommendations"
Exclusive gateway "Escalate to product refinement?"
  - branch "Yes — refinement required": Send task "Send adoption
    findings to Refine Product / Service (V06.12)", then End event
    "Adoption findings handed to Refine Product / Service (V06.12)"
  - branch "No — monitor only": End event "Adoption within acceptable
    range — monitoring continues"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on User task "Analyse adoption
trends and identify issues", labelled "Reporting deadline exceeded —
escalate to product manager"; flow proceeds to User task "Review
adoption shortfall report" in Product Management lane.

6. Connectors

Sequence flows: work begins in the Customer Experience lane with the
start event and proceeds through metric definition, system
configuration, data receipt, aggregation, retrieval, and analysis to
the first exclusive gateway. The "Yes — on track" branch waits on a
timer intermediate event then enters the standard-loop subprocess
before rejoining at the exclusive merge gateway and continuing
monitoring. The "No — below threshold" branch passes to the Product
Management lane for review, prioritisation, and the second exclusive
gateway, whose branches lead to one of two end events. The
non-interrupting boundary event on the analysis task also routes
directly to Product Management.

Message flows:
Customer → Customer Experience lane (usage data, feedback, and survey
responses)
Customer Experience lane → Analytics / BI (data collection
configuration request)
Analytics / BI → Customer Experience lane (performance report and
refreshed metrics)
Product Management lane → Analytics / BI (adoption findings stored for
ongoing tracking)

7. Data objects

Data Object "Adoption Metrics and KPIs" — written by User task "Define
adoption metrics and KPIs"; read by Service task "Configure data
collection in Analytics / BI".
Data Object "Usage and Feedback Data" — written by User task "Aggregate
and cleanse adoption data"; read by User task "Analyse adoption trends
and identify issues".
Data Store "Performance Report" — written by Service task "Retrieve
performance report from Analytics / BI"; read by User task "Analyse
adoption trends and identify issues" and User task "Re-analyse adoption
trends".
Data Object "Adoption Shortfall Report" — written by User task
"Document adoption shortfalls and root causes"; read by User task
"Review adoption shortfall report".
Data Object "Corrective Action Recommendations" — written by User task
"Prioritise corrective actions and improvement recommendations"; read by
Send task "Send adoption findings to Refine Product / Service (V06.12)".

V06.11 Monitor Adoption tracks live product performance by collecting
customer usage data and feedback, running it through the Analytics / BI
system, and evaluating whether adoption meets the agreed thresholds.
Where performance is acceptable the cycle repeats on a timer; where
shortfalls are identified, root causes are documented and prioritised
by the product manager. The subprocess concludes by handing structured
adoption findings and improvement recommendations to V06.12 Refine
Product / Service for action.
```

### V06.12 — Refine Product / Service

**BPMN diagram prompt.**

```text
BPMN: V06.12 Refine Product / Service — the final subprocess of the
Idea to Market value chain, closing the loop by translating post-launch
insights into approved product improvements.

1. Pools & Lanes

Pool "Product Organisation" — the internal teams that analyse data,
define refinements, and implement approved changes.
  Lane "Product Management" — product owner and product manager who
  review insights, prioritise improvements, and secure approval.
  Lane "Operations" — product manager who implements approved changes
  and confirms operational readiness.
Pool "Product Lifecycle Management System" — PLM system that records
product change data and approved improvement versions.
Pool "Analytics / BI" — analytics and business intelligence platform
that supplies post-launch performance metrics and usage data.

2. Pool properties

Pool "Product Organisation" — white-box, single instance.
Pool "Product Lifecycle Management System" — black-box, System = true,
single instance.
Pool "Analytics / BI" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Analytics / BI
2. Product Organisation
3. Product Lifecycle Management System

4. Lane contents in flow order (Product Organisation)

Product Management lane:
  Message start event "Post-launch performance data received from
  Monitor Adoption (V06.11)"
  Service task "Retrieve performance metrics and usage data"
  User task "Analyse adoption findings and identify improvement areas"
  User task "Prioritise product refinement backlog"
  Exclusive gateway "Refinements warranted?"
  - branch "No significant refinements needed": End event "No
    refinements actioned — product remains as released"
  - branch "Refinements warranted": continue to next element
  Exclusive merge gateway "Refinements warranted"
  Expanded Subprocess "Repeat Until Refinement Scope Agreed"
  (standard loop) containing, in order: User task "Draft refinement
  scope and change specification", User task "Review scope with
  Operations and Engineering stakeholders", Exclusive gateway "Scope
  agreed?"
  User task "Prepare business case update for refinement"
  User task "Submit refinement proposal for governance approval"
  Intermediate message catch event "Governance decision received"
  Exclusive gateway "Refinement approved?"
  - branch "Not approved": User task "Revise proposal based on
    feedback", then loop back implied as standard loop — model as
    Expanded Subprocess "Repeat Until Approved" (standard loop)
    containing, in order: User task "Revise refinement proposal",
    User task "Resubmit for governance approval", Intermediate
    message catch event "Revised governance decision received",
    Exclusive gateway "Approved on resubmission?"
    - branch "Approved on resubmission": continue to merge
    - branch "Rejected finally": End event "Refinement rejected —
      product retained without change" (does not rejoin)
  - branch "Approved": continue to merge
  Exclusive merge gateway "Refinement approved"
  User task "Communicate approved refinement plan to Operations"

Operations lane:
  User task "Plan implementation of approved refinements"
  User task "Execute product or service changes"
  Service task "Record implemented changes in Product Lifecycle
  Management System"
  User task "Verify operational readiness of refined product"
  Exclusive gateway "Readiness confirmed?"
  - branch "Not ready": Expanded Subprocess "Repeat Until Ready"
    (standard loop) containing, in order: User task "Resolve
    outstanding readiness issues", User task "Re-verify operational
    readiness"
  - branch "Ready": continue to merge
  Exclusive merge gateway "Readiness confirmed"
  User task "Update internal stakeholders on refined product release"
  End event "Refined product released — Idea to Market cycle
  complete"

5. Edge-mounted (boundary) events

Timer boundary event (interrupting) on Expanded Subprocess "Repeat
Until Refinement Scope Agreed" — label "Scope agreement deadline
exceeded" — triggers End event "Refinement scoped abandoned due to
timeout".
Timer boundary event (interrupting) on Expanded Subprocess "Repeat
Until Ready" — label "Readiness check deadline exceeded" — triggers
User task "Escalate readiness failure to Operations management", then
End event "Implementation halted — escalation raised".

6. Connectors

Sequence flows: Flow begins in the Product Management lane with the
message start event, proceeds through metric retrieval, analysis, and
prioritisation to the first exclusive gateway; the "No significant
refinements needed" branch ends immediately while the "Refinements
warranted" branch merges and enters the scope-agreement subprocess,
then continues through business case preparation, submission, and the
governance decision catch event to the approval gateway; the "Not
approved" branch enters the revision subprocess, whose "Approved on
resubmission" branch merges at the "Refinement approved" merge gateway
while the "Rejected finally" branch ends independently; the "Approved"
branch also merges at that gateway, then flows to the communication
task before crossing into the Operations lane for planning, execution,
PLM recording, and readiness verification; the "Not ready" branch
enters the readiness loop before merging at the "Readiness confirmed"
merge gateway; the "Ready" branch merges there as well, and the
stakeholder update task leads to the final end event.

Message flows:
Analytics / BI → Product Management lane "Retrieve performance metrics
and usage data" (post-launch performance metrics and usage data).
Product Management lane "Record implemented changes in Product
Lifecycle Management System" → Product Lifecycle Management System
(approved change records and updated product version data).
Product Lifecycle Management System → Operations lane "Verify
operational readiness of refined product" (current product
configuration and change log).

7. Data objects

Data Object "Post-launch Performance Report" — read by "Retrieve
performance metrics and usage data"; read by "Analyse adoption
findings and identify improvement areas".
Data Object "Refinement Backlog" — written by "Prioritise product
refinement backlog"; read by "Draft refinement scope and change
specification".
Data Object "Refinement Scope and Change Specification" — written by
"Draft refinement scope and change specification"; read by "Prepare
business case update for refinement".
Data Object "Refinement Proposal" — written by "Prepare business case
update for refinement"; read by "Submit refinement proposal for
governance approval"; written by "Revise refinement proposal".
Data Store "Product Lifecycle Management System Record" — written by
"Record implemented changes in Product Lifecycle Management System";
read by "Verify operational readiness of refined product".
Data Object "Operational Readiness Report" — written by "Verify
operational readiness of refined product"; read by "Update internal
stakeholders on refined product release".

V06.12 Refine Product / Service translates post-launch usage data and
adoption findings into a governed backlog of improvements, carries each
refinement through scope agreement, business case approval, and
operational implementation, and confirms readiness before declaring the
refined product released. By closing this loop the subprocess completes
the full Idea to Market cycle and returns an improved product to the
market, ready to feed the next iteration of V06.11 Monitor Adoption or
to initiate a new V06.01 Identify Opportunity cycle.
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
BPMN: V07.01 Receive Issue — first subprocess in the Issue to Resolution
value chain, capturing every inbound issue from the Complainant / Customer /
User and creating an initial ticket for downstream processing.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams handling issue receipt.
  Lane "Customer Service" (customer service agent) — receives, logs, and
  acknowledges the issue.
Pool "Complainant / Customer / User" — the external party raising the issue.
Pool "Ticketing / Customer Contact Platform" — the system recording the
  initial contact and generating the ticket.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Complainant / Customer / User" — black-box, single instance.
Pool "Ticketing / Customer Contact Platform" — black-box, System = true,
  single instance.

3. Layout

Top: Complainant / Customer / User
Middle: Service Organisation
Bottom: Ticketing / Customer Contact Platform

4. Lane contents in flow order (Service Organisation)

Customer Service lane:
  Message start event "Issue raised by Complainant / Customer / User"
  User task "Capture issue details"
  Service task "Log issue in Ticketing / Customer Contact Platform"
  User task "Verify contact details and preferred channel"
  Exclusive gateway "Sufficient details to proceed?"
    - branch "Yes": continue to next element
    - branch "No": Expanded Subprocess "Repeat Until Details Complete"
        (standard loop) containing, in order: Send task "Request missing
        information from Complainant / Customer / User", Intermediate
        message catch event "Further information received",
        User task "Update issue record with additional details"
  Exclusive merge gateway "Sufficient details to proceed?"
  Service task "Generate case reference number"
  Send task "Send acknowledgement and case number to Complainant /
    Customer / User"
  End event "Issue received and logged — ready for Identify
    Customer / User (V07.02)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Details Complete" — label "48-hour response deadline exceeded" — triggers
  a Send task "Notify Complainant / Customer / User of pending closure" and
  flows to an End event "Issue closed — insufficient information received".

6. Connectors

Sequence flows: flow runs top to bottom within the Customer Service lane,
  from the message start event through capture, log, verify, the
  "Sufficient details?" gateway — its "No" branch entering the loop
  subprocess and its "Yes" branch bypassing it — both rejoining at the
  exclusive merge gateway, then continuing through generate case number,
  send acknowledgement, and closing at the end event. The timer boundary
  event exits the loop subprocess and flows to its own terminal end event,
  not rejoining the main path.

Message flows:
  Complainant / Customer / User → Customer Service lane (issue details,
    evidence, contact details, and desired resolution)
  Customer Service lane → Ticketing / Customer Contact Platform (issue
    record for logging and ticket creation)
  Ticketing / Customer Contact Platform → Customer Service lane (generated
    case reference number)
  Customer Service lane → Complainant / Customer / User (acknowledgement
    and case reference number)
  Customer Service lane → Complainant / Customer / User (request for
    missing information, when loop is entered)

7. Data objects

Data Object "Issue Details" — written by "Capture issue details"; read by
  "Log issue in Ticketing / Customer Contact Platform".
Data Object "Contact Details" — written by "Verify contact details and
  preferred channel"; read by "Send acknowledgement and case number to
  Complainant / Customer / User".
Data Object "Additional Information Request" — written by "Request missing
  information from Complainant / Customer / User"; read by "Update issue
  record with additional details".
Data Object "Case Reference Number" — written by "Generate case reference
  number"; read by "Send acknowledgement and case number to Complainant /
  Customer / User".
Data Store "Ticket Record" — written by "Log issue in Ticketing / Customer
  Contact Platform"; read by "Generate case reference number".

V07.01 Receive Issue captures every inbound issue from the Complainant /
Customer / User — by phone, email, portal, or other channel — records the
full details in the Ticketing / Customer Contact Platform, chases any gaps
via a bounded loop, generates a case reference number, and sends a formal
acknowledgement. It hands a complete, timestamped ticket to V07.02 Identify
Customer / User so that the customer record can be matched before
classification begins.
```

### V07.02 — Identify Customer / User

**BPMN diagram prompt.**

```text
BPMN: V07.02 Identify Customer / User — second subprocess in the
V07 Issue to Resolution value chain, receiving a logged issue from
V07.01 and confirming the customer or user identity before
classification in V07.03.

1. Pools & Lanes

Pool "Service Organisation" — the organisation running the
identification process, containing all active lanes.
  Lane "Customer Service" — customer service agent who searches for,
  verifies, and records the customer or user identity.
Pool "Complainant / Customer / User" — external participant who
provides identity details when requested.
Pool "CRM System" — IT system that stores and returns customer
records and history.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Complainant / Customer / User" — black-box, single instance.
Pool "CRM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Complainant / Customer / User
2. Service Organisation
3. CRM System

4. Lane contents in flow order (Service Organisation)

Customer Service lane:
  Message start event "Logged issue received from Receive Issue
  (V07.01)"
  Service task "Search CRM for customer or user record"
  Exclusive gateway "Record found?"
  - branch "Yes": Exclusive gateway "Details sufficient to confirm
    identity?"
    - branch "Yes — identity confirmed": User task "Confirm and
      link customer record to case"
      Service task "Retrieve customer history and prior issues from
      CRM"
      End event "Customer identified — ready for Classify Issue
      (V07.03)"
    - branch "No — details incomplete": Send task "Request
      additional identity details from customer"
      Intermediate message catch event "Customer responds with
      identity details"
      Expanded Subprocess "Repeat Until Identity Confirmed"
      (standard loop) containing, in order: User task "Review
      provided identity details", Service task "Re-query CRM with
      updated details", Exclusive gateway "Identity now confirmed?"
      — branch "Yes": exit loop; branch "No": continue loop
      User task "Confirm and link customer record to case"
      Service task "Retrieve customer history and prior issues from
      CRM"
      End event "Customer identified — ready for Classify Issue
      (V07.03)"
  - branch "No — record not found": User task "Create new customer
    or user record in CRM"
    User task "Capture contact details and issue context"
    Service task "Save new record to CRM"
    End event "New customer record created — ready for Classify
    Issue (V07.03)"
  Exclusive merge gateway "Record found"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat
Until Identity Confirmed" — labelled "Identity response overdue
(SLA limit reached)"; on trigger, flow exits to: User task "Flag
case for manual identity resolution" then End event "Identity
unresolved — case flagged for review".

6. Connectors

Sequence flows: flow begins at the message start event in the
Customer Service lane, moves to the CRM search task, then to the
"Record found?" gateway. The "Yes" branch leads to the "Details
sufficient?" gateway; its "Yes — identity confirmed" branch
continues to confirm, retrieve history, and end; its "No — details
incomplete" branch sends a request, catches the customer response,
enters the repeat subprocess, then continues to confirm and
retrieve before ending. The "No — record not found" branch creates
a new record, captures details, saves to CRM, and ends. All
branches that do not reach their own distinct end event rejoin at
the exclusive merge gateway "Record found" before proceeding; the
two "identity confirmed" paths and the "new record" path each
carry their own end events and do not rejoin. The timer boundary
exit flows to the manual flag task and its own end event.

Message flows:
Complainant / Customer / User → Customer Service lane (identity
details provided in response to request)
Customer Service lane → Complainant / Customer / User (request for
additional identity details)
Customer Service lane → CRM System (search query with available
identifiers)
CRM System → Customer Service lane (matching customer record,
history, and prior issues)
Customer Service lane → CRM System (new customer record and
contact details written on creation)
Customer Service lane → CRM System (updated record linked to case)

7. Data objects

Data Object "Logged Issue" — read by "Search CRM for customer or
user record".
Data Object "Identity Details" — written by "Capture contact
details and issue context"; read by "Review provided identity
details".
Data Store "CRM Customer Record" — read by "Search CRM for
customer or user record", "Retrieve customer history and prior
issues from CRM"; written by "Create new customer or user record
in CRM", "Save new record to CRM", "Confirm and link customer
record to case".
Data Object "Customer History" — read by "Confirm and link
customer record to case"; written by "Retrieve customer history
and prior issues from CRM".

V07.02 Identify Customer / User confirms who has raised the issue
by searching the CRM, verifying identity details, and either
linking the case to an existing customer record or creating a new
one. Where identity cannot be confirmed quickly, the subprocess
loops until sufficient details arrive or flags the case for manual
resolution if the SLA limit is reached. The verified customer
record and history are handed to V07.03 Classify Issue so that
classification can be informed by the customer's prior contacts
and entitlements.
```

### V07.03 — Classify Issue

**BPMN diagram prompt.**

```text
BPMN: V07.03 Classify Issue — third subprocess in the V07 Issue to
Resolution value chain, receiving a logged issue from V07.02 and
handing a classified case record to V07.04.

1. Pools & Lanes

Pool "Service Organisation" — the organisation processing and
classifying the issue.
  Lane "Customer Service" — customer service agent performs initial
  categorisation.
  Lane "Complaints Management" — complaints officer reviews
  categorisation and applies formal classification.
Pool "Case Management System" — system that records and stores
classified case data.

2. Pool properties

Pool "Service Organisation": white-box, single instance.
Pool "Case Management System": black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Service Organisation (white-box, two lanes top to bottom:
   Customer Service, then Complaints Management)
2. Case Management System

4. Lane contents in flow order (Service Organisation)

Customer Service lane:
  Message start event "Identified customer record received from
  V07.02"
  Service task "Retrieve case record from Case Management System"
  User task "Assign initial issue category"
    - (categories cover: complaint, defect, service request,
      warranty claim, incident, query)
  User task "Enter issue type and channel details"
  Exclusive gateway "Is issue a formal complaint or regulatory
  matter?"
    - branch "Yes — formal complaint or regulatory":
        Send task "Refer case to Complaints Management for
        classification"
    - branch "No — standard issue":
        Service task "Apply standard classification and issue code"
        Exclusive merge gateway "Classification route complete"

Complaints Management lane:
  Intermediate message catch event "Case referral received from
  Customer Service"
  User task "Review issue details and evidence"
  Expanded Subprocess "Repeat Until Classification Agreed"
  (standard loop) containing, in order:
    User task "Apply complaints or regulatory issue category",
    User task "Validate classification against complaints handling
    policy",
    Exclusive gateway "Classification confirmed?"
      - branch "Confirmed": exit loop
      - branch "Not confirmed — revise": continue loop
  Exclusive merge gateway "Classification route complete"
  Service task "Record final classification in Case Management
  System"
  User task "Set priority flag and SLA timer"
  End event "Issue classified — ready for Assess Severity and
  Entitlement (V07.04)"

5. Edge-mounted (boundary) events

Timer boundary event (interrupting) on Expanded Subprocess
"Repeat Until Classification Agreed" — label "Classification
deadline exceeded (SLA limit)" — triggers an escalation end event
"Classification timed out — escalate to complaints officer"
that does not rejoin the main flow.

6. Connectors

Sequence flows: flow begins in the Customer Service lane with
retrieval of the case record, moves through initial categorisation
and channel entry, then reaches the exclusive gateway. The "No"
branch applies standard classification and merges at "Classification
route complete" in the Complaints Management lane. The "Yes" branch
sends a referral to Complaints Management; after the intermediate
catch event, the loop subprocess runs until classification is
confirmed, then merges at "Classification route complete". From that
merge, Complaints Management records the final classification,
sets priority and SLA, and reaches the end event.

Message flows:
Case Management System → Customer Service lane (case record
retrieved at "Retrieve case record from Case Management System").
Complaints Management lane → Case Management System ("Record final
classification in Case Management System" writes classification
and issue code to the system).
Customer Service lane → Complaints Management lane ("Refer case to
Complaints Management for classification" carries the referral;
modelled as a message flow crossing lanes within the same pool).

7. Data objects

Data Object "Case Record" — read by "Retrieve case record from
Case Management System"; written by "Enter issue type and channel
details".
Data Object "Issue Classification" — written by "Apply standard
classification and issue code" and by "Apply complaints or
regulatory issue category".
Data Object "Complaints Handling Policy" — read by "Validate
classification against complaints handling policy".
Data Store "Case Management System Record" — written by "Record
final classification in Case Management System"; written by
"Set priority flag and SLA timer".

V07.03 Classify Issue takes the identified customer and logged
issue from V07.02 and systematically assigns an issue type,
category, and priority code, routing formal complaints and
regulatory matters to the Complaints Management lane for validated
classification under the complaints handling policy. The subprocess
concludes with a confirmed classification, a priority flag, and
an SLA timer loaded into the Case Management System, giving V07.04
Assess Severity and Entitlement the structured information it needs
to determine urgency and customer entitlement.
```

### V07.04 — Assess Severity & Entitlement

**BPMN diagram prompt.**

```text
BPMN: V07.04 Assess Severity & Entitlement — subprocess within the V07
Issue to Resolution value chain, sitting between Classify Issue (V07.03)
and Investigate (V07.05).

1. Pools & Lanes

Pool "Service Organisation" — the organisation running the assessment
  process, with lanes for Customer Service and Complaints Management.
Pool "Complainant / Customer / User" — external participant who supplies
  additional information and receives entitlement outcome notices.
Pool "Warranty / Entitlement System" — IT system that holds entitlement
  records and returns eligibility data.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Complainant / Customer / User" — black-box, single instance.
Pool "Warranty / Entitlement System" — black-box, System = true,
  single instance.

3. Layout

Top: Complainant / Customer / User
Middle: Service Organisation
Bottom: Warranty / Entitlement System

4. Lane contents in flow order (Service Organisation)

Customer Service lane:
  Message start event "Classified issue received from Classify Issue
    (V07.03)"
  User task "Review classified issue and initial details"
  Service task "Query entitlement records in Warranty / Entitlement
    System"
  Intermediate message catch event "Entitlement data returned"
  User task "Evaluate customer entitlement and eligibility"
  Exclusive gateway "Entitlement confirmed?"
    - branch "Yes": sequence continues to Complaints Management lane
    - branch "No — further information needed": Send task "Request
      additional information from customer"
      Intermediate message catch event "Customer responds with additional
        information"
      Exclusive merge gateway "Entitlement confirmed?"
      (rejoins main branch at merge below)
  Exclusive merge gateway "Entitlement confirmed"
  User task "Record entitlement outcome on case"

Complaints Management lane:
  User task "Assign severity rating to issue"
  Exclusive gateway "Severity level?"
    - branch "Critical or High": User task "Flag case for priority
      handling and escalation readiness"
    - branch "Medium": User task "Set standard SLA and assign case
      manager"
    - branch "Low": User task "Set routine SLA and queue for
      investigation"
  Exclusive merge gateway "Severity level"
  Service task "Set SLA timer in Case Management System"
  User task "Confirm severity and entitlement assessment with customer
    service agent"
  End event "Severity and entitlement assessed — ready for Investigate
    (V07.05)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess — mounted on
  User task "Evaluate customer entitlement and eligibility": label
  "Entitlement query exceeds SLA threshold"; on trigger, flow moves to
  User task "Flag case for manual entitlement review" and then rejoins
  at Exclusive merge gateway "Entitlement confirmed".

6. Connectors

Sequence flows: flow begins in the Customer Service lane with the
  message start event and proceeds through issue review, entitlement
  query, and evaluation. The "Entitlement confirmed?" gateway splits
  into a confirmation branch passing to the Complaints Management lane
  and a "further information needed" branch looping through the send
  task and message catch event before rejoining at the exclusive merge
  gateway. In the Complaints Management lane the "Severity level?"
  gateway splits into three branches — Critical/High, Medium, and Low
  — each completing its respective task before rejoining at the
  "Severity level" exclusive merge gateway. Flow continues to SLA timer
  setting, final confirmation, and the end event.

Message flows:
  Service Organisation (Customer Service lane, "Query entitlement
    records") → Warranty / Entitlement System (entitlement query
    request).
  Warranty / Entitlement System → Service Organisation (Customer Service
    lane, "Entitlement data returned") (eligibility and entitlement
    data).
  Service Organisation (Customer Service lane, "Request additional
    information from customer") → Complainant / Customer / User
    (request for further evidence or details).
  Complainant / Customer / User → Service Organisation (Customer Service
    lane, "Customer responds with additional information") (additional
    information and evidence).
  Service Organisation (Complaints Management lane, "Confirm severity
    and entitlement assessment with customer service agent") →
    Complainant / Customer / User (entitlement outcome and severity
    notification).

7. Data objects

Data Object "Classified Issue Record" — read by "Review classified
  issue and initial details".
Data Object "Entitlement Query Request" — written by "Query entitlement
  records in Warranty / Entitlement System"; read by Warranty /
  Entitlement System.
Data Object "Entitlement Response" — written by Warranty / Entitlement
  System; read by "Evaluate customer entitlement and eligibility".
Data Object "Additional Information Submission" — written by
  Complainant / Customer / User; read by "Evaluate customer entitlement
  and eligibility".
Data Object "Severity and Entitlement Assessment Record" — written by
  "Record entitlement outcome on case" and "Assign severity rating to
  issue"; read by "Set SLA timer in Case Management System".
Data Store "Case Management System" — written by "Set SLA timer in Case
  Management System"; read by "Confirm severity and entitlement
  assessment with customer service agent".

This subprocess takes a classified issue from V07.03 and establishes
two key facts: whether the customer holds valid entitlement under
warranty or service agreement, and how severe the issue is. It sets the
appropriate SLA timer, flags critical cases for priority handling, and
produces a severity-and-entitlement assessment record. That record,
together with the active SLA, is handed to Investigate (V07.05) as the
authoritative basis for scoping and prioritising the investigation.
```

### V07.05 — Investigate

**BPMN diagram prompt.**

```text
BPMN: V07.05 Investigate — the investigation subprocess within the
Issue to Resolution value chain, sitting between Assess Severity &
Entitlement (V07.04) and Diagnose Root Cause (V07.06).

1. Pools & Lanes

Pool "Service Organisation" — the organisation running the investigation
process, containing Technical Support lane.
Pool "Complainant / Customer / User" — the external customer, user, or
complainant who may be contacted for further information during
investigation.
Pool "Knowledge Base" — the IT system providing knowledge articles and
prior resolution information.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Complainant / Customer / User" — black-box, single instance.
Pool "Knowledge Base" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Complainant / Customer / User
2. Service Organisation
3. Knowledge Base

4. Lane contents in flow order (Service Organisation)

Technical Support lane:
  Message start event "Classified case received from Classify Issue (V07.04)"
  User task "Review case details and prior history"
  Service task "Query knowledge base for known issues and resolutions"
  Intermediate message catch event "Knowledge base results received"
  User task "Evaluate known resolutions against reported issue"
  Exclusive gateway "Known resolution found?"
    - branch "Yes": User task "Apply candidate resolution from knowledge
      base"
      Exclusive gateway "Candidate resolution resolves issue?"
        - branch "Yes": User task "Document investigation findings and
          resolution applied"
          Sequence continues to merge below.
        - branch "No": User task "Record failed candidate resolution"
          Sequence continues to merge below.
      Exclusive merge gateway "Candidate resolution resolves issue"
    - branch "No": User task "Record that no known resolution exists"
      Sequence continues to merge below.
  Exclusive merge gateway "Known resolution found"
  Exclusive gateway "Further information required from customer?"
    - branch "Yes":
      Expanded Subprocess "Repeat Until Information Received"
        (standard loop) containing, in order:
        Send task "Request further information from customer",
        Intermediate message catch event "Customer response received",
        User task "Review customer-supplied information"
      Timer boundary event on subprocess "SLA information deadline
        reached" — interrupting — leads to End event "Investigation
        stalled — case escalated to Escalate if Needed (V07.08)"
      Sequence continues to merge below.
    - branch "No": Sequence continues to merge below.
  Exclusive merge gateway "Further information required from customer"
  User task "Consolidate investigation findings into case record"
  Exclusive gateway "Issue resolved through investigation?"
    - branch "Yes — resolved":
      End event "Investigation complete, issue resolved — ready for
        Communicate Outcome (V07.09)"
    - branch "No — root cause unknown":
      End event "Investigation complete, root cause unresolved — ready
        for Diagnose Root Cause (V07.06)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Information Received", labelled "SLA information deadline reached",
leads to End event "Investigation stalled — case escalated to Escalate
if Needed (V07.08)".

6. Connectors

Sequence flows: flow moves top to bottom through the Technical Support
lane, from the message start event through case review, knowledge base
query, evaluation, the "Known resolution found?" gateway with its two
branches rejoining at the "Known resolution found" merge gateway, then
to the "Further information required from customer?" gateway whose
"Yes" branch enters the standard-loop subprocess (with a timer boundary
leading to the stall end event) and whose "No" branch bypasses it,
both rejoining at the "Further information required from customer"
merge gateway, on to consolidation, and finally to the "Issue resolved
through investigation?" exclusive gateway whose two branches each lead
to their own terminal end event.

Message flows:
Complainant / Customer / User → Service Organisation (customer-supplied
  further information, evidence, and clarification details).
Service Organisation → Complainant / Customer / User (request for
  further information sent by support analyst).
Service Organisation → Knowledge Base (query for known issues,
  resolutions, and knowledge articles).
Knowledge Base → Service Organisation (knowledge articles and prior
  resolution records returned to Technical Support).

7. Data objects

Data Object "Classified Case Record" — read by "Review case details
  and prior history"; written by "Consolidate investigation findings
  into case record".
Data Object "Knowledge Base Query Results" — read by "Evaluate known
  resolutions against reported issue"; written by "Query knowledge base
  for known issues and resolutions".
Data Object "Customer Information Response" — read by "Review
  customer-supplied information"; written by Send task "Request further
  information from customer".
Data Object "Investigation Findings Report" — written by "Consolidate
  investigation findings into case record"; read by "Document
  investigation findings and resolution applied".
Data Store "Case Management System" — read by "Review case details and
  prior history"; written by "Consolidate investigation findings into
  case record".

V07.05 Investigate takes the classified and severity-rated case from
V07.04, queries the Knowledge Base for known resolutions, contacts the
customer for additional information when needed, and attempts to resolve
the issue through available knowledge. It produces a consolidated set
of investigation findings and routes the case onward: to V07.09
Communicate Outcome if the issue is resolved, to V07.06 Diagnose Root
Cause if the root cause remains unknown, or to V07.08 Escalate if
Needed if the customer fails to respond within the SLA deadline.
```

### V07.06 — Diagnose Root Cause

**BPMN diagram prompt.**

```text
BPMN: V07.06 Diagnose Root Cause — subprocess within the Issue to
Resolution value chain in which Technical Support and Product/Engineering
collaborate to identify the underlying cause of an investigated issue and
record a confirmed root cause diagnosis before resolution begins.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams that conduct root cause
analysis.
  Lane "Technical Support" — support analyst who leads the diagnostic
  activity.
  Lane "Product / Engineering" — product specialist who provides deep
  product and defect expertise.
Pool "Product Defect System" — system that stores and tracks defect
records and root cause findings.

2. Pool properties

Pool "Service Organisation": white-box, single instance.
Pool "Product Defect System": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Service Organisation (white-box, two lanes)
2. Product Defect System (black-box, system)

4. Lane contents in flow order (Service Organisation)

Technical Support lane:
  Message start event "Investigation findings received from V07.05"
  User task "Review investigation findings and evidence"
  User task "Formulate diagnostic hypotheses"
  Exclusive gateway "Hypothesis requires product-level analysis?"
  - branch "Yes — product expertise needed": Send task "Request
    product/engineering diagnostic support"
  - branch "No — supportable by Technical Support alone": continue
    to Exclusive merge gateway "Product analysis required?"
  Exclusive merge gateway "Product analysis required?"
  Intermediate message catch event "Diagnostic analysis received from
  Product / Engineering"
  User task "Consolidate diagnostic findings"
  Exclusive gateway "Root cause confirmed?"
  - branch "Yes — root cause identified": continue to User task
    "Document root cause and contributing factors"
  - branch "No — further analysis needed": Expanded Subprocess
    "Repeat Until Root Cause Confirmed" (standard loop) containing,
    in order: User task "Revise diagnostic hypotheses", Send task
    "Request additional analysis from Product / Engineering",
    Intermediate message catch event "Further analysis received",
    User task "Re-evaluate findings"
  Exclusive merge gateway "Root cause confirmed?"
  User task "Document root cause and contributing factors"
  Service task "Record root cause findings in Product Defect System"
  User task "Assign resolution category and defect classification"
  End event "Root cause confirmed — ready for Resolve or Fulfil
  Request (V07.07)"

Product / Engineering lane:
  Intermediate message catch event "Diagnostic support requested by
  Technical Support"
  User task "Analyse product design, defect history and failure data"
  User task "Validate root cause hypothesis against product records"
  Send task "Return diagnostic analysis to Technical Support"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Root Cause Confirmed" — label "SLA diagnosis deadline exceeded" —
triggers End event "Diagnosis deadline breached — escalate to V07.08".

6. Connectors

Sequence flows: within the Technical Support lane the flow moves from
the message start event through review, hypothesis formulation, and
the gateway. The "Yes" branch routes to the send task requesting
engineering support, then rejoins at the exclusive merge gateway. The
"No" branch goes directly to that same merge gateway. From the merge
gateway the flow continues to the intermediate message catch event
awaiting engineering analysis, then to consolidate findings, then to
the "Root cause confirmed?" gateway. The "Yes" branch goes to document
root cause then to record in the system, classification, and the end
event. The "No" branch enters the standard-loop expanded subprocess;
on exit the loop rejoins the "Root cause confirmed?" merge gateway
before proceeding to document. Within the Product / Engineering lane
the flow runs from the intermediate catch event through analysis,
validation, and the send task, which returns the result to the
Technical Support lane.

Message flows:
Technical Support send task "Request product/engineering diagnostic
support" → Product / Engineering intermediate catch event "Diagnostic
support requested by Technical Support" (diagnostic support request).
Product / Engineering send task "Return diagnostic analysis to
Technical Support" → Technical Support intermediate message catch
event "Diagnostic analysis received from Product / Engineering"
(diagnostic analysis report).
Technical Support send task "Request additional analysis from Product
/ Engineering" → Product / Engineering intermediate catch event
"Diagnostic support requested by Technical Support" (further analysis
request, within loop).
Technical Support service task "Record root cause findings in Product
Defect System" → Product Defect System (root cause record and defect
classification).
Product Defect System → Technical Support user task "Analyse product
design, defect history and failure data" (defect history and prior
root cause data).

7. Data objects

Data Object "Investigation Findings" — read by "Review investigation
findings and evidence".
Data Object "Diagnostic Hypothesis" — written by "Formulate diagnostic
hypotheses"; read by "Analyse product design, defect history and
failure data".
Data Object "Diagnostic Analysis Report" — written by "Return
diagnostic analysis to Technical Support"; read by "Consolidate
diagnostic findings".
Data Store "Product Defect Record" — written by "Record root cause
findings in Product Defect System"; read by "Analyse product design,
defect history and failure data".
Data Object "Root Cause Report" — written by "Document root cause and
contributing factors"; read by "Assign resolution category and defect
classification".

V07.06 Diagnose Root Cause takes the investigation findings produced
in V07.05 and subjects them to a structured diagnostic process
involving Technical Support and Product/Engineering. Through iterative
hypothesis testing and product-level analysis, a confirmed root cause
and defect classification are produced and recorded in the Product
Defect System. The confirmed root cause report is then handed to
V07.07 Resolve or Fulfil Request so that an appropriate remedy can
be designed and delivered.
```

### V07.07 — Resolve or Fulfil Request

**BPMN diagram prompt.**

```text
BPMN: V07.07 Resolve or Fulfil Request — the subprocess in which Service
Operations and Field Service act on a diagnosed case to deliver a resolution
or fulfil a service request, coordinating with a Field Service Partner where
on-site work is required.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams carrying out resolution and
fulfilment.
  Lane "Service Operations" — case manager coordinating resolution activity.
  Lane "Field Service" — service technician executing on-site or remote work.
Pool "Field Service Partner" — external third-party providing on-site
  field labour or specialist service delivery.
Pool "Field Service System" — IT system managing field work orders,
  scheduling, and technician dispatch.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Field Service Partner" — black-box, single instance.
Pool "Field Service System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Field Service Partner
2. Service Organisation
3. Field Service System

4. Lane contents in flow order (Service Organisation)

Service Operations lane:
  Message start event "Diagnosed case received from V07.06"
  User task "Review diagnosis and select resolution approach"
  Exclusive gateway "Resolution type?"
  - branch "Remote fix / fulfilment": Service task "Initiate remote
    resolution action"
    Intermediate message catch event "Remote action outcome received"
    Exclusive gateway "Remote resolution successful?"
    - branch "Yes": continue to exclusive merge gateway
      "Resolution type merge"
    - branch "No": User task "Escalate unresolved case"
      End event "Case escalated — handed to Escalate if Needed
      (V07.08)" (does not rejoin)
  - branch "Replacement / refund": User task "Raise replacement or
    refund request"
    Service task "Submit refund or replacement order to Field Service
    System"
    Intermediate message catch event "Order confirmation received"
    continue to exclusive merge gateway "Resolution type merge"
  - branch "On-site field visit required": User task "Prepare work
    order"
    Service task "Create and dispatch work order in Field Service
    System"
    Intermediate message catch event "Work order accepted by Field
    Service Partner"
    continue to exclusive merge gateway "Resolution type merge"
  Exclusive merge gateway "Resolution type merge"
  User task "Record resolution details and resolution code"
  Service task "Update case record in Field Service System"
  End event "Resolution confirmed — ready for Communicate Outcome
  (V07.09)"

Field Service lane:
  User task "Receive work order and prepare for site visit"
  User task "Execute on-site repair or service"
  User task "Capture job outcome and obtain site sign-off"
  Send task "Send field job completion report to Service Operations"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Create and dispatch work order
in Field Service System" — label "Work order not accepted within SLA
window" — flow continues to User task "Escalate unresolved case"
in Service Operations lane, leading to the End event "Case escalated
— handed to Escalate if Needed (V07.08)".

6. Connectors

Sequence flows: within the Service Operations lane, flow runs from the
message start event through review and the Resolution type gateway,
branching into three paths — remote fix, replacement/refund, and
on-site visit — each rejoining at the Resolution type merge gateway,
then continuing through record resolution details, system update, and
the end event. The Field Service lane flows from receive work order
through execute on-site repair, capture outcome, and send completion
report; it is joined to the on-site branch of Service Operations by
message flows (see below).

Message flows:
Field Service System → Service Operations lane (diagnosed case trigger
  activating the start event — case data and diagnosis record).
Service Operations lane → Field Service System (work order dispatch
  from "Create and dispatch work order in Field Service System").
Field Service System → Service Operations lane (work order acceptance
  confirmation — intermediate message catch event "Work order accepted
  by Field Service Partner").
Service Operations lane → Field Service Partner (work order details
  from "Create and dispatch work order in Field Service System").
Field Service Partner → Service Organisation Field Service lane
  (work order received, triggering "Receive work order and prepare
  for site visit").
Field Service lane → Field Service Partner (job instructions and
  scheduling confirmation).
Field Service lane → Service Operations lane (field job completion
  report from "Send field job completion report to Service
  Operations").
Service Operations lane → Field Service System (resolution code and
  case update from "Update case record in Field Service System").
Service Operations lane → Field Service System (refund or replacement
  order from "Submit refund or replacement order to Field Service
  System").
Field Service System → Service Operations lane (order confirmation
  — intermediate message catch event "Order confirmation received").

7. Data objects

Data Object "Diagnosed Case Record" — read by "Review diagnosis and
  select resolution approach".
Data Object "Work Order" — written by "Prepare work order"; read by
  "Create and dispatch work order in Field Service System"; read by
  "Receive work order and prepare for site visit".
Data Object "Field Job Completion Report" — written by "Capture job
  outcome and obtain site sign-off"; read by Service Operations via
  "Send field job completion report to Service Operations".
Data Object "Refund or Replacement Request" — written by "Raise
  replacement or refund request"; read by "Submit refund or
  replacement order to Field Service System".
Data Store "Case Management Record" — written by "Record resolution
  details and resolution code"; written by "Update case record in
  Field Service System".

V07.07 Resolve or Fulfil Request takes a diagnosed case and drives it to a
concrete outcome — whether through remote action, a replacement or refund,
or a coordinated field visit involving the Field Service Partner. Service
Operations controls the resolution path and records the outcome and resolution
code; Field Service executes any on-site work and returns a completion report.
The subprocess hands a confirmed resolution record to V07.09 Communicate
Outcome, or routes unresolvable cases directly to V07.08 Escalate if Needed.
```

### V07.08 — Escalate if Needed

**BPMN diagram prompt.**

```text
BPMN: V07.08 Escalate if Needed — manages formal escalation of unresolved or
high-severity issues within the Issue to Resolution value chain.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams executing the escalation
process.
  Lane "Complaints Management" — escalation manager driving the formal
  escalation workflow.
  Lane "Legal / Risk" — compliance officer reviewing regulatory and legal
  obligations.
Pool "Regulator" — external regulatory body that may receive mandatory reports.
Pool "Workflow / Escalation System" — IT system managing escalation records,
routing, and SLA tracking.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Regulator" — black-box, single instance.
Pool "Workflow / Escalation System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Regulator
2. Service Organisation
3. Workflow / Escalation System

4. Lane contents in flow order (Service Organisation)

Complaints Management lane:
  Message start event "Escalation triggered — unresolved or high-severity
  issue received from V07.07"
  User task "Review case for escalation eligibility"
  Exclusive gateway "Meets escalation threshold?"
  - branch "No — threshold not met": End event "Escalation not required —
    case returned for continued investigation"
  - branch "Yes — threshold met": Service task "Log escalation record in
    Workflow / Escalation System"
  Exclusive merge gateway "Meets escalation threshold"
  User task "Assign escalation tier and owner"
  Service task "Set escalation SLA timer in Workflow / Escalation System"
  Expanded Subprocess "Repeat Until Escalation Resolution Achieved" (standard
  loop) containing, in order: User task "Conduct escalation review session",
  User task "Update escalation record with findings", Exclusive gateway
  "Escalation resolved at this tier?", Service task "Advance to next escalation
  tier in Workflow / Escalation System"
  Intermediate message catch event "Resolution or closure instruction received"
  User task "Confirm escalation outcome and record resolution code"

Legal / Risk lane:
  User task "Assess regulatory and legal obligations"
  Exclusive gateway "Regulatory notification required?"
  - branch "No — no notification required": Exclusive merge gateway
    "Regulatory notification required"
  - branch "Yes — notification required": User task "Prepare regulatory
    notification"
  Send task "Submit notification to Regulator"
  Intermediate message catch event "Regulator acknowledgement received"
  Exclusive merge gateway "Regulatory notification required"
  User task "Document compliance actions and update escalation record"
  End event "Escalation concluded — outcome ready for Communicate Outcome
  (V07.09)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Repeat Until Escalation Resolution
Achieved" — label "Escalation SLA deadline exceeded" — triggers User task
"Initiate emergency escalation review" in Complaints Management lane, then
rejoins at "Confirm escalation outcome and record resolution code".
Interrupting error boundary event on "Submit notification to Regulator" —
label "Submission failure" — triggers User task "Resolve submission error and
resubmit" in Legal / Risk lane, then rejoins at "Intermediate message catch
event Regulator acknowledgement received".

6. Connectors

Sequence flows: Flow begins in Complaints Management with the message start
event, passes through eligibility review and the exclusive gateway; the
no-threshold branch ends immediately, the yes-threshold branch continues through
logging, assignment, SLA-setting, the escalation loop subprocess, the catch
event, and outcome confirmation. Control passes to Legal / Risk for regulatory
assessment; the gateway splits into a no-notification path and a yes-notification
path that runs through preparation, submission, and the acknowledgement catch
event; both branches merge at the exclusive merge gateway before compliance
documentation and the end event.

Message flows:
Workflow / Escalation System → Service Organisation / Complaints Management
  (escalation record confirmation and SLA timer acknowledgement).
Service Organisation / Complaints Management → Workflow / Escalation System
  (escalation log entries, tier advancement, and resolution code updates).
Service Organisation / Legal / Risk → Regulator (regulatory notification
  submission).
Regulator → Service Organisation / Legal / Risk (acknowledgement of regulatory
  notification).

7. Data objects

Data Object "Escalation Record" — written by "Log escalation record in
Workflow / Escalation System"; read by "Assign escalation tier and owner";
updated by "Update escalation record with findings"; updated by "Document
compliance actions and update escalation record"; updated by "Confirm escalation
outcome and record resolution code".
Data Object "Regulatory Notification" — written by "Prepare regulatory
notification"; read by "Submit notification to Regulator".
Data Store "Workflow / Escalation System Case Log" — written by "Set escalation
SLA timer in Workflow / Escalation System"; written by "Advance to next
escalation tier in Workflow / Escalation System"; read by "Review case for
escalation eligibility".

V07.08 Escalate if Needed manages the formal elevation of unresolved or
high-severity issues through defined escalation tiers, enforcing SLA discipline
and ensuring that legal or regulatory notification obligations are met wherever
they arise. It coordinates Complaints Management and Legal / Risk throughout the
loop, logging every tier advancement and compliance action. On conclusion it
hands a fully documented escalation outcome — with resolution code and any
regulatory correspondence — to V07.09 Communicate Outcome.
```

### V07.09 — Communicate Outcome

**BPMN diagram prompt.**

```text
BPMN: V07.09 Communicate Outcome — subprocess in the Issue to Resolution
value chain where Customer Service prepares and delivers the resolution outcome
to the complainant or customer following investigation and resolution.

1. Pools & Lanes

Pool "Service Organisation" — the organisation managing the issue resolution
process, containing the Customer Service lane.
Pool "Complainant / Customer / User" — the external party receiving the
outcome communication.
Pool "Email / Correspondence System" — the IT platform that sends and
manages outbound correspondence.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Complainant / Customer / User" — black-box, single instance.
Pool "Email / Correspondence System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Complainant / Customer / User
2. Service Organisation
3. Email / Correspondence System

4. Lane contents in flow order (Service Organisation)

Customer Service lane:
  Message start event "Resolution outcome received from Resolve or
    Fulfil Request (V07.07) or Escalate if Needed (V07.08)"
  User task "Review resolution details and determine communication
    content"
  User task "Draft outcome communication"
  Exclusive gateway "Communication type?"
    - branch "Written correspondence": Service task "Submit
        correspondence via Email / Correspondence System"
        Intermediate message catch event "Delivery confirmation
        received"
      Exclusive merge gateway "Communication type"
    - branch "Verbal or portal notification": User task "Contact
        customer directly and deliver outcome verbally or via
        portal"
      Exclusive merge gateway "Communication type"
  User task "Record communication details and update case"
  User task "Confirm compensation, refund or remedy details if
    applicable"
  Exclusive gateway "Further information required from customer?"
    - branch "Yes": Send task "Send request for further information"
        Intermediate message catch event "Customer response
        received"
      Exclusive merge gateway "Further information required"
    - branch "No": Exclusive merge gateway "Further information
        required"
  User task "Confirm outcome communicated and case status updated"
  End event "Outcome communicated — ready for Obtain Confirmation
    (V07.10)"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on User task "Draft outcome
communication" — label "SLA communication deadline approaching" —
triggers a non-interrupting escalation notification to the customer
experience manager to expedite drafting; flow rejoins the main path.
Interrupting error boundary event on Service task "Submit
correspondence via Email / Correspondence System" — label
"Correspondence delivery failure" — triggers User task "Retry or
select alternative communication channel"; flow rejoins before
Intermediate message catch event "Delivery confirmation received".

6. Connectors

Sequence flows: flow begins in the Customer Service lane at the
message start event and proceeds through review, drafting, then the
"Communication type?" gateway. The written-correspondence branch
passes through the service task and delivery confirmation event;
the verbal/portal branch passes through the direct-contact task.
Both branches rejoin at the "Communication type" merge gateway.
Flow continues through case update, remedy confirmation, then the
"Further information required?" gateway. The "Yes" branch sends the
request and awaits customer response; the "No" branch bypasses both.
Both branches rejoin at the "Further information required" merge
gateway before the final confirmation task and end event.

Message flows:
Complainant / Customer / User → Service Organisation (incoming
  resolution outcome details and any customer response to further
  information requests)
Service Organisation → Email / Correspondence System (outbound
  correspondence payload — outcome letter, compensation details,
  case reference)
Email / Correspondence System → Service Organisation (delivery
  confirmation receipt)
Service Organisation → Complainant / Customer / User (outcome
  communication — resolution advice, compensation or refund
  information, case closure notice)

7. Data objects

Data Object "Outcome Communication Draft" — written by "Draft
  outcome communication"; read by "Submit correspondence via Email /
  Correspondence System" and "Contact customer directly and deliver
  outcome verbally or via portal".
Data Object "Compensation / Remedy Details" — read by "Confirm
  compensation, refund or remedy details if applicable"; written by
  "Record communication details and update case".
Data Object "Delivery Confirmation Receipt" — written by
  Intermediate message catch event "Delivery confirmation received";
  read by "Record communication details and update case".
Data Object "Customer Response to Further Information Request" —
  written by Intermediate message catch event "Customer response
  received"; read by "Confirm outcome communicated and case status
  updated".
Data Store "Case Record" — read by "Review resolution details and
  determine communication content"; written by "Record communication
  details and update case" and "Confirm outcome communicated and
  case status updated".

V07.09 Communicate Outcome takes the resolved outcome from V07.07 or
V07.08 and ensures it reaches the complainant or customer through the
appropriate channel — written correspondence via the Email /
Correspondence System or direct verbal or portal contact — with all
compensation or remedy details confirmed and recorded. It hands a
fully communicated, case-updated record to V07.10 Obtain Confirmation,
where the customer's acknowledgement of the outcome is sought.
```

### V07.10 — Obtain Confirmation

**BPMN diagram prompt.**

```text
BPMN: V07.10 Obtain Confirmation — subprocess within V07 Issue to Resolution
in which the customer service agent seeks and records the customer's
confirmation that the outcome is satisfactory before the case is closed.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams seeking and recording
  confirmation.
  Lanes (top to bottom):
  - Customer Service (customer service agent)
Pool "Complainant / Customer / User" — external party who confirms or
  disputes the resolution outcome.
Pool "Customer Portal" — self-service platform through which the customer
  submits their confirmation or feedback response.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Complainant / Customer / User" — black-box, single instance.
Pool "Customer Portal" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Complainant / Customer / User
2. Service Organisation
3. Customer Portal

4. Lane contents in flow order (Service Organisation)

Customer Service lane:
  Message start event "Resolution outcome communicated — received from
    Communicate Outcome (V07.09)"
  User task "Prepare confirmation request"
  Send task "Send confirmation request to customer"
  Intermediate message catch event "Customer response received"
  Exclusive gateway "Response type?"
  - branch "Confirmed — satisfied":
      User task "Record customer confirmation"
      Service task "Update confirmation status in Customer Portal"
      End event "Confirmation recorded — ready for Close Case (V07.11)"
  - branch "Disputed — not satisfied":
      User task "Log customer dispute and capture reason"
      Expanded Subprocess "Repeat Until Resolution Accepted" (standard
        loop) containing, in order: User task "Clarify or escalate
        dispute with customer", Send task "Send revised outcome or
        explanation to customer", Intermediate message catch event
        "Customer response to revised outcome received"
      User task "Record revised confirmation status"
      Service task "Update confirmation status in Customer Portal"
      End event "Confirmation recorded — ready for Close Case (V07.11)"
  - branch "No response received":
      User task "Send follow-up confirmation request"
      Intermediate timer catch event "Follow-up response window elapsed"
      User task "Record non-response and set default closure status"
      Service task "Update confirmation status in Customer Portal"
      End event "Confirmation recorded — ready for Close Case (V07.11)"
  Exclusive merge gateway "Response type"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Resolution Accepted", labelled "Maximum dispute resolution period
  elapsed"; on trigger, flow exits the subprocess and proceeds to User
  task "Record unresolved dispute and escalate for review", followed by
  End event "Unresolved — escalated for review".

6. Connectors

Sequence flows: flow begins in the Customer Service lane at the message
  start event, proceeds through preparation and sending of the
  confirmation request, pauses at the intermediate message catch event,
  then reaches the exclusive gateway which branches into three paths —
  "Confirmed — satisfied", "Disputed — not satisfied", and "No response
  received"; the confirmed and no-response branches proceed directly to
  their respective tasks and end events; the disputed branch enters the
  expanded subprocess before reaching its tasks and end event; all three
  branches terminate at their own end events and do not rejoin; the
  timer boundary event on the expanded subprocess leads to a separate
  end event.

Message flows:
  Service Organisation → Complainant / Customer / User (confirmation
    request sent to customer)
  Complainant / Customer / User → Service Organisation (customer
    confirmation, dispute, or non-response)
  Service Organisation → Customer Portal (confirmation status update
    written after each branch resolution)
  Customer Portal → Service Organisation (portal confirmation record
    acknowledged)
  Service Organisation → Complainant / Customer / User (revised outcome
    or explanation sent during dispute loop)
  Complainant / Customer / User → Service Organisation (customer
    response to revised outcome during dispute loop)

7. Data objects

Data Object "Confirmation Request" — written by "Prepare confirmation
  request"; read by "Send confirmation request to customer".
Data Object "Customer Response" — written by intermediate message catch
  event "Customer response received"; read by exclusive gateway
  "Response type?".
Data Object "Customer Dispute Record" — written by "Log customer dispute
  and capture reason"; read by "Clarify or escalate dispute with
  customer".
Data Object "Revised Outcome Communication" — written by "Clarify or
  escalate dispute with customer"; read by "Send revised outcome or
  explanation to customer".
Data Store "Customer Portal Confirmation Record" — written by "Update
  confirmation status in Customer Portal" (all three branches and the
  dispute loop exit path).

V07.10 Obtain Confirmation seeks and records the customer's acceptance or
rejection of the resolution communicated in V07.09. The customer service agent
sends a confirmation request, captures the response through the Customer
Portal, and handles disputes through a structured loop until the customer
accepts or the maximum period elapses. The resulting confirmation or dispute
record is handed to Close Case (V07.11) to finalise the case.
```

### V07.11 — Close Case

**BPMN diagram prompt.**

```text
BPMN: V07.11 Close Case — the subprocess that formally closes a
resolved case, records quality checks, and updates all master records
within the Issue to Resolution value chain.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams that close the case
and assure its quality.
  Lane "Service Operations" — case manager who executes case closure.
  Lane "Quality Assurance" — quality analyst who reviews and signs off.
Pool "Case Management System" — platform where cases are recorded and
closed.
Pool "CRM System" — customer master record and interaction history store.

2. Pool properties

Pool "Service Organisation" — white-box, single instance.
Pool "Case Management System" — black-box, System = true, single instance.
Pool "CRM System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Service Organisation (white-box, contains both lanes)
2. Case Management System
3. CRM System

4. Lane contents in flow order (Service Organisation)

Service Operations lane:
  Message start event "Resolved case received from Communicate
  Outcome (V07.09)"
  User task "Review resolution record and confirm outcome is complete"
  Service task "Retrieve open action items from Case Management System"
  Exclusive gateway "All actions complete?"
  - branch "No — actions outstanding":
    Expanded Subprocess "Repeat Until All Actions Complete"
    (standard loop) containing, in order: User task "Follow up
    outstanding action items", Intermediate message catch event
    "Action item update received", User task "Update action item
    status in Case Management System"
  - branch "Yes — all actions complete":
    continue to exclusive merge gateway "All Actions Complete"
  Exclusive merge gateway "All Actions Complete"
  User task "Set case status to closed in Case Management System"
  Service task "Record closure code and resolution summary"
  Send task "Notify Quality Assurance of case ready for review"

Quality Assurance lane:
  Intermediate message catch event "Case closure notification received"
  User task "Review case record for completeness and policy compliance"
  Exclusive gateway "Quality check passed?"
  - branch "No — quality issue found":
    User task "Raise quality finding and return case to Service
    Operations"
    End event "Quality finding raised — case returned to Service
    Operations for correction" (does not rejoin)
  - branch "Yes — quality check passed":
    continue to exclusive merge gateway "Quality Check Outcome"
  Exclusive merge gateway "Quality Check Outcome"
  User task "Approve and sign off case closure"
  Service task "Update customer interaction history in CRM System"
  Service task "Write closure record to Case Management System"
  User task "Flag case for trend analysis if recurring or complex"
  End event "Case closed and records updated — ready for Analyse
  Trends (V07.12)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
All Actions Complete", labelled "Action resolution deadline exceeded",
leading to: User task "Escalate overdue actions to case manager
supervisor" in Service Operations lane, then rejoins at exclusive merge
gateway "All Actions Complete".

6. Connectors

Sequence flows: Flow begins in Service Operations with the message start
event and moves through the review, retrieval, and completeness gateway.
The outstanding-actions branch enters the standard-loop subprocess and
returns to the merge gateway; the timer boundary on that subprocess leads
to an escalation task that also rejoins the merge gateway. From the merge
gateway flow continues through closure coding and notification to Quality
Assurance. In the Quality Assurance lane, the quality-check gateway
splits: the failing branch ends in its own end event; the passing branch
rejoins at the quality check merge gateway, continues through approval,
system updates, and trend flagging, and finishes at the end event.

Message flows:
Case Management System → Service Operations "Open action items and
case record retrieved".
Service Operations → Case Management System "Case status set to
closed; closure code and resolution summary written".
Service Operations → Quality Assurance "Case ready for quality
review notification".
Quality Assurance → Case Management System "Approved closure record
written".
Quality Assurance → CRM System "Customer interaction history
updated with closure details".

7. Data objects

Data Object "Case Closure Record" — written by "Set case status to
closed in Case Management System"; read by "Review case record for
completeness and policy compliance".
Data Object "Resolution Summary" — written by "Record closure code
and resolution summary"; read by "Approve and sign off case closure".
Data Object "Quality Finding" — written by "Raise quality finding
and return case to Service Operations".
Data Object "Action Item List" — read by "Review resolution record
and confirm outcome is complete"; written by "Update action item
status in Case Management System".
Data Store "Case Management System record" — written by "Write
closure record to Case Management System"; read by "Retrieve open
action items from Case Management System".
Data Store "CRM customer history" — written by "Update customer
interaction history in CRM System".

V07.11 Close Case takes a resolved, communicated case and formally
closes it by verifying all action items are complete, recording
closure codes and resolution summaries, and subjecting the case to
a quality assurance review. Approved closures are written back to
the Case Management System and CRM as permanent records. The
subprocess hands flagged, closed cases — particularly recurring or
complex ones — to Analyse Trends (V07.12) for pattern analysis and
continuous improvement.
```

### V07.12 — Analyse Trends

**BPMN diagram prompt.**

```text
BPMN: V07.12 Analyse Trends — the final subprocess of V07 Issue to
Resolution, converting closed case data into actionable intelligence.

1. Pools & Lanes

Pool "Service Organisation" — the internal teams that conduct trend analysis
  and act on findings.
Pool "Analytics / BI System" — the analytics and business intelligence
  platform that stores and processes trend data.

2. Pool properties

Pool "Service Organisation": white-box, single instance.
Pool "Analytics / BI System": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Service Organisation (white-box, contains all lanes)
2. Analytics / BI System (black-box, bottom)

4. Lane contents in flow order (Service Organisation)

Quality Assurance lane:
  Start event "Closed case data available — ready for Analyse Trends (V07.12)"
  Service task "Extract closed case and resolution data"
  Service task "Aggregate issue categories, resolution codes, and SLA outcomes"
  User task "Review aggregated trend report"
  Exclusive gateway "Significant trend or pattern identified?"
    - branch "No significant trend": End event "No action required —
      analysis complete"
    - branch "Significant trend identified": continue to next task
  Exclusive merge gateway "Significant trend or pattern identified"
  User task "Document trend findings and draft recommendations"
  User task "Prepare trend analysis report"
  Send task "Submit trend analysis report to Product / Engineering"

Product / Engineering lane:
  Intermediate message catch event "Trend analysis report received"
  User task "Review trend findings and assess product or service impact"
  Exclusive gateway "Root cause addressable by Product / Engineering?"
    - branch "Yes": User task "Initiate product or process improvement action"
      then Exclusive merge gateway "Root cause addressable"
    - branch "No — systemic or policy issue": User task
      "Escalate findings to Quality Assurance for policy review"
      then Exclusive merge gateway "Root cause addressable"
  Exclusive merge gateway "Root cause addressable"
  User task "Record improvement action or escalation outcome"
  Send task "Confirm action taken to Quality Assurance"

Quality Assurance lane (continued):
  Intermediate message catch event "Action confirmation received"
  User task "Update knowledge base articles based on trend findings"
  User task "Log trend report and actions in case management record"
  End event "Trend analysis complete — Issue to Resolution cycle closed"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Prepare trend analysis report" —
  label "Reporting deadline reached" — triggers Send task "Issue overdue
  trend report notification" leading to an End event "Report escalated due
  to deadline".

6. Connectors

Sequence flows: work begins in the Quality Assurance lane with extraction
and aggregation tasks, passes through the significance gateway — the "No
significant trend" branch ends immediately; the "significant trend" branch
continues to documentation and submission. Flow crosses to the Product /
Engineering lane on receipt of the report, passes through the root-cause
gateway — the "Yes" branch raises an improvement action, the "No" branch
escalates to Quality Assurance for policy review — both branches rejoin at
the merge gateway before recording and confirmation. Flow returns to the
Quality Assurance lane for knowledge base update and final logging before
the end event.

Message flows:
  Quality Assurance (Send task "Submit trend analysis report to Product /
    Engineering") → Product / Engineering lane (Intermediate message catch
    event "Trend analysis report received") (trend analysis report)
  Product / Engineering lane (Send task "Confirm action taken to Quality
    Assurance") → Quality Assurance lane (Intermediate message catch event
    "Action confirmation received") (improvement action confirmation)
  Service Organisation (Service task "Extract closed case and resolution
    data") → Analytics / BI System (closed case records, resolution codes,
    SLA outcomes, issue categories)
  Analytics / BI System → Service Organisation (Service task "Aggregate
    issue categories, resolution codes, and SLA outcomes") (aggregated
    trend datasets and reporting dashboards)
  Service Organisation (User task "Update knowledge base articles based on
    trend findings") → Analytics / BI System (updated knowledge article
    references and trend report records)

7. Data objects

Data Store "Case Management Record" — read by "Extract closed case and
  resolution data"; written by "Log trend report and actions in case
  management record".
Data Object "Aggregated Trend Report" — written by "Aggregate issue
  categories, resolution codes, and SLA outcomes"; read by "Review
  aggregated trend report".
Data Object "Trend Analysis Report" — written by "Prepare trend analysis
  report"; read by "Submit trend analysis report to Product / Engineering"
  and "Review trend findings and assess product or service impact".
Data Object "Improvement Action Record" — written by "Initiate product or
  process improvement action" and "Record improvement action or escalation
  outcome"; read by "Confirm action taken to Quality Assurance".
Data Object "Knowledge Base Update" — written by "Update knowledge base
  articles based on trend findings".

V07.12 Analyse Trends converts the accumulated data from closed cases across
the full Issue to Resolution cycle into structured insight. Quality Assurance
extracts and aggregates resolution patterns, SLA outcomes, and issue categories
from the Analytics / BI System, then hands significant findings to Product /
Engineering for corrective or improvement action. Confirmed actions are fed back
into the knowledge base and case management record, closing the improvement loop
and completing the V07 value chain.
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
BPMN: V08.01 Identify Asset Need — first subprocess of the Acquire to
Retire value chain, capturing and validating an internal need for a new or
replacement asset before investment approval is sought.

1. Pools & Lanes

Pool "Asset Management Organisation" — the internal organisation running
the identification and assessment process, with two lanes.
  Lane "Operations" — operations manager identifies and submits the need.
  Lane "Asset Management" — asset manager reviews, assesses, and forwards
  the validated need.
Pool "Enterprise Asset Management System" — system that records asset
needs and provides existing asset data.

2. Pool properties

Pool "Asset Management Organisation": white-box, single instance.
Pool "Enterprise Asset Management System": black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Asset Management Organisation (white-box, two lanes: Operations on
   top, Asset Management below)
2. Enterprise Asset Management System

4. Lane contents in flow order (Asset Management Organisation)

Operations lane:
  None start event "Asset need identified internally"
  User task "Document asset need and business justification"
  User task "Classify asset type and priority"
  Send task "Submit asset need request to Asset Management"

Asset Management lane:
  Message intermediate catch event "Asset need request received"
  Service task "Query existing asset register for alternatives"
  User task "Review and assess asset need request"
  Exclusive gateway "Need justified and no suitable existing asset?"
    - branch "Not justified or alternative exists": User task "Return
      request with findings to Operations"
      - this branch ends at: End event "Asset need closed — no further
        action required"
    - branch "Justified and no alternative": continue to next step
  Exclusive merge gateway "Need justified and no suitable existing asset"
  User task "Prepare validated asset need summary"
  Service task "Record validated asset need in Enterprise Asset
  Management System"
  End event "Validated asset need confirmed — ready for Approve
  Investment (V08.02)"

5. Edge-mounted (boundary) events

None.

6. Connectors

Sequence flows: within Operations lane, work moves from the start event
through documenting, classifying, and submitting the need. In the Asset
Management lane, flow continues from the message catch event through the
register query, review, and the exclusive gateway. The "Not justified or
alternative exists" branch leads to the return task and its own
terminating end event; the "Justified and no alternative" branch rejoins
at the exclusive merge gateway, then continues through preparation and
recording to the process end event.

Message flows:
Asset Management Organisation (Operations lane, Send task "Submit asset
need request to Asset Management") → Asset Management Organisation (Asset
Management lane, Message intermediate catch event "Asset need request
received") (internal asset need request — modelled as message to show
handoff between lanes across the gateway boundary).
Asset Management Organisation (Asset Management lane, Service task "Query
existing asset register for alternatives") → Enterprise Asset Management
System (existing asset data and utilisation status).
Enterprise Asset Management System → Asset Management Organisation (Asset
Management lane, Service task "Query existing asset register for
alternatives") (asset register query results).
Asset Management Organisation (Asset Management lane, Service task
"Record validated asset need in Enterprise Asset Management System") →
Enterprise Asset Management System (validated asset need record).

7. Data objects

Data Object "Asset Need Request" — written by User task "Document asset
need and business justification"; read by User task "Review and assess
asset need request".
Data Object "Asset Classification and Priority" — written by User task
"Classify asset type and priority"; read by User task "Review and assess
asset need request".
Data Object "Validated Asset Need Summary" — written by User task
"Prepare validated asset need summary"; read by Service task "Record
validated asset need in Enterprise Asset Management System".
Data Store "Enterprise Asset Management System Register" — read by
Service task "Query existing asset register for alternatives"; written by
Service task "Record validated asset need in Enterprise Asset Management
System".

This subprocess captures an internally generated asset need, classifies
and justifies it against existing assets held in the Enterprise Asset
Management System, and either closes requests that cannot be justified or
produces a validated asset need summary ready for formal investment
review. The validated need summary is handed to V08.02 Approve Investment,
where a budget holder and Finance will assess and authorise capital
expenditure.
```

### V08.02 — Approve Investment

**BPMN diagram prompt.**

```text
BPMN: V08.02 Approve Investment — second subprocess in the Acquire to
Retire value chain, receiving a validated asset need from V08.01 and
forwarding an approved capital request to V08.03.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation running the
approval process, with lanes for Asset Management, Investment Approver,
and Finance.
Pool "Finance / General Ledger System" — IT system recording approved
capital requests and providing budget data.

2. Pool properties

Pool "Asset Management Organisation": white-box, single instance.
Pool "Finance / General Ledger System": black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Asset Management Organisation (white-box, three lanes top to bottom:
   Asset Management, Investment Approver, Finance)
2. Finance / General Ledger System

4. Lane contents in flow order (Asset Management Organisation)

Asset Management lane:
  Message start event "Asset need received from Identify Asset Need
  (V08.01)"
  User task "Prepare capital expenditure request"
  User task "Compile supporting business case and cost estimates"
  Send task "Submit capital expenditure request for investment approval"
  Intermediate message catch event "Investment decision received"
  Exclusive gateway "Investment approved?"
  - branch "Approved": continue to User task "Notify originator of
    approval and trigger acquisition"
  - branch "Rejected": continue to User task "Notify originator of
    rejection with reasons"
  Exclusive merge gateway "Investment approved?"
  End event "Capital request outcome recorded — approved request ready
  for Acquire or Lease Asset (V08.03)"

Investment Approver lane:
  User task "Review capital expenditure request and business case"
  Exclusive gateway "Sufficient information provided?"
  - branch "Yes": continue to Expanded Subprocess "Repeat Until
    Approved or Rejected" (standard loop) containing, in order:
    User task "Assess against delegation of authority and capex
    policy", User task "Record investment decision"
  - branch "No": continue to Send task "Request additional information
    from Asset Management"
  Exclusive merge gateway "Sufficient information provided?"
  Intermediate message catch event "Additional information received"

Finance lane:
  User task "Validate budget availability and cost estimates"
  Service task "Post approved capital request to Finance / General
  Ledger System"
  User task "Confirm budget reservation"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Approved or Rejected", labelled "Approval deadline exceeded (policy
limit)", leading to End event "Approval timed out — escalate to senior
budget holder".

6. Connectors

Sequence flows: flow begins in the Asset Management lane with the
message start event, moves through request preparation and submission,
then crosses to the Investment Approver lane for review; the
"Sufficient information provided?" gateway branches to either the
approval subprocess or a request for more information, with the
information-request branch waiting at an intermediate message catch
event before rejoining the merge gateway and entering the approval
subprocess; after the investment decision is recorded the flow returns
to the Asset Management lane at the intermediate message catch event,
then the "Investment approved?" gateway branches to either the approval
notification or rejection notification, both rejoining at the merge
gateway and ending; the Finance lane tasks run between the Investment
Approver's review and the return of the decision, with budget
validation, posting, and confirmation completing before the decision is
sent back.

Message flows:
Asset Management Organisation (Send task "Submit capital expenditure
request for investment approval") → Finance / General Ledger System
(capital expenditure request submitted for budget check).
Finance / General Ledger System → Asset Management Organisation (User
task "Validate budget availability and cost estimates") (budget
availability data and cost reference).
Asset Management Organisation (Service task "Post approved capital
request to Finance / General Ledger System") → Finance / General
Ledger System (approved capital request entry).

7. Data objects

Data Object "Capital Expenditure Request" — written by User task
"Prepare capital expenditure request"; read by User task "Review
capital expenditure request and business case".
Data Object "Business Case and Cost Estimates" — written by User task
"Compile supporting business case and cost estimates"; read by User
task "Validate budget availability and cost estimates".
Data Object "Investment Decision Record" — written by User task
"Record investment decision"; read by Intermediate message catch event
"Investment decision received".
Data Store "Finance / General Ledger" — written by Service task "Post
approved capital request to Finance / General Ledger System"; read by
User task "Validate budget availability and cost estimates".

V08.02 Approve Investment governs the formal review and authorisation
of capital spend against delegation-of-authority limits and capex
policy, ensuring budget is available before any commitment is made. It
checks the business case, obtains the required sign-off, and reserves
the budget in the general ledger. An approved capital request is then
handed to V08.03 Acquire or Lease Asset to begin sourcing the asset.
```

### V08.03 — Acquire or Lease Asset

**BPMN diagram prompt.**

```text
BPMN: V08.03 Acquire or Lease Asset — third subprocess in the Acquire to
Retire value chain, triggered by an approved capital or lease request from
V08.02 and handing a contracted asset arrangement to V08.04.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation executing the
acquisition or lease process, containing Procurement and Legal lanes.
Pool "Asset Seller" — external party providing an asset for outright purchase.
Pool "Supplier" — external party supplying goods or equipment under a
purchase order.
Pool "Lessor" — external party providing an asset under a lease arrangement.
Pool "Procurement System" — IT system managing purchase orders, quotes,
and supplier records.

2. Pool properties

Pool "Asset Management Organisation": white-box, single instance.
Pool "Asset Seller": black-box, single instance.
Pool "Supplier": black-box, single instance.
Pool "Lessor": black-box, single instance.
Pool "Procurement System": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Asset Seller
2. Supplier
3. Lessor
4. Asset Management Organisation
5. Procurement System

4. Lane contents in flow order (Asset Management Organisation)

Procurement lane:
  Message start event "Approved investment request received from V08.02"
  User task "Review approved request and determine acquisition mode"
  Exclusive gateway "Acquisition mode?"
  - branch "Purchase from seller": User task "Solicit quotes from Asset
    Seller"
    Intermediate message catch event "Quotes received from Asset Seller"
    User task "Evaluate quotes and select Asset Seller"
    User task "Raise purchase order for asset"
    Service task "Record purchase order in Procurement System"
    Send task "Send purchase order to Asset Seller"
    Intermediate message catch event "Order acknowledgement received from
    Asset Seller"
  - branch "Purchase from supplier": User task "Solicit quotes from Supplier"
    Intermediate message catch event "Quotes received from Supplier"
    User task "Evaluate quotes and select Supplier"
    User task "Raise purchase order for asset"
    Service task "Record purchase order in Procurement System"
    Send task "Send purchase order to Supplier"
    Intermediate message catch event "Order acknowledgement received from
    Supplier"
  - branch "Lease": User task "Identify and approach Lessor"
    Intermediate message catch event "Lease terms received from Lessor"
    User task "Evaluate lease terms and select Lessor"
  Exclusive merge gateway "Acquisition mode"
  User task "Prepare contract or lease agreement for legal review"
  Send task "Send draft contract to Legal for review"

Legal lane:
  Intermediate message catch event "Draft contract received from Procurement"
  Expanded Subprocess "Repeat Until Contract Approved" (standard loop)
    containing, in order: User task "Review contract or lease terms",
    User task "Negotiate terms with counterparty",
    User task "Update contract draft"
  User task "Confirm contract approved and ready for signature"
  Send task "Return approved contract to Procurement"

Procurement lane (continued):
  Intermediate message catch event "Approved contract received from Legal"
  User task "Obtain authorised signatures on contract"
  Send task "Send signed contract to counterparty"
  Intermediate message catch event "Countersigned contract received"
  User task "File executed contract"
  Service task "Update Procurement System with contract details"
  End event "Executed contract confirmed — ready for Receive and
    Register Asset (V08.04)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Contract Approved", label "Negotiation deadline exceeded", leading to
an End event "Contract negotiation failed — escalate to asset manager".

6. Connectors

Sequence flows: flow begins in the Procurement lane at the message start
event, passes through the mode gateway whose three branches (purchase from
seller, purchase from supplier, lease) each complete their respective tasks
and rejoin at the exclusive merge gateway "Acquisition mode"; flow continues
to contract preparation and a hand-off to the Legal lane, where the loop
subprocess runs until the contract is approved and is returned to
Procurement; Procurement obtains signatures, exchanges the countersigned
contract, updates the system, and reaches the end event.

Message flows:
Asset Management Organisation (Procurement) → Asset Seller (request for
  quotes and purchase order).
Asset Seller → Asset Management Organisation (Procurement) (quotes and
  order acknowledgement).
Asset Management Organisation (Procurement) → Supplier (request for quotes
  and purchase order).
Supplier → Asset Management Organisation (Procurement) (quotes and order
  acknowledgement).
Asset Management Organisation (Procurement) → Lessor (lease enquiry and
  draft lease terms request).
Lessor → Asset Management Organisation (Procurement) (lease terms).
Asset Management Organisation (Procurement) → Procurement System (purchase
  order and contract details).
Asset Management Organisation (Legal) → Asset Seller (negotiated contract
  terms during loop, and signed contract).
Asset Management Organisation (Legal) → Supplier (negotiated contract terms
  during loop, and signed contract).
Asset Management Organisation (Legal) → Lessor (negotiated lease terms
  during loop, and signed lease agreement).
Asset Seller → Asset Management Organisation (Procurement) (countersigned
  contract).
Supplier → Asset Management Organisation (Procurement) (countersigned
  contract).
Lessor → Asset Management Organisation (Procurement) (countersigned lease
  agreement).

7. Data objects

Data Object "Approved Investment Request" — read by User task "Review
  approved request and determine acquisition mode".
Data Object "Request for Quotation" — written by User task "Solicit quotes
  from Asset Seller"; written by User task "Solicit quotes from Supplier";
  written by User task "Identify and approach Lessor".
Data Object "Supplier / Seller Quotes" — read by User task "Evaluate quotes
  and select Asset Seller"; read by User task "Evaluate quotes and select
  Supplier".
Data Object "Lease Terms" — read by User task "Evaluate lease terms and
  select Lessor".
Data Object "Purchase Order" — written by User task "Raise purchase order
  for asset"; read by Service task "Record purchase order in Procurement
  System"; read by Send task "Send purchase order to Asset Seller"; read by
  Send task "Send purchase order to Supplier".
Data Object "Draft Contract / Lease Agreement" — written by User task
  "Prepare contract or lease agreement for legal review"; read by User task
  "Review contract or lease terms"; written by User task "Update contract
  draft".
Data Object "Executed Contract" — written by User task "Obtain authorised
  signatures on contract"; read by Service task "Update Procurement System
  with contract details"; read by User task "File executed contract".

V08.03 Acquire or Lease Asset selects the appropriate acquisition mode
(outright purchase from a seller or supplier, or lease from a lessor),
manages the quotation and ordering steps, and steers the draft contract
through legal negotiation until a fully countersigned agreement is in place.
The executed contract and the recorded purchase order are then handed to
V08.04 Receive and Register Asset, which takes physical or digital receipt
of the asset and enters it onto the fixed asset register.
```

### V08.04 — Receive and Register Asset

**BPMN diagram prompt.**

```text
BPMN: V08.04 Receive and Register Asset — fourth subprocess in the
Acquire to Retire value chain, converting a delivered asset into a
formally registered fixed asset record.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation receiving and
registering the asset, white-box with four lanes top to bottom.
  Lane "Facilities / Receiving" — facilities manager oversees physical
  receipt, inspection, and tagging.
  Lane "Asset Management" — asset manager creates and confirms the asset
  master record.
  Lane "Finance" — implied from capitalisation policy; finance accountant
  activates the asset in the fixed asset register (note: Finance lane
  is not listed in the matrix for V08.04 but capitalisation and
  insurance notification require a Finance touch; kept minimal).
  Note: Finance lane omitted — narrative assigns only Facilities /
  Receiving and Asset Management to V08.04; Insurer is external.

Pool "Asset Management Organisation" — corrected to two lanes only:
  Lane "Facilities / Receiving" (facilities manager)
  Lane "Asset Management" (asset manager)

Pool "Supplier" — external party delivering the asset and its
documentation.
Pool "Insurer" — external party notified of the new asset for insurance
cover.
Pool "ERP Fixed Asset Register" — IT system that holds the permanent
asset master record.

2. Pool properties

Pool "Asset Management Organisation" — white-box, single instance.
Pool "Supplier" — black-box, single instance.
Pool "Insurer" — black-box, single instance.
Pool "ERP Fixed Asset Register" — black-box, System = true, single
instance.

3. Layout

Top to bottom:
1. Supplier
2. Asset Management Organisation (white-box; Facilities / Receiving lane
   above Asset Management lane)
3. Insurer
4. ERP Fixed Asset Register

4. Lane contents in flow order (Asset Management Organisation)

Facilities / Receiving lane:
  Message start event "Asset and delivery documentation received from
  Supplier (V08.03)"
  User task "Verify delivery against purchase order and packing list"
  Exclusive gateway "Delivery correct and complete?"
  - branch "No — discrepancy found": User task "Record discrepancy and
    notify Supplier"; Send task "Send discrepancy notice to Supplier";
    Intermediate message catch event "Supplier response received";
    Exclusive merge gateway "Delivery correct and complete?"
  - branch "Yes": continue to next task
  Exclusive merge gateway "Delivery correct and complete?"
  User task "Inspect asset condition and check for damage"
  Exclusive gateway "Asset condition acceptable?"
  - branch "No — damage or defect": User task "Raise rejection or
    insurance claim notification"; Send task "Send claim notification to
    Insurer"; End event "Asset rejected — discrepancy escalated, process
    on hold"
  - branch "Yes — accepted": continue to next task
  Exclusive merge gateway "Asset condition acceptable?"
  User task "Affix asset tag and record serial number, make, and model"
  User task "Capture location and custodian details"
  Send task "Forward asset receipt confirmation and documentation to
  Asset Management"

Asset Management lane:
  Intermediate message catch event "Asset receipt confirmation and
  documentation received from Facilities / Receiving"
  User task "Create asset master record in ERP Fixed Asset Register"
  Service task "Submit asset master data to ERP Fixed Asset Register"
  Intermediate message catch event "Asset record creation confirmed by
  ERP Fixed Asset Register"
  User task "Assign depreciation method, useful life, and residual value"
  Service task "Update depreciation rules in ERP Fixed Asset Register"
  User task "Attach warranty, delivery, and purchase documentation to
  asset record"
  Service task "Store documents in ERP Fixed Asset Register"
  Send task "Notify Insurer of new asset details for insurance cover"
  Intermediate message catch event "Insurance cover confirmation received
  from Insurer"
  User task "Confirm asset registration is complete and update asset
  status to Active"
  End event "Asset registered and active — ready for Deploy Asset
  (V08.05)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on User task "Verify delivery against
purchase order and packing list" — label "Delivery overdue (2 business
days)" — triggers User task "Escalate overdue delivery to Procurement"
which flows to a terminating End event "Delivery escalation raised".

Interrupting timer boundary event on Intermediate message catch event
"Supplier response received" — label "Supplier response overdue
(3 business days)" — triggers Send task "Escalate unresolved discrepancy
to Procurement manager" which flows to a terminating End event
"Discrepancy unresolved — escalated".

6. Connectors

Sequence flows: within Facilities / Receiving lane the flow runs from
the message start event through delivery verification (looping via the
discrepancy branch and exclusive merge until delivery is confirmed
correct), then through condition inspection (with the damage branch
ending in its own end event), then through tagging, location capture,
and the send task to Asset Management. Within Asset Management lane the
flow runs from the intermediate catch event through master-record
creation, depreciation-rule assignment, document attachment, insurer
notification, cover confirmation, and status confirmation, ending at the
registered end event. The two lanes connect via the send task in
Facilities / Receiving and the intermediate catch event at the top of
Asset Management lane.

Message flows:
Supplier → Facilities / Receiving lane (asset delivery, packing list,
delivery note, warranty, and purchase documentation)
Facilities / Receiving lane → Supplier (discrepancy notice)
Supplier → Facilities / Receiving lane (supplier response to discrepancy)
Asset Management lane → ERP Fixed Asset Register (asset master data
creation request)
ERP Fixed Asset Register → Asset Management lane (asset record creation
confirmation)
Asset Management lane → ERP Fixed Asset Register (depreciation rules
update)
Asset Management lane → ERP Fixed Asset Register (warranty and purchase
documents for attachment)
Asset Management lane → Insurer (new asset details for insurance cover)
Insurer → Asset Management lane (insurance cover confirmation)

7. Data objects

Data Object "Delivery Note / Packing List" — read by / written by
"Verify delivery against purchase order and packing list".
Data Object "Discrepancy Report" — written by "Record discrepancy and
notify Supplier"; read by "Raise rejection or insurance claim
notification".
Data Object "Asset Tag Record" — written by "Affix asset tag and record
serial number, make, and model".
Data Object "Asset Master Data" — written by "Create asset master record
in ERP Fixed Asset Register"; read by "Submit asset master data to ERP
Fixed Asset Register".
Data Object "Depreciation Rules" — written by "Assign depreciation
method, useful life, and residual value"; read by "Update depreciation
rules in ERP Fixed Asset Register".
Data Object "Warranty and Purchase Documentation" — written by "Attach
warranty, delivery, and purchase documentation to asset record"; read by
"Store documents in ERP Fixed Asset Register".
Data Object "Insurance Cover Confirmation" — read by "Confirm asset
registration is complete and update asset status to Active".
Data Store "ERP Fixed Asset Register" — written by "Submit asset master
data to ERP Fixed Asset Register", "Update depreciation rules in ERP
Fixed Asset Register", "Store documents in ERP Fixed Asset Register";
read by "Confirm asset registration is complete and update asset status
to Active".

V08.04 Receive and Register Asset takes the delivered physical asset from
V08.03 and converts it into a formally active record in the ERP Fixed
Asset Register, complete with serial number, location, custodian,
depreciation rules, and attached documentation. Discrepancies and damage
are resolved or escalated before registration proceeds, and the Insurer
is notified so cover is in place from the moment the asset goes live.
The subprocess hands a fully registered, Active-status asset record to
V08.05 Deploy Asset.
```

### V08.05 — Deploy Asset

**BPMN diagram prompt.**

```text
BPMN: V08.05 Deploy Asset — the subprocess within V08 Acquire to
Retire in which a received and registered asset is configured, installed,
handed over to operations, and recorded in the asset management systems,
completing readiness for active use.

1. Pools & Lanes

Pool "Asset Management Organisation" — the internal organisation carrying
out deployment activities across IT/Facilities and Operations teams.
  Lane "IT / Facilities" — IT asset manager leads configuration,
    installation, and system registration.
  Lane "Operations" — operations manager accepts the asset, confirms
    readiness, and signs off deployment.
Pool "Service Provider" — external party that assists with installation
  or commissioning on site.
Pool "IT Asset Management System / Facilities Management System" —
  IT system that records asset location, custodian, and deployment status.

2. Pool properties

Pool "Asset Management Organisation" — white-box, single instance.
Pool "Service Provider" — black-box, single instance.
Pool "IT Asset Management System / Facilities Management System" —
  black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Service Provider
2. Asset Management Organisation
3. IT Asset Management System / Facilities Management System

4. Lane contents in flow order (Asset Management Organisation)

IT / Facilities lane:
  Message start event "Asset registered — received from Receive and
    Register Asset (V08.04)"
  User task "Review asset specification and deployment plan"
  User task "Prepare deployment package (configuration, access rights,
    location assignment)"
  Send task "Request on-site installation or commissioning support"
  Intermediate message catch event "Installation or commissioning
    complete confirmation received"
  User task "Configure and test asset"
  Exclusive gateway "Configuration and test passed?"
    - branch "Yes": continue to Service task "Record deployment details
        in IT Asset Management System / Facilities Management System"
    - branch "No": Expanded Subprocess "Repeat Until Configuration
        Passes" (standard loop) containing, in order: User task
        "Identify and resolve configuration fault", User task
        "Re-test asset"
      Exclusive merge gateway "Repeat Until Configuration Passes"
        rejoins "Yes" branch before Service task "Record deployment
        details in IT Asset Management System / Facilities Management
        System"
  Exclusive merge gateway "Configuration and test passed"
  Service task "Record deployment details in IT Asset Management System
    / Facilities Management System"
  User task "Assign asset tag, location, and custodian"
  Send task "Notify Operations of asset readiness"

Operations lane:
  Intermediate message catch event "Asset readiness notification
    received"
  User task "Inspect deployed asset and verify against deployment plan"
  Exclusive gateway "Asset accepted by Operations?"
    - branch "Yes": continue to User task "Sign off deployment
        acceptance"
    - branch "No — issues found": User task "Log deployment issues and
        return to IT / Facilities for resolution"
      End event "Deployment rejected — returned for remediation"
  Exclusive merge gateway "Asset accepted by Operations"
  User task "Sign off deployment acceptance"
  End event "Asset deployed and active — ready for Maintain Asset
    (V08.06)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Configuration Passes" — label "Configuration deadline exceeded (48 h)"
  — triggers End event "Deployment escalated — configuration unresolved
  after deadline".
Interrupting timer boundary event on User task "Request on-site
  installation or commissioning support" — label "Commissioning support
  not confirmed within 2 business days" — triggers User task "Escalate
  to Service Provider contract manager".

6. Connectors

Sequence flows: Flow begins in the IT / Facilities lane with the message
start event and proceeds through planning, deployment package
preparation, and the send task to the Service Provider. After the
intermediate message catch event, flow continues to configuration and
testing. The exclusive gateway "Configuration and test passed?" splits
to the "Yes" branch leading forward and the "No" branch entering the
standard-loop subprocess; both branches rejoin at the exclusive merge
gateway "Configuration and test passed" before the service task. Flow
then moves through asset tagging and the send task into the Operations
lane via the intermediate message catch event. The exclusive gateway
"Asset accepted by Operations?" splits to the acceptance branch, which
rejoins at the exclusive merge gateway "Asset accepted by Operations"
before the sign-off task and the end event, and the rejection branch,
which ends at its own end event without rejoining.

Message flows:
Service Provider → IT / Facilities (installation or commissioning
  complete confirmation)
IT / Facilities → Service Provider (request for on-site installation or
  commissioning support)
IT / Facilities → IT Asset Management System / Facilities Management
  System (deployment details, asset tag, location, and custodian data)
IT Asset Management System / Facilities Management System → IT /
  Facilities (deployment record confirmation)

7. Data objects

Data Object "Deployment Plan" — read by User task "Review asset
  specification and deployment plan"; written by User task "Prepare
  deployment package (configuration, access rights, location
  assignment)".
Data Object "Configuration and Test Report" — written by User task
  "Configure and test asset"; read by Exclusive gateway "Configuration
  and test passed?".
Data Object "Deployment Acceptance Record" — written by User task "Sign
  off deployment acceptance"; read by End event "Asset deployed and
  active — ready for Maintain Asset (V08.06)".
Data Store "IT Asset Management System / Facilities Management System
  Register" — written by Service task "Record deployment details in IT
  Asset Management System / Facilities Management System"; read by User
  task "Assign asset tag, location, and custodian".

V08.05 Deploy Asset takes a registered asset from V08.04 and moves it
through configuration, installation with external Service Provider
support, testing, system registration, and formal Operations acceptance.
Once the operations manager signs off deployment, the asset is live and
assigned to a custodian, and the subprocess hands a fully recorded,
active asset to V08.06 Maintain Asset.
```

### V08.06 — Maintain Asset

**BPMN diagram prompt.**

```text
BPMN: V08.06 Maintain Asset — subprocess in the Acquire to Retire value
chain where scheduled and reactive maintenance is planned, executed by a
Maintenance Contractor, and recorded so the asset remains operational.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation planning and
oversighting maintenance activity, with lanes for Maintenance and
Operations.
Pool "Maintenance Contractor" — external party that carries out
inspection, repair, and servicing work on the asset.
Pool "Maintenance Management System" — IT system that holds maintenance
schedules, work orders, and service records.

2. Pool properties

Pool "Asset Management Organisation" — white-box, single instance.
Pool "Maintenance Contractor" — black-box, single instance.
Pool "Maintenance Management System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Maintenance Contractor
2. Asset Management Organisation
3. Maintenance Management System

4. Lane contents in flow order (Asset Management Organisation)

Maintenance lane:

Message start event "Asset ready for maintenance received from
Deploy Asset (V08.05)"

User task "Review maintenance schedule and asset condition"

Exclusive gateway "Maintenance type?"
- branch "Scheduled maintenance": Service task "Raise scheduled
  work order in Maintenance Management System"
- branch "Reactive / breakdown maintenance": User task "Assess
  breakdown and determine urgency"
Exclusive merge gateway "Maintenance type"

Service task "Issue work order to Maintenance Contractor"

Intermediate message catch event "Inspection or repair report
received from Maintenance Contractor"

User task "Review inspection and repair report"

Exclusive gateway "Work acceptable?"
- branch "No — rework required": Send task "Return work order
  with rework instructions to Maintenance Contractor"
  Intermediate message catch event "Revised report received from
  Maintenance Contractor"
  (rejoins at merge below)
- branch "Yes": (proceed to merge)
Exclusive merge gateway "Work acceptable"

User task "Record maintenance outcome and update asset condition"

Service task "Close work order in Maintenance Management System"

Operations lane:

User task "Confirm asset returned to operational service"

Service task "Update utilisation and availability status in
Maintenance Management System"

End event "Maintenance completed and recorded — ready for Monitor
Utilisation and Condition (V08.07)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on expanded subprocess — if the
narrative implied a loop, the work order review cycle is modelled as
sequential tasks; no loop subprocess is required here.
Interrupting timer boundary event on User task "Assess breakdown and
determine urgency" — label "Urgency deadline exceeded (4 hours)";
triggers Send task "Escalate breakdown to operations manager" leading
to an Escalation end event "Breakdown escalated".
Non-interrupting message boundary event on Service task "Issue work
order to Maintenance Contractor" — label "Contractor unavailable
notification received"; triggers User task "Identify alternative
contractor or reschedule" and rejoins before the intermediate message
catch event.

6. Connectors

Sequence flows: Flow begins in the Maintenance lane with the message
start event, moves through the schedule review and gateway to raise the
correct work order, then issues that work order to the contractor. On
receipt of the inspection or repair report the flow passes through the
acceptability gateway; the rework branch loops back via an intermediate
catch event to the merge gateway. Accepted work continues to the
Maintenance lane task to record the outcome and close the work order,
then crosses to the Operations lane for operational confirmation and
status update, ending at the end event.

Message flows:
Asset Management Organisation (Service task "Issue work order to
Maintenance Contractor") → Maintenance Contractor (work order and
scope of work)
Maintenance Contractor → Asset Management Organisation (Intermediate
message catch event "Inspection or repair report received") (inspection
or repair report)
Asset Management Organisation (Send task "Return work order with
rework instructions to Maintenance Contractor") → Maintenance
Contractor (rework instructions)
Maintenance Contractor → Asset Management Organisation (Intermediate
message catch event "Revised report received from Maintenance
Contractor") (revised inspection or repair report)
Asset Management Organisation (Service task "Raise scheduled work order
in Maintenance Management System") → Maintenance Management System
(scheduled work order data)
Asset Management Organisation (Service task "Close work order in
Maintenance Management System") → Maintenance Management System (work
order closure and outcome data)
Asset Management Organisation (Service task "Update utilisation and
availability status in Maintenance Management System") → Maintenance
Management System (availability and condition update)
Maintenance Management System → Asset Management Organisation (Service
task "Review maintenance schedule and asset condition") (maintenance
schedule and asset history)

7. Data objects

Data Object "Work Order" — written by Service task "Raise scheduled
work order in Maintenance Management System"; written by User task
"Assess breakdown and determine urgency"; read by Service task "Issue
work order to Maintenance Contractor"; written by Service task "Close
work order in Maintenance Management System".
Data Object "Inspection and Repair Report" — written by Maintenance
Contractor (external); read by User task "Review inspection and repair
report"; read by User task "Record maintenance outcome and update asset
condition".
Data Object "Rework Instructions" — written by Send task "Return work
order with rework instructions to Maintenance Contractor"; read by
Maintenance Contractor (external).
Data Store "Maintenance Management System" — read by User task "Review
maintenance schedule and asset condition"; written by Service task
"Raise scheduled work order in Maintenance Management System"; written
by Service task "Close work order in Maintenance Management System";
written by Service task "Update utilisation and availability status in
Maintenance Management System".

V08.06 Maintain Asset receives an asset that has been deployed and
manages its scheduled and reactive maintenance lifecycle: raising work
orders, dispatching them to the Maintenance Contractor, reviewing
returned inspection or repair reports, handling rework where the
outcome is unsatisfactory, and recording the final outcome in the
Maintenance Management System. It hands a confirmed, operational, and
fully documented asset to V08.07 Monitor Utilisation and Condition,
where ongoing performance and condition data will be tracked.
```

### V08.07 — Monitor Utilisation and Condition

**BPMN diagram prompt.**

```text
BPMN: V08.07 Monitor Utilisation and Condition — subprocess within the
Acquire to Retire value chain that tracks ongoing asset performance and
physical state, triggering maintenance or impairment action as required.

1. Pools & Lanes

Pool "Asset Management Organisation" — the internal teams that collect,
analyse, and act on utilisation and condition data.
  Lane "Operations" — operations manager who gathers utilisation data and
  raises operational observations.
  Lane "Asset Management" — asset manager who reviews performance, assesses
  condition, and decides on follow-up action.
Pool "Maintenance Contractor" — external party who conducts site inspections
and provides condition assessments.
Pool "Reporting / BI System" — system that stores, aggregates, and surfaces
utilisation and condition reports.

2. Pool properties

Pool "Asset Management Organisation" — white-box, single instance.
Pool "Maintenance Contractor" — black-box, single instance.
Pool "Reporting / BI System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Maintenance Contractor
2. Asset Management Organisation
3. Reporting / BI System

4. Lane contents in flow order (Asset Management Organisation)

Operations lane:
  Message start event "Utilisation and condition monitoring cycle triggered
  from V08.06"
  User task "Collect asset utilisation data"
  Service task "Log utilisation data to Reporting / BI System"
  Intermediate message catch event "Inspection report received from
  Maintenance Contractor"
  User task "Record operational observations and usage readings"
  Service task "Submit observations to Reporting / BI System"
  Sequence flow to Asset Management lane

Asset Management lane:
  User task "Retrieve utilisation and condition report from Reporting / BI
  System"
  User task "Assess asset performance against benchmarks"
  Exclusive gateway "Action required?"
  - branch "No action — within acceptable parameters": User task "Document
    monitoring outcome"; End event "Monitoring cycle complete — no further
    action"
  - branch "Maintenance required": Send task "Raise maintenance request";
    End event "Maintenance flagged — ready for Maintain Asset (V08.06)"
  - branch "Impairment or transfer indicated": Send task "Raise impairment
    or transfer flag"; End event "Impairment flagged — ready for Manage
    Impairments or Transfers (V08.09)"
  Exclusive merge gateway "Action required"

Note: all three branches end in their own End events and do not rejoin at
the merge gateway; the merge gateway is included for completeness but carries
no inbound flows from closed branches.

5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Assess asset performance against
benchmarks" — label "Assessment overdue (5 business days)" — on expiry,
flow to Send task "Escalate overdue assessment to Asset Management
leadership" then to End event "Monitoring cycle escalated".

6. Connectors

Sequence flows: work begins in the Operations lane with data collection and
logging, pauses for the Maintenance Contractor inspection report, then
continues with recording observations before passing to the Asset Management
lane for retrieval, assessment, and the Action Required gateway. The three
branches each terminate in a dedicated End event; the escalation path from
the boundary event leads to a separate End event.

Message flows:
Reporting / BI System → Asset Management Organisation / Operations lane
  (utilisation and condition report data surfaced after log tasks)
Asset Management Organisation / Operations lane → Reporting / BI System
  (utilisation data and operational observations submitted)
Asset Management Organisation / Asset Management lane → Reporting / BI
  System (request to retrieve utilisation and condition report)
Reporting / BI System → Asset Management Organisation / Asset Management
  lane (consolidated utilisation and condition report returned)
Maintenance Contractor → Asset Management Organisation / Operations lane
  (inspection report and condition assessment)
Asset Management Organisation / Asset Management lane → Maintenance
  Contractor (acknowledgement of inspection report receipt)

7. Data objects

Data Object "Utilisation Data" — written by "Collect asset utilisation
data"; read by "Log utilisation data to Reporting / BI System".
Data Object "Operational Observations" — written by "Record operational
observations and usage readings"; read by "Submit observations to Reporting
/ BI System".
Data Object "Inspection Report" — read by "Record operational observations
and usage readings"; written by Maintenance Contractor (external).
Data Store "Reporting / BI System Asset Register" — written by "Log
utilisation data to Reporting / BI System", "Submit observations to
Reporting / BI System"; read by "Retrieve utilisation and condition report
from Reporting / BI System".
Data Object "Utilisation and Condition Report" — written by "Retrieve
utilisation and condition report from Reporting / BI System"; read by
"Assess asset performance against benchmarks".
Data Object "Monitoring Outcome Record" — written by "Document monitoring
outcome".
Data Object "Maintenance Request" — written by "Raise maintenance request".
Data Object "Impairment or Transfer Flag" — written by "Raise impairment or
transfer flag".

This subprocess collects asset utilisation readings and Maintenance Contractor
inspection reports, consolidates them in the Reporting / BI System, and enables
the asset manager to assess whether performance and condition remain within
acceptable limits. Depending on the outcome, it either closes the monitoring
cycle with no further action, hands a maintenance request to Maintain Asset
(V08.06), or raises an impairment or transfer flag that initiates Manage
Impairments or Transfers (V08.09).
```

### V08.08 — Account for Depreciation

**BPMN diagram prompt.**

```text
BPMN: V08.08 Account for Depreciation — periodic depreciation calculation
and posting subprocess within the Acquire to Retire value chain.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation running the
depreciation accounting process, with lanes for Finance.
Pool "ERP Fixed Asset Register" — system holding asset master data,
depreciation rules, and accumulated depreciation balances.

2. Pool properties

Pool "Asset Management Organisation": white-box, single instance.
Pool "ERP Fixed Asset Register": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Asset Management Organisation
2. ERP Fixed Asset Register

4. Lane contents in flow order (Asset Management Organisation)

Finance lane:
  Timer start event "Depreciation period end reached (monthly/annual
    schedule)"
  User task "Review active assets and depreciation rules"
  Service task "Retrieve asset register and depreciation parameters from
    ERP Fixed Asset Register"
  User task "Verify depreciation method, useful life, and residual value
    for each asset class"
  Exclusive gateway "Depreciation rules current and complete?"
  - branch "Rules require update": User task "Update depreciation
    parameters for affected assets"; Service task "Save updated
    depreciation rules to ERP Fixed Asset Register"; Exclusive merge
    gateway "Depreciation rules current and complete"
  - branch "Rules confirmed": Exclusive merge gateway "Depreciation rules
    current and complete"
  Service task "Run automated depreciation calculation in ERP Fixed Asset
    Register"
  Intermediate message catch event "Depreciation run results received"
  User task "Review depreciation run results and exception report"
  Exclusive gateway "Exceptions or errors identified?"
  - branch "Exceptions found":
    Expanded Subprocess "Repeat Until Exceptions Resolved" (standard loop)
    containing, in order: User task "Investigate and correct exception",
    User task "Resubmit affected asset records for recalculation",
    Service task "Run recalculation for corrected assets in ERP Fixed
    Asset Register", Intermediate message catch event "Recalculation
    results received", User task "Review corrected depreciation output"
    Exclusive merge gateway "Exceptions or errors identified"
  - branch "No exceptions": Exclusive merge gateway "Exceptions or errors
    identified"
  User task "Post depreciation journal entries to general ledger"
  Service task "Record depreciation posting confirmation in ERP Fixed
    Asset Register"
  User task "Reconcile accumulated depreciation balances to asset
    register"
  Exclusive gateway "Reconciliation confirmed?"
  - branch "Discrepancy found": User task "Investigate and resolve
    reconciliation discrepancy"; Service task "Correct balances in ERP
    Fixed Asset Register"; Exclusive merge gateway "Reconciliation
    confirmed"
  - branch "Reconciliation confirmed": Exclusive merge gateway
    "Reconciliation confirmed"
  User task "Prepare depreciation summary report for period"
  End event "Depreciation posted and reconciled — ready for Manage
    Impairments or Transfers (V08.09)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Exceptions Resolved" — label "Period close deadline exceeded" — triggers
User task "Escalate unresolved exceptions to Finance Manager" which leads
to an Escalation end event "Escalated — period close at risk".

6. Connectors

Sequence flows: work begins in the Finance lane with the timer start
event, proceeds through asset review and rule verification, through the
"Depreciation rules current and complete?" gateway (branches for update
and confirmed, rejoining at the merge gateway), then to the automated
depreciation run and results review, through the "Exceptions or errors
identified?" gateway (the exception branch enters the standard-loop
subprocess, the no-exception branch bypasses it, both rejoin at the merge
gateway), then to journal posting, balance reconciliation through the
"Reconciliation confirmed?" gateway (discrepancy branch corrects and
rejoins, confirmed branch passes straight through to the merge gateway),
and finally to report preparation and the end event.

Message flows:
ERP Fixed Asset Register → Finance lane (asset register, depreciation
  parameters, and useful-life data retrieved for review).
Finance lane → ERP Fixed Asset Register (updated depreciation rules saved
  after parameter correction).
Finance lane → ERP Fixed Asset Register (depreciation run initiated for
  the period).
ERP Fixed Asset Register → Finance lane (depreciation run results and
  exception report returned).
Finance lane → ERP Fixed Asset Register (recalculation request submitted
  for corrected assets).
ERP Fixed Asset Register → Finance lane (recalculation results returned).
Finance lane → ERP Fixed Asset Register (depreciation posting
  confirmation and corrected balance records written).

7. Data objects

Data Object "Depreciation Run Parameters" — read by "Verify depreciation
  method, useful life, and residual value for each asset class"; written
  by "Update depreciation parameters for affected assets".
Data Object "Depreciation Run Results" — written by ERP Fixed Asset
  Register (run output); read by "Review depreciation run results and
  exception report".
Data Object "Exception Report" — written by ERP Fixed Asset Register
  (run output); read by "Investigate and correct exception".
Data Object "Depreciation Journal Entry" — written by "Post depreciation
  journal entries to general ledger"; read by "Reconcile accumulated
  depreciation balances to asset register".
Data Object "Depreciation Summary Report" — written by "Prepare
  depreciation summary report for period".
Data Store "ERP Fixed Asset Register" — read by "Retrieve asset register
  and depreciation parameters from ERP Fixed Asset Register"; written by
  "Save updated depreciation rules to ERP Fixed Asset Register", "Record
  depreciation posting confirmation in ERP Fixed Asset Register", and
  "Correct balances in ERP Fixed Asset Register".

V08.08 Account for Depreciation executes the periodic depreciation cycle
for all active assets: it retrieves and validates depreciation rules,
runs the automated calculation, resolves exceptions, posts the resulting
journal entries to the general ledger, and reconciles accumulated
depreciation balances. On completion it hands confirmed posted-
depreciation figures and an up-to-date asset register to V08.09 Manage
Impairments or Transfers, where those values underpin impairment testing
and any revaluation or transfer adjustments.
```

### V08.09 — Manage Impairments or Transfers

**BPMN diagram prompt.**

```text
BPMN: V08.09 Manage Impairments or Transfers — subprocess within the
Acquire to Retire value chain, triggered when an asset's carrying value
or location must be adjusted due to impairment, damage, or internal
transfer.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation running the
impairment and transfer management process, with lanes for each team.
  Lanes (top to bottom):
  - Asset Management (asset manager)
  - Risk (risk officer)
  - Finance (finance accountant)
Pool "Insurer" — external insurance provider who receives impairment
notifications and issues settlement decisions.
Pool "Finance / General Ledger System" — IT system that records
impairment write-downs and transfer accounting entries.

2. Pool properties

Pool "Asset Management Organisation" — white-box, single instance.
Pool "Insurer" — black-box, single instance.
Pool "Finance / General Ledger System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Insurer
2. Asset Management Organisation
3. Finance / General Ledger System

4. Lane contents in flow order (Asset Management Organisation)

Asset Management lane:
  Message start event "Impairment trigger or transfer request received
  from V08.07"
  User task "Review asset condition and valuation report"
  Exclusive gateway "Impairment or transfer?"
  - branch "Impairment": continue in Asset Management lane to
    User task "Prepare impairment assessment"
  - branch "Transfer": continue in Asset Management lane to
    User task "Prepare asset transfer documentation"
  Exclusive merge gateway "Impairment or transfer"
  User task "Submit case to Risk for review"

Risk lane:
  User task "Assess risk and validate assessment basis"
  Exclusive gateway "Assessment acceptable?"
  - branch "No — rework required":
    Expanded Subprocess "Repeat Until Assessment Accepted"
    (standard loop) containing, in order:
      User task "Return assessment with findings",
      User task "Revise impairment or transfer assessment"
  - branch "Yes": proceed to send task
  Exclusive merge gateway "Assessment acceptable"
  Send task "Forward validated assessment to Finance"

Finance lane:
  User task "Determine accounting treatment"
  Exclusive gateway "Insurance claim required?"
  - branch "Yes":
    Send task "Notify Insurer of impairment event"
    Intermediate message catch event "Insurer settlement decision
    received"
    User task "Record insurance settlement amount"
  - branch "No": proceed directly to merge
  Exclusive merge gateway "Insurance claim required"
  Service task "Post impairment write-down or transfer entry to
  Finance / General Ledger System"
  Service task "Update asset master record in Finance / General Ledger
  System"
  User task "Confirm accounting entries and close impairment or
  transfer case"
  End event "Impairment or transfer recorded — ready for Close Asset
  Record (V08.11)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Assessment Accepted" — label "Assessment cycle exceeds 10 business
days" — triggers escalation end event "Escalate to asset manager for
senior review".
Interrupting timer boundary event on Intermediate message catch event
"Insurer settlement decision received" — label "Insurer response
overdue (15 business days)" — triggers User task "Chase Insurer for
settlement decision", then rejoins flow before "Record insurance
settlement amount".

6. Connectors

Sequence flows: flow runs top to bottom through the Asset Management
lane to the Risk lane to the Finance lane. After the start event, Asset
Management prepares the case, splits at the "Impairment or transfer"
exclusive gateway into the impairment branch and the transfer branch,
then merges before submitting to Risk. Risk validates the assessment,
looping via the subprocess if rework is needed, then merges and sends
to Finance. Finance splits at "Insurance claim required", the yes-branch
exchanging messages with Insurer before merging, and posts entries to
the system before the end event.

Message flows:
Finance lane "Notify Insurer of impairment event" → Insurer (impairment
notification with asset details and valuation).
Insurer → Finance lane Intermediate message catch event "Insurer
settlement decision received" (settlement decision or rejection).
Finance lane "Post impairment write-down or transfer entry to Finance /
General Ledger System" → Finance / General Ledger System (impairment
write-down or transfer accounting entry).
Finance lane "Update asset master record in Finance / General Ledger
System" → Finance / General Ledger System (updated asset master data
including revised carrying value, location, or custodian).

7. Data objects

Data Object "Asset Condition and Valuation Report" — read by Asset
Management "Review asset condition and valuation report"; written by
Asset Management "Prepare impairment assessment".
Data Object "Impairment Assessment" — written by Asset Management
"Prepare impairment assessment"; read by Risk "Assess risk and validate
assessment basis"; read by Finance "Determine accounting treatment".
Data Object "Asset Transfer Documentation" — written by Asset
Management "Prepare asset transfer documentation"; read by Risk "Assess
risk and validate assessment basis".
Data Object "Insurance Claim Notification" — written by Finance "Notify
Insurer of impairment event"; read by Insurer.
Data Object "Insurer Settlement Decision" — written by Insurer; read by
Finance "Record insurance settlement amount".
Data Store "Finance / General Ledger" — written by Finance "Post
impairment write-down or transfer entry to Finance / General Ledger
System"; written by Finance "Update asset master record in Finance /
General Ledger System".

V08.09 captures the event that an asset's carrying value must be reduced
or its ownership or location must change, coordinates a risk-validated
assessment, handles any insurance claim with the Insurer, and posts the
resulting accounting entries to the general ledger. It hands a fully
reconciled, updated asset master record to V08.11 Close Asset Record,
where the asset's lifecycle history is finalised and the fixed asset
register is closed.
```

### V08.10 — Dispose / Sell / Write Off Asset

**BPMN diagram prompt.**

```text
BPMN: V08.10 Dispose / Sell / Write Off Asset — the subprocess that
manages the controlled exit of an asset from the organisation through sale,
transfer to a buyer, insurance claim, or write-off, sitting between Manage
Impairments or Transfers (V08.09) and Close Asset Record (V08.11) in the
Acquire to Retire value chain.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation executing the
disposal process, containing Disposal Coordination, Legal, and Finance lanes.
Pool "Buyer" — external party purchasing or receiving the disposed asset.
Pool "Insurer" — external party handling insurance-related disposal or
write-off claims.
Pool "Document Management System" — IT system storing disposal
documentation, sale terms, transfer records, and ownership records.

2. Pool properties

Pool "Asset Management Organisation" — white-box, single instance.
Pool "Buyer" — black-box, single instance.
Pool "Insurer" — black-box, single instance.
Pool "Document Management System" — black-box, System = true, single
instance.

3. Layout

Top to bottom:
1. Buyer
2. Insurer
3. Asset Management Organisation
4. Document Management System

4. Lane contents in flow order (Asset Management Organisation)

Disposal Coordination lane:
  Message start event "Disposal instruction received from Manage Impairments
    or Transfers (V08.09)"
  User task "Review asset disposal instruction and confirm disposal method"
  Exclusive gateway "Disposal method?"
  - branch "Sale to buyer": User task "Prepare asset details and sale terms"
    then Send task "Issue asset details and sale terms to Buyer"
    then Intermediate message catch event "Buyer offer received"
    then User task "Evaluate offer and confirm sale"
    then User task "Coordinate asset handover to Buyer"
    then Send task "Send transfer documentation and ownership records to Buyer"
    then Exclusive merge gateway "Disposal method resolved"
  - branch "Insurance write-off or claim": User task "Compile asset condition
    and impairment evidence"
    then Send task "Submit claim documentation to Insurer"
    then Intermediate message catch event "Insurer decision received"
    then User task "Record insurance claim outcome"
    then Exclusive merge gateway "Disposal method resolved"
  - branch "Write-off (no proceeds)": User task "Document write-off
    justification and obtain disposal approval"
    then Exclusive merge gateway "Disposal method resolved"
  Exclusive merge gateway "Disposal method resolved"
  Service task "Store disposal records in Document Management System"
  User task "Confirm physical removal or decommissioning of asset"
  Send task "Notify Finance of disposal outcome and any sale proceeds"

Legal lane:
  User task "Review and execute sale or transfer agreement"
  User task "Confirm legal title transfer and sign off disposal"

Finance lane:
  User task "Record sale proceeds or write-off amount in general ledger"
  User task "Remove asset from financial records and post disposal entries"
  End event "Disposal complete — asset financially closed, ready for Close
    Asset Record (V08.11)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Intermediate message catch event "Buyer
offer received" — label "Offer deadline exceeded" — if no offer is received
within the review period, flow routes back to Disposal Coordination to
reassess the disposal method; modelled as an interrupting timer on the
enclosing Expanded Subprocess "Repeat Until Acceptable Offer Received or
Method Changed" (standard loop) containing: Send task "Issue asset details
and sale terms to Buyer", Intermediate message catch event "Buyer offer
received", User task "Evaluate offer and confirm sale"; timer boundary event
"Offer deadline exceeded" on the subprocess, interrupting, exits the loop to
the Exclusive merge gateway "Disposal method resolved" via User task "Revise
or close disposal attempt".
Interrupting timer boundary event on Intermediate message catch event
"Insurer decision received" — label "Claim response deadline exceeded" —
routes to User task "Escalate claim or proceed with write-off", then to
Exclusive merge gateway "Disposal method resolved".

6. Connectors

Sequence flows: Flow begins in the Disposal Coordination lane with the message
start event, proceeds to review and the Exclusive gateway "Disposal method?".
The sale branch passes through Disposal Coordination tasks, Legal lane tasks
for agreement and title transfer running in parallel via the sale branch
sequence, then rejoins at Exclusive merge gateway "Disposal method resolved".
The insurance branch passes through Disposal Coordination and rejoins at the
same merge gateway. The write-off branch goes directly to the merge gateway.
After the merge, flow continues in Disposal Coordination to store records and
confirm decommissioning, then notifies Finance. Finance records proceeds,
removes the asset from financial records, and reaches the end event.

Message flows:
Disposal Coordination → Buyer (asset details and sale terms)
Buyer → Disposal Coordination (buyer offer)
Disposal Coordination → Buyer (transfer documentation and ownership records)
Disposal Coordination → Insurer (claim documentation and asset condition
  evidence)
Insurer → Disposal Coordination (insurer decision and claim outcome)
Disposal Coordination → Document Management System (disposal records,
  transfer documentation, ownership records)
Disposal Coordination → Finance (disposal outcome notification and sale
  proceeds)

7. Data objects

Data Object "Disposal Instruction" — read by "Review asset disposal
  instruction and confirm disposal method".
Data Object "Asset Details and Sale Terms" — written by "Prepare asset details
  and sale terms"; read by "Issue asset details and sale terms to Buyer" and
  "Review and execute sale or transfer agreement".
Data Object "Buyer Offer" — read by "Evaluate offer and confirm sale".
Data Object "Transfer Documentation" — written by "Confirm legal title
  transfer and sign off disposal"; read by "Send transfer documentation and
  ownership records to Buyer".
Data Object "Claim Documentation" — written by "Compile asset condition and
  impairment evidence"; read by "Submit claim documentation to Insurer".
Data Object "Insurer Decision" — read by "Record insurance claim outcome".
Data Object "Write-Off Justification" — written by "Document write-off
  justification and obtain disposal approval".
Data Object "Disposal Approval" — written by "Document write-off
  justification and obtain disposal approval"; read by "Record sale proceeds
  or write-off amount in general ledger".
Data Store "Document Management System" — written by "Store disposal records
  in Document Management System".
Data Object "Disposal Accounting Entry" — written by "Remove asset from
  financial records and post disposal entries".

V08.10 manages the controlled exit of an asset from the organisation by
routing through sale, insurance claim, or direct write-off depending on the
disposal decision arriving from V08.09. Legal executes and confirms title
transfer where a buyer is involved, and Finance posts the proceeds or
write-off to the general ledger and removes the asset from financial records.
The subprocess hands a fully documented, financially closed disposal package
to Close Asset Record (V08.11), which completes the asset lifecycle.
```

### V08.11 — Close Asset Record

**BPMN diagram prompt.**

```text
BPMN: V08.11 Close Asset Record — final subprocess of the Acquire to
Retire value chain, closing all records and accounts after disposal or
write-off.

1. Pools & Lanes

Pool "Asset Management Organisation" — the organisation executing the
close-out process, with lanes for Asset Management and Finance.
Pool "ERP Fixed Asset Register" — IT system holding the asset master
record and depreciation data.
Pool "Finance / General Ledger System" — IT system holding accounting
entries and ledger balances.

2. Pool properties

Pool "Asset Management Organisation": white-box, single instance.
Pool "ERP Fixed Asset Register": black-box, System = true,
single instance.
Pool "Finance / General Ledger System": black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Asset Management Organisation (white-box, process owner)
2. ERP Fixed Asset Register (supporting IT system)
3. Finance / General Ledger System (supporting IT system)

4. Lane contents in flow order (Asset Management Organisation)

Asset Management lane:
  Message start event "Disposal or write-off confirmed — received
    from Dispose / Sell / Write Off Asset (V08.10)"
  User task "Retrieve asset record and verify disposal outcome"
  Service task "Query asset master data from ERP Fixed Asset Register"
  User task "Confirm all maintenance and work orders are closed"
  Exclusive gateway "Outstanding work orders exist?"
  - branch "Yes": Expanded Subprocess "Repeat Until All Work Orders
      Closed" (standard loop) containing, in order: User task "Identify
      open work order", User task "Escalate closure to Maintenance or
      Operations", Intermediate message catch event "Work order closure
      confirmed"
    Exclusive merge gateway "Outstanding work orders exist?"
  - branch "No": continue to next task
  User task "Archive asset documentation and history"
  Service task "Mark asset as retired in ERP Fixed Asset Register"
  Send task "Notify Finance to post final accounting entries"

Finance lane:
  Intermediate message catch event "Retirement notification received
    from Asset Management"
  User task "Review final depreciation and disposal proceeds"
  Service task "Post closing entries to Finance / General Ledger System"
  User task "Reconcile asset ledger balance to zero"
  Exclusive gateway "Ledger balance reconciled?"
  - branch "No — discrepancy found": User task "Investigate and correct
      journal entries"
    Service task "Repost corrected entries to Finance / General
      Ledger System"
    Exclusive merge gateway "Ledger balance reconciled?"
  - branch "Yes": continue to next task
  User task "Confirm asset removed from active fixed asset register"
  Service task "Update ERP Fixed Asset Register — status Closed"
  End event "Asset record fully closed — Acquire to Retire lifecycle
    complete"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
All Work Orders Closed" — label "14-day escalation limit exceeded" —
flow continues to a new End event "Closure blocked — escalated to
Asset Management leadership" without rejoining the main flow.

6. Connectors

Sequence flows: work begins in the Asset Management lane, proceeds
through the verification tasks and the outstanding-work-orders gateway
(both branches merging at "Outstanding work orders exist?" merge gateway
before continuing), then through archiving and the retirement service
task, and ends with a send task that passes control to the Finance lane;
the Finance lane handles final accounting through the ledger-reconciled
gateway (both branches merging at "Ledger balance reconciled?" merge
gateway before continuing), then confirms closure and ends.

Message flows:
Asset Management Organisation (Service task "Query asset master data
  from ERP Fixed Asset Register") → ERP Fixed Asset Register (asset
  master data requested).
ERP Fixed Asset Register → Asset Management Organisation (Service task
  "Query asset master data from ERP Fixed Asset Register") (asset
  master record and depreciation data returned).
Asset Management Organisation (Service task "Mark asset as retired in
  ERP Fixed Asset Register") → ERP Fixed Asset Register (retirement
  status update sent).
Asset Management Organisation (Service task "Update ERP Fixed Asset
  Register — status Closed") → ERP Fixed Asset Register (closed status
  written).
Asset Management Organisation (Service task "Post closing entries to
  Finance / General Ledger System") → Finance / General Ledger System
  (closing journal entries posted).
Asset Management Organisation (Service task "Repost corrected entries
  to Finance / General Ledger System") → Finance / General Ledger
  System (corrected journal entries posted).
Finance / General Ledger System → Asset Management Organisation (User
  task "Reconcile asset ledger balance to zero") (ledger balances
  returned for reconciliation).

7. Data objects

Data Object "Disposal or Write-Off Confirmation" — read by User task
  "Retrieve asset record and verify disposal outcome".
Data Object "Asset Master Record" — read by Service task "Query asset
  master data from ERP Fixed Asset Register"; written by Service task
  "Mark asset as retired in ERP Fixed Asset Register".
Data Object "Work Order Closure Report" — read by User task "Confirm
  all maintenance and work orders are closed".
Data Object "Asset Documentation Archive" — written by User task
  "Archive asset documentation and history".
Data Object "Final Depreciation and Disposal Proceeds Summary" — read
  by User task "Review final depreciation and disposal proceeds".
Data Object "Closing Journal Entries" — written by Service task "Post
  closing entries to Finance / General Ledger System"; read by User
  task "Reconcile asset ledger balance to zero".
Data Store "ERP Fixed Asset Register" — read and written by Service
  task "Query asset master data from ERP Fixed Asset Register", Service
  task "Mark asset as retired in ERP Fixed Asset Register", and Service
  task "Update ERP Fixed Asset Register — status Closed".
Data Store "Finance / General Ledger" — written by Service task "Post
  closing entries to Finance / General Ledger System" and Service task
  "Repost corrected entries to Finance / General Ledger System".

V08.11 Close Asset Record is the final subprocess in the Acquire to
Retire lifecycle. It ensures that every maintenance obligation is
resolved, all documentation is archived, the asset master record is
retired, and the general ledger is reconciled to zero. On completion,
no further action is required: the asset has been fully removed from
the active register and the organisation's books, bringing the
Acquire to Retire value chain to a clean and auditable close.
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
BPMN: V09.01 Define Sourcing Need — first subprocess of the Source to
Contract value chain, capturing and validating the internal trigger for a
sourcing event before category analysis begins.

1. Pools & Lanes

Pool "Sourcing Organisation" — the organisation running the sourcing process,
containing Business Owner and Category Management lanes.
Pool "Sourcing Platform" — IT system that records the sourcing need and
stores the approved sourcing request.

2. Pool properties

Pool "Sourcing Organisation": white-box, single instance.
Pool "Sourcing Platform": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Sourcing Organisation (white-box, process flow runs here)
2. Sourcing Platform (black-box, IT system at the bottom)

4. Lane contents in flow order (Sourcing Organisation)

Business Owner lane (business owner):
  None start event "Sourcing need identified"
  User task "Document sourcing need and business case"
  User task "Specify requirements scope and objectives"
  User task "Confirm budget availability and procurement threshold"
  Exclusive gateway "Sourcing need sufficiently defined?"
    - branch "No": Expanded Subprocess "Repeat Until Details Complete"
      (standard loop) containing, in order: User task "Revise need
      statement", User task "Update scope and requirements"
    - branch "Yes": continue to Exclusive merge gateway
      "Sourcing need sufficiently defined?"
  Exclusive merge gateway "Sourcing need sufficiently defined?"
  User task "Submit sourcing request for review"
  Intermediate message catch event "Category Management review complete"

Category Management lane (category manager):
  User task "Review sourcing request against category strategy"
  User task "Assess alignment with sourcing policy and thresholds"
  Exclusive gateway "Request approved?"
    - branch "Rejected — return to Business Owner": Send task
      "Return request with feedback", then End event "Sourcing need
      rejected — process closed"
    - branch "Approved": continue to Exclusive merge gateway
      "Request approved?"
  Exclusive merge gateway "Request approved?"
  Service task "Record approved sourcing need in Sourcing Platform"
  User task "Assign category manager and sourcing specialist"
  End event "Sourcing need defined and approved — ready for
    Analyse Spend / Category (V09.02)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Details Complete", labelled "5 business days elapsed", leading to End event
"Sourcing need timed out — request cancelled".

6. Connectors

Sequence flows: flow runs from the none start event in the Business Owner
lane through documentation, scoping, and budget tasks; an exclusive gateway
tests completeness and loops through the standard-loop subprocess until
details are satisfactory; on approval the flow continues via the merge
gateway to the submit task; the intermediate message catch event pauses
the Business Owner lane until Category Management signals review complete;
flow then crosses to the Category Management lane for review, policy
check, and the "Request approved?" gateway; the rejected branch sends
feedback to the Business Owner and ends; the approved branch merges and
continues to the service task and assignment task before reaching the end
event.

Message flows:
Sourcing Organisation (Service task "Record approved sourcing need in
  Sourcing Platform") → Sourcing Platform (approved sourcing request
  submitted).
Sourcing Platform → Sourcing Organisation (Category Management lane,
  Service task "Record approved sourcing need in Sourcing Platform")
  (confirmation of record creation).

7. Data objects

Data Object "Sourcing Request" — written by "Document sourcing need and
  business case"; read by "Review sourcing request against category
  strategy".
Data Object "Business Case" — written by "Document sourcing need and
  business case"; read by "Assess alignment with sourcing policy and
  thresholds".
Data Object "Requirements Scope and Objectives" — written by "Specify
  requirements scope and objectives"; read by "Review sourcing request
  against category strategy".
Data Object "Budget Confirmation" — written by "Confirm budget
  availability and procurement threshold"; read by "Assess alignment with
  sourcing policy and thresholds".
Data Store "Sourcing Platform Record" — written by "Record approved
  sourcing need in Sourcing Platform".

V09.01 captures the internal trigger for a procurement event, guiding the
Business Owner through need documentation, scoping, and budget confirmation
before Category Management reviews the request against sourcing policy and
category strategy. Once the sourcing need is approved and logged in the
Sourcing Platform, the subprocess hands a validated sourcing request to
V09.02 Analyse Spend / Category, where the category manager examines
historical spend and market data to shape the sourcing approach.
```

### V09.02 — Analyse Spend / Category

**BPMN diagram prompt.**

```text
BPMN: V09.02 Analyse Spend / Category — second subprocess in the
Source to Contract value chain, converting raw spend data and category
intelligence into a structured category profile that guides supplier
market identification.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams performing spend
and category analysis.
  Lane "Category Management" — category manager leading the analysis.
  Lane "Procurement" — commercial analyst providing spend data and
  supporting quantitative assessment.
Pool "Analytics / BI Tools" — the analytics and business intelligence
platform used to retrieve and process spend data.

2. Pool properties

Pool "Sourcing Organisation": white-box, single instance.
Pool "Analytics / BI Tools": black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Sourcing Organisation (white-box, lanes top to bottom: Category
   Management, Procurement)
2. Analytics / BI Tools

4. Lane contents in flow order (Sourcing Organisation)

Category Management lane:
  Start event "Sourcing need confirmed — received from Define Sourcing
  Need (V09.01)"
  User task "Review sourcing need and scope category boundaries"
  User task "Define spend analysis parameters and data requirements"
  Intermediate message catch event "Spend data report received"
  User task "Validate and sense-check spend data"
  Exclusive gateway "Data sufficient for analysis?"
  - branch "No — gaps identified": User task "Raise data query and
    specify missing data fields"
    Intermediate message catch event "Supplementary data received"
    Exclusive merge gateway "Data sufficient for analysis?"
  - branch "Yes — proceed": Exclusive merge gateway "Data sufficient
    for analysis?"
  User task "Conduct category segmentation and market complexity
  assessment"
  User task "Identify key spend drivers, trends, and demand patterns"
  User task "Assess supply market risk and criticality rating"
  User task "Compile category profile and document findings"
  User task "Present category profile for internal alignment"
  Exclusive gateway "Category profile agreed?"
  - branch "No — revisions required":
    Expanded Subprocess "Repeat Until Profile Agreed" (standard loop)
    containing, in order: User task "Incorporate feedback and revise
    category profile", User task "Re-present revised category profile"
  - branch "Yes — agreed": Exclusive merge gateway "Category profile
    agreed?"
  End event "Category profile complete — ready for Identify Supplier
  Market (V09.03)"

Procurement lane:
  User task "Extract spend data from Analytics / BI Tools"
  Service task "Submit spend data request to Analytics / BI Tools"
  User task "Review supplier spend breakdown and historic pricing"
  User task "Validate cost baseline and benchmark against market data"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Profile Agreed" — label "Review cycle limit reached (3 cycles)" —
triggers End event "Category profile escalated — alignment not achieved
within review limit".

6. Connectors

Sequence flows: flow begins in the Category Management lane with the
start event, passes to "Review sourcing need and scope category
boundaries", then to "Define spend analysis parameters and data
requirements". Concurrently, in the Procurement lane, "Extract spend
data from Analytics / BI Tools" leads to "Submit spend data request to
Analytics / BI Tools", then to "Review supplier spend breakdown and
historic pricing" and "Validate cost baseline and benchmark against
market data". Control returns to Category Management on receipt of the
intermediate message catch event "Spend data report received", flowing
through validation, the data-sufficiency gateway and its merge, then
through category segmentation, spend driver identification, risk
assessment, and profile compilation in sequence, before the alignment
gateway and its loop subprocess, merging to the end event.

Message flows:
Category Management "Submit spend data request to Analytics / BI Tools"
→ Analytics / BI Tools (spend analysis parameters and data request).
Analytics / BI Tools → Category Management intermediate message catch
event "Spend data report received" (spend data report and category
spend breakdown).
Analytics / BI Tools → Category Management intermediate message catch
event "Supplementary data received" (supplementary spend data fields).
Procurement "Submit spend data request to Analytics / BI Tools" →
Analytics / BI Tools (extraction query).
Analytics / BI Tools → Procurement "Review supplier spend breakdown
and historic pricing" (raw spend extract and supplier-level detail).

7. Data objects

Data Object "Sourcing Need Record" — read by Category Management
"Review sourcing need and scope category boundaries".
Data Object "Spend Analysis Parameters" — written by Category
Management "Define spend analysis parameters and data requirements";
read by Procurement "Extract spend data from Analytics / BI Tools".
Data Object "Spend Data Report" — written by Analytics / BI Tools
(message flow); read by Category Management "Validate and sense-check
spend data" and Procurement "Review supplier spend breakdown and
historic pricing".
Data Object "Cost Baseline and Benchmark" — written by Procurement
"Validate cost baseline and benchmark against market data"; read by
Category Management "Identify key spend drivers, trends, and demand
patterns".
Data Store "Category Profile" — written by Category Management
"Compile category profile and document findings"; read by Category
Management "Present category profile for internal alignment".

V09.02 Analyse Spend / Category takes the confirmed sourcing need
from V09.01 and produces a structured category profile that captures
spend patterns, supply market risk, cost baselines, and category
segmentation. Internal alignment is confirmed before the profile is
closed. The agreed category profile and its supporting spend data are
handed to V09.03 Identify Supplier Market, where they shape the
criteria for longlist construction and supplier landscape mapping.
```

### V09.03 — Identify Supplier Market

**BPMN diagram prompt.**

```text
BPMN: V09.03 Identify Supplier Market — the third subprocess in the
Source to Contract value chain, in which Category Management and
Procurement identify, research, and record the available supplier
market before issuing any tender documents.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams carrying out
supplier market identification.
  Lane "Category Management" — category manager leads market research
  and supplier landscape analysis.
  Lane "Procurement" — sourcing specialist supports supplier
  identification, records findings, and prepares the supplier
  longlist.
Pool "Supplier Relationship Management System" — IT system that
stores supplier master data, performance history, and the supplier
longlist.

2. Pool properties

Pool "Sourcing Organisation": white-box, single instance.
Pool "Supplier Relationship Management System": black-box,
System = true, single instance.

3. Layout

Top to bottom:
1. Sourcing Organisation (white-box, process flow here)
2. Supplier Relationship Management System (bottom, IT system)

4. Lane contents in flow order (Sourcing Organisation)

Category Management lane:
  Message start event "Spend and category analysis received from
  V09.02"
  User task "Review category analysis and sourcing requirements"
  User task "Define supplier selection criteria and market scope"
  User task "Research supplier landscape and market conditions"
  Exclusive gateway "Sufficient market information gathered?"
    - branch "No": Expanded Subprocess "Repeat Until Sufficient
      Market Information Gathered" (standard loop) containing, in
      order: User task "Identify additional information sources",
      User task "Conduct further market research". Timer boundary
      event on subprocess labelled "5 business days maximum".
    - branch "Yes": continue to next task
  Exclusive merge gateway "Sufficient market information gathered"
  User task "Identify and categorise potential suppliers"
  Exclusive gateway "Existing suppliers available in SRM?"
    - branch "Yes": continue to retrieve supplier data
    - branch "No": continue to external identification only
  Exclusive merge gateway "Existing suppliers checked"
  Service task "Retrieve existing supplier records from SRM System"
  User task "Identify new and emerging suppliers from market"
  User task "Compile preliminary supplier longlist"
  User task "Assess market competitiveness and supply risk"
  User task "Document market intelligence and sourcing strategy
  recommendations"
  Send task "Pass supplier longlist and market analysis to
  Procurement"

Procurement lane:
  User task "Receive and review supplier longlist from Category
  Management"
  User task "Validate supplier longlist against procurement policy
  and thresholds"
  Exclusive gateway "Longlist adequate for sourcing event?"
    - branch "No": intermediate message catch event "Revised longlist
      received from Category Management"; continue to validation
      task; branch rejoins at exclusive merge gateway "Longlist
      accepted"
    - branch "Yes": continue to recording
  Exclusive merge gateway "Longlist accepted"
  Service task "Record finalised supplier longlist in SRM System"
  User task "Prepare market engagement summary"
  End event "Supplier longlist and market analysis confirmed —
  ready for Issue RFI / RFP / RFQ (V09.04)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat
Until Sufficient Market Information Gathered", labelled "5 business
days maximum"; on expiry flow continues to exclusive merge gateway
"Sufficient market information gathered" with the best available
information.

6. Connectors

Sequence flows: flow begins in the Category Management lane at the
message start event and proceeds through review, criteria
definition, research, and the loop subprocess until sufficient
information is gathered; the merge gateway closes that branch and
flow continues through supplier identification, the SRM check
gateway (with both branches rejoining at the merge), supplier data
retrieval, new-supplier identification, longlist compilation, risk
assessment, documentation, and the send task; flow then crosses to
the Procurement lane for review, policy validation, the adequacy
gateway (the "No" branch waits at an intermediate message catch
event then returns to the merge), the merge gateway closes that
branch, recording, summary preparation, and the end event.

Message flows:
Supplier Relationship Management System → Category Management lane,
Service task "Retrieve existing supplier records from SRM System"
(existing supplier records, performance history, and master data).
Procurement lane, Service task "Record finalised supplier longlist
in SRM System" → Supplier Relationship Management System (finalised
supplier longlist and market intelligence data).

7. Data objects

Data Object "Category Analysis and Sourcing Requirements" — read by
User task "Review category analysis and sourcing requirements".
Data Object "Supplier Selection Criteria" — written by User task
"Define supplier selection criteria and market scope".
Data Object "Market Research Findings" — written by User task
"Research supplier landscape and market conditions"; read by User
task "Identify and categorise potential suppliers".
Data Object "Preliminary Supplier Longlist" — written by User task
"Compile preliminary supplier longlist"; read by User task
"Receive and review supplier longlist from Category Management".
Data Object "Market Intelligence Report" — written by User task
"Document market intelligence and sourcing strategy
recommendations"; read by User task "Prepare market engagement
summary".
Data Store "Supplier Master Data (SRM)" — read by Service task
"Retrieve existing supplier records from SRM System"; written by
Service task "Record finalised supplier longlist in SRM System".

V09.03 Identify Supplier Market takes the category analysis
produced in V09.02 and produces a validated, policy-checked
supplier longlist together with a market intelligence report. The
Category Management lane leads the research and landscape
assessment, while Procurement validates the list against sourcing
policy and records it in the Supplier Relationship Management
System. The confirmed longlist and market analysis are handed
directly to V09.04 Issue RFI / RFP / RFQ to form the basis of
the tender event.
```

### V09.04 — Issue RFI / RFP / RFQ

**BPMN diagram prompt.**

```text
BPMN: V09.04 Issue RFI / RFP / RFQ — the fourth subprocess of V09
Source to Contract, in which Procurement and Legal prepare and publish
the appropriate market engagement document to Prospective Suppliers
via the eTendering Platform, manage the clarification period, and
collect supplier responses ready for evaluation.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams that prepare,
  approve, issue, and manage the tender exercise.
  Lanes (top to bottom):
  - Procurement (sourcing specialist)
  - Legal (legal counsel)

Pool "Prospective Supplier" — the external organisation(s) receiving
  and responding to the market engagement document.

Pool "eTendering Platform" — the IT system through which tender packs
  are published, clarifications are exchanged, and responses are
  received.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Prospective Supplier" — black-box, single instance.
Pool "eTendering Platform" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Prospective Supplier
2. Sourcing Organisation
3. eTendering Platform

4. Lane contents in flow order (Sourcing Organisation)

Procurement lane:
  Message start event "Shortlisted supplier market received from
    V09.03"
  User task "Determine tender type (RFI / RFP / RFQ)"
  Exclusive gateway "Tender type?"
    - branch "RFI": User task "Prepare RFI documentation and
        capability questions"
    - branch "RFP": User task "Prepare RFP including scope,
        specifications, and evaluation criteria"
    - branch "RFQ": User task "Prepare RFQ including pricing
        schedules and commercial requirements"
  Exclusive merge gateway "Tender type determined"
  User task "Compile tender pack with instructions to tenderers"
  User task "Identify and confirm supplier longlist for invitation"

Legal lane:
  User task "Review tender pack for legal compliance and risk"
  Exclusive gateway "Tender pack approved?"
    - branch "Revisions required": User task "Revise tender pack
        to address legal comments"
      Intermediate message catch event "Revised pack returned
        by Procurement"
    - branch "Approved": (continue to merge)
  Exclusive merge gateway "Tender pack approved"
  User task "Confirm non-disclosure and conflict of interest
    requirements"

Procurement lane (continued):
  Service task "Publish tender pack to eTendering Platform"
  Intermediate timer catch event "Tender open period active
    (defined duration)"
  Expanded Subprocess "Repeat Until Clarification Period Closed"
    (standard loop) containing, in order:
    User task "Receive and log supplier clarification questions",
    User task "Coordinate clarification response with Legal",
    Service task "Issue clarification response to all tenderers
      via eTendering Platform"
  Intermediate timer catch event "Tender submission deadline reached"
  Service task "Retrieve submitted responses from eTendering
    Platform"
  User task "Confirm completeness and eligibility of submissions"
  Exclusive gateway "All submissions valid?"
    - branch "One or more invalid": User task "Issue non-compliance
        notice to affected supplier(s)"
      End event "Non-compliant submission closed — supplier notified"
    - branch "All valid": (continue to merge)
  Exclusive merge gateway "Submissions validated"
  User task "Register responses and confirm receipt to suppliers"
  End event "Supplier responses received — ready for Evaluate
    Responses (V09.05)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat
  Until Clarification Period Closed" — label "Clarification deadline
  passed" — triggers end of clarification loop and advances flow to
  the tender submission deadline timer catch event.

6. Connectors

Sequence flows: flow runs top to bottom through the Procurement lane
from the message start event through tender type determination, the
three-branch exclusive gateway (RFI / RFP / RFQ) merging at
"Tender type determined", then pack compilation and supplier
identification. Flow crosses to the Legal lane for review; the
"Tender pack approved?" gateway branches to "Revisions required"
(looping back through Legal revision and message catch before
returning to the merge) or "Approved", merging at "Tender pack
approved". Flow returns to the Procurement lane for conflict-of-
interest confirmation, publication, the open-period timer, the
clarification subprocess (with its deadline boundary), the submission
deadline timer, response retrieval, validation, and the "All
submissions valid?" gateway — the "One or more invalid" branch ends
at its own end event; the "All valid" branch merges at "Submissions
validated" and continues to response registration and the final end
event.

Message flows:
eTendering Platform → Prospective Supplier (tender pack and
  instructions to tenderers published on platform)
Prospective Supplier → eTendering Platform (clarification questions
  submitted by suppliers)
eTendering Platform → Prospective Supplier (clarification responses
  issued to all tenderers)
Prospective Supplier → eTendering Platform (tender responses /
  proposals / pricing submitted)
Service task "Publish tender pack to eTendering Platform" →
  eTendering Platform (tender pack upload)
Service task "Issue clarification response to all tenderers via
  eTendering Platform" → eTendering Platform (clarification
  response data)
eTendering Platform → Service task "Retrieve submitted responses
  from eTendering Platform" (submitted supplier responses)
Procurement lane "Issue non-compliance notice to affected
  supplier(s)" → Prospective Supplier (non-compliance notice)

7. Data objects

Data Object "Tender Type Decision" — written by User task "Determine
  tender type (RFI / RFP / RFQ)".
Data Object "RFI Documentation" — written by User task "Prepare RFI
  documentation and capability questions"; read by User task "Compile
  tender pack with instructions to tenderers".
Data Object "RFP Documentation" — written by User task "Prepare RFP
  including scope, specifications, and evaluation criteria"; read by
  User task "Compile tender pack with instructions to tenderers".
Data Object "RFQ Documentation" — written by User task "Prepare RFQ
  including pricing schedules and commercial requirements"; read by
  User task "Compile tender pack with instructions to tenderers".
Data Object "Tender Pack" — written by User task "Compile tender pack
  with instructions to tenderers"; read by User task "Review tender
  pack for legal compliance and risk" and Service task "Publish
  tender pack to eTendering Platform".
Data Object "Supplier Longlist" — written by User task "Identify and
  confirm supplier longlist for invitation"; read by Service task
  "Publish tender pack to eTendering Platform".
Data Object "Clarification Log" — written by User task "Receive and
  log supplier clarification questions"; read by User task "Coordinate
  clarification response with Legal" and Service task "Issue
  clarification response to all tenderers via eTendering Platform".
Data Object "Supplier Responses" — written by Service task "Retrieve
  submitted responses from eTendering Platform"; read by User task
  "Confirm completeness and eligibility of submissions" and User task
  "Register responses and confirm receipt to suppliers".
Data Object "Non-Compliance Notice" — written by User task "Issue
  non-compliance notice to affected supplier(s)".

V09.04 Issue RFI / RFP / RFQ covers the full tender exercise from
determining the appropriate market engagement instrument through
preparing, legally reviewing, and publishing the tender pack, managing
the structured clarification period, and collecting validated supplier
responses. On completion it hands a complete and registered set of
supplier proposals, pricing schedules, or capability statements to
V09.05 Evaluate Responses, where Procurement and Business Owners will
score and rank each submission against the published evaluation
criteria.
```

### V09.05 — Evaluate Responses

**BPMN diagram prompt.**

```text
BPMN: V09.05 Evaluate Responses — the subprocess in which the Sourcing
Organisation scores and ranks supplier responses received via the eTendering
Platform, sitting between Issue RFI / RFP / RFQ (V09.04) and Shortlist
Suppliers (V09.06) in the Source to Contract value chain.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams that receive, score,
  and consolidate evaluation of supplier responses.
  Lanes (top to bottom):
  - Procurement (commercial analyst)
  - Business Owner (business owner)
Pool "Prospective Supplier" — external supplier who submitted a response
  to the tender or RFI/RFP/RFQ.
Pool "Sourcing Platform" — IT system that hosts the evaluation workspace,
  scoring models, and response data.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Prospective Supplier" — black-box, single instance.
Pool "Sourcing Platform" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Prospective Supplier
2. Sourcing Organisation
3. Sourcing Platform

4. Lane contents in flow order (Sourcing Organisation)

Procurement (commercial analyst) lane:
  Message start event "Supplier responses received from Issue RFI / RFP /
    RFQ (V09.04)"
  Service task "Retrieve responses and evaluation model from Sourcing
    Platform"
  User task "Register and log all supplier responses"
  User task "Distribute responses and scoring criteria to evaluators"
  Intermediate message catch event "All evaluator scores received"
  User task "Consolidate individual evaluation scores"
  User task "Perform commercial and pricing analysis"
  Exclusive gateway "Are clarifications required?"
  - branch "Yes — clarifications needed":
      Send task "Issue clarification questions to suppliers"
      Intermediate message catch event "Supplier clarification responses
        received"
      User task "Incorporate clarification responses into evaluation"
      Exclusive merge gateway "Are clarifications required?"
  - branch "No — evaluation complete":
      Exclusive merge gateway "Are clarifications required?"
  User task "Compile overall evaluation summary and scores"
  Service task "Record evaluation results in Sourcing Platform"
  User task "Prepare evaluation report for review"
  Exclusive gateway "Evaluation report approved by Procurement?"
  - branch "No — revisions needed":
      Expanded Subprocess "Repeat Until Evaluation Report Approved"
        (standard loop) containing, in order: User task "Revise evaluation
        report", User task "Re-submit evaluation report for review"
      Exclusive merge gateway "Evaluation report approved by Procurement?"
  - branch "Yes — approved":
      Exclusive merge gateway "Evaluation report approved by Procurement?"
  Send task "Share evaluation report with Business Owner for sign-off"

Business Owner (business owner) lane:
  Intermediate message catch event "Evaluation report received from
    Procurement"
  User task "Review evaluation results and scores"
  Exclusive gateway "Business Owner accepts evaluation?"
  - branch "No — feedback required":
      Send task "Return evaluation report with feedback to Procurement"
      Intermediate message catch event "Revised evaluation report received"
      User task "Review revised evaluation report"
      Exclusive merge gateway "Business Owner accepts evaluation?"
  - branch "Yes — accepted":
      Exclusive merge gateway "Business Owner accepts evaluation?"
  User task "Confirm evaluation sign-off"
  End event "Evaluation confirmed — ready for Shortlist Suppliers (V09.06)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
  Evaluation Report Approved" — labelled "Revision deadline exceeded" —
  flows to End event "Evaluation process escalated — refer to Procurement
  Manager".
Interrupting timer boundary event on Intermediate message catch event
  "Supplier clarification responses received" — labelled "Clarification
  deadline elapsed" — flows to User task "Record non-response and proceed
  with available information".

6. Connectors

Sequence flows: work begins in the Procurement lane with the message start
event, moves through response registration, distribution, score
consolidation, and commercial analysis. The clarifications gateway branches
to supplier contact and loops back through the exclusive merge before
continuing to report compilation and recording in the Sourcing Platform.
The report-approval loop uses the standard-loop subprocess before the
approved branch exits and the send task passes the report to the Business
Owner lane. In the Business Owner lane, review flows through the acceptance
gateway; the rejection branch returns feedback to Procurement via message
and re-enters the acceptance merge; the accepted branch leads to sign-off
confirmation and the end event.

Message flows:
Prospective Supplier → Sourcing Organisation / Procurement (commercial
  analyst) — supplier responses to RFI / RFP / RFQ (trigger for start
  event).
Sourcing Organisation / Procurement (commercial analyst) → Sourcing
  Platform — request to retrieve responses and evaluation model.
Sourcing Platform → Sourcing Organisation / Procurement (commercial
  analyst) — evaluation model, scoring criteria, and response documents.
Sourcing Organisation / Procurement (commercial analyst) → Prospective
  Supplier — clarification questions.
Prospective Supplier → Sourcing Organisation / Procurement (commercial
  analyst) — clarification responses.
Sourcing Organisation / Procurement (commercial analyst) → Sourcing
  Platform — consolidated evaluation scores and results.
Sourcing Organisation / Procurement (commercial analyst) →
  Sourcing Organisation / Business Owner (business owner) — evaluation
  report for sign-off.
Sourcing Organisation / Business Owner (business owner) →
  Sourcing Organisation / Procurement (commercial analyst) — feedback or
  acceptance of evaluation report.

7. Data objects

Data Object "Supplier Responses" — read by "Register and log all supplier
  responses"; read by "Consolidate individual evaluation scores".
Data Object "Evaluation Model / Scoring Criteria" — read by "Distribute
  responses and scoring criteria to evaluators"; read by "Consolidate
  individual evaluation scores".
Data Object "Individual Evaluator Score Sheets" — written by "Distribute
  responses and scoring criteria to evaluators"; read by "Consolidate
  individual evaluation scores".
Data Object "Clarification Questions" — written by "Issue clarification
  questions to suppliers".
Data Object "Clarification Responses" — written by "Incorporate
  clarification responses into evaluation"; read by "Incorporate
  clarification responses into evaluation".
Data Object "Commercial and Pricing Analysis" — written by "Perform
  commercial and pricing analysis"; read by "Compile overall evaluation
  summary and scores".
Data Object "Evaluation Report" — written by "Compile overall evaluation
  summary and scores"; read by "Review evaluation results and scores";
  read by "Confirm evaluation sign-off".
Data Store "Sourcing Platform Evaluation Record" — written by "Record
  evaluation results in Sourcing Platform".

V09.05 Evaluate Responses governs the structured scoring and review of all
supplier submissions received in V09.04, covering commercial analysis,
clarification rounds, and consolidated reporting. It ensures that both
Procurement and the Business Owner have formally accepted the evaluation
before the process continues. The confirmed, signed-off evaluation report
and consolidated scores are handed to Shortlist Suppliers (V09.06), where
the ranked results become the basis for selecting which suppliers to take
forward.
```

### V09.06 — Shortlist Suppliers

**BPMN diagram prompt.**

```text
BPMN: V09.06 Shortlist Suppliers — the subprocess in which Procurement,
Category Management, and Business Owner collectively score, rank, and confirm
a shortlist of suppliers following evaluation of tender responses, sitting
between Evaluate Responses (V09.05) and Conduct Due Diligence (V09.07)
in the Source to Contract value chain.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams who score, deliberate,
and confirm the supplier shortlist.
  Lane "Procurement" — procurement manager who drives the shortlisting
  process and issues the outcome to the market.
  Lane "Category Management" — category manager who applies category
  strategy to scoring and ranking.
  Lane "Business Owner" — business owner who provides requirements
  alignment input and endorses the shortlist.
Pool "Sourcing Platform" — the system that holds evaluation scores, stores
the ranked supplier list, and generates shortlist notifications.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Sourcing Platform" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Sourcing Organisation (white-box, with three lanes top to bottom:
   Procurement, Category Management, Business Owner)
2. Sourcing Platform (black-box, bottom)

4. Lane contents in flow order (Sourcing Organisation)

Procurement lane:
  Message start event "Evaluation results received from Evaluate
  Responses (V09.05)"
  Service task "Retrieve evaluation scores and rankings from Sourcing
  Platform"
  User task "Review aggregate scores and flag anomalies"
  Parallel gateway "Begin cross-team shortlisting review" (split)
    - branch "Category Management input": User task "Apply category
      strategy weighting to rankings" (Category Management lane)
    - branch "Business Owner input": User task "Assess requirements
      alignment for each ranked supplier" (Business Owner lane)
  Parallel merge gateway "Cross-team shortlisting review complete"
  User task "Consolidate inputs and prepare draft shortlist"
  Exclusive gateway "Consensus on shortlist reached?"
    - branch "Yes": continue to next task
    - branch "No": Expanded Subprocess "Repeat Until Consensus Reached"
      (standard loop) containing, in order: User task "Circulate revised
      draft shortlist for comment", User task "Capture and reconcile
      further objections or amendments", User task "Update draft shortlist
      with agreed changes"
  Exclusive merge gateway "Consensus on shortlist reached"
  User task "Record confirmed shortlist in Sourcing Platform"
  User task "Prepare shortlist rationale document"
  Exclusive gateway "Shortlist requires formal approval?"
    - branch "Yes": User task "Submit shortlist for procurement manager
      sign-off" then Intermediate message catch event "Procurement manager
      approval received" then continue to notification task
    - branch "No": continue to notification task
  Exclusive merge gateway "Shortlist approval check complete"
  Send task "Issue decline notifications to unsuccessful suppliers"
  Send task "Issue advance notice to shortlisted suppliers"
  End event "Shortlist confirmed — ready for Conduct Due Diligence
  (V09.07)"

Category Management lane:
  User task "Apply category strategy weighting to rankings"

Business Owner lane:
  User task "Assess requirements alignment for each ranked supplier"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on Expanded Subprocess "Repeat Until
Consensus Reached", labelled "Consensus deadline exceeded (3 business
days)", leading to Escalation end event "Escalate to procurement manager
for casting decision".

6. Connectors

Sequence flows: flow begins in the Procurement lane with the message start
event, moves through score retrieval and anomaly review, then splits at the
parallel gateway sending one branch to the Category Management lane and
one to the Business Owner lane; both branches rejoin at the parallel merge
gateway back in the Procurement lane; flow continues through draft shortlist
consolidation, the consensus exclusive gateway, and — where consensus is
not immediate — through the standard-loop subprocess; after the consensus
merge gateway, the confirmed shortlist is recorded and the rationale
documented; the approval exclusive gateway sends the "Yes" branch through
the sign-off task and the intermediate message catch event before rejoining
at the approval merge gateway; both branches converge there and flow
continues to the two send tasks and the end event.

Message flows:
Sourcing Platform → Procurement lane "Retrieve evaluation scores and
rankings from Sourcing Platform" (evaluation scores, ranked supplier list).
Procurement lane "Record confirmed shortlist in Sourcing Platform" →
Sourcing Platform (confirmed shortlist record).
Procurement lane "Issue decline notifications to unsuccessful suppliers" →
Sourcing Platform (decline notification content for dispatch).
Procurement lane "Issue advance notice to shortlisted suppliers" →
Sourcing Platform (advance shortlist notification content for dispatch).

7. Data objects

Data Object "Evaluation Results" — read by "Retrieve evaluation scores and
rankings from Sourcing Platform".
Data Object "Draft Shortlist" — written by "Consolidate inputs and prepare
draft shortlist"; read by "Circulate revised draft shortlist for comment";
read by "Update draft shortlist with agreed changes".
Data Object "Shortlist Rationale Document" — written by "Prepare shortlist
rationale document".
Data Object "Shortlist Approval Record" — written by "Submit shortlist for
procurement manager sign-off"; read by "Record confirmed shortlist in
Sourcing Platform".
Data Store "Sourcing Platform Supplier Register" — written by "Record
confirmed shortlist in Sourcing Platform".

V09.06 Shortlist Suppliers takes the evaluated and ranked tender responses
produced in V09.05 and, through structured cross-team deliberation among
Procurement, Category Management, and Business Owner, produces a formally
agreed and recorded shortlist of suppliers. Category strategy weighting and
requirements-alignment assessment run in parallel before the procurement
manager consolidates a draft shortlist; where consensus is not immediate a
looped review cycle resolves outstanding objections. Once the shortlist is
confirmed and, where required, formally approved, decline notifications are
issued to unsuccessful suppliers and advance notices sent to shortlisted ones.
The confirmed shortlist and rationale document are then handed to V09.07
Conduct Due Diligence.
```

### V09.07 — Conduct Due Diligence

**BPMN diagram prompt.**

```text
BPMN: V09.07 Conduct Due Diligence — the seventh subprocess of the
Source to Contract value chain, triggered by a confirmed supplier shortlist
and resulting in a due diligence clearance decision that enables commercial
negotiation.

1. Pools & Lanes

Pool "Sourcing Organisation" — the organisation conducting due diligence,
  containing all internal teams involved in assessing shortlisted suppliers.
  Lanes (top to bottom):
  - Risk lane (risk officer)
  - Compliance lane (compliance officer)
  - IT Security / Data Protection lane (security lead)
Pool "Prospective Supplier" — the shortlisted supplier(s) providing
  documentation and attestations in response to due diligence requests.
Pool "Due Diligence / Reference Agency" — the external body providing
  independent checks, financial reports, and reference verifications.
Pool "Risk Management System" — the IT system used to record risk
  assessments, log findings, trigger alerts, and store due diligence
  outcomes.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Prospective Supplier" — black-box, single instance.
Pool "Due Diligence / Reference Agency" — black-box, single instance.
Pool "Risk Management System" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Prospective Supplier
2. Due Diligence / Reference Agency
3. Sourcing Organisation
4. Risk Management System

4. Lane contents in flow order (Sourcing Organisation)

Risk lane:
  Message start event "Shortlisted suppliers received from Shortlist
    Suppliers (V09.06)"
  User task "Define due diligence scope and criteria"
  Service task "Retrieve supplier history and risk alerts from Risk
    Management System"
  Send task "Issue due diligence questionnaire and document request to
    Prospective Supplier"
  Intermediate message catch event "Supplier documentation and attestations
    received"
  Send task "Request independent financial and reference checks from Due
    Diligence / Reference Agency"
  Intermediate message catch event "External agency report received"
  User task "Assess financial, operational and reputational risk"
  Service task "Record risk assessment findings in Risk Management System"
  Exclusive gateway "Risk level acceptable?"
    - branch "Yes — proceed": continue to Compliance lane via sequence flow
    - branch "No — material risk identified": End event "Supplier failed
        risk assessment — return to Shortlist Suppliers (V09.06) for
        substitution" (does not rejoin)
  Exclusive merge gateway "Risk level acceptable"

Compliance lane:
  User task "Conduct regulatory and policy compliance checks"
  User task "Review modern slavery, ESG, anti-bribery, and conflict of
    interest attestations"
  User task "Assess data protection compliance requirements"
  Exclusive gateway "Compliance checks passed?"
    - branch "Yes — proceed": continue to IT Security / Data Protection
        lane via sequence flow
    - branch "No — non-compliance identified": User task "Request
        remediation or additional evidence from Prospective Supplier"
      Intermediate message catch event "Remediation response received"
      Exclusive gateway "Remediation satisfactory?"
        - branch "Yes": rejoin at Exclusive merge gateway "Compliance
            checks passed"
        - branch "No — escalate": End event "Supplier failed compliance
            check — return to Shortlist Suppliers (V09.06)" (does not
            rejoin)
  Exclusive merge gateway "Compliance checks passed"

IT Security / Data Protection lane:
  User task "Conduct IT security and data protection assessment"
  User task "Review security certifications, policies and controls
    provided by Prospective Supplier"
  Exclusive gateway "Security assessment passed?"
    - branch "Yes — proceed": continue to due diligence conclusion
    - branch "No — remediation required": User task "Issue security
        remediation request to Prospective Supplier"
      Intermediate message catch event "Security remediation evidence
        received"
      Exclusive merge gateway "Security assessment passed"
  Exclusive merge gateway "Security assessment passed"
  User task "Record IT security and data protection outcome in Risk
    Management System"
  User task "Compile consolidated due diligence report"
  Exclusive gateway "All checks cleared?"
    - branch "Yes — cleared": Send task "Issue due diligence clearance
        notice to Prospective Supplier"
      End event "Due diligence cleared — ready for Negotiate Commercial
        Terms (V09.08)"
    - branch "No — one or more checks unresolved": End event "Due
        diligence not cleared — return to Shortlist Suppliers (V09.06)
        for further review" (does not rejoin)

5. Edge-mounted (boundary) events

Interrupting timer boundary event on User task "Assess financial,
  operational and reputational risk" — label "Assessment overdue (5
  business days)" — triggers Send task "Chase outstanding supplier
  documentation" directed to Prospective Supplier, then flow returns
  to the intermediate message catch event "Supplier documentation and
  attestations received".
Interrupting timer boundary event on User task "Conduct IT security and
  data protection assessment" — label "Assessment overdue (5 business
  days)" — triggers escalation to risk officer to decide whether to
  extend or terminate supplier engagement.

6. Connectors

Sequence flows: flow begins in the Risk lane with the message start event,
  passes through risk assessment tasks, through the "Risk level acceptable?"
  gateway — the "No" branch ends without rejoining; the "Yes" branch crosses
  to the Compliance lane via its merge gateway — the "Compliance checks
  passed?" gateway routes a remediation loop back to its own merge gateway or
  ends on failure; the cleared branch crosses to the IT Security / Data
  Protection lane — the "Security assessment passed?" gateway routes a
  remediation loop back to its own merge gateway; flow then continues to the
  consolidated report and the "All checks cleared?" gateway whose "Yes"
  branch reaches the clearance end event and whose "No" branch ends in a
  separate failure end event.

Message flows:
  Send task "Issue due diligence questionnaire and document request to
    Prospective Supplier" → Prospective Supplier (due diligence
    questionnaire and document checklist)
  Prospective Supplier → Intermediate message catch event "Supplier
    documentation and attestations received" (capability statements,
    compliance attestations, insurance details, financial information)
  Send task "Request independent financial and reference checks from Due
    Diligence / Reference Agency" → Due Diligence / Reference Agency
    (check request with supplier identifiers)
  Due Diligence / Reference Agency → Intermediate message catch event
    "External agency report received" (financial report and reference
    verification results)
  User task "Issue security remediation request to Prospective Supplier"
    → Prospective Supplier (security remediation requirements)
  Prospective Supplier → Intermediate message catch event "Security
    remediation evidence received" (updated security certifications and
    control evidence)
  Send task "Issue due diligence clearance notice to Prospective Supplier"
    → Prospective Supplier (due diligence clearance confirmation)
  Service task "Retrieve supplier history and risk alerts from Risk
    Management System" → Risk Management System (query for supplier
    history)
  Risk Management System → Service task "Retrieve supplier history and
    risk alerts from Risk Management System" (risk alerts and performance
    history)
  Service task "Record risk assessment findings in Risk Management System"
    → Risk Management System (risk assessment record)
  User task "Record IT security and data protection outcome in Risk
    Management System" → Risk Management System (security assessment
    outcome)

7. Data objects

Data Object "Due Diligence Questionnaire" — written by Send task "Issue
  due diligence questionnaire and document request to Prospective
  Supplier"; read by User task "Assess financial, operational and
  reputational risk".
Data Object "Supplier Documentation Package" — read by User task "Assess
  financial, operational and reputational risk"; read by User task
  "Conduct regulatory and policy compliance checks"; read by User task
  "Conduct IT security and data protection assessment".
Data Object "External Agency Report" — read by User task "Assess
  financial, operational and reputational risk".
Data Object "Risk Assessment Record" — written by User task "Assess
  financial, operational and reputational risk"; written by Service task
  "Record risk assessment findings in Risk Management System".
Data Object "Compliance Check Record" — written by User task "Conduct
  regulatory and policy compliance checks"; written by User task "Review
  modern slavery, ESG, anti-bribery, and conflict of interest
  attestations".
Data Object "IT Security Assessment Record" — written by User task
  "Conduct IT security and data protection assessment"; written by User
  task "Record IT security and data protection outcome in Risk Management
  System".
Data Object "Consolidated Due Diligence Report" — written by User task
  "Compile consolidated due diligence report"; read by Exclusive gateway
  "All checks cleared?".
Data Store "Risk Management System Repository" — written by Service task
  "Record risk assessment findings in Risk Management System"; written by
  User task "Record IT security and data protection outcome in Risk
  Management System"; read by Service task "Retrieve supplier history and
  risk alerts from Risk Management System".

V09.07 Conduct Due Diligence assesses each shortlisted supplier across
three parallel dimensions — financial and operational risk, regulatory and
policy compliance, and IT security and data protection — drawing on direct
supplier submissions, independent agency reports, and the organisation's
own risk history. Suppliers that satisfy all checks receive a formal
clearance notice; those with unresolved material findings are returned to
the shortlisting step. A consolidated due diligence report for cleared
suppliers is handed to V09.08 Negotiate Commercial Terms, enabling
negotiations to proceed on a verified, risk-informed basis.
```

### V09.08 — Negotiate Commercial Terms

**BPMN diagram prompt.**

```text
BPMN: V09.08 Negotiate Commercial Terms — the subprocess in which the
Sourcing Organisation and the Prospective Supplier agree pricing, terms,
and commercial positions before the contract is drafted.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams conducting the
negotiation.
  Lane "Procurement" — procurement manager leading the negotiation.
  Lane "Category Management" — category manager providing category
  strategy and commercial insight.
  Lane "Finance" — commercial analyst reviewing pricing and financial
  positions.
Pool "Prospective Supplier" — the external vendor participating in
negotiation exchanges.
Pool "Sourcing Platform" — IT system recording negotiation events,
positions, and approved outcomes.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Prospective Supplier" — black-box, single instance.
Pool "Sourcing Platform" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Prospective Supplier
2. Sourcing Organisation
3. Sourcing Platform

4. Lane contents in flow order (Sourcing Organisation)

Procurement lane:
  Message start event "Shortlisted supplier received from Shortlist
  Suppliers (V09.06)"
  User task "Prepare negotiation strategy and agenda"
  User task "Establish negotiation team and assign roles"
  Send task "Issue opening commercial position to supplier"
  Intermediate message catch event "Supplier counter-position received"
  Expanded Subprocess "Repeat Until Commercial Position Agreed"
  (standard loop) containing, in order: User task "Review supplier
  counter-position", User task "Formulate revised organisational
  position", Send task "Submit revised position to supplier",
  Intermediate message catch event "Supplier response received"
  Exclusive gateway "Agreement reached on commercial terms?"
    - branch "Yes": continue to Finance lane review
    - branch "No — negotiation failed": End event "Negotiation
      terminated — supplier not progressed"
  Exclusive merge gateway "Agreement reached on commercial terms"
  User task "Document agreed commercial positions and concessions"
  Service task "Record negotiation outcome in Sourcing Platform"

Category Management lane:
  User task "Review category strategy alignment with opening position"
  User task "Advise on market benchmarks and walk-away points"
  User task "Confirm final commercial position against category plan"

Finance lane:
  User task "Validate pricing and financial terms against budget"
  User task "Confirm financial approval of agreed commercial terms"
  End event "Commercial terms agreed — ready for Draft Contract
  (V09.09)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until
Commercial Position Agreed" — label "Negotiation deadline exceeded" —
flows to End event "Negotiation terminated — deadline passed".

6. Connectors

Sequence flows: The flow begins in the Procurement lane with the start
event, moves through strategy preparation, team assignment, and the
opening position send task, then pauses at the intermediate message
catch event for the supplier counter-position. The negotiation loop
subprocess follows, after which the exclusive gateway "Agreement reached
on commercial terms?" branches: the "No — negotiation failed" branch
ends in its own termination end event and does not rejoin; the "Yes"
branch passes through the exclusive merge gateway, then to documenting
and recording agreed positions in Procurement. Control crosses to the
Category Management lane during strategy review and benchmark advice
before the opening position is issued, and returns for final position
confirmation after the loop. Control crosses to the Finance lane for
pricing validation and financial approval, which leads to the
subprocess end event.

Message flows:
Sourcing Organisation (Procurement) → Prospective Supplier (opening
commercial position document).
Prospective Supplier → Sourcing Organisation (Procurement) (supplier
counter-position).
Sourcing Organisation (Procurement) → Prospective Supplier (revised
commercial position during loop iterations).
Prospective Supplier → Sourcing Organisation (Procurement) (supplier
response during loop iterations).
Sourcing Organisation (Procurement) → Sourcing Platform (negotiation
outcome record — agreed positions, concessions, final terms).
Sourcing Platform → Sourcing Organisation (Procurement) (confirmation
of record stored).

7. Data objects

Data Object "Negotiation Strategy Document" — written by "Prepare
negotiation strategy and agenda"; read by "Review category strategy
alignment with opening position".
Data Object "Opening Commercial Position" — written by "Prepare
negotiation strategy and agenda"; read by "Issue opening commercial
position to supplier".
Data Object "Supplier Counter-Position" — written by Prospective
Supplier (external); read by "Review supplier counter-position".
Data Object "Market Benchmark Data" — read by "Advise on market
benchmarks and walk-away points".
Data Object "Revised Organisational Position" — written by "Formulate
revised organisational position"; read by "Submit revised position to
supplier".
Data Object "Agreed Commercial Terms Record" — written by "Document
agreed commercial positions and concessions"; read by "Validate pricing
and financial terms against budget" and "Record negotiation outcome in
Sourcing Platform".
Data Store "Sourcing Platform Negotiation Log" — written by "Record
negotiation outcome in Sourcing Platform".

V09.08 Negotiate Commercial Terms covers the end-to-end exchange of
commercial positions between the Sourcing Organisation and the
Prospective Supplier, from issuing an opening position through iterated
counter-position rounds until agreement is reached or negotiations are
terminated. Finance validates pricing against budget and confirms
financial approval, while Category Management ensures alignment with
category strategy and market benchmarks throughout. The subprocess hands
a fully documented, approved set of commercial terms to V09.09 Draft
Contract, where Legal and Contract Management will translate those
positions into a binding agreement.
```

### V09.09 — Draft Contract

**BPMN diagram prompt.**

```text
BPMN: V09.09 Draft Contract — the subprocess in which Legal and Contract
Management prepare, review, and finalise contract documentation with the
Prospective Supplier, sitting between Negotiate Commercial Terms (V09.08)
and Approve Contract (V09.10) in the Source to Contract value chain.

1. Pools & Lanes

Pool "Sourcing Organisation" — the organisation running the drafting process,
containing Legal and Contract Management lanes.
- Lane "Legal" (legal counsel)
- Lane "Contract Management" (contract manager)

Pool "Prospective Supplier" — the external vendor or service provider who
reviews and redlines the draft contract.

Pool "Contract Lifecycle Management System" — the CLM platform used to store
templates, manage drafts, track redlines, and record the final contract.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Prospective Supplier" — black-box, single instance.
Pool "Contract Lifecycle Management System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Prospective Supplier
2. Sourcing Organisation
3. Contract Lifecycle Management System

4. Lane contents in flow order (Sourcing Organisation)

Legal lane:
  Message start event "Agreed commercial terms received from V09.08"
  Service task "Retrieve contract template from CLM system"
  User task "Select and adapt contract template to deal specifics"
  User task "Incorporate agreed commercial terms into draft"
  User task "Review draft for legal compliance and risk"
  Send task "Issue draft contract to Prospective Supplier for review"
  Intermediate message catch event "Supplier redlines or comments received"
  Expanded Subprocess "Repeat Until Draft Agreed" (standard loop) containing,
    in order: User task "Assess supplier redlines and proposed changes",
    Exclusive gateway "Changes acceptable?",
    - branch "accepted": User task "Incorporate accepted changes into draft",
    - branch "requires negotiation": User task "Prepare legal counter-position",
    Send task "Issue revised draft to Prospective Supplier",
    Intermediate message catch event "Supplier response received",
    Exclusive merge gateway "Changes acceptable?"
  User task "Produce clean final draft contract"
  User task "Conduct final legal sign-off review"
  Exclusive gateway "Legal sign-off granted?"
  - branch "yes": continue to Contract Management lane
  - branch "no": User task "Revise draft to address legal sign-off issues",
    then rejoin at "Conduct final legal sign-off review" via loop —
    modelled as Expanded Subprocess "Repeat Until Legal Sign-Off Granted"
    (standard loop) containing, in order: User task "Revise draft to address
    legal sign-off issues", User task "Conduct final legal sign-off review"
  Exclusive merge gateway "Legal sign-off granted?"

Contract Management lane:
  User task "Record finalised draft in CLM system"
  User task "Compile contract pack with supporting schedules and annexes"
  User task "Confirm all obligations and key dates captured in CLM system"
  Service task "Submit contract pack for approval in CLM system"
  End event "Final contract pack ready — proceed to Approve Contract (V09.10)"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess "Repeat Until Draft
Agreed", labelled "Redline cycle limit reached (configurable threshold)",
leading to User task "Escalate unresolved redlines to procurement manager".

6. Connectors

Sequence flows: flow runs from the message start event in the Legal lane
through template retrieval, adaptation, terms incorporation, legal review,
and issuance to the Prospective Supplier. After supplier redlines are
received, the "Repeat Until Draft Agreed" loop processes each redline
cycle through the "Changes acceptable?" exclusive gateway, branching to
incorporation or counter-position tasks, re-issuance, and an intermediate
message catch event before merging back. On exit from the loop, the Legal
lane continues to the final draft and legal sign-off subprocess, merging at
"Legal sign-off granted?" before passing to the Contract Management lane,
where the draft is recorded, the contract pack assembled, obligations
confirmed, and the pack submitted, ending at the end event.

Message flows:
Sourcing Organisation (Legal lane, Send task "Issue draft contract") →
  Prospective Supplier (draft contract for review)
Prospective Supplier → Sourcing Organisation (Legal lane, Intermediate
  message catch event "Supplier redlines or comments received")
  (supplier redlines, mark-ups, or comments)
Sourcing Organisation (Legal lane, Send task "Issue revised draft") →
  Prospective Supplier (revised contract draft)
Prospective Supplier → Sourcing Organisation (Legal lane, Intermediate
  message catch event "Supplier response received") (supplier response to
  revised draft)
Sourcing Organisation (Legal lane, Service task "Retrieve contract
  template") → Contract Lifecycle Management System (template retrieval
  request)
Contract Lifecycle Management System → Sourcing Organisation (Legal lane,
  Service task "Retrieve contract template") (contract template and
  standard clauses)
Sourcing Organisation (Contract Management lane, User task "Record
  finalised draft") → Contract Lifecycle Management System (finalised draft
  stored in contract repository)
Sourcing Organisation (Contract Management lane, Service task "Submit
  contract pack") → Contract Lifecycle Management System (contract pack
  submitted to approval workflow)

7. Data objects

Data Object "Agreed Commercial Terms" — read by User task "Incorporate
  agreed commercial terms into draft".
Data Object "Contract Template" — read by User task "Select and adapt
  contract template to deal specifics"; written by Service task "Retrieve
  contract template from CLM system".
Data Object "Draft Contract" — written by User task "Incorporate agreed
  commercial terms into draft"; read by User task "Review draft for legal
  compliance and risk"; written by User task "Incorporate accepted changes
  into draft"; written by User task "Produce clean final draft contract".
Data Object "Supplier Redlines" — written by Intermediate message catch
  event "Supplier redlines or comments received"; read by User task "Assess
  supplier redlines and proposed changes".
Data Object "Legal Counter-Position" — written by User task "Prepare legal
  counter-position"; read by Send task "Issue revised draft to Prospective
  Supplier".
Data Object "Contract Pack" — written by User task "Compile contract pack
  with supporting schedules and annexes"; read by Service task "Submit
  contract pack for approval in CLM system".
Data Store "CLM Contract Repository" — written by User task "Record
  finalised draft in CLM system"; written by User task "Confirm all
  obligations and key dates captured in CLM system".

V09.09 Draft Contract takes the agreed commercial terms produced in
V09.08 and converts them into a legally sound, fully negotiated contract
document. Legal counsel selects and adapts a template, incorporates the
negotiated terms, manages redline exchanges with the Prospective Supplier
until the text is agreed, and completes a final legal sign-off. Contract
Management then records the clean draft in the CLM system, assembles the
full contract pack with schedules and annexes, confirms all obligations and
key dates, and submits the pack to the approval workflow, handing it to
Approve Contract (V09.10).
```

### V09.10 — Approve Contract

**BPMN diagram prompt.**

```text
BPMN: V09.10 Approve Contract — the internal approval gate that confirms
a negotiated contract draft is commercially, legally, and financially
sound before execution in the Source to Contract value chain.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams that review and approve
the contract draft.
  Lane "Procurement" — procurement manager who coordinates the approval
  workflow and acts on the outcome.
  Lane "Business Owner" — business owner who confirms the contract meets
  operational requirements.
  Lane "Finance" — finance controller who validates commercial and
  financial terms.
Pool "Contract Lifecycle Management System" — CLM platform that hosts the
contract draft, routes the approval workflow, records decisions, and
stores the approved contract.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Contract Lifecycle Management System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Sourcing Organisation (white-box, lanes top to bottom: Procurement,
   Business Owner, Finance)
2. Contract Lifecycle Management System

4. Lane contents in flow order (Sourcing Organisation)

Procurement lane:
  Message start event "Contract draft received from Draft Contract
  (V09.09)"
  Service task "Submit contract draft to CLM approval workflow"
  Intermediate message catch event "Approval workflow initiated
  confirmation received"
  Exclusive gateway "Approval route required?"
  - branch "Standard approval": continue to Business Owner review
  - branch "Finance sign-off also required": continue to Business Owner
    review in parallel with Finance review (proceed to parallel split
    below)
  Exclusive merge gateway "Approval route required?"
  (flow continues after parallel join or sequential review, see below)
  Intermediate message catch event "All reviewer decisions received"
  Exclusive gateway "Contract approved by all reviewers?"
  - branch "Approved": Service task "Mark contract as approved in CLM
    system"
    End event "Contract approved — ready for Execute Contract (V09.11)"
  - branch "Rejected or changes required":
    User task "Record rejection reasons and required amendments"
    Send task "Return contract draft to Contract Management with
    amendment instructions"
    End event "Contract returned to Draft Contract (V09.09) for
    revision"

Business Owner lane:
  User task "Review contract against operational requirements"
  Exclusive gateway "Meets operational requirements?"
  - branch "Yes": Send task "Submit approval decision to CLM"
  - branch "No — amendments needed": User task "Document required
    changes"
    Send task "Submit rejection decision with comments to CLM"
  Exclusive merge gateway "Meets operational requirements?"

Finance lane:
  User task "Review commercial and financial terms"
  Exclusive gateway "Financial terms acceptable?"
  - branch "Yes": Send task "Submit financial approval decision to CLM"
  - branch "No — amendments needed": User task "Document financial
    concerns"
    Send task "Submit financial rejection decision with comments to CLM"
  Exclusive merge gateway "Financial terms acceptable?"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on Expanded Subprocess covering the
full review cycle — label "Approval deadline exceeded (configurable
policy limit)" — triggers: User task "Escalate overdue approval to
Procurement Manager", then rejoins the rejection path leading to "Record
rejection reasons and required amendments".

6. Connectors

Sequence flows: The flow starts in the Procurement lane, moves to the
Business Owner lane (and in parallel to the Finance lane when the
Finance route is selected), with each reviewer lane sending its decision
back through CLM; the parallel or sequential results converge at the
"All reviewer decisions received" catch event in the Procurement lane;
the gateway then branches to the approved end event or the rejection and
return path.

Message flows:
Contract Lifecycle Management System → Procurement lane (approval
workflow initiated confirmation).
Business Owner lane → Contract Lifecycle Management System (approval or
rejection decision with comments).
Finance lane → Contract Lifecycle Management System (financial approval
or rejection decision with comments).
Contract Lifecycle Management System → Procurement lane (consolidated
reviewer decisions).
Procurement lane → Contract Lifecycle Management System (approved status
recorded).
Procurement lane → Contract Lifecycle Management System (amendment
instructions recorded on rejection).

7. Data objects

Data Object "Contract Draft" — read by "Review contract against
operational requirements"; read by "Review commercial and financial
terms"; read by "Submit contract draft to CLM approval workflow".
Data Object "Approval Decision Record" — written by "Submit approval
decision to CLM"; written by "Submit financial approval decision to
CLM"; written by "Submit rejection decision with comments to CLM";
written by "Submit financial rejection decision with comments to CLM".
Data Object "Amendment Instructions" — written by "Record rejection
reasons and required amendments"; read by "Return contract draft to
Contract Management with amendment instructions".
Data Store "CLM Contract Repository" — written by "Mark contract as
approved in CLM system"; read by "Submit contract draft to CLM approval
workflow".

V09.10 Approve Contract takes the negotiated and drafted contract from
V09.09 and routes it through a structured internal approval workflow
covering operational, commercial, and financial sign-off. Each reviewer
records a decision in the CLM system; unanimous approval marks the
contract as ready for execution. A rejection or amendment request returns
the draft to Contract Management with documented instructions, re-entering
V09.09 before approval is sought again. On successful approval the process
hands a formally authorised contract to Execute Contract (V09.11).
```

### V09.11 — Execute Contract

**BPMN diagram prompt.**

```text
BPMN: V09.11 Execute Contract — the subprocess within V09 Source to
Contract in which the finalised, approved contract is formally signed by
all parties and the executed document is stored, completing the
contracting stage before handover to supplier management.

1. Pools & Lanes

Pool "Sourcing Organisation" — the internal teams carrying out contract
execution (white-box, process-bearing pool).
  Lanes top to bottom:
  - Contract Management (contract manager)
  - Legal (legal counsel)
Pool "Prospective Supplier" — the external counterparty who countersigns
the contract.
Pool "eSignature Provider" — the platform intermediary that routes,
certifies, and returns the executed document.
Pool "eSignature Platform" — IT system that manages the digital signing
workflow and certificate issuance.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Prospective Supplier" — black-box, single instance.
Pool "eSignature Provider" — black-box, single instance.
Pool "eSignature Platform" — black-box, System = true, single instance.

3. Layout

Top to bottom:
1. Prospective Supplier
2. eSignature Provider
3. Sourcing Organisation
4. eSignature Platform

4. Lane contents in flow order (Sourcing Organisation)

Contract Management lane:
  Message start event "Approved contract received from Approve Contract
    (V09.10)"
  User task "Review approved contract package for completeness"
  User task "Prepare execution version and signing schedule"
  Service task "Submit contract to eSignature Platform for routing"
  Intermediate message catch event "Internal signatories notified by
    eSignature Platform"
  User task "Coordinate internal signatory completion"
  Intermediate message catch event "Internal signatures confirmed by
    eSignature Platform"
  Send task "Issue contract to Prospective Supplier for countersignature"
  Intermediate timer catch event "Supplier countersignature window
    (standard deadline)"
  Exclusive gateway "Supplier countersignature received?"
    - branch "Yes": continue to Legal lane — retrieve executed document
    - branch "No — deadline passed": Escalation end event "Countersignature
        not received — escalate to procurement manager" (does not rejoin)
  Exclusive merge gateway "Supplier countersignature received"
  Service task "Retrieve fully executed contract from eSignature Platform"
  Service task "Store executed contract in Contract Lifecycle Management
    System"
  User task "Confirm contract execution to all internal stakeholders"
  End event "Contract executed — ready for Hand Over to Supplier
    Management / Procure to Pay (V09.12)"

Legal lane:
  User task "Confirm execution version matches approved draft"
  User task "Review and countersign on behalf of organisation (if
    required)"
  User task "Validate executed document integrity and certificate"

5. Edge-mounted (boundary) events

Interrupting timer boundary event on User task "Coordinate internal
signatory completion" — label "Internal signing overdue" — triggers Send
task "Chase internal signatories" in Contract Management lane, then
returns to the intermediate message catch event "Internal signatures
confirmed by eSignature Platform".
Non-interrupting escalation boundary event on Expanded Subprocess
(implicit coordination window) — label "Supplier requests amendment post
issue" — triggers User task "Refer amendment request to Legal for
assessment" in Legal lane; outcome loops back to preparation step or
closes without rejoining if Legal terminates the execution attempt.

6. Connectors

Sequence flows: Flow begins in the Contract Management lane with the
message start event, moves through preparation and submission tasks, then
pauses at two intermediate message catch events for internal signatory
confirmation. After the send task issues the contract, a timer catch event
enforces the supplier deadline. The exclusive gateway "Supplier
countersignature received?" branches to either the escalation end event
(No branch, no rejoin) or merges at "Supplier countersignature received"
(Yes branch). Flow then passes to the Legal lane for validation tasks
before returning to Contract Management for storage, stakeholder
notification, and the end event.

Message flows:
Sourcing Organisation (Contract Management) → eSignature Platform
  (submission of contract package and signing instructions)
eSignature Platform → Sourcing Organisation, Contract Management lane
  (signatory notifications and status confirmations)
Sourcing Organisation (Contract Management) → Prospective Supplier
  (contract issued for countersignature)
Prospective Supplier → eSignature Provider (countersignature submitted)
eSignature Provider → eSignature Platform (certified countersignature
  package returned)
eSignature Platform → Sourcing Organisation, Contract Management lane
  (fully executed contract and certificate delivered)

7. Data objects

Data Object "Approved Contract Package" — read by User task "Review
  approved contract package for completeness".
Data Object "Execution Version" — written by User task "Prepare execution
  version and signing schedule"; read by Service task "Submit contract to
  eSignature Platform for routing".
Data Object "Signing Schedule" — written by User task "Prepare execution
  version and signing schedule"; read by User task "Coordinate internal
  signatory completion".
Data Object "Internal Signature Confirmations" — written by Intermediate
  message catch event "Internal signatures confirmed by eSignature
  Platform"; read by User task "Coordinate internal signatory completion".
Data Object "Supplier Countersignature" — written by Intermediate timer
  catch event "Supplier countersignature window (standard deadline)";
  read by Exclusive gateway "Supplier countersignature received?".
Data Object "Executed Contract Document" — written by Service task
  "Retrieve fully executed contract from eSignature Platform"; read by
  Service task "Store executed contract in Contract Lifecycle Management
  System".
Data Object "eSignature Certificate" — written by eSignature Platform;
  read by User task "Validate executed document integrity and certificate".
Data Store "Contract Lifecycle Management System" — written by Service
  task "Store executed contract in Contract Lifecycle Management System".

V09.11 Execute Contract takes the approved contract produced in V09.10
and steers it through the full bilateral signing cycle: internal
preparation and signatory coordination via the eSignature Platform,
issuance to the Prospective Supplier for countersignature, Legal
validation of the certified document, and secure storage of the fully
executed instrument. The subprocess ends with the signed contract
confirmed in the Contract Lifecycle Management System and all internal
stakeholders notified, handing a complete, legally effective agreement
to V09.12 Hand Over to Supplier Management / Procure to Pay.
```

### V09.12 — Hand Over to Supplier Management / Procure to Pay

**BPMN diagram prompt.**

```text
BPMN: V09.12 Hand Over to Supplier Management / Procure to Pay —
the final subprocess of V09 Source to Contract, transferring the
executed contract and supplier record to Vendor Management and
activating the supplier in the Procure to Pay process.

1. Pools & Lanes

Pool "Sourcing Organisation" — the organisation running the
handover process, containing Contract Management and Vendor
Management teams.
  Lane "Contract Management" — contract manager who initiates
  and manages the handover.
  Lane "Vendor Management" — vendor manager who receives the
  handover and activates supplier management.
Pool "Supplier Relationship Management System" — SRM system
that records supplier master data and onboards the supplier
into ongoing management.
Pool "Procurement / ERP System" — ERP system that activates
the supplier record and enables Procure to Pay transactions.

2. Pool properties

Pool "Sourcing Organisation" — white-box, single instance.
Pool "Supplier Relationship Management System" — black-box,
System = true, single instance.
Pool "Procurement / ERP System" — black-box, System = true,
single instance.

3. Layout

Top to bottom:
1. Sourcing Organisation
2. Supplier Relationship Management System
3. Procurement / ERP System

4. Lane contents in flow order (Sourcing Organisation)

Contract Management lane:
  Message start event "Executed contract received from
  Execute Contract (V09.11)"
  User task "Compile handover pack"
  User task "Confirm contract obligations and key milestones"
  User task "Submit handover pack to Vendor Management"
  Intermediate message catch event "Handover receipt
  confirmed by Vendor Management"

Vendor Management lane:
  User task "Review handover pack"
  Exclusive gateway "Handover pack complete?"
    - branch "No — information missing": User task "Request
      missing information from Contract Management"
      Intermediate message catch event "Missing information
      received"
      Exclusive merge gateway "Handover pack complete"
    - branch "Yes": Exclusive merge gateway "Handover pack
      complete"
  User task "Register supplier in SRM system"
  Service task "Create supplier master record in SRM system"
  User task "Activate supplier in Procurement / ERP system"
  Service task "Enable supplier in Procurement / ERP system"
  User task "Assign vendor manager and set review schedule"
  User task "Notify Contract Management of successful
  handover"
  User task "Confirm handover to Procure to Pay process owner"
  End event "Supplier activated and handed over — ready for
  Supplier Management and Procure to Pay"

5. Edge-mounted (boundary) events

Non-interrupting timer boundary event on "Review handover
pack" — label "Handover review overdue (2 business days)" —
triggers a Send task "Escalate handover delay to procurement
manager" in the Vendor Management lane; flow returns to the
normal path.

6. Connectors

Sequence flows: work begins in the Contract Management lane
with the message start event, passes through pack compilation
and obligation confirmation before submission to Vendor
Management, then pauses at the intermediate message catch
event until receipt is confirmed. Flow continues in the Vendor
Management lane through the review gateway; the "No" branch
returns to the merge point via the missing-information request
and catch event, and the "Yes" branch joins directly at the
same merge gateway. From the merge, flow proceeds through SRM
registration, ERP activation, vendor manager assignment,
notifications, and ends at the end event.

Message flows:
Contract Management → Supplier Relationship Management System
(handover pack and contract obligations submitted for
supplier master record creation)
Supplier Relationship Management System → Vendor Management
(supplier master record confirmation)
Vendor Management → Procurement / ERP System (supplier
activation request)
Procurement / ERP System → Vendor Management (supplier
enabled confirmation)

7. Data objects

Data Object "Handover Pack" — written by "Compile handover
pack"; read by "Review handover pack".
Data Object "Contract Obligations and Key Milestones" —
written by "Confirm contract obligations and key milestones";
read by "Register supplier in SRM system".
Data Store "Supplier Master Record" — written by "Create
supplier master record in SRM system"; read by "Enable
supplier in Procurement / ERP system".
Data Store "Supplier Register (SRM)" — written by "Register
supplier in SRM system"; read by "Assign vendor manager and
set review schedule".
Data Object "Vendor Manager Assignment and Review Schedule"
— written by "Assign vendor manager and set review schedule";
read by "Confirm handover to Procure to Pay process owner".

V09.12 closes the Source to Contract value chain by transferring
the executed contract, all associated obligations, and the
supplier master record from the contracting teams to Vendor
Management and the Procure to Pay process. The contract manager
assembles and submits a complete handover pack; the vendor
manager verifies it, registers the supplier in the SRM system,
and activates the supplier account in the Procurement / ERP
system. On completion, the supplier is live, a vendor manager
is assigned, and the organisation is ready to transact and
manage the relationship under V09's successor processes.
```
