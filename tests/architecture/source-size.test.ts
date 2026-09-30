import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoots = [
  'packages/core/src',
  'packages/ollama/src',
  'packages/mcp/src',
  'packages/protocol/src',
  'packages/vscode/src',
  'webview/src',
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('source maintainability limits', () => {
  it('keeps runtime TypeScript files at or below 500 lines', () => {
    for (const sourceRoot of sourceRoots) {
      for (const path of sourceFiles(resolve(root, sourceRoot))) {
        const lines = readFileSync(path, 'utf8').split(/\r?\n/).length;
        expect(lines, relative(root, path)).toBeLessThanOrEqual(500);
      }
    }
  });
});
