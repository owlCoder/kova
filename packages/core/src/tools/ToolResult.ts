import type { JsonObject } from '../common/JsonValue.js';

export interface ToolResult {
  readonly callId: string;
  readonly toolName: string;
  readonly status: 'Success' | 'Error' | 'Blocked' | 'Denied' | 'Cancelled';
  /** Bounded to the UI retention cap; the model receives a further budgeted slice. */
  readonly output: string;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: JsonObject;
  } | null;
  readonly omittedCharacters: number;
  readonly durationMs: number;
}
