import type { CancellationSource } from '../../../core/src/common/CancellationSource.js';

export interface RunChangeTrackerDeps {
  /** Runs `git checkout -- <paths>`; injectable for tests. */
  readonly gitCheckout?: (
    root: string,
    paths: readonly string[],
    cancellation: CancellationSource,
  ) => Promise<void>;
  /** Runs `git stash create` and resolves to the checkpoint commit sha (or null). */
  readonly gitStashCreate?: (
    root: string,
    cancellation: CancellationSource,
  ) => Promise<string | null>;
  /** Runs `git stash apply <sha>`; injectable for tests. */
  readonly gitStashApply?: (
    root: string,
    sha: string,
    cancellation: CancellationSource,
  ) => Promise<void>;
}
