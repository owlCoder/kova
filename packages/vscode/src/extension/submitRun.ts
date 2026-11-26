import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ChatAgent } from '../../../core/src/agents/ChatAgent.js';
import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';
import type { AgentMode } from '../../../core/src/agents/AgentMode.js';
import type { AgentState } from '../../../core/src/agents/AgentState.js';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import { TokenCounter } from '../../../core/src/context/TokenCounter.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import { SkillLoader } from '../../../core/src/skills/SkillLoader.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import type { WorkspaceSkillRepository } from '../../../runtime/src/skills/WorkspaceSkillRepository.js';
import type { WorkspaceProjectInstructions } from '../../../runtime/src/adapters/WorkspaceProjectInstructions.js';
import { expandPlaceholders } from '../../../runtime/src/presentation/expandPlaceholders.js';
import type { ActiveChatRun } from './ActiveChatRun.js';
import type { ContextAttachmentManager } from './ContextAttachmentManager.js';
import type { ModelDiscovery } from './modelDiscovery.js';
import type { RunChangeTracker } from './runChanges.js';
import type { WorkspaceRuntime } from '../adapters/WorkspaceRuntime.js';
import type { ProviderManager } from '../providers/ProviderManager.js';
import { readRunSettings } from './readRunSettings.js';

/** Narrow view of ChatSession needed to start one agent run. */
export interface SubmitRunHost {
  disposed(): boolean;
  activeRun(): ActiveChatRun | null;
  preparingRun(): CancellationSource | null;
  configuring(): boolean;
  providerRefreshPending(): boolean;
  initializerPending(): Promise<void> | null;
  discovery(): ModelDiscovery;
  attachments(): ContextAttachmentManager;
  skills(): readonly { id: string }[];
  rootsCurrent(): string | null;
  conversationId(): string;
  counters(): Map<string, TokenCounter>;
  repository(): ConversationRepository;
  runtime(): WorkspaceRuntime | null;
  skillsRepository(): WorkspaceSkillRepository | null;
  projectInstructions(): WorkspaceProjectInstructions | null;
  providers(): ProviderManager;
  draft(): { consume(prompt: string): Promise<void> };
  changes(): RunChangeTracker;
  setPreparing(source: CancellationSource): void;
  clearPreparing(source: CancellationSource): void;
  setMode(mode: AgentMode): void;
  setSkillId(id: string | null): void;
  beginRun(): void;
  setState(state: AgentState): void;
  setActiveRun(run: ActiveChatRun | null): void;
  endStreaming(): void;
  emit(event: AgentEvent): void;
  snapshot(requestId: string): Promise<void>;
  configurationChanged(): Promise<void>;
  applyPendingRoot(): Promise<void>;
  model(id: string): ModelInfo | undefined;
  testCommand(): string;
}

/** Validates and starts one agent run; returns its run id. */
export async function submitRun(
  host: SubmitRunHost,
  message: Extract<WebviewMessage, { type: 'SubmitPrompt' }>,
): Promise<string> {
  if (host.activeRun() || host.preparingRun() || host.configuring())
    throw new Error('Kova is already generating. Stop before submitting another prompt.');
  const cancellation = new CancellationSource();
  host.setPreparing(cancellation);
  try {
    await host.initializerPending();
    cancellation.throwIfCancellationRequested();
    if (host.disposed()) throw new Error('Kova session is closed.');
    if (message.attachmentIds.some((id) => !host.attachments().has(id)))
      throw new Error('Unknown context attachment.');
    if (message.skillId && !host.skills().some((skill) => skill.id === message.skillId))
      throw new Error('Unknown selected skill.');
    const model = host.model(message.modelId);
    if (!model) throw new Error('Selected model is unavailable. Retry model discovery.');
    const runSettings = readRunSettings(host.providers(), model);
    const runId = randomUUID();
    const discovery = host.discovery();
    discovery.selectedModel = model.id;
    discovery.status = 'Available';
    host.setMode(message.mode);
    host.setSkillId(message.skillId);
    host.beginRun();
    const counters = host.counters();
    const counter = counters.get(model.id) ?? new TokenCounter();
    counters.set(model.id, counter);
    const request = {
      runId,
      conversationId: host.conversationId(),
      workspaceId: host.rootsCurrent() ?? '',
      prompt: expandPlaceholders(
        message.prompt,
        host.attachments().currentSelection(host.rootsCurrent()),
      ),
      modelId: model.id,
      mode: message.mode,
      activeSkillId: message.skillId,
      ...runSettings,
      attachments: host.attachments().selected(message.attachmentIds),
      maxToolIterations: 10,
      toolsEnabled: Boolean(host.rootsCurrent() && model.tools === 'Supported'),
      imagesSupported: model.vision !== 'Unsupported',
      testCommand: host.testCommand(),
    };
    const provider = await host.providers().forConversation(host.conversationId());
    if (host.providerRefreshPending())
      throw new Error('Provider configuration changed. Retry after model discovery.');
    const agent = new ChatAgent(
      provider,
      host.repository(),
      counter,
      host.runtime(),
      host.skillsRepository() ? new SkillLoader(host.skillsRepository()!) : null,
      host.projectInstructions(),
    );
    cancellation.throwIfCancellationRequested();
    await host.draft().consume(message.prompt);
    host.setState('BuildingContext');
    const run: ActiveChatRun = {
      id: runId,
      cancellation,
      task: Promise.resolve(),
      prompt: message.prompt,
      thinkingEnabled: request.thinkingEnabled,
      contextMaxTokens: request.context.maxTokens,
    };
    host.setActiveRun(run);
    run.task = (async () => {
      try {
        await host.snapshot(`started-${runId}`);
        await host.runtime()?.initialize(cancellation);
        await agent.run(request, cancellation, { emit: (event) => host.emit(event) });
      } catch (error) {
        if (cancellation.isCancellationRequested) {
          host.emit({ type: 'GenerationCancelled' });
          host.emit({ type: 'StateChanged', state: 'Cancelled' });
        } else {
          host.emit({
            type: 'ErrorOccurred',
            code: 'RuntimeFailed',
            message: error instanceof Error ? error.message : 'Runtime failed.',
            recoverable: true,
          });
          host.emit({ type: 'StateChanged', state: 'Failed' });
        }
      } finally {
        host.changes().onRunFinished(runId);
        if (host.activeRun()?.id === runId) host.setActiveRun(null);
        if (host.providerRefreshPending()) await host.configurationChanged();
        await host.snapshot(`completed-${runId}`);
        host.endStreaming();
        await host.applyPendingRoot();
      }
    })();
    return runId;
  } finally {
    host.clearPreparing(cancellation);
    if (host.providerRefreshPending() && !host.activeRun()) await host.configurationChanged();
    await host.applyPendingRoot();
  }
}

export function readTestCommand(): string {
  return vscode.workspace.getConfiguration('kova').get<string>('testing.command', '');
}
