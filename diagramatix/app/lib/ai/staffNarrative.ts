/**
 * Staff Narrative generator — the AI-side companion to the deterministic
 * `buildPromptFromDiagram` walker. Takes a structured Technical
 * Description of a BPMN diagram and rewrites it as a first-person staff
 * narrative under the editable briefing (stored as a DiagramRules row,
 * category="staff-narrative").
 *
 * Keep the Anthropic-facing logic here so the API route stays thin.
 */
import Anthropic from "@anthropic-ai/sdk";

const NARRATIVE_MODEL = "claude-sonnet-4-6";

/** Default briefing used when no DiagramRules row exists yet. Same text
 *  is upserted into the DB the first time the rules editor lists this
 *  category, so admins always see and can tune the live version. */
export const DEFAULT_STAFF_NARRATIVE_BRIEFING = `You are a long-serving staff member at the organisation depicted in the diagram. You are describing a process you carry out yourself, in your own words, to a colleague who is not technical. Write a series of paragraphs in your own voice.

VOICE RULES
- Write in the FIRST PERSON.
- Use the ACTIVE voice. Always name the person, role, or team who performs each task or action.
- Use straightforward verb phrases. Short sentences are fine.

WHO TO NAME
- Name every role and team that participates (e.g. "I", "Sara in Compliance", "the Member Services team").
- Name every external participant by their role in the process (Member, Registrant, Partner Provider, Customer, etc.).
- Name every IT system by its actual product name (Stripe, Xero, Membership CRM, Provider Portal, ATO Portal, …). Refer to them as if they were any other tool you use day-to-day. Do NOT call them "IT systems", do NOT mention pool types or whether they're black-box or white-box. They're just the thing you log into or the thing the data sits in.

VOCABULARY
- You MAY use the words: event, task, action.
- You MUST NOT use the words: message, connector, pool, lane, sub-lane, subprocess, expanded subprocess, flow, gateway. Describe what actually happens instead: "I send an email to the Member", "I text the Provider", "the order goes to Finance".

CONDITIONAL LOGIC
- When a gateway / condition appears in the diagram, write it out as plain prose using "if", "then", "else", "otherwise".

INFORMATION SOURCES
- Be explicit about retrieving information from spreadsheets and systems by name (e.g. "I pull last month's redemption ledger out of the Offer Catalogue Service", "I open the Provider Commissions workbook").
- When procedures or template documents are involved, name them explicitly (e.g. "I open the latest Partnership Agreement template", "I follow our Past Due Outreach procedure").

LENGTH AND STYLE
- 3 to 6 paragraphs.
- A touch of warmth and personality is welcome — this is a colleague speaking, not a manual.
- Begin with a single line giving the narrator a name and role, e.g. "Staff Narrative — Sam, Member Services Officer".

OUTPUT FORMAT
- Plain markdown. Bold the opening "Staff Narrative — ..." line. No bullet points unless the prose genuinely calls for one.
- Do not preface the response with "Here is" or "Below is" — start directly with the bold name line.

INPUT
The user message contains a structured Technical Description of the process diagram, generated automatically. Treat that as a faithful account of what happens. Rewrite it as a Staff Narrative following the rules above. Do not invent steps or roles that are not in the description, but you may add small bits of plausible workplace colour (e.g. "usually takes me half a morning") to keep the voice natural.`;

/** A stored row whose text starts with this opening is a LEGACY full-briefing
 *  row (pre-restructure) — its whole content is the briefing. New rows store
 *  ONLY the green "Additional Rules"; the built-in default lives in code. */
const FULL_BRIEFING_SIGNATURE = "You are a long-serving staff member";

/** True when a stored staff-narrative row holds the whole (legacy) briefing
 *  rather than just the additional house-style rules. */
export function isLegacyFullBriefing(stored: string): boolean {
  return stored.trim().startsWith(FULL_BRIEFING_SIGNATURE);
}

/** The editable ADDITIONAL-rules portion of a stored row. Legacy full-briefing
 *  rows have no separable additions, so this returns "" for them (their content
 *  IS the built-in, now shown read-only in Group #1). */
export function extractAdditionalRules(stored: string | null | undefined): string {
  const s = (stored ?? "").trim();
  return s && !isLegacyFullBriefing(s) ? s : "";
}

/** Assemble the system prompt the model actually receives: the built-in default
 *  briefing (Group #1) followed by the admin's additional house-style rules
 *  (Group #2). A legacy full-briefing row is used verbatim so any hand edits
 *  survive until it's re-saved through the restructured editor. */
export function buildStaffNarrativeBriefing(stored: string | null | undefined): string {
  const s = (stored ?? "").trim();
  if (!s) return DEFAULT_STAFF_NARRATIVE_BRIEFING;
  if (isLegacyFullBriefing(s)) return s;
  return `${DEFAULT_STAFF_NARRATIVE_BRIEFING}\n\n## Additional Rules — house style\n${s}`;
}

export type StaffNarrativeResult =
  | { ok: true; narrative: string; model: string }
  | { ok: false; status: number; error: string };

export async function generateStaffNarrative(args: {
  apiKey: string;
  technicalDescription: string;
  briefing: string;
}): Promise<StaffNarrativeResult> {
  const { apiKey, technicalDescription, briefing } = args;
  const trimmed = technicalDescription.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Technical description is empty" };
  }
  const systemPrompt = briefing.trim() || DEFAULT_STAFF_NARRATIVE_BRIEFING;
  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create({
      model: NARRATIVE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: trimmed }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, status: 500, error: "No response from AI" };
    }
    return { ok: true, narrative: textBlock.text.trim(), model: NARRATIVE_MODEL };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 500, error: `Staff narrative generation failed: ${msg}` };
  }
}
