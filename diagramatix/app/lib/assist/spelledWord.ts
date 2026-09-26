/**
 * A name SPELLED OUT becomes the word — "rename Lane 3 to F I N A N C E".
 *
 * Paul, 2026-09-27: "I had difficulty with 'rename Lane 3 to finance' it kept
 * hearing finance as 'finished'". A new name is the one word the recogniser has
 * no help with: it is not on the diagram, so nothing biases toward it, and a
 * common word that sounds close ("finished") wins. Measured the same day: his
 * own recorded "Finance" clips were heard right under every setting, synthetic
 * voices 20 of 20, a boost list turned one "finance" into "Compliance", and the
 * newer model was worse on his voice overall. No recogniser setting fixes a
 * mishear that will not reproduce — so the fix is an escape hatch that cannot
 * be misheard: letters.
 *
 * Three or more single letters in a row, separated by spaces, dots or hyphens,
 * are joined into one lower-case word; the name's capital comes later, from
 * `capitaliseFirstWord`, where every name gets it. Two letters stay as they are
 * ("Plan A B" is not a spelling), and so does a lone article ("add a task").
 *
 * Pure.
 */
const SPELLED_RUN = /(?<![\p{L}\p{N}])(?:\p{L}[\s.\-]+){2,}\p{L}(?![\p{L}\p{N}])\.?/gu;

export function joinSpelledLetters(text: string): string {
  return text.replace(SPELLED_RUN, (run) => {
    const letters = run.replace(/[\s.\-]+/g, "");
    return [...letters].every((ch) => /\p{L}/u.test(ch)) ? letters.toLowerCase() : run;
  });
}
