const DEFAULT_MAX_LINES = 200;
const DEFAULT_MAX_CHARS = 12_000;

/** Caps file text for an approval preview, keeping the head of the file. */
export function capDiffText(
  text: string,
  maxLines = DEFAULT_MAX_LINES,
  maxChars = DEFAULT_MAX_CHARS,
): { text: string; truncated: boolean } {
  const lines = text.split('\n');
  let truncated = lines.length > maxLines;
  let capped = truncated ? lines.slice(0, maxLines).join('\n') : text;
  if (capped.length > maxChars) {
    capped = capped.slice(0, maxChars);
    truncated = true;
  }
  return { text: capped, truncated };
}
