# Simulation Sample Processes — Loan Approval (As-Is vs To-Be)

A pair of **related BPMN processes** for the Diagramatix Simulator: the *same* loan
approval process before and after automation, so the two can be generated, run
through the simulator, and compared (throughput, cycle time, cost, where the queues
build up).

Both processes share the same shape:

- The lender is **Aardwolf Loans** (the White-Box Pool); the applicant (**Customer**) is a
  Black-Box Pool that Aardwolf Loans exchanges Message Flows with.
- Loans come in three types — **personal, home, and commercial**.
- A **detailed, ordered initial assessment stage** (register → completeness check →
  identity/document verification → request-further-details loop → credit report →
  preliminary eligibility → proceed/decline → route by type).
- Three product teams as **Lanes** — **Personal Loans Team**, **Home Loans Team**,
  **Commercial Loans Team** — each drafting and approving its loan as a **single
  Collapsed Sub-Process**.
- The **documents** are named so they generate as Data Objects / Data Stores: Loan
  Application Form, supporting documents, Loan Assessment Checklist, Lending Policy,
  Request for Information, Credit Report, Assessment Summary, Decline Letter, Loan
  Agreement Template, Loan Offer.

**The only difference** is who does the initial assessment stage:

| | As-Is | To-Be |
|---|---|---|
| Initial assessment | **Loan Assessment Team** (people, manual) | **Loan Assessment AI Agent** (Service tasks) |
| Exceptions | handled in-line by the team | **Loan Assessment Specialist** — human-in-the-loop, exceptions only |

> **How to use:** open a BPMN diagram → **AI Generate** (the Plan panel) → paste a
> prompt below → generate. Generate the As-Is first, then the To-Be, then open each in
> the Simulator to compare. The prompts follow the order of the tasks and use BPMN
> terms where it makes the intended notation unambiguous — paste them verbatim.

---

## 1. As-Is — manual Loan Assessment Team

```
Model the lender "Aardwolf Loans" as a White-Box Pool divided into four Lanes — Loan Assessment Team,
Personal Loans Team, Home Loans Team and Commercial Loans Team — with the applicant as
a Black-Box "Customer" Pool above it. Every exchange between the Customer and the
lender is a Message Flow.

The process starts with a Message Start Event in the Loan Assessment Team lane when the
customer submits a completed Loan Application Form (a Data Object input; the customer
selects personal, home or commercial) together with their supporting documents (proof
of identity, proof of income, and property or business details). A "Register
Application" task opens the case.

A "Check Application Completeness" task works through the Loan Assessment Checklist
(Data Object). A "Verify Identity and Documents" task then validates the applicant
against the supporting documents and the Lending Policy — a Data Store the assessment
tasks read from. An Exclusive Gateway asks whether the application is complete and
verified.

If it is not, a "Request Further Information" send task issues a Request for
Information (Data Object) to the Customer via a Message Flow, and a "Receive Customer
Response" receive task waits for the reply before looping back to re-check. A Timer
Boundary Event on that wait (ten working days) routes a non-responding case to a
"Lapse Application" End Event.

Once the application is complete and verified, an "Obtain Credit Report" task produces
a Credit Report (Data Object) and an "Assess Eligibility and Affordability" task
evaluates the application against the Lending Policy, recording the result in an
Assessment Summary (Data Object). An Exclusive Gateway then asks whether to proceed: a
declined application goes to a "Send Decline Letter" task (Decline Letter Data Object,
Message Flow to the Customer) and a "Declined" End Event; a qualifying application
continues.

A "Determine Loan Type" Exclusive Gateway routes the application by type to the
matching product Lane. In each product Lane a single Collapsed Sub-Process — "Draft and
Approve Personal Loan", "Draft and Approve Home Loan" or "Draft and Approve Commercial
Loan" — drafts the paperwork from that team's Loan Agreement Template (Data Object) and
produces the decision. The outcome is sent to the Customer via a Message Flow as a Loan
Offer (Data Object) or a Decline Letter, ending at an "Application Closed" End Event.
```

---

## 2. To-Be — Loan Assessment AI Agent with a human in the loop

```
Model the lender "Aardwolf Loans" as a White-Box Pool divided into five Lanes — Loan Assessment AI
Agent, Loan Assessment Specialist, Personal Loans Team, Home Loans Team and Commercial
Loans Team — with the applicant as a Black-Box "Customer" Pool above it. Every exchange
between the Customer and the lender is a Message Flow.

The process starts with a Message Start Event in the Loan Assessment AI Agent lane when
the customer submits a completed Loan Application Form (a Data Object input; the
customer selects personal, home or commercial) together with their supporting documents
(proof of identity, proof of income, and property or business details). A "Register
Application" service task opens the case.

The AI Agent then runs a sequence of service tasks: "Check Application Completeness"
against the Loan Assessment Checklist (Data Object), "Verify Identity and Documents"
against the lender's records and the Lending Policy (a Data Store), "Obtain Credit
Report" producing a Credit Report (Data Object), and "Assess Eligibility and
Affordability" against the Lending Policy, recording the result in an Assessment Summary
(Data Object).

An Exclusive Gateway checks the agent's confidence after assessment. On an exception —
documents it cannot verify, missing or inconsistent information, or a case it flags —
the flow crosses to the Loan Assessment Specialist lane: a "Review Exception" user task
and, where needed, a "Request Further Information" send task issuing a Request for
Information (Data Object) to the Customer via a Message Flow, with a "Receive Response"
receive task (a Timer Boundary Event covers the ten-working-day deadline). A "Resolve
Exception" task then returns the case to the AI Agent's flow. Straightforward
applications skip the Specialist lane entirely.

An Exclusive Gateway then asks whether to proceed: a declined application goes to a
"Send Decline Letter" task (Decline Letter Data Object, Message Flow to the Customer)
and a "Declined" End Event; a qualifying application continues.

A "Determine Loan Type" Exclusive Gateway routes the application by type to the matching
product Lane. In each product Lane a single Collapsed Sub-Process — "Draft and Approve
Personal Loan", "Draft and Approve Home Loan" or "Draft and Approve Commercial Loan" —
drafts the paperwork from that team's Loan Agreement Template (Data Object) and produces
the decision. The outcome is sent to the Customer via a Message Flow as a Loan Offer
(Data Object) or a Decline Letter, ending at an "Application Closed" End Event.
```

---

## Notes for simulation

- The two processes are deliberately identical downstream (the three product-team
  Collapsed Sub-Processes), so a simulation comparison isolates the effect of
  automating the **initial assessment stage**.
- Give the initial-stage tasks **resource/duration** parameters that differ between the
  versions: the As-Is manual checks are slower and bounded by the Loan Assessment
  Team's capacity; in the To-Be the AI Agent's service tasks run near-instantly and
  only the **exception share** consumes the (scarce) Loan Assessment Specialist's time.
  Tuning the exception rate is the key lever.
- Branch the "Determine Loan Type" gateway with realistic mix probabilities (personal /
  home / commercial) so the three teams see representative volumes.
- The request-further-details loop (As-Is) and the exception hand-off (To-Be) are the
  main rework paths — watch where work queues up in each run.
