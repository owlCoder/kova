import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_TOKENS,
  configuredContext,
  effectiveContext,
} from '../../packages/vscode/src/extension/effectiveContext.js';

describe('effective context budget', () => {
  it('defaults to 200k tokens and caps to the model window instead of failing', () => {
    expect(DEFAULT_CONTEXT_TOKENS).toBe(200_000);
    expect(effectiveContext(200_000, 4096, null)).toEqual({
      maxTokens: 200_000,
      reservedOutputTokens: 4096,
    });
    expect(effectiveContext(200_000, 4096, 4096)).toEqual({
      maxTokens: 4096,
      reservedOutputTokens: 1024,
    });
    expect(effectiveContext(16_384, 1024, 262_144).maxTokens).toBe(16_384);
  });
  it('reads explicit settings before applying the cap', () => {
    const settings = (values: Record<string, number>) => ({
      get: <T>(key: string, fallback: T): T => (key in values ? (values[key] as T) : fallback),
    });
    const window = (maxContextTokens: number | null) => ({ maxContextTokens });
    expect(configuredContext(settings({}), window(4096), 'openaiCompatible')).toEqual({
      maxTokens: 4096,
      reservedOutputTokens: 1024,
    });
    expect(configuredContext(settings({}), window(null), 'openaiCompatible').maxTokens).toBe(
      200_000,
    );
    expect(
      configuredContext(settings({ 'context.maxTokens': 8192 }), undefined, 'deepseek').maxTokens,
    ).toBe(8192);
  });
  it('keeps local Ollama memory-safe unless the user raises its limit', () => {
    const settings = (values: Record<string, number>) => ({
      get: <T>(key: string, fallback: T): T => (key in values ? (values[key] as T) : fallback),
    });
    const qwen = { maxContextTokens: 262_144 };
    expect(configuredContext(settings({}), qwen, 'ollama').maxTokens).toBe(32_768);
    expect(configuredContext(settings({}), { maxContextTokens: 8192 }, 'ollama').maxTokens).toBe(
      8192,
    );
    expect(
      configuredContext(settings({ 'ollama.maxContextTokens': 131_072 }), qwen, 'ollama').maxTokens,
    ).toBe(131_072);
  });
});
