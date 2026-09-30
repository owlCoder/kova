import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import type { PresentationEvent } from '../../../packages/protocol/src/PresentationEvent.js';

export function applyEvent(
  snapshot: SessionSnapshot,
  event: PresentationEvent,
  runId: string | null,
): SessionSnapshot {
  if (event.type === 'StateChanged') return { ...snapshot, state: event.state };
  if (event.type === 'ContextUpdated') return { ...snapshot, usage: event.usage };
  if (event.type === 'ResponseStarted')
    return {
      ...snapshot,
      activeRunId: runId,
      messages: [
        ...snapshot.messages,
        { id: event.messageId, role: 'assistant', content: '', partial: true },
      ],
    };
  if (event.type === 'ResponseDelta')
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId
          ? { ...message, content: (message.content + event.text).slice(0, 65_536) }
          : message,
      ),
    };
  if (event.type === 'ResponseCompleted')
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId ? { ...message, partial: false } : message,
      ),
    };
  if (event.type === 'ToolAwaitingApproval') return { ...snapshot, pendingApproval: event.request };
  if (
    event.type === 'ToolStarted' ||
    event.type === 'ToolDenied' ||
    event.type === 'ToolBlocked' ||
    event.type === 'GenerationCancelled'
  )
    return { ...snapshot, pendingApproval: null };
  return snapshot;
}

export function activityText(event: PresentationEvent): string | null {
  switch (event.type) {
    case 'ConfigurationReloaded':
      return `Configuration reloaded · ${event.changedServers.length} MCP server changes${event.hooksChanged ? ' · hooks updated' : ''}`;
    case 'SkillLoaded':
      return `Skill · ${event.name}`;
    case 'ToolRequested':
      return `${event.toolName} · ${event.sourceLabel}\n${event.argumentSummary}`;
    case 'PolicyEvaluated':
      return `Permission · ${event.risk} · ${event.decision.action}${event.decision.reasons.length ? '\n' + event.decision.reasons.join('\n') : ''}`;
    case 'HookObserved':
      return `Hook · ${event.report.hookId} · ${event.report.outcome}\n${event.report.command} ${event.report.args.join(' ')}\n${event.report.message}`;
    case 'GuardrailEvaluated':
      return `Guardrail · ${event.decision.action}\n${event.decision.reasons.join('\n')}`;
    case 'ToolCompleted':
      return `${event.result.toolName} · ${event.result.status} · ${event.result.durationMs}ms\n${event.result.output}${event.result.omittedCharacters ? `\n[${event.result.omittedCharacters} characters omitted]` : ''}`;
    case 'ToolBlocked':
      return `Blocked · ${event.reasons.join('; ')}`;
    case 'ToolDenied':
      return 'Tool rejected by user';
    case 'ToolValidationFailed':
      return `Tool repair ${event.repairAttempt}/2 · ${event.message}`;
    case 'McpServerStarted':
      return `MCP started · ${event.serverId}\n${event.command} ${event.args.join(' ')}`;
    case 'McpServerStopped':
      return `MCP stopped · ${event.serverId} · ${event.reason}`;
    case 'McpToolCalled':
      return `MCP · ${event.serverId} · ${event.toolName}`;
    case 'AgentLoopStopped':
      return `Agent stopped · ${event.reason}`;
    case 'GenerationCancelled':
      return 'Generation stopped';
    case 'ErrorOccurred':
      return `${event.code} · ${event.message}`;
    case 'ResponseCompleted':
      return event.finishReason === 'Length' ? 'Output token limit reached' : null;
    default:
      return null;
  }
}
