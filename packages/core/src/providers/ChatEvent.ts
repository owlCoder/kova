import type { ToolCallCandidate } from '../tools/ToolCallCandidate.js';

export type ProviderUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

/** Emit one complete candidate per call after provider-side fragment assembly. */
export type ChatEvent =
  | { readonly type: 'TextDelta'; readonly text: string }
  | { readonly type: 'ThinkingDelta'; readonly text: string }
  | { readonly type: 'ToolCallReady'; readonly candidate: ToolCallCandidate }
  | {
      readonly type: 'MalformedToolCall';
      readonly callId: string;
      readonly toolName: string | null;
      readonly message: string;
    }
  | {
      readonly type: 'Finished';
      readonly reason: 'Complete' | 'ToolCalls' | 'Length';
      readonly usage: ProviderUsage | null;
    };
