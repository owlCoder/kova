import type { CancellationToken } from '../common/CancellationToken.js';
import type { PreparedToolCall } from './PreparedToolCall.js';
import type { ToolCall } from './ToolCall.js';
import type { ToolDefinition } from './ToolDefinition.js';
import type { ToolPreparationResult } from './ToolPreparationResult.js';
import type { ToolResult } from './ToolResult.js';

export interface Tool {
  readonly definition: ToolDefinition;
  /** Read-only preparation: normalize paths and compute previews, never mutate. */
  prepare(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult>;
  /** Called only after the policy/hook/guardrail/approval pipeline. Revalidate file versions. */
  execute(prepared: PreparedToolCall, cancellation: CancellationToken): Promise<ToolResult>;
}
