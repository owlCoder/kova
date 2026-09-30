import type { ToolDefinition } from '../tools/ToolDefinition.js';
import type { ChatMessage } from './ChatMessage.js';

export interface ChatRequest {
  readonly modelId: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly thinkingEnabled: boolean;
  readonly keepAliveSeconds: number;
}
