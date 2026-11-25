import type { CodeIndexQuery } from './CodeIndex.js';
import type { DependencyEdge, IndexedSnippet } from './CodeSymbol.js';

const STOP_WORDS = new Set([
  'how',
  'does',
  'do',
  'the',
  'what',
  'is',
  'are',
  'and',
  'for',
  'this',
  'that',
  'with',
  'from',
  'can',
  'you',
  'work',
  'works',
  'in',
  'of',
  'to',
]);

function tokenize(text: string): string[] {
  const terms = new Set<string>();
  for (const word of text.split(/[^A-Za-z0-9]+/)) {
    if (!word) continue;
    const parts = word
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(' ');
    for (const part of parts) terms.add(part);
  }
  return [...terms].filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
}

export interface RankedSnippet {
  readonly snippet: IndexedSnippet;
  readonly score: number;
}

export class RelevanceRanker {
  rank(
    snippets: readonly IndexedSnippet[],
    edges: readonly DependencyEdge[],
    query: CodeIndexQuery,
  ): readonly RankedSnippet[] {
    const terms = tokenize(query.queryText);
    const focusSet = new Set(query.focusPaths ?? []);
    const relatedToFocus = new Set<string>();

    for (const edge of edges) {
      if (focusSet.has(edge.fromPath)) relatedToFocus.add(edge.toPath);
      if (focusSet.has(edge.toPath)) relatedToFocus.add(edge.fromPath);
    }

    const scored = snippets.map((snippet) => {
      let score = 0;
      const hay =
        `${snippet.relativePath} ${snippet.symbolNames.join(' ')} ${snippet.content}`.toLowerCase();

      if (focusSet.has(snippet.relativePath)) score += 10;
      if (relatedToFocus.has(snippet.relativePath)) score += 5;

      for (const term of terms) {
        if (snippet.symbolNames.some((name) => name.toLowerCase().includes(term))) {
          score += 4;
        }
        if (snippet.relativePath.toLowerCase().includes(term)) {
          score += 3;
        }
        if (hay.includes(term)) {
          score += 1;
        }
      }

      return { snippet, score };
    });

    return scored
      .filter((item) => item.score > 0 || focusSet.has(item.snippet.relativePath))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, query.maxSnippets));
  }
}
