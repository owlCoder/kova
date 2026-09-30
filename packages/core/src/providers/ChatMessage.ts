import type { ToolCall } from '../tools/ToolCall.js';

/** Thinking is intentionally absent from durable/provider conversation messages. */
export type ChatMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls: readonly ToolCall[];
    }
  | {
      readonly role: 'tool';
      readonly content: string;
      readonly callId: string;
      readonly toolName: string;
    };
