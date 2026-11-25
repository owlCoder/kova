import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PresentationEvent } from '../../packages/protocol/src/PresentationEvent.js';
import type { SessionSnapshot } from '../../packages/protocol/src/SessionSnapshot.js';
import { applyTimelineEvent, type TimelineEntry } from '../../webview/src/state/timeline.js';
import { Conversation } from '../../webview/src/components/Conversation.js';
import { toolLabel } from '../../webview/src/components/toolLabel.js';
import { I18nProvider } from '../../webview/src/i18n/I18n.js';

const fold = (events: readonly PresentationEvent[], anchor = 1) =>
  events.reduce<readonly TimelineEntry[]>(
    (entries, event, index) => applyTimelineEvent(entries, event, anchor, index + 1),
    [],
  );
const result = (status: 'Success' | 'Error', output: string, error: string | null = null) => ({
  callId: 'c1',
  toolName: 'read_file',
  status,
  output,
  error: error ? { code: 'E', message: error, details: {} } : null,
  omittedCharacters: 0,
  durationMs: 12,
});
const request = {
  type: 'ToolRequested',
  callId: 'c1',
  toolName: 'read_file',
  sourceLabel: 'Built-in',
  argumentSummary: 'src/App.cs',
} as const;

describe('transcript timeline', () => {
  it('follows one tool call from request to its final status without duplicates', () => {
    const entries = fold([
      request,
      request,
      { type: 'ToolStarted', callId: 'c1' },
      { type: 'ToolCompleted', callId: 'c1', result: result('Success', 'line 1\nline 2') },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'tool',
      anchor: 1,
      status: 'Success',
      summary: 'src/App.cs',
      output: 'line 1\nline 2',
      durationMs: 12,
    });
  });

  it('marks the pending call for approval, then denial, and cancels unfinished calls', () => {
    const approval = {
      type: 'ToolAwaitingApproval',
      request: {
        approvalId: 'a',
        runId: 'r',
        preparationKey: 'k',
        toolName: 'write_file',
        risk: 'WorkspaceWrite',
        reasons: [],
        preview: null,
      },
    } as const;
    expect(fold([request, approval])[0]).toMatchObject({ status: 'AwaitingApproval' });
    expect(fold([request, approval, { type: 'ToolDenied', callId: 'c1' }])[0]).toMatchObject({
      status: 'Denied',
    });
    const cancelled = fold([request, { type: 'GenerationCancelled' }]);
    expect(cancelled[0]).toMatchObject({ status: 'Cancelled' });
    expect(cancelled[1]).toMatchObject({ kind: 'note', text: 'Interrupted', tone: 'warning' });
  });

  it('keeps errors, blocks and lifecycle notes and ignores allowed guardrails', () => {
    const entries = fold([
      request,
      { type: 'ToolCompleted', callId: 'c1', result: result('Error', '', 'Not found') },
      { type: 'GuardrailEvaluated', callId: 'c1', decision: { action: 'Allow', reasons: [] } },
      { type: 'ProjectInstructionsLoaded', relativePath: 'AGENTS.md' },
      { type: 'ErrorOccurred', code: 'ProviderUnavailable', message: 'offline', recoverable: true },
      { type: 'ErrorOccurred', code: 'StreamFailed', message: 'down', recoverable: true },
    ] as PresentationEvent[]);
    // Connection problems belong to the composer banner, not the transcript.
    expect(entries.some((entry) => entry.kind === 'note' && entry.detail === 'offline')).toBe(
      false,
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['tool', 'note', 'note']);
    expect(entries[0]).toMatchObject({ status: 'Error', detail: 'Not found' });
    expect(entries[2]).toMatchObject({ tone: 'error', detail: 'down' });
  });

  it('bounds retained entries', () => {
    const events = Array.from({ length: 260 }, (_, i) => ({
      type: 'ProjectInstructionsLoaded' as const,
      relativePath: `rules-${i}.md`,
    }));
    const entries = fold(events);
    expect(entries).toHaveLength(200);
    expect(entries.at(-1)).toMatchObject({
      text: 'Project rules · {path}',
      values: { path: 'rules-259.md' },
    });
  });

  it('names built-in and MCP tools briefly', () => {
    expect(toolLabel('read_file')).toBe('Read');
    expect(toolLabel('run_command')).toBe('Run');
    expect(toolLabel('mcp__ers__reserve_room')).toBe('ers · reserve_room');
    expect(toolLabel('custom_tool')).toBe('Custom tool');
  });

  it('renders tool rows after the message they follow and the approval prompt last', () => {
    const snapshot: SessionSnapshot = {
      conversationId: 'c',
      activeRunId: 'r',
      state: 'AwaitingApproval',
      mode: 'Manual',
      selectedModelId: 'm',
      models: [],
      providerStatus: 'Available',
      providerLabel: 'Local',
      setupCompleted: true,
      configuringProvider: false,
      toolsEnabled: true,
      skills: [],
      activeSkillId: null,
      usage: null,
      messages: [
        { id: '1', role: 'user', content: 'First question', partial: false },
        { id: '2', role: 'assistant', content: 'Reading now', partial: false },
      ],
      contextAttachments: [],
      pendingApproval: {
        approvalId: 'a',
        runId: 'r',
        preparationKey: 'k',
        toolName: 'run_command',
        risk: 'ProcessExecution',
        reasons: [],
        preview: { kind: 'Command', command: 'dotnet test', relativeWorkingDirectory: '.' },
      },
      thinkingEnabled: false,
      contextMaxTokens: 4096,
    };
    const html = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot,
        thinking: {},
        timeline: fold([request], 2),
        runStartedAt: null,
        busy: true,
        onReuse: () => {},
        onSavePrompt: () => {},
        scroller: { current: null },
        searching: false,
        followLatest: true,
      }),
    );
    const order = ['First question', 'Reading now', 'src/App.cs', 'dotnet test'].map((text) =>
      html.indexOf(text),
    );
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('Yes, allow once');
    // The approval replaces the working indicator while Kova waits.
    expect(html).not.toContain('working-indicator');
  });

  it('renders lifecycle notes through t() with their placeholder values', () => {
    const snapshot: SessionSnapshot = {
      conversationId: 'c',
      activeRunId: null,
      state: 'Idle',
      mode: 'Manual',
      selectedModelId: 'm',
      models: [],
      providerStatus: 'Available',
      providerLabel: 'Local',
      setupCompleted: true,
      configuringProvider: false,
      toolsEnabled: true,
      skills: [],
      activeSkillId: null,
      usage: null,
      messages: [{ id: '1', role: 'user', content: 'Hi', partial: false }],
      contextAttachments: [],
      pendingApproval: null,
      thinkingEnabled: false,
      contextMaxTokens: 4096,
    };
    const timeline = fold([{ type: 'ProjectInstructionsLoaded', relativePath: 'AGENTS.md' }], 1);
    const render = (language: 'en' | 'sr') =>
      renderToStaticMarkup(
        createElement(I18nProvider, {
          language,
          children: createElement(Conversation, {
            snapshot,
            thinking: {},
            timeline,
            runStartedAt: null,
            busy: false,
            onReuse: () => {},
            onSavePrompt: () => {},
            scroller: { current: null },
            searching: false,
            followLatest: true,
          }),
        }),
      );
    expect(render('en')).toContain('Project rules · AGENTS.md');
    expect(render('sr')).toContain('Projektna pravila · AGENTS.md');
  });
});
