import { opendir } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

const ignored = new Set([
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

/** Explicit, bounded filename lookup. No background index or symlink traversal. */
export class NodeWorkspaceFileFinder {
  constructor(private readonly root: string) {}
  async find(query: string, cancellation: CancellationToken) {
    const guard = new NodeWorkspacePathGuard(this.root);
    const pending = ['.'];
    const entries: { name: string; path: string; kind: 'File' }[] = [];
    const needle = query.toLowerCase().replaceAll('\\', '/');
    const deadline = Date.now() + 1500;
    let scanned = 0;
    let truncated = false;
    while (pending.length) {
      cancellation.throwIfCancellationRequested();
      const directory = pending.shift()!;
      try {
        const path = await guard.resolve(this.root, directory, 'Read', cancellation);
        for await (const entry of await opendir(path.canonicalPath)) {
          cancellation.throwIfCancellationRequested();
          if (++scanned > 5000 || Date.now() > deadline || entries.length >= 100) {
            truncated = true;
            break;
          }
          if (entry.isSymbolicLink() || ignored.has(entry.name)) continue;
          const relative = directory === '.' ? entry.name : `${directory}/${entry.name}`;
          if (entry.isDirectory()) pending.push(relative);
          else if (entry.isFile() && relative.toLowerCase().includes(needle))
            entries.push({ name: entry.name, path: relative, kind: 'File' });
        }
      } catch {
        cancellation.throwIfCancellationRequested();
      }
      if (truncated) break;
    }
    return {
      entries: entries.sort(
        (a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path),
      ),
      truncated,
    };
  }
}
