import type { Conversation } from './Conversation.js';

/** v1 implementation is in-memory; exactly one writer per conversation. */
export interface ConversationRepository {
  get(id: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
  remove(id: string): Promise<void>;
}
