import type { CancellationToken } from '../common/CancellationToken.js';
import type { WorkspacePath } from './WorkspacePath.js';

export interface WorkspaceWriter {
  /** VS Code implementation uses WorkspaceEdit and refuses stale expected versions. */
  replace(
    path: WorkspacePath,
    content: string,
    expectedVersion: string | null,
    cancellation: CancellationToken,
  ): Promise<
    | { readonly status: 'Applied'; readonly version: string }
    | { readonly status: 'Error'; readonly code: 'StaleContent'; readonly message: string }
  >;
}
