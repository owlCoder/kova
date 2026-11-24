import { opendir } from 'node:fs/promises';
import { dirname, extname, posix, resolve } from 'node:path';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { CodeIndex, CodeIndexQuery } from '../../../core/src/indexing/CodeIndex.js';
import type {
  CodeSymbol,
  CodeSymbolKind,
  DependencyEdge,
  IndexedSnippet,
} from '../../../core/src/indexing/CodeSymbol.js';
import { RelevanceRanker } from '../../../core/src/indexing/RelevanceRanker.js';
import { BoundedTextFile } from '../adapters/BoundedTextFile.js';
import { NodeWorkspacePathGuard } from '../adapters/NodeWorkspacePathGuard.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.venv',
  'venv',
  '.vscode-test',
  '.cache',
  'target',
]);

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.cs',
  '.java',
]);

const MAX_INDEXED_FILES = 500;
const MAX_FILE_BYTES = 256_000;
const SNIPPET_LINE_SPAN = 40;

interface FileRecord {
  readonly symbols: readonly CodeSymbol[];
  readonly edges: readonly DependencyEdge[];
  readonly snippets: readonly IndexedSnippet[];
}

function normalizeRelPath(relPath: string): string {
  return relPath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function extractSymbols(relativePath: string, content: string): readonly CodeSymbol[] {
  const lines = content.split('\n');
  const symbols: CodeSymbol[] = [];
  const patterns: ReadonlyArray<{ readonly regex: RegExp; readonly kind: CodeSymbolKind }> = [
    {
      regex: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/,
      kind: 'Class',
    },
    { regex: /^(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)/, kind: 'Interface' },
    { regex: /^(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/, kind: 'TypeAlias' },
    {
      regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/,
      kind: 'Function',
    },
    { regex: /^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/, kind: 'Constant' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? '';
    const exported = trimmed.startsWith('export ');
    for (const { regex, kind } of patterns) {
      const match = regex.exec(trimmed);
      if (match?.[1]) {
        const name = match[1];
        const endLine = Math.min(lines.length, i + SNIPPET_LINE_SPAN);
        symbols.push({
          id: `${relativePath}:${name}:${i + 1}`,
          name,
          kind,
          relativePath,
          startLine: i + 1,
          endLine,
          exported,
          signature: trimmed.slice(0, 120),
        });
        break;
      }
    }
  }
  return symbols;
}

function extractEdges(relativePath: string, content: string): readonly DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const importRegex = /^import\s+(?:type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"]/gm;
  const fromDir = posix.dirname(relativePath);

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const clause = match[1]?.trim() ?? '';
    const specifier = match[2] ?? '';
    const targetPath = specifier.startsWith('.')
      ? posix.normalize(posix.join(fromDir, specifier.replace(/\.js$/, '.ts')))
      : specifier;

    const importedSymbols = clause
      .replace(/[{}*]/g, ' ')
      .split(/[,\s]+/)
      .map((s) => s.replace(/^type$/, '').trim())
      .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

    edges.push({
      fromPath: relativePath,
      toPath: targetPath,
      importedSymbols,
    });
  }
  return edges;
}

function buildSnippets(
  relativePath: string,
  content: string,
  symbols: readonly CodeSymbol[],
): readonly IndexedSnippet[] {
  const lines = content.split('\n');
  const snippets: IndexedSnippet[] = [];

  for (let startIdx = 0; startIdx < lines.length; startIdx += SNIPPET_LINE_SPAN) {
    const endIdx = Math.min(lines.length, startIdx + SNIPPET_LINE_SPAN);
    const startLine = startIdx + 1;
    const endLine = endIdx;
    const chunkLines = lines.slice(startIdx, endIdx);
    const chunkText = chunkLines.join('\n').trim();
    if (!chunkText) continue;

    const symbolNames = symbols
      .filter((sym) => sym.startLine >= startLine && sym.startLine <= endLine)
      .map((sym) => sym.name);

    snippets.push({
      id: `${relativePath}:${startLine}-${endLine}`,
      relativePath,
      content: chunkLines.join('\n'),
      startLine,
      endLine,
      symbolNames,
    });
  }

  return snippets;
}

export class WorkspaceCodeIndex implements CodeIndex {
  private readonly guard: NodeWorkspacePathGuard;
  private readonly reader = new BoundedTextFile();
  private readonly ranker = new RelevanceRanker();
  private readonly files = new Map<string, FileRecord>();

  constructor(private readonly root: string) {
    this.guard = new NodeWorkspacePathGuard(root);
  }

  private resolveRoot(workspaceId: string): string {
    return workspaceId && workspaceId !== this.root ? resolve(this.root, workspaceId) : this.root;
  }

  private async indexSingleFile(
    workspaceRoot: string,
    relativePath: string,
    cancellation: CancellationToken,
  ): Promise<FileRecord | null> {
    cancellation.throwIfCancellationRequested();
    const normalized = normalizeRelPath(relativePath);
    if (!CODE_EXTENSIONS.has(extname(normalized).toLowerCase())) return null;

    try {
      const resolved = await this.guard.resolve(workspaceRoot, normalized, 'Read', cancellation);
      if (!resolved.exists || resolved.protected) return null;
      const { content } = await this.reader.read(
        resolved.canonicalPath,
        cancellation,
        MAX_FILE_BYTES,
      );
      cancellation.throwIfCancellationRequested();
      const symbols = extractSymbols(normalized, content);
      const edges = extractEdges(normalized, content);
      const snippets = buildSnippets(normalized, content, symbols);
      return { symbols, edges, snippets };
    } catch {
      cancellation.throwIfCancellationRequested();
      return null;
    }
  }

  private async collectCodeFiles(
    workspaceRoot: string,
    cancellation: CancellationToken,
  ): Promise<readonly string[]> {
    const found: string[] = [];
    const queue: string[] = ['.'];
    let scanned = 0;

    while (queue.length > 0 && found.length < MAX_INDEXED_FILES && scanned < 5000) {
      cancellation.throwIfCancellationRequested();
      const currentDir = queue.shift()!;
      try {
        const resolved = await this.guard.resolve(workspaceRoot, currentDir, 'Read', cancellation);
        if (!resolved.exists || resolved.protected) continue;
        for await (const entry of await opendir(resolved.canonicalPath)) {
          cancellation.throwIfCancellationRequested();
          if (++scanned > 5000 || found.length >= MAX_INDEXED_FILES) break;
          if (entry.isSymbolicLink()) continue;
          const rel = currentDir === '.' ? entry.name : `${currentDir}/${entry.name}`;
          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) queue.push(rel);
          } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
            found.push(normalizeRelPath(rel));
          }
        }
      } catch {
        cancellation.throwIfCancellationRequested();
      }
    }

    return found;
  }

  async refresh(
    workspaceId: string,
    changedPaths: readonly string[] | null,
    cancellation: CancellationToken,
  ): Promise<void> {
    cancellation.throwIfCancellationRequested();
    const workspaceRoot = this.resolveRoot(workspaceId);

    if (changedPaths !== null) {
      for (const rawPath of changedPaths) {
        cancellation.throwIfCancellationRequested();
        const normalized = normalizeRelPath(rawPath);
        const record = await this.indexSingleFile(workspaceRoot, normalized, cancellation);
        if (record) {
          this.files.set(normalized, record);
        } else {
          this.files.delete(normalized);
        }
      }
      return;
    }

    const allPaths = await this.collectCodeFiles(workspaceRoot, cancellation);
    const activeSet = new Set(allPaths);
    for (const existingPath of this.files.keys()) {
      if (!activeSet.has(existingPath)) this.files.delete(existingPath);
    }

    for (const relPath of allPaths) {
      const record = await this.indexSingleFile(workspaceRoot, relPath, cancellation);
      if (record) {
        this.files.set(relPath, record);
      } else {
        this.files.delete(relPath);
      }
    }
  }

  async searchSymbols(
    _workspaceId: string,
    query: string,
    maxResults: number,
    cancellation: CancellationToken,
  ): Promise<readonly CodeSymbol[]> {
    cancellation.throwIfCancellationRequested();
    const needle = query.trim().toLowerCase();
    if (!needle || maxResults <= 0) return [];

    const matches: CodeSymbol[] = [];
    for (const record of this.files.values()) {
      for (const sym of record.symbols) {
        if (
          sym.name.toLowerCase().includes(needle) ||
          sym.relativePath.toLowerCase().includes(needle)
        ) {
          matches.push(sym);
          if (matches.length >= maxResults) return matches;
        }
      }
    }
    return matches;
  }

  async findRelevantSnippets(
    _workspaceId: string,
    query: CodeIndexQuery,
    cancellation: CancellationToken,
  ): Promise<readonly IndexedSnippet[]> {
    cancellation.throwIfCancellationRequested();
    if (query.maxSnippets <= 0) return [];

    const allSnippets: IndexedSnippet[] = [];
    const allEdges: DependencyEdge[] = [];
    for (const record of this.files.values()) {
      allSnippets.push(...record.snippets);
      allEdges.push(...record.edges);
    }

    return this.ranker.rank(allSnippets, allEdges, query).map((item) => item.snippet);
  }

  async getDependencies(
    _workspaceId: string,
    relativePath: string,
    cancellation: CancellationToken,
  ): Promise<readonly DependencyEdge[]> {
    cancellation.throwIfCancellationRequested();
    const normalized = normalizeRelPath(relativePath);
    const edges: DependencyEdge[] = [];
    const targetDir = dirname(normalized);
    void targetDir;

    for (const record of this.files.values()) {
      for (const edge of record.edges) {
        if (edge.fromPath === normalized || edge.toPath === normalized) {
          edges.push(edge);
        }
      }
    }
    return edges;
  }
}
