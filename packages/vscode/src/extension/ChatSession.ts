import type { ActiveChatRun } from './ActiveChatRun.js';
import { WorkspaceDraft } from './WorkspaceDraft.js';
import { handlePresentationAction, presentationActions } from './handlePresentationAction.js';
import { readUiPreferences } from './readUiPreferences.js';
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
import type { WorkspaceRuntime } from '../adapters/WorkspaceRuntime.js';
import { ProviderApiKeyStore } from '../providers/ProviderApiKeyStore.js';
import { ProviderManager } from '../providers/ProviderManager.js';
import type { WorkspaceSkillRepository } from '../../../runtime/src/skills/WorkspaceSkillRepository.js';
import type { WorkspaceProjectInstructions } from '../../../runtime/src/adapters/WorkspaceProjectInstructions.js';
import { WebviewApprovalPort } from '../webview/WebviewApprovalPort.js';
import { approvalView, projectEvent } from '../../../runtime/src/presentation/projectEvent.js';
import { ContextAttachmentManager } from './ContextAttachmentManager.js';
import { projectConversationMessages } from '../../../runtime/src/presentation/projectConversationMessages.js';
import { nextStreamingMessage } from '../../../runtime/src/presentation/nextStreamingMessage.js';
import { previewContext } from '../../../runtime/src/presentation/previewContext.js';
import { contextAttachmentViews } from '../../../runtime/src/presentation/contextAttachmentViews.js';
import { StreamEventBuffer } from '../../../runtime/src/presentation/StreamEventBuffer.js';
import { logAgentEvent } from './logAgentEvent.js';
import { readRunSettings } from './readRunSettings.js';
import { createWorkspaceServices } from './createWorkspaceServices.js';
export class ChatSession {
  readonly hostSessionId = randomUUID();
  readonly approval = new WebviewApprovalPort();
  private sequence = 0;
  private readonly draft: WorkspaceDraft;
  private configuring = false;
  private providerRefreshPending = false;
  private readonly events = new StreamEventBuffer((event) =>
    this.deliver({
      ...this.envelope(),
      type: 'Event',
      runId: this.activeRun?.id ?? null,
      event: projectEvent(event),
    }),
  );
  private readonly repository = new InMemoryConversationRepository();
  private readonly counters = new Map<string, TokenCounter>();
  private readonly providers: ProviderManager;
  private readonly contextAttachments: ContextAttachmentManager;
  private conversationId = randomUUID();
  private activeRun: ActiveChatRun | null = null;
  private preparingRun: CancellationSource | null = null;
  private streamingResponse: SessionSnapshot['messages'][number] | null = null;
  private modelDiscovery: CancellationSource | null = null;
  private initialization: Promise<void> | null = null;
  private initializationCancellation: CancellationSource | null = null;
  private runtime: WorkspaceRuntime | null = null;
  private skillsRepository: WorkspaceSkillRepository | null = null;
  private projectInstructions: WorkspaceProjectInstructions | null = null;
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
    this.contextAttachments = new ContextAttachmentManager(
      root,
      () => !this.activeRun && !this.preparingRun && !this.configuring && !this.disposed,
    );
    this.draft = new WorkspaceDraft(context.workspaceState);
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
    this.streamingResponse = nextStreamingMessage(this.streamingResponse, event);
    logAgentEvent(this.output, event);
    this.events.push(event);
  }
  async configureProvider(setup: () => Promise<boolean>): Promise<void> {
    if (this.activeRun || this.preparingRun || this.configuring || this.disposed)
      throw new Error('Stop generation or finish the current setup before changing providers.');
    this.configuring = true;
    await this.snapshot('setup-started');
    try {
      await this.initialization;
      if (await setup()) {
        this.selectedModel = '';
        this.providerRefreshPending = true;
      }
    } finally {
      this.configuring = false;
      if (this.providerRefreshPending) await this.configurationChanged();
      else await this.snapshot('setup-closed');
    }
  }
  async configurationChanged(): Promise<void> {
    this.providerRefreshPending = true;
    if (this.activeRun || this.preparingRun || this.configuring || this.disposed) return;
    this.providerRefreshPending = false;
    await this.refreshModels(true);
    await this.snapshot('provider-configuration');
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
      const services = await createWorkspaceServices(
        this.root,
        this.approval,
        { emit: (event) => this.emit(event) },
        source,
      );
      this.runtime = services.runtime;
      this.skillsRepository = services.skills;
      this.projectInstructions = services.instructions;
    }
    await this.runtime?.initialize(source);
    this.skills = (await this.skillsRepository?.discover(this.root ?? '', source)) ?? [];
    await this.refreshModels();
  }
  async refreshModels(force = false): Promise<void> {
    if (this.disposed) return;
    this.modelDiscovery?.cancel();
    const source = new CancellationSource();
    this.modelDiscovery = source;
    try {
      const discovered = await this.providers.discover(source, force);
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
      ...readUiPreferences(),
      conversationId: this.conversationId,
      draft: this.draft.text,
      activeRunId: activeRun?.id ?? null,
      state: this.state,
      mode: this.mode,
      selectedModelId: this.selectedModel || this.providers.defaultModelId(),
      models: this.models.map((model) => ({ ...model })),
      providerStatus: this.providerStatus,
      providerLabel: this.providers.label(),
      setupCompleted: this.context.globalState?.get<boolean>('kova.setupCompleted', false) ?? false,
      configuringProvider: this.configuring,
      toolsEnabled: Boolean(this.root && selected?.tools === 'Supported'),
      skills: this.skills.map((skill) => ({ ...skill })),
      activeSkillId: this.skillId,
      usage: this.usage ? structuredClone(this.usage) : null,
      messages,
      contextAttachments: contextAttachmentViews(this.contextAttachments.list()),
      pendingApproval: this.approval.requestPending
        ? approvalView(this.approval.requestPending)
        : null,
      thinkingEnabled: activeRun?.thinkingEnabled ?? this.providers.thinkingEnabled(),
      contextMaxTokens: activeRun?.contextMaxTokens ?? settings.get('context.maxTokens', 32768),
    };
    this.events.flush();
    this.deliver({ ...this.envelope(), type: 'Snapshot', requestId, snapshot });
  }
  async handle(message: WebviewMessage): Promise<void> {
    if (this.requests.has(message.requestId)) throw new Error('Duplicate request ID.');
    this.requests.add(message.requestId);
    if (this.requests.size > 200) this.requests.delete(this.requests.values().next().value!);
    if (
      presentationActions.has(message.type) &&
      (await handlePresentationAction(message, this.context, {
        read: (id) => this.repository.get(id),
        current: (id) =>
          id === this.conversationId && !this.activeRun && !this.preparingRun && !this.configuring,
        partial: this.partial,
        provider: this.providers.label(),
        model: this.selectedModel,
        notify: (message) => this.deliver({ ...this.envelope(), type: 'Notice', message }),
      }))
    )
      return;
    switch (message.type) {
      case 'PreviewContext':
        this.deliver({
          ...this.envelope(),
          type: 'ContextPreview',
          requestId: message.requestId,
          preview: previewContext(this.conversationId, this.contextAttachments.list(), message),
        });
        return;
      case 'UpdateDraft':
        if (message.conversationId === this.conversationId) {
          await this.draft.set(message.prompt);
        }
        return;
      case 'Ready':
        await this.snapshot(message.requestId);
        return;
      case 'RetryProvider':
        if (this.activeRun || this.preparingRun || this.configuring)
          throw new Error('Wait until generation stops.');
        await this.refreshModels(true);
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
      case 'CompleteSetup':
        await this.context.globalState?.update('kova.setupCompleted', true);
        await this.snapshot(message.requestId);
        return;
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
    if (this.activeRun || this.preparingRun || this.configuring)
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
      const runSettings = readRunSettings(this.providers, model);
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
        ...runSettings,
        attachments: this.contextAttachments.selected(message.attachmentIds),
        maxToolIterations: 10,
        toolsEnabled: Boolean(this.root && model.tools === 'Supported'),
      };
      const provider = await this.providers.forConversation(this.conversationId);
      if (this.providerRefreshPending)
        throw new Error('Provider configuration changed. Retry after model discovery.');
      const agent = new ChatAgent(
        provider,
        this.repository,
        counter,
        this.runtime,
        this.skillsRepository ? new SkillLoader(this.skillsRepository) : null,
        this.projectInstructions,
      );
      cancellation.throwIfCancellationRequested();
      await this.draft.consume(message.prompt);
      this.state = 'BuildingContext';
      this.activeRun = {
        id: runId,
        cancellation,
        task: Promise.resolve(),
        prompt: message.prompt,
        thinkingEnabled: request.thinkingEnabled,
        contextMaxTokens: request.context.maxTokens,
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
          if (this.providerRefreshPending) await this.configurationChanged();
          await this.snapshot(`completed-${runId}`);
          if (!this.activeRun) this.streamingResponse = null;
        }
      })();
      return runId;
    } finally {
      if (this.preparingRun === cancellation) this.preparingRun = null;
      if (this.providerRefreshPending && !this.activeRun) await this.configurationChanged();
    }
  }
  async newConversation(): Promise<void> {
    const active = this.activeRun;
    this.cancelActiveRun();
    await active?.task;
    const previousConversationId = this.conversationId;
    await this.repository.remove(previousConversationId);
    this.providers.forgetConversation(previousConversationId);
    this.conversationId = randomUUID();
    this.contextAttachments.clear();
    await this.draft.set('');
    this.state = 'Idle';
    this.usage = null;
    this.partial = false;
    this.streamingResponse = null;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.events.dispose();
    this.modelDiscovery?.cancel();
    this.initializationCancellation?.cancel();
    this.cancelActiveRun();
    await this.activeRun?.task;
    await this.initialization?.catch(() => {});
    this.approval.dispose();
    await this.runtime?.dispose();
    this.providers.clear();
    this.contextAttachments.dispose();
    this.listeners.clear();
  }
}
