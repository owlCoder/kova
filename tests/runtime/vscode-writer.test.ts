import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  documents: new Map<string, { content: string; version: number }>(),
  applied: 0,
}));
vi.mock('vscode', () => {
  class Position {
    constructor(
      readonly line: number,
      readonly character: number,
    ) {}
  }
  class Range {
    constructor(
      readonly start: Position,
      readonly end: Position,
    ) {}
  }
  class WorkspaceEdit {
    readonly changes: { path: string; kind: string; content: string }[] = [];
    replace(uri: { fsPath: string }, _range: Range, content: string): void {
      this.changes.push({ path: uri.fsPath, kind: 'replace', content });
    }
    insert(uri: { fsPath: string }, _position: Position, content: string): void {
      this.changes.push({ path: uri.fsPath, kind: 'insert', content });
    }
    createFile(uri: { fsPath: string }): void {
      this.changes.push({ path: uri.fsPath, kind: 'create', content: '' });
    }
  }
  return {
    Position,
    Range,
    WorkspaceEdit,
    Uri: { file: (path: string) => ({ fsPath: path }) },
    workspace: {
      openTextDocument: async (uri: { fsPath: string }) => {
        if (!mock.documents.has(uri.fsPath))
          mock.documents.set(uri.fsPath, {
            content: await readFile(uri.fsPath, 'utf8'),
            version: 1,
          });
        const state = mock.documents.get(uri.fsPath)!;
        return {
          get version() {
            return state.version;
          },
          getText: () => state.content,
          positionAt: (offset: number) => new Position(0, offset),
        };
      },
      applyEdit: async (edit: WorkspaceEdit) => {
        mock.applied++;
        for (const change of edit.changes) {
          if (change.kind === 'create') {
            await writeFile(change.path, '', { flag: 'wx' });
            mock.documents.set(change.path, { content: '', version: 1 });
          } else {
            const state = mock.documents.get(change.path)!;
            state.content = change.content;
            state.version++;
          }
        }
        return true;
      },
    },
  };
});
import { NodeWorkspacePathGuard } from '../../packages/vscode/src/adapters/NodeWorkspacePathGuard.js';
import { VsCodeWorkspaceReader } from '../../packages/vscode/src/adapters/VsCodeWorkspaceReader.js';
import { VsCodeWorkspaceWriter } from '../../packages/vscode/src/adapters/VsCodeWorkspaceWriter.js';
import { CancellationSource } from './helpers.js';
let root: string,
  guard: NodeWorkspacePathGuard,
  reader: VsCodeWorkspaceReader,
  writer: VsCodeWorkspaceWriter;
const cancel = new CancellationSource();
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'kova-vscode-write-')));
  guard = new NodeWorkspacePathGuard(root);
  reader = new VsCodeWorkspaceReader(guard);
  writer = new VsCodeWorkspaceWriter(guard);
  mock.documents.clear();
  mock.applied = 0;
  await writeFile(join(root, 'file.txt'), 'before');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
describe('VS Code WorkspaceEdit optimistic writes', () => {
  it('previews dirty document content and keeps edits in the editor for undo', async () => {
    mock.documents.set(join(root, 'file.txt'), { content: 'unsaved before', version: 2 });
    const path = await guard.resolve(root, 'file.txt', 'Write', cancel);
    const before = await reader.read(path, null, cancel);
    expect(before.content).toBe('unsaved before');
    expect((await writer.replace(path, 'after', before.version, cancel)).status).toBe('Applied');
    expect(mock.documents.get(path.canonicalPath)?.content).toBe('after');
    expect(await readFile(path.canonicalPath, 'utf8')).toBe('before');
    expect(mock.applied).toBe(1);
  });
  it('returns StaleContent on a newer document version without applying edits', async () => {
    const path = await guard.resolve(root, 'file.txt', 'Write', cancel);
    const before = await reader.read(path, null, cancel);
    const doc = mock.documents.get(path.canonicalPath)!;
    doc.version++;
    doc.content = 'user changed';
    expect(await writer.replace(path, 'after', before.version, cancel)).toMatchObject({
      status: 'Error',
      code: 'StaleContent',
    });
    expect(doc.content).toBe('user changed');
    expect(mock.applied).toBe(0);
  });
  it('returns StaleContent on external disk changes even while editor content is cached', async () => {
    const path = await guard.resolve(root, 'file.txt', 'Write', cancel);
    const before = await reader.read(path, null, cancel);
    await writeFile(path.canonicalPath, 'external change');
    expect((await writer.replace(path, 'after', before.version, cancel)).status).toBe('Error');
    expect(await readFile(path.canonicalPath, 'utf8')).toBe('external change');
    expect(mock.applied).toBe(0);
  });
  it('refuses creating a file that appeared after preview', async () => {
    const path = await guard.resolve(root, 'new.txt', 'Write', cancel);
    await writeFile(path.canonicalPath, 'user created');
    expect(await writer.replace(path, 'after', null, cancel)).toMatchObject({
      code: 'StaleContent',
    });
    expect(mock.applied).toBe(0);
  });
});
