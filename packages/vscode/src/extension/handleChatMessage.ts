import type * as vscode from 'vscode';
import type { Conversation } from '../../../core/src/conversations/Conversation.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { handlePresentationAction, presentationActions } from './handlePresentationAction.js';
import type { ChatResources } from './ChatResources.js';
import type { WorkspaceContextHost } from './workspaceContext.js';
import { handleWorkspaceContextMessage } from './workspaceContext.js';
import type { ContextAttachmentManager } from './ContextAttachmentManager.js';
import type { WebviewApprovalPort } from '../webview/WebviewApprovalPort.js';

/** Narrow view of ChatSession the message router needs. */
export interface ChatMessageHost {
  readonly context: vscode.ExtensionContext;
  readonly resources: ChatResources;
  readonly workspace: WorkspaceContextHost;
  readonly attachments: ContextAttachmentManager;
  readonly approval: WebviewApprovalPort;
  readonly requests: Set<string>;
  isRunning(): boolean;
  isConfiguring(): boolean;
  isCurrentConversation(id: string): boolean;
  partial(): boolean;
  providerLabel(): string;
  selectedModel(): string;
  knownSkill(id: string): boolean;
  selectSkill(id: string | null): void;
  activeRunId(): string | null;
  cancelRun(runId: string): void;
  revertRun(runId: string): Promise<void>;
  attachImage(name: string, mimeType: string, dataUrl: string): Promise<void>;
  resolveApproval(
    runId: string,
    approvalId: string,
    preparationKey: string,
    decision: 'AllowOnce' | 'Reject',
  ): void;
  openDiff(approvalId: string): Promise<void>;
  completeSetup(): Promise<void>;
  snapshot(requestId: string): Promise<void>;
  refreshModels(force?: boolean): Promise<void>;
  newConversation(): Promise<void>;
  openConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  submit(message: Extract<WebviewMessage, { readonly type: 'SubmitPrompt' }>): Promise<string>;
  accept(requestId: string, runId: string | null): void;
  notify(message: string): void;
  clipboardCopied(requestId: string): void;
  readConversation(id: string): Promise<Conversation | null>;
}

/** Routes one validated webview message; throws on invalid intent or stale state. */
export async function handleChatMessage(
  host: ChatMessageHost,
  message: WebviewMessage,
): Promise<void> {
  if (host.requests.has(message.requestId)) throw new Error('Duplicate request ID.');
  host.requests.add(message.requestId);
  if (host.requests.size > 200) host.requests.delete(host.requests.values().next().value!);
  if (host.resources.handles(message.type)) {
    await host.resources.handle(message);
    return;
  }
  if (
    presentationActions.has(message.type) &&
    (await handlePresentationAction(message, host.context, {
      read: (id) => host.readConversation(id),
      current: (id) => host.isCurrentConversation(id) && !host.isRunning() && !host.isConfiguring(),
      partial: host.partial(),
      provider: host.providerLabel(),
      model: host.selectedModel(),
      notify: (text) => host.notify(text),
      copied: (requestId) => host.clipboardCopied(requestId),
    }))
  )
    return;
  if (message.type === 'AttachImage') {
    if (host.isRunning()) throw new Error('Cannot change context during a run.');
    await host.attachImage(message.name, message.mimeType, message.dataUrl);
    await host.snapshot(message.requestId);
    return;
  }
  if (message.type === 'AttachPath' || message.type === 'ListWorkspaceFiles') {
    await handleWorkspaceContextMessage(host.workspace, message);
    return;
  }
  switch (message.type) {
    case 'Ready':
      await host.snapshot(message.requestId);
      return;
    case 'RetryProvider':
      if (host.isRunning() || host.isConfiguring()) throw new Error('Wait until generation stops.');
      await host.refreshModels(true);
      await host.snapshot(message.requestId);
      return;
    case 'SubmitPrompt': {
      host.accept(message.requestId, await host.submit(message));
      return;
    }
    case 'CancelRun':
      host.cancelRun(message.runId);
      break;
    case 'RevertRun':
      await host.revertRun(message.runId);
      return;
    case 'NewConversation':
      await host.newConversation();
      await host.snapshot(message.requestId);
      return;
    case 'OpenConversation':
      await host.openConversation(message.conversationId);
      return;
    case 'RenameConversation':
      await host.renameConversation(message.conversationId, message.title);
      return;
    case 'SelectSkill':
      if (host.isRunning()) throw new Error('Cannot change skill during a run.');
      if (message.skillId && !host.knownSkill(message.skillId)) throw new Error('Unknown skill.');
      host.selectSkill(message.skillId);
      await host.snapshot(message.requestId);
      return;
    case 'AddContext':
      if (host.isRunning()) throw new Error('Cannot change context during a run.');
      await host.attachments.add(message.source);
      await host.snapshot(message.requestId);
      return;
    case 'RemoveContext':
      if (host.isRunning()) throw new Error('Cannot change context during a run.');
      host.attachments.remove(message.attachmentId);
      await host.snapshot(message.requestId);
      return;
    case 'ResolveApproval':
      host.resolveApproval(
        message.runId,
        message.approvalId,
        message.preparationKey,
        message.decision,
      );
      break;
    case 'OpenDiffPreview':
      await host.openDiff(message.approvalId);
      break;
    case 'CompleteSetup':
      await host.completeSetup();
      await host.snapshot(message.requestId);
      return;
  }
  host.accept(message.requestId, host.activeRunId());
}
