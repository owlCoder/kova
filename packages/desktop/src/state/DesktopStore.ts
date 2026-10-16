import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Conversation } from '../../../core/src/conversations/Conversation.js';
import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import { BoundedTextFile } from '../../../runtime/src/adapters/BoundedTextFile.js';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { DesktopPreferences } from './DesktopPreferences.js';
import { defaultPreferences } from './DesktopPreferences.js';
import { parsePreferences } from './parsePreferences.js';
import { writeJson } from './writeJson.js';

type SessionInfo = {
  id: string;
  title: string;
  updatedAt: string;
  workspaceId: string;
  archived: boolean;
  partial: boolean;
};
type SavedSession = {
  conversation: Conversation;
  title: string;
  updatedAt: string;
  archived: boolean;
  partial: boolean;
};

/** Small metadata index at startup; conversation bodies are loaded lazily with an eight-session LRU. */
export class DesktopStore implements ConversationRepository {
  preferences: DesktopPreferences = structuredClone(defaultPreferences);
  private readonly sessions = new Map<string, SessionInfo>();
  private readonly cache = new Map<string, Conversation>();
  private queue = Promise.resolve();
  constructor(readonly directory: string) {}

  async load(): Promise<void> {
    try {
      this.preferences = parsePreferences(await this.read('settings.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Kova settings could not be read. Your data has been preserved.');
    }
    try {
      const index = await this.read('session-index.json');
      if (!Array.isArray(index)) throw new Error('Invalid index');
      for (const item of index)
        if (this.validInfo(item))
          this.sessions.set(item.id, { ...item, partial: Boolean(item.partial) });
    } catch {
      // Recover an older or interrupted index without deleting the underlying session files.
      const files = await readdir(join(this.directory, 'sessions')).catch(() => []);
      for (const file of files.filter((file) => /^[a-f0-9-]{36}\.json$/.test(file))) {
        try {
          const record = (await this.read(`sessions/${file}`)) as SavedSession;
          if (
            record.conversation?.id === file.slice(0, -5) &&
            Array.isArray(record.conversation.entries)
          ) {
            const info = this.info(record);
            if (this.validInfo(info)) this.sessions.set(info.id, info);
          }
        } catch {
          /* A damaged session does not prevent opening the other sessions. */
        }
      }
      if (this.sessions.size) await this.writeIndex();
    }
  }
  async updatePreferences(patch: Partial<DesktopPreferences>): Promise<void> {
    await this.persist(async () => {
      const next = parsePreferences({ ...this.preferences, ...patch });
      await writeJson(join(this.directory, 'settings.json'), next);
      this.preferences = next;
    });
  }
  async get(id: string): Promise<Conversation | null> {
    if (!this.sessions.has(id)) return null;
    const cached = this.cache.get(id);
    if (cached) {
      this.touch(cached);
      return structuredClone(cached);
    }
    const record = (await this.read(`sessions/${id}.json`)) as SavedSession;
    if (record.conversation?.id !== id || !Array.isArray(record.conversation.entries))
      throw new Error('This session could not be read. Its file has been preserved.');
    this.touch(record.conversation);
    return structuredClone(record.conversation);
  }
  async save(conversation: Conversation): Promise<void> {
    if (!/^[a-f0-9-]{36}$/.test(conversation.id)) throw new Error('Invalid session ID.');
    const copy = structuredClone(conversation);
    await this.persist(async () => {
      const previous = this.sessions.get(copy.id);
      const prompt = copy.entries.find((entry) => entry.message.role === 'user')?.message.content;
      const record: SavedSession = {
        conversation: copy,
        title:
          previous?.title && previous.title !== 'New session'
            ? previous.title
            : prompt?.replace(/\s+/g, ' ').slice(0, 72) || 'New session',
        updatedAt: new Date().toISOString(),
        archived: previous?.archived ?? false,
        partial: previous?.partial ?? false,
      };
      await writeJson(join(this.directory, 'sessions', `${copy.id}.json`), record);
      this.sessions.set(copy.id, this.info(record));
      this.touch(copy);
      await this.writeIndex();
    });
  }
  isPartial(id: string): boolean {
    return Boolean(this.sessions.get(id)?.partial);
  }
  async markPartial(id: string, partial: boolean): Promise<void> {
    if (this.sessions.has(id)) await this.updateSession(id, { partial });
  }
  async flush(): Promise<void> {
    await this.queue;
  }
  async remove(id: string): Promise<void> {
    await this.updateSession(id, { archived: true });
  }
  async rename(id: string, title: string): Promise<void> {
    await this.updateSession(id, { title: title.trim().slice(0, 72) || 'Untitled session' });
  }
  list() {
    return [...this.sessions.values()]
      .filter((record) => !record.archived)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 200)
      .map(({ id, title, updatedAt, workspaceId }) => ({ id, title, updatedAt, workspaceId }));
  }
  private async updateSession(
    id: string,
    patch: Partial<Pick<SessionInfo, 'title' | 'archived' | 'partial'>>,
  ): Promise<void> {
    await this.persist(async () => {
      const previous = this.sessions.get(id);
      if (!previous) throw new Error('Session not found.');
      const conversation = await this.get(id);
      if (!conversation) throw new Error('Session not found.');
      const next = { ...previous, ...patch };
      await writeJson(join(this.directory, 'sessions', `${id}.json`), {
        conversation,
        title: next.title,
        updatedAt: next.updatedAt,
        archived: next.archived,
        partial: next.partial,
      });
      this.sessions.set(id, next);
      await this.writeIndex();
    });
  }
  private info(record: SavedSession): SessionInfo {
    return {
      id: record.conversation.id,
      title: record.title,
      updatedAt: record.updatedAt,
      workspaceId: record.conversation.workspaceId,
      archived: Boolean(record.archived),
      partial: Boolean(record.partial),
    };
  }
  private validInfo(value: unknown): value is SessionInfo {
    if (!value || typeof value !== 'object') return false;
    const item = value as SessionInfo;
    return (
      typeof item.id === 'string' &&
      /^[a-f0-9-]{36}$/.test(item.id) &&
      typeof item.title === 'string' &&
      typeof item.updatedAt === 'string' &&
      typeof item.workspaceId === 'string' &&
      typeof item.archived === 'boolean'
    );
  }
  private touch(conversation: Conversation): void {
    this.cache.delete(conversation.id);
    this.cache.set(conversation.id, conversation);
    while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
  }
  private async read(path: string): Promise<unknown> {
    const { content } = await new BoundedTextFile().read(
      join(this.directory, path),
      new CancellationSource(),
      4_000_000,
    );
    return JSON.parse(content) as unknown;
  }
  private writeIndex(): Promise<void> {
    return writeJson(join(this.directory, 'session-index.json'), [...this.sessions.values()]);
  }
  private persist(write: () => Promise<void>): Promise<void> {
    const task = this.queue.then(write);
    this.queue = task.catch(() => {});
    return task;
  }
}
