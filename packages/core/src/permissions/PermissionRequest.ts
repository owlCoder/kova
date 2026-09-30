import type { AgentMode } from '../agents/AgentMode.js';
import type { PreparedToolCall } from '../tools/PreparedToolCall.js';
import type { RiskLevel } from './RiskLevel.js';

export interface PermissionRequest {
  readonly mode: AgentMode;
  readonly risk: RiskLevel;
  readonly prepared: PreparedToolCall;
  readonly commandAllowlist: readonly string[];
}
