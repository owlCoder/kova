import * as vscode from 'vscode';
import type { Conversation } from '../../../core/src/conversations/Conversation.js';
import { conversationMarkdown } from '../../../runtime/src/presentation/conversationMarkdown.js';
import { projectConversationMessages } from '../../../runtime/src/presentation/projectConversationMessages.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';

export const presentationActions = new Set([
  'ExportConversation',
  'CopyText',
  'OpenExternal',
  'OpenProviderSetup',
  'OpenSettings',
  'OpenSetupInstructions',
]);

/** User-operated presentation actions; save paths always come from a native file picker. */
export async function handlePresentationAction(
  message: WebviewMessage,
  context: vscode.ExtensionContext,
  transcript: {
    read(id: string): Promise<Conversation | null>;
    current(id: string): boolean;
    partial: boolean;
    provider: string;
    model: string;
    notify(message: string): void;
  },
): Promise<boolean> {
  switch (message.type) {
    case 'ExportConversation': {
      if (!transcript.current(message.conversationId))
        throw new Error('Stop the active task before exporting this conversation.');
      const conversation = await transcript.read(message.conversationId);
      if (!transcript.current(message.conversationId))
        throw new Error('This conversation changed. Try exporting again.');
      const markdown = conversationMarkdown(
        projectConversationMessages(conversation?.entries ?? [], transcript.partial, null, null),
        transcript,
      );
      if (message.action === 'copy') {
        await vscode.env.clipboard.writeText(markdown);
        transcript.notify('Conversation copied as Markdown.');
        return true;
      }
      const destination = await vscode.window.showSaveDialog({
        title: 'Export Kova conversation',
        defaultUri: vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders?.[0]?.uri ?? context.globalStorageUri,
          'kova-conversation.md',
        ),
        filters: { Markdown: ['md'] },
        saveLabel: 'Export Markdown',
      });
      if (destination) {
        if (!destination.path.toLowerCase().endsWith('.md'))
          throw new Error('Choose a Markdown (.md) file for the export.');
        await vscode.workspace.fs.writeFile(destination, new TextEncoder().encode(markdown));
        transcript.notify('Conversation exported.');
      }
      return true;
    }
    case 'CopyText':
      await vscode.env.clipboard.writeText(message.text);
      return true;
    case 'OpenExternal':
      await vscode.env.openExternal(vscode.Uri.parse(message.url));
      return true;
    case 'OpenProviderSetup':
      await vscode.commands.executeCommand('kova.setup');
      return true;
    case 'OpenSettings':
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${context.extension.id}`,
      );
      return true;
    case 'OpenSetupInstructions':
      await vscode.commands.executeCommand(
        'markdown.showPreview',
        vscode.Uri.joinPath(context.extensionUri, 'SETUP.md'),
      );
      return true;
    default:
      return false;
  }
}
