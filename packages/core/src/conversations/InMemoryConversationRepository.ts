import type { Conversation } from './Conversation.js';
import type { ConversationRepository } from './ConversationRepository.js';

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly conversations = new Map<string, Conversation>();
  async get(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }
  async save(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }
  async remove(id: string): Promise<void> {
    this.conversations.delete(id);
  }
}
