import type { Memento } from 'vscode';
import type {
  Conversation,
  ConversationEntry,
} from '../../../core/src/conversations/Conversation.js';
import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import type { ConversationSummary } from '../../../core/src/conversations/ConversationSummary.js';

const STORAGE_KEY = 'kova.conversations';
const MAX_CONVERSATIONS = 50;
const MAX_ENTRIES = 200;
const MAX_STORED_BYTES = 3_000_000;

export interface ConversationHistoryEntry {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
}

interface StoredConversation extends ConversationHistoryEntry {
  readonly workspaceId: string;
  readonly entries: readonly ConversationEntry[];
  readonly summary: ConversationSummary | null;
}

interface StoredShape {
  readonly version: 1;
  readonly conversations: readonly StoredConversation[];
}

/** First user message becomes the history title, like the chat header. */
function deriveTitle(entries: readonly ConversationEntry[]): string {
  const first = entries.find((entry) => entry.message.role === 'user')?.message.content.trim();
  if (!first) return 'New conversation';
  const line = first.split('\n')[0]!;
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

/**
 * Conversation repository persisted in workspace storage, so the launcher
 * can list past conversations and any of them can be reopened. Writes are
 * bounded (count, entries per conversation, total size) and serialized by
 * the caller awaiting save().
 */
export class WorkspaceConversationRepository implements ConversationRepository {
  private cache: Map<string, StoredConversation> | null = null;
  private write: Promise<void> = Promise.resolve();
  constructor(private readonly state: Memento) {}

  private async load(): Promise<Map<string, StoredConversation>> {
    if (!this.cache) {
      const raw = this.state.get<unknown>(STORAGE_KEY);
      const conversations =
        raw && typeof raw === 'object' && Array.isArray((raw as StoredShape).conversations)
          ? (raw as StoredShape).conversations
          : [];
      this.cache = new Map(conversations.map((item) => [item.id, item]));
    }
    return this.cache;
  }

  async get(id: string): Promise<Conversation | null> {
    const stored = (await this.load()).get(id);
    if (!stored) return null;
    return {
      id: stored.id,
      workspaceId: stored.workspaceId,
      entries: stored.entries,
      summary: stored.summary,
    };
  }

  async save(conversation: Conversation): Promise<void> {
    const cache = await this.load();
    const stored: StoredConversation = {
      id: conversation.id,
      title: deriveTitle(conversation.entries),
      updatedAt: Date.now(),
      workspaceId: conversation.workspaceId,
      entries: conversation.entries.slice(-MAX_ENTRIES),
      summary: conversation.summary,
    };
    cache.set(stored.id, stored);
    // Bound the store: newest first, capped count, then capped total size.
    const all = [...cache.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    while (all.length > MAX_CONVERSATIONS) cache.delete(all.pop()!.id);
    let conversations = all.slice(0, MAX_CONVERSATIONS);
    while (
      JSON.stringify({ version: 1, conversations }).length > MAX_STORED_BYTES &&
      conversations.length > 1
    ) {
      const dropped = conversations[conversations.length - 1]!;
      cache.delete(dropped.id);
      conversations = conversations.slice(0, -1);
    }
    const shape: StoredShape = { version: 1, conversations };
    const snapshot = shape;
    this.write = this.write.then(() => this.state.update(STORAGE_KEY, snapshot));
    await this.write;
  }

  async remove(id: string): Promise<void> {
    const cache = await this.load();
    if (!cache.delete(id)) return;
    const snapshot: StoredShape = {
      version: 1,
      conversations: [...cache.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    };
    this.write = this.write.then(() => this.state.update(STORAGE_KEY, snapshot));
    await this.write;
  }

  /** History for the launcher, newest first. */
  async list(): Promise<ConversationHistoryEntry[]> {
    const cache = await this.load();
    return [...cache.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt }));
  }
}
