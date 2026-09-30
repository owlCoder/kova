import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from '../../packages/core/src/agents/ChatAgent.js';
import type { AgentRequest } from '../../packages/core/src/agents/AgentRequest.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import type { LlmProvider } from '../../packages/core/src/providers/LlmProvider.js';
import type { ChatEvent } from '../../packages/core/src/providers/ChatEvent.js';
import type { ToolCallCandidate } from '../../packages/core/src/tools/ToolCallCandidate.js';
import type { ToolDefinition } from '../../packages/core/src/tools/ToolDefinition.js';
import type { ToolRuntime } from '../../packages/core/src/tools/ToolRuntime.js';
import type { ToolResult } from '../../packages/core/src/tools/ToolResult.js';
import { CancellationSource, EventLog } from './helpers.js';

const request: AgentRequest = {
  runId: 'run',
  conversationId: 'chat',
  workspaceId: 'workspace',
  prompt: 'Use tools.',
  modelId: 'fixture',
  mode: 'Auto',
  activeSkillId: null,
  context: {
    maxTokens: 32768,
    reservedOutputTokens: 1024,
    safetyMarginRatio: 0.1,
    maxToolOutputCharacters: 8000,
  },
  attachments: [],
  thinkingEnabled: false,
  keepAliveSeconds: 0,
  toolsEnabled: true,
  maxToolIterations: 10,
  commandAllowlist: [],
};
const definition: ToolDefinition = {
  name: 'read_file',
  description: 'read',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
    additionalProperties: false,
  },
  risk: 'ReadOnly',
  origin: { kind: 'BuiltIn' },
};
const candidate = (
  argumentsValue: ToolCallCandidate['arguments'] = { path: 'a.txt' },
): ToolCallCandidate => ({
  id: 'provider-reuses-id',
  name: 'read_file',
  arguments: argumentsValue,
});
const provider = (rounds: readonly (readonly ToolCallCandidate[])[]): LlmProvider => {
  let index = 0;
  return {
    async *streamChat() {
      for (const call of rounds[index++] ?? []) yield { type: 'ToolCallReady', candidate: call };
      yield {
        type: 'Finished',
        reason: index <= rounds.length ? 'ToolCalls' : 'Complete',
        usage: null,
      };
    },
  };
};
const runtime = (execute?: ToolRuntime['execute']): ToolRuntime => ({
  definitions: () => [definition],
  execute:
    execute ??
    vi.fn(async (call) => ({
      callId: call.id,
      toolName: call.name,
      status: 'Success' as const,
      output: 'result',
      error: null,
      omittedCharacters: 0,
      durationMs: 0,
    })),
});
const assertPaired = async (repository: InMemoryConversationRepository) => {
  const entries = (await repository.get('chat'))!.entries;
  const calls = entries.flatMap((entry) =>
    entry.message.role === 'assistant' ? entry.message.toolCalls : [],
  );
  const results = entries.flatMap((entry) =>
    entry.message.role === 'tool' ? [entry.message] : [],
  );
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  for (const call of calls)
    expect(results.filter((result) => result.callId === call.id)).toHaveLength(1);
  for (const result of results)
    expect(calls.filter((call) => call.id === result.callId)).toHaveLength(1);
};

describe('agent-loop repair/repeat/iteration safety', () => {
  it('three identical schema failures stop as MalformedToolCall without executing any tool', async () => {
    const implementation = runtime(),
      repository = new InMemoryConversationRepository(),
      events = new EventLog();
    const outcome = await new ChatAgent(
      provider([[candidate({})], [candidate({})], [candidate({})]]),
      repository,
      new TokenCounter(),
      implementation,
    ).run(request, new CancellationSource(), events);
    expect(outcome).toMatchObject({ status: 'Stopped', reason: 'MalformedToolCall' });
    expect(implementation.execute).not.toHaveBeenCalled();
    expect(events.events.filter((event) => event.type === 'ToolValidationFailed')).toHaveLength(3);
    await assertPaired(repository);
  });
  it('allows at most two repairs for malformed JSON/unknown names and saves structured errors', async () => {
    const repository = new InMemoryConversationRepository(),
      implementation = runtime();
    const rounds = [
      [candidate('{invalid')],
      [{ ...candidate({}), name: 'unknown' }],
      [candidate([])],
    ];
    expect(
      await new ChatAgent(provider(rounds), repository, new TokenCounter(), implementation).run(
        request,
        new CancellationSource(),
        new EventLog(),
      ),
    ).toMatchObject({ reason: 'MalformedToolCall' });
    expect(JSON.stringify(await repository.get('chat'))).toContain('repairLimit');
    await assertPaired(repository);
  });
  it('suppresses a second identical valid call and stops the third with paired results', async () => {
    const repository = new InMemoryConversationRepository(),
      implementation = runtime();
    const outcome = await new ChatAgent(
      provider([[candidate()], [candidate()], [candidate()]]),
      repository,
      new TokenCounter(),
      implementation,
    ).run(request, new CancellationSource(), new EventLog());
    expect(outcome).toMatchObject({ reason: 'RepeatedToolCall' });
    expect(implementation.execute).toHaveBeenCalledOnce();
    await assertPaired(repository);
    const results = (await repository.get('chat'))!.entries.filter(
      (entry) => entry.message.role === 'tool',
    );
    expect(results).toHaveLength(2);
    expect(JSON.stringify(results)).toContain('Call was not executed twice');
  });
  it('third runtime InvalidArguments result is persisted before stopping and is not hidden by repeat suppression', async () => {
    const execute = vi.fn(
      async (call: Parameters<ToolRuntime['execute']>[0]): Promise<ToolResult> => ({
        callId: call.id,
        toolName: call.name,
        status: 'Error',
        output: '',
        error: { code: 'InvalidArguments', message: 'adapter rejected', details: {} },
        omittedCharacters: 0,
        durationMs: 0,
      }),
    );
    const repository = new InMemoryConversationRepository();
    expect(
      await new ChatAgent(
        provider([[candidate()], [candidate()], [candidate()]]),
        repository,
        new TokenCounter(),
        runtime(execute),
      ).run(request, new CancellationSource(), new EventLog()),
    ).toMatchObject({ reason: 'MalformedToolCall' });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(
      (await repository.get('chat'))!.entries.filter((entry) => entry.message.role === 'tool'),
    ).toHaveLength(3);
    await assertPaired(repository);
  });
  it('caps attempts at 10 even if the caller requests a higher limit', async () => {
    const implementation = runtime(),
      repository = new InMemoryConversationRepository();
    const calls = Array.from({ length: 12 }, (_, index) => candidate({ path: `${index}.txt` }));
    expect(
      await new ChatAgent(provider([calls]), repository, new TokenCounter(), implementation).run(
        { ...request, maxToolIterations: 100 },
        new CancellationSource(),
        new EventLog(),
      ),
    ).toMatchObject({ reason: 'IterationLimit' });
    expect(implementation.execute).toHaveBeenCalledTimes(10);
    await assertPaired(repository);
  });
  it('counts malformed repairs toward the iteration limit', async () => {
    const implementation = runtime(),
      repository = new InMemoryConversationRepository();
    expect(
      await new ChatAgent(
        provider([[candidate({})], [candidate()]]),
        repository,
        new TokenCounter(),
        implementation,
      ).run({ ...request, maxToolIterations: 1 }, new CancellationSource(), new EventLog()),
    ).toMatchObject({ reason: 'IterationLimit' });
    expect(implementation.execute).not.toHaveBeenCalled();
    await assertPaired(repository);
  });
  it('cancellation during tool execution leaves one assistant/tool pair and returns Cancelled', async () => {
    const cancellation = new CancellationSource(),
      repository = new InMemoryConversationRepository();
    const implementation = runtime(async () => {
      cancellation.cancel();
      throw new Error('aborted');
    });
    expect(
      await new ChatAgent(
        provider([[candidate()]]),
        repository,
        new TokenCounter(),
        implementation,
      ).run(request, cancellation, new EventLog()),
    ).toMatchObject({ status: 'Cancelled' });
    await assertPaired(repository);
    expect(JSON.stringify(await repository.get('chat'))).toContain('Tool execution cancelled');
  });
  it('runtime failures produce a paired structured result and allow the provider to recover', async () => {
    const repository = new InMemoryConversationRepository();
    const implementation = runtime(async () => {
      throw new Error('failed');
    });
    expect(
      await new ChatAgent(
        provider([[candidate()], []]),
        repository,
        new TokenCounter(),
        implementation,
      ).run(request, new CancellationSource(), new EventLog()),
    ).toMatchObject({ status: 'Completed' });
    await assertPaired(repository);
    expect(JSON.stringify(await repository.get('chat'))).toContain('ToolRuntimeFailed');
  });
  it('keeps partial assistant text and no tool calls if a stream fails before its final event', async () => {
    const repository = new InMemoryConversationRepository();
    const stream: LlmProvider = {
      async *streamChat(): AsyncIterable<ChatEvent> {
        yield { type: 'TextDelta', text: 'partial' };
        yield { type: 'ToolCallReady', candidate: candidate() };
        throw new Error('provider failed');
      },
    };
    expect(
      await new ChatAgent(stream, repository, new TokenCounter(), runtime()).run(
        request,
        new CancellationSource(),
        new EventLog(),
      ),
    ).toMatchObject({ status: 'Failed' });
    await assertPaired(repository);
    expect(JSON.stringify(await repository.get('chat'))).toContain('partial');
  });
});
