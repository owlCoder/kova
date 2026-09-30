import type { PermissionRequest } from './PermissionRequest.js';
import type { PolicyDecision } from './PolicyDecision.js';
import { CommandRiskClassifier } from './CommandRiskClassifier.js';

export class PermissionPolicy {
  evaluate(request: PermissionRequest): PolicyDecision {
    if (request.risk === 'Destructive')
      return { action: 'Block', reasons: ['Destructive operations are blocked in every mode'] };
    if (request.mode === 'Plan' && request.risk !== 'ReadOnly')
      return { action: 'Block', reasons: ['Plan mode permits read-only operations'] };
    if (request.risk === 'ReadOnly') return { action: 'Allow', reasons: [] };
    if (request.mode === 'Manual')
      return {
        action: 'RequireApproval',
        reasons: ['Manual mode requires approval for state changes'],
      };
    if (request.risk === 'WorkspaceWrite') return { action: 'Allow', reasons: [] };
    if (
      request.mode === 'Auto' &&
      request.prepared.command &&
      new CommandRiskClassifier().matches(request.prepared.command, request.commandAllowlist)
    )
      return { action: 'Allow', reasons: [] };
    return {
      action: 'RequireApproval',
      reasons: [
        request.mode === 'Auto'
          ? 'Command is not on the exact command allowlist'
          : 'Process execution requires approval',
      ],
    };
  }
}
