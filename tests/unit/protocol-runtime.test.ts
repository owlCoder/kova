import { describe, expect, it } from 'vitest';
import { validateMessage } from '../../packages/vscode/src/webview/validateMessage.js';
import { projectEvent } from '../../packages/vscode/src/webview/projectEvent.js';

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
