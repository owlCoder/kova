import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';

/** Current conversation only; newest first, with exact duplicates removed and a small UI bound. */
export function recentPrompts(messages: SessionSnapshot['messages'] = []): readonly string[] {
  const seen = new Set<string>();
  for (let index = messages.length - 1; index >= 0 && seen.size < 12; index--) {
    const message = messages[index]!;
    if (message.role === 'user' && message.content.trim() && message.content.length <= 16_000)
      seen.add(message.content);
  }
  return [...seen];
}
