import type { CancellationToken } from '../common/CancellationToken.js';

export interface GitReader {
  diff(
    workspaceId: string,
    staged: boolean,
    relativePath: string | null,
    cancellation: CancellationToken,
  ): Promise<string>;
}
