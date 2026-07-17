/**
 * Decide how a uml-package's link to a child Domain diagram should change when
 * the package is RENAMED. Kept pure + separate from DiagramEditor so the rules
 * are unit-tested (see tests/diagram/package-link.test.ts).
 *
 * Rules (Paul):
 *  • Offer to link when a package is named the same as an existing Domain
 *    diagram in the project and it isn't already linked to it.
 *  • Unlink when the name changes AND the link was NAME-DERIVED — i.e. the
 *    linked child's name equalled the OLD package name. A manual link to a
 *    differently-named diagram (set via the Properties picker) is LEFT ALONE.
 */
export interface SiblingDiagram { id: string; name: string; type: string }

export interface PackageLinkDecision {
  /** Clear the package's linkedDiagramId. */
  unlink: boolean;
  /** Prompt the user to link to this same-named Domain diagram (or null). */
  offer: { diagramId: string; name: string } | null;
}

export function resolvePackageNameLink(
  oldLabel: string,
  newLabel: string,
  linkedDiagramId: string | undefined,
  siblings: SiblingDiagram[],
): PackageLinkDecision {
  const nl = newLabel.trim();
  const none: PackageLinkDecision = { unlink: false, offer: null };
  if (nl === oldLabel.trim()) return none; // name unchanged

  let unlink = false;
  if (linkedDiagramId) {
    const linked = siblings.find((d) => d.id === linkedDiagramId);
    // Manual link (child not named as the OLD package name) → leave it entirely.
    if (!(linked && linked.name === oldLabel)) return none;
    unlink = true; // name-derived link, and the name changed → drop it
  }

  let offer: PackageLinkDecision["offer"] = null;
  if (nl) {
    const match = siblings.find((d) => d.type === "domain" && d.name === nl);
    if (match && match.id !== linkedDiagramId) offer = { diagramId: match.id, name: nl };
  }
  return { unlink, offer };
}
