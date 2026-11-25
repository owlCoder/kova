import { describe, expect, it } from 'vitest';
import { validateMessage } from '../../packages/runtime/src/presentation/validateMessage.js';
import { projectEvent } from '../../packages/runtime/src/presentation/projectEvent.js';

describe('host message validation and projection', () => {
  it('rejects malformed, oversized, forged tool and unknown-field messages', () => {
    for (const input of [
      null,
      { protocolVersion: 2, requestId: 'x', type: 'Ready' },
      { protocolVersion: 1, requestId: 'x', type: 'ExecuteTool' },
      { protocolVersion: 1, requestId: 'x', type: 'Ready', command: 'rm' },
      {
        protocolVersion: 1,
        requestId: 'x',
        type: 'SubmitPrompt',
        prompt: 'x'.repeat(16001),
        modelId: 'qwen3:4b',
        mode: 'Auto',
        skillId: null,
        attachmentIds: [],
      },
    ])
      expect(() => validateMessage(input)).toThrow();
  });
  it('accepts valid prompt and requires exact approval identity fields', () => {
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'SubmitPrompt',
        prompt: 'hello',
        modelId: 'qwen3:4b',
        mode: 'Manual',
        skillId: null,
        attachmentIds: [],
      }).type,
    ).toBe('SubmitPrompt');
    expect(() =>
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'ResolveApproval',
        approvalId: 'a',
        runId: 'r',
        decision: 'AllowOnce',
      }),
    ).toThrow();
  });
  it('validates UpdateSettings payloads: bounded keys and JSON scalar values', () => {
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'UpdateSettings',
        values: { 'ui.language': 'sr', 'context.maxTokens': 200000, 'ollama.think': true },
      }).type,
    ).toBe('UpdateSettings');
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'UpdateSettings',
        values: { 'commands.allow': ['git status', 'dotnet test'] },
      }).type,
    ).toBe('UpdateSettings');
    for (const values of [
      { 'bad key!': 'x' },
      { 'ui.language': { nested: true } },
      { 'commands.allow': ['ok', 42] },
      { 'commands.allow': Array.from({ length: 51 }, () => 'cmd') },
      Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}.x`, 'v'])),
    ])
      expect(() =>
        validateMessage({ protocolVersion: 1, requestId: 'x', type: 'UpdateSettings', values }),
      ).toThrow();
  });
  it('does not forward file-write content to activity summaries', () => {
    const event = projectEvent({
      type: 'ToolRequested',
      call: {
        id: '1',
        name: 'write_file',
        arguments: { path: 'app.ts', content: 'secret file body' },
      },
      sourceLabel: 'Built-in',
    });
    expect(JSON.stringify(event)).not.toContain('secret file body');
    expect(JSON.stringify(event)).toContain('app.ts');
  });
});
