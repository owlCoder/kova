import type { CancellationToken } from '../common/CancellationToken.js';

/** Turns text into vectors; implementations live in adapter packages. */
export interface EmbeddingProvider {
  embed(
    texts: readonly string[],
    cancellation: CancellationToken,
  ): Promise<readonly (readonly number[])[]>;
}
