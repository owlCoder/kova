import type { PermissionRequest } from './PermissionRequest.js';
import type { PolicyDecision } from './PolicyDecision.js';

export interface PermissionPolicy {
  evaluate(request: PermissionRequest): PolicyDecision;
}
