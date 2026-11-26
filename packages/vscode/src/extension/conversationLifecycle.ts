import { randomUUID } from 'node:crypto';

/** Narrow view of ChatSession used to reset/reopen conversations. */
export interface ConversationLifecycleHost {
  readonly activeRun: () => { readonly task: Promise<void> } | null;
  readonly conversationId: () => string;
  cancelRun(): void;
  forgetConversation(id: string): void;
  clearAttachments(): void;
  clearDraft(): Promise<void>;
  resetTransientState(): void;
  setConversationId(id: string): void;
  hasConversation(id: string): Promise<boolean>;
  snapshot(requestId: string): Promise<void>;
}

/**
 * Cancels any active run, keeps the old conversation stored for the launcher,
 * and resets the session to a fresh conversation.
 */
export async function resetConversation(host: ConversationLifecycleHost): Promise<void> {
  const active = host.activeRun();
  host.cancelRun();
  await active?.task;
  // The previous conversation stays in the repository so the launcher can list it.
  host.forgetConversation(host.conversationId());
  host.clearAttachments();
  await host.clearDraft();
  host.resetTransientState();
  host.setConversationId(randomUUID());
}

/** Reopens a stored conversation; the next snapshot shows its messages. */
export async function openStoredConversation(
  host: ConversationLifecycleHost,
  id: string,
): Promise<void> {
  if (id === host.conversationId()) return;
  if (host.activeRun() || !(await host.hasConversation(id)))
    throw new Error('Unknown conversation.');
  await resetConversation(host);
  host.setConversationId(id);
  await host.snapshot('open-conversation');
}
