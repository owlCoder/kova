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
  it('validates SetWorkspaceRoot paths', () => {
    expect(() =>
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'SetWorkspaceRoot',
        path: '/Users/danijel/Desktop/kova',
      }),
    ).not.toThrow();
    for (const path of ['', '   ', 'x'.repeat(513), 'a\0b', 42])
      expect(() =>
        validateMessage({ protocolVersion: 1, requestId: 'x', type: 'SetWorkspaceRoot', path }),
      ).toThrow();
  });
  it('validates @mention messages with bounded path and query', () => {
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'AttachPath',
        path: 'Domain/User.cs',
      }).type,
    ).toBe('AttachPath');
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'ListWorkspaceFiles',
        query: 'user',
      }).type,
    ).toBe('ListWorkspaceFiles');
    for (const bad of [
      { protocolVersion: 1, requestId: 'x', type: 'AttachPath', path: '' },
      { protocolVersion: 1, requestId: 'x', type: 'AttachPath', path: 'x'.repeat(513) },
      { protocolVersion: 1, requestId: 'x', type: 'ListWorkspaceFiles', query: 'q'.repeat(101) },
      { protocolVersion: 1, requestId: 'x', type: 'ListWorkspaceFiles' },
      { protocolVersion: 1, requestId: 'x', type: 'AttachPath', path: 'a.cs', extra: 1 },
    ])
      expect(() => validateMessage(bad)).toThrow();
  });
  it('validates RenameConversation with uuid and bounded title', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'RenameConversation',
        conversationId: id,
        title: 'Chat',
      }).type,
    ).toBe('RenameConversation');
    for (const bad of [
      {
        protocolVersion: 1,
        requestId: 'x',
        type: 'RenameConversation',
        conversationId: 'nope',
        title: 'x',
      },
      {
        protocolVersion: 1,
        requestId: 'x',
        type: 'RenameConversation',
        conversationId: id,
        title: '',
      },
      {
        protocolVersion: 1,
        requestId: 'x',
        type: 'RenameConversation',
        conversationId: id,
        title: 't'.repeat(81),
      },
    ])
      expect(() => validateMessage(bad)).toThrow();
  });
  it('validates AttachImage with whitelisted mime and bounded base64', () => {
    const ok = {
      protocolVersion: 1,
      requestId: 'x',
      type: 'AttachImage',
      name: 'shot.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    };
    expect(validateMessage(ok).type).toBe('AttachImage');
    for (const bad of [
      { ...ok, mimeType: 'image/svg+xml' },
      { ...ok, dataUrl: 'data:image/png;base64,not base64!!' },
      { ...ok, dataUrl: `data:image/png;base64,${'A'.repeat(8_000_001)}` },
      { ...ok, name: '' },
    ])
      expect(() => validateMessage(bad)).toThrow();
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
  it('accepts OpenConversation only with a uuid conversation id', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'OpenConversation',
        conversationId: id,
      }).type,
    ).toBe('OpenConversation');
    for (const conversationId of ['not-a-uuid', '', '../../etc', id.toUpperCase()]) {
      expect(() =>
        validateMessage({
          protocolVersion: 1,
          requestId: 'x',
          type: 'OpenConversation',
          conversationId,
        }),
      ).toThrow();
    }
    expect(() =>
      validateMessage({ protocolVersion: 1, requestId: 'x', type: 'OpenConversation' }),
    ).toThrow();
  });
  it('accepts slash-command intents like CompactConversation', () => {
    expect(
      validateMessage({ protocolVersion: 1, requestId: 'x', type: 'CompactConversation' }).type,
    ).toBe('CompactConversation');
    expect(() =>
      validateMessage({
        protocolVersion: 1,
        requestId: 'x',
        type: 'CompactConversation',
        extra: true,
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
  it('caps before/after text in the approval preview', () => {
    const big = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const event = projectEvent({
      type: 'ToolAwaitingApproval',
      request: {
        approvalId: 'a1',
        runId: 'r1',
        preparationKey: 'p1',
        call: { id: 'c1', name: 'apply_patch', arguments: {} },
        risk: 'WorkspaceWrite',
        reasons: ['writes files'],
        preview: {
          kind: 'FileChanges',
          changes: [
            {
              relativePath: 'src/big.ts',
              operation: 'Replace',
              beforeContent: big,
              afterContent: `${big}\nmore`,
              expectedVersion: null,
            },
            {
              relativePath: 'src/new.ts',
              operation: 'Create',
              beforeContent: null,
              afterContent: 'hello',
              expectedVersion: null,
            },
          ],
        },
      },
    });
    expect(event.type).toBe('ToolAwaitingApproval');
    if (event.type !== 'ToolAwaitingApproval') return;
    const preview = event.request.preview;
    if (preview?.kind !== 'FileChanges') throw new Error('expected file changes preview');
    expect(preview.changes[0]?.after.split('\n')).toHaveLength(200);
    expect(preview.changes[0]?.truncated).toBe(true);
    expect(preview.changes[1]?.before).toBeNull();
    expect(preview.changes[1]?.after).toBe('hello');
    expect(preview.changes[1]?.truncated).toBe(false);
  });
});
