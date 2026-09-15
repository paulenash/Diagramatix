/**
 * What you can say — the reminder card behind the bar's "Commands" button.
 *
 * Kept in code rather than in `docs/abracadabra-commands.md` so it ships to the
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
  { family: "Elements & flow", items: [
    { does: "Add an element (after another, connected)", say: ["add a task called Approve after Review", "add a decision", "insert a parallel gateway called Split after Approve", "add an end event called Done after Approve"] },
    { does: "Connect / disconnect", say: ["connect Send Invoice to Receive Payment", "connect them", "disconnect Review from Approve"] },
    { does: "Rename", say: ["rename the gateway to Approved?", "rename Lane 2 to Sales", "rename connector Email Details to Send Invoice"] },
    { does: "Rename by number (say a type, pick a green number, say the name)", say: ["rename tasks", "rename lanes"] },
    { does: "Move — one element-span; a selection moves together, 100 px per step", say: ["move the gateway two elements to the right", "move Approve up", "move these right", "move the selected task two steps up"] },
    { does: "Nudge — 20 px in any direction, any element; a selection nudges together", say: ["nudge the selected task left", "nudge these down", "bump Approve right", "nudge Customer down by 40"] },
    { does: "Delete (and close the gap)", say: ["delete Prepare", "remove Prepare and compact"] },
    { does: "Boundary event on a task or subprocess", say: ["add a boundary event called Cancel to the Review subprocess", "add a boundary event to Approve called Timeout"] },
  ] },
  { family: "The selection (mouse says which, voice says what)", items: [
    { does: "Refer to what is selected", say: ["rename the selected pool to Customer", "delete these", "connect this to Approve", "move the selected task right", "add a boundary event called Timeout to this"] },
  ] },
  { family: "Pools", items: [
    { does: "Add a pool (empty, no lane)", say: ["add a pool", "add a pool called Finance", "add a black box pool above Customer"] },
    { does: "Wrap the loose elements in a pool", say: ["put a pool around everything", "wrap everything in a pool"] },
    { does: "Extend every pool to cover all elements", say: ["extend the pools to include all elements", "widen the pools", "include all elements"] },
    { does: "Compress a pool to its content", say: ["compress the Customer pool", "shrink Sales"] },
    { does: "Nudge a pool", say: ["nudge pool down", "bump Customer down by 40", "nudge the IT System up"] },
  ] },
  { family: "Lanes and sub-lanes", items: [
    { does: "Add lanes (named or not)", say: ["add a lane to the pool", "add 2 lanes to the middle pool called Sales and Marketing", "add a lane above Lane 2", "insert a lane below Sales called Support"] },
    { does: "Add sub-lanes", say: ["add 3 sublanes to the Marketing lane called Manager, Assistant and Staff", "add sublanes to Sales"] },
    { does: "Delete / swap / move lanes", say: ["delete Lane 2", "remove the sublane Marketing Assistant", "swap Sales with Marketing", "move the Sales lane up"] },
  ] },
  { family: "Messages", items: [
    { does: "Message flow between an activity and a pool", say: ["add message from Task 1 to IT System labelled Email Details", "send a message from Approve to Customer", "add a message to IT System from Task 1 saying Get Approval"] },
    { does: "Rename / delete a message by its label", say: ["rename connector Email Details to Send Invoice", "delete connector Email Details", "remove message Email Details"] },
    { does: "Label the selected connector (no text → it waits for it)", say: ["label selected Yes", "label the selected connector Approved", "label selected"] },
    { does: "Label connectors by number — numbers every sequence flow (or message), then say “3 No”", say: ["label connectors", "label messages", "label flows"] },
    { does: "Message by number — numbers the tasks, collapsed subprocesses and black-box pools, then say “3 to 7 labelled Order Placed”", say: ["add a message", "send a message"] },
    { does: "Message from/to the selected element — numbers its valid counterparts, then say “to 2 labelled Order Placed” or “from 2 labelled …”", say: ["add a message to the selected", "add a message from this"] },
  ] },
  { family: "Gateways (select the gateway first)", items: [
    { does: "Swap two connection points, any pair of top / bottom / middle / left / right — the outgoing points of a decision, the incoming points of a merge; “middle” is the side in the flow direction", say: ["swap top and bottom", "swap bottom and middle", "swap top with centre", "swap middle and top", "swap top and right"] },
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
