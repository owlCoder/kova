import type { CancellationToken } from '../common/CancellationToken.js';

/** Project rules kept in the workspace's AGENTS.md; null when the workspace has none. */
export interface ProjectInstructionsRepository {
  read(workspaceId: string, cancellation: CancellationToken): Promise<string | null>;
}
