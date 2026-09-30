import type { Guardrail } from './Guardrail.js';
import type { PermissionRequest } from './PermissionRequest.js';
import type { PolicyDecision } from './PolicyDecision.js';
import type { CancellationToken } from '../common/CancellationToken.js';

export class ProtectedPathGuardrail implements Guardrail {
  readonly id = 'ProtectedPaths';
  async evaluate(
    request: PermissionRequest,
    cancellation: CancellationToken,
  ): Promise<PolicyDecision> {
    cancellation.throwIfCancellationRequested();
    return request.prepared.paths.some((entry) => entry.access === 'Write' && entry.path.protected)
      ? {
          action: 'RequireApproval',
          reasons: [
            'Writing executable configuration or protected workspace metadata requires explicit approval',
          ],
        }
      : { action: 'Allow', reasons: [] };
  }
}
