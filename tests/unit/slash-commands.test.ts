import { describe, expect, it } from 'vitest';
import { matchSlashCommands, slashCommands } from '../../webview/src/components/slashCommands.js';
import { compactConversation } from '../../packages/vscode/src/extension/compactConversation.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import type { ConversationEntry } from '../../packages/core/src/conversations/Conversation.js';

const entry = (id: string, role: 'user' | 'assistant', content: string): ConversationEntry => ({
  id,
  turnId: `turn-${id}`,
  stepId: null,
  message: {
    role,
    content,
    ...(role === 'assistant' ? { toolCalls: [] } : {}),
  } as ConversationEntry['message'],
  toolResultOrigin: null,
  omitted: false,
});

describe('slash commands', () => {
  it('lists all commands for a bare slash and filters by prefix with exact match first', () => {
    expect(matchSlashCommands('')).toEqual([]);
    expect(matchSlashCommands('hello')).toEqual([]);
    expect(matchSlashCommands('/')).toHaveLength(slashCommands.length);
    expect(matchSlashCommands('/c').map((command) => command.command)).toEqual([
      '/clear',
      '/compact',
      '/copy',
      '/context',
    ]);
    expect(matchSlashCommands('/clear').map((command) => command.id)).toEqual(['clear']);
    expect(matchSlashCommands('/clear now').map((command) => command.id)).toEqual(['clear']);
    expect(matchSlashCommands('/nope')).toEqual([]);
  });

  it('compacts older entries into a summary and keeps the recent ones', async () => {
    const repository = new InMemoryConversationRepository();
    await repository.save({
      id: 'c1',
      workspaceId: 'w',
      entries: Array.from({ length: 10 }, (_, i) =>
        entry(`e${i}`, i % 2 ? 'assistant' : 'user', `msg ${i}`),
      ),
      summary: null,
    });
    expect(await compactConversation(repository, 'c1')).toBe(true);
    const compacted = await repository.get('c1');
    expect(compacted?.entries.map((item) => item.id)).toEqual(['e6', 'e7', 'e8', 'e9']);
    expect(compacted?.summary?.goal).toContain('msg 0');
    expect(compacted?.summary?.throughTurnId).toBe('turn-e5');
  });

  it('reports nothing to compact for short or missing conversations', async () => {
    const repository = new InMemoryConversationRepository();
    await repository.save({
      id: 'c2',
      workspaceId: 'w',
      entries: [entry('a', 'user', 'hi'), entry('b', 'assistant', 'hello')],
      summary: null,
    });
    expect(await compactConversation(repository, 'c2')).toBe(false);
    expect(await compactConversation(repository, 'missing')).toBe(false);
    const untouched = await repository.get('c2');
    expect(untouched?.entries).toHaveLength(2);
    expect(untouched?.summary).toBeNull();
  });
});
