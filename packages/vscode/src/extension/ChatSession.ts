import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ChatAgent } from '../../../core/src/agents/ChatAgent.js';
import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';
import type { AgentMode } from '../../../core/src/agents/AgentMode.js';
import type { AgentState } from '../../../core/src/agents/AgentState.js';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { ContextUsage } from '../../../core/src/context/ContextUsage.js';
import { TokenCounter } from '../../../core/src/context/TokenCounter.js';
import { InMemoryConversationRepository } from '../../../core/src/conversations/InMemoryConversationRepository.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { SkillMetadata } from '../../../core/src/skills/Skill.js';
import { SkillLoader } from '../../../core/src/skills/SkillLoader.js';
import type { HostMessage } from '../../../protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { NodeProcessRunner } from '../adapters/NodeProcessRunner.js';
import { NodeWorkspacePathGuard } from '../adapters/NodeWorkspacePathGuard.js';
import { WorkspaceRuntime } from '../adapters/WorkspaceRuntime.js';
import { ErsGuardrailAdapter } from '../integrations/ErsGuardrailAdapter.js';
import { ProviderApiKeyStore } from '../providers/ProviderApiKeyStore.js';
import { ProviderManager } from '../providers/ProviderManager.js';
import { WorkspaceSkillRepository } from '../skills/WorkspaceSkillRepository.js';
import { WebviewApprovalPort } from '../webview/WebviewApprovalPort.js';
import { approvalView, projectEvent } from '../webview/projectEvent.js';
import { ContextAttachmentManager } from './ContextAttachmentManager.js';
import { projectConversationMessages } from './projectConversationMessages.js';
export class ChatSession {
  readonly hostSessionId = randomUUID();
  readonly approval = new WebviewApprovalPort();
  private sequence = 0;
  private readonly repository = new InMemoryConversationRepository();
  private readonly counters = new Map<string, TokenCounter>();
  private readonly providers: ProviderManager;
  private readonly contextAttachments: ContextAttachmentManager;
  private conversationId = randomUUID();
  private activeRun: {
    id: string;
    cancellation: CancellationSource;
    task: Promise<void>;
    prompt: string;
    thinkingEnabled: boolean;
    contextMaxTokens: number;
  } | null = null;
  private preparingRun: CancellationSource | null = null;
  private streamingResponse: SessionSnapshot['messages'][number] | null = null;
  private modelDiscovery: CancellationSource | null = null;
  private initialization: Promise<void> | null = null;
  private initializationCancellation: CancellationSource | null = null;
  private runtime: WorkspaceRuntime | null = null;
  private skillsRepository: WorkspaceSkillRepository | null = null;
  private models: readonly ModelInfo[] = [];
  private skills: readonly SkillMetadata[] = [];
  private skillId: string | null = null;
  private selectedModel = '';
  private providerFingerprint = '';
  private providerStatus: 'Available' | 'Unavailable' | 'ModelMissing' = 'Unavailable';
  private state: AgentState = 'Idle';
  private mode: AgentMode = 'Manual';
  private usage: ContextUsage | null = null;
  private partial = false;
  private disposed = false;
  private readonly listeners = new Set<(message: HostMessage) => void>();
  private readonly requests = new Set<string>();
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly root: string | null,
    private readonly output: vscode.OutputChannel,
    providers?: ProviderManager,
  ) {
    this.providers =
      providers ?? new ProviderManager(new ProviderApiKeyStore(this.context.secrets));
    this.contextAttachments = new ContextAttachmentManager(root);
  }
  connect(deliver: (message: HostMessage) => void): () => void {
    this.listeners.add(deliver);
    return () => this.listeners.delete(deliver);
  }
  captureEditor(editor: vscode.TextEditor | undefined): void {
    this.contextAttachments.captureEditor(editor);
  }
  cancelActiveRun(): void {
    this.preparingRun?.cancel();
    this.activeRun?.cancellation.cancel();
  }
  private deliver(message: HostMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        this.output.appendLine('[WebviewDeliveryFailed]');
      }
    }
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
    if (event.type === 'StateChanged') {
      this.state = event.state;
      if (event.state === 'Failed') this.partial = this.streamingResponse?.partial ?? false;
    }
    if (event.type === 'ContextUpdated') this.usage = event.usage;
    if (event.type === 'GenerationCancelled') this.partial = true;
    if (event.type === 'ResponseStarted')
      this.streamingResponse = {
        id: event.messageId,
        role: 'assistant',
        content: '',
        partial: true,
      };
    if (event.type === 'ResponseDelta' && this.streamingResponse?.id === event.messageId)
      this.streamingResponse = {
        ...this.streamingResponse,
        content: (this.streamingResponse.content + event.text).slice(0, 65_536),
      };
    if (event.type === 'ResponseCompleted' && this.streamingResponse?.id === event.messageId)
      this.streamingResponse = { ...this.streamingResponse, partial: false };
    if (!['ResponseDelta', 'ThinkingDelta'].includes(event.type))
      this.output.appendLine(
        `[${event.type}]${
          event.type === 'McpServerStarted'
            ? ` ${event.command} ${event.args.map((arg) => JSON.stringify(arg)).join(' ')}`
            : event.type === 'HookObserved'
              ? ` ${event.report.command} ${event.report.args
                  .map((arg) => JSON.stringify(arg))
                  .join(' ')} ${event.report.outcome} ${event.report.durationMs}ms`
              : event.type === 'ErrorOccurred'
                ? ` ${event.code}`
                : ''
        }`,
      );
    this.deliver({
      ...this.envelope(),
      type: 'Event',
      runId: this.activeRun?.id ?? null,
      event: projectEvent(event),
    });
  }
  initialize(): Promise<void> {
    if (this.activeRun) return Promise.resolve();
    if (this.initialization) return this.initialization;
    if (this.preparingRun || this.disposed) return Promise.resolve();
    const cancellation = new CancellationSource();
    this.initializationCancellation = cancellation;
    const task = this.initializeSession(cancellation);
    this.initialization = task;
    void task
      .finally(() => {
        if (this.initialization === task) {
          this.initialization = null;
          this.initializationCancellation = null;
        }
      })
      .catch(() => {});
    return task;
  }
  private async initializeSession(source: CancellationSource): Promise<void> {
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
                  source,
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
    await this.runtime?.initialize(source);
    this.skills = (await this.skillsRepository?.discover(this.root ?? '', source)) ?? [];
    await this.refreshModels();
  }
  async refreshModels(): Promise<void> {
    if (this.disposed) return;
    this.modelDiscovery?.cancel();
    const source = new CancellationSource();
    this.modelDiscovery = source;
    try {
      const discovered = await this.providers.discover(source);
      if (this.disposed || this.modelDiscovery !== source || source.isCancellationRequested) return;
      const changedProvider = this.providerFingerprint !== discovered.fingerprint;
      this.providerFingerprint = discovered.fingerprint;
      this.models = discovered.models;
      if (!this.selectedModel || changedProvider) this.selectedModel = discovered.defaultModelId;
      this.providerStatus = this.models.some((model) => model.id === this.selectedModel)
        ? 'Available'
        : 'ModelMissing';
    } catch (error) {
      if (!source.isCancellationRequested) {
        this.models = [];
        this.providerStatus = 'Unavailable';
        this.emit({
          type: 'ErrorOccurred',
          code: 'ProviderUnavailable',
          message: `${this.providers.label()} is unavailable. ${
            error instanceof Error ? error.message : 'Check provider configuration.'
          }`,
          recoverable: true,
        });
      }
    }
  }
  async snapshot(requestId: string): Promise<void> {
    const conversationId = this.conversationId;
    const conversation = await this.repository.get(conversationId);
    if (this.disposed) return;
    if (conversationId !== this.conversationId) return this.snapshot(requestId);
    const activeRun = this.activeRun;
    const selected = this.models.find((model) => model.id === this.selectedModel);
    const settings = vscode.workspace.getConfiguration('kova');
    const messages = projectConversationMessages(
      conversation?.entries ?? [],
      this.partial,
      activeRun,
      this.streamingResponse,
    );
    const snapshot: SessionSnapshot = {
      conversationId: this.conversationId,
      activeRunId: activeRun?.id ?? null,
      state: this.state,
      mode: this.mode,
      selectedModelId: this.selectedModel || this.providers.defaultModelId(),
      models: this.models.map((model) => ({ ...model })),
      providerStatus: this.providerStatus,
      toolsEnabled: Boolean(this.root && selected?.tools === 'Supported'),
      skills: this.skills.map((skill) => ({ ...skill })),
      activeSkillId: this.skillId,
      usage: this.usage ? structuredClone(this.usage) : null,
      messages,
      contextAttachments: this.contextAttachments
        .list()
        .map((item) => ({ id: item.id, label: item.label })),
      pendingApproval: this.approval.requestPending
        ? approvalView(this.approval.requestPending)
        : null,
      thinkingEnabled: activeRun?.thinkingEnabled ?? this.providers.thinkingEnabled(),
      contextMaxTokens: activeRun?.contextMaxTokens ?? settings.get('context.maxTokens', 8192),
    };
    this.deliver({ ...this.envelope(), type: 'Snapshot', requestId, snapshot });
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
        if (this.activeRun || this.preparingRun) throw new Error('Wait until generation stops.');
        await this.refreshModels();
        await this.snapshot(message.requestId);
        return;
      case 'SubmitPrompt': {
        const runId = await this.submit(message);
        this.deliver({
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
        await this.contextAttachments.add(message.source);
        await this.snapshot(message.requestId);
        return;
      case 'RemoveContext':
        if (this.activeRun) throw new Error('Cannot change context during a run.');
        this.contextAttachments.remove(message.attachmentId);
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
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          `@ext:${this.context.extension.id}`,
        );
        break;
      case 'OpenSetupInstructions':
        await vscode.commands.executeCommand(
          'markdown.showPreview',
          vscode.Uri.joinPath(this.context.extensionUri, 'SETUP.md'),
        );
        break;
    }
    this.deliver({
      ...this.envelope(),
      type: 'Accepted',
      requestId: message.requestId,
      runId: this.activeRun?.id ?? null,
    });
  }
  reject(requestId: string, message: string): void {
    this.deliver({
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
    if (this.activeRun || this.preparingRun)
      throw new Error('Kova is already generating. Stop before submitting another prompt.');
    const cancellation = new CancellationSource();
    this.preparingRun = cancellation;
    try {
      await this.initialization;
      cancellation.throwIfCancellationRequested();
      if (this.disposed) throw new Error('Kova session is closed.');
      if (message.attachmentIds.some((id) => !this.contextAttachments.has(id)))
        throw new Error('Unknown context attachment.');
      if (message.skillId && !this.skills.some((skill) => skill.id === message.skillId))
        throw new Error('Unknown selected skill.');
      const model = this.models.find((item) => item.id === message.modelId);
      if (!model) throw new Error('Selected model is unavailable. Retry model discovery.');
      const settings = vscode.workspace.getConfiguration('kova');
      const maxTokens = settings.get('context.maxTokens', 8192);
      if (model.maxContextTokens && maxTokens > model.maxContextTokens)
        throw new Error('Configured context exceeds the model context limit.');
      const thinking = this.providers.thinkingEnabled();
      if (thinking && model.thinking !== 'Supported')
        throw new Error(
          'This model does not report thinking support. Disable thinking in Kova settings.',
        );
      const runId = randomUUID();
      this.selectedModel = model.id;
      this.providerStatus = 'Available';
      this.mode = message.mode;
      this.skillId = message.skillId;
      this.partial = false;
      this.streamingResponse = null;
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
        attachments: this.contextAttachments.selected(message.attachmentIds),
        thinkingEnabled: thinking,
        keepAliveSeconds:
          this.providers.kind() === 'ollama' ? settings.get('ollama.keepAliveSeconds', 300) : 0,
        maxToolIterations: 10,
        commandAllowlist: settings.get<readonly string[]>('commands.allow', []),
        toolsEnabled: Boolean(this.root && model.tools === 'Supported'),
      };
      const agent = new ChatAgent(
        await this.providers.forConversation(this.conversationId),
        this.repository,
        counter,
        this.runtime,
        this.skillsRepository ? new SkillLoader(this.skillsRepository) : null,
      );
      this.state = 'BuildingContext';
      this.activeRun = {
        id: runId,
        cancellation,
        task: Promise.resolve(),
        prompt: message.prompt,
        thinkingEnabled: thinking,
        contextMaxTokens: maxTokens,
      };
      this.activeRun.task = (async () => {
        try {
          await this.snapshot(`started-${runId}`);
          await this.runtime?.initialize(cancellation);
          await agent.run(request, cancellation, { emit: (event) => this.emit(event) });
        } catch (error) {
          if (cancellation.isCancellationRequested) {
            this.emit({ type: 'GenerationCancelled' });
            this.emit({ type: 'StateChanged', state: 'Cancelled' });
          } else {
            this.emit({
              type: 'ErrorOccurred',
              code: 'RuntimeFailed',
              message: error instanceof Error ? error.message : 'Runtime failed.',
              recoverable: true,
            });
            this.emit({ type: 'StateChanged', state: 'Failed' });
          }
        } finally {
          if (this.activeRun?.id === runId) this.activeRun = null;
          await this.snapshot(`completed-${runId}`);
          if (!this.activeRun) this.streamingResponse = null;
        }
      })();
      return runId;
    } finally {
      if (this.preparingRun === cancellation) this.preparingRun = null;
    }
  }
  async newConversation(): Promise<void> {
    this.preparingRun?.cancel();
    const active = this.activeRun;
    active?.cancellation.cancel();
    await active?.task;
    const previousConversationId = this.conversationId;
    await this.repository.remove(previousConversationId);
    this.providers.forgetConversation(previousConversationId);
    this.conversationId = randomUUID();
    this.state = 'Idle';
    this.usage = null;
    this.partial = false;
    this.streamingResponse = null;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.modelDiscovery?.cancel();
    this.initializationCancellation?.cancel();
    this.preparingRun?.cancel();
    this.activeRun?.cancellation.cancel();
    await this.activeRun?.task;
    await this.initialization?.catch(() => {});
    this.approval.dispose();
    await this.runtime?.dispose();
    this.providers.clear();
    this.contextAttachments.dispose();
    this.listeners.clear();
  }
}
