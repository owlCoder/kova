import type { CancellationToken } from '../common/CancellationToken.js';
import type { PermissionRequest } from './PermissionRequest.js';
import type { PolicyDecision } from './PolicyDecision.js';

export interface GuardrailEvaluator {
  /** Evaluate all guardrails, merging with the existing policy/hook decision by strictness. */
  evaluate(
    request: PermissionRequest,
    previous: PolicyDecision,
    cancellation: CancellationToken,
  ): Promise<PolicyDecision>;
}
