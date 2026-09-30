import { describe, expect, it, vi } from 'vitest';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import type { ChatRequest } from '../../packages/core/src/providers/ChatRequest.js';
import { OpenAiCompatibleConnection } from '../../packages/vscode/src/providers/OpenAiCompatibleConnection.js';
import { OpenAiCompatibleLlmProvider } from '../../packages/vscode/src/providers/OpenAiCompatibleLlmProvider.js';
import { OpenAiCompatibleModelCatalog } from '../../packages/vscode/src/providers/OpenAiCompatibleModelCatalog.js';

const tool = {
  name: 'demo',
  description: 'Demo tool',
  inputSchema: {
    type: 'object',
    properties: { x: { type: 'number' } },
    required: ['x'],
  },
  risk: 'ReadOnly' as const,
  origin: { kind: 'BuiltIn' as const },
};

const request: ChatRequest = {
  modelId: 'deepseek-flash',
  messages: [{ role: 'user', content: 'Use the tool' }],
  tools: [tool],
  contextWindowTokens: 8192,
  maxOutputTokens: 1024,
  thinkingEnabled: true,
  keepAliveSeconds: 0,
};

function stream(records: readonly unknown[]): Response {
  const text =
    records.map((record) => `data: ${JSON.stringify(record)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
}

async function collect(provider: OpenAiCompatibleLlmProvider, input: ChatRequest = request) {
  const events = [];
  for await (const event of provider.streamChat(input, new CancellationSource()))
    events.push(event);
  return events;
}

describe('OpenAI-compatible provider', () => {
  it('streams DeepSeek reasoning, text, tool calls and usage', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      stream([
        {
          choices: [
            {
              delta: { reasoning_content: 'reason', content: 'Using tool' },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'wire-call',
                    type: 'function',
                    function: { name: 'demo', arguments: '{' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: '"x":1}' } }] },
              finish_reason: 'tool_calls',
            },
          ],
        },
        { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
      ]),
    );
    const provider = new OpenAiCompatibleLlmProvider(
      new OpenAiCompatibleConnection('https://api.deepseek.com', 'secret', fetcher),
      'deepseek',
    );

    await expect(collect(provider)).resolves.toEqual([
      { type: 'ThinkingDelta', text: 'reason' },
      { type: 'TextDelta', text: 'Using tool' },
      {
        type: 'ToolCallReady',
        candidate: { id: 'wire-call', name: 'demo', arguments: '{"x":1}' },
      },
      {
        type: 'Finished',
        reason: 'ToolCalls',
        usage: { inputTokens: 12, outputTokens: 7 },
      },
    ]);

    const options = fetcher.mock.calls[0]?.[1];
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer secret' });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      stream: true,
      thinking: { type: 'enabled' },
      max_tokens: 1024,
    });
  });

  it('replays transient DeepSeek reasoning across tool turns', async () => {
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call++;
      return call === 1
        ? stream([
            {
              choices: [
                {
                  delta: {
                    reasoning_content: 'private reasoning',
                    content: 'Using tool',
                    tool_calls: [
                      {
                        index: 0,
                        id: 'wire-call',
                        function: { name: 'demo', arguments: '{"x":1}' },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            },
          ])
        : stream([
            {
              choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 20, completion_tokens: 1 },
            },
          ]);
    });
    const provider = new OpenAiCompatibleLlmProvider(
      new OpenAiCompatibleConnection('https://api.deepseek.com', 'secret', fetcher),
      'deepseek',
    );
    await collect(provider);
    await collect(provider, {
      ...request,
      messages: [
        { role: 'user', content: 'Use the tool' },
        {
          role: 'assistant',
          content: 'Using tool',
          toolCalls: [{ id: 'durable-call', name: 'demo', arguments: { x: 1 } }],
        },
        { role: 'tool', callId: 'durable-call', toolName: 'demo', content: 'ok' },
      ],
    });

    const second = bodies[1] as { messages: Record<string, unknown>[] };
    expect(second.messages[1]).toMatchObject({
      role: 'assistant',
      reasoning_content: 'private reasoning',
      tool_calls: [
        {
          id: 'durable-call',
          function: { name: 'demo', arguments: '{"x":1}' },
        },
      ],
    });
    expect(second.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'durable-call',
      content: 'ok',
    });
  });

  it('discovers remote models with provider capabilities and context size', async () => {
    const catalog = new OpenAiCompatibleModelCatalog(
      new OpenAiCompatibleConnection('https://api.deepseek.com', 'secret', async () =>
        Response.json({
          object: 'list',
          data: [
            {
              id: 'deepseek-flash',
              name: 'DeepSeek-V4.1-Flash',
              context_window: 1_048_576,
            },
          ],
        }),
      ),
      'Supported',
      'Supported',
    );
    await expect(catalog.listAvailable(new CancellationSource())).resolves.toEqual([
      {
        id: 'deepseek-flash',
        displayName: 'DeepSeek-V4.1-Flash',
        sizeBytes: null,
        tools: 'Supported',
        thinking: 'Supported',
        maxContextTokens: 1_048_576,
      },
    ]);
  });
});
