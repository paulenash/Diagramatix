/**
 * The shipped command tree: the lists and the patterns. A SuperAdmin override
 * (slice 2) replaces the patterns text; these are what "Reset to default" returns to.
 *
 * AUTHORED, not derived: `parseCommand` is ~50 order-sensitive regexes and cannot be
 * read as a grammar. What keeps this honest is tests/assist/command-tree-consistency
 * .test.ts — every sentence these patterns describe must parse, every catalog sentence
 * must be accepted here, and the two lists of disagreements may only shrink.
 *
 * Words that ARE shared data with the parser are checked against it there too:
 * {type_words} against `parseRenameType`, {element_kinds} against `SYMBOL_SYNONYMS`.
 */
import type { Lists } from "./tree";

export const DEFAULT_LISTS: Lists = {
  type_words: ["pools", "lanes", "sublanes", "tasks", "activities", "steps", "subprocesses", "gateways", "decisions", "events", "messages", "connectors"],
  element_kinds: [
    "task", "activity", "step", "subprocess", "expanded subprocess", "gateway", "decision",
    "parallel gateway", "exclusive gateway", "inclusive gateway", "event gateway",
    "start event", "end event", "intermediate event", "event",
    "user task", "service task", "script task", "send task", "receive task", "manual task",
    "timer event", "data object", "data store",
  ],
  // What "make … a X" / "turn … into a X" can turn something into (the parser's subtype table).
  convert_kinds: [
    "task", "subprocess", "plain subprocess", "decision", "parallel gateway", "exclusive gateway", "inclusive gateway",
    "user task", "service task", "script task", "send task", "receive task", "manual task",
    "timer event", "message event", "event",
  ],
  target_kinds: [
    "task", "tasks", "gateway", "gateways", "event", "events", "pool", "pools", "lane", "lanes",
    "connector", "connectors", "element", "elements", "subprocess", "subprocesses", "message", "messages",
  ],
  directions: ["up", "down", "left", "right"],
  // The items whose label is drawn outside the symbol, so it can be moved or removed (a task's name sits inside it).
  label_kinds: ["gateway", "decision", "event", "start event", "end event", "intermediate event", "connector", "message", "flow", "arrow", "data object", "data store"],
  step_words: ["elements", "steps", "places", "spaces", "cells"],
  edge_words: ["top", "bottom", "left", "right"],
  points: ["top", "middle", "bottom", "left", "right", "centre", "center"],
  ordinals: ["first", "second", "third", "fourth", "fifth"],
  event_triggers: ["timer", "message", "error", "signal", "escalation", "conditional", "cancel", "compensation"],
  place_after: ["after", "following", "behind", "next to", "onto"],
  place_before: ["before", "ahead of"],
  compress_verbs: ["compress", "compressed", "collapse", "shrink", "reduce", "shorten", "compact", "tighten", "condense"],
};

export const DEFAULT_PATTERNS = `# Voice Assist command tree — what can be said, word by word.
#
#   word          a literal word            a|b|c        one of these
#   ( x y | z )   a group; a bar inside ( ) separates choices
#   [ x ]         optional (shown in [ ])   <slot>       a variable (see the conventions)
#   {list}        a named list of words     # …          a comment
#
# Names and labels are variables: <existing_element_name> (activities, pools, lanes,
# sublanes), <existing_label_name> (events, messages, connectors, data objects, data
# stores, gateways), <new_element_name> and <new_label_name> (what is about to be named).
# <target> is pointing instead of naming: this, that, these, selected, the one under the cursor.

## commands

# ── Elements and flow
(add|insert|create|put|place) [a|an|the] [new] {element_kinds} [called <new_element_name>] [{place_after} (<existing_element_name>|<existing_label_name>|<target>)] [here|there]
(add|insert|create) [a|an] {element_kinds} [called <new_element_name>] between (<existing_element_name>|<existing_label_name>|<target>) and (<existing_element_name>|<existing_label_name>|<target>) [called <new_element_name>]
(connect|link|join) (<existing_element_name>|<existing_label_name>|<target>) (to|with|into) (<existing_element_name>|<existing_label_name>|<target>)  @on flownode data
(connect|link|join) (them|these|those) [up]  @on flownode data
(disconnect|unlink) (<existing_element_name>|<existing_label_name>|<target>) (from|to|and) (<existing_element_name>|<existing_label_name>|<target>)  @on flownode data
(reverse|flip) [(this|that|it|selected|the connector)]  @on connector

# ── Deleting
(delete|remove|erase|drop) [the] (<existing_element_name>|<existing_label_name>|<target>) [and (compact|compress|tidy up|close the gap)]
(delete|remove) [all|the] {type_words}  @nosel
(delete|remove) (connector|message) <existing_label_name>
(delete|remove) [the] sublane <existing_element_name>

# ── Renaming and labelling
(rename|relabel) [all|the] {type_words}  @nosel
(rename|relabel) [the] (<existing_element_name>|<target>) (to|as) <new_element_name>
(rename|relabel) (to|as) <new_element_name>
(rename|relabel) [connector|message|gateway|event] <existing_label_name> (to|as) <new_label_name>
label <selection> [connector|flow|arrow] <new_label_name>
call <existing_element_name> <new_element_name>
(name|call) (these|those) <new_label_name>
label [the] selected [connector]
label selected <new_label_name>
(label|relabel) (connectors|messages|flows)  @nosel
label <target> <new_label_name>
(add|set|give) [a|the] label [(called|as|saying)] <new_label_name> [to (<target>|selected)]
(remove|clear|delete|erase) [the|this|that|its] [{label_kinds}] label [(from|on|of) (<target>|selected)]

# ── Selecting, and moving a label
(select|highlight) [all|the] {type_words}  @nosel
(select|highlight) [the] (<existing_element_name>|<existing_label_name>)
(move|nudge|bump|shift|slide|push|inch) [the|this|that|its|selected] [{label_kinds}] label [to the] {directions} [[by] <distance>]

# ── Taking a loop marker off
(remove|clear|delete|drop) [the] (loop|repeat) [marker] [(from|on|off) (this|that|[the] selected [subprocess|ep])]  @on activity
no loop [marker]  @on activity

# ── Moving and nudging
move (<existing_element_name>|<existing_label_name>|<target>) [<number> {step_words}] [to the] {directions}
move (<existing_element_name>|<existing_label_name>|<target>) and everything after it <distance> [to the] (left|right)
(nudge|bump|inch) [the] (<existing_element_name>|<existing_label_name>|<target>|pool) {directions} [by <distance>]
move (everything|all the elements) (in|of|within) <existing_element_name> <distance> [to the] (left|right)  @on pool lane expanded-subprocess
move (everything|all the elements) (in|of|within) <existing_element_name> [to the] (left|right) [by] <distance>  @on pool lane expanded-subprocess
move everything (from|after) (<existing_element_name>|<existing_label_name>|<target>) [in <existing_element_name>] <distance> [to the] (left|right)
(move|nudge|shift) [the] [pool|lane] <existing_element_name> (top|bottom) (boundary|edge|divider|border) (up|down) [[by] <distance>]  @on pool lane
(move|nudge|shift) [the] [pool|lane] <existing_element_name> (left|right) (boundary|edge|divider|border) (left|right) [[by] <distance>]  @on pool lane
(move|nudge|shift) [the] (top|bottom|left|right) (edge|boundary|divider) of [the] <existing_element_name> [pool|lane] {directions} [[by] <distance>]  @on pool lane
(nudge|bump|move|shift) [the] <existing_element_name> (pool's|lane's) (top|bottom) (boundary|edge|divider|border) (up|down) [[by] <distance>]  @on pool lane
(nudge|bump|move|shift) [the] <existing_element_name> (pool's|lane's) (left|right) (boundary|edge|divider|border) (left|right) [[by] <distance>]  @on pool lane
(move|put|place) <existing_element_name> (above|below|over|under) <existing_element_name>  @on pool
move (divider|dividers)  @on pool lane
move lane (divider|dividers)  @on pool lane

# ── Converting
make (<existing_element_name>|<existing_label_name>|<target>) (a|an) {convert_kinds}  @on flownode
(turn|change|convert|set) (<existing_element_name>|<existing_label_name>|<target>) (to|into) (a|an) {convert_kinds}  @on flownode

# ── Boundary events
(add|insert|put|attach|create) [a|an] [non-interrupting] [{event_triggers}] boundary event [called <new_label_name>] [(to|on|onto) (<existing_element_name>|<target>)] [called <new_label_name>]  @on activity

# ── Messages
(add|create|draw|send) [a] message  @on activity event pool
(add|create|draw|send) [a] message (from|to) <target>  @on activity event pool
(add|create|draw|send) [a] message from (<existing_element_name>|<target>) to (<existing_element_name>|<target>) [(labelled|called|named|saying) <new_label_name>]  @on activity event pool
(add|create|draw|send) [a] message to (<existing_element_name>|<target>) from (<existing_element_name>|<target>) [(labelled|called|named|saying) <new_label_name>]  @on activity event pool

# ── Templates
(add|insert|use|pick|choose|show|open) template [(after|before) <existing_element_name>|here]

# ── Teams, risks and controls
assign <selection> to [the] <new_element_name> team  @on activity
put <selection> in [the] <new_element_name> team  @on activity
(attach|link) (risk|control) <new_label_name> to <selection>  @on node

# ── Aligning
(align|straighten) <selection> [in a (row|column)]  @on node
align their (left|right|top|bottom) edges  @on node
line (these|those) up [in a (row|column)]  @on node

# ── Wrapping
(surround|wrap|enclose) (<selection>|selected) (with|in|inside) (a subprocess|an expanded subprocess|a pool|a lane) [called <new_element_name>]  @on flownode
wrap everything in a pool [called <new_element_name>]  @nosel
put (a subprocess|an expanded subprocess|a pool|a lane) around <selection> [called <new_element_name>]  @on flownode
put a pool around everything [called <new_element_name>]  @nosel
(unwrap|dissolve|unpack|flatten) [the] (selected (subprocess|ep)|ep|subprocess|expanded subprocess)  @on expanded-subprocess

# ── Pools
(add|insert|create) [a|an] [new] [(black|white) box] pool [called <new_element_name>] [(above|below|over) <existing_element_name>]  @nosel
(extend|widen|expand|grow) [the] pools [to include all elements]  @nosel
include all elements  @nosel
{compress_verbs} [the] <existing_element_name> [pool|lane|sublane]  @on pool lane expanded-subprocess
{compress_verbs} [(this|that|it|selected)]  @on pool lane expanded-subprocess
swap [the] [selected|two] pools  @on pool

# ── Lanes
(add|insert|create) [a|<number>] [new] (lane|lanes|sublane|sublanes) [(to|in|inside) <existing_element_name>] [called <new_element_name>]  @on pool lane
(add|insert|create) a lane (above|below) <existing_element_name> [called <new_element_name>]  @on lane
(expand|grow|enlarge) [the] <existing_element_name> lane [by <distance>]  @on lane
(expand|grow|enlarge) [the] lane <existing_element_name> [by <distance>]  @on lane
swap <existing_element_name> (with|and|for) <existing_element_name>  @on pool lane

# ── Gateway and event points
swap [[the] selected (gateway|event)] {points} (and|with) {points}  @on gateway event
move [[the] selected (gateway|event)] {points} to {points}  @on gateway event

# ── Diagram
undo [that]
(again|repeat [that]|once more|same again|one more|keep going|do it again|do that again)
turn (on|off) (gold flashing|flashing gold)  @nosel
(clear|empty|wipe|reset|blank) (the diagram|all)  @nosel
(start over|start again|new diagram)  @nosel
(export|download) [the] diagram [to json]  @nosel

## aliases
# The first-words list shows the word on the left, with its aliases in grey beside it. They all still work.
add: insert create put place draw send
again: repeat same one keep do
align: straighten
clear: blank empty wipe reset start new
compress: collapse compact compressed condense reduce shorten shrink tighten
connect: link join
convert: turn change set
delete: remove erase drop
disconnect: unlink
expand: grow enlarge
export: download
extend: widen
label: name call give set
move: nudge bump shift slide push
rename: relabel
reverse: flip
select: highlight
surround: wrap enclose
unwrap: dissolve unpack flatten
use: pick choose open show
accept: take

## assist-words
# Listed as first words only while Assist is active: they are Assist's way of taking a suggestion or a template.
use pick choose open show

## hidden
# Words that start a command but are not worth listing as first words (Paul, 2026-10-02). They still work.
inch line once

## assist
# Only while Assist ghost suggestions are on screen.
(accept|take|use) [the] ({ordinals}|{element_kinds}|suggestion) [one]

## voice
# The microphone words — not parser commands.
stop [listening]
yes|no

## flow rename-pick
# "rename tasks" opened the green numbers: a number (and then the name), or done.
# cancel and undo also get out, but are secondary — shown dimmed in [ ].
<number> [<new_label_name>]
done
[cancel|undo]

## flow select-pick
# "select events" opened the green numbers: a number selects that one — nothing is renamed.
# done gets out; cancel and undo are secondary.
<number>
done
[cancel|undo]

## flow rename-name
# A number was picked: say the new name — or clear it (connectors and messages only).
<new_label_name>
(clear|blank|nothing|no label|no name)
done
[cancel]

# "move dividers" opens green numbers on the lane dividers. What can be said depends on
# what has happened so far, so there are three states (the editor picks one from the flow's
# own memory):
#   dividers        just opened — a number, or done
#   dividers-held   a number was said and is waiting for its way
#   dividers-moved  a divider has been moved — another number, or an amount to adjust that move

## flow dividers
<number> (up|down) [<distance>]
<number>
done

## flow dividers-held
(up|down) [<distance>]
<distance>
<number> (up|down) [<distance>]
<number>
done

## flow dividers-moved
<number> (up|down) [<distance>]
<number>
<distance>
done
`;
