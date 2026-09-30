import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { WorkspacePath } from '../../../core/src/workspace/WorkspacePath.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';

export class NodeWorkspacePathGuard implements WorkspacePathGuard {
  constructor(private readonly root: string) {}
  async resolve(
    workspaceId: string,
    input: string,
    access: 'Read' | 'Write',
    cancellation: CancellationToken,
  ): Promise<WorkspacePath> {
    cancellation.throwIfCancellationRequested();
    if (input.includes('\0')) throw new Error('Path contains NUL');
    if (
      process.platform !== 'win32' &&
      ((win32.isAbsolute(input) && !isAbsolute(input)) || /^\\\\/.test(input))
    )
      throw new Error('Path is outside the workspace');
    const root = await realpath(this.root);
    const requested = resolve(this.root, input);
    this.assertInside(resolve(this.root), requested, true);
    let candidate = requested,
      exists = true;
    const suffix: string[] = [];
    for (;;) {
      try {
        candidate = await realpath(candidate);
        break;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
        // Dangling symlinks must never be treated as ordinary missing files.
        try {
          if ((await lstat(candidate)).isSymbolicLink())
            throw new Error('Dangling symlink is not a writable workspace path');
        } catch (failure) {
          if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') {
            /* missing component */
          } else throw failure;
        }
        if (access === 'Read') throw new Error('Workspace path does not exist');
        exists = false;
        const parent = dirname(candidate);
        if (parent === candidate) throw new Error('Workspace path has no existing ancestor');
        suffix.unshift(relative(parent, candidate));
        candidate = parent;
      }
    }
    const canonicalPath = resolve(candidate, ...suffix);
    this.assertInside(root, canonicalPath);
    cancellation.throwIfCancellationRequested();
    const relativePath = relative(resolve(this.root), requested).split(sep).join('/') || '.';
    const targetRelative = relative(root, canonicalPath).split(sep).join('/') || '.';
    return {
      workspaceId,
      relativePath,
      canonicalPath,
      exists,
      protected: this.protectedPath(relativePath) || this.protectedPath(targetRelative),
    };
  }
  private assertInside(root: string, target: string, lexical = false): void {
    const fold = (path: string) =>
      lexical && (process.platform === 'darwin' || process.platform === 'win32')
        ? path.toLowerCase()
        : path;
    const rel = relative(fold(root), fold(target));
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Error('Path is outside the workspace');
  }
  private protectedPath(path: string): boolean {
    const folded = path.toLowerCase();
    return ['.kova/mcp.json', '.kova/hooks.json', '.git', '.vscode'].some(
      (value) =>
        folded === value ||
        ((value === '.git' || value === '.vscode') && folded.startsWith(`${value}/`)),
    );
  }
}
