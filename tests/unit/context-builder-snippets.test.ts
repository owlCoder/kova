import { describe, expect, it } from 'vitest';
import { ContextBuilder } from '../../packages/core/src/context/ContextBuilder.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import type { IndexedSnippet } from '../../packages/core/src/indexing/CodeSymbol.js';

describe('ContextBuilder code snippets', () => {
  const builder = new ContextBuilder(new TokenCounter());

  it('includes relevant code snippets in built messages', () => {
    const snippets: readonly IndexedSnippet[] = [
      {
        id: 'snip-1',
        relativePath: 'packages/core/src/indexing/RelevanceRanker.ts',
        content: 'export class RelevanceRanker {}',
        startLine: 1,
        endLine: 15,
        symbolNames: ['RelevanceRanker'],
      },
    ];

    const result = builder.build({
      systemInstructions: 'You are a helpful coding assistant.',
      projectInstructions: null,
      tools: [],
      activeSkill: null,
      currentUserMessageId: 'msg-1',
      currentStepId: null,
      conversation: {
        id: 'conv-1',
        workspaceId: 'ws-1',
        summary: null,
        entries: [
          {
            id: 'msg-1',
            turnId: 'turn-1',
            stepId: null,
            toolResultOrigin: null,
            omitted: false,
            message: { role: 'user', content: 'How does RelevanceRanker work?' },
          },
        ],
      },
      attachments: [],
      imagesSupported: false,
      codeSnippets: snippets,
      settings: {
        maxTokens: 4096,
        reservedOutputTokens: 512,
        safetyMarginRatio: 0.1,
        maxToolOutputCharacters: 4000,
      },
    });

    expect(result.status).toBe('Ready');
    if (result.status === 'Ready') {
      const hasSnippetMessage = result.messages.some(
        (m) =>
          typeof m.content === 'string' &&
          m.content.includes('packages/core/src/indexing/RelevanceRanker.ts:1-15') &&
          m.content.includes('export class RelevanceRanker {}'),
      );
      expect(hasSnippetMessage).toBe(true);
    }
  });

  it('evicts lower-priority code snippets instead of overflowing when budget is tight', () => {
    const snippets: readonly IndexedSnippet[] = [
      {
        id: 'snip-1',
        relativePath: 'packages/core/src/indexing/RelevanceRanker.ts',
        content: 'export class RelevanceRanker {}',
        startLine: 1,
        endLine: 15,
        symbolNames: ['RelevanceRanker'],
      },
      {
        id: 'snip-2',
        relativePath: 'packages/core/src/indexing/CodeSymbol.ts',
        content: 'x'.repeat(2000),
        startLine: 16,
        endLine: 60,
        symbolNames: ['CodeSymbol'],
      },
    ];

    const result = builder.build({
      systemInstructions: 'You are a helpful coding assistant.',
      projectInstructions: null,
      tools: [],
      activeSkill: null,
      currentUserMessageId: 'msg-1',
      currentStepId: null,
      conversation: {
        id: 'conv-1',
        workspaceId: 'ws-1',
        summary: null,
        entries: [
          {
            id: 'msg-1',
            turnId: 'turn-1',
            stepId: null,
            toolResultOrigin: null,
            omitted: false,
            message: { role: 'user', content: 'Find ranking logic' },
          },
        ],
      },
      attachments: [],
      imagesSupported: false,
      codeSnippets: snippets,
      settings: {
        maxTokens: 600,
        reservedOutputTokens: 100,
        safetyMarginRatio: 0.1,
        maxToolOutputCharacters: 4000,
      },
    });

    expect(result.status).toBe('Ready');
    if (result.status === 'Ready') {
      expect(
        result.usage.evictions.some((item) =>
          item.label.startsWith('packages/core/src/indexing/CodeSymbol.ts:'),
        ),
      ).toBe(true);
      expect(result.usage.evictions.some((item) => item.action === 'Truncated')).toBe(true);
    }
  });
});
