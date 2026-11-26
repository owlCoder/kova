import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import { NodeWorkspacePathGuard } from '../../../runtime/src/adapters/NodeWorkspacePathGuard.js';
import { BoundedTextFile } from '../../../runtime/src/adapters/BoundedTextFile.js';
import { mergeContextAttachments } from '../../../runtime/src/presentation/mergeContextAttachments.js';

export class ContextAttachmentManager {
  private attachments: ContextAttachment[] = [];
  private contextEditor: vscode.TextEditor | undefined;
  private revision = 0;

  constructor(
    private readonly root: () => string | null,
    private readonly editable = () => true,
  ) {}

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
    if (!this.editable()) throw new Error('Wait until generation stops.');
    this.attachments = this.attachments.filter((item) => item.id !== id);
    this.revision++;
  }
  clear(): void {
    this.attachments = [];
    this.revision++;
  }

  /** Attaches one workspace file chosen by a root-relative path (the @mention flow). */
  async addPath(relativePath: string): Promise<void> {
    if (!this.editable()) throw new Error('Wait until generation stops.');
    const root = this.root();
    if (!root) throw new Error('Open a workspace to attach context.');
    const cancellation = new CancellationSource();
    const guard = new NodeWorkspacePathGuard(root);
    const path = await guard.resolve(root, relativePath, 'Read', cancellation);
    const { content } = await new BoundedTextFile().read(path.canonicalPath, cancellation, 100_000);
    this.attachments = mergeContextAttachments(this.attachments, [
      { id: randomUUID(), source: 'ExplicitFile', label: path.relativePath, content },
    ]);
    this.revision++;
  }

  /** `uris` comes from an Explorer selection; without it PickFiles shows a file dialog. */
  async add(
    source: 'Selection' | 'CurrentFile' | 'PickFiles',
    uris?: readonly vscode.Uri[],
  ): Promise<void> {
    if (!this.editable()) throw new Error('Wait until generation stops.');
    const root = this.root();
    if (!root) throw new Error('Open a workspace to attach context.');
    const revision = this.revision;
    const captured: ContextAttachment[] = [];
    const guard = new NodeWorkspacePathGuard(root);
    if (source === 'PickFiles') {
      const files =
        uris ??
        (await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFiles: true,
          canSelectFolders: false,
        }));
      if ((files?.length ?? 0) > 10) throw new Error('Choose up to 10 files at a time.');
      for (const uri of files ?? []) {
        const cancellation = new CancellationSource();
        const path = await guard.resolve(root, uri.fsPath, 'Read', cancellation);
        const { content } = await new BoundedTextFile().read(
          path.canonicalPath,
          cancellation,
          100_000,
        );
        captured.push({
          id: randomUUID(),
          source: 'ExplicitFile',
          label: path.relativePath,
          content,
        });
      }
    } else {
      const active = vscode.window.activeTextEditor;
      const editor = active?.document.uri.scheme === 'file' ? active : this.contextEditor;
      if (!editor || editor.document.uri.scheme !== 'file' || editor.document.isClosed)
        throw new Error('Open a text file first.');
      const path = await guard.resolve(
        root,
        editor.document.uri.fsPath,
        'Read',
        new CancellationSource(),
      );
      const content =
        source === 'Selection'
          ? editor.document.getText(editor.selection)
          : editor.document.getText();
      captured.push({ id: randomUUID(), source, label: path.relativePath, content });
    }
    if (!captured.length) return;
    if (!this.editable() || this.revision !== revision)
      throw new Error('Context changed while choosing files. Attach them again.');
    this.attachments = mergeContextAttachments(this.attachments, captured);
    this.revision++;
  }
  dispose(): void {
    this.contextEditor = undefined;
    this.clear();
  }
}
