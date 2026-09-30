import type { PreparedToolCall } from './PreparedToolCall.js';
import type { ToolResult } from './ToolResult.js';

export type ToolPreparationResult =
  | { readonly status: 'Ready'; readonly prepared: PreparedToolCall }
  | { readonly status: 'Error'; readonly result: ToolResult };
