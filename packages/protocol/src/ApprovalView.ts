import type { FileChangePreview } from './FileChangePreview.js';
import type { RiskLevel } from './RiskLevel.js';

/**
 * File previews carry only capped before/after text; full contents stay in
 * host-side virtual diff documents.
 */
export interface ApprovalView {
  readonly approvalId: string;
  readonly runId: string;
  readonly preparationKey: string;
  readonly toolName: string;
  readonly risk: RiskLevel;
  readonly reasons: readonly string[];
  readonly preview:
    | {
        readonly kind: 'FileChanges';
        readonly relativePaths: readonly string[];
        readonly canOpenDiff: true;
        readonly changes: readonly FileChangePreview[];
      }
    | {
        readonly kind: 'Command';
        readonly command: string;
        readonly relativeWorkingDirectory: string;
      }
    | { readonly kind: 'Description'; readonly text: string }
    | null;
}
