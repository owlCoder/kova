import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { NodeWorkspacePathGuard } from '../../packages/runtime/src/adapters/NodeWorkspacePathGuard.js';
import { VsCodeWorkspaceReader } from '../../packages/vscode/src/adapters/VsCodeWorkspaceReader.js';
import { VsCodeWorkspaceWriter } from '../../packages/vscode/src/adapters/VsCodeWorkspaceWriter.js';
import { WriteFileTool } from '../../packages/runtime/src/tools/WriteFileTool.js';
import { ToolRegistry } from '../../packages/core/src/tools/ToolRegistry.js';
import { DefaultToolRuntime } from '../../packages/core/src/tools/DefaultToolRuntime.js';
import { HookPipeline } from '../../packages/core/src/hooks/HookPipeline.js';
import { GuardrailEvaluator } from '../../packages/core/src/permissions/GuardrailEvaluator.js';
import { ProtectedPathGuardrail } from '../../packages/core/src/permissions/ProtectedPathGuardrail.js';
import type { ChatSession } from '../../packages/vscode/src/extension/ChatSession.js';
import type { KovaViewProvider } from '../../packages/vscode/src/webview/KovaViewProvider.js';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(description);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function run() {
  const extension = vscode.extensions.getExtension<{
    session: ChatSession;
    sidebar: KovaViewProvider;
  }>('owlcoder.kova-local');
  assert(extension, 'Extension installed in development host');
  const api = await extension.activate();
  assert((await vscode.commands.getCommands(true)).includes('kova.open'));
  assert((await vscode.commands.getCommands(true)).includes('kova.setup'));
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert(workspaceRoot);
  await writeFile(resolve(workspaceRoot, 'attached.txt'), 'attached selection\n');
  const attached = await vscode.workspace.openTextDocument(
    vscode.Uri.file(resolve(workspaceRoot, 'attached.txt')),
  );
  const sourceEditor = await vscode.window.showTextDocument(attached);
  sourceEditor.selection = new vscode.Selection(0, 0, 0, 8);
  const chatTabs = () =>
    vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.filter(
        (tab) => tab.input instanceof vscode.TabInputWebview && tab.label === 'Kova',
      ),
    );
  await vscode.commands.executeCommand('kova.open');
  await waitFor(() => api.sidebar.visible, 'Open Chat opens the default sidebar');
  assert.equal(chatTabs().length, 0, 'Default Open Chat does not create an editor tab');
  await vscode.commands.executeCommand('kova.openInEditor');
  await waitFor(() => chatTabs().length === 1, 'Chat opens in an editor tab');
  await waitFor(
    () => vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputWebview,
    'Chat editor tab receives focus',
  );
  await vscode.commands.executeCommand('kova.openInEditor');
  assert.equal(chatTabs().length, 1, 'Open Chat reuses the existing tab');
  const messages: HostMessage[] = [];
  const diagnostic = () =>
    JSON.stringify(
      messages.map((message) =>
        message.type === 'Event'
          ? {
              type: message.event.type,
              ...('code' in message.event ? { code: message.event.code } : {}),
              ...(message.event.type === 'StateChanged' ? { state: message.event.state } : {}),
              ...(message.event.type === 'ContextUpdated' ? { usage: message.event.usage } : {}),
            }
          : { type: message.type },
      ),
    );
  await api.session.initialize();
  const disconnect = api.session.connect((message) => messages.push(message));
  await api.session.handle({ protocolVersion: 1, requestId: 'smoke-ready', type: 'Ready' });
  const firstSetup = messages.filter((message) => message.type === 'Snapshot').at(-1);
  assert.equal(firstSetup?.snapshot.providerLabel, 'Ollama');
  assert.equal(firstSetup?.snapshot.setupCompleted, false);
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-library-read',
    type: 'GetPromptLibrary',
  });
  const library = messages.filter((message) => message.type === 'PromptLibrary').at(-1)!.library;
  assert.equal(library.prompts.length, 0);
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-library-save',
    type: 'SavePrompt',
    revision: library.revision,
    id: null,
    title: 'Smoke prompt',
    text: 'Keep this exact text.\n  <code>\n',
  });
  const savedLibrary = messages
    .filter((message) => message.type === 'PromptLibrary')
    .at(-1)!.library;
  assert.equal(savedLibrary.prompts[0]?.text, 'Keep this exact text.\n  <code>\n');
  assert.equal(savedLibrary.prompts.length, 1);
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-library-edit',
    type: 'SavePrompt',
    revision: savedLibrary.revision,
    id: savedLibrary.prompts[0]!.id,
    title: 'Renamed smoke prompt',
    text: 'Updated prompt',
  });
  const editedLibrary = messages
    .filter((message) => message.type === 'PromptLibrary')
    .at(-1)!.library;
  assert.equal(editedLibrary.prompts[0]?.id, savedLibrary.prompts[0]?.id);
  assert.equal(editedLibrary.prompts[0]?.title, 'Renamed smoke prompt');
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-library-delete',
    type: 'DeletePrompt',
    revision: editedLibrary.revision,
    id: editedLibrary.prompts[0]!.id,
  });
  assert.equal(
    messages.filter((message) => message.type === 'PromptLibrary').at(-1)!.library.prompts.length,
    0,
  );
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-copy-ack',
    type: 'CopyText',
    text: 'KOVA_CLIPBOARD_SMOKE',
  });
  assert(
    messages.some(
      (message) => message.type === 'ClipboardCopied' && message.requestId === 'smoke-copy-ack',
    ),
  );
  console.log('PASS personal prompt create/edit/remove and host-confirmed clipboard copy.');
  const draftConversation = firstSetup!.snapshot.conversationId;
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-draft',
    type: 'UpdateDraft',
    conversationId: draftConversation,
    prompt: 'Native workspace draft',
  });
  await api.session.snapshot('smoke-draft-ready');
  assert.equal(
    messages.filter((message) => message.type === 'Snapshot').at(-1)?.snapshot.draft,
    'Native workspace draft',
  );
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-clear-draft',
    type: 'UpdateDraft',
    conversationId: draftConversation,
    prompt: '',
  });
  console.log('PASS native workspace draft persistence and clearing.');

  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-setup-done',
    type: 'CompleteSetup',
  });
  assert.equal(
    messages.filter((message) => message.type === 'Snapshot').at(-1)?.snapshot.setupCompleted,
    true,
  );
  assert(
    messages.some(
      (message) =>
        message.type === 'Snapshot' &&
        message.snapshot.models.some((model) => model.id === 'qwen3:4b'),
    ),
    diagnostic(),
  );
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-attach',
    type: 'AddContext',
    source: 'Selection',
  });
  const attachedSnapshot = messages.filter((message) => message.type === 'Snapshot').at(-1);
  assert.equal(attachedSnapshot?.snapshot.contextAttachments[0]?.label, 'attached.txt');
  const attachment = attachedSnapshot!.snapshot.contextAttachments[0]!;
  assert.equal(attachment.characters, 8);
  assert.equal(attachment.source, 'Selection');
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-preview-context',
    type: 'PreviewContext',
    conversationId: attachedSnapshot!.snapshot.conversationId,
    attachmentId: attachment.id,
  });
  const contextPreview = messages.filter((message) => message.type === 'ContextPreview').at(-1);
  assert.equal(contextPreview?.preview.content, 'attached');
  assert.equal(contextPreview?.preview.truncated, false);
  assert.equal(attachedSnapshot!.snapshot.contextAttachments.length, 1);
  console.log('PASS explicit context snapshot preview without removing the attachment.');
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-remove',
    type: 'RemoveContext',
    attachmentId: attachedSnapshot!.snapshot.contextAttachments[0]!.id,
  });
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-prompt',
    type: 'SubmitPrompt',
    prompt: 'Say hello in one brief sentence. Do not use tools.',
    modelId: 'qwen3:4b',
    mode: 'Plan',
    skillId: null,
    attachmentIds: [],
  });
  const streamingDeadline = Date.now() + 120000;
  while (
    !messages.some(
      (message) => message.type === 'Event' && message.event.type === 'ResponseStarted',
    )
  ) {
    if (Date.now() > streamingDeadline) throw new Error(`Stream did not start: ${diagnostic()}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir(resolve(workspaceRoot, '.kova'), { recursive: true });
  await writeFile(
    resolve(workspaceRoot, '.kova/hooks.json'),
    JSON.stringify({ BeforeToolExecution: [], AfterToolExecution: [] }),
  );
  const reloaded = () =>
    messages.filter(
      (message) => message.type === 'Event' && message.event.type === 'ConfigurationReloaded',
    ).length;
  const capturedReloads = reloaded();
  await api.session.initialize();
  assert.equal(
    reloaded(),
    capturedReloads,
    'Webview initialization during a stream cannot reload changed config',
  );
  const deadline = Date.now() + 120000;
  while (
    !messages.some(
      (message) => message.type === 'Snapshot' && message.requestId.startsWith('completed-'),
    )
  ) {
    if (Date.now() > deadline) throw new Error(`VS Code chat timed out: ${diagnostic()}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(
    messages.some((message) => message.type === 'Event' && message.event.type === 'ResponseDelta'),
    diagnostic(),
  );
  assert(
    messages.some(
      (message) =>
        message.type === 'Event' &&
        message.event.type === 'ContextUpdated' &&
        message.event.usage.maxTokens === 32768 &&
        message.event.usage.actualInputTokens !== null,
    ),
    diagnostic(),
  );
  await api.session.initialize();
  assert.equal(reloaded(), capturedReloads + 1, 'Changed hooks become effective once idle');
  const completedSnapshot = messages.filter((message) => message.type === 'Snapshot').at(-1);
  assert(completedSnapshot && completedSnapshot.snapshot.messages.length > 0);
  const exportId = completedSnapshot.snapshot.conversationId;
  const previousClipboard = await vscode.env.clipboard.readText();
  try {
    await api.session.handle({
      protocolVersion: 1,
      requestId: 'smoke-export',
      type: 'ExportConversation',
      conversationId: exportId,
      action: 'copy',
    });
    const markdown = await vscode.env.clipboard.readText();
    assert(markdown.startsWith('# Kova conversation'));
    assert(markdown.includes('## You') && markdown.includes('## Kova'));
    assert(!markdown.includes('preparationKey'));
  } finally {
    await vscode.env.clipboard.writeText(previousClipboard);
  }
  console.log('PASS native Markdown transcript export through the installed extension.');
  await vscode.window.tabGroups.close(chatTabs());
  await waitFor(() => chatTabs().length === 0, 'Chat editor tab closes');
  await vscode.commands.executeCommand('kova.openInEditor');
  await waitFor(() => chatTabs().length === 1, 'Closed chat can be reopened');
  const reopened = messages.filter((message) => message.type === 'Snapshot').at(-1);
  assert.equal(reopened?.snapshot.conversationId, completedSnapshot.snapshot.conversationId);
  assert.deepEqual(reopened?.snapshot.messages, completedSnapshot.snapshot.messages);
  console.log(
    'PASS Webview resync preserves run configuration; changed hooks reload only while idle.',
  );
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-inject',
    type: 'NewConversation',
  });
  console.log(
    'PASS default sidebar, optional editor tab, singleton/reopen, file selection attachment, model discovery, streamed chat and context usage.',
  );
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert(root);
  const cancellation = new CancellationSource(),
    guard = new NodeWorkspacePathGuard(root),
    reader = new VsCodeWorkspaceReader(guard),
    writer = new VsCodeWorkspaceWriter(guard);
  await writeFile(resolve(root, 'native-edit.txt'), 'original\n');
  const path = await guard.resolve(root, 'native-edit.txt', 'Write', cancellation);
  const before = await reader.read(path, null, cancellation);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.canonicalPath));
  await vscode.window.showTextDocument(document);
  assert.equal(
    (await writer.replace(path, 'changed\n', before.version, cancellation)).status,
    'Applied',
  );
  assert.equal(document.getText(), 'changed\n');
  await vscode.window.showTextDocument(document, { preserveFocus: false });
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  await vscode.commands.executeCommand('undo');
  await waitFor(() => document.getText() === 'original\n', 'Native editor undo restores Kova edit');
  assert.equal(document.getText(), 'original\n', 'Native editor undo restores Kova edit');
  assert.deepEqual(
    (await writer.replace(path, 'stale overwrite', before.version, cancellation)).status,
    'Error',
  );
  const registry = new ToolRegistry();
  registry.register(new WriteFileTool(guard, reader, writer));
  let previewed = false;
  const runtime = new DefaultToolRuntime(
    root,
    registry,
    {
      async request(request) {
        previewed = request.preview?.kind === 'FileChanges';
        return {
          approvalId: request.approvalId,
          preparationKey: request.preparationKey,
          decision: 'Reject',
        };
      },
    },
    new HookPipeline(),
    new GuardrailEvaluator([new ProtectedPathGuardrail()]),
  );
  assert.equal(
    (
      await runtime.execute(
        {
          id: 'native-denial',
          name: 'write_file',
          arguments: { path: 'native-edit.txt', content: 'denied' },
        },
        'Manual',
        [],
        cancellation,
        { emit() {} },
        'native-run',
      )
    ).status,
    'Denied',
  );
  assert(previewed);
  assert.equal(document.getText(), 'original\n');
  const newPath = await guard.resolve(root, 'native-created.txt', 'Write', cancellation);
  assert.equal(
    (await writer.replace(newPath, 'created by Kova\n', null, cancellation)).status,
    'Applied',
  );
  assert.equal(
    (await vscode.workspace.openTextDocument(vscode.Uri.file(newPath.canonicalPath))).getText(),
    'created by Kova\n',
  );
  console.log(
    'PASS native WorkspaceEdit create/replace, editor Undo, stale preview refusal and approval rejection without write.',
  );
  await vscode.workspace
    .getConfiguration('kova')
    .update('ui.language', 'sr', vscode.ConfigurationTarget.Global);
  await vscode.workspace
    .getConfiguration('kova')
    .update('ui.textSize', 'large', vscode.ConfigurationTarget.Global);
  await api.session.snapshot('smoke-ui-preferences');
  const localized = messages.filter((message) => message.type === 'Snapshot').at(-1);
  assert.equal(localized?.snapshot.language, 'sr');
  assert.equal(localized?.snapshot.textSize, 'large');
  console.log('PASS Serbian interface language and larger text settings reach the shared UI.');

  await vscode.commands.executeCommand('kova.openInEditor');
  const closeOffset = messages.length;
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-close-prompt',
    type: 'SubmitPrompt',
    prompt: 'Explain recursion in detail. Do not use tools.',
    modelId: 'qwen3:4b',
    mode: 'Plan',
    skillId: null,
    attachmentIds: [],
  });
  await vscode.window.tabGroups.close(chatTabs());
  const closeDeadline = Date.now() + 15000;
  while (
    !messages
      .slice(closeOffset)
      .some((message) => message.type === 'Snapshot' && message.requestId.startsWith('completed-'))
  ) {
    if (Date.now() > closeDeadline) throw new Error('Closing chat did not finish cancellation.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const closed = messages.filter((message) => message.type === 'Snapshot').at(-1);
  assert.equal(closed?.snapshot.activeRunId, null);
  console.log('PASS closing the chat tab cancels the active run.');
  disconnect();
  await api.session.dispose();
}
