import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import * as vscode from 'vscode';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import { NodeWorkspacePathGuard } from '../adapters/NodeWorkspacePathGuard.js';

export class ContextAttachmentManager {
  private attachments: ContextAttachment[] = [];
  private contextEditor: vscode.TextEditor | undefined;

  constructor(private readonly root: string | null) {}

  captureEditor(editor: vscode.TextEditor | undefined): void {
    if (editor?.document.uri.scheme === 'file') this.contextEditor = editor;
  }

  list(): readonly ContextAttachment[] {
    return this.attachments;
  }

  has(id: string): boolean {
    return this.attachments.some((item) => item.id === id);
  }

  selected(ids: readonly string[]): readonly ContextAttachment[] {
    return this.attachments.filter((item) => ids.includes(item.id));
  }

  remove(id: string): void {
    this.attachments = this.attachments.filter((item) => item.id !== id);
  }

  async add(source: 'Selection' | 'CurrentFile' | 'PickFiles'): Promise<void> {
    if (!this.root) throw new Error('Open a workspace to attach context.');
    if (this.attachments.length >= 10) throw new Error('At most 10 context attachments.');
    if (source === 'PickFiles') {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
      });
      for (const uri of files ?? []) {
        if (this.attachments.length >= 10) break;
        const path = await new NodeWorkspacePathGuard(this.root).resolve(
          this.root,
          uri.fsPath,
          'Read',
          new CancellationSource(),
        );
        if ((await stat(path.canonicalPath)).size > 100_000)
          throw new Error('Attachment is too large. Select a narrower text range.');
        const content = await readFile(path.canonicalPath, 'utf8');
        if (content.includes('\0')) throw new Error('Binary files cannot be attached.');
        this.attachments.push({
          id: randomUUID(),
          source: 'ExplicitFile',
          label: path.relativePath,
          content,
        });
      }
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const editor = activeEditor?.document.uri.scheme === 'file' ? activeEditor : this.contextEditor;
    if (!editor || editor.document.uri.scheme !== 'file' || editor.document.isClosed)
      throw new Error('Open a text file first.');
    const path = await new NodeWorkspacePathGuard(this.root).resolve(
      this.root,
      editor.document.uri.fsPath,
      'Read',
      new CancellationSource(),
    );
    const content =
      source === 'Selection'
        ? editor.document.getText(editor.selection)
        : editor.document.getText();
    if (!content || content.length > 100_000)
      throw new Error('Select a nonempty text range under 100,000 characters.');
    this.attachments.push({ id: randomUUID(), source, label: path.relativePath, content });
  }

  dispose(): void {
    this.contextEditor = undefined;
  }
}
