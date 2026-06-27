/**
 * Starter templates for the standalone Markdown documents authored in the User
 * Guide editor (Product Updates and Release Notes). These are saved as plain .md
 * files to SharePoint, independent of the guide DB.
 */
export type DocType = "release-notes" | "product-update";

export const DOC_TYPES: { id: DocType; label: string; defaultName: string }[] = [
  { id: "release-notes", label: "Release Notes", defaultName: "Release Notes vX.Y" },
  { id: "product-update", label: "Product Update", defaultName: "Product Update" },
];

export function docTemplate(type: DocType): string {
  if (type === "release-notes") {
    return [
      "# Release Notes — vX.Y",
      "",
      "**Release date:** _TBC_  ",
      "**Audience:** All users",
      "",
      "## Highlights",
      "",
      "- _One or two headline changes._",
      "",
      "## Added",
      "",
      "- _New capabilities._",
      "",
      "## Changed",
      "",
      "- _Improvements and behaviour changes._",
      "",
      "## Fixed",
      "",
      "- _Resolved issues._",
      "",
      "## Known issues",
      "",
      "- _Anything to be aware of._",
      "",
    ].join("\n");
  }
  return [
    "# Product Update — _Title_",
    "",
    "**Date:** _TBC_",
    "",
    "## Summary",
    "",
    "_A short, plain-English overview of what's new and why it matters._",
    "",
    "## What's new",
    "",
    "- _Point one._",
    "- _Point two._",
    "",
    "## Get started",
    "",
    "_How to try it, or where to find it._",
    "",
  ].join("\n");
}
