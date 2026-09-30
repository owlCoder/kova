import type { Disposable } from './Disposable.js';

/** Adapters bridge this contract to platform cancellation; late subscribers fire immediately. */
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  throwIfCancellationRequested(): void;
  onCancellationRequested(listener: () => void): Disposable;
}
