import { describe, expect, it } from 'vitest';
import type { Memento } from 'vscode';
import type { Conversation } from '../../packages/core/src/conversations/Conversation.js';
import type { ConversationEntry } from '../../packages/core/src/conversations/Conversation.js';
import { WorkspaceConversationRepository } from '../../packages/vscode/src/extension/conversationStore.js';

const fakeMemento = () => {
  const values = new Map<string, unknown>();
  const state = {
    get: (key: string, fallback?: unknown) => values.get(key) ?? fallback,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  } as unknown as Memento;
  return { state, values };
};

const entry = (content: string): ConversationEntry => ({
  id: `entry-${content.length}-${content.slice(0, 4)}`,
  turnId: 'turn-1',
  stepId: null,
  message: { role: 'user', content },
  toolResultOrigin: null,
  omitted: false,
});

const conversation = (id: string, entries: readonly ConversationEntry[]): Conversation => ({
  id,
  workspaceId: '/workspace',
  entries,
  summary: null,
});

describe('workspace conversation store', () => {
  it('round-trips a conversation and derives the title from the first user message', async () => {
    const { state } = fakeMemento();
    const repo = new WorkspaceConversationRepository(state);
    await repo.save(conversation('123e4567-e89b-42d3-a456-426614174000', [entry('Hello Kova')]));
    const restored = await new WorkspaceConversationRepository(state).get(
      '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(restored?.entries[0]?.message.content).toBe('Hello Kova');
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Hello Kova');
    expect(list[0]?.updatedAt).toBeGreaterThan(0);
  });

  it('falls back to a default title and truncates long first lines', async () => {
    const { state } = fakeMemento();
    const repo = new WorkspaceConversationRepository(state);
    await repo.save(
      conversation('123e4567-e89b-42d3-a456-426614174000', [
        { ...entry('x'), message: { role: 'assistant', content: '', toolCalls: [] } },
      ]),
    );
    expect((await repo.list())[0]?.title).toBe('New conversation');
    const long = 'x'.repeat(100);
    await repo.save(conversation('123e4567-e89b-42d3-a456-426614174001', [entry(long)]));
    const title = (await repo.list()).find(
      (item) => item.id === '123e4567-e89b-42d3-a456-426614174001',
    )?.title;
    expect(title).toHaveLength(58);
    expect(title?.endsWith('…')).toBe(true);
  });

  it('lists newest first and keeps at most 50 conversations', async () => {
    const { state } = fakeMemento();
    const repo = new WorkspaceConversationRepository(state);
    for (let index = 0; index < 51; index += 1) {
      const id = `123e4567-e89b-42d3-a456-4266141740${String(index).padStart(2, '0')}`;
      await repo.save(conversation(id, [entry(`Prompt ${index}`)]));
      // Distinct timestamps keep the newest-first order deterministic.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const list = await repo.list();
    expect(list).toHaveLength(50);
    expect(list[0]?.title).toBe('Prompt 50');
    expect(await repo.get('123e4567-e89b-42d3-a456-426614174000')).toBeNull();
  });

  it('trims stored entries to the newest 200 per conversation', async () => {
    const { state } = fakeMemento();
    const repo = new WorkspaceConversationRepository(state);
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const entries = Array.from({ length: 250 }, (_, index) => entry(`Message ${index}`));
    await repo.save(conversation(id, entries));
    const restored = await repo.get(id);
    expect(restored?.entries).toHaveLength(200);
    expect(restored?.entries[0]?.message.content).toBe('Message 50');
  });

  it('removes a conversation and survives corrupted storage', async () => {
    const { state, values } = fakeMemento();
    const repo = new WorkspaceConversationRepository(state);
    const id = '123e4567-e89b-42d3-a456-426614174000';
    await repo.save(conversation(id, [entry('Bye')]));
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
    expect(await repo.list()).toHaveLength(0);
    values.set('kova.conversations', { version: 1, conversations: 'broken' });
    const fresh = new WorkspaceConversationRepository(state);
    expect(await fresh.list()).toHaveLength(0);
  });
});

describe('conversation rename', () => {
  it('stores a custom title and falls back to the derived one for blanks', async () => {
    const memento = new Map<string, unknown>();
    const repo = new WorkspaceConversationRepository({
      get: (key: string) => memento.get(key),
      update: async (key: string, value: unknown) => {
        memento.set(key, value);
      },
    } as never);
    const id = '123e4567-e89b-42d3-a456-426614174000';
    await repo.save({
      id,
      workspaceId: '/w',
      entries: [
        {
          id: 'e1',
          turnId: 't',
          stepId: null,
          message: { role: 'user', content: 'first prompt line' },
          toolResultOrigin: null,
          omitted: false,
        },
      ],
      summary: null,
    });
    expect((await repo.list())[0]?.title).toBe('first prompt line');
    await repo.rename(id, '  My chat  ');
    expect((await repo.list())[0]?.title).toBe('My chat');
    await repo.rename(id, '   ');
    expect((await repo.list())[0]?.title).toBe('My chat');
    await expect(repo.rename('223e4567-e89b-42d3-a456-426614174000', 'x')).rejects.toThrow(
      'Unknown conversation',
    );
  });
});
