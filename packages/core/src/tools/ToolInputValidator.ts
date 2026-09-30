import type { ToolCall } from './ToolCall.js';
import type { ToolCallCandidate } from './ToolCallCandidate.js';
import type { ToolDefinition } from './ToolDefinition.js';

export interface ToolInputValidator {
  validate(
    candidate: ToolCallCandidate,
    definition: ToolDefinition,
  ):
    | { readonly valid: true; readonly call: ToolCall }
    | { readonly valid: false; readonly code: string; readonly message: string };
}
