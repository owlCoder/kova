import { describe, expect, it } from 'vitest';
import { expandPlaceholders } from '../../packages/runtime/src/presentation/expandPlaceholders.js';
import { parseConversationMarkdown } from '../../packages/runtime/src/presentation/parseConversationMarkdown.js';
import { conversationMarkdown } from '../../packages/runtime/src/presentation/conversationMarkdown.js';
import { validateMessage } from '../../packages/runtime/src/presentation/validateMessage.js';

describe('prompt placeholders', () => {
  it('expands {selection} and {file}, caps selection and leaves plain prompts alone', () => {
    expect(expandPlaceholders('no placeholders', null)).toBe('no placeholders');
    expect(
      expandPlaceholders('Fix {selection} in {file}', { text: 'int x = 1;', label: 'src/a.ts' }),
    ).toBe('Fix int x = 1; in src/a.ts');
    expect(expandPlaceholders('Fix {selection}', null)).toBe('Fix ');
    const big = 'x'.repeat(60_000);
    expect(expandPlaceholders('{selection}', { text: big, label: 'f' }).length).toBeLessThanOrEqual(
      50_000,
    );
  });
});

describe('conversation markdown import', () => {
  it('round-trips an export through the parser', () => {
    const markdown = conversationMarkdown(
      [
        { id: '1', role: 'user', content: 'Hello there', partial: false },
        { id: '2', role: 'assistant', content: 'Čao! How can I help?', partial: false },
      ],
      { provider: 'Ollama (local)', model: 'qwen3:0.6b' },
    );
    const entries = parseConversationMarkdown(markdown);
    expect(entries.map((e) => [e.message.role, e.message.content])).toEqual([
      ['user', 'Hello there'],
      ['assistant', 'Čao! How can I help?'],
    ]);
  });

  it('rejects oversized, empty and section-less input', () => {
    expect(() => parseConversationMarkdown('x'.repeat(1_000_001))).toThrow('1,000,000');
    expect(() => parseConversationMarkdown('# nothing here')).toThrow('No You/Kova');
    expect(() => parseConversationMarkdown('## You\n\n\n---\n\n## Kova\n\n\n')).toThrow();
  });

  it('is accepted by protocol validation with a bounded size', () => {
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'ImportConversation',
        markdown: '## You\n\nhi\n',
      }).type,
    ).toBe('ImportConversation');
    expect(() =>
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'ImportConversation',
        markdown: 'x'.repeat(1_000_001),
      }),
    ).toThrow();
  });
});
