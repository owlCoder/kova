import assert from 'node:assert/strict';
import { OllamaConnection } from '../../packages/ollama/src/OllamaConnection.js';
import { OllamaLlmProvider } from '../../packages/ollama/src/OllamaLlmProvider.js';
import { OllamaModelCatalog } from '../../packages/ollama/src/OllamaModelCatalog.js';
import { ChatAgent } from '../../packages/core/src/agents/ChatAgent.js';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';

export async function run() {
  const source = new CancellationSource();
  const models = await new OllamaModelCatalog(
    new OllamaConnection('http://127.0.0.1:11434'),
  ).listInstalled(source);
  assert(models.some((model) => model.id === 'qwen3:4b'));
  const captured: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = (url, options) => {
    if (options?.body) captured.push(JSON.parse(options.body as string) as Record<string, unknown>);
    return fetch(url, options);
  };
  const repository = new InMemoryConversationRepository();
  const events: AgentEvent[] = [];
  const agent = new ChatAgent(
    new OllamaLlmProvider(new OllamaConnection('http://127.0.0.1:11434', fetcher)),
    repository,
    new TokenCounter(),
  );
  const request = {
    runId: 'real-chat',
    conversationId: 'real-chat',
    workspaceId: '',
    prompt: 'Say hello in one brief sentence.',
    modelId: 'qwen3:4b',
    mode: 'Manual' as const,
    activeSkillId: null,
    context: {
      maxTokens: 8192,
      reservedOutputTokens: 128,
      safetyMarginRatio: 0.1,
      maxToolOutputCharacters: 8000,
    },
    attachments: [],
    thinkingEnabled: false,
    keepAliveSeconds: 300,
    toolsEnabled: false,
    maxToolIterations: 10,
    commandAllowlist: [],
  };
  const completed = await agent.run(request, source, { emit: (event) => events.push(event) });
  assert.equal(completed.status, 'Completed');
  assert(events.some((event) => event.type === 'ResponseDelta'));
  assert.deepEqual(captured[0]?.options, { num_ctx: 8192, num_predict: 128 });
  assert.equal(captured[0]?.think, false);
  assert.equal(captured[0]?.keep_alive, '300s');
  assert(
    events.some(
      (event) => event.type === 'ContextUpdated' && event.usage.actualInputTokens !== null,
    ),
  );
  console.log(
    'PASS installed qwen3:4b, streamed answer, explicit num_ctx/think/keep_alive, measured context.',
  );
  const cancellation = new CancellationSource();
  const stopped = await agent.run(
    {
      ...request,
      runId: 'real-stop',
      conversationId: 'real-stop',
      prompt: 'Count from 1 to 1000 with one number on every line.',
      context: { ...request.context, reservedOutputTokens: 1024 },
    },
    cancellation,
    {
      emit: (event) => {
        if (event.type === 'ResponseDelta') cancellation.cancel();
      },
    },
  );
  assert.equal(stopped.status, 'Cancelled');
  console.log('PASS Stop cancels real Ollama generation.');
  let thinking = false;
  const thinkResult = await agent.run(
    {
      ...request,
      runId: 'real-think',
      conversationId: 'real-think',
      prompt: 'What is 2 plus 2?',
      thinkingEnabled: true,
    },
    new CancellationSource(),
    {
      emit: (event) => {
        if (event.type === 'ThinkingDelta') thinking = true;
      },
    },
  );
  assert.equal(thinkResult.status, 'Completed');
  assert(thinking);
  assert(!JSON.stringify(await repository.get('real-think')).includes('thinking'));
  console.log('PASS thinking stream is separate and absent from conversation history.');
}
