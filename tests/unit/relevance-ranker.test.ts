import { describe, expect, it } from 'vitest';
import { RelevanceRanker } from '../../packages/core/src/indexing/RelevanceRanker.js';
import type {
  DependencyEdge,
  IndexedSnippet,
} from '../../packages/core/src/indexing/CodeSymbol.js';

const makeSnippet = (
  id: string,
  relativePath: string,
  content: string,
  symbolNames: readonly string[] = [],
): IndexedSnippet => ({
  id,
  relativePath,
  content,
  startLine: 1,
  endLine: 10,
  symbolNames,
});

describe('RelevanceRanker', () => {
  const ranker = new RelevanceRanker();

  it('prioritizes focus files, dependency neighbors, and symbol matches up to maxSnippets', () => {
    const snippets: readonly IndexedSnippet[] = [
      makeSnippet('s1', 'src/other.ts', 'mentioning token budget here', []),
      makeSnippet('s2', 'src/ranker.ts', 'ranks symbols', ['RelevanceRanker']),
      makeSnippet('s3', 'src/builder.ts', 'builds context budget', ['ContextBuilder']),
      makeSnippet('s4', 'src/unrelated.ts', 'completely different text', []),
    ];

    const edges: readonly DependencyEdge[] = [
      {
        fromPath: 'src/builder.ts',
        toPath: 'src/ranker.ts',
        importedSymbols: ['RelevanceRanker'],
      },
    ];

    const ranked = ranker.rank(snippets, edges, {
      queryText: 'how does RelevanceRanker handle budget',
      focusPaths: ['src/builder.ts'],
      maxSnippets: 2,
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.snippet.id).toBe('s3');
    expect(ranked[1]?.snippet.id).toBe('s2');
    expect((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0)).toBe(true);
  });

  it('excludes snippets with zero score outside focus paths', () => {
    const snippets: readonly IndexedSnippet[] = [
      makeSnippet('s1', 'src/a.ts', 'nothing matches', []),
    ];

    const ranked = ranker.rank(snippets, [], {
      queryText: 'database migration',
      focusPaths: [],
      maxSnippets: 5,
    });

    expect(ranked).toEqual([]);
  });
});
