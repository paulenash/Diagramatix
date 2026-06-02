# GetConnected — Sample Organisation for Diagram Prompts

A reference set of AI-Generate prompts for **GetConnected**, an Australian start-up membership organisation whose value proposition is *discounted goods and services from a curated network of partner providers in exchange for an annual membership fee*. The aim is to give members good value while leaving GetConnected a reasonable margin on top of the overhead of running the business.

Each prompt below is self-contained and written so it can be pasted straight into Diagramatix's **AI Generate** panel to produce the named diagram. The five sections below cover, in turn, the **Context Diagram**, the **ArchiMate** view, the **Value Chain**, the **Process Context** group diagrams, and the detailed **BPMN** process diagrams.

---

## 1. Organisational Context (Context Diagram)

### Prompt 1 — GetConnected Organisational Context

> **Diagram type:** Context
>
> Generate a Context Diagram for **GetConnected**, an Australian membership organisation that gives its members discounted goods and services from a curated network of partner providers in exchange for an annual membership fee. The diagram should show GetConnected at the centre with the following external entities around it and the main information / document flows labelled on each connector.
>
> **External entities**
>
> - **Members** — individuals and household groups. Submit membership applications, pay annual subscription fees, redeem discount offers, lodge support enquiries, receive welcome packs, monthly newsletters, renewal reminders and personalised offer recommendations.
> - **Partner Providers** — retailers, service businesses, hospitality, health, travel and lifestyle brands. Exchange partnership agreements, discount code / voucher lists, redemption reports and monthly commission settlements with GetConnected.
> - **Payment Gateway (Stripe)** — processes card payments for member subscriptions, sends settlement reports and refund confirmations back to GetConnected.
> - **Business Bank** — holds operating accounts; sends statements, processes direct debits and BPAY for members who don't pay by card, and clears outbound payments to providers and suppliers.
> - **Australian Taxation Office (ATO)** — receives quarterly BAS, PAYG instalments, annual income tax returns and superannuation guarantee reports; issues tax assessments and notices.
> - **Australian Securities and Investments Commission (ASIC)** — receives annual company returns, changes of officeholder and registered office updates.
> - **Office of the Australian Information Commissioner (OAIC)** — receives any data-breach notifications and privacy-policy compliance reports.
> - **Australian Competition & Consumer Commission (ACCC)** — receives consumer-complaint records and is notified of any marketing-claim disputes.
> - **External Auditor** — receives the annual financial statements and supporting ledgers; issues audit opinion.
> - **Insurance Broker** — receives renewal information and risk disclosures; supplies policy schedules and certificates of currency.
> - **Email / SMS Service (Mailchimp / Twilio)** — receives campaign content and recipient lists; returns delivery, open and click reports.
> - **Cloud Hosting Provider (AWS / Azure)** — receives deployment artefacts and configuration; supplies infrastructure, uptime reports and invoices.

---

## 2. Organisational Capabilities and Services (ArchiMate)

### Prompt 2 — GetConnected Capabilities, Teams, Roles and IT Systems

> **Diagram type:** ArchiMate
>
> Generate an ArchiMate diagram for **GetConnected** showing the **Business**, **Application** and **Technology** layers, with capabilities and services aligned vertically across them. Group elements by the organisational team that owns them.
>
> **Business layer — Capabilities, Teams, Roles**
>
> Capabilities GetConnected needs to operate:
> - *Member Management* — acquisition, onboarding, retention, support
> - *Provider Network Management* — sourcing partners, negotiating discounts, settling commissions
> - *Offer & Catalogue Management* — curating, categorising and publishing the discount catalogue
> - *Marketing & Communications* — campaigns, content, newsletters, social
> - *Payment & Billing* — subscriptions, renewals, refunds
> - *Finance & Accounting* — ledger, payroll, tax, reporting
> - *Compliance & Risk* — privacy, consumer law, regulatory reporting
> - *Technology Operations* — running and evolving the digital products
> - *Data & Analytics* — member behaviour, offer performance, churn
>
> Teams and the Roles inside them:
> - *Executive Team* — Managing Director, Chief Financial Officer, Chief Operating Officer, Chief Technology Officer
> - *Member Services Team* — Head of Member Services, Member Services Officers (×4), Member Onboarding Specialist
> - *Provider Relations Team* — Head of Partnerships, Provider Account Managers (×3), Partnerships Coordinator
> - *Marketing Team* — Marketing Manager, Content Producer, Campaign Coordinator, Designer
> - *Technology Team* — CTO, Lead Developer, Developers (×3), DevOps Engineer
> - *Finance & Operations Team* — Financial Controller, Bookkeeper, Operations Manager
> - *Compliance Team* — Compliance Officer (part time), External Privacy Counsel (advisor)
>
> Business Processes / Functions (assigned to a team):
> - Member Acquisition, Member Onboarding, Subscription Renewal, Membership Cancellation
> - Provider Sourcing, Provider Onboarding, Offer Publication, Monthly Provider Settlement
> - Campaign Planning, Campaign Execution, Newsletter Production
> - Member Support Triage, Support Resolution, Escalation
> - Monthly Close, Quarterly BAS, Annual Audit
> - Privacy Review, Consumer-Law Review, Incident Response
>
> **Application layer — IT systems and main components**
>
> - *Member Portal (Public Web App)* — components: Catalogue Browser, Offer Search, Redemption Workflow, Profile & Preferences, Self-Service Renewal / Cancellation
> - *Membership CRM (Salesforce or similar)* — components: Member Records, Lifecycle Stage, Support Cases, Marketing Consent
> - *Provider Portal (Internal Web App)* — components: Offer Editor, Redemption Reports, Settlement Statements
> - *Offer Catalogue Service* — central database of offers, categories, eligibility rules
> - *Billing & Subscriptions* — components: Subscription Manager, Card Vault (via Stripe), Invoicing, Refunds
> - *Marketing Automation Platform (Mailchimp / Customer.io)* — components: Lists, Templates, Campaigns, Drip Sequences
> - *Helpdesk (Zendesk / Freshdesk)* — components: Ticket Queue, Knowledge Base, SLA Manager
> - *Accounting System (Xero)* — components: General Ledger, Payroll, BAS Worksheet, Bank Feeds
> - *Analytics & BI (Looker / Metabase)* — components: Data Warehouse, Member Cohort Reports, Offer Performance Dashboards
>
> **Technology layer**
>
> Cloud platform (AWS or Azure), PostgreSQL database, Container hosting (App Service / ECS), Object storage, Email / SMS delivery infrastructure, Identity provider (Auth0 / Cognito), CDN, Backup & DR.

---

## 3. Value Chains (Value Chain Diagram)

### Prompt 3 — GetConnected Value Chains

> **Diagram type:** Value Chain
>
> Generate a Value Chain diagram for **GetConnected** showing the **departments** (one chain each) running left-to-right across the page, with each chain broken down into **Process Groups** that contain the **Processes** delivering that group.
>
> **Departments / Value Chains**
>
> 1. **Member Services** — the end-to-end member lifecycle.
> 2. **Provider Relations** — the end-to-end provider lifecycle.
> 3. **Marketing & Communications** — turning awareness into members and active redemptions.
> 4. **Technology** — building and running the platforms.
> 5. **Finance & Operations** — keeping the business solvent, compliant and audited.
>
> **Member Services value chain** — Process Groups (left → right):
>
> - *Acquire* → Marketing Lead Capture, Membership Trial Signup, Conversion to Paid
> - *Onboard* → Account Creation, Payment Setup, Welcome Pack Delivery, First-Offer Recommendation
> - *Engage* → Offer Browsing, Discount Redemption, Member Support, Personalised Recommendations
> - *Retain* → Renewal Reminders, Win-back Offers, Loyalty Tier Upgrades
> - *Off-board* → Cancellation, Exit Survey, Re-engagement Campaign
>
> **Provider Relations value chain** — Process Groups:
>
> - *Source* → Market Scan, Partner Outreach, Commercial Negotiation
> - *Onboard* → Agreement Sign-off, Offer Setup, Portal Access Provisioning
> - *Operate* → Offer Updates, Redemption Reconciliation, Provider Support
> - *Settle* → Monthly Statements, Commission Payments, Performance Review
> - *Renew or Exit* → Annual Renewal, Termination, Hand-off
>
> **Marketing & Communications value chain** — Process Groups:
>
> - *Plan* → Campaign Calendar, Audience Segmentation, Budget Allocation
> - *Create* → Content Production, Creative Approval, A/B Test Setup
> - *Execute* → Newsletter Send, Social Campaign, Paid Acquisition
> - *Measure* → Engagement Reporting, Attribution, Cohort Analysis
>
> **Technology value chain** — Process Groups:
>
> - *Design* → Roadmap Planning, Feature Briefs, Architecture Review
> - *Build* → Development Sprint, Code Review, Automated Testing
> - *Deploy* → CI/CD Release, Production Cutover, Smoke Test
> - *Operate* → Monitoring, Incident Response, On-call Rotation, Backup Verification
>
> **Finance & Operations value chain** — Process Groups:
>
> - *Bill & Collect* → Subscription Billing, Failed-Payment Recovery, Refunds
> - *Pay* → Provider Payments, Supplier Payments, Payroll
> - *Close* → Monthly Bookkeeping, Reconciliation, Management Reporting
> - *Report* → Quarterly BAS, Annual Tax Return, Annual Audit, Board Pack

---

## 4. Process Groups (Process Context Diagrams)

Each prompt below produces one Process Context Diagram for a single process group, showing the processes inside the group as the central elements, with their actors (roles, teams or systems) and the main artefacts that flow into and out of each process.

### Prompt 4.1 — Member Acquisition Process Group

> **Diagram type:** Process Context
>
> Generate a Process Context Diagram for **GetConnected — Member Acquisition**.
>
> **Processes** (numbered, in flow order):
>
> 1. Capture Lead
> 2. Qualify Lead
> 3. Convert to Free Trial
> 4. Convert to Paid Membership
> 5. Welcome Hand-off
>
> **External entities and actors:**
>
> - *Prospective Member* (external entity, person)
> - *Marketing Team* (internal team)
> - *Member Onboarding Specialist* (internal role)
> - *Marketing Automation Platform* (IT system)
> - *Member Portal* (IT system)
> - *Stripe* (IT system / external)
> - *Membership CRM* (IT system / data store)
>
> **Flow connectors** (open-directed):
>
> - *Prospective Member* → Capture Lead, with label "Sign-up form submission"
> - *Marketing Automation Platform* → Qualify Lead, with label "Drip sequence engagement"
> - Capture Lead → Qualify Lead → Convert to Free Trial → Convert to Paid Membership → Welcome Hand-off
> - Convert to Paid Membership → *Stripe*, with label "Subscription payment"
> - Welcome Hand-off → *Membership CRM*, with label "Active member record"
> - Welcome Hand-off → *Member Onboarding Specialist*, with label "Case auto-created"

### Prompt 4.2 — Member Onboarding Process Group

> **Diagram type:** Process Context
>
> Generate a Process Context Diagram for **GetConnected — Member Onboarding**.
>
> **Processes:**
>
> 1. Create Member Profile
> 2. Configure Payment Method
> 3. Deliver Welcome Pack
> 4. First Offer Recommendation
> 5. Onboarding Survey
>
> **External entities and actors:**
>
> - *New Member* (external entity, person)
> - *Member Onboarding Specialist* (internal role)
> - *Member Portal* (IT system)
> - *Stripe* (IT system, payment)
> - *Marketing Automation Platform* (IT system)
> - *Recommendation Engine* (IT system, analytics)
> - *Membership CRM* (data store)
>
> **Flow connectors:**
>
> - *New Member* → Create Member Profile, "Personal details"
> - Create Member Profile → *Membership CRM*, "Member record"
> - Create Member Profile → Configure Payment Method
> - Configure Payment Method → *Stripe*, "Card details (tokenised)"
> - Configure Payment Method → Deliver Welcome Pack
> - Deliver Welcome Pack → *Marketing Automation Platform*, "Welcome email + member number"
> - Deliver Welcome Pack → First Offer Recommendation
> - *Recommendation Engine* → First Offer Recommendation, "Personalised offer list"
> - First Offer Recommendation → Onboarding Survey
> - Onboarding Survey → *Membership CRM*, "Preference profile"

### Prompt 4.3 — Discount Redemption Process Group

> **Diagram type:** Process Context
>
> Generate a Process Context Diagram for **GetConnected — Discount Redemption**.
>
> **Processes:**
>
> 1. Browse Catalogue
> 2. Generate Redemption Code
> 3. Redeem at Provider
> 4. Confirm Redemption
> 5. Capture Member Feedback
>
> **External entities and actors:**
>
> - *Member* (external entity, person)
> - *Partner Provider* (external entity, organisation)
> - *Member Portal* (IT system)
> - *Offer Catalogue Service* (IT system)
> - *Provider POS System* (external IT system)
> - *Recommendation Engine* (IT system)
>
> **Flow connectors:**
>
> - *Member* → Browse Catalogue, "Search / filter criteria"
> - *Offer Catalogue Service* → Browse Catalogue, "Available offers"
> - Browse Catalogue → Generate Redemption Code, "Selected offer"
> - Generate Redemption Code → *Member*, "One-time code or QR"
> - *Member* → Redeem at Provider, "Code presented in store / online"
> - *Provider POS System* → Confirm Redemption, "Redemption webhook"
> - Confirm Redemption → *Offer Catalogue Service*, "Redemption record + settlement queued"
> - Confirm Redemption → Capture Member Feedback
> - *Member* → Capture Member Feedback, "Star rating + review"
> - Capture Member Feedback → *Recommendation Engine*, "Feedback signal"

### Prompt 4.4 — Provider Onboarding Process Group

> **Diagram type:** Process Context
>
> Generate a Process Context Diagram for **GetConnected — Provider Onboarding**.
>
> **Processes:**
>
> 1. Sign Partnership Agreement
> 2. Set Up Provider Portal Access
> 3. Configure Initial Offers
> 4. Publish Offers
> 5. Configure Settlement Terms
>
> **External entities and actors:**
>
> - *Partner Provider* (external entity, organisation)
> - *Head of Partnerships* (internal role)
> - *Provider Account Manager* (internal role)
> - *Compliance Officer* (internal role)
> - *Marketing Team* (internal team)
> - *Finance Team* (internal team)
> - *Provider Portal* (IT system)
> - *Offer Catalogue Service* (IT system)
> - *Accounting System (Xero)* (IT system / data store)
> - *Document Management* (IT system / data store)
>
> **Flow connectors:**
>
> - *Partner Provider* → Sign Partnership Agreement, "Counter-signed agreement"
> - *Head of Partnerships* → Sign Partnership Agreement
> - *Compliance Officer* → Sign Partnership Agreement, "Compliance review sign-off"
> - Sign Partnership Agreement → *Document Management*, "Signed agreement PDF"
> - Sign Partnership Agreement → Set Up Provider Portal Access
> - *Provider Account Manager* → Set Up Provider Portal Access, "Portal credentials issued"
> - Set Up Provider Portal Access → Configure Initial Offers
> - *Partner Provider* → Configure Initial Offers, "Offer details and discount %"
> - Configure Initial Offers → *Offer Catalogue Service*, "Draft offers"
> - Configure Initial Offers → Publish Offers
> - *Marketing Team* → Publish Offers, "Newsletter announcement"
> - Publish Offers → Configure Settlement Terms
> - *Finance Team* → Configure Settlement Terms
> - Configure Settlement Terms → *Accounting System (Xero)*, "Provider payee record"

### Prompt 4.5 — Monthly Provider Settlement Process Group

> **Diagram type:** Process Context
>
> Generate a Process Context Diagram for **GetConnected — Monthly Provider Settlement**.
>
> **Processes:**
>
> 1. Aggregate Monthly Redemptions
> 2. Calculate Commission
> 3. Produce Settlement Statement
> 4. Approve Payment Batch
> 5. Pay Providers
>
> **External entities and actors:**
>
> - *Partner Provider* (external entity, organisation)
> - *Bookkeeper* (internal role)
> - *Financial Controller* (internal role)
> - *Business Bank* (external entity, organisation)
> - *Offer Catalogue Service* (IT system / data store)
> - *Accounting System (Xero)* (IT system / data store)
> - *Provider Portal* (IT system)
>
> **Flow connectors:**
>
> - *Offer Catalogue Service* → Aggregate Monthly Redemptions, "Redemption events for the month"
> - Aggregate Monthly Redemptions → Calculate Commission
> - *Accounting System (Xero)* → Calculate Commission, "Commission rates per provider"
> - Calculate Commission → Produce Settlement Statement
> - Produce Settlement Statement → *Provider Portal*, "PDF statement"
> - Produce Settlement Statement → *Partner Provider*, "Statement email"
> - Produce Settlement Statement → Approve Payment Batch
> - *Financial Controller* → Approve Payment Batch
> - Approve Payment Batch → Pay Providers
> - *Bookkeeper* → Pay Providers
> - Pay Providers → *Business Bank*, "ABA / payment file"
> - Pay Providers → *Accounting System (Xero)*, "Payment journal entries"

---

## 5. Detailed Process Descriptions (BPMN Diagrams)

Each prompt below follows the canonical 6-section BPMN structure: Pools / Lanes → Pool Properties → Layout → Lane Contents (in flow order) → Boundary Events → Connectors.

### Prompt 5.1 — Member Onboarding (Paid Signup)

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Paid Member Onboarding**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `Member` (no lanes)
> - Pool `GetConnected` with lanes: `Member Services`, `Marketing`
> - Pool `Stripe` (no lanes)
> - Pool `Membership CRM` (no lanes)
>
> **2. Pool properties**
>
> - `Member`: black-box, non-system
> - `GetConnected`: white-box
> - `Stripe`: black-box, system
> - `Membership CRM`: black-box, system
>
> **3. Layout**
>
> - `Member` at the top
> - `GetConnected` in the middle
> - `Stripe` and `Membership CRM` at the bottom
>
> **4. Lane contents in flow order**
>
> - `Member Services` lane: Start Event (Member completes paid signup) → user task "Validate Profile Details" → exclusive gateway "Details valid?" → user task "Create Member Profile" → service task "Charge First Subscription" → exclusive gateway "Payment successful?" → user task "Trigger Welcome Sequence" → user task "Create Onboarding Case" → End Event (Member active)
> - `Marketing` lane: send task "Deliver Welcome Pack" → service task "Schedule First-Offer Email"
> - On the "Details valid? = No" branch in Member Services: send task "Request Missing Details" → End Event (Application abandoned) after timeout
> - On the "Payment successful? = No" branch: user task "Notify Member of Payment Failure" → End Event (Signup failed)
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on "Request Missing Details" (7 days) — if no response, route to End Event (Application abandoned)
>
> **6. Connectors**
>
> - Sequence flows follow the order above within each lane.
> - Message flow: `Member` → "Validate Profile Details", labelled "Signup form"
> - Message flow: "Charge First Subscription" → `Stripe`, labelled "Card charge"
> - Message flow: `Stripe` → "Charge First Subscription", labelled "Charge result"
> - Message flow: "Create Member Profile" → `Membership CRM`, labelled "Member record"
> - Message flow: "Trigger Welcome Sequence" → `Membership CRM`, labelled "Lifecycle stage = Active"
> - Message flow: "Deliver Welcome Pack" → `Member`, labelled "Welcome email + member number"
> - Message flow: "Notify Member of Payment Failure" → `Member`, labelled "Payment failure email"

**Staff Narrative — Sam, Member Services Officer**

When a Member finishes their paid signup on our website, the signup form lands in front of me first. I open it in our Membership CRM and check the basics — does the name match the email domain at all, is the home address a real address, is the date of birth at least 18 years old. If anything looks off or is missing, I email the Member asking them to fill in the gaps. If I don't hear back within seven days I close the application as "abandoned" so we're not chasing it forever.

Once the details check out, I create the Member's profile in the Membership CRM and run their card through Stripe to collect the first year's subscription. Stripe normally tells me within a second or two whether the card went through. If the charge fails I email the Member with the bad news; some come back a day later with a different card, but if we can't get a successful charge I close the signup as failed and the Member is free to try again at their leisure.

If the charge succeeds I trigger the Welcome Sequence inside the Membership CRM, which flips the Member's lifecycle stage over to "Active", and I open an onboarding case so the team knows there's a brand-new Member to keep an eye on for the first month.

Meanwhile, Jess in Marketing is already on it: she pulls the Welcome Pack template, drops in the Member's name and member number, and posts it out. She also queues up the first "Member Offer of the Month" email so it lands in the Member's inbox a fortnight after they sign up — that's the email that historically wins us the second-year renewal.

### Prompt 5.2 — Discount Redemption

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Discount Redemption**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `Member` (no lanes)
> - Pool `GetConnected` with lanes: `Member Portal`, `Offer Catalogue Service`, `Recommendation Engine`
> - Pool `Partner Provider` (no lanes)
>
> **2. Pool properties**
>
> - `Member`: black-box, non-system
> - `GetConnected`: white-box
> - `Partner Provider`: black-box, non-system
>
> **3. Layout**
>
> - `Member` at the top, `GetConnected` in the middle, `Partner Provider` at the bottom
>
> **4. Lane contents in flow order**
>
> - `Member Portal`: Start Event (Member opens catalogue) → user task "Browse and Filter Offers" → user task "Select Offer" → service task "Request Redemption Code" → user task "Display Code or QR to Member"
> - `Offer Catalogue Service`: service task "Validate Offer Eligibility" → exclusive gateway "Member eligible?" → service task "Generate One-Time Code" → service task "Reserve Offer Quota" → (waiting…) → service task "Mark Redemption Confirmed" → service task "Queue Settlement Entry" → End Event (Redemption complete)
> - `Recommendation Engine`: service task "Record Feedback Signal" → End Event (Recommendation refreshed)
> - On the "Member eligible? = No" branch: end task "Show Ineligible Message" → End Event (Offer not eligible)
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on "Reserve Offer Quota" (30 days) — if no redemption webhook arrives, route to service task "Release Reserved Quota" → End Event (Redemption expired)
>
> **6. Connectors**
>
> - Sequence flows follow the order within each lane; the Member Portal hands off to Offer Catalogue Service after "Request Redemption Code", and Offer Catalogue Service hands off to Recommendation Engine after "Queue Settlement Entry".
> - Message flow: `Member` → "Browse and Filter Offers", labelled "Search criteria"
> - Message flow: "Display Code or QR to Member" → `Member`, labelled "Redemption code"
> - Message flow: `Member` → `Partner Provider`, labelled "Presents code in store / at checkout"
> - Message flow: `Partner Provider` → "Mark Redemption Confirmed", labelled "Redemption webhook"
> - Message flow: `Member` → "Record Feedback Signal", labelled "Star rating + review"

**Staff Narrative — Nikki, Offer Catalogue Coordinator**

Members log into the Member Portal whenever they fancy a deal. They scroll the catalogue, filter by category or location, and tap "Save offer" on whatever catches their eye. Once they pick something to actually redeem, the Member Portal asks the Offer Catalogue Service to check the Member's eligibility for me — is the account current, have they already maxed their monthly redemption cap, is the offer still live. If anything's off, the Member just sees a friendly "sorry, you're not eligible" notice and that's the end of the trip.

If the Member can redeem, I generate a one-time code (or a QR code if the Partner Provider prefers to scan), tag a slot in the offer's monthly quota as reserved for that Member, and pop the code back into the Member Portal so the Member can show it at the checkout. They've got 30 days to use it; if they don't, I quietly release the reserved slot back into the pool.

When the Member walks into the Partner Provider's shop and hands over the code, the Partner Provider's checkout pings a redemption webhook into the Offer Catalogue Service. I mark the redemption confirmed and drop a settlement entry into next month's payment queue for Margaret in Finance to pay out. At the same time, I poke the Recommendation Engine so the Member's next browse leans toward similar offers — it's amazing how often someone who redeems a coffee deal redeems another one in the same week.

Members usually rate the offer a day or two later; their stars and review go straight into the Recommendation Engine too, which uses them to tune next month's "For You" panel.

### Prompt 5.3 — Provider Onboarding

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Provider Onboarding**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `Partner Provider` (no lanes)
> - Pool `GetConnected` with lanes: `Partnerships`, `Compliance`, `Marketing`, `Finance`
> - Pool `Document Management` (no lanes)
> - Pool `Provider Portal` (no lanes)
> - Pool `Accounting System (Xero)` (no lanes)
>
> **2. Pool properties**
>
> - `Partner Provider`: black-box, non-system
> - `GetConnected`: white-box
> - `Document Management`: black-box, system
> - `Provider Portal`: black-box, system
> - `Accounting System (Xero)`: black-box, system
>
> **3. Layout**
>
> - `Partner Provider` at the top, `GetConnected` in the middle, the three system pools at the bottom
>
> **4. Lane contents in flow order**
>
> - `Partnerships`: Start Event (Lead qualified) → user task "Draft Partnership Agreement" → send task "Email Agreement to Provider" → user task "Receive Counter-Signed Agreement" → user task "Activate Provider Account" → user task "Configure Initial Offers" → End Event (Provider live)
> - `Compliance`: user task "Run Due Diligence Check" → exclusive gateway "Compliance OK?" → user task "Sign Off Agreement" — on "Compliance OK? = No": end task "Reject Provider" → End Event (Provider declined)
> - `Marketing`: user task "Build Offer Launch Content" → send task "Publish Offer to Newsletter"
> - `Finance`: user task "Create Provider Payee Record" → user task "Set Commission Rates"
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on "Receive Counter-Signed Agreement" (14 days) — if no signed agreement returned, route to send task "Send Reminder", and on a second 14-day timeout to End Event (Lapsed before signing).
>
> **6. Connectors**
>
> - Sequence flows order each lane; "Sign Off Agreement" (Compliance) feeds back into "Receive Counter-Signed Agreement" (Partnerships) before the path proceeds.
> - Message flow: "Email Agreement to Provider" → `Partner Provider`, labelled "Partnership agreement PDF"
> - Message flow: `Partner Provider` → "Receive Counter-Signed Agreement", labelled "Signed agreement"
> - Message flow: "Sign Off Agreement" → `Document Management`, labelled "Filed agreement"
> - Message flow: "Activate Provider Account" → `Provider Portal`, labelled "Portal credentials"
> - Message flow: "Configure Initial Offers" → `Provider Portal`, labelled "Initial offer drafts"
> - Message flow: "Create Provider Payee Record" → `Accounting System (Xero)`, labelled "Payee + bank details"
> - Message flow: "Publish Offer to Newsletter" → `Partner Provider`, labelled "Go-live confirmation"

**Staff Narrative — Daniel, Partnerships Manager**

Once our sales team qualifies a Partner Provider lead and hands them across, I take over. I open the latest Partnership Agreement template, fill in the Provider's trading name, ABN, contacts, and the commission terms we negotiated, then email the agreement straight to the Partner Provider for counter-signing.

While I'm waiting on the signature, Sara in Compliance runs her due diligence checklist — an ABN lookup, an ASIC current-and-historical extract, a sanctions screen, and a quick spot-check that the trading address on the form matches what's on the public register. If Sara flags anything serious we reject the Provider then and there and email them a polite "not this time". If they pass, Sara signs the agreement on our side and files the fully executed PDF into Document Management so we can pull it up at audit time.

When the counter-signed agreement comes back, I activate the Provider Account on the Provider Portal and email the Partner Provider their login credentials. If the signed copy hasn't landed within fourteen days I send a reminder; if another fortnight goes by with nothing, I close the file as "lapsed before signing" and move on.

Once they're activated, the Partner Provider and I work through their first two or three offers and I load drafts into the Provider Portal for them to publish.

Around the same time, Tim in Marketing builds the launch content (one image, one paragraph, one button) and queues it for the next Member Newsletter so we make a bit of noise about the new Provider. Margaret in Finance creates a payee record for the Provider in Xero using the BSB, account number and bank statement the Provider sent across, and sets the agreed commission rate against the payee.

### Prompt 5.4 — Annual Subscription Renewal with Failed-Payment Recovery

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Annual Subscription Renewal**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `Member` (no lanes)
> - Pool `GetConnected` with lanes: `Billing`, `Member Services`, `Marketing`
> - Pool `Stripe` (no lanes)
> - Pool `Membership CRM` (no lanes)
>
> **2. Pool properties**
>
> - `Member`: black-box, non-system
> - `GetConnected`: white-box
> - `Stripe`: black-box, system
> - `Membership CRM`: black-box, system
>
> **3. Layout**
>
> - `Member` at the top, `GetConnected` in the middle, `Stripe` and `Membership CRM` at the bottom
>
> **4. Lane contents in flow order**
>
> - `Marketing`: Start Event (30 days before renewal date) → send task "Send Renewal Reminder Email" → send task "Send Second Reminder (7 days before)"
> - `Billing`: service task "Attempt Annual Charge" → exclusive gateway "Charge succeeded?" → service task "Update Subscription Period" → End Event (Renewed)
> - `Billing` (failure branch from "Charge succeeded? = No"): service task "Retry Charge (Day 1)" → exclusive gateway "Retry 1 succeeded?" → on No: service task "Retry Charge (Day 4)" → exclusive gateway "Retry 2 succeeded?" → on No: service task "Retry Charge (Day 7)" → exclusive gateway "Retry 3 succeeded?" → on No: user task "Mark Account Past Due" → send task "Send Final Notice" → End Event (Lapsed)
> - `Member Services`: user task "Triage Past Due Cases" → user task "Phone Outreach" → exclusive gateway "Member responded?" → on Yes: user task "Capture Updated Card" → loops back into `Billing` "Retry Charge" branch. On No: End Event (Lost member)
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on "Phone Outreach" (3 days) — if no response, route to End Event (Lost member).
>
> **6. Connectors**
>
> - Sequence flows follow the order above; the success path joins back into `Billing` "Update Subscription Period" after either the initial charge or any successful retry.
> - Message flow: "Send Renewal Reminder Email" → `Member`, labelled "30-day reminder"
> - Message flow: "Send Second Reminder (7 days before)" → `Member`, labelled "7-day reminder"
> - Message flow: "Attempt Annual Charge" → `Stripe`, labelled "Card charge"
> - Message flow: `Stripe` → "Attempt Annual Charge", labelled "Charge result"
> - Message flow: each "Retry Charge" → `Stripe`
> - Message flow: "Update Subscription Period" → `Membership CRM`, labelled "New period dates"
> - Message flow: "Phone Outreach" → `Member`, labelled "Call"
> - Message flow: `Member` → "Capture Updated Card", labelled "New card details (over secure form)"
> - Message flow: "Send Final Notice" → `Member`, labelled "Final notice email"

**Staff Narrative — Priya, Billing Officer**

Every Member's renewal date sits on their record in the Membership CRM. A month out, Marketing automatically fires off the first reminder email ("Hi Member, your GetConnected membership renews on date X — here's what you've used this year"). A week out, the same email goes again, slightly more urgent.

On the renewal date I run the Annual Charge through Stripe against the card on file. Most of the time Stripe says "yep, paid", I update the Member's subscription period in the Membership CRM, and we're done for another year. If Stripe declines the card, the retry routine kicks in: I retry on Day 1, Day 4, and Day 7. If any retry succeeds, the subscription rolls over as normal and the Member never knows a thing.

When all three retries fail, the Member's account moves to Past Due. Glen in Member Services picks the case up: he phones the Member, talks them through whether the card has expired or the bank has changed, and captures a new card on a secure form. The new card flows straight back into the next available retry slot. If Glen can't get hold of the Member within three days, or if they're not interested in renewing, we send the Final Notice email and the membership lapses.

We follow our "Past Due Outreach" procedure for the phone calls — three attempts at different times of day, a voicemail script if we get an answering machine, and a polite SMS on the third attempt if the call doesn't connect.

### Prompt 5.5 — Member Cancellation with Exit Survey

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Member Cancellation**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `Member` (no lanes)
> - Pool `GetConnected` with lanes: `Member Services`, `Marketing`, `Billing`
> - Pool `Stripe` (no lanes)
> - Pool `Membership CRM` (no lanes)
>
> **2. Pool properties**
>
> - `Member`: black-box, non-system
> - `GetConnected`: white-box
> - `Stripe`: black-box, system
> - `Membership CRM`: black-box, system
>
> **3. Layout**
>
> - `Member` at the top, `GetConnected` in the middle, systems at the bottom
>
> **4. Lane contents in flow order**
>
> - `Member Services`: Start Event (Member requests cancellation) → user task "Verify Identity" → user task "Offer Retention Incentive" → exclusive gateway "Accepted incentive?" → on Yes: user task "Apply Retention Offer" → End Event (Retained). On No: user task "Confirm Cancellation Intent" → user task "Capture Exit Survey Response" → user task "Schedule Off-boarding" → End Event (Cancelled)
> - `Billing`: service task "Cancel Stripe Subscription" → service task "Issue Pro-rata Refund" → exclusive gateway "Refund needed?" — On Yes: service task "Process Refund". On No: skip
> - `Marketing`: send task "Send Cancellation Confirmation Email" → service task "Add to Re-engagement Audience"
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on "Offer Retention Incentive" (3 days) — if member doesn't respond, treat as "No" and route to "Confirm Cancellation Intent".
>
> **6. Connectors**
>
> - Sequence flows follow the order in each lane; `Billing` and `Marketing` lanes start when "Schedule Off-boarding" finishes in Member Services.
> - Message flow: `Member` → "Verify Identity", labelled "Cancel request"
> - Message flow: "Offer Retention Incentive" → `Member`, labelled "Retention email or call"
> - Message flow: `Member` → "Confirm Cancellation Intent", labelled "Confirmed cancel"
> - Message flow: `Member` → "Capture Exit Survey Response", labelled "Survey response"
> - Message flow: "Cancel Stripe Subscription" → `Stripe`, labelled "Cancel subscription"
> - Message flow: "Process Refund" → `Stripe`, labelled "Refund request"
> - Message flow: "Send Cancellation Confirmation Email" → `Member`, labelled "Confirmation email"
> - Message flow: "Schedule Off-boarding" → `Membership CRM`, labelled "Lifecycle stage = Cancelled"

**Staff Narrative — Tariq, Retention Specialist**

When a Member calls or emails to cancel, the request lands in front of me. First I verify the Member is who they say they are — full name plus date of birth plus member number, or a quick call-back on the phone number sitting on their record if I have any doubt.

Then I take my best shot at retention. The conversation depends on why they're leaving: if it's "I'm not using it enough", I usually offer a free month plus a tailored roundup of high-value offers near them; if it's "too expensive", I can put a 20% discount on next year's renewal for long-standing Members. If the Member accepts, I apply the retention offer to their record in the Membership CRM and we keep them. If they decline — or if I haven't heard back within three days — I take the silence as "no" and move on.

For the cancellers, I confirm they really do want to cancel, then walk them through our four-question Exit Survey ("what changed", "what would have kept you", "best thing about us", "worst thing about us"). The answers go into the Exit Survey workbook so Marketing can spot any patterns at the quarterly review. I then schedule the off-boarding to take effect at the end of the current billing period.

Once off-boarding is scheduled, Finance cancels the Stripe subscription so the Member won't be charged again. If we owe them a pro-rata refund — depending on how far through their period they cancelled — Finance processes the refund through Stripe too.

Marketing sends a cancellation confirmation email so the Member has it in writing, and adds them to the Re-engagement Audience. Marketing usually hits the audience with a "we miss you, come back" email about six months later — historically that wins back roughly one in eight.

### Prompt 5.6 — Monthly Provider Settlement

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Monthly Provider Settlement**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `GetConnected` with lanes: `Finance`, `Provider Relations`
> - Pool `Partner Provider` (no lanes)
> - Pool `Offer Catalogue Service` (no lanes)
> - Pool `Accounting System (Xero)` (no lanes)
> - Pool `Business Bank` (no lanes)
>
> **2. Pool properties**
>
> - `GetConnected`: white-box
> - `Partner Provider`: black-box, non-system
> - `Offer Catalogue Service`: black-box, system
> - `Accounting System (Xero)`: black-box, system
> - `Business Bank`: black-box, system
>
> **3. Layout**
>
> - `GetConnected` in the middle
> - `Partner Provider` on the top
> - The three system pools on the bottom
>
> **4. Lane contents in flow order**
>
> - `Finance`: Start Event (First business day of the month) → service task "Pull Last Month's Redemptions" → service task "Calculate Commissions per Provider" → service task "Generate Provider Statements" → user task "Review Statements" → exclusive gateway "Anomaly detected?" → on Yes: user task "Investigate with Provider Relations" → loops back into "Review Statements". On No: user task "Approve Payment Batch" → service task "Generate ABA Payment File" → service task "Upload Payment File to Bank" → service task "Reconcile Payments" → End Event (Settlement closed)
> - `Provider Relations`: user task "Send Statement to Provider" → user task "Handle Provider Queries" → exclusive gateway "Adjustment required?" — On Yes: user task "Raise Credit/Debit Note" feeding back into "Generate Provider Statements".
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on "Handle Provider Queries" (5 business days) — if no query received, treat as "No adjustment" and route forward.
>
> **6. Connectors**
>
> - Sequence flows follow each lane's order; "Send Statement to Provider" runs in parallel with the Finance "Review Statements" step.
> - Message flow: `Offer Catalogue Service` → "Pull Last Month's Redemptions", labelled "Redemption ledger"
> - Message flow: "Calculate Commissions per Provider" → `Accounting System (Xero)`, labelled "Journal draft"
> - Message flow: "Send Statement to Provider" → `Partner Provider`, labelled "Settlement statement PDF"
> - Message flow: `Partner Provider` → "Handle Provider Queries", labelled "Query / dispute"
> - Message flow: "Upload Payment File to Bank" → `Business Bank`, labelled "ABA file"
> - Message flow: "Reconcile Payments" → `Accounting System (Xero)`, labelled "Payment confirmations"

**Staff Narrative — Margaret, Finance Manager**

First business day of every month, I pull last month's redemption ledger out of the Offer Catalogue Service. It's a long export, basically one row per redemption — Member, Partner Provider, offer, value, redemption date. I drop the export into the Provider Commissions workbook and run our standard commissions calculation per Provider (12.5% house rate, or whatever rate the agreement specifies for the bigger Providers we negotiated bespoke deals with). The workbook generates each Provider's statement page, and I post the matching journal draft straight into Xero.

Once the statements are drafted, Daniel in Provider Relations emails each Partner Provider their statement PDF for the month. While Daniel chases queries, I review every statement in parallel — looking for anything odd, like a Provider with double their usual redemption count, or a code redeeming at a value way off the offer's ticket price. If anything looks fishy I flag it to Daniel, and the two of us work it out with the Provider together. Sometimes that ends in a credit or debit note, which means I re-run the statement and we go around again.

If a Provider hasn't queried their statement within five business days, I take that as a quiet "all good" and push the settlement through anyway.

Once everything's clean I approve the payment batch, generate the ABA payment file out of Xero, upload the file to the Business Bank, and reconcile the bank confirmations back into Xero so the cash and journal sides agree. From start to bank-uploaded usually takes me three working days, four if there are queries.

### Prompt 5.7 — Quarterly BAS Lodgement

> **Diagram type:** BPMN
>
> Generate a BPMN diagram for **GetConnected — Quarterly BAS Lodgement**.
>
> **1. Pools, Lanes, Sublanes**
>
> - Pool `GetConnected` with lanes: `Bookkeeper`, `Financial Controller`, `Managing Director`
> - Pool `Accounting System (Xero)` (no lanes)
> - Pool `Australian Taxation Office (ATO)` (no lanes)
> - Pool `External Auditor` (no lanes)
>
> **2. Pool properties**
>
> - `GetConnected`: white-box
> - `Accounting System (Xero)`: black-box, system
> - `Australian Taxation Office (ATO)`: black-box, non-system
> - `External Auditor`: black-box, non-system
>
> **3. Layout**
>
> - `GetConnected` in the middle
> - `Accounting System (Xero)` on the left of `GetConnected`
> - `Australian Taxation Office (ATO)` on the bottom
> - `External Auditor` on the right of `GetConnected`
>
> **4. Lane contents in flow order**
>
> - `Bookkeeper`: Start Event (End of quarter) → user task "Reconcile Bank Feeds" → user task "Reconcile Stripe Payouts" → user task "Reconcile Provider Settlements" → service task "Generate Draft BAS in Xero" → send task "Send Draft BAS to Financial Controller"
> - `Financial Controller`: user task "Review Draft BAS" → exclusive gateway "BAS accurate?" → on No: send task "Return BAS with Notes" loops back to `Bookkeeper` "Generate Draft BAS in Xero". On Yes: user task "Sign Off BAS" → send task "Send to Managing Director for Authorisation"
> - `Managing Director`: user task "Authorise Lodgement" → service task "Lodge BAS to ATO Portal" → End Event (BAS lodged)
>
> **5. Edge-mounted (boundary) events**
>
> - Intermediate timer event on the Start Event (28 days after quarter end) — if not lodged by then, route to send task "Escalate to Director" → End Event (Late lodgement risk).
>
> **6. Connectors**
>
> - Sequence flows order each lane; the rework loop runs from `Financial Controller` "Return BAS with Notes" back into `Bookkeeper` "Generate Draft BAS in Xero".
> - Message flow: `Accounting System (Xero)` → "Generate Draft BAS in Xero", labelled "Quarterly transactions"
> - Message flow: "Send Draft BAS to Financial Controller" → `Financial Controller` "Review Draft BAS", labelled "Draft BAS PDF"
> - Message flow: "Send to Managing Director for Authorisation" → `Managing Director` "Authorise Lodgement", labelled "BAS for sign-off"
> - Message flow: "Lodge BAS to ATO Portal" → `Australian Taxation Office (ATO)`, labelled "Lodged BAS"
> - Message flow: `Australian Taxation Office (ATO)` → "Lodge BAS to ATO Portal", labelled "Lodgement receipt"
> - Message flow: "Sign Off BAS" → `External Auditor`, labelled "Filed copy for audit trail"

**Staff Narrative — Ava, Bookkeeper**

At the end of each quarter I set aside a quiet morning and reconcile everything. I start with the bank feeds for our trading and trust accounts, then move on to Stripe payouts (matching each payout against the cluster of charges and refunds that fed it), then to the monthly Provider settlements (making sure each ABA payment ties back to its journal entry). Once everything reconciles, I press "Generate Activity Statement" in Xero, save the draft as a PDF, and email it to Marcus the Financial Controller for review.

Marcus reads through the draft for an hour or so, working off our BAS Review checklist. He pays particular attention to anything where the GST collected and the GST paid look out of whack with what we'd usually expect for the quarter. If he spots a problem he sends the draft back to me with notes; I tweak the entry in Xero, regenerate the BAS, and we go around again. When he's satisfied he signs off and forwards the BAS to Karen, our Managing Director.

Karen reviews the BAS once more, then authorises the lodgement. She's the only one with the ATO Portal credentials, so she's the one who actually presses the button. The ATO Portal returns a lodgement receipt within seconds; Karen forwards the receipt to me and to Marcus, and I drop a filed copy with our External Auditor so they've got the full paper trail when they come for the annual audit.

The ATO gives us 28 days after quarter end to lodge. If we're still not done by then, our late-lodgement procedure kicks in and I escalate straight to Karen — the ATO charges a penalty unit per fortnight late, so we'd far rather hear about it sooner than later.
