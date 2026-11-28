import { describe, expect, it } from 'vitest';
import { TreeSitterSymbolExtractor } from '../../packages/runtime/src/indexing/TreeSitterSymbolExtractor.js';

const source = [
  "import { a } from './a.js';", // 1
  'export class Foo {', // 2
  '  bar(): void {', // 3
  '    const local = 1;', // 4
  '  }', // 5
  '}', // 6
  'export function baz() {}', // 7
  'export interface Opts { x: number }', // 8
  'export type Id = string;', // 9
  'export const k = 1;', // 10
  'export const arrow = () => 1;', // 11
].join('\n');

describe('TreeSitterSymbolExtractor', () => {
  const extractor = new TreeSitterSymbolExtractor();

  it('extracts symbols with real line ranges', async () => {
    const symbols = (await extractor.extractSymbols('src/sample.ts', source)) ?? [];
    const byName = (name: string) => symbols.find((symbol) => symbol.name === name);

    expect(byName('Foo')).toMatchObject({
      kind: 'Class',
      startLine: 2,
      endLine: 6,
      exported: true,
    });
    expect(byName('bar')).toMatchObject({ kind: 'Method', startLine: 3, endLine: 5 });
    expect(byName('baz')).toMatchObject({ kind: 'Function', startLine: 7, endLine: 7 });
    expect(byName('Opts')?.kind).toBe('Interface');
    expect(byName('Id')?.kind).toBe('TypeAlias');
    expect(byName('k')?.kind).toBe('Constant');
    expect(byName('arrow')?.kind).toBe('Function');
  });

  it('ignores local variables inside functions and methods', async () => {
    const symbols = (await extractor.extractSymbols('src/sample.ts', source)) ?? [];
    expect(symbols.some((symbol) => symbol.name === 'local')).toBe(false);
  });

  it('returns null for unsupported file types', async () => {
    expect(await extractor.extractSymbols('main.py', 'def x(): pass')).toBeNull();
  });
  it('extracts import and re-export edges', async () => {
    const edges =
      (await extractor.extractEdges(
        'src/a.ts',
        [
          "import { x, y } from './b.js';",
          "import def from './c.js';",
          "export { z } from './d.js';",
          "import fs from 'node:fs';",
          'export const local = 1;',
        ].join('\n'),
      )) ?? [];
    expect(edges.map((edge) => edge.toPath)).toEqual([
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'node:fs',
    ]);
    expect(edges[0]?.importedSymbols).toEqual(['x', 'y']);
    expect(edges[1]?.importedSymbols).toEqual(['def']);
    expect(edges[2]?.importedSymbols).toEqual(['z']);
  });
});
