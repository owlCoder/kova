/** Strictness order: Allow < RequireApproval < Block. All reasons are retained. */
export interface PolicyDecision {
  readonly action: 'Allow' | 'RequireApproval' | 'Block';
  readonly reasons: readonly string[];
}
