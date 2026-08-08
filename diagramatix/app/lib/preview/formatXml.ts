/**
 * Light XML/BPMN pretty-printer for the file-preview pop-up. Not a parser — it
 * just inserts line breaks between adjacent tags and indents by nesting depth so
 * a single-line export reads nicely on camera. Leaves content/text nodes intact.
 */
export function formatXml(xml: string): string {
  if (!xml) return "";
  // Break between tags, and between a tag and following text / preceding text.
  const withBreaks = xml
    .replace(/\r?\n/g, "")
    .replace(/>\s*</g, ">\n<")
    .trim();

  let depth = 0;
  const out: string[] = [];
  for (const raw of withBreaks.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isClose = /^<\//.test(line);
    const isSelfOrDecl = /\/>$/.test(line) || /^<[?!]/.test(line);
    const isOpenClose = /^<[^!?][^>]*>.*<\/[^>]+>$/.test(line); // <a>text</a> on one line
    if (isClose) depth = Math.max(0, depth - 1);
    out.push("  ".repeat(depth) + line);
    if (!isClose && !isSelfOrDecl && !isOpenClose && /^<[^!?]/.test(line)) depth += 1;
  }
  return out.join("\n");
}
