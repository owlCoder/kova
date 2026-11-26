export type TranscriptShortcut =
  | { readonly type: 'focusMessage'; readonly direction: 1 | -1 }
  | { readonly type: 'editLastUserMessage' }
  | { readonly type: 'resendLastUserMessage' };

/** Maps a plain key press outside editable fields to a transcript action. */
export function transcriptShortcut(key: string, editable: boolean): TranscriptShortcut | null {
  if (editable) return null;
  if (key === 'ArrowDown') return { type: 'focusMessage', direction: 1 };
  if (key === 'ArrowUp') return { type: 'focusMessage', direction: -1 };
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower === 'e') return { type: 'editLastUserMessage' };
  if (lower === 'r') return { type: 'resendLastUserMessage' };
  return null;
}

/** True when the event target is a text field, so plain keys keep typing. */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false;
  return Boolean(
    (target as { closest(selector: string): unknown }).closest(
      'textarea, input, select, [contenteditable="true"]',
    ),
  );
}

/** Index of the message to focus when navigating with arrows; -1 when there are none. */
export function nextMessageIndex(current: number, direction: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current === -1) return direction === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + direction));
}
