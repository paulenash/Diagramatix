/**
 * Renaming a project or a diagram on the phone (2026-09-29 — Paul: "Add
 * ability to edit the Project or Diagram names"). The server's rule is the
 * same (PUT /api/projects/[id], PUT /api/diagrams/[id]): a name is a non-empty
 * string, stored trimmed. Pure, so it is tested without a phone.
 */

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "unchanged" };

/** The name to send — trimmed — or why there is nothing to send. */
export function cleanName(raw: string, current: string): NameCheck {
  const name = raw.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (name === current.trim()) return { ok: false, reason: "unchanged" };
  return { ok: true, name };
}

/** What a failed rename says, in the person's terms. */
export function renameFailureText(status: number, serverSaid: string | null): string {
  if (status === 403) return "You can’t rename this.";
  if (status === 400) return serverSaid ?? "A name is needed.";
  if (status === 404) return "It could no longer be found.";
  return "The name couldn’t be saved — check your connection and try again.";
}
