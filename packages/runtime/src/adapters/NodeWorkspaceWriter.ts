import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, unlink, link, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { WorkspacePath } from '../../../core/src/workspace/WorkspacePath.js';
import type { WorkspaceWriter } from '../../../core/src/workspace/WorkspaceWriter.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';
import { BoundedTextFile } from './BoundedTextFile.js';

export class NodeWorkspaceWriter implements WorkspaceWriter {
  constructor(private readonly guard: NodeWorkspacePathGuard) {}

  async replace(
    path: WorkspacePath,
    content: string,
    expectedVersion: string | null,
    cancellation: CancellationToken,
  ) {
    const stale = () => ({
      status: 'Error' as const,
      code: 'StaleContent' as const,
      message: 'The file changed after the preview. Prepare a new change.',
    });
    const current = await this.guard.resolve(
      path.workspaceId,
      path.relativePath,
      'Write',
      cancellation,
    );
    if (
      current.canonicalPath !== path.canonicalPath ||
      current.exists !== (expectedVersion !== null)
    )
      return stale();
    if (
      current.exists &&
      (await new BoundedTextFile().read(current.canonicalPath, cancellation)).hash !==
        expectedVersion
    )
      return stale();
    await mkdir(dirname(current.canonicalPath), { recursive: true });
    const checked = await this.guard.resolve(
      path.workspaceId,
      path.relativePath,
      'Write',
      cancellation,
    );
    if (checked.canonicalPath !== current.canonicalPath) return stale();
    const temporary = join(dirname(current.canonicalPath), `.kova-${randomUUID()}.tmp`);
    const mode = current.exists ? (await stat(current.canonicalPath)).mode & 0o777 : 0o644;
    try {
      await writeFile(temporary, content, { flag: 'wx', mode });
      cancellation.throwIfCancellationRequested();
      const latest = await this.guard.resolve(
        path.workspaceId,
        path.relativePath,
        'Write',
        cancellation,
      );
      if (latest.canonicalPath !== current.canonicalPath || latest.exists !== current.exists)
        return stale();
      if (current.exists) {
        if (
          (await new BoundedTextFile().read(current.canonicalPath, cancellation)).hash !==
          expectedVersion
        )
          return stale();
        await rename(temporary, current.canonicalPath);
      } else {
        try {
          await link(temporary, current.canonicalPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') return stale();
          throw error;
        }
      }
      return {
        status: 'Applied' as const,
        version: createHash('sha256').update(content).digest('hex'),
      };
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
}
