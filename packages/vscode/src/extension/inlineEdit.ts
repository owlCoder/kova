import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { ChatSession } from './ChatSession.js';

/**
 * Inline edit entry point (editor context menu / command palette): attaches the
 * active selection to the chat context, prefills the composer and opens Kova,
 * so the user adds an instruction and submits.
 */
export async function runInlineEdit(session: ChatSession | undefined): Promise<void> {
  if (!session) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    await vscode.window.showWarningMessage(
      'Select code in the editor first, then run "Kova: Inline Edit".',
    );
    return;
  }
  session.captureEditor(editor);
  await session.handle({
    protocolVersion: 1,
    requestId: randomUUID(),
    type: 'AddContext',
    source: 'Selection',
  });
  await session.handle({
    protocolVersion: 1,
    requestId: randomUUID(),
    type: 'UpdateDraft',
    conversationId: session.currentConversationId(),
    prompt: 'Edit the selected code: ',
  });
  await vscode.commands.executeCommand('kova.open');
}
