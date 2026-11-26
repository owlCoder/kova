import type { CancellationSource } from '../../../core/src/common/CancellationSource.js';

export interface RunChangeTrackerDeps {
  /** Runs `git checkout -- <paths>`; injectable for tests. */
  readonly gitCheckout?: (
    root: string,
    paths: readonly string[],
    cancellation: CancellationSource,
  ) => Promise<void>;
}
