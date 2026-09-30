import type { PreparedToolCall } from '../tools/PreparedToolCall.js';
import type { ToolResult } from '../tools/ToolResult.js';

export type HookContext =
  | { readonly event: 'BeforeToolExecution'; readonly prepared: PreparedToolCall }
  | {
      readonly event: 'AfterToolExecution';
      readonly prepared: PreparedToolCall;
      readonly result: ToolResult;
    };
