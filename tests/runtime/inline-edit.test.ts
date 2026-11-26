import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  warnings: [] as string[],
  commands: [] as string[],
  editor: null as unknown,
}));

vi.mock('vscode', () => ({
  window: {
    get activeTextEditor() {
      return fixture.editor;
    },
    showWarningMessage: async (message: string) => {
      fixture.warnings.push(message);
    },
  },
  commands: {
    executeCommand: async (command: string) => {
      fixture.commands.push(command);
    },
  },
}));

import { runInlineEdit } from '../../packages/vscode/src/extension/inlineEdit.js';

const selectionEditor = () => ({
  document: { uri: { fsPath: '/ws/file.ts' } },
  selection: { isEmpty: false },
});
const emptyEditor = () => ({
  document: { uri: { fsPath: '/ws/file.ts' } },
  selection: { isEmpty: true },
});

function fakeSession(handled: Record<string, unknown>[]) {
  const session = {
    captured: [] as unknown[],
    captureEditor(editor: unknown) {
      session.captured.push(editor);
    },
    currentConversationId: () => 'conv-1',
    async handle(message: Record<string, unknown>) {
      handled.push(message);
    },
  };
  return session as unknown as Parameters<typeof runInlineEdit>[0] & typeof session;
}

describe('runInlineEdit', () => {
  beforeEach(() => {
    fixture.warnings = [];
    fixture.commands = [];
    fixture.editor = null;
  });

  it('warns when there is no editor or no selection', async () => {
    await runInlineEdit(fakeSession([]));
    expect(fixture.warnings).toHaveLength(1);
    fixture.editor = emptyEditor();
    await runInlineEdit(fakeSession([]));
    expect(fixture.warnings).toHaveLength(2);
    expect(fixture.commands).toEqual([]);
  });

  it('attaches the selection, prefills the draft and opens the chat', async () => {
    fixture.editor = selectionEditor();
    const handled: Record<string, unknown>[] = [];
    const session = fakeSession(handled);
    await runInlineEdit(session);
    expect(fixture.warnings).toEqual([]);
    expect(session.captured).toHaveLength(1);
    expect(handled.map((m) => m.type)).toEqual(['AddContext', 'UpdateDraft']);
    expect(handled[0]).toMatchObject({ source: 'Selection' });
    expect(handled[1]).toMatchObject({
      conversationId: 'conv-1',
      prompt: 'Edit the selected code: ',
    });
    expect(fixture.commands).toEqual(['kova.open']);
  });

  it('does nothing without a session', async () => {
    fixture.editor = selectionEditor();
    await runInlineEdit(undefined);
    expect(fixture.warnings).toEqual([]);
    expect(fixture.commands).toEqual([]);
  });
});
