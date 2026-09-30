import type { Guardrail } from './Guardrail.js';
import type { PermissionRequest } from './PermissionRequest.js';
import type { PolicyDecision } from './PolicyDecision.js';
import type { CancellationToken } from '../common/CancellationToken.js';

export class GuardrailEvaluator {
  constructor(private readonly guardrails: readonly Guardrail[]) {}
  async evaluate(
    request: PermissionRequest,
    baseline: PolicyDecision,
    cancellation: CancellationToken,
  ): Promise<PolicyDecision> {
    const rank = { Allow: 0, RequireApproval: 1, Block: 2 };
    let action = baseline.action;
    const reasons = [...baseline.reasons];
    for (const guardrail of this.guardrails) {
      cancellation.throwIfCancellationRequested();
      let result: PolicyDecision;
      try {
        result = await guardrail.evaluate(request, cancellation);
      } catch {
        result = { action: 'Block', reasons: [`Guardrail ${guardrail.id} failed`] };
      }
      if (rank[result.action] > rank[action]) action = result.action;
      reasons.push(...result.reasons);
    }
    return { action, reasons: [...new Set(reasons)] };
  }
}
