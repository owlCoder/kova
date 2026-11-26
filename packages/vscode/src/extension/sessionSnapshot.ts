import * as vscode from 'vscode';
import type { AgentMode } from '../../../core/src/agents/AgentMode.js';
import type { AgentState } from '../../../core/src/agents/AgentState.js';
import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import type { ContextUsage } from '../../../core/src/context/ContextUsage.js';
import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { ApprovalRequest } from '../../../core/src/permissions/ApprovalRequest.js';
import type { SkillMetadata } from '../../../core/src/skills/Skill.js';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';
import { contextAttachmentViews } from '../../../runtime/src/presentation/contextAttachmentViews.js';
import { approvalView } from '../../../runtime/src/presentation/projectEvent.js';
import { projectConversationMessages } from '../../../runtime/src/presentation/projectConversationMessages.js';
import type { ProviderManager } from '../providers/ProviderManager.js';
import { configuredContext } from './effectiveContext.js';
import { readUiPreferences } from './readUiPreferences.js';

export interface SnapshotInput {
  readonly context: vscode.ExtensionContext;
  readonly repository: ConversationRepository;
  readonly providers: ProviderManager;
  readonly conversationId: string;
  readonly draft: string;
  readonly activeRun: {
    id: string;
    prompt: string;
    thinkingEnabled: boolean;
    contextMaxTokens: number;
  } | null;
  readonly state: AgentState;
  readonly mode: AgentMode;
  readonly selectedModel: string;
  readonly models: readonly ModelInfo[];
  readonly providerStatus: 'Available' | 'Unavailable' | 'ModelMissing';
  readonly configuring: boolean;
  readonly root: string | null;
  readonly skills: readonly SkillMetadata[];
  readonly skillId: string | null;
  readonly usage: ContextUsage | null;
  readonly partial: boolean;
  readonly streamingResponse: SessionSnapshot['messages'][number] | null;
  readonly attachments: readonly ContextAttachment[];
  readonly pendingApproval: ApprovalRequest | null;
  readonly revertibleRun: {
    readonly runId: string;
    readonly files: readonly { readonly path: string; readonly created: boolean }[];
    readonly checkpointed: boolean;
  } | null;
}

function estimateCost(
  usage: { readonly inputTokens: number; readonly outputTokens: number } | null,
): number | null {
  if (!usage) return null;
  const config = vscode.workspace.getConfiguration('kova');
  const inputPerMillion = config.get<number>('cost.inputPerMillion', 0);
  const outputPerMillion = config.get<number>('cost.outputPerMillion', 0);
  if (!inputPerMillion && !outputPerMillion) return null;
  return (usage.inputTokens * inputPerMillion + usage.outputTokens * outputPerMillion) / 1_000_000;
}

/** Builds the full view snapshot; the caller re-checks the conversation is still current. */
export async function composeSnapshot(input: SnapshotInput): Promise<SessionSnapshot> {
  const conversation = await input.repository.get(input.conversationId);
  const activeRun = input.activeRun;
  const selected = input.models.find((model) => model.id === input.selectedModel);
  const settings = vscode.workspace.getConfiguration('kova');
  const messages = projectConversationMessages(
    conversation?.entries ?? [],
    input.partial,
    activeRun,
    input.streamingResponse,
  );
  return {
    ...readUiPreferences(),
    conversationId: input.conversationId,
    draft: input.draft,
    activeRunId: activeRun?.id ?? null,
    state: input.state,
    mode: input.mode,
    selectedModelId: input.selectedModel || input.providers.defaultModelId(),
    models: input.models.map((model) => ({ ...model })),
    providerStatus: input.providerStatus,
    providerLabel: input.providers.label(),
    setupCompleted: input.context.globalState?.get<boolean>('kova.setupCompleted', false) ?? false,
    configuringProvider: input.configuring,
    toolsEnabled: Boolean(input.root && selected?.tools === 'Supported'),
    skills: input.skills.map((skill) => ({ ...skill })),
    activeSkillId: input.skillId,
    usage: input.usage ? structuredClone(input.usage) : null,
    usageTotals: conversation?.usage ? { ...conversation.usage } : null,
    estimatedCost: estimateCost(conversation?.usage ?? null),
    messages,
    contextAttachments: contextAttachmentViews(input.attachments),
    pendingApproval: input.pendingApproval ? approvalView(input.pendingApproval) : null,
    revertibleRun: input.revertibleRun
      ? {
          runId: input.revertibleRun.runId,
          files: input.revertibleRun.files.map((file) => ({ ...file })),
          checkpointed: input.revertibleRun.checkpointed,
        }
      : null,
    thinkingEnabled: activeRun?.thinkingEnabled ?? input.providers.thinkingEnabled(),
    contextMaxTokens:
      activeRun?.contextMaxTokens ??
      configuredContext(settings, selected, input.providers.kind()).maxTokens,
  };
}
