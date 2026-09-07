/**
 * Parse a Beyond Compare XML folder report into a readable summary.
 *
 * BC5 writes `<filecomp status="same|diff|left|right|newer|older">` entries with
 * nested `<lt>`/`<rt>` blocks, and `<foldercomp>` entries for directories. A folder
 * that appears on one side only has just one of the two blocks.
 *
 * The parser is regex-based on purpose. The reports are machine-written by a single
 * producer with a fixed shape, and adding an XML parser to a server whose job is to
 * shell out to a comparison tool buys nothing it does not already have.
 */

/** Maximum difference lines kept before the list is truncated. */
const MAX_LINES = 200;

/**
 * Summarise an XML folder report.
 *
 * Returns the input unchanged when it is empty or is the placeholder written when a
 * report file could not be read -- both mean "there is nothing to parse", and
 * rewriting them would hide the reason from the caller.
 */
export function parseXmlReport(xml: string): string {
  if (!xml || xml.startsWith("(Could not read")) return xml;

  const lines: string[] = [];
  let same = 0;
  let diff = 0;
  let leftOnly = 0;
  let rightOnly = 0;

  for (const match of xml.matchAll(
    /<filecomp\s+status="([^"]*)">([\s\S]*?)<\/filecomp>/g,
  )) {
    const status = match[1] ?? "";
    const inner = match[2] ?? "";

    const ltName = inner.match(/<lt>[\s\S]*?<name>([^<]*)<\/name>/);
    const rtName = inner.match(/<rt>[\s\S]*?<name>([^<]*)<\/name>/);
    const name = ltName?.[1] || rtName?.[1] || "unknown";

    if (status === "same") {
      same++;
    } else if (status === "diff" || status === "newer" || status === "older") {
      diff++;
      lines.push(`  DIFF: ${name} (${status})`);
    } else if (status === "left") {
      leftOnly++;
      lines.push(`  LEFT ONLY: ${name}`);
    } else if (status === "right") {
      rightOnly++;
      lines.push(`  RIGHT ONLY: ${name}`);
    } else {
      // An unrecognised status counts as a difference. Dropping it would silently
      // shrink the diff, which is the one direction this report must never err in.
      diff++;
      lines.push(`  ${status.toUpperCase()}: ${name}`);
    }
  }

  for (const match of xml.matchAll(/<foldercomp>([\s\S]*?)<\/foldercomp>/g)) {
    const inner = match[1] ?? "";
    const hasLt = /<lt>/.test(inner);
    const hasRt = /<rt>/.test(inner);
    if (hasLt === hasRt) continue; // present on both sides, or on neither

    const side = hasLt ? "LEFT" : "RIGHT";
    const nameMatch = inner.match(
      hasLt ? /<lt>[\s\S]*?<name>([^<]*)<\/name>/ : /<rt>[\s\S]*?<name>([^<]*)<\/name>/,
    );
    if (!nameMatch) continue;

    if (hasLt) leftOnly++;
    else rightOnly++;
    lines.push(`  ${side} ONLY (folder): ${nameMatch[1]}`);
  }

  const summary = [
    `Summary: ${same} same, ${diff} different, ${leftOnly} left-only, ${rightOnly} right-only`,
  ];

  if (lines.length > 0) {
    summary.push("", "Differences:");
    if (lines.length > MAX_LINES) {
      summary.push(...lines.slice(0, MAX_LINES), `  ... and ${lines.length - MAX_LINES} more`);
    } else {
      summary.push(...lines);
    }
  }

  return summary.join("\n");
}
