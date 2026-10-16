import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';
import { StreamEventBuffer } from '../../packages/runtime/src/presentation/StreamEventBuffer.js';
import { OllamaModelCatalog } from '../../packages/ollama/src/OllamaModelCatalog.js';
import { OllamaConnection } from '../../packages/ollama/src/OllamaConnection.js';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';

afterEach(() => vi.useRealTimers());

describe('stream delivery performance', () => {
  it('delivers a burst of 500 tokens as one ordered update and flushes before completion', () => {
    vi.useFakeTimers();
    const events: AgentEvent[] = [];
    const buffer = new StreamEventBuffer((event) => events.push(event));
    for (let i = 0; i < 500; i++) buffer.push({ type: 'ResponseDelta', messageId: 'm', text: 'x' });
    expect(events).toHaveLength(0);
    vi.advanceTimersByTime(32);
    expect(events).toEqual([{ type: 'ResponseDelta', messageId: 'm', text: 'x'.repeat(500) }]);
    buffer.push({ type: 'ResponseDelta', messageId: 'm', text: '!' });
    buffer.push({ type: 'GenerationCancelled' });
    expect(events.slice(1)).toEqual([
      { type: 'ResponseDelta', messageId: 'm', text: '!' },
      { type: 'GenerationCancelled' },
    ]);
    buffer.dispose();
    vi.runAllTimers();
    expect(events).toHaveLength(3);
  });

  it('keeps thinking and message boundaries distinct and discards pending work on disposal', () => {
    vi.useFakeTimers();
    const events: AgentEvent[] = [];
    const buffer = new StreamEventBuffer((event) => events.push(event));
    buffer.push({ type: 'ThinkingDelta', messageId: 'one', text: 'reason' });
    buffer.push({ type: 'ResponseDelta', messageId: 'one', text: 'answer' });
    buffer.push({ type: 'ResponseDelta', messageId: 'two', text: 'next' });
    expect(events.map((event) => event.type)).toEqual(['ThinkingDelta', 'ResponseDelta']);
    buffer.dispose();
    vi.runAllTimers();
    expect(events).toHaveLength(2);
  });
});

describe('model library performance', () => {
  it('loads metadata four at a time while preserving the installed model order', async () => {
    let active = 0;
    let maxActive = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/api/tags'))
        return Response.json({
          models: Array.from({ length: 12 }, (_, i) => ({ name: `m${i}`, size: i })),
        });
      active++;
      maxActive = Math.max(maxActive, active);
      const model = (JSON.parse(options!.body as string) as { model: string }).model;
      await new Promise((resolve) => setTimeout(resolve, model === 'm0' ? 10 : 1));
      active--;
      return Response.json({
        capabilities: ['tools'],
        model_info: { 'model.context_length': 32768 },
      });
    });
    const models = await new OllamaModelCatalog(
      new OllamaConnection('http://localhost:11434', fetcher),
    ).listAvailable(new CancellationSource());
    expect(maxActive).toBe(4);
    expect(models.map((model) => model.id)).toEqual(Array.from({ length: 12 }, (_, i) => `m${i}`));
    expect(models.every((model) => model.tools === 'Supported')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(13);
  });
});
