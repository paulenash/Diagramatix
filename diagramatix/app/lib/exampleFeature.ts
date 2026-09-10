/**
 * What a worked example illustrates, as a list a reader can scan before
 * spending a click.
 *
 * Both galleries — Simulator and Miner — show a card with a title, a concept
 * line and a paragraph of prose. None of that answers the question somebody
 * browsing a catalog actually has, which is *which of these shows me the thing
 * I came for*. A capability that appears in exactly one example is invisible
 * until you have opened all of them.
 *
 * The rule these lists follow, and the reason they are DERIVED from the package
 * rather than typed alongside it: **a feature list is a claim, and a claim
 * written by hand goes stale silently.** An example whose log stops carrying a
 * resource column still says "shows team hand-offs" in a hand-maintained list,
 * and nothing anywhere goes red. So each entry is computed from the bundle it
 * describes, and where there is a number to quote it is measured from that
 * example's own data rather than remembered.
 */

export interface ExampleFeature {
  /** Stable handle, so a test can name one and a UI can key on it. */
  id: string;
  /** The capability, in the words the product uses for it. */
  label: string;
  /** What THIS example shows of it — carrying a measured figure where there is
   *  one, because "shows rework" and "the credit check runs 2.1× per
   *  application" are not the same sentence. */
  detail: string;
  /** Where to look once inside: the tab, panel or control. Omitted when the
   *  feature is the example's shape rather than a place to go. */
  where?: string;
}

/** Group heading for a run of features, so a long list stays readable. */
export interface ExampleFeatureGroup {
  title: string;
  features: ExampleFeature[];
}

/** What a summary endpoint returns for one example. */
export interface ExampleSummary {
  title: string;
  concept: string;
  /** The catalog prose, rendered and SANITISED server-side. The renderer pulls
   *  in `marked` and `sanitize-html`; sending it to the browser to re-do work
   *  the server already did is how a client bundle grows a parser. */
  descriptionHtml: string;
  difficulty: string;
  groups: ExampleFeatureGroup[];
  /** Said plainly when a package carries nothing recognisable — an empty list
   *  with no explanation reads as a broken screen. */
  note?: string;
}
