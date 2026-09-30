import type { CancellationToken } from '../common/CancellationToken.js';
import type { ApprovalRequest, ApprovalResponse } from './ApprovalRequest.js';

/** Cancellation rejects pending approval; there is no remembered/session approval in v1. */
export interface ApprovalPort {
  request(request: ApprovalRequest, cancellation: CancellationToken): Promise<ApprovalResponse>;
}
