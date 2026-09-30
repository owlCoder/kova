import type { CancellationToken } from '../common/CancellationToken.js';
import type { WorkspacePath } from './WorkspacePath.js';

export interface WorkspaceReader {
  read(
    path: WorkspacePath,
    range: { readonly startLine: number; readonly endLine: number } | null,
    cancellation: CancellationToken,
  ): Promise<{ readonly content: string; readonly version: string; readonly totalLines: number }>;
  list(
    path: WorkspacePath,
    cancellation: CancellationToken,
  ): Promise<readonly { readonly name: string; readonly kind: 'File' | 'Directory' | 'Symlink' }[]>;
}
