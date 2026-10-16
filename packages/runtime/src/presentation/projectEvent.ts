import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';
import type { ApprovalRequest } from '../../../core/src/permissions/ApprovalRequest.js';
import type { ApprovalView } from '../../../protocol/src/ApprovalView.js';
import type { PresentationEvent } from '../../../protocol/src/PresentationEvent.js';

export function approvalView(request: ApprovalRequest): ApprovalView {
  const preview = request.preview;
  return {
    approvalId: request.approvalId,
    runId: request.runId,
    preparationKey: request.preparationKey,
    toolName: request.call.name,
    risk: request.risk,
    reasons: [...request.reasons],
    preview:
      preview?.kind === 'FileChanges'
        ? {
            kind: 'FileChanges',
            relativePaths: preview.changes.map((change) => change.relativePath),
            canOpenDiff: true,
          }
        : preview?.kind === 'Command'
          ? {
              kind: 'Command',
              command: preview.command,
              relativeWorkingDirectory: preview.relativeWorkingDirectory,
            }
          : preview?.kind === 'Description'
            ? { kind: 'Description', text: preview.text }
            : null,
  };
}

export function projectEvent(event: AgentEvent): PresentationEvent {
  if (event.type === 'ToolRequested')
    return {
      type: event.type,
      callId: event.call.id,
      toolName: event.call.name,
      sourceLabel: event.sourceLabel,
      argumentSummary: Object.entries(event.call.arguments)
        .map(([key, value]) =>
          ['content', 'old_string', 'new_string'].includes(key)
            ? `${key}: [text omitted]`
            : `${key}: ${JSON.stringify(value).slice(0, 200)}`,
        )
        .join(', '),
    };
  if (event.type === 'ToolAwaitingApproval')
    return { type: event.type, request: approvalView(event.request) };
  // Structural DTO copy at the host boundary; Protocol has no dependency on Core.
  return structuredClone(event);
}
