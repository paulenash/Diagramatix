# Diagram check fixtures

Drop an exported diagram `.json` here and run `npm test` to vet it against the
BPMN structural checker — no app, no API, no database needed.

## How to use

1. In the app: **File → Export JSON** on the diagram you want to check.
2. Save (or copy) the `.json` into this folder.
3. From `diagramatix/`, run:
   ```
   npm test
   ```
   Each diagram in each `.json` is run through `checkDiagram(...)`. The test
   fails and lists any violations (containment overflow, dangling connectors,
   merge gateway collapsed left of its inputs, connectors touching an event
   sub, boundary event on a pool, fabricated "Main Process" wrapper, etc.).

`.json` files here are git-ignored (they're scratch exports), so you can keep
a pile of them locally without polluting the repo. Delete them whenever.

## Adding a permanent regression case

If a generated diagram exposes a *new* layout bug, prefer encoding it as a
fixture **plan** in `../layoutEngine.test.ts` (hand-built AI plan → layout →
assertions). That runs the real engine and can never silently regress, whereas
a dropped export only reflects whatever build produced it.
