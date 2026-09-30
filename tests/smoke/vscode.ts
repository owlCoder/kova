import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { NodeWorkspacePathGuard } from '../../packages/vscode/src/adapters/NodeWorkspacePathGuard.js';
import { VsCodeWorkspaceReader } from '../../packages/vscode/src/adapters/VsCodeWorkspaceReader.js';
import { VsCodeWorkspaceWriter } from '../../packages/vscode/src/adapters/VsCodeWorkspaceWriter.js';
import { WriteFileTool } from '../../packages/vscode/src/tools/WriteFileTool.js';
import { ToolRegistry } from '../../packages/core/src/tools/ToolRegistry.js';
import { DefaultToolRuntime } from '../../packages/core/src/tools/DefaultToolRuntime.js';
import { HookPipeline } from '../../packages/core/src/hooks/HookPipeline.js';
import { GuardrailEvaluator } from '../../packages/core/src/permissions/GuardrailEvaluator.js';
import { ProtectedPathGuardrail } from '../../packages/core/src/permissions/ProtectedPathGuardrail.js';
import type { ChatSession } from '../../packages/vscode/src/extension/ChatSession.js';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';

export async function run() {
  const extension = vscode.extensions.getExtension<{ session: ChatSession }>('owlcoder.kova');
  assert(extension, 'Extension installed in development host');
  const api = await extension.activate();
  assert((await vscode.commands.getCommands(true)).includes('kova.open'));
  await vscode.commands.executeCommand('kova.open');
  const messages: HostMessage[] = [];
  await api.session.initialize();
  api.session.connect((message) => messages.push(message));
  await api.session.handle({ protocolVersion: 1, requestId: 'smoke-ready', type: 'Ready' });
  assert(
    messages.some(
      (message) =>
        message.type === 'Snapshot' &&
        message.snapshot.models.some((model) => model.id === 'qwen3:4b'),
    ),
    JSON.stringify(messages),
  );
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
  const deadline = Date.now() + 120000;
  while (
    !messages.some(
      (message) => message.type === 'Snapshot' && message.requestId.startsWith('completed-'),
    )
  ) {
    if (Date.now() > deadline) throw new Error('VS Code chat timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(
    messages.some((message) => message.type === 'Event' && message.event.type === 'ResponseDelta'),
  );
  assert(
    messages.some(
      (message) =>
        message.type === 'Event' &&
        message.event.type === 'ContextUpdated' &&
        message.event.usage.maxTokens === 8192 &&
        message.event.usage.actualInputTokens !== null,
    ),
  );
  await api.session.handle({
    protocolVersion: 1,
    requestId: 'smoke-inject',
    type: 'NewConversation',
  });
  console.log(
    'PASS VS Code activation, sidebar command, model discovery, streamed chat and context usage.',
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
  await vscode.commands.executeCommand('undo');
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
  await api.session.dispose();
}
