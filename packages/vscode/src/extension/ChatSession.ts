import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { stat, readFile } from 'node:fs/promises';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import { ChatAgent } from '../../../core/src/agents/ChatAgent.js';
import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';
import type { AgentMode } from '../../../core/src/agents/AgentMode.js';
import type { AgentState } from '../../../core/src/agents/AgentState.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import type { ContextUsage } from '../../../core/src/context/ContextUsage.js';
import { TokenCounter } from '../../../core/src/context/TokenCounter.js';
import { InMemoryConversationRepository } from '../../../core/src/conversations/InMemoryConversationRepository.js';
import { SkillLoader } from '../../../core/src/skills/SkillLoader.js';
import type { SkillMetadata } from '../../../core/src/skills/Skill.js';
import { OllamaConnection } from '../../../ollama/src/OllamaConnection.js';
import { OllamaLlmProvider } from '../../../ollama/src/OllamaLlmProvider.js';
import { OllamaModelCatalog } from '../../../ollama/src/OllamaModelCatalog.js';
import type { HostMessage } from '../../../protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { WorkspaceRuntime } from '../adapters/WorkspaceRuntime.js';
import { NodeWorkspacePathGuard } from '../adapters/NodeWorkspacePathGuard.js';
import { NodeProcessRunner } from '../adapters/NodeProcessRunner.js';
import { WorkspaceSkillRepository } from '../skills/WorkspaceSkillRepository.js';
import { ErsGuardrailAdapter } from '../integrations/ErsGuardrailAdapter.js';
import { WebviewApprovalPort } from '../webview/WebviewApprovalPort.js';
import { projectEvent, approvalView } from '../webview/projectEvent.js';

export class ChatSession {
  readonly hostSessionId = randomUUID();
  readonly approval = new WebviewApprovalPort();
  private sequence = 0;
  private readonly repository = new InMemoryConversationRepository();
  private readonly counters = new Map<string, TokenCounter>();
  private conversationId = randomUUID();
  private activeRun: { id: string; cancellation: CancellationSource; task: Promise<void> } | null =
    null;
  private modelDiscovery: CancellationSource | null = null;
  private initialization: Promise<void> | null = null;
  private runtime: WorkspaceRuntime | null = null;
  private skillsRepository: WorkspaceSkillRepository | null = null;
  private models: readonly ModelInfo[] = [];
  private skills: readonly SkillMetadata[] = [];
  private skillId: string | null = null;
  private attachments: ContextAttachment[] = [];
  private selectedModel = '';
  private providerStatus: 'Available' | 'Unavailable' | 'ModelMissing' = 'Unavailable';
  private state: AgentState = 'Idle';
  private mode: AgentMode = 'Manual';
  private usage: ContextUsage | null = null;
  private partial = false;
  private disposed = false;
  private deliver: ((message: HostMessage) => void) | null = null;
  private readonly requests = new Set<string>();
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly root: string | null,
    private readonly output: vscode.OutputChannel,
  ) {}
  connect(deliver: (message: HostMessage) => void): void {
    this.deliver = deliver;
  }
  private envelope() {
    return {
      protocolVersion: 1 as const,
      hostSessionId: this.hostSessionId,
      sequence: ++this.sequence,
      workspaceId: this.root,
    };
  }
  private emit(event: AgentEvent): void {
    if (this.disposed) return;
    if (event.type === 'StateChanged') this.state = event.state;
    if (event.type === 'ContextUpdated') this.usage = event.usage;
    if (event.type === 'GenerationCancelled') this.partial = true;
    if (!['ResponseDelta', 'ThinkingDelta'].includes(event.type))
      this.output.appendLine(
        `[${event.type}]${event.type === 'McpServerStarted' ? ` ${event.command} ${event.args.map((arg) => JSON.stringify(arg)).join(' ')}` : event.type === 'HookObserved' ? ` ${event.report.command} ${event.report.args.map((arg) => JSON.stringify(arg)).join(' ')} ${event.report.outcome} ${event.report.durationMs}ms` : event.type === 'ErrorOccurred' ? ` ${event.code}` : ''}`,
      );
    this.deliver?.({
      ...this.envelope(),
      type: 'Event',
      runId: this.activeRun?.id ?? null,
      event: projectEvent(event),
    });
  }
  initialize(): Promise<void> {
    // A recreated Webview must resync the captured run, never reload its configuration.
    if (this.activeRun) return Promise.resolve();
    if (this.initialization) return this.initialization;
    const task = this.initializeSession();
    this.initialization = task;
    void task
      .finally(() => {
        if (this.initialization === task) this.initialization = null;
      })
      .catch(() => {});
    return task;
  }
  private async initializeSession(): Promise<void> {
    if (this.root && !this.runtime) {
      const config = vscode.workspace.getConfiguration('kova');
      const project = config.get<string>('ers.guardrailsProject', '');
      const guards = project
        ? [
            new ErsGuardrailAdapter(
              this.root,
              (
                await new NodeWorkspacePathGuard(this.root).resolve(
                  this.root,
                  project,
                  'Read',
                  new CancellationSource(),
                )
              ).canonicalPath,
              new NodeProcessRunner(this.root),
            ),
          ]
        : [];
      this.runtime = new WorkspaceRuntime(
        this.root,
        this.approval,
        { emit: (event) => this.emit(event) },
        guards,
      );
      this.skillsRepository = new WorkspaceSkillRepository(this.root, (message) =>
        this.emit({ type: 'ErrorOccurred', code: 'InvalidSkill', message, recoverable: true }),
      );
    }
    const source = new CancellationSource();
    await this.runtime?.initialize(source);
    this.skills = (await this.skillsRepository?.discover(this.root ?? '', source)) ?? [];
    await this.refreshModels();
  }
  async refreshModels(): Promise<void> {
    this.modelDiscovery?.cancel();
    const source = new CancellationSource();
    this.modelDiscovery = source;
    try {
      const config = vscode.workspace.getConfiguration('kova');
      const models = await new OllamaModelCatalog(
        new OllamaConnection(config.get('ollama.baseUrl', 'http://127.0.0.1:11434'), fetch, 15_000),
      ).listInstalled(source);
      if (this.disposed || this.modelDiscovery !== source || source.isCancellationRequested) return;
      this.models = models;
      if (!this.selectedModel) this.selectedModel = config.get('ollama.model', 'qwen3:4b');
      this.providerStatus = this.models.some((model) => model.id === this.selectedModel)
        ? 'Available'
        : 'ModelMissing';
    } catch {
      if (!source.isCancellationRequested) {
        this.models = [];
        this.providerStatus = 'Unavailable';
        this.emit({
          type: 'ErrorOccurred',
          code: 'OllamaUnavailable',
          message: 'Ollama is unavailable. Start the local runtime and press Retry.',
          recoverable: true,
        });
      }
    }
  }
  async snapshot(requestId: string): Promise<void> {
    const conversation = await this.repository.get(this.conversationId);
    const selected = this.models.find((model) => model.id === this.selectedModel);
    const settings = vscode.workspace.getConfiguration('kova');
    const snapshot: SessionSnapshot = {
      conversationId: this.conversationId,
      activeRunId: this.activeRun?.id ?? null,
      state: this.state,
      mode: this.mode,
      selectedModelId: this.selectedModel || settings.get('ollama.model', 'qwen3:4b'),
      models: this.models.map((model) => ({ ...model })),
      providerStatus: this.providerStatus,
      toolsEnabled: Boolean(this.root && selected?.tools === 'Supported'),
      skills: this.skills.map((skill) => ({ ...skill })),
      activeSkillId: this.skillId,
      usage: this.usage ? structuredClone(this.usage) : null,
      messages: (conversation?.entries ?? [])
        .filter(
          (entry) =>
            entry.message.role !== 'tool' &&
            entry.message.role !== 'system' &&
            !entry.id.endsWith('-repair'),
        )
        .map((entry, index, all) => ({
          id: entry.id,
          role: entry.message.role as 'user' | 'assistant',
          content: entry.message.content,
          partial: this.partial && index === all.length - 1,
        })),
      contextAttachments: this.attachments.map((item) => ({ id: item.id, label: item.label })),
      pendingApproval: this.approval.requestPending
        ? approvalView(this.approval.requestPending)
        : null,
      thinkingEnabled: settings.get('ollama.think', false),
      contextMaxTokens: settings.get('context.maxTokens', 8192),
    };
    this.deliver?.({ ...this.envelope(), type: 'Snapshot', requestId, snapshot });
  }
  async handle(message: WebviewMessage): Promise<void> {
    if (this.requests.has(message.requestId)) throw new Error('Duplicate request ID.');
    this.requests.add(message.requestId);
    if (this.requests.size > 200) this.requests.delete(this.requests.values().next().value!);
    switch (message.type) {
      case 'Ready':
        await this.snapshot(message.requestId);
        return;
      case 'RetryProvider':
        if (this.activeRun) throw new Error('Wait until generation stops.');
        await this.refreshModels();
        await this.snapshot(message.requestId);
        return;
      case 'SubmitPrompt': {
        const runId = await this.submit(message);
        this.deliver?.({
          ...this.envelope(),
          type: 'Accepted',
          requestId: message.requestId,
          runId,
        });
        return;
      }
      case 'CancelRun':
        if (message.runId !== this.activeRun?.id) throw new Error('Run is no longer active.');
        this.activeRun.cancellation.cancel();
        break;
      case 'NewConversation':
        await this.newConversation();
        await this.snapshot(message.requestId);
        return;
      case 'SelectSkill':
        if (this.activeRun) throw new Error('Cannot change skill during a run.');
        if (message.skillId && !this.skills.some((skill) => skill.id === message.skillId))
          throw new Error('Unknown skill.');
        this.skillId = message.skillId;
        await this.snapshot(message.requestId);
        return;
      case 'AddContext':
        if (this.activeRun) throw new Error('Cannot change context during a run.');
        await this.addContext(message.source);
        await this.snapshot(message.requestId);
        return;
      case 'RemoveContext':
        if (this.activeRun) throw new Error('Cannot change context during a run.');
        this.attachments = this.attachments.filter((item) => item.id !== message.attachmentId);
        await this.snapshot(message.requestId);
        return;
      case 'ResolveApproval':
        if (message.runId !== this.activeRun?.id) throw new Error('Stale run approval.');
        this.approval.resolve(
          {
            approvalId: message.approvalId,
            preparationKey: message.preparationKey,
            decision: message.decision,
          },
          message.runId,
        );
        break;
      case 'OpenDiffPreview':
        await this.approval.openDiff(message.approvalId);
        break;
      case 'OpenSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:owlcoder.kova');
        break;
      case 'OpenSetupInstructions':
        await vscode.commands.executeCommand(
          'markdown.showPreview',
          vscode.Uri.joinPath(this.context.extensionUri, 'SETUP.md'),
        );
        break;
    }
    this.deliver?.({
      ...this.envelope(),
      type: 'Accepted',
      requestId: message.requestId,
      runId: this.activeRun?.id ?? null,
    });
  }
  reject(requestId: string, message: string): void {
    this.deliver?.({
      ...this.envelope(),
      type: 'Rejected',
      requestId,
      code: 'InvalidRequest',
      message,
    });
  }
  private async submit(
    message: Extract<WebviewMessage, { type: 'SubmitPrompt' }>,
  ): Promise<string> {
    if (this.activeRun)
      throw new Error('Kova is already generating. Stop before submitting another prompt.');
    if (message.attachmentIds.some((id) => !this.attachments.some((item) => item.id === id)))
      throw new Error('Unknown context attachment.');
    if (message.skillId && !this.skills.some((skill) => skill.id === message.skillId))
      throw new Error('Unknown selected skill.');
    const model = this.models.find((item) => item.id === message.modelId);
    if (!model) throw new Error('Selected model is not installed. Retry model discovery.');
    const settings = vscode.workspace.getConfiguration('kova');
    const maxTokens = settings.get('context.maxTokens', 8192);
    if (model.maxContextTokens && maxTokens > model.maxContextTokens)
      throw new Error('Configured context exceeds the model context limit.');
    const thinking = settings.get('ollama.think', false);
    if (thinking && model.thinking !== 'Supported')
      throw new Error(
        'This model does not report thinking support. Disable thinking in Kova settings.',
      );
    const runId = randomUUID();
    const cancellation = new CancellationSource();
    this.selectedModel = model.id;
    this.providerStatus = 'Available';
    this.mode = message.mode;
    this.skillId = message.skillId;
    this.partial = false;
    const counter = this.counters.get(model.id) ?? new TokenCounter();
    this.counters.set(model.id, counter);
    const request = {
      runId,
      conversationId: this.conversationId,
      workspaceId: this.root ?? '',
      prompt: message.prompt,
      modelId: model.id,
      mode: message.mode,
      activeSkillId: message.skillId,
      context: {
        maxTokens,
        reservedOutputTokens: settings.get('context.reservedOutputTokens', 1024),
        safetyMarginRatio: settings.get('context.safetyMarginRatio', 0.1),
        maxToolOutputCharacters: 8000,
      },
      attachments: this.attachments.filter((item) => message.attachmentIds.includes(item.id)),
      thinkingEnabled: thinking,
      keepAliveSeconds: settings.get('ollama.keepAliveSeconds', 300),
      maxToolIterations: 10,
      commandAllowlist: settings.get<readonly string[]>('commands.allow', []),
      toolsEnabled: Boolean(this.root && model.tools === 'Supported'),
    };
    const agent = new ChatAgent(
      new OllamaLlmProvider(
        new OllamaConnection(settings.get('ollama.baseUrl', 'http://127.0.0.1:11434')),
      ),
      this.repository,
      counter,
      this.runtime,
      this.skillsRepository ? new SkillLoader(this.skillsRepository) : null,
    );
    this.activeRun = { id: runId, cancellation, task: Promise.resolve() };
    this.activeRun.task = (async () => {
      try {
        await this.runtime?.initialize(cancellation);
        await agent.run(request, cancellation, { emit: (event) => this.emit(event) });
      } catch (error) {
        if (!cancellation.isCancellationRequested)
          this.emit({
            type: 'ErrorOccurred',
            code: 'RuntimeFailed',
            message: error instanceof Error ? error.message : 'Runtime failed.',
            recoverable: true,
          });
      } finally {
        if (this.activeRun?.id === runId) this.activeRun = null;
        await this.snapshot(`completed-${runId}`);
      }
    })();
    return runId;
  }
  private async addContext(source: 'Selection' | 'CurrentFile' | 'PickFiles'): Promise<void> {
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
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== 'file')
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
  }
  async newConversation(): Promise<void> {
    const active = this.activeRun;
    active?.cancellation.cancel();
    await active?.task;
    await this.repository.remove(this.conversationId);
    this.conversationId = randomUUID();
    this.state = 'Idle';
    this.usage = null;
    this.partial = false;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.modelDiscovery?.cancel();
    this.activeRun?.cancellation.cancel();
    await this.activeRun?.task;
    this.approval.dispose();
    await this.runtime?.dispose();
  }
}
