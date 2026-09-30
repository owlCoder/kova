import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';
import type { AgentMode } from '../../packages/core/src/agents/AgentMode.js';
import type { ChatMessage } from '../../packages/core/src/providers/ChatMessage.js';
import type { HookReport } from '../../packages/core/src/hooks/HookReport.js';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';
import type { PresentationEvent } from '../../packages/protocol/src/PresentationEvent.js';
import type { WebviewMessage } from '../../packages/protocol/src/WebviewMessage.js';

describe('compile-time contract assertions', () => {
  it('defines exactly four modes', () => {
    expectTypeOf<AgentMode>().toEqualTypeOf<'Plan' | 'Manual' | 'Edit' | 'Auto'>();
  });

  it('conversation messages cannot store model thinking', () => {
    expectTypeOf<Extract<ChatMessage, { role: 'assistant' }>>().not.toHaveProperty('thinking');
  });

  it('hooks cannot grant approval or replace arguments', () => {
    expectTypeOf<HookReport['outcome']>().toEqualTypeOf<'Observed' | 'Vetoed' | 'Failed'>();
    expectTypeOf<HookReport>().not.toHaveProperty('arguments');
  });

  it('UI intents cannot request arbitrary tool execution', () => {
    expectTypeOf<Extract<WebviewMessage, { type: 'ExecuteTool' }>>().toBeNever();
    expectTypeOf<Extract<WebviewMessage, { type: 'SubmitPrompt' }>>().not.toHaveProperty(
      'toolsEnabled',
    );
  });

  it('approval requires run ID and preview preparation identity', () => {
    const message: WebviewMessage = {
      protocolVersion: 1,
      requestId: 'req-1',
      type: 'ResolveApproval',
      runId: 'run-1',
      approvalId: 'approval-1',
      preparationKey: 'prepared-1',
      decision: 'AllowOnce',
    };
    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });

  it('presentation approval does not transport before/after file content', () => {
    type Preview = NonNullable<
      Extract<PresentationEvent, { type: 'ToolAwaitingApproval' }>['request']['preview']
    >;
    expectTypeOf<Extract<Preview, { kind: 'FileChanges' }>>().not.toHaveProperty('changes');
    expectTypeOf<Extract<Preview, { kind: 'FileChanges' }>>().toHaveProperty('relativePaths');
  });

  it('core and presentation preserve explicit loop-stop reasons', () => {
    expectTypeOf<Extract<AgentEvent, { type: 'AgentLoopStopped' }>['reason']>().toEqualTypeOf<
      'IterationLimit' | 'RepeatedToolCall' | 'MalformedToolCall'
    >();
  });

  it('host event envelope is plain JSON with stable run/sequence association', () => {
    const message: HostMessage = {
      protocolVersion: 1,
      hostSessionId: 'host-1',
      sequence: 4,
      workspaceId: 'workspace-1',
      type: 'Event',
      runId: 'run-1',
      event: { type: 'ResponseDelta', messageId: 'message-1', text: 'Hello' },
    };
    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });
});
