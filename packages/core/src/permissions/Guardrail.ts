import type { CancellationToken } from '../common/CancellationToken.js';
import type { PermissionRequest } from './PermissionRequest.js';
import type { PolicyDecision } from './PolicyDecision.js';

export interface Guardrail {
  readonly id: string;
  evaluate(request: PermissionRequest, cancellation: CancellationToken): Promise<PolicyDecision>;
}
