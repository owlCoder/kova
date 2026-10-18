import { describe, expect, it } from 'vitest';
import { findTextMatches } from '../../webview/src/components/findTextMatches.js';
import { conversationMarkdown } from '../../packages/runtime/src/presentation/conversationMarkdown.js';
import { projectConversationMessages } from '../../packages/runtime/src/presentation/projectConversationMessages.js';
import { validateMessage } from '../../packages/runtime/src/presentation/validateMessage.js';
import type { ConversationEntry } from '../../packages/core/src/conversations/Conversation.js';

const id = '11111111-1111-4111-8111-111111111111';
describe('conversation find and export', () => {
  it('matches literal patterns, mixed case, Unicode and emoji at original DOM offsets', () => {
    const text = '🙂 čitaj A+B [x] ČITAJ a+b';
    expect(findTextMatches(text, 'a+b')).toEqual([
      { start: 9, end: 12 },
      { start: 23, end: 26 },
    ]);
    expect(findTextMatches(text, '[x]')).toEqual([{ start: 13, end: 16 }]);
    expect(findTextMatches('İ i 🙂 i', 'i')).toEqual([
      { start: 2, end: 3 },
      { start: 7, end: 8 },
    ]);
    expect(findTextMatches(text, 'čitaj')).toHaveLength(2);
    expect(findTextMatches(text, '🙂')).toEqual([{ start: 0, end: 2 }]);
  });
  it('bounds large match sets and does not search empty queries', () => {
    expect(findTextMatches('a '.repeat(10000), 'a')).toHaveLength(500);
    expect(findTextMatches('a '.repeat(10000), 'a', 3)).toHaveLength(3);
    expect(findTextMatches('a', ' ')).toEqual([]);
  });
  it('exports visible text and code exactly, excluding tool/system/repair entries', () => {
    const entries = [
      ['system', 'system', 'private instructions'],
      ['u', 'user', 'Explain this code'],
      ['tool', 'tool', 'private tool payload'],
      ['r-repair', 'user', 'internal repair'],
      ['a', 'assistant', '    const answer = 42;\n\n**Done.**'],
    ].map(([id, role, content]) => ({
      id,
      turnId: 'r',
      stepId: null,
      message: { role, content },
      toolResultOrigin: null,
      omitted: false,
    })) as ConversationEntry[];
    const result = conversationMarkdown(projectConversationMessages(entries, true, null, null), {
      provider: 'Local\nInjected header',
      model: 'test-model',
    });
    expect(result).toContain('## Kova · Partial response\n\n    const answer = 42;');
    expect(result).toContain('Provider at export: Local Injected header');
    expect(result).not.toMatch(/private|internal repair/);
    expect(() => conversationMarkdown([], { provider: '', model: '' })).toThrow('no messages');
  });
  it('validates draft/export scope and rejects forged content or destination paths', () => {
    const envelope = { protocolVersion: 1, requestId: 'test', conversationId: id };
    expect(validateMessage({ ...envelope, type: 'UpdateDraft', prompt: '' }).type).toBe(
      'UpdateDraft',
    );
    expect(validateMessage({ ...envelope, type: 'ExportConversation', action: 'save' }).type).toBe(
      'ExportConversation',
    );
    for (const intent of [
      { type: 'UpdateDraft', prompt: 'a'.repeat(16001) },
      { type: 'UpdateDraft', prompt: 'draft', conversationId: '../escape' },
      { type: 'ExportConversation', action: 'save', path: '/tmp/forged' },
      { type: 'ExportConversation', action: 'copy', content: 'forged transcript' },
      { type: 'ExportConversation', action: 'execute' },
    ])
      expect(() => validateMessage({ ...envelope, ...intent })).toThrow();
  });
});
