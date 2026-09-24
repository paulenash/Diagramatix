/**
 * Voice Assist — deterministic (no-LLM) parser for common spoken editing
 * commands. Returns an op list for phrasings it recognises, or null so the
 * caller falls back to the AI interpreter. Pure + tested.
 */
import type { AssistOp } from "./ops";
import { SYMBOL_SYNONYMS, SYMBOL_PHRASES } from "./ops";
import { namesNonContainerKind, laneWordIsAttached, looksPositionalNotAName, namesAContainer } from "./greedyGuards";
import { parseRenameType } from "./renameTargets";
import { parsePoolBoundaryPhrase, mentionsPoolBoundary } from "./poolBoundaryPhrase";
import { repairSelectedWord, repairTurnWord } from "./selectedWord";
import { capitaliseFirstWord } from "../diagram/nameCase";
import { convertMatches } from "./convertPhrase";
import { parseAlignTail } from "./alignPhrase";
import { parseGhostPick } from "./ghostPick";
import type { SymbolType, EventType, GatewayType } from "../diagram/types";

const clean = (s: string) => s.trim().replace(/[.,!?;:]+$/g, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
const stripArticle = (s: string) => s.replace(/^(a|an|the)\s+/i, "").trim();
/** "Sales Team and Marketing Team" / "A, B and C" → ["…"] (handles Oxford comma). */
const splitLabels = (s: string) => s.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map(clean).filter(Boolean);

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toCount = (s: string | undefined): number => {
  if (!s) return 1;
  const t = s.trim().toLowerCase();
  return WORD_NUM[t] ?? (Number.isFinite(Number(t)) ? Math.max(1, Math.round(Number(t))) : 1);
};

/** Find a symbol type mentioned in `text` (longest phrase wins). */
function matchSymbol(text: string): { symbolType: SymbolType; eventType?: EventType; gatewayType?: GatewayType; phrase: string } | null {
  const t = ` ${text.toLowerCase()} `;
  for (const phrase of SYMBOL_PHRASES) {
    if (t.includes(` ${phrase} `)) return { ...SYMBOL_SYNONYMS[phrase], phrase };
  }
  return null;
}

/** Parse a single utterance into ops, or null if unrecognised. */
export function parseCommand(utterance: string): AssistOp[] | null {
  // Speech punctuation: "Swap, top and bottom." — a comma straight after the
  // verb is a breath, not syntax (Paul's log, 2026-09-15). Only that comma is
  // dropped; commas inside a name list ("called Sales, Marketing and Support")
  // still separate the names.
  // "Selected" is what says WHICH thing to act on, and the recogniser keeps
  // returning "connect" for it — `connect` is boosted in the keyword list and
  // the two are close in en-AU. Repaired before anything is matched, and only
  // where the word sits directly after a verb, a position `connect` never
  // legitimately occupies (see assist/selectedWord.ts).
  // "Ten on gold flashing" is "turn on gold flashing" — the recogniser reaches
  // for the number. Repaired before the selection word, since both are leading
  // tokens and neither can produce the other (selectedWord.ts).
  const heard = repairSelectedWord(repairTurnWord(clean(utterance)).text).text;
  const raw = heard.replace(/^([A-Za-z]+),\s+/, "$1 ");
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // ── Undo ──
  if (/^(undo|undo that|undo last|undo the last|scratch that|never mind)\b/.test(lower)) {
    return [{ op: "undo" }];
  }

  // ── Gold flashing (Paul, 2026-09-17) ──
  // Either word order — "flashing gold" and "gold flashing" are both natural,
  // and which one comes out of your mouth is not something to have to remember.
  // Deliberately absent from the user-facing Commands card; it lives in the
  // SuperAdmin Voice Assist tile instead.
  {
    const gf = lower.match(
      /^turn\s+(on|off)\s+(?:the\s+)?(?:gold(?:en)?\s+flash(?:ing)?|flash(?:ing)?\s+gold(?:en)?)\s*$/,
    );
    if (gf) return [{ op: "goldFlash", on: gf[1] === "on" }];
    // "gold flashing on" / "flashing gold off" — the same thing said the short way.
    const gf2 = lower.match(
      /^(?:gold(?:en)?\s+flash(?:ing)?|flash(?:ing)?\s+gold(?:en)?)\s+(on|off)\s*$/,
    );
    if (gf2) return [{ op: "goldFlash", on: gf2[1] === "on" }];
  }

  // ── Again — repeat the last command (e.g. another nudge) ──
  if (/^(again|and again|do (?:it|that) again|repeat(?:\s+(?:it|that))?|once more|same again|one more(?:\s+time)?|keep going)\s*$/.test(lower)) {
    return [{ op: "again" }];
  }

  // ── Templates — open the numbered window (Paul, 2026-09-24) ──
  //
  // BEFORE the add rule, which would otherwise read "add template" as a task
  // to be created and named "template" — the same swallow the lane rules sit
  // above. Only the bare command: "add a template called X" is somebody
  // naming a task, and it is left alone.
  if (/^(?:add|insert|use|show|open|pick|choose)\s+(?:a\s+|the\s+)?templates?$/i.test(lower)
      || /^templates?$/i.test(lower)) {
    return [{ op: "pickTemplate" }];
  }

  // ── Clear the whole diagram ──
  if (/^(clear|empty|wipe|reset|blank)\s+(the\s+)?(current\s+|whole\s+|entire\s+)?(diagram|canvas|everything|it all|all|page)\b/.test(lower)
      || /^(start over|start again|new diagram|clear all|delete everything|remove everything)\b/.test(lower)) {
    return [{ op: "clear" }];
  }

  // ── Export to JSON ──
  if (/^(export|download|save)\b.*\b(json)\b/.test(lower)
      || /^(export|download)\s+(the\s+)?diagram\b/.test(lower)) {
    return [{ op: "export", format: "json" }];
  }

  // ── Disconnect (before delete, so "remove the link from X to Y" isn't a delete) ──
  let m = raw.match(/^(?:disconnect|unlink|remove (?:the )?(?:connection|link|arrow|flow|line))\s+(?:from\s+)?(.+?)\s+(?:to|and|from)\s+(.+)$/i);
  if (m) return [{ op: "disconnect", fromRef: clean(m[1]), toRef: clean(m[2]) }];

  // ── Connect ──
  if (/^(connect|link|join)\s+(them|these|those|it up)\b/.test(lower) || /^(connect|link|join)\s+the (last two|previous two)\b/.test(lower)) {
    return [{ op: "connect", fromRef: "the previous", toRef: "the last" }];
  }
  m = raw.match(/^(?:connect|link|join)\s+(.+?)\s+(?:to|and|with|into)\s+(.+)$/i);
  if (m) return [{ op: "connect", fromRef: clean(m[1]), toRef: clean(m[2]) }];
  m = raw.match(/^(?:draw|add)\s+(?:a\s+)?(?:line|arrow|flow|connection|sequence(?: flow)?)\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (m) return [{ op: "connect", fromRef: clean(m[1]), toRef: clean(m[2]) }];
  m = raw.match(/^(.+?)\s+(?:goes to|flows to|connects to|then goes to|leads to)\s+(.+)$/i);
  if (m) return [{ op: "connect", fromRef: clean(m[1]), toRef: clean(m[2]) }];

  // ── A stranded "after X" / "before X" tail ──
  //
  // Paul's log, 2026-09-21. He said "Add a task called receive order", which is
  // a COMPLETE command, so it ran. Then he said "after the start." as an
  // afterthought — a tail with no sentence in front of it any more.
  //
  // The hold rules cannot help: the first half was finished and had already
  // been applied. So the tail reached the AI, which had the diagram in front of
  // it, saw "receive order" as the newest element, helpfully reconstructed
  // "add a task called receive order after Start" — and added a SECOND one.
  // Two commands later there were two elements with the same name and the next
  // reference was ambiguous. One stranded tail poisoned everything after it.
  //
  // On its own the tail has an obvious and useful meaning: make the thing just
  // added follow X. Handling it here means it never reaches the AI, costs
  // nothing, and cannot invent an element.
  //
  // Narrow on purpose — the tail must be ONLY the connective and a reference.
  // "After Review add a task called X" is a whole command and is left alone.
  {
    const tail = raw.match(/^(?:and\s+|that'?s\s+|it'?s\s+|put\s+it\s+|goes\s+)?(after|before)\s+(.+)$/i);
    if (tail) {
      const ref = clean(tail[2]);
      const whole = /\b(?:add|insert|create|put|place|new|draw|connect|link|join|delete|remove|rename|relabel|move|nudge|make|turn|wrap|surround)\b/i.test(ref);
      if (ref && !whole) {
        // "after X" — X flows into what was just added. "before X" — the
        // reverse. "the last" is the pronoun the resolver already understands.
        return tail[1].toLowerCase() === "after"
          ? [{ op: "connect", fromRef: ref, toRef: "the last" }]
          : [{ op: "connect", fromRef: "the last", toRef: ref }];
      }
    }
  }

  // ── Take a ghost suggestion (M8) ──
  // Before everything, because every form names the ACT of accepting and none
  // of them is an ordinary command. "Add a gateway" stays an add; "take the
  // gateway" is a pick. "Yes" is deliberately NOT here — it already confirms a
  // parked destructive command, and a word that means two things depending on
  // whether a ghost happens to be showing is how you clear a diagram by
  // accident.
  {
    const g = parseGhostPick(raw);
    if (g) return [{ op: "acceptGhost", pick: clean(raw) }];
  }

  // ── Align the selection (M7) ──
  // The reducer has done this all along, driven by the Alignment ▾ menu; only
  // the way to say it was missing. A BARE AXIS WORD is refused rather than
  // guessed: "align these horizontally" means "lay them along a horizontal
  // line" to some people and "move them horizontally" to others, and a coin
  // toss on every utterance is worse than asking.
  {
    // "their" counts as a selection word here — "align their left edges" is
    // natural English and can only mean the selection, since align takes no
    // other kind of target.
    const a = raw.match(/^(?:align|line\s+up|straighten)\s+(these|those|them|their|the selection|the selected(?:\s+\w+s?)?)\s*(.*)$/i)
      ?? raw.match(/^(?:line|straighten)\s+(these|those|them)\s+(up.*)$/i);
    if (a) {
      const parsed = parseAlignTail(a[2] ?? "");
      if (parsed?.kind === "align") return [{ op: "alignSelection", mode: parsed.mode }];
      if (parsed?.kind === "ambiguous-axis") return null;   // → the AI can ask
    }
  }

  // ── Fill the selection (M4) ──
  // Before Convert and Rename: "name these A, B and C" must not be read as a
  // rename of something called "these".
  //
  // Each of these takes NO target — the selection is the target — which is
  // what makes them safe to put this early: they only match when the sentence
  // names the selection explicitly.
  {
    // "name these Receive, Check and Ship" · "label the selected tasks A and B"
    //
    // The kind word must be PLURAL. Filling is inherently plural — one name per
    // selected element — and "label the selected connector Approved" is a
    // different, older command that labels a single connector. Without the `s`
    // this rule swallowed it and turned one connector label into a fill.
    const f = raw.match(/^(?:name|label|call)\s+(these|those|them|the selection|the selected\s+\w+s)\s+(.+)$/i);
    if (f) {
      const labels = splitLabels(f[2]).map(capitaliseFirstWord);
      if (labels.length) return [{ op: "fillLabels", labels }];
    }
  }
  {
    // "assign the selected tasks to the Finance team" · "put these in the Sales team"
    const t = raw.match(/^(?:assign|put|move)\s+(?:these|those|them|the selection|the selected(?:\s+\w+)?)\s+(?:to|in|into|onto)\s+(?:the\s+)?(.+?)(?:\s+team)?$/i)
      ?? raw.match(/^(?:set|make)\s+(?:the\s+)?team\s+(?:for\s+)?(?:these|those|them|the selection|the selected(?:\s+\w+)?)\s+(?:to\s+)?(.+)$/i);
    // Only when the sentence actually said "team" — "move these to the right"
    // is a move, and "put these in a pool" is a wrap.
    if (t && /\bteam\b/i.test(raw)) {
      const team = clean(t[1]);
      if (team && !/^(?:the\s+)?(?:right|left|up|down|top|bottom)$/i.test(team)) {
        return [{ op: "assignTeam", team }];
      }
    }
  }
  {
    // "attach risk R-012 to these" · "attach control C-3 to the selected task"
    const rc = raw.match(/^(?:attach|add|link)\s+(?:the\s+)?(?:risk|control)\s+(.+?)\s+(?:to|onto)\s+(these|those|them|the selection|the selected(?:\s+\w+)?)$/i);
    if (rc) {
      const ref = clean(rc[1]);
      if (ref) return [{ op: "attachRiskControl", ref }];
    }
  }

  // ── Convert in place (M3) ──
  // "make this a user task", "turn the selected gateway into a parallel
  // gateway", "make Review a service task". The right-click menu has offered
  // every one of these since the beginning; this is only the way to say it.
  //
  // The discriminator is the TAIL, not the verb: "make" is also an add verb
  // ("make a task called Approve"), so a pattern alone would steal it. A
  // convert op is returned only when the tail is a subtype the shared table
  // knows — which is also what keeps this rule from being the next greedy one.
  for (const pat of [
    /^(?:make|turn|convert|change|set)\s+(.+?)\s+(?:in)?to\s+(?:an?\s+)?(.+)$/i,
    /^(?:make|turn|convert|change|set)\s+(.+?)\s+an?\s+(.+)$/i,
  ]) {
    const c = raw.match(pat);
    if (!c) continue;
    const ref = clean(c[1]);
    const subtype = clean(c[2]);
    if (!ref || !subtype) continue;
    if (!convertMatches(subtype).length) continue;   // not a subtype → let other rules try
    return [{ op: "convert", ref, subtype }];
  }

  // ── Rename ──
  m = raw.match(/^(?:rename|relabel)\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (m) return [{ op: "rename", ref: clean(m[1]), label: capitaliseFirstWord(clean(m[2])) }];
  m = raw.match(/^(?:change|set)\s+(?:the )?(?:name|label)(?: of)?\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (m) return [{ op: "rename", ref: clean(m[1]), label: capitaliseFirstWord(clean(m[2])) }];
  m = raw.match(/^call\s+(.+?)\s+(.+)$/i);
  if (m && !matchSymbol(m[1])) return [{ op: "rename", ref: clean(m[1]), label: capitaliseFirstWord(clean(m[2])) }];

  // Guided rename: "rename <type>" (a bare element/connector TYPE, no "to <name>")
  // starts the numbered-badge pick flow. Types: pool · lane/sub-lane · message ·
  // task · subprocess · gateway/decision · event · connector/sequence.
  // "label selected <text>" — the selected CONNECTOR (Paul, 2026-09-15); with no
  // text the editor waits for it. Checked before the by-type rule so "selected"
  // is never read as a type word.
  m = raw.match(/^label\s+(?:the\s+)?(?:selected|selection|this|that)(?:\s+(?:connector|flow|arrow|line|link))?(?:\s+(?:as|with|to))?(?:\s+(.+))?$/i);
  if (m) return [{ op: "labelSelected", ...(m[1] ? { label: capitaliseFirstWord(clean(m[1])) } : {}) }];

  m = raw.match(/^(?:rename|relabel|edit|label)\s+(?:a\s+|an\s+|the\s+|all\s+)?(pools?|polls?|pulls?|sub-?lanes?|sub-?lines?|lanes?|lines?|messages??|sub-?lanes?|lanes?|messages?|tasks?|activit(?:y|ies)|steps?|subprocess(?:es)?|sub-?process(?:es)?|gateways?|decisions?|events?|connectors?|sequence(?:\s+flows?)?|flows?)\s*$/i);
  if (m) {
    const rt = parseRenameType(m[1]);
    if (rt) return [{ op: "renameByType", itemType: rt }];
  }

    // Reorder the pool stack (Paul, 2026-09-18): "move Pool 1 above Pool 2",
    // "put Pool 1 below Pool 2". Before the generic move rule, which would take
    // "above Pool 2" as a direction and nudge it. Asking for this before it
    // existed got the AI's best guess — "nudge Pool 1 up", twenty pixels.
    {
      const mp = raw.match(
        /^(?:move|put|place|shift|position)\s+(?:the\s+)?(.+?)\s+(above|over|before|below|under(?:neath)?|after)\s+(?:the\s+)?(.+?)$/i,
      );
      if (mp && /\b(?:pool|poll|pull)\b/i.test(mp[1]) && /\b(?:pool|poll|pull)\b/i.test(mp[3])) {
        const position = /^(?:above|over|before)/i.test(mp[2]) ? "above" as const : "below" as const;
        return [{ op: "movePoolTo", ref: clean(mp[1]), position, relativeTo: clean(mp[3]) }];
      }
    }

    // Swap two pools in the stack: "swap Pool 1 with Pool 2", "swap the selected
    // pools". Above the lane swap, which answers to the same verb.
    {
      const sp = raw.match(
        /^swap\s+(?:the\s+)?(.+?)\s+(?:with|and|for|&)\s+(?:the\s+)?(.+?)$/i,
      );
      if (sp && /\b(?:pool|poll|pull)\b/i.test(sp[1]) && /\b(?:pool|poll|pull)\b/i.test(sp[2])) {
        return [{ op: "swapPools", a: clean(sp[1]), b: clean(sp[2]) }];
      }
      // No names: the two pools the mouse has selected.
      if (/^swap\s+(?:the\s+)?(?:selected|these|those|highlighted)\s+(?:pools?|polls?|pulls?)\s*$/i.test(raw)
        || /^swap\s+(?:the\s+)?(?:two\s+)?(?:pools?|polls?|pulls?)\s*$/i.test(raw)) {
        return [{ op: "swapPools" }];
      }
    }

  // ── Pool / lane container commands ("poll"/"pull"→pool, "line"→lane) ──
  {
    // "Participant box" is what the BPMN spec calls a black-box pool, and it
    // is what Paul said out loud (2026-09-21). Without it, "create a
    // participant box for the courier above customer" fell through to the add
    // rule and became a TASK named "Participant box for the courier above
    // customer", parked in whichever sub-lane was last. "Participant" on its
    // own counts too — it is the spec's word for the thing.
    const P = "(?:pool|poll|pull|participant(?:\\s+box)?)";
    const L = "(?:lanes?|lines?)";

    // ONE EDGE, not the whole pool — and tried before every other container
    // rule, because almost all of them are greedier than this sentence.
    // "Nudge pull lane, left boundary left" reaches the LANE rule otherwise
    // and fails as "couldn't find pull lane, left boundary"; "move the pool
    // left boundary" reaches the element move rule, whose step is the
    // element's own WIDTH, and slides the pool ~900px across the canvas.
    //
    // "needs-direction" means the sentence is plainly a boundary move with no
    // way named. Declining the whole utterance is the point: it goes to the
    // AI, which can ask, instead of to a rule that will do something large and
    // confident with it.
    const mBoundary = parsePoolBoundaryPhrase(raw);
    if (mBoundary === "needs-direction") return null;
    if (mBoundary) return [{ op: "movePoolBoundary", ...mBoundary }];
    const ALL = "(?:everything|all(?:\\s+(?:the\\s+)?elements?)?(?:\\s+on\\s+(?:the\\s+)?diagram)?|the\\s+(?:lot|whole\\s+thing|diagram)|it\\s+all)";

    // Compress / collapse a pool: "compress the Customer pool", "shrink Sales".
    // Aliases: compress · collapse · shrink · reduce · shorten · compact
    //          (+ tighten · condense · minimise/minimize).
    let mc = raw.match(new RegExp(`^(?:compress|collapse|shrink|reduce|shorten|compact|tighten|condense|minimise|minimize)\\s+(?:the\\s+)?(?:${P}\\s+)?(.+?)(?:\\s+${P})?$`, "i"));
    // B5: the pool word is optional on BOTH sides, so this reduces to "any
    // word after collapse". Decline when the ref plainly names something else
    // — "collapse the subprocess" is an EP collapse, and saying so is the AI's
    // job, not this rule's.
    if (mc && !namesNonContainerKind(mc[1])) return [{ op: "compressPool", poolRef: clean(mc[1]) }];

    // Swap two named lanes: "swap lane A with lane B" / "swap A and B".
    // (resolveRef strips a leading "lane"/"pool" kind word, so keep the raw ref.)
    // Swap a SELECTED gateway's connection points: "swap top and bottom", "swap
    // bottom and middle" (Paul, 2026-09-15). Before the lane swap, which would
    // otherwise take "top" and "bottom" as lane names.
    // Every combination: top / bottom / middle (centre) / left / right, in either
    // order. "middle" is resolved at apply time to the flow side; left and right
    // are literal sides for people who say them.
    // The gateway may be NAMED before the two points. "Swap top and bottom"
    // always worked, but "swap selected gateway, top and bottom" fell through
    // to the LANE swap below and answered "couldn't find 'selected gateway,
    // top'" — so the feature looked gone (Paul, 2026-09-21: "What happened to
    // Swap selected Top and Bottom?"). The target is redundant — the op acts
    // on the selected gateways either way — but saying it out loud is natural,
    // and a command that is merely more explicit must not fail.
    //
    // The comma matters: "Swap selected, top and bottom" is how the recogniser
    // punctuates a small pause, and only a comma after the FIRST word is
    // stripped earlier.
    // MOVE one connector from one point to another — the companion to the swap
    // (Paul, 2026-09-21). "Move top to bottom." Same target phrases, and the
    // same place in the order: before the element `move` rule, which would
    // otherwise read "top" as the name of a thing to shove sideways.
    const mp = raw.match(/^move\s+(?:(?:the\s+)?(?:selected|highlighted|these|those|this)\s*)?(?:gateways?(?:'s|s')?\s*)?,?\s*(?:the\s+)?(top|bottom|middle|centre|center|left|right)\s+(?:to|onto|into)\s+(?:the\s+)?(top|bottom|middle|centre|center|left|right)(?:\s+(?:points?|connectors?|connections?|sides?|vert(?:ex|ices)))?$/i);
    if (mp) {
      type Pt = "top" | "middle" | "bottom" | "left" | "right";
      const pt = (w: string): Pt => (/^cent/i.test(w) ? "middle" : (w.toLowerCase() as Pt));
      const from = pt(mp[1]), to = pt(mp[2]);
      if (from !== to) return [{ op: "moveGatewayPoint", from, to }];
    }

    const sp = raw.match(/^swap\s+(?:(?:the\s+)?(?:selected|highlighted|these|those|this)\s*)?(?:gateways?(?:'s|s')?\s*)?,?\s*(?:the\s+)?(top|bottom|middle|centre|center|left|right)\s+(?:and|with|&)\s+(?:the\s+)?(top|bottom|middle|centre|center|left|right)(?:\s+(?:points?|connectors?|connections?|sides?))?$/i);
    if (sp) {
      type Pt = "top" | "middle" | "bottom" | "left" | "right";
      const pt = (w: string): Pt => (/^cent/i.test(w) ? "middle" : (w.toLowerCase() as Pt));
      const a = pt(sp[1]), b = pt(sp[2]);
      if (a !== b) return [{ op: "swapGatewayPoints", a, b }];
    }
    let mm = raw.match(new RegExp(`^swap\\s+(.+?)\\s+(?:with|and|for|<->|<>)\\s+(.+)$`, "i"));
    // B5: nothing here requires either side to be a lane, so "swap Task A with
    // Task B" became a lane swap and failed. Decline and let the AI have it.
    if (mm && !namesNonContainerKind(mm[1]) && !namesNonContainerKind(mm[2])) {
      return [{ op: "swapLanes", laneA: clean(mm[1]), laneB: clean(mm[2]) }];
    }

    // Insert a lane above/below a reference lane: "add a lane above/below Lane X".
    mm = raw.match(new RegExp(`^(?:add|insert|create)\\s+(?:a\\s+)?(?:new\\s+)?${L}\\s+(?:to\\s+(?:the\\s+)?(.+?)\\s+)?(above|below|under(?:neath)?|over|before|after)\\s+(?:the\\s+)?(.+?)(?:\\s+(?:called|named|labell?ed)\\s+(.+))?$`, "i"));
    if (mm) {
      const pos = /^(?:above|over|before)/i.test(mm[2]) ? "above" : "below";
      return [{ op: "addLaneAt", poolRef: mm[1] ? clean(mm[1]) : "the pool", position: pos, refLane: clean(mm[3]), ...(mm[4] ? { label: clean(mm[4]) } : {}) }];
    }

    // Surround the SELECTION with an expanded subprocess (Paul, 2026-09-16):
    // "surround selected with an expanded subprocess called Check Stock",
    // "wrap these in a subprocess", "put an expanded subprocess around the
    // selected elements called Check Stock". Before the pool wrap, which
    // also answers to "wrap … in …".
    {
      const SEL = "(?:the\\s+)?(?:selected|selection|these|those|highlighted)(?:\\s+(?:elements?|items?|ones?|tasks?|things?))?";
      const EP = "(?:an?\\s+)?(?:new\\s+)?(?:expanded\\s+)?(?:sub-?\\s?process|subprocess|ep)";
      const NAME = "(?:\\s+(?:called|named|labell?ed|titled)\\s+(.+?))?";
      const s = raw.match(new RegExp(`^(?:surround|wrap|enclose|put|place)\\s+${SEL}\\s+(?:with|in|inside|into|within|using)\\s+${EP}${NAME}$`, "i"))
        ?? raw.match(new RegExp(`^(?:put|add|create|draw|make|insert|place)\\s+${EP}${NAME}\\s+(?:around|round|over|containing|enclosing)\\s+${SEL}${NAME}$`, "i"));
      if (s) {
        const name = clean(s[1] ?? s[2] ?? "");
        return [{ op: "wrapInSubprocess", ...(name ? { label: name } : {}) }];
      }

      // Same shapes, but a POOL or a LANE around the selection. Kept here, next
      // to the subprocess rule, because the phrasing is identical and the only
      // difference is the container word — and it must stay ABOVE the
      // wrap-everything-in-a-pool rule below, which would otherwise swallow
      // "wrap these in a pool" and wrap the whole diagram instead.
      // The container word, optionally followed by a name said WITHOUT "called"
      // — "surround selected with Pool 2" (Paul, 2026-09-18). Left out, that
      // phrasing failed the grammar and reached the AI, which read it as the
      // whole-diagram wrap and adopted every loose element into the existing
      // pool. Only a short trailing name is taken, so it cannot run on and
      // swallow the rest of a sentence.
      // Words that are grammar, not a name: the explicit "called X" form, and
      // the prepositions the second phrasing continues with. Without this the
      // bare-name group eats "called Finance" and the pool ends up named
      // "called Finance".
      const NOT_A_NAME = "(?!(?:called|named|labell?ed|titled|around|round|over|containing|enclosing)\\b)";
      const CONTAINER = `(?:an?\\s+)?(?:new\\s+)?(pool|poll|pull|lanes?|lines?)(?:\\s+${NOT_A_NAME}([A-Za-z0-9][\\w'-]*(?:\\s+[\\w'-]+){0,2}))?`;
      // The leading verb is OPTIONAL. The recogniser drops the first word often
      // enough that "surround selected with a pool" arrives as "selected with a
      // pool" — and the cost of not catching that is severe (Paul, 2026-09-18):
      // it falls through to the AI, which reads the fragment as "put a pool
      // around everything" and adopts the WHOLE DIAGRAM into an existing pool.
      // The rule stays tight regardless, because it still demands a selection
      // word, then a preposition, then a container word, then end of utterance.
      const c = raw.match(new RegExp(`^(?:(?:surround|wrap|enclose|put|place)\\s+)?${SEL}\\s+(?:with|in|inside|into|within|using)\\s+${CONTAINER}${NAME}$`, "i"))
        ?? raw.match(new RegExp(`^(?:put|add|create|draw|make|insert|place)\\s+${CONTAINER}${NAME}\\s+(?:around|round|over|containing|enclosing)\\s+${SEL}${NAME}$`, "i"));
      if (c) {
        // The homophones the recogniser actually returns: poll/pull for pool,
        // line for lane (the same confusion that makes "one" come back as
        // "lane" — see assist/spokenNumber.ts).
        const word = (c[1] ?? "").toLowerCase();
        const container = /^(?:lane|line)/.test(word) ? "lane" as const : "pool" as const;
        // Groups, in order: the container word, a bare name straight after it
        // ("with Pool 2"), then the "called …" names from each alternative. The
        // first one that carries text wins — a speaker uses one form or the
        // other, never both.
        let name = clean(c[2] ?? c[3] ?? c[4] ?? c[5] ?? "");
        // "Pool 2" is one name, and the container word has already been eaten by
        // the group that identified it — so a bare number left behind is the
        // second half of a name, not a name. "with pool Finance" is different:
        // Finance stands on its own. Normalised to the real word, so a misheard
        // "poll 2" still becomes "Pool 2".
        if (/^\d+$/.test(name)) name = `${container === "lane" ? "Lane" : "Pool"} ${name}`;
        return [{ op: "wrapInContainer", container, ...(name ? { label: name } : {}) }];
      }
    }

    // Wrap all loose (un-pooled) elements INTO a pool (a qualifier is REQUIRED
    // here, so a bare "add a pool" falls through to the create-pool rule below).
    // THE NAME COMES TOO. Until 2026-09-24 these two patterns were `.test()`,
    // so "put a pool around everything called Finance" made an UNNAMED pool and
    // the user had to rename it — while the SELECTION wrap a few lines above
    // kept its label perfectly well. Found by replaying Paul's recorded corpus:
    // four clips where the recogniser heard the sentence exactly right and the
    // command still failed. `wrapInPool(op.label)` already honoured a label;
    // nothing ever passed it one.
    const NAMED = "(?:\\s+(?:called|named|labell?ed|titled)\\s+(.+))?";
    const wrapAll =
      raw.match(new RegExp(`^(?:put|wrap|draw|add|create|make)\\s+(?:a\\s+)?(?:new\\s+)?${P}\\s+(?:around|round|over|to(?:\\s+include|\\s+cover|\\s+contain)?|including|containing)\\s+${ALL}${NAMED}`, "i"))
      ?? raw.match(new RegExp(`^wrap\\s+${ALL}\\s+(?:in|with|inside|into)\\s+(?:a\\s+)?${P}\\b${NAMED}`, "i"));
    if (wrapAll) {
      const label = clean(wrapAll[1] ?? "");
      return [{ op: "wrapInPool", ...(label ? { label } : {}) }];
    }

    // Extend / widen the pools rightward to include all elements, keeping EVERY
    // pool the same width. Aliases: extend · lengthen · widen (+ expand · grow ·
    // stretch · enlarge). A bare "include all elements" also means extend.
    if (
      new RegExp(`^(?:extend|lengthen|widen|expand|grow|stretch|enlarge)\\s+(?:all\\s+)?(?:the\\s+)?${P}s?(?:\\s+(?:to\\s+)?(?:the\\s+right|include|around|cover|contain|fit|accommodate|accomodate|encompass|hold)\\b.*)?$`, "i").test(raw)
      || new RegExp(`^(?:include|cover|contain|fit|encompass)\\s+${ALL}(?:\\s+(?:to\\s+)?the\\s+right)?$`, "i").test(raw)
    ) {
      return [{ op: "extendPools" }];
    }

    // Create a NEW pool. The "called <name>" and "above|below <target>" clauses
    // may come in EITHER order, and <target> may be a NAMED pool ("above
    // Customer") or the whole stack ("above existing pools").
    mm = raw.match(new RegExp(`^(?:add|insert|create|put|make|new|draw)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:new\\s+|another\\s+|empty\\s+)?(black[- ]?box|white[- ]?box)?\\s*(${P})\\b(.*)$`, "i"));
    if (mm) {
      // A PARTICIPANT BOX IS A BLACK-BOX POOL — that is what the spec calls
      // one, so saying it should not produce a white-box pool with lanes.
      //
      // Tested against the POOL WORD only, not the whole match: "add a pool
      // called Participant above Customer" names a pool Participant, and
      // reading the name as a type turned an ordinary pool black-box.
      const saidParticipant = /participant/i.test(mm[2]);
      const poolType = mm[1]
        ? (/black/i.test(mm[1]) ? "black-box" : "white-box")
        : (saidParticipant ? "black-box" as const : undefined);
      const rest = mm[3].trim();
      // position + target (target runs until a following "called …", or to end)
      const pm = rest.match(/\b(above|below|under(?:neath)?|over)\s+(.+?)(?:\s+called\s+.+)?$/i);
      let position: "above" | "below" | undefined;
      let relativeTo: string | undefined;
      if (pm) {
        position = /^(?:above|over)/i.test(pm[1]) ? "above" : "below";
        const tgt = clean(pm[2]);
        // "existing/all/other pools" (or bare "pools") = the whole stack, not a
        // specific pool → leave relativeTo unset (position relative to all).
        if (!/^(?:existing\s+|all\s+|other\s+|the\s+other\s+)?(?:pools?)$/i.test(tgt)) relativeTo = tgt;
      }
      // name: "called <name>" — and also "for <name>", which is how a person
      // names a participant box out loud ("a participant box FOR THE COURIER").
      // Without it the name was dropped and the box arrived unlabelled.
      const cm = rest.match(/\b(?:called|named|labell?ed|for)\s+(?:the\s+)?(.+?)(?:\s+(?:above|below|under(?:neath)?|over)\b.*)?$/i);
      const label = cm ? capitaliseFirstWord(clean(cm[1])) : undefined;
      // Trailing text we didn't recognise as a name/position clause → not a clean
      // pool command; let the AI interpret it (matches "add a pool thingy blah").
      const restRecognised = !rest || /^(?:on\s+the\s+diagram)$/i.test(rest);
      if (!restRecognised && !label && !position) return null;
      return [{ op: "addPool", ...(poolType ? { poolType } : {}), ...(position ? { position } : {}), ...(label ? { label } : {}), ...(relativeTo ? { relativeTo } : {}) }];
    }

    // Move / nudge a LANE up or down by ½ Task height (default 32px). Must name
    // a lane ("move lane Sales up", "move the Sales lane down", "nudge lane 2
    // up") — the lane word disambiguates it from the pool-nudge and the generic
    // element move. Checked BEFORE the pool-nudge so "nudge lane X" wins.
    if (new RegExp(`\\b${L}\\b`, "i").test(raw)) {
      // Keep a leading "lane" in the ref (so "lane 2" stays "lane 2" and
      // resolveRef matches it whole); only a TRAILING "lane" ("Sales lane") is
      // stripped here.
      const mlane = raw.match(new RegExp(`^(?:move|nudge|bump|shift|slide|inch)\\s+(?:the\\s+)?(.+?)(\\s+${L})?\\s+(up|down)(?:\\s+by\\s+(\\d+)\\s*(?:px|pixels?)?)?$`, "i"));
      // B5: the guard above only asks whether a lane-ish word appears ANYWHERE
      // in the sentence, and "lane" is spelled (?:lanes?|lines?) because the
      // recogniser mishears it — so "move the Assembly LINE task up" came in
      // here and failed as "isn't a lane". The word has to be ATTACHED to the
      // thing being moved: leading ("lane 2") or trailing ("Sales lane").
      if (mlane && laneWordIsAttached(mlane[1], !!mlane[2])) {
        return [{ op: "moveLane", ref: clean(mlane[1]), direction: mlane[3].toLowerCase() as "up" | "down", ...(mlane[4] ? { distance: Number(mlane[4]) } : {}) }];
      }
    }

    // Nudge a pool up / down by a small step (default 20px). "nudge"/"bump"
    // always mean this; "move/slide <…> up|down" only counts as a pool-nudge
    // when a pool is named (so "move Task 1 up" stays the generic element move).
    // Any direction, any element, 20 px (Paul, 2026-09-15); a selection nudges as a group.
    let mnudge = raw.match(new RegExp(`^(?:nudge|bump|inch|shift)\\s+(?:the\\s+)?(.*?)\\s*(?:to\\s+the\\s+)?(up|down|left|right)(?:\\s+by\\s+(\\d+)\\s*(?:px|pixels?)?)?$`, "i"));
    if (!mnudge) {
      const mv = raw.match(new RegExp(`^(?:move|slide)\\s+(?:the\\s+)?(.*?)\\s*(?:to\\s+the\\s+)?(up|down|left|right)(?:\\s+by\\s+(\\d+)\\s*(?:px|pixels?)?)?$`, "i"));
      if (mv && new RegExp(`\\b${P}\\b`, "i").test(mv[1] || "")) mnudge = mv;
    }
    // A sentence that named a boundary is never a whole-pool nudge. It gets
    // here only when the boundary parser could not act on it — an impossible
    // pairing like "move the pool left boundary UP", which is refused rather
    // than guessed — and "…boundary up" still ends in a direction word, so
    // this rule would happily slide the entire pool instead. Let the AI ask.
    if (mnudge && mentionsPoolBoundary(raw)) mnudge = null;
    if (mnudge) {
      const rawRef = clean(mnudge[1] || "");
      const ref = rawRef && !new RegExp(`^${P}$`, "i").test(rawRef) ? rawRef : undefined; // bare "pool" → default target
      return [{ op: "nudgePool", ...(ref ? { ref } : {}), direction: mnudge[2].toLowerCase() as "up" | "down" | "left" | "right", ...(mnudge[3] ? { distance: Number(mnudge[3]) } : {}) }];
    }
  }

  // ── Move ──
  m = raw.match(/^move\s+(.+?)\s+(?:(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:elements?|steps?|places?|spaces?|cells?)\s+)?(?:to\s+the\s+)?(left|right|up|down)\b/i);
  // B5 again, and the costliest instance of it. This rule reads "move the pool
  // left boundary" as "move the pool left" — the word-boundary after the
  // direction does not care what follows — and then moves it by a whole
  // element SPAN, which for a pool is its own width: about 900px. Anything
  // naming a container boundary is not this rule's business.
  if (m && mentionsPoolBoundary(raw)) m = null;
  if (m) {
    return [{ op: "move", ref: clean(m[1]), direction: m[3].toLowerCase() as "left" | "right" | "up" | "down", count: toCount(m[2]) }];
  }

  // ── Dissolve an expanded subprocess back into the flow (the reverse of
  // "surround selected"). "delete selected" on an EP does the same — the
  // editor routes it — so only the explicit verbs need a rule; it sits above
  // the delete catch-all, which would otherwise swallow "unwrap …". ──
  {
    const u = raw.match(/^(?:unwrap|dissolve|unpack|flatten|explode|open\s+up)\s+(?:the\s+)?(?:selected\s+|this\s+|that\s+)?(?:expanded\s+)?(?:sub-?\s?process|subprocess|ep)(?:\s+(?:selected|shell))?$/i);
    if (u) return [{ op: "unwrapSubprocess" }];
  }

  // ── Delete (+ optional compact) ──
  m = raw.match(/^(?:delete|remove|get rid of|drop|erase)\s+(.+)$/i);
  if (m) {
    let ref = stripArticle(clean(m[1]));
    let compact = false;
    const andCompact = ref.match(/\s+and\s+(?:compact|close the gap|tidy(?:\s+up)?|collapse|clean up)(?:\s+.*)?$/i);
    if (andCompact) { compact = true; ref = clean(ref.slice(0, andCompact.index)); }
    return [{ op: "delete", ref, ...(compact ? { compact: true } : {}) }];
  }

  // ── Message flow (before the generic add): "add message from X to Y labelled Z" ──
  const MSGLABEL = "(?:,?\\s+(?:labelled|labeled|called|named|saying|with label|that says)\\s+(.+))?";
  m = raw.match(new RegExp(`^(?:add|create|draw|put|send)\\s+(?:a\\s+)?message(?:\\s+flow)?\\s+from\\s+(.+?)\\s+to\\s+(.+?)${MSGLABEL}$`, "i"));
  if (m) return [{ op: "addMessage", fromRef: clean(m[1]), toRef: clean(m[2]), ...(m[3] ? { label: clean(m[3]) } : {}) }];
  m = raw.match(new RegExp(`^(?:add|create|draw|put|send)\\s+(?:a\\s+)?message(?:\\s+flow)?\\s+to\\s+(.+?)\\s+from\\s+(.+?)${MSGLABEL}$`, "i"));
  if (m) return [{ op: "addMessage", fromRef: clean(m[2]), toRef: clean(m[1]), ...(m[3] ? { label: clean(m[3]) } : {}) }];
  // Message by number (Paul, 2026-09-15). A bare "add a message" numbers every
  // task, collapsed subprocess and black-box pool and waits for "n to m labelled
  // X"; "add a message to the selected" numbers the selection's valid
  // counterparts and waits for "to/from n labelled X".
  if (/^(?:add|create|draw|put|send)\s+(?:a\s+|new\s+)?(?:message|msg)(?:\s+flow)?\s*$/i.test(raw)) return [{ op: "addMessageByNumber" }];
  if (/^(?:add|create|draw|put|send)\s+(?:a\s+|new\s+)?(?:message|msg)(?:\s+flow)?\s+(?:to|from|for|with|on)\s+(?:the\s+)?(?:selected(?:\s+\w+)?|selection|this|that|these|it)\s*$/i.test(raw)) return [{ op: "addMessageByNumber", fromSelection: true }];
  // Any OTHER "message" phrasing must NOT fall through to the generic add
  // (which would make a task called "Message"). Bail to null so it goes to
  // the AI interpreter instead of the add rule below.
  if (/^(?:add|create|draw|put|send)\s+(?:a\s+)?(?:message|msg)(?:\s+flow)?\b/i.test(raw)) return null;

  // ── Boundary event (before the generic add) ──
  m = raw.match(/^(?:add|put|attach|create|place)\s+(?:a\s+)?boundary\s+event\s+(.+)$/i);
  if (m) {
    const rest = clean(m[1]);
    const calledTo = rest.match(/^called\s+(.+?)\s+(?:to|on|onto)\s+(.+)$/i);
    const toCalled = rest.match(/^(?:to|on|onto)\s+(.+?)\s+called\s+(.+)$/i);
    const onlyTo = rest.match(/^(?:to|on|onto)\s+(.+)$/i);
    let hostRef: string | undefined, label: string | undefined;
    if (calledTo) { label = clean(calledTo[1]); hostRef = clean(calledTo[2]); }
    else if (toCalled) { hostRef = clean(toCalled[1]); label = clean(toCalled[2]); }
    else if (onlyTo) { hostRef = clean(onlyTo[1]); }
    if (hostRef) return [{ op: "addBoundary", hostRef, ...(label ? { label } : {}) }];
  }

  const COUNT = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|some)";
  // ── Sublanes (before lanes: "sublanes" must not match the lane rule) ──
  // "line" mishears "lane". Optional count, optional "new", optional target
  // (defaults to "the lane"), optional names (default Sublane 1..N).
  m = raw.match(new RegExp(`^(?:add|insert|create|split)\\s+${COUNT}?\\s*(?:new\\s+|another\\s+|extra\\s+)?(?:sub-?lanes?|sub lanes?|sub-?lines?|sub lines?)(?:\\s+(?:to|in|into|onto|on|under|below|inside)\\s+(.+?))?(?:\\s+(?:called|named|labell?ed)\\s+(.+))?$`, "i"));
  if (m) {
    let labels = m[3] ? splitLabels(m[3]) : [];
    // The BARE kind word, not "Sublane 1": the grammar cannot see the diagram,
    // so a number it invents is a name that is probably already taken. Asking
    // for "Sublane" makes the reducer number it against what exists — which is
    // why "add another sublane to lane one" used to make "Sublane 1 2"
    // (Paul's log, 2026-09-23).
    if (!labels.length) labels = Array.from({ length: Math.max(1, toCount(m[1])) }, () => "Sublane");
    return [{ op: "addSublanes", laneRef: m[2] ? clean(m[2]) : "the lane", labels }];
  }

  // ── Lanes ──
  m = raw.match(new RegExp(`^(?:add|insert|create|split)\\s+${COUNT}?\\s*(?:new\\s+|another\\s+|extra\\s+)?(?:lanes?|lines?)(?:\\s+(?:to|in|into|onto|on|inside)\\s+(.+?))?(?:\\s+(?:called|named|labell?ed)\\s+(.+))?$`, "i"));
  if (m) {
    let labels = m[3] ? splitLabels(m[3]) : [];
    // Bare, and numbered by the reducer against the diagram — see the sublane
    // rule above.
    if (!labels.length) labels = Array.from({ length: Math.max(1, toCount(m[1])) }, () => "Lane");
    return [{ op: "addLanes", poolRef: m[2] ? clean(m[2]) : "the pool", labels }];
  }

  // ── Add ──
  m = raw.match(/^(?:add|insert|create|put|place|drop in|give me|new)\s+(?:(?:a|an|the)\s+)?(.+)$/i);
  if (m) {
    let rest = clean(m[1]);
    // Container words are handled by the pool/lane rules above; if one slips
    // through here it's a malformed phrasing — send it to the AI rather than
    // creating a task literally named "pool to all elements on the diagram".
    if (/^(?:new\s+|another\s+)?(?:pool|poll|pull|lanes?|lines?|sub-?lanes?|sub-?lines?)\b/i.test(rest)) return null;
    let afterRef: string | undefined;
    const after = rest.match(/\s+(?:after|following|behind|next to|onto)\s+(.+)$/i);
    if (after) { afterRef = clean(after[1]); rest = rest.slice(0, after.index).trim(); }

    // M5 — "put a task here", "add a gateway over there". Stripped BEFORE the
    // name is read, or "add a task called Approve here" would be named
    // "Approve here". Refused when stripping would leave a naming keyword with
    // nothing after it, so a task someone really does want to call "Here"
    // still works.
    let atPointer = false;
    const pos = rest.match(/\s+(?:right\s+|over\s+|just\s+)?(?:here|there)$/i);
    if (pos && pos.index !== undefined) {
      const without = rest.slice(0, pos.index).trim();
      if (without && !/\b(?:called|named|labell?ed|titled)$/i.test(without)) {
        atPointer = true;
        rest = without;
      }
    }

    let label: string | undefined;
    const named = rest.match(/\s+(?:called|named|labell?ed|titled)\s+(.+)$/i);
    if (named) { label = clean(named[1]); rest = rest.slice(0, named.index).trim(); }
    const quoted = rest.match(/["'“”‘’](.+?)["'“”‘’]/);
    if (!label && quoted) { label = clean(quoted[1]); rest = rest.replace(quoted[0], "").trim(); }

    const sym = matchSymbol(rest);
    if (sym) {
      // leftover after removing the matched phrase is an implicit label
      if (!label) {
        const leftover = clean(stripArticle(rest.toLowerCase().replace(sym.phrase, " ").replace(/\s+/g, " ")));
        if (leftover) label = clean(rest.replace(new RegExp(sym.phrase, "i"), "").replace(/^(a|an|the)\s+/i, "").trim());
      }
      // B5: the leftover after the type word became the label, so "insert a
      // parallel gateway between Check Stock and Pick Items" made a gateway
      // NAMED "between Check Stock and Pick Items". A positional phrase is a
      // relationship, not a name — decline, and the AI can place it. Only
      // implicit labels: an explicit "called …" is the user's own words.
      if (label && !named && !quoted && looksPositionalNotAName(label)) return null;
      // Still talking about lanes or pools after the container rules declined it:
      // a phrasing they could not read, which the AI can. Never a symbol's name.
      if (label && !named && !quoted && namesAContainer(label)) return null;
      const op: AssistOp = { op: "add", symbolType: sym.symbolType };
      if (sym.eventType) op.eventType = sym.eventType;
      if (sym.gatewayType) op.gatewayType = sym.gatewayType;
      if (label) op.label = label;
      if (afterRef) op.afterRef = afterRef;
      if (atPointer) op.at = "pointer";
      return [op];
    }
    // "add Approve after Review" — no type word → a task named by the rest.
    if (rest) {
      const implicit = label ?? clean(stripArticle(rest));
      if (!named && !quoted && looksPositionalNotAName(implicit)) return null;
      if (!named && !quoted && namesAContainer(implicit)) return null;
      const op: AssistOp = { op: "add", symbolType: "task", label: implicit };
      if (afterRef) op.afterRef = afterRef;
      if (atPointer) op.at = "pointer";
      return [op];
    }
  }

  return null; // → AI fallback
}
