import type { ChatMessage } from '../providers/ChatMessage.js';
import type { ConversationSummary } from './ConversationSummary.js';

export interface ConversationEntry {
  readonly id: string;
  readonly turnId: string;
  readonly stepId: string | null;
  readonly message: ChatMessage;
  readonly toolResultOrigin: 'BuiltIn' | 'Mcp' | null;
  readonly omitted: boolean;
}

export interface Conversation {
  readonly id: string;
  readonly workspaceId: string;
  readonly entries: readonly ConversationEntry[];
  readonly summary: ConversationSummary | null;
}
