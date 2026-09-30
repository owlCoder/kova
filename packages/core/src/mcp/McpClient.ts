import type { AgentEventSink } from '../agents/AgentEventSink.js';
import type { CancellationToken } from '../common/CancellationToken.js';
import type { Tool } from '../tools/Tool.js';
import type { McpConfiguration } from './McpConfiguration.js';

/** The adapter returns normal Tool instances; the Agent never speaks MCP. */
export interface McpClient {
  start(
    workspaceId: string,
    configuration: McpConfiguration,
    events: AgentEventSink,
    cancellation: CancellationToken,
  ): Promise<readonly Tool[]>;
  stop(): Promise<void>;
}
