import { describe, expect, it, vi } from 'vitest';
import { OllamaConnection } from '../../packages/ollama/src/OllamaConnection.js';
import { OllamaLlmProvider } from '../../packages/ollama/src/OllamaLlmProvider.js';
import { OllamaModelCatalog } from '../../packages/ollama/src/OllamaModelCatalog.js';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import type { ChatRequest } from '../../packages/core/src/providers/ChatRequest.js';

const request: ChatRequest = {
  modelId: 'qwen3:4b',
  messages: [{ role: 'user', content: 'Hello' }],
  tools: [],
  contextWindowTokens: 8192,
  maxOutputTokens: 1024,
  thinkingEnabled: false,
  keepAliveSeconds: 300,
};
async function collect(
  provider: OllamaLlmProvider,
  input = request,
  source = new CancellationSource(),
) {
  const events = [];
  for await (const event of provider.streamChat(input, source)) events.push(event);
  return events;
}

describe('Ollama wire adapter', () => {
  it('maps explicit num_ctx, num_predict, think and keep_alive, parses fragmented UTF8 NDJSON and final usage', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ message: { content: 'Čao' }, done: false }) +
        '\n' +
        JSON.stringify({
          message: { content: '!' },
          done: true,
          prompt_eval_count: 12,
          eval_count: 2,
        }),
    );
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2));
              controller.close();
            },
          }),
        ),
    );
    const events = await collect(
      new OllamaLlmProvider(new OllamaConnection('http://127.0.0.1:11434', fetcher)),
    );
    expect(events).toEqual([
      { type: 'TextDelta', text: 'Čao' },
      { type: 'TextDelta', text: '!' },
      { type: 'Finished', reason: 'Complete', usage: { inputTokens: 12, outputTokens: 2 } },
    ]);
    const payload = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(payload).toMatchObject({
      model: 'qwen3:4b',
      stream: true,
      think: false,
      keep_alive: '300s',
      options: { num_ctx: 8192, num_predict: 1024 },
    });
    expect(payload).not.toHaveProperty('tools');
  });
  it('thinking is separate and enabled explicitly', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            message: { thinking: 'reason', content: 'answer' },
            done: true,
            prompt_eval_count: 1,
            eval_count: 2,
          }),
        ),
    );
    const events = await collect(
      new OllamaLlmProvider(new OllamaConnection('http://localhost:11434', fetcher)),
      { ...request, thinkingEnabled: true },
    );
    expect(events[0]).toEqual({ type: 'ThinkingDelta', text: 'reason' });
  });
  it('aborts in-flight HTTP on stop', async () => {
    const source = new CancellationSource();
    let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>((_url, options) => {
      signal = options?.signal;
      return new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );
    });
    const pending = collect(
      new OllamaLlmProvider(new OllamaConnection('http://localhost:11434', fetcher)),
      request,
      source,
    );
    source.cancel();
    await expect(pending).rejects.toThrow('aborted');
    expect(signal?.aborted).toBe(true);
  });
  it('reports incomplete streams and HTTP/model failure', async () => {
    await expect(
      collect(
        new OllamaLlmProvider(
          new OllamaConnection(
            'http://localhost:11434',
            async () => new Response('{"message":{"content":"partial"}}\n'),
          ),
        ),
      ),
    ).rejects.toThrow('final record');
    await expect(
      collect(
        new OllamaLlmProvider(
          new OllamaConnection(
            'http://localhost:11434',
            async () => new Response('', { status: 404 }),
          ),
        ),
      ),
    ).rejects.toThrow('HTTP 404');
  });
  it('discovers installed models and conservatively marks missing capabilities', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/api/tags')
        ? Response.json({
            models: [
              {
                name: 'qwen3:4b',
                size: 2497293931,
                capabilities: ['tools', 'thinking'],
                details: { context_length: 262144 },
              },
              { name: 'plain', size: 1 },
            ],
          })
        : new Response('', { status: 404 }),
    );
    const models = await new OllamaModelCatalog(
      new OllamaConnection('http://localhost:11434', fetcher),
    ).listInstalled(new CancellationSource());
    expect(models[0]).toMatchObject({
      id: 'qwen3:4b',
      tools: 'Supported',
      thinking: 'Supported',
      maxContextTokens: 262144,
    });
    expect(models[1]?.tools).toBe('Unknown');
  });
});
