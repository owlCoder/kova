import type { CancellationSource } from '../../../core/src/common/CancellationSource.js';

export interface ActiveChatRun {
  readonly id: string;
  readonly cancellation: CancellationSource;
  task: Promise<void>;
  readonly prompt: string;
  readonly thinkingEnabled: boolean;
  readonly contextMaxTokens: number;
}
