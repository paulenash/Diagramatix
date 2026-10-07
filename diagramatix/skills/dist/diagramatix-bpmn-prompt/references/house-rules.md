# House rules — your own conventions (edit this file)

The seven-section template in `master-template.md` is the fixed standard: it holds the rules that decide whether Diagramatix can draw the diagram. **This file is where you add your own conventions on top.** The skill reads it at the Customise stage and applies whatever is active.

**How it works**
- Rules here **refine** the draft: naming, vocabulary, standard participants, level of detail.
- They **never override** the template's drawability rules (every branch says where it goes, no Data Stores, no loop-backs, a message flow must cross a pool boundary, and so on). If a rule here conflicts with one of those, the skill follows the template and tells you.
- A rule stays active only while it is written under **ACTIVE RULES** below. Anything under **EXAMPLES — NOT ACTIVE** is ignored.
- Keep each rule to one clear sentence. Say *what to do*, not just what to avoid.

**To use:** copy a line from the examples up into the active list and edit it, or write your own. When you pass the skill to someone else, pass this file with it if you want them to follow the same conventions.

---

## ACTIVE RULES

(none yet)

---

## EXAMPLES — NOT ACTIVE

Naming
- Name every task with a verb and an object in the present tense ("Approve claim", not "Claim approval" or "Approving the claim").
- Name gateways as a question ending in a question mark ("Is the order complete?").
- Name end events by the outcome ("Order shipped"), never by "End".

Participants
- The main organisation is always called "Company", with one lane per role, named by job function and never by an individual.
- Always show the customer as a black-box pool at the top.

Systems
- Refer to our ERP as "SAP ERP" and our CRM as "Salesforce CRM" in every prompt.
- Show a system pool only for systems that a task writes to or reads from; do not list systems that are merely mentioned.

Level of detail
- Keep to about 25 steps per prompt; split anything longer into a main prompt and sub-prompts.
- Show exceptions only for payment failure and regulatory refusal; leave the rest out.

Vocabulary
- Say "client", never "customer", in labels.
