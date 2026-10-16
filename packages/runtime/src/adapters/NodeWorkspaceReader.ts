import { opendir } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { WorkspacePath } from '../../../core/src/workspace/WorkspacePath.js';
import type { WorkspaceReader } from '../../../core/src/workspace/WorkspaceReader.js';
import { BoundedTextFile } from './BoundedTextFile.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

export class NodeWorkspaceReader implements WorkspaceReader {
  constructor(private readonly guard: NodeWorkspacePathGuard) {}
  async read(
    path: WorkspacePath,
    range: { readonly startLine: number; readonly endLine: number } | null,
    cancellation: CancellationToken,
  ): Promise<{ readonly content: string; readonly version: string; readonly totalLines: number }> {
    const current = await this.guard.resolve(
      path.workspaceId,
      path.relativePath,
      'Read',
      cancellation,
    );
    const { content, hash } = await new BoundedTextFile().read(current.canonicalPath, cancellation);
    cancellation.throwIfCancellationRequested();
    const lines = content.split('\n');
    return {
      content: range ? lines.slice(range.startLine - 1, range.endLine).join('\n') : content,
      version: hash,
      totalLines: lines.length,
    };
  }
  async list(
    path: WorkspacePath,
    cancellation: CancellationToken,
  ): Promise<
    readonly { readonly name: string; readonly kind: 'File' | 'Directory' | 'Symlink' }[]
  > {
    const current = await this.guard.resolve(
      path.workspaceId,
      path.relativePath,
      'Read',
      cancellation,
    );
    const entries: { name: string; kind: 'File' | 'Directory' | 'Symlink' }[] = [];
    for await (const entry of await opendir(current.canonicalPath)) {
      cancellation.throwIfCancellationRequested();
      if (entries.length >= 1000)
        throw new Error('Directory exceeds 1000 entries; narrow with search_files');
      entries.push({
        name: entry.name,
        kind: entry.isSymbolicLink() ? 'Symlink' : entry.isDirectory() ? 'Directory' : 'File',
      });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }
}
