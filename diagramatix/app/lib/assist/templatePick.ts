/**
 * "Add template" — choosing one by voice, from a wall of numbered pictures.
 *
 * Paul, 2026-09-24: "A large pop-up window appears with all of the templates in
 * their groups, divided by built-in and user of course … displayed with large
 * icons of the actual template and our familiar green numbers marking each one,
 * so that all the user has to do is say seven or nine and that template is
 * provisionally added and requires the user to confirm, or use a different
 * number … for that tentative template to be replaced with the newly selected
 * template. And then finally the user has a voice confirm and the template is
 * added to the diagram."
 *
 * Two things make this different from the pickers that already exist. The
 * candidates are not ON the canvas, so the numbers live in the window rather
 * than on badges; and the answer is not final — a number puts the template on
 * the diagram to be LOOKED at, and another number replaces it. Nothing is
 * committed until the user says so.
 *
 * Numbering runs unbroken across the whole window, in the order the cards are
 * read: built-in first, then the user's own, each in its groups. A number the
 * user can see is the only thing that has to be unambiguous — which is why it
 * is one sequence and not one per group.
 *
 * Pure.
 */
import { leadingSpokenNumber } from "./spokenNumber";
import { parseConfirmation } from "./confirm";
import { phoneticMatches } from "./phonetic";
import { spokenNumbersAsDigits } from "./resolveRef";
import { parseTemplateAnswerPlace } from "./templatePhrase";
import { isBlackBoxPool } from "@/app/lib/diagram/blackBoxPoolMenu";
import type { DiagramElement } from "@/app/lib/diagram/types";

export interface TemplateRowLike {
  id: string;
  name: string;
  group?: string | null;
  description?: string | null;
  thumbnailSvg?: string | null;
  /**
   * A template that STARTS a diagram rather than adding to one — it brings its
   * own white-box pool, or it is a whole process spine from the Starters group.
   * Derived where the templates are listed (`/api/templates`).
   */
  initial?: boolean;
  /** It brings a pool, lane or sub-lane of its own (`/api/templates`). */
  hasContainer?: boolean;
  hasWhiteBoxPool?: boolean;
}

/** Groups whose templates begin a diagram, whoever owns them. */
const STARTER_GROUPS = /^\s*starters?\s*$/i;

/**
 * Is this template one that starts a diagram?
 *
 * Paul, 2026-09-24: "Do not include any templates that include White-box pools
 * i.e. initial templates unless there are no white-box pools on the diagram, or
 * it is an empty diagram … and Starters category as well."
 *
 * Two ways to be one, and both are read from what the template IS rather than
 * from a tick somebody has to remember:
 *   • it contains a WHITE-BOX pool — the two in "Initial Process Types" do,
 *     and nothing else in the library does (the other pools templates carry
 *     are black-box participants, which are fine to add to a live diagram);
 *   • it sits in a group called "Starters" — a whole process spine, start
 *     event to end, which belongs on an empty canvas and not inside somebody's
 *     existing process.
 *
 * `hasWhiteBoxPool` comes from the API, which reads the template's own data.
 */
export function isInitialTemplate(row: { group?: string | null; initial?: boolean; hasWhiteBoxPool?: boolean }): boolean {
  if (row.initial != null) return row.initial;
  return !!row.hasWhiteBoxPool || STARTER_GROUPS.test(row.group ?? "");
}

/**
 * Does the diagram already have a white-box pool — one the initial-template
 * rule below hides starters for? Any pool that is not EXPLICITLY black-box: an
 * absent poolType is white-box. The same predicate (blackBoxPoolMenu.ts
 * `isBlackBoxPool`) decides which pools a template or a released element may
 * join, so the window and the drop can never disagree about a legacy pool.
 */
export function diagramHasWhiteBoxPool(elements: readonly DiagramElement[]): boolean {
  return elements.some((e) => e.type === "pool" && !isBlackBoxPool(e));
}

/**
 * The templates worth offering for THIS diagram.
 *
 * An initial template is offered only where it makes sense: an empty diagram,
 * or one with no white-box pool yet. Dropping a second process spine into a
 * diagram that already has one is not an edit anybody means to make.
 */
export function offerableTemplates<T extends TemplateRowLike>(
  rows: readonly T[],
  hasWhiteBoxPool: boolean,
): T[] {
  if (!hasWhiteBoxPool) return [...rows];
  return rows.filter((r) => !isInitialTemplate(r));
}

/**
 * Can this template be joined INTO a flow after an element? Not one that brings
 * its own pool or lane — there is nothing inline to join. The mouse's attach
 * picker (the Assist "Template" ghost) and the voice's anchored window ask this
 * one question.
 */
export function canAttachInline(row: { hasContainer?: boolean }): boolean {
  return !row.hasContainer;
}

export interface TemplateOffer<T> {
  offered: T[];
  /** Starters and templates with a white-box pool, hidden because the diagram has one. */
  hiddenInitial: number;
  /** Templates that bring a pool or lane, hidden because the window is attaching. */
  hiddenContainer: number;
}

/**
 * What the window offers. Paul's initial-template rule always applies; when the
 * template is to follow an element (`attaching`), templates that bring a pool
 * or lane are hidden too. Each template is counted once, under the first rule
 * that hides it.
 */
export function templatesToOffer<T extends TemplateRowLike>(
  rows: readonly T[],
  opts: { hasWhiteBoxPool: boolean; attaching: boolean },
): TemplateOffer<T> {
  const offer: TemplateOffer<T> = { offered: [], hiddenInitial: 0, hiddenContainer: 0 };
  for (const r of rows) {
    if (opts.hasWhiteBoxPool && isInitialTemplate(r)) offer.hiddenInitial++;
    else if (opts.attaching && !canAttachInline(r)) offer.hiddenContainer++;
    else offer.offered.push(r);
  }
  return offer;
}

/** The window's footer note, and the tail of the log line, for what was hidden. */
export function hiddenTemplatesNote(hiddenInitial: number, hiddenContainer: number): string {
  const n = hiddenInitial + hiddenContainer;
  if (!n) return "";
  if (!hiddenContainer) return `${n} starter template${n === 1 ? "" : "s"} hidden — this diagram already has a pool`;
  if (!hiddenInitial) return `${n} template${n === 1 ? " that brings" : "s that bring"} a pool or lane hidden — they can't join a flow`;
  return `${n} hidden — starters, and templates that bring a pool or lane`;
}

/** What the log says when the window opens. */
export function templateWindowSummary(count: number, hiddenInitial: number, hiddenContainer: number, anchorName?: string): string {
  const hidden = hiddenInitial + hiddenContainer;
  if (!anchorName) {
    return `${count} templates — say a number${hiddenInitial ? `, ${hiddenInitial} starter${hiddenInitial === 1 ? "" : "s"} hidden` : ""}`;
  }
  const why = [hiddenInitial ? "starters" : "", hiddenContainer ? "templates that bring a pool" : ""].filter(Boolean).join(", and ");
  return `${count} templates to add after “${anchorName}” — say a number${hidden ? `, ${hidden} hidden (${why})` : ""}`;
}

/** One card in the window: a template, its number, and where it belongs. */
export interface TemplateCard {
  /** 1-based, unbroken across the whole window. */
  n: number;
  id: string;
  name: string;
  /** The group header it sits under; null for the ungrouped ones. */
  group: string | null;
  source: "builtin" | "user";
  description?: string | null;
  thumbnailSvg?: string | null;
}

/** A group of cards under one header, as the window lays them out. */
export interface TemplateSection {
  source: "builtin" | "user";
  group: string | null;
  cards: TemplateCard[];
}

/** Ungrouped templates come last within their half, under no header. */
const byGroup = (rows: readonly TemplateRowLike[]): Array<[string | null, TemplateRowLike[]]> => {
  const groups = new Map<string, TemplateRowLike[]>();
  const loose: TemplateRowLike[] = [];
  for (const r of rows) {
    const g = (r.group ?? "").trim();
    if (!g) { loose.push(r); continue; }
    const list = groups.get(g) ?? [];
    list.push(r);
    groups.set(g, list);
  }
  const named = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  return loose.length ? [...named, [null, loose] as [string | null, TemplateRowLike[]]] : named;
};

/**
 * Number every template once, in reading order, and say which section each
 * belongs to. Built-in first because it is the same for everyone — a number
 * someone learns on one diagram means the same thing on the next, until they
 * add a template of their own.
 */
export function numberTemplates(
  builtIn: readonly TemplateRowLike[],
  user: readonly TemplateRowLike[],
): TemplateSection[] {
  let n = 0;
  const sections: TemplateSection[] = [];
  for (const [source, rows] of [["builtin", builtIn], ["user", user]] as const) {
    for (const [group, list] of byGroup(rows)) {
      sections.push({
        source,
        group,
        cards: list.map((r) => ({
          n: ++n,
          id: r.id,
          name: r.name,
          group,
          source,
          description: r.description ?? null,
          thumbnailSvg: r.thumbnailSvg ?? null,
        })),
      });
    }
  }
  return sections;
}

/** Every card, in number order — what an answer is matched against. */
export function cardsOf(sections: readonly TemplateSection[]): TemplateCard[] {
  return sections.flatMap((s) => s.cards).sort((a, b) => a.n - b.n);
}

export type TemplateAnswer =
  /** Put this one on the diagram to be looked at (replacing any before it). */
  | { kind: "pick"; card: TemplateCard }
  /** Keep what is showing. */
  | { kind: "confirm" }
  /** Take it off and close the window. */
  | { kind: "cancel" }
  /** "after X": the templates go after X from now on (and what is showing moves there). */
  | { kind: "anchor"; ref: string }
  /** "before X": refused — a template can only go after something. */
  | { kind: "before"; ref: string }
  /** Not an answer to this question — the window stays as it is. */
  | null;

/**
 * What the user just said, as an answer to the template window.
 *
 * A NAME is read before a number, for the reason the disambiguation picker
 * learned on 2026-09-23: `leadingSpokenNumber` forgives a mis-heard number
 * word, and template names are full of words it would forgive.
 *
 * "Yes" only means something once something is showing — before that there is
 * nothing to confirm, and a stray "yes" should not close the window.
 */
export function parseTemplateAnswer(
  utterance: string,
  cards: readonly TemplateCard[],
  hasProvisional: boolean,
): TemplateAnswer {
  const said = utterance.trim();
  if (!said) return null;

  const yesNo = parseConfirmation(said);
  if (yesNo === "no") return { kind: "cancel" };
  if (yesNo === "yes" && hasProvisional) return { kind: "confirm" };

  // A template's WHOLE name wins over everything below: a template called
  // "After Hours Escalation" is that template, not "after “Hours Escalation”".
  const whole = matchCardByName(said, cards, { exactOnly: true });
  if (whole) return { kind: "pick", card: whole };

  // "Add template." … "After selected." — the speaker paused, the window
  // opened on the first half, and the anchor arrives as an answer (verdict-5).
  // Read before PART names: "after the gateway" must never pick a template
  // whose name merely contains or sounds like it.
  const place = parseTemplateAnswerPlace(said);
  if (place && "afterRef" in place) return { kind: "anchor", ref: place.afterRef };
  if (place && "beforeRef" in place) return { kind: "before", ref: place.beforeRef };

  const byName = matchCardByName(said, cards);
  if (byName) return { kind: "pick", card: byName };

  const num = leadingSpokenNumber(said);
  if (num) {
    const card = cards.find((c) => c.n === num.n);
    if (card) return { kind: "pick", card };
  }
  return null;
}

/**
 * The card a phrase names, or null when it names none or more than one.
 *
 * The field is everything in the window rather than two or three candidates,
 * so this is stricter than the disambiguation picker: a whole name, or a
 * phrase that only one name contains, or one that sounds like exactly one.
 */
export function matchCardByName(
  utterance: string,
  cards: readonly TemplateCard[],
  opts: { exactOnly?: boolean } = {},
): TemplateCard | null {
  const said = spokenNumbersAsDigits(
    utterance.trim().toLowerCase().replace(/[.,!?;:]+$/g, "")
      .replace(/^(?:the|a|an|use|pick|choose|insert|add|template|number)\s+/i, "")
      .replace(/\s+template$/i, "")
      .trim(),
  );
  if (!said || said.length < 3) return null;      // "one" is a number, not a name
  const nameOf = (c: TemplateCard) => spokenNumbersAsDigits(c.name.trim().toLowerCase());
  const only = (hits: TemplateCard[]) => (hits.length === 1 ? hits[0] : null);

  const exact = only(cards.filter((c) => nameOf(c) === said));
  if (exact || opts.exactOnly) return exact;
  const contains = only(cards.filter((c) => nameOf(c).includes(said)));
  if (contains) return contains;
  return only(phoneticMatches(said, [...cards], (c) => c.name));
}
