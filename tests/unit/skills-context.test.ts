import { describe, expect, it } from 'vitest';
import { SkillLoader } from '../../packages/core/src/skills/SkillLoader.js';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { ChatAgent } from '../../packages/core/src/agents/ChatAgent.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import { ContextBuilder } from '../../packages/core/src/context/ContextBuilder.js';
import { ConversationCompactor } from '../../packages/core/src/conversations/ConversationCompactor.js';
import type { ConversationEntry } from '../../packages/core/src/conversations/Conversation.js';
import type { ContextBuildRequest } from '../../packages/core/src/context/ContextBuildRequest.js';
import type { ChatRequest } from '../../packages/core/src/providers/ChatRequest.js';

const raw =
  '---\nname: review\ndescription: "Review code: architecture and tests"\n---\nSELECTED PROCEDURE';
const loader = new SkillLoader({
  async discover() {
    return [];
  },
  async read() {
    return raw;
  },
});
describe('explicit safe skills', () => {
  it('accepts quoted descriptions and loads only the body', async () => {
    const result = await loader.load('root', 'review', new CancellationSource());
    expect(result.instructions).toBe('SELECTED PROCEDURE');
    expect(result.metadata.description).toBe('Review code: architecture and tests');
  });
  it.each([
    'No frontmatter',
    raw.replace('name: review', 'name: another'),
    raw.replace('description:', 'execute:'),
    raw.replace('description:', 'name: review\ndescription:'),
    raw.replace('"Review code: architecture and tests"', '""'),
    raw.replace('"Review code: architecture and tests"', '!!js/function unsafe'),
    raw + 'x'.repeat(16000),
  ])('rejects invalid frontmatter or size', (body) => {
    expect(() => loader.metadata('review', body)).toThrow();
  });
  it('loads one explicitly selected skill; clearing selection removes it from context', async () => {
    let reads = 0;
    const captured: ChatRequest[] = [];
    const selected = new SkillLoader({
      async discover() {
        return [];
      },
      async read() {
        reads++;
        return raw;
      },
    });
    const agent = new ChatAgent(
      {
        async *streamChat(request) {
          captured.push(request);
          yield { type: 'TextDelta', text: 'answer' };
          yield { type: 'Finished', reason: 'Complete', usage: null };
        },
      },
      new InMemoryConversationRepository(),
      new TokenCounter(),
      null,
      selected,
    );
    const request = {
      runId: 'a',
      conversationId: 'c',
      workspaceId: 'root',
      prompt: 'review',
      modelId: 'local',
      mode: 'Plan' as const,
      activeSkillId: 'review',
      context: {
        maxTokens: 8192,
        reservedOutputTokens: 1024,
        safetyMarginRatio: 0.1,
        maxToolOutputCharacters: 8000,
      },
      attachments: [],
      thinkingEnabled: false,
      keepAliveSeconds: 300,
      maxToolIterations: 10,
      commandAllowlist: [],
      toolsEnabled: false,
    };
    await agent.run(request, new CancellationSource(), { emit() {} });
    await agent.run({ ...request, runId: 'b', activeSkillId: null }, new CancellationSource(), {
      emit() {},
    });
    expect(reads).toBe(1);
    expect(captured[0]?.messages[0]?.content).toContain('SELECTED PROCEDURE');
    expect(JSON.stringify(captured[1])).not.toContain('SELECTED PROCEDURE');
  });
});
const entry = (
  id: string,
  turnId: string,
  stepId: string | null,
  message: ConversationEntry['message'],
): ConversationEntry => ({ id, turnId, stepId, message, omitted: false, toolResultOrigin: null });
const baseline: ContextBuildRequest = {
  systemInstructions: 'SYSTEM',
  tools: [],
  activeSkill: null,
  currentUserMessageId: 'current',
  currentStepId: 'step',
  settings: {
    maxTokens: 2048,
    reservedOutputTokens: 256,
    safetyMarginRatio: 0.1,
    maxToolOutputCharacters: 8000,
  },
  attachments: [],
  conversation: {
    id: 'c',
    workspaceId: '',
    summary: null,
    entries: [entry('current', 'now', null, { role: 'user', content: 'CURRENT' })],
  },
};
describe('context eviction safety', () => {
  it('shrinks multibyte attachments to fit without truncating the user or selected skill', () => {
    const result = new ContextBuilder(new TokenCounter()).build({
      ...baseline,
      activeSkill: {
        metadata: { id: 'review', name: 'review', description: '', relativePath: '' },
        instructions: 'PINNED SKILL',
      },
      attachments: [
        {
          id: 'file',
          source: 'ExplicitFile',
          label: 'a.cs',
          content: JSON.stringify({
            status: 'Error',
            output: '漢字'.repeat(5000),
            error: { code: 'FixtureError', message: 'Retain this reason' },
          }),
        },
      ],
    });
    expect(result.status).toBe('Ready');
    if (result.status !== 'Ready') return;
    expect(result.usage.estimatedInputTokens).toBeLessThanOrEqual(result.usage.inputBudgetTokens);
    expect(JSON.stringify(result.messages)).toContain('CURRENT');
    expect(result.messages[0]?.content).toContain('PINNED SKILL');
    expect(JSON.stringify(result.messages)).toContain('omitted');
  });
  it('preserves native call/result pairs for multiple current-step results while shrinking payloads', () => {
    const calls = [
      { id: 'one', name: 'read_file', arguments: { path: 'one' } },
      { id: 'two', name: 'read_file', arguments: { path: 'two' } },
    ];
    const result = new ContextBuilder(new TokenCounter()).build({
      ...baseline,
      conversation: {
        ...baseline.conversation,
        entries: [
          ...baseline.conversation.entries,
          entry('assistant', 'now', 'step', { role: 'assistant', content: '', toolCalls: calls }),
          ...calls.map((call) =>
            entry(call.id + '-result', 'now', 'step', {
              role: 'tool',
              callId: call.id,
              toolName: call.name,
              content: JSON.stringify({
                status: 'Error',
                output: '漢字'.repeat(5000),
                error: { code: 'FixtureError', message: 'Retain this reason' },
              }),
            }),
          ),
        ],
      },
    });
    expect(result.status).toBe('Ready');
    if (result.status !== 'Ready') return;
    expect(
      result.messages
        .filter((message) => message.role === 'tool')
        .map((message) => (message.role === 'tool' ? message.callId : '')),
    ).toEqual(['one', 'two']);
    for (const message of result.messages.filter((message) => message.role === 'tool'))
      expect(JSON.parse(message.content)).toMatchObject({
        status: 'Error',
        error: { code: 'FixtureError', message: 'Retain this reason' },
      });
    expect(
      result.messages.some(
        (message) => message.role === 'assistant' && message.toolCalls.length === 2,
      ),
    ).toBe(true);
  });
  it('records inspected/changed files only from successful paired tool results during compaction', () => {
    const calls = [
      { id: 'read', name: 'read_file', arguments: { path: 'a.cs' } },
      { id: 'denied', name: 'write_file', arguments: { path: 'secret.cs' } },
      { id: 'edit', name: 'edit_file', arguments: { path: 'b.cs' } },
    ];
    const entries = [
      entry('assistant', 'old', 's', { role: 'assistant', content: '', toolCalls: calls }),
      ...calls.map((call) =>
        entry(call.id + '-result', 'old', 's', {
          role: 'tool',
          callId: call.id,
          toolName: call.name,
          content: JSON.stringify({ status: call.id === 'denied' ? 'Denied' : 'Success' }),
        }),
      ),
    ];
    const summary = new ConversationCompactor(new TokenCounter()).compact(entries, null, 768);
    expect(summary.filesInspected).toEqual(['a.cs']);
    expect(summary.changes).toEqual(['edit_file: b.cs']);
    expect(JSON.stringify(summary)).not.toContain('secret.cs');
  });
});
