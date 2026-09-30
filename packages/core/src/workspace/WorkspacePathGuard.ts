import type { CancellationToken } from '../common/CancellationToken.js';
import type { WorkspacePath } from './WorkspacePath.js';

export interface WorkspacePathGuard {
  resolve(
    workspaceId: string,
    path: string,
    access: 'Read' | 'Write',
    cancellation: CancellationToken,
  ): Promise<WorkspacePath>;
}
