import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';
import type { AgentMode } from '../../../core/src/agents/AgentMode.js';
import type { AgentState } from '../../../core/src/agents/AgentState.js';
import { ChatAgent } from '../../../core/src/agents/ChatAgent.js';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import { TokenCounter } from '../../../core/src/context/TokenCounter.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import { SkillLoader } from '../../../core/src/skills/SkillLoader.js';
import type { SkillMetadata } from '../../../core/src/skills/Skill.js';
import type { HostMessage } from '../../../protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { NodeWorkspaceRuntime } from '../../../runtime/src/adapters/NodeWorkspaceRuntime.js';
import { WorkspaceSkillRepository } from '../../../runtime/src/skills/WorkspaceSkillRepository.js';
import { WorkspaceProjectInstructions } from '../../../runtime/src/adapters/WorkspaceProjectInstructions.js';
import { StreamEventBuffer } from '../../../runtime/src/presentation/StreamEventBuffer.js';
import { projectEvent, approvalView } from '../../../runtime/src/presentation/projectEvent.js';
import { projectConversationMessages } from '../../../runtime/src/presentation/projectConversationMessages.js';
import type { DesktopStore } from '../state/DesktopStore.js';
import type { DesktopKeyStore } from '../state/DesktopKeyStore.js';
import { DesktopApprovalPort } from './DesktopApprovalPort.js';
import { DesktopProviderManager } from './DesktopProviderManager.js';
import { providerPresets } from '../../../runtime/src/providers/providerPresets.js';

type Payload = HostMessage extends infer M
  ? M extends HostMessage
    ? Omit<M, 'protocolVersion' | 'hostSessionId' | 'sequence' | 'workspaceId'>
    : never
  : never;

export class DesktopSession {
  readonly hostSessionId = randomUUID();
  readonly approval = new DesktopApprovalPort();
  readonly providers: DesktopProviderManager;
  root: string | null = null;
  conversationId: string = randomUUID();
  attachments: ContextAttachment[] = [];
  skillId: string | null = null;
  changing = false;
  private activeRun: {
    id: string;
    prompt: string;
    cancellation: CancellationSource;
    task: Promise<void>;
  } | null = null;
  private preparing = false;
  private sequence = 0;
  private partial = false;
  private state: AgentState = 'Idle';
  private mode: AgentMode = 'Manual';
  private models: readonly ModelInfo[] = [];
  private skills: readonly SkillMetadata[] = [];
  private selectedModel = '';
  private providerStatus: SessionSnapshot['providerStatus'] = 'Unavailable';
  private usage: SessionSnapshot['usage'] = null;
  private streaming: SessionSnapshot['messages'][number] | null = null;
  private runtime: NodeWorkspaceRuntime | null = null;
  private skillsRepository: WorkspaceSkillRepository | null = null;
  private instructions: WorkspaceProjectInstructions | null = null;
  private readonly counter = new TokenCounter();
  private discovery: CancellationSource | null = null;
  private disposed = false;
  private readonly events = new StreamEventBuffer((event) =>
    this.send({ type: 'Event', runId: this.activeRun?.id ?? null, event: projectEvent(event) }),
  );

  constructor(
    readonly store: DesktopStore,
    readonly keys: DesktopKeyStore,
    private readonly deliver: (message: HostMessage) => void,
    private readonly version = '0.4.0',
  ) {
    this.providers = new DesktopProviderManager(store, keys);
  }
  get busy(): boolean {
    return Boolean(this.activeRun || this.preparing || this.changing);
  }
  requireIdle(): void {
    if (this.busy) throw new Error('Stop the active task before changing the session or provider.');
  }
  send(payload: Payload): void {
    if (!this.disposed)
      this.deliver({
        ...payload,
        protocolVersion: 1,
        hostSessionId: this.hostSessionId,
        sequence: ++this.sequence,
        workspaceId: this.root,
      } as HostMessage);
  }
  async initialize(): Promise<void> {
    const last = this.store.preferences.lastConversationId;
    const conversation = last ? await this.store.get(last) : null;
    if (conversation) {
      try {
        await this.setRoot(conversation.workspaceId || null);
        this.conversationId = conversation.id;
        this.partial = this.store.isPartial(conversation.id);
      } catch {
        this.send({
          type: 'Notice',
          message: 'The previous project is unavailable. Open a project to continue.',
        });
      }
    }
    await this.snapshot('initial');
    await this.refreshModels();
    await this.snapshot('models');
  }
  async refreshModels(force = false): Promise<void> {
    this.discovery?.cancel();
    const source = new CancellationSource();
    this.discovery = source;
    try {
      const models = await this.providers.models(source, force);
      if (source.isCancellationRequested || this.disposed) return;
      this.models = models;
      if (!models.some((model) => model.id === this.selectedModel))
        this.selectedModel = this.store.preferences.provider.model || models[0]?.id || '';
      this.providerStatus = models.some((model) => model.id === this.selectedModel)
        ? 'Available'
        : 'ModelMissing';
    } catch (error) {
      if (source.isCancellationRequested) return;
      this.models = [];
      this.providerStatus = 'Unavailable';
      this.send({
        type: 'Notice',
        message:
          error instanceof Error
            ? error.message
            : 'Provider unavailable. Open provider settings to connect.',
      });
    }
  }
  async reloadProvider(): Promise<void> {
    this.selectedModel = '';
    this.providers.clear();
    await this.refreshModels(true);
  }
  async snapshot(requestId: string): Promise<void> {
    const conversationId = this.conversationId;
    const root = this.root;
    const conversation = await this.store.get(conversationId);
    const settings = this.store.preferences;
    const hasApiKey = Boolean(await this.keys.get(settings.provider).catch(() => undefined));
    if (this.disposed) return;
    if (conversationId !== this.conversationId || root !== this.root)
      return this.snapshot(requestId);
    const selected = this.models.find((model) => model.id === this.selectedModel);
    const snapshot: SessionSnapshot = {
      conversationId: this.conversationId,
      activeRunId: this.activeRun?.id ?? null,
      state: this.state,
      mode: this.mode,
      selectedModelId: this.selectedModel || settings.provider.model,
      models: this.models,
      providerStatus: this.providerStatus,
      providerLabel: settings.provider.label,
      setupCompleted: settings.setupCompleted,
      configuringProvider: this.changing,
      toolsEnabled: Boolean(this.root && selected?.tools === 'Supported'),
      skills: this.skills,
      activeSkillId: this.skillId,
      usage: this.usage,
      messages: projectConversationMessages(
        conversation?.entries ?? [],
        this.partial,
        this.activeRun,
        this.streaming,
      ),
      contextAttachments: this.attachments.map(({ id, label }) => ({ id, label })),
      pendingApproval: this.approval.requestPending
        ? approvalView(this.approval.requestPending)
        : null,
      thinkingEnabled: settings.thinking,
      contextMaxTokens: settings.contextMaxTokens,
      desktop: {
        appVersion: this.version,
        providerPresets,
        workspacePath: this.root,
        workspaceName: this.root ? basename(this.root) : 'No project open',
        recentWorkspaces: settings.recentWorkspaces,
        sessions: this.store.list(),
        provider: { ...settings.provider, thinking: settings.thinking, hasApiKey },
        theme: settings.theme,
        platform: process.platform,
      },
    };
    this.events.flush();
    this.send({ type: 'Snapshot', requestId, snapshot });
  }
  async openWorkspace(path: string): Promise<void> {
    this.requireIdle();
    this.changing = true;
    try {
      await this.setRoot(path);
      const existing = this.store.list().find((session) => session.workspaceId === this.root);
      this.conversationId = existing?.id ?? randomUUID();
      this.reset();
      if (!existing)
        await this.store.save({
          id: this.conversationId,
          workspaceId: this.root ?? '',
          entries: [],
          summary: null,
        });
      await this.store.updatePreferences({
        lastConversationId: this.conversationId,
        recentWorkspaces: [
          this.root!,
          ...this.store.preferences.recentWorkspaces.filter((item) => item !== this.root),
        ].slice(0, 10),
      });
    } finally {
      this.changing = false;
      await this.snapshot('workspace');
    }
  }
  async newConversation(): Promise<void> {
    this.requireIdle();
    this.changing = true;
    try {
      this.conversationId = randomUUID();
      this.reset();
      await this.store.save({
        id: this.conversationId,
        workspaceId: this.root ?? '',
        entries: [],
        summary: null,
      });
      await this.store.updatePreferences({ lastConversationId: this.conversationId });
    } finally {
      this.changing = false;
      await this.snapshot('new-session');
    }
  }
  async selectConversation(id: string): Promise<void> {
    this.requireIdle();
    this.changing = true;
    try {
      const conversation = await this.store.get(id);
      if (!conversation) throw new Error('Session not found.');
      await this.setRoot(conversation.workspaceId || null);
      this.conversationId = id;
      this.reset();
      await this.store.updatePreferences({ lastConversationId: id });
    } finally {
      this.changing = false;
      await this.snapshot('selected-session');
    }
  }
  cancel(runId?: string): void {
    if (runId && this.activeRun?.id !== runId) throw new Error('This run is no longer active.');
    this.activeRun?.cancellation.cancel();
  }
  async submit(message: Extract<WebviewMessage, { type: 'SubmitPrompt' }>): Promise<void> {
    this.requireIdle();
    this.preparing = true;
    try {
      const model = this.models.find((model) => model.id === message.modelId);
      if (!model) throw new Error('Connect a provider and choose an available model.');
      if (message.attachmentIds.some((id) => !this.attachments.some((item) => item.id === id)))
        throw new Error('Unknown context attachment.');
      if (message.skillId && !this.skills.some((skill) => skill.id === message.skillId))
        throw new Error('Unknown skill.');
      const settings = this.store.preferences;
      const maxTokens = Math.min(
        settings.contextMaxTokens,
        model.maxContextTokens ?? settings.contextMaxTokens,
      );
      if (settings.thinking && model.thinking !== 'Supported')
        throw new Error('Disable thinking for this model in provider settings.');
      const provider = await this.providers.forConversation(this.conversationId);
      const cancellation = new CancellationSource();
      const runId = randomUUID();
      const agent = new ChatAgent(
        provider,
        this.store,
        this.counter,
        this.runtime,
        this.skillsRepository ? new SkillLoader(this.skillsRepository) : null,
        this.instructions,
      );
      this.selectedModel = model.id;
      this.mode = message.mode;
      this.skillId = message.skillId;
      this.streaming = null;
      this.partial = false;
      this.state = 'BuildingContext';
      this.activeRun = { id: runId, prompt: message.prompt, cancellation, task: Promise.resolve() };
      this.activeRun.task = (async () => {
        try {
          await this.store.updatePreferences({ lastConversationId: this.conversationId });
          await this.snapshot(`started-${runId}`);
          await this.runtime?.initialize(cancellation);
          await agent.run(
            {
              runId,
              conversationId: this.conversationId,
              workspaceId: this.root ?? '',
              prompt: message.prompt,
              modelId: model.id,
              mode: message.mode,
              activeSkillId: message.skillId,
              context: {
                maxTokens,
                reservedOutputTokens: Math.min(4096, Math.floor(maxTokens / 4)),
                safetyMarginRatio: 0.1,
                maxToolOutputCharacters: 8000,
              },
              attachments: this.attachments.filter((item) =>
                message.attachmentIds.includes(item.id),
              ),
              thinkingEnabled: settings.thinking,
              keepAliveSeconds: settings.provider.kind === 'ollama' ? 300 : 0,
              toolsEnabled: Boolean(this.root && model.tools === 'Supported'),
              maxToolIterations: 10,
              commandAllowlist: settings.commandAllowlist,
            },
            cancellation,
            { emit: (event) => this.emit(event) },
          );
        } catch (error) {
          this.emit({
            type: 'StateChanged',
            state: cancellation.isCancellationRequested ? 'Cancelled' : 'Failed',
          });
          if (!cancellation.isCancellationRequested)
            this.emit({
              type: 'ErrorOccurred',
              code: 'DesktopRunFailed',
              message: error instanceof Error ? error.message : 'Run failed.',
              recoverable: true,
            });
        } finally {
          await this.store.markPartial(this.conversationId, this.partial).catch(() =>
            this.send({
              type: 'Notice',
              message: 'The response was saved, but its completion status could not be stored.',
            }),
          );
          this.events.flush();
          this.activeRun = null;
          await this.snapshot(`completed-${runId}`);
          this.streaming = null;
        }
      })();
      this.send({ type: 'Accepted', requestId: message.requestId, runId });
    } finally {
      this.preparing = false;
    }
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.discovery?.cancel();
    this.cancel();
    this.approval.dispose();
    await this.activeRun?.task;
    this.events.dispose();
    await this.runtime?.dispose();
    this.providers.clear();
    await this.store.flush();
  }
  private emit(event: AgentEvent): void {
    if (event.type === 'GenerationCancelled')
      this.partial = Boolean(this.streaming?.partial && this.streaming.content);
    if (event.type === 'StateChanged' && event.state === 'Failed')
      this.partial = Boolean(this.streaming?.partial && this.streaming.content);
    if (event.type === 'StateChanged') this.state = event.state;
    if (event.type === 'ContextUpdated') this.usage = event.usage;
    if (event.type === 'ResponseStarted')
      this.streaming = { id: event.messageId, role: 'assistant', content: '', partial: true };
    if (event.type === 'ResponseDelta' && this.streaming?.id === event.messageId)
      this.streaming = {
        ...this.streaming,
        content: (this.streaming.content + event.text).slice(0, 65_536),
      };
    if (event.type === 'ResponseCompleted' && this.streaming?.id === event.messageId)
      this.streaming = { ...this.streaming, partial: false };
    this.events.push(event);
  }
  private async setRoot(path: string | null): Promise<void> {
    const root = path ? await realpath(path) : null;
    if (root && !(await stat(root)).isDirectory()) throw new Error('Choose a project directory.');
    await this.runtime?.dispose();
    this.root = root;
    this.runtime = root
      ? new NodeWorkspaceRuntime(root, this.approval, { emit: (event) => this.emit(event) })
      : null;
    this.skillsRepository = root ? new WorkspaceSkillRepository(root) : null;
    this.instructions = root ? new WorkspaceProjectInstructions(root) : null;
    this.skills = this.skillsRepository
      ? await this.skillsRepository.discover(root!, new CancellationSource())
      : [];
  }
  private reset(): void {
    this.attachments = [];
    this.skillId = null;
    this.usage = null;
    this.streaming = null;
    this.partial = this.store.isPartial(this.conversationId);
    this.state = 'Idle';
  }
}
