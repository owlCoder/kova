import type { CancellationToken } from '../common/CancellationToken.js';
import type { ChatEvent } from './ChatEvent.js';
import type { ChatRequest } from './ChatRequest.js';

export interface LlmProvider {
  streamChat(request: ChatRequest, cancellation: CancellationToken): AsyncIterable<ChatEvent>;
}
