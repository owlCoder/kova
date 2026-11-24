import type { CancellationToken } from '../common/CancellationToken.js';
import type { CodeSymbol, DependencyEdge, IndexedSnippet } from './CodeSymbol.js';

export interface CodeIndexQuery {
  readonly queryText: string;
  readonly focusPaths?: readonly string[];
  readonly maxSnippets: number;
}

export interface CodeIndex {
  refresh(
    workspaceId: string,
    changedPaths: readonly string[] | null,
    cancellation: CancellationToken,
  ): Promise<void>;
  searchSymbols(
    workspaceId: string,
    query: string,
    maxResults: number,
    cancellation: CancellationToken,
  ): Promise<readonly CodeSymbol[]>;
  findRelevantSnippets(
    workspaceId: string,
    query: CodeIndexQuery,
    cancellation: CancellationToken,
  ): Promise<readonly IndexedSnippet[]>;
  getDependencies(
    workspaceId: string,
    relativePath: string,
    cancellation: CancellationToken,
  ): Promise<readonly DependencyEdge[]>;
}
