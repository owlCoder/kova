/** Literal Unicode-aware matching preserves original UTF-16 offsets for DOM ranges. */
export function findTextMatches(
  text: string,
  query: string,
  limit = 500,
): readonly { start: number; end: number }[] {
  const term = query.trim().slice(0, 128);
  if (!term || limit < 1) return [];
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const matches = [];
  for (const match of text.matchAll(pattern)) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (matches.length >= limit) break;
  }
  return matches;
}
