import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { ApprovalPort } from '../../../core/src/permissions/ApprovalPort.js';
import type {
  ApprovalRequest,
  ApprovalResponse,
} from '../../../core/src/permissions/ApprovalRequest.js';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';

export class WebviewApprovalPort implements ApprovalPort, vscode.TextDocumentContentProvider {
  private pending: {
    request: ApprovalRequest;
    resolve: (value: ApprovalResponse) => void;
    reject: (error: Error) => void;
  } | null = null;
  private readonly documents = new Map<string, string>();
  get requestPending(): ApprovalRequest | null {
    return this.pending?.request ?? null;
  }
  async request(
    request: ApprovalRequest,
    cancellation: CancellationToken,
  ): Promise<ApprovalResponse> {
    cancellation.throwIfCancellationRequested();
    if (this.pending) throw new Error('An approval is already pending.');
    return new Promise((resolve, reject) => {
      this.pending = { request, resolve, reject };
      const subscription = cancellation.onCancellationRequested(() => {
        this.pending = null;
        this.documents.clear();
        reject(new Error('Approval cancelled.'));
      });
      const done = resolve;
      this.pending.resolve = (value) => {
        subscription.dispose();
        this.pending = null;
        this.documents.clear();
        done(value);
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
      throw new Error('Stale or mismatched approval.');
    pending.resolve(response);
  }
  async openDiff(approvalId: string): Promise<void> {
    const request = this.pending?.request;
    if (request?.approvalId !== approvalId || request.preview?.kind !== 'FileChanges')
      throw new Error('This diff approval is no longer pending.');
    for (const change of request.preview.changes) {
      const id = randomUUID();
      const before = vscode.Uri.parse(
        `kova-diff:/${id}/before/${encodeURIComponent(change.relativePath)}`,
      );
      const after = vscode.Uri.parse(
        `kova-diff:/${id}/after/${encodeURIComponent(change.relativePath)}`,
      );
      this.documents.set(before.toString(), change.beforeContent ?? '');
      this.documents.set(after.toString(), change.afterContent);
      await vscode.commands.executeCommand(
        'vscode.diff',
        before,
        after,
        `Kova: ${change.relativePath} (proposed)`,
      );
    }
  }
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? '';
  }
  dispose(): void {
    this.pending?.reject(new Error('Approval disposed.'));
    this.pending = null;
    this.documents.clear();
  }
}
