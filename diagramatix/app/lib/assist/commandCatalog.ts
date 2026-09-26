/**
 * What you can say — the reminder card behind the bar's "Commands" button.
 *
 * Kept in code rather than in `docs/voice-assist-commands.md` so it ships to the
 * browser and so a test can prove every example still parses: a reminder that
 * lists a phrase the grammar no longer accepts is worse than no reminder.
 * Entries flagged `voice` are mic words, not commands, and are not parsed.
 */
export interface CatalogItem {
  /** What it does, in a few words. */
  does: string;
  /** Example phrases — every one of these must parse deterministically. */
  say: string[];
  /** A mic control word (stop / yes / no), not a diagram command. */
  voice?: boolean;
}
export interface CatalogFamily { family: string; items: CatalogItem[] }

export const COMMAND_CATALOG: CatalogFamily[] = [
  // THE EXAMPLES USE THE TEST DIAGRAM'S NAMES (commandFixture.ts; Paul,
  // 2026-09-26), so the "Commands popup: every line" test set is this card word
  // for word and every line can be scored end to end. A test keeps the two in
  // step: every name here must be one element of the test diagram.
  { family: "Elements & flow", items: [
    { does: "Add an element (after another, connected)", say: ["add a task called Approve Claim after Review Claim", "add a decision", "insert a parallel gateway called Split after Check Coverage", "add an end event called Done after Pay Claim"] },
    { does: "Connect / disconnect", say: ["connect Check Coverage to Assess Risk", "connect them", "disconnect Review Claim from Check Coverage"] },
    { does: "Rename", say: ["rename the gateway to Approved?", "rename Lane 3 to Claims Support", "rename Task 1 to Review Email"] },
    { does: "Rename by number (say a type, pick a green number, say the name)", say: ["rename tasks", "rename lanes"] },
    { does: "Move — one element-span; a selection moves together, 100 px per step", say: ["move the gateway two elements to the right", "move Pay Claim up", "move these right", "move the selected task two steps up"] },
    { does: "Nudge — 20 px in any direction, any element; a selection nudges together", say: ["nudge the selected task left", "nudge these down", "bump Assess Risk right", "nudge Customer down by 40"] },
    { does: "Change what kind of thing it is — the same choices as the right-click menu", say: ["make this a user task", "turn the selected gateway into a parallel gateway", "make Review Claim a service task", "make the selected event a timer event"] },
    { does: "Delete (and close the gap)", say: ["delete Task 2", "remove Task 1 and compact"] },
    { does: "Boundary event on a task or subprocess", say: ["add a boundary event called Cancel to Subprocess 3", "add a boundary event to Check Coverage called Timeout"] },
    { does: "Templates — the numbered template window; after an element, the pick goes there, joined to it", say: ["add template", "add template after Review Claim"] },
  ] },
  { family: "The selection (mouse says which, voice says what)", items: [
    { does: "Refer to what is selected", say: ["rename the selected pool to Finance", "delete these", "connect this to Pay Claim", "move the selected task right", "add a boundary event called Timeout to this"] },
    { does: "Name several at once, in reading order — rows top to bottom, each row left to right (the counts must match)", say: ["name these Receive, Check and Ship", "label the selected tasks Draft and Review"] },
    { does: "Put the selected tasks in a simulation team", say: ["assign these to the Finance team", "put the selected tasks in the Sales team"] },
    { does: "Attach a Risk or Control from the project's library", say: ["attach risk R-012 to these", "attach control C-3 to the selected task"] },
    { does: "Point instead of naming — “here” is where the mouse is; “the one under the cursor” is what it is over", say: ["put a task here", "add a gateway there", "rename the one under the cursor to Approve"] },
    { does: "Align the selection — the same choices as the Alignment ▾ menu. Say a row, a column or an edge; a bare “horizontally” means two different things to two people, so it asks", say: ["align these", "align these in a row", "line these up in a column", "align their left edges"] },
    { does: "Take an Assist ghost suggestion (👻 Assist on, one element selected)", say: ["accept the suggestion", "take the gateway", "take the second one"] },
    { does: "Surround the selection with an expanded subprocess — room is made in its lane, the flow in and out re-attach to the subprocess, a Start and End go inside (needs exactly one flow in and one out)", say: ["surround selected with an expanded subprocess called Check Stock", "wrap these in a subprocess", "put an expanded subprocess around the selected elements called Pick"] },
    { does: "Wrap the selection in a pool or a lane — a pool refuses when a sequence flow would cross its boundary; a lane becomes a band in the pool the selection already sits in", say: ["wrap these in a pool called Finance", "surround selected with a lane called Picking", "put a pool around the selected elements called Sales"] },
    { does: "Dissolve the selected expanded subprocess back into the flow — the contents stay, the room is given back; “delete selected” on one does the same", say: ["unwrap the selected subprocess", "dissolve the EP", "delete selected"] },
  ] },
  { family: "Pools", items: [
    { does: "Add a pool (empty, no lane)", say: ["add a pool", "add a pool called Finance", "add a black box pool above Customer"] },
    { does: "Wrap the loose elements in a pool", say: ["put a pool around everything", "wrap everything in a pool"] },
    { does: "Extend every pool to cover all elements", say: ["extend the pools to include all elements", "widen the pools", "include all elements"] },
    { does: "Compress a pool to its content — name a lane and it is that lane that is compressed", say: ["compress the Customer pool", "compress pool 3", "shrink Salesforce"] },
    { does: "Nudge a pool", say: ["nudge pool down", "bump Customer down by 40", "nudge Salesforce up"] },
    { does: "Move ONE edge of a pool — a resize, not a move. A left/right boundary only goes left/right, a top/bottom one only up/down; it stops at the first element it meets and the lanes follow", say: ["move the pool left boundary right", "nudge the Claims Processing pool's top boundary up by 40", "shift the bottom edge of the Customer pool down"] },
  ] },
  { family: "Lanes and sub-lanes", items: [
    { does: "Add lanes (named or not)", say: ["add a lane to the pool", "add 2 lanes to Claims Processing called Intake and Payments", "add a lane above Lane 3", "insert a lane below Underwriters called Support"] },
    { does: "Add sub-lanes", say: ["add 3 sublanes to the Underwriters lane called Manager, Assistant and Staff", "add sublanes to Lane 3"] },
    { does: "Delete / swap / move lanes", say: ["delete Lane 3", "remove the sublane Sub 2", "swap Underwriters with Lane 3", "move the Underwriters lane down"] },
    { does: "Compress a lane to its content — its top stays, the lanes below close up and the pool shrinks; a lane with sub-lanes is fitted one sub-lane at a time", say: ["compress the Underwriters lane", "compress lane Claims Team", "shrink Lane 3"] },
    { does: "Make a lane taller: one Task row, or by a number — at its bottom, its last sub-lane taking it; the lanes below move down", say: ["expand the Underwriters lane", "expand lane Claims Team by 100", "grow Lane 3"] },
  ] },
  { family: "Messages", items: [
    { does: "Message flow between an activity and a pool", say: ["add message from Task 1 to Salesforce labelled Email Details", "send a message from Check Coverage to Customer", "add a message to Salesforce from Task 2 saying Get Approval"] },
    { does: "Rename / delete a message by its label", say: ["rename connector Email Details to Send Invoice", "delete connector Email Details", "remove message Email Details"] },
    { does: "Label the selected connector (no text → it waits for it)", say: ["label selected Yes", "label the selected connector Approved", "label selected"] },
    { does: "Label connectors by number — numbers every sequence flow (or message), then say “3 No”", say: ["label connectors", "label messages", "label flows"] },
    { does: "Message by number — numbers everything a message can start or end at (tasks, subprocesses, black-box pools and events), then say “3 to 7 labelled Order Placed”", say: ["add a message", "send a message"] },
    { does: "Message from/to the selected element — numbers its valid counterparts, then say “to 2 labelled Order Placed” or “from 2 labelled …”", say: ["add a message to the selected", "add a message from this"] },
  ] },
  { family: "Gateways (select one or more gateways first)", items: [
    { does: "Swap two connection points, any pair of top / bottom / middle / left / right — the outgoing points of a decision, the incoming points of a merge; “middle” is the side in the flow direction. Naming the gateway is optional", say: ["swap top and bottom", "swap bottom and middle", "swap selected gateway, top and bottom", "swap top with centre", "swap top and right"] },
    { does: "Move ONE connector to a free point — the companion to swap, which needs both points taken. Say the other and it tells you", say: ["move top to bottom", "move middle to top", "move selected gateway, bottom to middle"] },
  ] },
  { family: "Pools in order", items: [
    { does: "Move a pool above or below another — the stack is laid out again, so room is made automatically", say: ["move Pool 3 above the Customer pool", "put the Customer pool below the Salesforce pool"] },
    { does: "Swap two pools", say: ["swap the Customer pool with the Salesforce pool", "swap the selected pools"] },
  ] },
  { family: "Diagram", items: [
    { does: "Undo, repeat, clear, export", say: ["undo that", "again", "clear the diagram", "export the diagram to JSON"] },
  ] },
  { family: "Voice", items: [
    { does: "Stop listening — always; a numbered pick or a parked question ends with it", say: ["stop", "stop listening", "that's enough"], voice: true },
    { does: "Finish a numbered pick (rename by number, message by number) — the mic stays on", say: ["done", "cancel"], voice: true },
    { does: "Answer a confirmation (clear, delete a pool or lane, delete several)", say: ["yes", "no"], voice: true },
  ] },
];

/**
 * Commands that work, but are deliberately NOT on the card behind the bar's
 * "Commands" button (Paul, 2026-09-17).
 *
 * The card is the reminder someone reads while they are trying to get work
 * done, and every line on it costs the reader something. A presentation flourish
 * does not earn a place there. It still has to be written down somewhere a
 * person can find it, which is the SuperAdmin Voice Assist tile — so this list is
 * rendered there and only there.
 *
 * Same parse guarantee as the main catalogue: every phrase here is asserted to
 * parse, because a list nobody can see is exactly where a dead phrase survives.
 */
export const SUPERADMIN_COMMAND_CATALOG: CatalogFamily[] = [
  { family: "Presentation", items: [
    {
      does: "Gold flashing — after a command that adds, encloses, moves or nudges, outline what changed in gold three times, with sparks. Off by default, remembered per browser.",
      say: ["turn on gold flashing", "turn on flashing gold", "turn off gold flashing", "turn off flashing gold"],
    },
  ] },
];
