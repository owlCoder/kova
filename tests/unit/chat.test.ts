import { describe, expect, it } from 'vitest';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { ChatAgent } from '../../packages/core/src/agents/ChatAgent.js';
import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';
import type { AgentRequest } from '../../packages/core/src/agents/AgentRequest.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import { ContextBuilder } from '../../packages/core/src/context/ContextBuilder.js';
import type { LlmProvider } from '../../packages/core/src/providers/LlmProvider.js';
import type { ChatRequest } from '../../packages/core/src/providers/ChatRequest.js';

const request: AgentRequest = {
  runId: 'run',
  conversationId: 'chat',
  workspaceId: '',
  prompt: 'Explain dependency inversion.',
  modelId: 'qwen3:4b',
  mode: 'Manual',
  activeSkillId: null,
  context: {
    maxTokens: 8192,
    reservedOutputTokens: 1024,
    safetyMarginRatio: 0.1,
    maxToolOutputCharacters: 8000,
  },
  attachments: [],
  thinkingEnabled: true,
  keepAliveSeconds: 300,
  toolsEnabled: false,
  imagesSupported: true,
  maxToolIterations: 10,
  commandAllowlist: [],
};

describe('image attachments in context', () => {
  it('sends image parts when the model supports vision and a text note otherwise', () => {
    const builder = new ContextBuilder(new TokenCounter());
    const attachment = {
      id: 'a1',
      source: 'ExplicitFile' as const,
      label: 'shot.png',
      content: '',
      image: { mimeType: 'image/png', base64: 'aGVsbG8=' },
    };
    const base = {
      systemInstructions: 'SYS',
      projectInstructions: null,
      tools: [],
      activeSkill: null,
      currentUserMessageId: 'u',
      currentStepId: null,
      settings: {
        maxTokens: 32768,
        reservedOutputTokens: 1024,
        safetyMarginRatio: 0.1,
        maxToolOutputCharacters: 8000,
      },
      conversation: { id: 'x', workspaceId: '', entries: [], summary: null },
    };
    const withVision = builder.build({
      ...base,
      attachments: [attachment],
      imagesSupported: true,
    });
    expect(withVision.status).toBe('Ready');
    const user =
      withVision.status === 'Ready' ? withVision.messages.find((m) => m.role === 'user') : null;
    expect(Array.isArray(user?.content)).toBe(true);
    if (user && Array.isArray(user.content)) {
      const imagePart = user.content.find((part) => part.type === 'image_url');
      expect(imagePart).toMatchObject({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aGVsbG8=' },
      });
    }
    const noVision = builder.build({ ...base, attachments: [attachment], imagesSupported: false });
    const note =
      noVision.status === 'Ready' ? noVision.messages.find((m) => m.role === 'user') : null;
    expect(typeof note?.content).toBe('string');
    expect(String(note?.content)).toContain('no vision support');
  });
});

describe('chat application', () => {
  it('streams events, passes explicit generation settings and reconciles usage without retaining thinking', async () => {
    let captured: ChatRequest | undefined;
    const provider: LlmProvider = {
      async *streamChat(input) {
        captured = input;
        yield { type: 'ThinkingDelta', text: 'ephemeral reasoning' };
        yield { type: 'TextDelta', text: 'Ports isolate ' };
        yield { type: 'TextDelta', text: 'IO.' };
        yield {
          type: 'Finished',
          reason: 'Complete',
          usage: { inputTokens: 900, outputTokens: 12 },
        };
      },
    };
    const repository = new InMemoryConversationRepository();
    const events: AgentEvent[] = [];
    const outcome = await new ChatAgent(provider, repository, new TokenCounter()).run(
      request,
      new CancellationSource(),
      { emit: (event) => events.push(event) },
    );
    expect(outcome.status).toBe('Completed');
    expect(captured).toMatchObject({
      contextWindowTokens: 8192,
      thinkingEnabled: true,
      keepAliveSeconds: 300,
      maxOutputTokens: 1024,
      tools: [],
    });
    expect(events.filter((event) => event.type === 'ResponseDelta')).toHaveLength(2);
    expect(events).toContainEqual({
      type: 'ThinkingDelta',
      messageId: 'run-step-0-assistant',
      text: 'ephemeral reasoning',
    });
    const history = JSON.stringify(await repository.get('chat'));
    expect(history).toContain('Ports isolate IO.');
    expect(history).not.toContain('ephemeral reasoning');
    expect(events.filter((event) => event.type === 'ContextUpdated').at(-1)).toMatchObject({
      usage: {
        maxTokens: 8192,
        actualInputTokens: 900,
        actualOutputTokens: 12,
        toolDefinitionTokens: 0,
      },
    });
  });

  it('stop cancels streaming, retains partial text and never stores thinking', async () => {
    const source = new CancellationSource();
    const events: AgentEvent[] = [];
    const repository = new InMemoryConversationRepository();
    const provider: LlmProvider = {
      async *streamChat() {
        yield { type: 'TextDelta', text: 'partial' };
        source.cancel();
        yield { type: 'TextDelta', text: 'late' };
      },
    };
    const outcome = await new ChatAgent(provider, repository, new TokenCounter()).run(
      request,
      source,
      { emit: (event) => events.push(event) },
    );
    expect(outcome.status).toBe('Cancelled');
    expect(events).toContainEqual({ type: 'GenerationCancelled' });
    expect(JSON.stringify(await repository.get('chat'))).toContain('partial');
    expect(JSON.stringify(events)).not.toContain('late');
  });

  it('reports runtime failure without throwing to presentation', async () => {
    const provider: LlmProvider = {
      streamChat() {
        throw new Error('Ollama unavailable');
      },
    };
    const events: AgentEvent[] = [];
    expect(
      (
        await new ChatAgent(provider, new InMemoryConversationRepository(), new TokenCounter()).run(
          request,
          new CancellationSource(),
          { emit: (event) => events.push(event) },
        )
      ).status,
    ).toBe('Failed');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ErrorOccurred', recoverable: true }),
    );
  });

  it('never calls the provider when pinned context exceeds the budget', async () => {
    let called = false;
    const provider: LlmProvider = {
      async *streamChat() {
        called = true;
        yield { type: 'Finished', reason: 'Complete', usage: null };
      },
    };
    const result = await new ChatAgent(
      provider,
      new InMemoryConversationRepository(),
      new TokenCounter(),
    ).run({ ...request, prompt: 'x'.repeat(30_000) }, new CancellationSource(), { emit() {} });
    expect(result.status).toBe('Failed');
    expect(called).toBe(false);
  });
});

describe('context and token accounting', () => {
  it('reserves output/margin, counts definitions and compacts complete older turns', () => {
    const counter = new TokenCounter();
    const result = new ContextBuilder(counter).build({
      systemInstructions: 'Kova',
      projectInstructions: null,
      tools: [
        {
          name: 'read_file',
          description: 'Read text',
          inputSchema: { type: 'object' },
          risk: 'ReadOnly',
          origin: { kind: 'BuiltIn' },
        },
      ],
      activeSkill: null,
      currentUserMessageId: 'current',
      currentStepId: null,
      imagesSupported: true,
      settings: request.context,
      attachments: [],
      conversation: {
        id: 'x',
        workspaceId: '',
        summary: null,
        entries: [
          {
            id: 'old',
            turnId: 'old',
            stepId: null,
            omitted: false,
            toolResultOrigin: null,
            message: { role: 'user', content: 'old'.repeat(7000) },
          },
          {
            id: 'current',
            turnId: 'now',
            stepId: null,
            omitted: false,
            toolResultOrigin: null,
            message: { role: 'user', content: 'Current request' },
          },
        ],
      },
    });
    expect(result.status).toBe('Ready');
    if (result.status !== 'Ready') return;
    expect(result.usage).toMatchObject({
      maxTokens: 8192,
      inputBudgetTokens: 6348,
      safetyMarginTokens: 820,
      reservedOutputTokens: 1024,
    });
    expect(result.usage.toolDefinitionTokens).toBeGreaterThan(0);
    expect(result.boundedConversation.entries.map((entry) => entry.id)).toEqual(['current']);
    expect(result.boundedConversation.summary).not.toBeNull();
  });
  it('estimates Unicode conservatively and only increases estimates after measured usage', () => {
    const counter = new TokenCounter();
    expect(counter.estimate('漢字')).toBeGreaterThan(counter.estimate('ab'));
    const before = counter.estimate('x'.repeat(300));
    counter.reconcile(before, { inputTokens: before * 2, outputTokens: 5 });
    expect(counter.estimate('x'.repeat(300))).toBeGreaterThan(before);
    const corrected = counter.estimate('x'.repeat(300));
    counter.reconcile(corrected, { inputTokens: 1, outputTokens: 1 });
    expect(counter.estimate('x'.repeat(300))).toBe(corrected);
  });
  it('one failing cancellation observer does not prevent another from aborting', () => {
    const source = new CancellationSource();
    let observed = false;
    source.onCancellationRequested(() => {
      throw new Error('observer');
    });
    source.onCancellationRequested(() => {
      observed = true;
    });
    source.cancel();
    expect(observed).toBe(true);
  });
  it('late cancellation subscribers fire immediately', () => {
    const source = new CancellationSource();
    source.cancel();
    let observed = false;
    source.onCancellationRequested(() => {
      observed = true;
    });
    expect(observed).toBe(true);
  });
});
