import type { ContextAttachment } from '../context/ContextAttachment.js';
import type { ContextSettings } from '../context/ContextSettings.js';
import type { AgentMode } from './AgentMode.js';

/** Settings are captured once per run; changing the UI affects the next run. */
export interface AgentRequest {
  readonly runId: string;
  readonly conversationId: string;
  readonly workspaceId: string;
  readonly prompt: string;
  readonly modelId: string;
  readonly mode: AgentMode;
  readonly activeSkillId: string | null;
  readonly context: ContextSettings;
  readonly attachments: readonly ContextAttachment[];
  readonly thinkingEnabled: boolean;
  readonly keepAliveSeconds: number;
  readonly toolsEnabled: boolean;
  readonly maxToolIterations: number;
  readonly commandAllowlist: readonly string[];
}
