import type { Conversation } from '../conversations/Conversation.js';
import type { Skill } from '../skills/Skill.js';
import type { ToolDefinition } from '../tools/ToolDefinition.js';
import type { ContextAttachment } from './ContextAttachment.js';
import type { ContextSettings } from './ContextSettings.js';

export interface ContextBuildRequest {
  readonly systemInstructions: string;
  /** Workspace AGENTS.md; guidance for the project, never a source of permissions. */
  readonly projectInstructions: string | null;
  readonly tools: readonly ToolDefinition[];
  readonly activeSkill: Skill | null;
  readonly currentUserMessageId: string;
  readonly currentStepId: string | null;
  readonly conversation: Conversation;
  readonly attachments: readonly ContextAttachment[];
  readonly settings: ContextSettings;
}
