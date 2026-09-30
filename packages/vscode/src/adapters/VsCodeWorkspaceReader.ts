import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { WorkspacePath } from '../../../core/src/workspace/WorkspacePath.js';
import type { WorkspaceReader } from '../../../core/src/workspace/WorkspaceReader.js';
import { BoundedTextFile } from './BoundedTextFile.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';
import { NodeWorkspaceReader } from './NodeWorkspaceReader.js';

export class VsCodeWorkspaceReader implements WorkspaceReader {
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
    const disk = await new BoundedTextFile().read(current.canonicalPath, cancellation);
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(current.canonicalPath),
    );
    cancellation.throwIfCancellationRequested();
    cancellation.throwIfCancellationRequested();
    const content = document.getText();
    if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024 || content.includes('\0'))
      throw new Error('Document exceeds the 2 MiB text limit or contains binary data');
    const lines = content.split('\n');
    return {
      content: range ? lines.slice(range.startLine - 1, range.endLine).join('\n') : content,
      version: `document:${document.version}:${createHash('sha256').update(content).digest('hex')}:${disk.hash}`,
      totalLines: lines.length,
    };
  }
  list(
    path: WorkspacePath,
    cancellation: CancellationToken,
  ): Promise<
    readonly { readonly name: string; readonly kind: 'File' | 'Directory' | 'Symlink' }[]
  > {
    return new NodeWorkspaceReader(this.guard).list(path, cancellation);
  }
}
