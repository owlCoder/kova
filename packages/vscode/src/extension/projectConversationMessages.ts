import type { ConversationEntry } from '../../../core/src/conversations/Conversation.js';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';

export function projectConversationMessages(
  entries: readonly ConversationEntry[],
  partial: boolean,
  activeRun: { readonly id: string; readonly prompt: string } | null,
  streamingResponse: SessionSnapshot['messages'][number] | null,
): SessionSnapshot['messages'] {
  const messages = entries
    .filter(
      (entry) =>
        entry.message.role !== 'tool' &&
        entry.message.role !== 'system' &&
        !entry.id.endsWith('-repair'),
    )
    .map((entry, index, all) => ({
      id: entry.id,
      role: entry.message.role as 'user' | 'assistant',
      content: entry.message.content,
      partial: partial && index === all.length - 1,
    }));
  if (activeRun && !messages.some((message) => message.id === `${activeRun.id}-user`))
    messages.push({
      id: `${activeRun.id}-user`,
      role: 'user',
      content: activeRun.prompt,
      partial: false,
    });
  if (streamingResponse) {
    const response = { ...streamingResponse, partial: streamingResponse.partial || partial };
    const index = messages.findIndex((message) => message.id === response.id);
    if (index === -1) messages.push(response);
    else messages[index] = response;
  }
  return messages;
}
