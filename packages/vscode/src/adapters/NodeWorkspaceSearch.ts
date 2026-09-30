import { readdir, stat } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { WorkspaceSearch } from '../../../core/src/workspace/WorkspaceSearch.js';
import { BoundedTextFile } from './BoundedTextFile.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

export class NodeWorkspaceSearch implements WorkspaceSearch {
  constructor(private readonly guard: NodeWorkspacePathGuard) {}
  async search(
    workspaceId: string,
    query: string,
    glob: string | null,
    maxResults: number,
    cancellation: CancellationToken,
  ): ReturnType<WorkspaceSearch['search']> {
    const results: { relativePath: string; line: number; text: string }[] = [];
    const escaped = glob
      ?.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\//g, '(?:.*/)?')
      .replace(//g, '.*');
    const matcher = escaped ? new RegExp(`^${escaped}$`) : null;
    const visited = new Set<string>();
    let inspected = 0;
    const walk = async (relativePath: string): Promise<void> => {
      cancellation.throwIfCancellationRequested();
      if (results.length >= maxResults || inspected >= 20000) return;
      let path;
      try {
        path = await this.guard.resolve(workspaceId, relativePath, 'Read', cancellation);
      } catch {
        cancellation.throwIfCancellationRequested();
        return;
      }
      if (visited.has(path.canonicalPath)) return;
      visited.add(path.canonicalPath);
      const information = await stat(path.canonicalPath);
      inspected++;
      if (information.isDirectory()) {
        for (const entry of await readdir(path.canonicalPath, { withFileTypes: true })) {
          if (['.git', 'node_modules', 'dist', 'build', 'bin', 'obj', '.kova'].includes(entry.name))
            continue;
          await walk(relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`);
          if (results.length >= maxResults) return;
        }
      } else if (
        information.isFile() &&
        information.size <= 1024 * 1024 &&
        (!matcher || matcher.test(relativePath))
      ) {
        let content: string;
        try {
          content = (
            await new BoundedTextFile().read(path.canonicalPath, cancellation, 1024 * 1024)
          ).content;
        } catch {
          cancellation.throwIfCancellationRequested();
          return;
        }
        if (content.includes('\0')) return;
        const lines = content.split('\n');
        for (let index = 0; index < lines.length && results.length < maxResults; index++) {
          const text = lines[index] ?? '';
          if (text.includes(query))
            results.push({ relativePath, line: index + 1, text: text.slice(0, 2000) });
        }
      }
    };
    await walk('.');
    return results;
  }
}
