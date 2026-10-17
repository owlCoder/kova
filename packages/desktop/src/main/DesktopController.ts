import { DesktopTerminal } from './DesktopTerminal.js';
import { dialog, shell, clipboard, nativeTheme, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import type { ProviderDraft } from '../../../protocol/src/DesktopMessage.js';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import { NodeWorkspacePathGuard } from '../../../runtime/src/adapters/NodeWorkspacePathGuard.js';
import { NodeWorkspaceReader } from '../../../runtime/src/adapters/NodeWorkspaceReader.js';
import { NodeWorkspaceFileFinder } from '../../../runtime/src/adapters/NodeWorkspaceFileFinder.js';
import { BoundedTextFile } from '../../../runtime/src/adapters/BoundedTextFile.js';
import { NodeGitReader } from '../../../runtime/src/adapters/NodeGitReader.js';
import { NodeProcessRunner } from '../../../runtime/src/adapters/NodeProcessRunner.js';
import { discoverProviderModels } from '../../../runtime/src/providers/discoverProviderModels.js';
import type { ProviderConfiguration } from '../../../runtime/src/providers/ProviderConfiguration.js';
import { DesktopSession } from './DesktopSession.js';
import { validateDesktopMessage } from './validateDesktopMessage.js';

export class DesktopController {
  readonly terminal = new DesktopTerminal((message) => this.session.send(message));
  private readonly requests = new Set<string>();
  private previewPath: string | null = null;
  private search: CancellationSource | null = null;
  constructor(
    readonly session: DesktopSession,
    private readonly window: BrowserWindow,
    private readonly preferencesChanged: () => void = () => {},
  ) {}
  async handle(raw: unknown): Promise<void> {
    let requestId = 'invalid';
    try {
      const message = validateDesktopMessage(raw);
      requestId = message.requestId;
      if (this.requests.has(requestId)) throw new Error('Duplicate request.');
      this.requests.add(requestId);
      if (this.requests.size > 500) this.requests.delete(this.requests.values().next().value!);
      await this.route(message);
    } catch (error) {
      this.session.send({
        type: 'Rejected',
        requestId,
        code: 'DesktopRequestFailed',
        message: error instanceof Error ? error.message : 'Request failed.',
      });
    } finally {
      this.terminal.syncWorkspace(this.session.root);
    }
  }
  private async route(message: WebviewMessage): Promise<void> {
    const session = this.session;
    switch (message.type) {
      case 'OpenTerminal':
        this.terminal.open(this.root(), message.cols, message.rows);
        return;
      case 'OpenDataDirectory': {
        const error = await shell.openPath(session.store.directory);
        if (error) throw new Error('Could not open the local data folder.');
        return;
      }
      case 'TerminalInput':
        this.terminal.input(message.terminalId, message.data);
        return;
      case 'ResizeTerminal':
        this.terminal.resize(message.terminalId, message.cols, message.rows);
        return;
      case 'TerminalAck':
        this.terminal.acknowledge(message.terminalId, message.characters);
        return;
      case 'CloseTerminal':
        this.terminal.close(message.terminalId);
        return;
      case 'WindowAction':
        if (message.action === 'maximize') {
          if (this.window.isMaximized()) this.window.unmaximize();
          else this.window.maximize();
        }
        session.send({
          type: 'WindowState',
          maximized: this.window.isMaximized(),
          fullscreen: this.window.isFullScreen(),
          focused: this.window.isFocused(),
        });
        return;
      case 'SetLanguage':
        await session.store.updatePreferences({ language: message.language });
        this.preferencesChanged();
        await session.snapshot(message.requestId);
        return;
      case 'SetTextSize':
        await session.store.updatePreferences({ textSize: message.textSize });
        await session.snapshot(message.requestId);
        return;
      case 'Ready':
        await session.snapshot(message.requestId);
        return;
      case 'SubmitPrompt':
        await session.submit(message);
        return;
      case 'CancelRun':
        session.cancel(message.runId);
        return;
      case 'NewConversation':
        await session.newConversation();
        return;
      case 'SelectConversation':
        await session.selectConversation(message.conversationId);
        this.previewPath = null;
        return;
      case 'RenameConversation':
        session.requireIdle();
        await session.store.rename(message.conversationId, message.title);
        await session.snapshot(message.requestId);
        return;
      case 'ArchiveConversation':
        session.requireIdle();
        await session.store.remove(message.conversationId);
        if (message.conversationId === session.conversationId) await session.newConversation();
        await session.snapshot(message.requestId);
        return;
      case 'OpenWorkspace': {
        session.requireIdle();
        const result = await dialog.showOpenDialog(this.window, {
          title: 'Open a project in Kova',
          properties: ['openDirectory'],
          ...(session.root ? { defaultPath: session.root } : {}),
        });
        if (!result.canceled && result.filePaths[0]) {
          await session.openWorkspace(result.filePaths[0]);
          this.previewPath = null;
        }
        return;
      }
      case 'SelectWorkspace':
        if (!session.store.preferences.recentWorkspaces.includes(message.path))
          throw new Error('Use Open project to choose a new workspace.');
        await session.openWorkspace(message.path);
        this.previewPath = null;
        return;
      case 'OpenProviderSetup':
      case 'OpenSettings':
      case 'OpenSetupInstructions':
        session.send({ type: 'OpenPreferences' });
        return;
      case 'CompleteSetup':
        await session.store.updatePreferences({ setupCompleted: true });
        await session.snapshot(message.requestId);
        return;
      case 'RetryProvider':
        session.requireIdle();
        await session.refreshModels(true);
        await session.snapshot(message.requestId);
        return;
      case 'SelectSkill':
        session.requireIdle();
        session.skillId = message.skillId;
        await session.snapshot(message.requestId);
        return;
      case 'AddContext':
        await this.addContext(message.source);
        await session.snapshot(message.requestId);
        return;
      case 'RemoveContext':
        session.requireIdle();
        session.attachments = session.attachments.filter(
          (item) => item.id !== message.attachmentId,
        );
        await session.snapshot(message.requestId);
        return;
      case 'ResolveApproval':
        session.approval.resolve(message, message.runId);
        return;
      case 'OpenDiffPreview': {
        const approval = session.approval.requestPending;
        if (approval?.approvalId !== message.approvalId || approval.preview?.kind !== 'FileChanges')
          throw new Error('This approval is no longer active.');
        session.send({
          type: 'DiffPreview',
          title: 'Proposed changes',
          diff: '',
          changes: approval.preview.changes.map((change) => ({
            path: change.relativePath,
            before: change.beforeContent ?? '',
            after: change.afterContent,
          })),
        });
        return;
      }
      case 'ListWorkspaceFiles':
        await this.listFiles(message.path);
        return;
      case 'SearchWorkspaceFiles': {
        const root = this.root();
        this.search?.cancel();
        const source = new CancellationSource();
        this.search = source;
        const result = await new NodeWorkspaceFileFinder(root)
          .find(message.query, source)
          .catch((error: unknown) => {
            if (source.isCancellationRequested) return null;
            throw error;
          });
        if (result && !source.isCancellationRequested && this.session.root === root)
          session.send({ type: 'WorkspaceSearchResults', query: message.query, ...result });
        return;
      }
      case 'OpenWorkspaceFile':
        await this.openFile(message.path);
        return;
      case 'WorkspaceDiff': {
        const root = this.root();
        const source = new CancellationSource();
        const diff = await new NodeGitReader(
          new NodeProcessRunner(root),
          new NodeWorkspacePathGuard(root),
        ).diff(root, false, null, source);
        if (session.root === root)
          session.send({ type: 'DiffPreview', title: 'Working tree changes', changes: [], diff });
        return;
      }
      case 'SetTheme':
        await session.store.updatePreferences({ theme: message.theme });
        nativeTheme.themeSource = message.theme;
        this.preferencesChanged();
        await session.snapshot(message.requestId);
        return;
      case 'TestProvider':
        await this.testProvider(message.draft, message.requestId);
        return;
      case 'SaveProvider':
        await this.saveProvider(message.draft, message.requestId);
        return;
      case 'OpenExternal':
        await shell.openExternal(message.url);
        return;
      case 'CopyText':
        clipboard.writeText(message.text);
        session.send({ type: 'Notice', message: 'Copied to clipboard.' });
        return;
    }
  }
  private root(): string {
    if (!this.session.root) throw new Error('Open a project first.');
    return this.session.root;
  }
  private async listFiles(path: string): Promise<void> {
    const root = this.root();
    const guard = new NodeWorkspacePathGuard(root);
    const source = new CancellationSource();
    const resolved = await guard.resolve(root, path || '.', 'Read', source);
    const entries = await new NodeWorkspaceReader(guard).list(resolved, source);
    if (this.session.root === root)
      this.session.send({
        type: 'WorkspaceFiles',
        path: resolved.relativePath,
        entries: entries
          .filter(
            (entry) => !['node_modules', '.git', 'dist', '.next', '.DS_Store'].includes(entry.name),
          )
          .sort(
            (a, b) =>
              Number(b.kind === 'Directory') - Number(a.kind === 'Directory') ||
              a.name.localeCompare(b.name),
          )
          .map((entry) => ({
            ...entry,
            path:
              resolved.relativePath === '.' ? entry.name : `${resolved.relativePath}/${entry.name}`,
          })),
      });
  }
  private async openFile(path: string): Promise<void> {
    const root = this.root();
    const source = new CancellationSource();
    const resolved = await new NodeWorkspacePathGuard(root).resolve(root, path, 'Read', source);
    const { content } = await new BoundedTextFile().read(resolved.canonicalPath, source, 200_000);
    if (root !== this.session.root) return;
    this.previewPath = resolved.relativePath;
    this.session.send({
      type: 'FilePreview',
      file: { path: resolved.relativePath, content, language: extname(path).slice(1) || 'text' },
    });
  }
  private async addContext(source: 'Selection' | 'CurrentFile' | 'PickFiles'): Promise<void> {
    this.session.requireIdle();
    const root = this.root();
    let paths: string[];
    if (source === 'PickFiles') {
      const result = await dialog.showOpenDialog(this.window, {
        title: 'Attach project files',
        defaultPath: root,
        properties: ['openFile', 'multiSelections'],
      });
      paths = result.canceled ? [] : result.filePaths;
    } else {
      if (!this.previewPath) throw new Error('Preview a project file first, or use Choose files.');
      paths = [this.previewPath];
    }
    for (const path of paths) {
      if (this.session.attachments.length >= 10) throw new Error('Attach up to 10 files.');
      const cancellation = new CancellationSource();
      const resolved = await new NodeWorkspacePathGuard(root).resolve(
        root,
        path,
        'Read',
        cancellation,
      );
      const { content } = await new BoundedTextFile().read(
        resolved.canonicalPath,
        cancellation,
        100_000,
      );
      if (!this.session.attachments.some((item) => item.label === resolved.relativePath))
        this.session.attachments.push({
          id: randomUUID(),
          label: resolved.relativePath,
          source: 'ExplicitFile',
          content,
        });
    }
  }
  private config(draft: ProviderDraft): ProviderConfiguration {
    return {
      kind: draft.kind,
      label: draft.label.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
      model: draft.model.trim(),
      supportsTools: draft.supportsTools,
      discoverModels: draft.discoverModels,
    };
  }
  private async testProvider(draft: ProviderDraft, requestId: string): Promise<void> {
    try {
      const config = this.config(draft);
      const key =
        draft.keyAction === 'replace'
          ? draft.apiKey.trim()
          : draft.keyAction === 'keep'
            ? await this.session.keys.get(config)
            : undefined;
      const models = await discoverProviderModels(
        { ...config, discoverModels: true },
        key,
        new CancellationSource(),
      );
      this.session.send({
        type: 'ProviderModels',
        requestId,
        models,
        error: models.length ? null : 'No models found. Install a model or enter its ID manually.',
      });
    } catch (error) {
      const status = error instanceof Error ? error.message.match(/HTTP \d{3}/)?.[0] : undefined;
      this.session.send({
        type: 'ProviderModels',
        requestId,
        models: [],
        error: `Could not load models${status ? ` (${status})` : ''}. Check the URL, API key and server, or use a manual model ID.`,
      });
    }
  }
  private async saveProvider(draft: ProviderDraft, requestId: string): Promise<void> {
    const session = this.session;
    session.requireIdle();
    session.changing = true;
    await session.snapshot('provider-saving');
    try {
      const config = this.config(draft);
      if (draft.keyAction === 'replace') {
        const remembered = await session.keys.set(config, draft.apiKey.trim(), draft.rememberKey);
        if (draft.rememberKey && !remembered)
          session.send({
            type: 'Notice',
            message: 'OS secure storage is unavailable. The API key is kept for this session only.',
          });
      } else if (draft.keyAction === 'remove') await session.keys.delete(config);
      await session.store.updatePreferences({
        provider: config,
        thinking: draft.thinking,
        setupCompleted: true,
      });
      await session.reloadProvider();
    } finally {
      session.changing = false;
      await session.snapshot('provider-configuration');
    }
    session.send({ type: 'Accepted', requestId, runId: null });
  }
}
