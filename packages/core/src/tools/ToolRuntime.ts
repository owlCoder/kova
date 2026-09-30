import type { AgentMode } from '../agents/AgentMode.js';
import type { AgentEventSink } from '../agents/AgentEventSink.js';
import type { CancellationToken } from '../common/CancellationToken.js';
import type { ToolCall } from './ToolCall.js';
import type { ToolDefinition } from './ToolDefinition.js';
import type { ToolResult } from './ToolResult.js';

/** IO boundary exposing the complete checked tool execution pipeline. */
export interface ToolRuntime {
  definitions(mode: AgentMode): readonly ToolDefinition[];
  execute(
    call: ToolCall,
    mode: AgentMode,
    commandAllowlist: readonly string[],
    cancellation: CancellationToken,
    events: AgentEventSink,
    runId: string,
  ): Promise<ToolResult>;
}
