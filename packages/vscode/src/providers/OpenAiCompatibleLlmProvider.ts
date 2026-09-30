import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { JsonValue } from '../../../core/src/common/JsonValue.js';
import type { ChatEvent } from '../../../core/src/providers/ChatEvent.js';
import type { ChatMessage } from '../../../core/src/providers/ChatMessage.js';
import type { ChatRequest } from '../../../core/src/providers/ChatRequest.js';
import type { LlmProvider } from '../../../core/src/providers/LlmProvider.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import { OpenAiCompatibleConnection } from './OpenAiCompatibleConnection.js';

type ToolFragments = {
  id: string;
  name: string;
  arguments: string;
};

type ReasoningRecord = {
  content: string;
  calls: readonly { name: string; arguments: string }[];
  reasoning: string;
};

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  private callSequence = 0;
  private readonly reasoningRecords: ReasoningRecord[] = [];

  constructor(
    private readonly connection: OpenAiCompatibleConnection,
    private readonly dialect: 'standard' | 'deepseek' = 'standard',
  ) {}

  async *streamChat(
    request: ChatRequest,
    cancellation: CancellationToken,
  ): AsyncIterable<ChatEvent> {
    if (request.thinkingEnabled && this.dialect !== 'deepseek')
      throw new Error('Thinking is not configured for this OpenAI-compatible provider.');

    const body = {
      model: request.modelId,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: request.maxOutputTokens,
      messages: this.serializeMessages(request.messages, request.tools.length > 0),
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
      ...(this.dialect === 'deepseek'
        ? { thinking: { type: request.thinkingEnabled ? 'enabled' : 'disabled' } }
        : {}),
    };
    const handle = await this.connection.open('/chat/completions', body, cancellation);
    const reader = handle.response.body?.getReader();
    if (!reader) {
      handle.dispose();
      throw new Error('Provider response has no stream.');
    }

    const decoder = new TextDecoder();
    const calls = new Map<number, ToolFragments>();
    let buffer = '';
    let text = '';
    let reasoning = '';
    let finished = false;
    let finishReason: 'Complete' | 'ToolCalls' | 'Length' = 'Complete';
    let usage: { inputTokens: number; outputTokens: number } | null = null;

    try {
      for (;;) {
        cancellation.throwIfCancellationRequested();
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        if (buffer.length > 1_000_000) throw new Error('Provider stream record exceeds the limit.');
        const lines = buffer.split('\n');
        buffer = chunk.done ? '' : (lines.pop() ?? '');
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          const parsed: unknown = JSON.parse(data);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('Invalid provider stream record.');
          const record = parsed as Record<string, unknown>;
          if (record.error) throw new Error('Provider reported a generation error.');

          const rawUsage =
            record.usage && typeof record.usage === 'object'
              ? (record.usage as Record<string, unknown>)
              : null;
          if (
            rawUsage &&
            typeof rawUsage.prompt_tokens === 'number' &&
            typeof rawUsage.completion_tokens === 'number'
          )
            usage = {
              inputTokens: rawUsage.prompt_tokens,
              outputTokens: rawUsage.completion_tokens,
            };

          if (!Array.isArray(record.choices)) continue;
          for (const rawChoice of record.choices) {
            if (!rawChoice || typeof rawChoice !== 'object') continue;
            const choice = rawChoice as Record<string, unknown>;
            const delta =
              choice.delta && typeof choice.delta === 'object'
                ? (choice.delta as Record<string, unknown>)
                : {};
            if (typeof delta.reasoning_content === 'string') {
              reasoning += delta.reasoning_content;
              if (request.thinkingEnabled)
                yield { type: 'ThinkingDelta', text: delta.reasoning_content };
            }
            if (typeof delta.content === 'string' && delta.content) {
              text += delta.content;
              yield { type: 'TextDelta', text: delta.content };
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const rawCall of delta.tool_calls) {
                if (!rawCall || typeof rawCall !== 'object') continue;
                const call = rawCall as Record<string, unknown>;
                if (typeof call.index !== 'number') continue;
                const current = calls.get(call.index) ?? {
                  id: '',
                  name: '',
                  arguments: '',
                };
                if (typeof call.id === 'string') current.id = call.id;
                const fn =
                  call.function && typeof call.function === 'object'
                    ? (call.function as Record<string, unknown>)
                    : null;
                if (fn && typeof fn.name === 'string') current.name += fn.name;
                if (fn && typeof fn.arguments === 'string') current.arguments += fn.arguments;
                calls.set(call.index, current);
              }
            }
            if (typeof choice.finish_reason === 'string') {
              finished = true;
              finishReason =
                choice.finish_reason === 'length'
                  ? 'Length'
                  : choice.finish_reason === 'tool_calls'
                    ? 'ToolCalls'
                    : 'Complete';
            }
          }
        }
        if (chunk.done) break;
      }

      if (!finished) throw new Error('Provider stream ended without a final completion reason.');

      const completedCalls = [...calls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, call]) => call);
      for (const call of completedCalls) {
        const callId = call.id || `openai-call-${++this.callSequence}`;
        if (!call.name || !call.arguments)
          yield {
            type: 'MalformedToolCall',
            callId,
            toolName: call.name || null,
            message: 'Tool call requires a function name and JSON arguments.',
          };
        else
          yield {
            type: 'ToolCallReady',
            candidate: { id: callId, name: call.name, arguments: call.arguments as JsonValue },
          };
      }

      if (request.thinkingEnabled && reasoning)
        this.rememberReasoning(text, completedCalls, reasoning);
      yield { type: 'Finished', reason: finishReason, usage };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      handle.dispose();
    }
  }

  private serializeMessages(
    messages: readonly ChatMessage[],
    includeReasoning: boolean,
  ): readonly unknown[] {
    const consumed = new Set<number>();
    return messages.map((message) => {
      if (message.role === 'assistant') {
        const reasoning = includeReasoning
          ? this.findReasoning(message.content, message.toolCalls, consumed)
          : undefined;
        return {
          role: 'assistant',
          content: message.content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(message.toolCalls.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              }
            : {}),
        };
      }
      if (message.role === 'tool')
        return { role: 'tool', tool_call_id: message.callId, content: message.content };
      return { role: message.role, content: message.content };
    });
  }

  private rememberReasoning(
    content: string,
    calls: readonly ToolFragments[],
    reasoning: string,
  ): void {
    this.reasoningRecords.push({
      content,
      calls: calls.map((call) => ({
        name: call.name,
        arguments: this.normalizeArguments(call.arguments),
      })),
      reasoning,
    });
    if (this.reasoningRecords.length > 100) this.reasoningRecords.shift();
  }

  private findReasoning(
    content: string,
    calls: readonly ToolCall[],
    consumed: Set<number>,
  ): string | undefined {
    const normalizedCalls = calls.map((call) => ({
      name: call.name,
      arguments: JSON.stringify(call.arguments),
    }));
    const exact = this.reasoningRecords.findIndex(
      (record, index) =>
        !consumed.has(index) &&
        record.content === content &&
        this.sameCalls(record.calls, normalizedCalls),
    );
    const fallback =
      exact >= 0
        ? exact
        : this.reasoningRecords.findIndex(
            (record, index) => !consumed.has(index) && record.content === content,
          );
    if (fallback < 0) return undefined;
    consumed.add(fallback);
    return this.reasoningRecords[fallback]?.reasoning;
  }

  private sameCalls(
    left: readonly { name: string; arguments: string }[],
    right: readonly { name: string; arguments: string }[],
  ): boolean {
    return (
      left.length === right.length &&
      left.every(
        (call, index) =>
          call.name === right[index]?.name && call.arguments === right[index]?.arguments,
      )
    );
  }

  private normalizeArguments(value: string): string {
    try {
      return JSON.stringify(JSON.parse(value) as unknown);
    } catch {
      return value.trim();
    }
  }
}
