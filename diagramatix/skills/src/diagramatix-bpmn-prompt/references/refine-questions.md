# Refinement — finding the gaps and asking about them

This is the same idea as the "Refine" step inside Diagramatix: interview the author for the few facts a BPMN process needs and the description lacks, then fold the answers into the prompt. You are **not** drawing anything and you are **not** teaching BPMN — you are asking a business person sharp, process-specific questions they can answer in seconds.

## What a complete description establishes

{{DIMENSIONS}}

Check the user's description against that list. A dimension is a **gap** only if the diagram would change depending on the answer.

## Beyond the list — the gaps that cause bad diagrams

These are the points where a missing answer makes the drawn diagram wrong, rather than merely incomplete. Look for them specifically:

- **A decision whose branches are not all stated.** "If approved, … " with no word on the other case. Every decision needs a path for every outcome (or an "otherwise").
- **Where each branch goes next.** A branch that ends, rejoins, or hands over to another process — the prompt must say which. Ask when the description just trails off.
- **Things that happen at the same time.** "Meanwhile…", "in parallel", "both teams…". These are parallel branches and must rejoin; ask if the description is ambiguous between "one or the other" and "both".
- **A wait.** Waiting for a customer, an approval, a delivery. Is there a **deadline** (an escalation, chase or timeout)? A bare wait and a wait that can time out are drawn differently.
- **Repetition.** "Until complete", "chase again". Which steps repeat, and what is the condition? Only the repeating steps go in the loop.
- **Another party: a pool or a lane?** Someone outside the organisation (a customer, a broker, another entity) is a separate participant that messages are exchanged with. Another role *inside* the organisation is a lane, and work passes to them directly. Ask when a party could be either.
- **Systems.** Which system holds each record, and which steps use it. Do not invent a system the description does not name.
- **What goes wrong.** Errors, rejections, deadlines missed — and where each exception path ends.
- **How it ends.** Every end state, success and failure, named.

## How to ask

- **At most six** questions, in **one** message, highest-impact first.
- Each question has a short **label** (2–4 words, e.g. "Rejection path"), the **question**, whether it is **single choice** or **multiple choice**, and **2–5 concrete options** drawn from the user's own process. You then add **Other** and **Skip — assume it** yourself; they are not counted in the 2–5.
- Never re-ask anything the user has already stated or answered. If an earlier round happened in this conversation, treat its answers as settled.
- Specific to *this* process. "Who approves the credit check — the Credit Controller, the Finance Manager, or automatically?" is good. "Do you want exception handling?" is not.
- If the description is already complete, say so plainly and go to the draft.

A good shape:

> **1. Rejection path** — When the order fails the credit check, what happens?
> (a) It is cancelled and the customer is told · (b) It goes to the Finance Manager for an override · (c) It is held until payment arrives · (d) Other · (e) Skip — assume it

## Folding the answers in

Put each answer **into the section it belongs to** in the prompt — a rejection path goes under the gateway in section 4, a named system into sections 1, 2 and 6 — not into a separate "answers" block. The finished prompt reads as one coherent instruction, not a prompt plus a patch.

## When the user skips

Take the **most ordinary version** of the detail, keep it short, and write it in the Assumptions list so the user can correct it. Examples of acceptable assumptions: "the Reviewer role approves; there is no escalation", "the process ends when the record is saved". Not acceptable: inventing a named system, a specific time limit, or an external party the description never mentions.

## A second round

After the draft, the user may want to adjust. Take their changes, update the prompt, re-run the self-check, and deliver again in the same shape. Offer another refinement round only if the changes opened a new gap.
