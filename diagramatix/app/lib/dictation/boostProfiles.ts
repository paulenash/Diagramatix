/**
 * Keyword-boost profiles, so the list can be MEASURED rather than argued about.
 *
 * ─── What a boost actually does ────────────────────────────────────────────
 *
 * `keywords=lane:3` does not mean "recognise 'lane' when it is spoken". It
 * means "be three times more willing to OUTPUT the word 'lane'". It shifts the
 * model's prior, so when the audio is ambiguous the boosted word wins — and
 * when the audio is not especially ambiguous, a large enough boost can still
 * win. That is why the comment on `COMMAND_KEYWORDS` has always said that every
 * boost is a bet against every other word.
 *
 * ─── Why this module exists ────────────────────────────────────────────────
 *
 * Until 2026-09-24 the boost list had never been tested against real audio,
 * because every local session fell back to the browser engine and nobody had a
 * recorded corpus. The first replay of Paul's 100 clips found the list doing
 * net harm: across the corpus it helped ONE clip and hurt EIGHT, and roughly
 * half of all failures were a boosted word displacing the word he actually
 * said — "make" heard as "Lane", "delete" as "Selected", "swap" as "Pool".
 *
 * Rather than pick a new list by reasoning, the profiles below can each be run
 * over the same corpus and compared. Ten minutes per profile settles what an
 * argument would not.
 */
import { COMMAND_KEYWORDS } from "./asrParams";

export type BoostProfileId = "current" | "none" | "plural" | "tuned";

export interface BoostProfile {
  id: BoostProfileId;
  label: string;
  keywords: readonly string[];
  /** Why this profile exists, in the words a person choosing it needs. */
  explain: string;
  /** What to look for in the result, so a number means something. */
  watch: string;
}

/**
 * Containers without weights, singular AND plural.
 *
 * Two changes from the shipped list, for two separate observed faults. The
 * weights come off because 3 is strong enough to beat words that sound nothing
 * like the boosted one. The plurals go in because boosting only the singular
 * makes it compete with its own plural — "add two sublanes" came back "add two
 * lane", and "extend the pools" came back "extend the pool".
 */
const CONTAINERS_BOTH_NUMBERS: readonly string[] = [
  "lane", "lanes", "sublane", "sublanes", "pool", "pools",
];

export const BOOST_PROFILES: readonly BoostProfile[] = [
  {
    id: "current",
    label: "Current (shipped)",
    keywords: COMMAND_KEYWORDS,
    explain:
      "The list production runs today: containers at weight 3, 'selected' at 3, element nouns at 2, "
      + "and a handful of command verbs unweighted. Every entry was added to fix a real mis-hear — but "
      + "all of them were added while local voice was silently using the BROWSER recogniser, so none was "
      + "ever tested against Deepgram.",
    watch:
      "This is the baseline. Expect 'make'/'align'/'swap'/'remove' to lose their verb to 'Lane' or 'Pool', "
      + "and every plural ('lanes', 'sublanes', 'pools') to come back singular.",
  },
  {
    id: "none",
    label: "No boosts at all",
    keywords: [],
    explain:
      "Nothing biased. This is the honest control: whatever Deepgram makes of Australian English, unaided. "
      + "A side-by-side over Paul's corpus found FEWER total word errors this way than with the shipped list "
      + "(134 against 147).",
    watch:
      "The one thing the boosts genuinely bought should come back: 'lane' heard as 'line'. If that is the only "
      + "regression, the shipped list is costing more than it earns.",
  },
  {
    id: "plural",
    label: "Containers, unweighted, with plurals",
    keywords: CONTAINERS_BOTH_NUMBERS,
    explain:
      "Container words only — lane, lanes, sublane, sublanes, pool, pools — all at weight 1. Keeps a mild "
      + "nudge toward the vocabulary that genuinely confuses ('lane' vs 'line'), while removing the two "
      + "mechanisms that caused harm: heavy weights that beat unrelated verbs, and singular-only entries "
      + "that compete with their own plurals.",
    watch:
      "Does 'rename lanes' finally survive as 'lanes'? And do 'make', 'align', 'swap' and 'remove' keep their verbs?",
  },
  {
    id: "tuned",
    label: "Tuned — containers + safe verbs",
    keywords: [...CONTAINERS_BOTH_NUMBERS, "boundary", "connect", "compact", "gateway", "task", "subprocess"],
    explain:
      "The plural profile plus the element nouns and command verbs that were never observed causing harm, "
      + "all unweighted. Deliberately DROPS 'selected' and 'rename': 'selected:3' was added to fix a browser-"
      + "recogniser problem and was caught eating 'delete', and 'rename' was caught eating 'Prepare'.",
    watch:
      "Best case this beats both the current list and no boosts. If it only matches 'no boosts', prefer no "
      + "boosts — fewer moving parts, and nothing to go stale.",
  },
];

export const DEFAULT_BOOST_PROFILE: BoostProfileId = "current";

export function boostProfile(id: string | null | undefined): BoostProfile {
  return BOOST_PROFILES.find((p) => p.id === id) ?? BOOST_PROFILES[0];
}
