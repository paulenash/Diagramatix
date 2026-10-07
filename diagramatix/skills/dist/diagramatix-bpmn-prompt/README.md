# Diagramatix BPMN prompt skill — for Greg

A skill that writes a **Diagramatix-ready BPMN prompt** in the standard house format, with a refinement stage that fills the gaps and a self-check that the prompt can actually be drawn. Template version **v7** (2026-09-05).

## What's in the folder

```
diagramatix-bpmn-prompt/
  SKILL.md                      the instructions (this is the skill)
  README.md                     this file
  VERSION.json                  which template version it was built from
  references/
    master-template.md          the seven-section house template — authoritative
    refine-questions.md         how to find the gaps and ask about them
    house-rules.md              YOUR conventions — edit this one
    self-check.md               the checklist run before delivery
    example-prompt.md           a real, proven prompt of the right shape
  scripts/
    check_prompt.mjs            optional checker (needs Node.js; no installs)
```

## Installing it

The skill is plain files, so it works in any environment that supports Agent Skills. Use the **zip** (`diagramatix-bpmn-prompt.zip`) or the folder.

- **Claude (claude.ai or the desktop app):** Settings → Capabilities (or Features) → Skills → upload the zip. Turn it on. In a new chat, say *"Use the Diagramatix BPMN prompt skill"* or just describe the process you want a prompt for.
- **Claude Code:** unzip into `~/.claude/skills/` (all projects) or `<project>/.claude/skills/` (one project), so you have `.../skills/diagramatix-bpmn-prompt/SKILL.md`. It is picked up automatically.
- **Anything else that reads Agent Skills:** put the folder wherever that tool looks for skills.

No code execution is needed. If your environment can run Node.js, the optional checker adds an automatic check; if not, the skill follows the checklist by reading.

## Using it

Give it what you have: a description, an SOP, interview notes, a meeting transcript, a rough list of steps. It will:

1. ask up to six short questions about what's missing (you can answer, skip, or say "just assume"),
2. draft the prompt in the house format,
3. apply your house rules,
4. check it, and
5. hand you the prompt in a block to paste into Diagramatix's **AI Generate**, with a note of any assumptions.

You can then ask for changes and it will update the prompt and re-check it.

## Customising

Open `references/house-rules.md` and write your conventions under **ACTIVE RULES** (naming, standard participants, preferred system names, vocabulary, level of detail). Anything under *EXAMPLES — NOT ACTIVE* is ignored. Rules refine the prompt; they cannot override the rules that decide whether a diagram can be drawn.

## Keeping it current

The template inside is a copy of the one Diagramatix uses, stamped with its version in `VERSION.json`. If the house template changes, you will be sent a new zip — replace the folder and keep your `house-rules.md`.
