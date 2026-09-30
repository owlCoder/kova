import type { CancellationToken } from '../common/CancellationToken.js';

export interface WorkspaceSearch {
  search(
    workspaceId: string,
    query: string,
    glob: string | null,
    maxResults: number,
    cancellation: CancellationToken,
  ): Promise<
    readonly { readonly relativePath: string; readonly line: number; readonly text: string }[]
  >;
}
