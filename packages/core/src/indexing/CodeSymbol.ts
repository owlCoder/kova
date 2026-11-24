/* describes a single symbol found in the code */
export type CodeSymbolKind =
  'Class' | 'Interface' | 'TypeAlias' | 'Function' | 'Method' | 'Constant';

export interface CodeSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: CodeSymbolKind;
  readonly relativePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exported: boolean;
  readonly signature?: string;
}

export interface DependencyEdge {
  readonly fromPath: string;
  readonly toPath: string;
  readonly importedSymbols: readonly string[];
}

export interface IndexedSnippet {
  readonly id: string;
  readonly relativePath: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly symbolNames: readonly string[];
}
