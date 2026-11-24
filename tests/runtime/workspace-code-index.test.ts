import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CancellationToken } from '../../packages/core/src/common/CancellationToken.js';
import { WorkspaceCodeIndex } from '../../packages/runtime/src/indexing/WorkspaceCodeIndex.js';

const activeToken: CancellationToken = {
  isCancellationRequested: false,
  throwIfCancellationRequested() {},
  onCancellationRequested() {
    return { dispose() {} };
  },
};

const cancelledToken: CancellationToken = {
  isCancellationRequested: true,
  throwIfCancellationRequested() {
    throw new Error('Cancelled');
  },
  onCancellationRequested() {
    return { dispose() {} };
  },
};

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kova-index-'));
  await mkdir(join(directory, 'src'), { recursive: true });
  await writeFile(
    join(directory, 'src', 'helper.ts'),
    'export function formatPrice(amount: number): string {\n  return `${amount} RSD`;\n}\n',
  );
  await writeFile(
    join(directory, 'src', 'service.ts'),
    "import { formatPrice } from './helper.js';\n\nexport class OrderService {\n  total(amount: number): string {\n    return formatPrice(amount);\n  }\n}\n",
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('WorkspaceCodeIndex', () => {
  it('indexes symbols, dependency edges, and ranks relevant snippets', async () => {
    const index = new WorkspaceCodeIndex(directory);
    await index.refresh(directory, null, activeToken);

    const symbols = await index.searchSymbols(directory, 'OrderService', 10, activeToken);
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: 'OrderService',
      kind: 'Class',
      relativePath: 'src/service.ts',
      exported: true,
    });

    const deps = await index.getDependencies(directory, 'src/service.ts', activeToken);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({
      fromPath: 'src/service.ts',
      toPath: 'src/helper.ts',
      importedSymbols: ['formatPrice'],
    });

    const snippets = await index.findRelevantSnippets(
      directory,
      {
        queryText: 'how does OrderService format price',
        focusPaths: ['src/service.ts'],
        maxSnippets: 2,
      },
      activeToken,
    );
    expect(snippets.length).toBeGreaterThanOrEqual(1);
    expect(snippets[0]?.relativePath).toBe('src/service.ts');
  });

  it('incrementally refreshes only changed or deleted paths', async () => {
    const index = new WorkspaceCodeIndex(directory);
    await index.refresh(directory, null, activeToken);

    await writeFile(
      join(directory, 'src', 'helper.ts'),
      'export class CurrencyFormatter {\n  format(value: number): string {\n    return String(value);\n  }\n}\n',
    );
    await index.refresh(directory, ['src/helper.ts'], activeToken);

    const oldSymbols = await index.searchSymbols(directory, 'formatPrice', 10, activeToken);
    expect(oldSymbols).toEqual([]);

    const newSymbols = await index.searchSymbols(directory, 'CurrencyFormatter', 10, activeToken);
    expect(newSymbols).toHaveLength(1);
    expect(newSymbols[0]?.relativePath).toBe('src/helper.ts');

    await rm(join(directory, 'src', 'helper.ts'));
    await index.refresh(directory, ['src/helper.ts'], activeToken);

    const afterDelete = await index.searchSymbols(directory, 'CurrencyFormatter', 10, activeToken);
    expect(afterDelete).toEqual([]);
  });

  it('respects cancellation tokens', async () => {
    const index = new WorkspaceCodeIndex(directory);
    await expect(index.refresh(directory, null, cancelledToken)).rejects.toThrow('Cancelled');
  });
});
