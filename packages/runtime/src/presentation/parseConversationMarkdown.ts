import type { ConversationEntry } from '../../../core/src/conversations/Conversation.js';

const MAX_IMPORT_CHARACTERS = 1_000_000;
const MAX_ENTRIES = 500;

/**
 * Parses the Markdown produced by the conversation export (`## You` / `## Kova`
 * sections separated by `---`) back into conversation entries. Unknown or
 * oversized input is rejected; content is capped per section.
 */
export function parseConversationMarkdown(markdown: string): readonly ConversationEntry[] {
  if (markdown.length > MAX_IMPORT_CHARACTERS)
    throw new Error('Import exceeds 1,000,000 characters.');
  const normalized = markdown.replace(/\r\n/g, '\n');
  const sections = normalized.split(/\n---\n/);
  const entries: ConversationEntry[] = [];
  let turn = 0;
  for (const section of sections) {
    const match = /(?:^|\n)## (You|Kova)(?: · Partial response)?\n\n?/.exec(section);
    if (!match) continue;
    const role = match[1] === 'You' ? ('user' as const) : ('assistant' as const);
    const content = section.slice(match.index + match[0].length).trimEnd();
    if (!content) continue;
    if (entries.length >= MAX_ENTRIES) throw new Error('Import exceeds 500 messages.');
    turn++;
    entries.push({
      id: `imported-${turn}`,
      turnId: `imported-turn-${turn}`,
      stepId: null,
      message:
        role === 'user'
          ? { role, content: content.slice(0, 100_000) }
          : { role, content: content.slice(0, 100_000), toolCalls: [] },
      toolResultOrigin: null,
      omitted: false,
    });
  }
  if (!entries.length) throw new Error('No You/Kova sections found in the Markdown.');
  return entries;
}
