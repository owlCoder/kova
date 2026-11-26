import type { ActiveChatRun } from './ActiveChatRun.js';
import { ChatResources } from './ChatResources.js';
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
import type { Conversation } from '../../../core/src/conversations/Conversation.js';
import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import type { WorkspaceConversationRepository } from './conversationStore.js';
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
import { projectEvent } from '../../../runtime/src/presentation/projectEvent.js';
import { ContextAttachmentManager } from './ContextAttachmentManager.js';
import { nextStreamingMessage } from '../../../runtime/src/presentation/nextStreamingMessage.js';
import { composeSnapshot } from './sessionSnapshot.js';
import { StreamEventBuffer } from '../../../runtime/src/presentation/StreamEventBuffer.js';
import { logAgentEvent } from './logAgentEvent.js';
import { readRunSettings } from './readRunSettings.js';
import { createWorkspaceServices } from './createWorkspaceServices.js';
import { WorkspaceRootController } from './WorkspaceRootController.js';
import { ModelDiscovery } from './modelDiscovery.js';
import type { WorkspaceContextHost } from './workspaceContext.js';
import { SessionInitializer } from './sessionInitializer.js';
import {
  openStoredConversation,
  resetConversation,
  type ConversationLifecycleHost,
} from './conversationLifecycle.js';
import { handleChatMessage, type ChatMessageHost } from './handleChatMessage.js';
import { RunChangeTracker } from './runChanges.js';
export class ChatSession {
  readonly hostSessionId = randomUUID();
  readonly currentConversationId = (): string => this.conversationId;
  readonly approval = new WebviewApprovalPort();
  private sequence = 0;
  private readonly resources: ChatResources;
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
  private readonly counters = new Map<string, TokenCounter>();
  private readonly providers: ProviderManager;
  private readonly discovery: ModelDiscovery;
  private readonly contextAttachments: ContextAttachmentManager;
  private conversationId = randomUUID();
  private activeRun: ActiveChatRun | null = null;
  private preparingRun: CancellationSource | null = null;
  private streamingResponse: SessionSnapshot['messages'][number] | null = null;
  private readonly initializer: SessionInitializer;
  private readonly workspaceHost: WorkspaceContextHost;
  private runtime: WorkspaceRuntime | null = null;
  private skillsRepository: WorkspaceSkillRepository | null = null;
  private projectInstructions: WorkspaceProjectInstructions | null = null;
  private skills: readonly SkillMetadata[] = [];
  private skillId: string | null = null;
  private state: AgentState = 'Idle';
  private mode: AgentMode = 'Manual';
  private usage: ContextUsage | null = null;
  private partial = false;
  private disposed = false;
  private readonly listeners = new Set<(message: HostMessage) => void>();
  private readonly requests = new Set<string>();
  private readonly roots: WorkspaceRootController;
  constructor(
    private readonly context: vscode.ExtensionContext,
    root: string | null,
    private readonly output: vscode.OutputChannel,
    providers?: ProviderManager,
    private readonly repository: ConversationRepository = new InMemoryConversationRepository(),
  ) {
    this.providers =
      providers ?? new ProviderManager(new ProviderApiKeyStore(this.context.secrets));
    this.discovery = new ModelDiscovery(
      this.providers,
      (message) =>
        this.emit({
          type: 'ErrorOccurred',
          code: 'ProviderUnavailable',
          message,
          recoverable: true,
        }),
      () => this.disposed,
    );
    this.roots = new WorkspaceRootController(root, {
      busy: () => Boolean(this.activeRun || this.preparingRun || this.configuring),
      disposed: () => this.disposed,
      reset: () => this.resetWorkspace(),
      reinitialize: () => this.initialize().catch(() => {}),
      notify: () => this.snapshot('workspace-root'),
    });
    this.contextAttachments = new ContextAttachmentManager(
      () => this.roots.current,
      () => !this.activeRun && !this.preparingRun && !this.configuring && !this.disposed,
    );
    this.initializer = new SessionInitializer({
      root: () => this.roots.current,
      busy: () => Boolean(this.activeRun || this.preparingRun || this.disposed),
      disposed: () => this.disposed,
      hasRuntime: () => this.runtime !== null,
      createServices: (root, cancellation) =>
        createWorkspaceServices(
          root,
          this.approval,
          { emit: (event) => this.emit(event) },
          cancellation,
        ),
      setServices: (services) => {
        this.runtime = services.runtime;
        this.skillsRepository = services.skills;
        this.projectInstructions = services.instructions;
      },
      initializeRuntime: (cancellation) =>
        this.runtime?.initialize(cancellation) ?? Promise.resolve(),
      discoverSkills: (root, cancellation) =>
        this.skillsRepository?.discover(root, cancellation) ?? Promise.resolve([]),
      setSkills: (skills) => {
        this.skills = skills;
      },
      refreshModels: () => this.refreshModels(),
    });
    this.workspaceHost = {
      root: () => this.roots.current,
      runActive: () => Boolean(this.activeRun),
      attachments: this.contextAttachments,
      deliver: (message) => this.deliver(message),
      envelope: () => this.envelope(),
      snapshot: (requestId) => this.snapshot(requestId),
    };
    this.lifecycle = {
      activeRun: () => this.activeRun,
      conversationId: () => this.conversationId,
      cancelRun: () => this.cancelActiveRun(),
      forgetConversation: (id) => this.providers.forgetConversation(id),
      clearAttachments: () => this.contextAttachments.clear(),
      clearDraft: () => this.resources.draft.set(''),
      resetTransientState: () => {
        this.state = 'Idle';
        this.usage = null;
        this.partial = false;
        this.streamingResponse = null;
      },
      setConversationId: (id) => {
        this.conversationId = id as typeof this.conversationId;
      },
      hasConversation: async (id) => Boolean(await this.repository.get(id)),
      snapshot: (requestId) => this.snapshot(requestId),
    };
    this.resources = new ChatResources(
      context,
      this.repository,
      () => ({ conversationId: this.conversationId, attachments: this.contextAttachments.list() }),
      (payload) => this.deliver({ ...this.envelope(), ...payload } as HostMessage),
    );
    this.messageHost = {
      context: this.context,
      resources: this.resources,
      workspace: this.workspaceHost,
      attachments: this.contextAttachments,
      approval: this.approval,
      requests: this.requests,
      isRunning: () => Boolean(this.activeRun || this.preparingRun),
      isConfiguring: () => this.configuring,
      isCurrentConversation: (id) => id === this.conversationId,
      partial: () => this.partial,
      providerLabel: () => this.providers.label(),
      selectedModel: () => this.discovery.selectedModel,
      knownSkill: (id) => this.skills.some((skill) => skill.id === id),
      selectSkill: (id) => {
        this.skillId = id;
      },
      activeRunId: () => this.activeRun?.id ?? null,
      revertRun: async (runId) => {
        if (this.activeRun) throw new Error('Wait until generation stops.');
        const summary = await this.changes.revert(runId, async (files) => {
          const list = files
            .slice(0, 10)
            .map((file) => file.path)
            .join(', ');
          const choice = await vscode.window.showWarningMessage(
            `Revert ${files.length} file change(s) from this run? ${list}`,
            { modal: true },
            'Revert',
          );
          return choice === 'Revert';
        });
        this.deliver({ ...this.envelope(), type: 'Notice', message: summary });
        await this.snapshot('reverted');
      },
      cancelRun: (runId) => {
        if (runId !== this.activeRun?.id) throw new Error('Run is no longer active.');
        this.activeRun.cancellation.cancel();
      },
      resolveApproval: (runId, approvalId, preparationKey, decision) => {
        if (runId !== this.activeRun?.id) throw new Error('Stale run approval.');
        this.approval.resolve({ approvalId, preparationKey, decision }, runId);
      },
      openDiff: (approvalId) => this.approval.openDiff(approvalId),
      completeSetup: async () => {
        await this.context.globalState?.update('kova.setupCompleted', true);
      },
      snapshot: (requestId) => this.snapshot(requestId),
      refreshModels: (force) => this.refreshModels(force),
      newConversation: () => this.newConversation(),
      openConversation: (id) => this.openConversation(id),
      renameConversation: async (id, title) => {
        const repository = this.repository as Partial<WorkspaceConversationRepository>;
        if (typeof repository.rename !== 'function') throw new Error('History is unavailable.');
        await repository.rename(id, title);
        await this.snapshot('history-changed');
      },
      submit: (message) => this.submit(message),
      accept: (requestId, runId) => this.accept(requestId, runId),
      notify: (text) => this.deliver({ ...this.envelope(), type: 'Notice', message: text }),
      clipboardCopied: (requestId) =>
        this.deliver({ ...this.envelope(), type: 'ClipboardCopied', requestId }),
      readConversation: (id) => this.repository.get(id) as Promise<Conversation | null>,
    };
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
    for (const listener of this.listeners)
      try {
        listener(message);
      } catch {
        this.output.appendLine('[WebviewDeliveryFailed]');
      }
  }
  private envelope() {
    return {
      protocolVersion: 1 as const,
      hostSessionId: this.hostSessionId,
      sequence: ++this.sequence,
      workspaceId: this.roots.current,
    };
  }
  private emit(event: AgentEvent): void {
    if (this.disposed) return;
    const runId = this.activeRun?.id ?? null;
    if (runId && event.type === 'ToolRequested')
      this.changes.onToolRequested(runId, event.call.id, event.call.name, event.call.arguments);
    else if (runId && event.type === 'ToolCompleted')
      this.changes.onToolCompleted(runId, event.callId, event.result.status === 'Success');
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
      await this.initializer.pending;
      if (await setup()) {
        this.discovery.selectedModel = '';
        this.providerRefreshPending = true;
      }
    } finally {
      this.configuring = false;
      if (this.providerRefreshPending) await this.configurationChanged();
      else await this.snapshot('setup-closed');
      await this.applyPendingRoot();
    }
  }
  async configurationChanged(): Promise<void> {
    this.providerRefreshPending = true;
    if (this.activeRun || this.preparingRun || this.configuring || this.disposed) return;
    this.providerRefreshPending = false;
    await this.refreshModels(true);
    await this.snapshot('provider-configuration');
  }
  /** Follows the opened workspace folder; queued while a run or setup is in flight. */
  async setRoot(root: string | null): Promise<void> {
    await this.roots.setRoot(root);
  }
  private async applyPendingRoot(): Promise<void> {
    await this.roots.applyPending();
  }
  private async resetWorkspace(): Promise<void> {
    this.initializer.cancel();
    await this.initializer.pending?.catch(() => {});
    await this.runtime?.dispose();
    this.runtime = null;
    this.skillsRepository = null;
    this.projectInstructions = null;
    this.skills = [];
    this.skillId = null;
    this.contextAttachments.clear();
    this.usage = null;
  }
  initialize(): Promise<void> {
    return this.initializer.initialize();
  }
  async refreshModels(force = false): Promise<void> {
    await this.discovery.refresh(force);
  }
  async attachFiles(uris: readonly vscode.Uri[]): Promise<void> {
    await this.contextAttachments.add('PickFiles', uris);
    await this.snapshot('explorer-context');
  }
  async snapshot(requestId: string): Promise<void> {
    const conversationId = this.conversationId;
    const snapshot = await composeSnapshot({
      context: this.context,
      repository: this.repository,
      providers: this.providers,
      conversationId,
      draft: this.resources.draft.text,
      activeRun: this.activeRun,
      state: this.state,
      mode: this.mode,
      selectedModel: this.discovery.selectedModel,
      models: this.discovery.models,
      providerStatus: this.discovery.status,
      configuring: this.configuring,
      root: this.roots.current,
      skills: this.skills,
      skillId: this.skillId,
      usage: this.usage,
      partial: this.partial,
      streamingResponse: this.streamingResponse,
      attachments: this.contextAttachments.list(),
      pendingApproval: this.approval.requestPending,
      revertibleRun: this.changes.latest(),
    });
    if (this.disposed) return;
    if (conversationId !== this.conversationId) return this.snapshot(requestId);
    this.events.flush();
    this.deliver({ ...this.envelope(), type: 'Snapshot', requestId, snapshot });
  }
  async handle(message: WebviewMessage): Promise<void> {
    await handleChatMessage(this.messageHost, message);
  }
  private accept(requestId: string, runId: string | null): void {
    this.deliver({ ...this.envelope(), type: 'Accepted', requestId, runId });
  }
  reject(requestId: string, message: string): void {
    const envelope = this.envelope();
    this.deliver({ ...envelope, type: 'Rejected', requestId, code: 'InvalidRequest', message });
  }
  private async submit(
    message: Extract<WebviewMessage, { type: 'SubmitPrompt' }>,
  ): Promise<string> {
    if (this.activeRun || this.preparingRun || this.configuring)
      throw new Error('Kova is already generating. Stop before submitting another prompt.');
    const cancellation = new CancellationSource();
    this.preparingRun = cancellation;
    try {
      await this.initializer.pending;
      cancellation.throwIfCancellationRequested();
      if (this.disposed) throw new Error('Kova session is closed.');
      if (message.attachmentIds.some((id) => !this.contextAttachments.has(id)))
        throw new Error('Unknown context attachment.');
      if (message.skillId && !this.skills.some((skill) => skill.id === message.skillId))
        throw new Error('Unknown selected skill.');
      const model = this.discovery.models.find((item) => item.id === message.modelId);
      if (!model) throw new Error('Selected model is unavailable. Retry model discovery.');
      const runSettings = readRunSettings(this.providers, model);
      const runId = randomUUID();
      this.discovery.selectedModel = model.id;
      this.discovery.status = 'Available';
      this.mode = message.mode;
      this.skillId = message.skillId;
      this.partial = false;
      this.streamingResponse = null;
      const counter = this.counters.get(model.id) ?? new TokenCounter();
      this.counters.set(model.id, counter);
      const request = {
        runId,
        conversationId: this.conversationId,
        workspaceId: this.roots.current ?? '',
        prompt: message.prompt,
        modelId: model.id,
        mode: message.mode,
        activeSkillId: message.skillId,
        ...runSettings,
        attachments: this.contextAttachments.selected(message.attachmentIds),
        maxToolIterations: 10,
        toolsEnabled: Boolean(this.roots.current && model.tools === 'Supported'),
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
      await this.resources.draft.consume(message.prompt);
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
          this.changes.onRunFinished(runId);
          if (this.activeRun?.id === runId) this.activeRun = null;
          if (this.providerRefreshPending) await this.configurationChanged();
          await this.snapshot(`completed-${runId}`);
          if (!this.activeRun) this.streamingResponse = null;
          await this.applyPendingRoot();
        }
      })();
      return runId;
    } finally {
      if (this.preparingRun === cancellation) this.preparingRun = null;
      if (this.providerRefreshPending && !this.activeRun) await this.configurationChanged();
      await this.applyPendingRoot();
    }
  }
  private readonly lifecycle: ConversationLifecycleHost;
  private readonly messageHost: ChatMessageHost;
  private readonly changes = new RunChangeTracker(() => this.roots.current);
  async newConversation(): Promise<void> {
    await resetConversation(this.lifecycle);
  }
  /** Reopens a stored conversation; the next snapshot shows its messages. */
  async openConversation(id: string): Promise<void> {
    await openStoredConversation(this.lifecycle, id);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.events.dispose();
    this.discovery.cancel();
    this.initializer.cancel();
    this.cancelActiveRun();
    await this.activeRun?.task;
    await this.initializer.pending?.catch(() => {});
    this.approval.dispose();
    await this.runtime?.dispose();
    await this.resources.flush();
    this.providers.clear();
    this.contextAttachments.dispose();
    this.listeners.clear();
  }
}
