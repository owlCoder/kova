import { dirname, extname, join, posix } from 'node:path';
import { Language, Parser } from 'web-tree-sitter';
import type { Node } from 'web-tree-sitter';
import type {
  CodeSymbol,
  CodeSymbolKind,
  DependencyEdge,
} from '../../../core/src/indexing/CodeSymbol.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

declare const __dirname: string | undefined;

const here: string =
  typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url));

const GRAMMAR_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
};

const DECLARATION_KINDS: Readonly<Record<string, CodeSymbolKind>> = {
  class_declaration: 'Class',
  abstract_class_declaration: 'Class',
  interface_declaration: 'Interface',
  type_alias_declaration: 'TypeAlias',
  function_declaration: 'Function',
};

export class TreeSitterSymbolExtractor {
  private initialized: Promise<void> | null = null;
  private readonly parsers = new Map<string, Parser>();

  supports(relativePath: string): boolean {
    return extname(relativePath).toLowerCase() in GRAMMAR_BY_EXTENSION;
  }

  async extractSymbols(
    relativePath: string,
    content: string,
  ): Promise<readonly CodeSymbol[] | null> {
    const grammar = GRAMMAR_BY_EXTENSION[extname(relativePath).toLowerCase()];
    if (!grammar) return null;
    const parser = await this.parserFor(grammar);
    const tree = parser.parse(content);
    if (!tree) return null;
    try {
      return this.collect(relativePath, tree.rootNode);
    } finally {
      tree.delete();
    }
  }

  /** Import/re-export edges. Returns null when unsupported so the caller can fall back. */
  async extractEdges(
    relativePath: string,
    content: string,
  ): Promise<readonly DependencyEdge[] | null> {
    const grammar = GRAMMAR_BY_EXTENSION[extname(relativePath).toLowerCase()];
    if (!grammar) return null;
    const parser = await this.parserFor(grammar);
    const tree = parser.parse(content);
    if (!tree) return null;
    try {
      const edges: DependencyEdge[] = [];
      const fromDir = posix.dirname(relativePath);
      for (const top of tree.rootNode.namedChildren) {
        if (!top) continue;
        if (top.type !== 'import_statement' && top.type !== 'export_statement') continue;
        const specifier = top.childForFieldName('source')?.text.slice(1, -1);
        if (!specifier) continue; // plain `export const ...` has no source
        const toPath = specifier.startsWith('.')
          ? posix.normalize(posix.join(fromDir, specifier.replace(/\.js$/, '.ts')))
          : specifier;
        const names: string[] = [];
        const collect = (node: Node): void => {
          if (node.type === 'import_specifier' || node.type === 'export_specifier') {
            const name = node.childForFieldName('name')?.text;
            if (name) names.push(name);
            return;
          }
          if (node.type === 'identifier' && node.parent?.type === 'import_clause')
            names.push(node.text);
          for (const child of node.namedChildren) if (child) collect(child);
        };
        collect(top);
        edges.push({ fromPath: relativePath, toPath, importedSymbols: names });
      }
      return edges;
    } finally {
      tree.delete();
    }
  }

  private grammarsDirectory(): string | null {
    // Packaged extension: the bundle is dist/extension/extension.cjs, grammars sit beside it.
    const packaged = join(here, 'grammars');
    return existsSync(packaged) ? packaged : null;
  }

  private async parserFor(grammar: string): Promise<Parser> {
    const directory = this.grammarsDirectory();
    this.initialized ??= Parser.init(
      directory ? { locateFile: (name: string) => join(directory, name) } : undefined,
    );
    await this.initialized;
    const existing = this.parsers.get(grammar);
    if (existing) return existing;
    const wasm = directory
      ? join(directory, `tree-sitter-${grammar}.wasm`)
      : join(
          process.cwd(),
          'node_modules',
          'tree-sitter-wasms',
          'out',
          `tree-sitter-${grammar}.wasm`,
        );
    const parser = new Parser();
    parser.setLanguage(await Language.load(wasm));
    this.parsers.set(grammar, parser);
    return parser;
  }

  private collect(relativePath: string, root: Node): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const add = (
      declaration: Node,
      kind: CodeSymbolKind,
      exported: boolean,
      range: Node = declaration,
    ): void => {
      const name = declaration.childForFieldName('name')?.text;
      if (!name) return;
      symbols.push({
        id: `${relativePath}:${name}:${range.startPosition.row + 1}`,
        name,
        kind,
        relativePath,
        startLine: range.startPosition.row + 1,
        endLine: range.endPosition.row + 1,
        exported,
        signature: range.text.split('\n')[0]?.trim().slice(0, 120) ?? '',
      });
    };

    // Only top-level declarations (and class members), so local variables are ignored.
    for (const top of root.namedChildren) {
      if (!top) continue;
      const exported = top.type === 'export_statement';
      const declaration = exported ? top.childForFieldName('declaration') : top;
      if (!declaration) continue;

      const kind = DECLARATION_KINDS[declaration.type];
      if (kind) {
        add(declaration, kind, exported, top);
        if (kind === 'Class') {
          for (const member of declaration.childForFieldName('body')?.namedChildren ?? []) {
            if (!member) continue;
            if (member.type === 'method_definition') add(member, 'Method', false);
          }
        }
      } else if (declaration.type === 'lexical_declaration') {
        for (const declarator of declaration.namedChildren) {
          if (!declarator || declarator.type !== 'variable_declarator') continue;
          const valueType = declarator.childForFieldName('value')?.type;
          const isFunction = valueType === 'arrow_function' || valueType === 'function_expression';
          add(declarator, isFunction ? 'Function' : 'Constant', exported, top);
        }
      }
    }
    return symbols;
  }
}
