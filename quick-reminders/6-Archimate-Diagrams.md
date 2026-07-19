# Diagramatix — Quick Reminder Sheet 6

## ArchiMate Diagrams

ArchiMate is the open enterprise-architecture modelling language. Diagramatix implements **ArchiMate 3.1**, letting you model how strategy, business processes, applications, and technology fit together in one coherent picture. Shapes are drawn from a runtime catalogue (~75 element kinds) organised into layered accordions, and relationships come from the standard's connector set. Use it to trace, for example, how a business service is realised by an application component running on a technology node.

### Layers (shape categories)

**Strategy** — Resources, capabilities, courses of action — the "why-we-invest" layer (e.g. Resource, Capability, Course of Action).

**Business** — The organisation's actors, roles, processes, services, and objects (e.g. Business Actor, Business Role, Business Process, Business Service). The richest layer in the catalogue.

**Application** — The application services and components that support the business (e.g. Application Component, Application Collaboration, Application Service).

**Technology** — The infrastructure that runs the applications (e.g. Node, Device, System Software, Communication Network).

**Motivation** — Stakeholders, drivers, goals, requirements — the reasons behind the architecture (e.g. Stakeholder, Driver, Goal, Requirement).

*Physical and Implementation & Migration elements are not yet in the catalogue.*

### Relationships

ArchiMate's connectors are grouped into four families, matching the connector picker:

**Structural** — Composition, Aggregation, Assignment, Realisation.
**Dependency** — Serving, Access, Influence, Association.
**Dynamic** — Triggering, Flow.
**Other** — Specialisation.

Each carries the standard's distinct line style and arrowhead so the relationship type is readable at a glance.

### How to use it

- Stack the layers top-to-bottom (Motivation/Strategy → Business → Application → Technology) and let realisation/serving relationships cross between them.
- Pick the *weakest* relationship that is true — over-using Composition/Assignment overstates coupling.

---
*Note: A Junction relationship exists in the source stencils but is not part of the current 11-type connector picker.*
