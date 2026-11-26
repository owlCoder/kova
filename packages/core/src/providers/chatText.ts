/** Plain-text view of message content; image parts count as a fixed marker. */
export function chatText(content: string | readonly unknown[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      const record = part as Record<string, unknown>;
      return record['type'] === 'image_url' ? '[image]' : String(record['text'] ?? '');
    })
    .join('\n');
}
