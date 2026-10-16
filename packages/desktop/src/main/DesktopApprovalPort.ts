import type { ApprovalPort } from '../../../core/src/permissions/ApprovalPort.js';
import type {
  ApprovalRequest,
  ApprovalResponse,
} from '../../../core/src/permissions/ApprovalRequest.js';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';

export class DesktopApprovalPort implements ApprovalPort {
  private pending: {
    request: ApprovalRequest;
    resolve(response: ApprovalResponse): void;
    reject(error: Error): void;
  } | null = null;
  get requestPending(): ApprovalRequest | null {
    return this.pending?.request ?? null;
  }
  request(request: ApprovalRequest, cancellation: CancellationToken): Promise<ApprovalResponse> {
    cancellation.throwIfCancellationRequested();
    if (this.pending) throw new Error('An approval is already pending.');
    return new Promise((resolve, reject) => {
      const subscription = cancellation.onCancellationRequested(() => {
        this.pending = null;
        subscription.dispose();
        reject(new Error('Approval cancelled.'));
      });
      this.pending = {
        request,
        resolve: (response) => {
          subscription.dispose();
          this.pending = null;
          resolve(response);
        },
        reject: (error) => {
          subscription.dispose();
          this.pending = null;
          reject(error);
        },
      };
    });
  }
  resolve(response: ApprovalResponse, runId: string): void {
    const pending = this.pending;
    if (
      !pending ||
      pending.request.runId !== runId ||
      response.approvalId !== pending.request.approvalId ||
      response.preparationKey !== pending.request.preparationKey
    )
      throw new Error('This approval is no longer active.');
    pending.resolve(response);
  }
  dispose(): void {
    this.pending?.reject(new Error('Session closed.'));
  }
}
