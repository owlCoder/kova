import type { CancellationToken } from '../../core/src/common/CancellationToken.js';
import type { JsonValue } from '../../core/src/common/JsonValue.js';
import type { ChatEvent } from '../../core/src/providers/ChatEvent.js';
import type { ChatRequest } from '../../core/src/providers/ChatRequest.js';
import type { LlmProvider } from '../../core/src/providers/LlmProvider.js';
import { OllamaConnection } from './OllamaConnection.js';

export class OllamaLlmProvider implements LlmProvider {
  private callSequence = 0;
  constructor(private readonly connection: OllamaConnection) {}
  async *streamChat(
    request: ChatRequest,
    cancellation: CancellationToken,
  ): AsyncIterable<ChatEvent> {
    const handle = await this.connection.open(
      '/api/chat',
      {
        model: request.modelId,
        stream: true,
        think: request.thinkingEnabled,
        keep_alive: `${request.keepAliveSeconds}s`,
        options: { num_ctx: request.contextWindowTokens, num_predict: request.maxOutputTokens },
        messages: request.messages.map((message) =>
          message.role === 'assistant'
            ? {
                role: message.role,
                content: message.content,
                ...(message.toolCalls.length
                  ? {
                      tool_calls: message.toolCalls.map((call) => ({
                        function: { name: call.name, arguments: call.arguments },
                      })),
                    }
                  : {}),
              }
            : message.role === 'tool'
              ? { role: 'tool', tool_name: message.toolName, content: message.content }
              : { role: message.role, content: message.content },
        ),
        ...(request.tools.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.inputSchema,
                },
              })),
            }
          : {}),
      },
      cancellation,
    );
    const reader = handle.response.body?.getReader();
    if (!reader) {
      handle.dispose();
      throw new Error('Ollama response has no stream.');
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    let sawCalls = false;
    try {
      while (!finished) {
        cancellation.throwIfCancellationRequested();
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        if (buffer.length > 1_000_000) throw new Error('Ollama stream record exceeds the limit.');
        const lines = buffer.split('\n');
        buffer = chunk.done ? '' : (lines.pop() ?? '');
        for (const line of lines) {
          if (!line.trim()) continue;
          const record: unknown = JSON.parse(line);
          if (!record || typeof record !== 'object' || Array.isArray(record))
            throw new Error('Invalid Ollama stream record.');
          const item = record as Record<string, unknown>;
          if (typeof item.error === 'string')
            throw new Error('Ollama reported a generation error. Check model compatibility.');
          const message =
            item.message && typeof item.message === 'object'
              ? (item.message as Record<string, unknown>)
              : {};
          if (typeof message.thinking === 'string' && request.thinkingEnabled)
            yield { type: 'ThinkingDelta', text: message.thinking };
          if (typeof message.content === 'string' && message.content)
            yield { type: 'TextDelta', text: message.content };
          if (Array.isArray(message.tool_calls)) {
            for (const raw of message.tool_calls) {
              const callId = `ollama-call-${++this.callSequence}`;
              const fn =
                raw && typeof raw === 'object' && 'function' in raw
                  ? (raw.function as Record<string, unknown>)
                  : null;
              if (!fn || typeof fn.name !== 'string' || !('arguments' in fn))
                yield {
                  type: 'MalformedToolCall',
                  callId,
                  toolName: null,
                  message: 'Tool call requires function.name and arguments.',
                };
              else {
                sawCalls = true;
                yield {
                  type: 'ToolCallReady',
                  candidate: { id: callId, name: fn.name, arguments: fn.arguments as JsonValue },
                };
              }
            }
          }
          if (item.done === true) {
            finished = true;
            yield {
              type: 'Finished',
              reason:
                item.done_reason === 'length' ? 'Length' : sawCalls ? 'ToolCalls' : 'Complete',
              usage:
                typeof item.prompt_eval_count === 'number' &&
                typeof item.eval_count === 'number' &&
                item.prompt_eval_count >= 0 &&
                item.eval_count >= 0
                  ? { inputTokens: item.prompt_eval_count, outputTokens: item.eval_count }
                  : null,
            };
            break;
          }
        }
        if (chunk.done && !finished) throw new Error('Ollama stream ended without a final record.');
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      handle.dispose();
    }
  }
}
