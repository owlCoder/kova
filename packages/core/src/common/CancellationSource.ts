import type { CancellationToken } from './CancellationToken.js';
import type { Disposable } from './Disposable.js';

export class CancellationSource implements CancellationToken {
  private cancelled = false;
  private readonly listeners = new Set<() => void>();
  get isCancellationRequested(): boolean {
    return this.cancelled;
  }
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* One observer cannot prevent process/provider cancellation. */
      }
    }
    this.listeners.clear();
  }
  throwIfCancellationRequested(): void {
    if (this.cancelled) {
      const error = new Error('Generation cancelled.');
      error.name = 'AbortError';
      throw error;
    }
  }
  onCancellationRequested(listener: () => void): Disposable {
    if (this.cancelled) listener();
    else this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }
}
