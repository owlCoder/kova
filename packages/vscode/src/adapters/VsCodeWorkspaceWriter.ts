import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { WorkspacePath } from '../../../core/src/workspace/WorkspacePath.js';
import type { WorkspaceWriter } from '../../../core/src/workspace/WorkspaceWriter.js';
import { BoundedTextFile } from './BoundedTextFile.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

export class VsCodeWorkspaceWriter implements WorkspaceWriter {
  constructor(private readonly guard: NodeWorkspacePathGuard) {}
  async replace(
    path: WorkspacePath,
    content: string,
    expectedVersion: string | null,
    cancellation: CancellationToken,
  ): Promise<
    | { readonly status: 'Applied'; readonly version: string }
    | { readonly status: 'Error'; readonly code: 'StaleContent'; readonly message: string }
  > {
    const stale = () => ({
      status: 'Error' as const,
      code: 'StaleContent' as const,
      message: 'File changed since the preview; request a new preview before writing',
    });
    cancellation.throwIfCancellationRequested();
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
    const uri = vscode.Uri.file(current.canonicalPath);
    const edit = new vscode.WorkspaceEdit();
    if (current.exists) {
      const document = await vscode.workspace.openTextDocument(uri);
      let diskHash: string;
      try {
        diskHash = (await new BoundedTextFile().read(current.canonicalPath, cancellation)).hash;
      } catch {
        return stale();
      }
      const before = document.getText(),
        hash = createHash('sha256').update(before).digest('hex');
      if (
        expectedVersion !== `document:${document.version}:${hash}:${diskHash}` &&
        !(expectedVersion === hash && expectedVersion === diskHash)
      )
        return stale();
      cancellation.throwIfCancellationRequested();
      edit.replace(
        uri,
        new vscode.Range(document.positionAt(0), document.positionAt(before.length)),
        content,
      );
    } else {
      edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
      edit.insert(uri, new vscode.Position(0, 0), content);
    }
    // applyEdit captures document versions; VS Code rejects conflicting text edits atomically.
    if (!(await vscode.workspace.applyEdit(edit))) return stale();
    const document = await vscode.workspace.openTextDocument(uri);
    let diskHash = 'missing';
    try {
      diskHash = (await new BoundedTextFile().read(current.canonicalPath, cancellation)).hash;
    } catch {
      /* newly created documents may remain unsaved */
    }
    return {
      status: 'Applied',
      version: `document:${document.version}:${createHash('sha256').update(document.getText()).digest('hex')}:${diskHash}`,
    };
  }
}
