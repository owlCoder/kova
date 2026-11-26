import { randomUUID } from 'node:crypto';
import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import { parseConversationMarkdown } from '../../../runtime/src/presentation/parseConversationMarkdown.js';
import type { ConversationLifecycleHost } from './conversationLifecycle.js';
import { openStoredConversation } from './conversationLifecycle.js';

export interface ImportConversationDeps {
  readonly repository: ConversationRepository;
  readonly lifecycle: ConversationLifecycleHost;
  readonly workspaceId: () => string | null;
  readonly snapshot: (requestId: string) => Promise<void>;
}

/** Parses exported conversation Markdown and opens it as the active conversation. */
export async function importConversationMarkdown(
  deps: ImportConversationDeps,
  markdown: string,
): Promise<void> {
  const entries = parseConversationMarkdown(markdown);
  const id = randomUUID();
  await deps.repository.save({
    id,
    workspaceId: deps.workspaceId() ?? '',
    entries,
    summary: null,
  });
  await openStoredConversation(deps.lifecycle, id);
  await deps.snapshot('imported');
}
