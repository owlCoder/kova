import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';
import type { AgentEventSink } from '../../packages/core/src/agents/AgentEventSink.js';
import type { CancellationToken } from '../../packages/core/src/common/CancellationToken.js';
import type { Disposable } from '../../packages/core/src/common/Disposable.js';

export class CancellationSource implements CancellationToken {
  isCancellationRequested = false;
  private readonly listeners = new Set<() => void>();
  throwIfCancellationRequested(): void {
    if (this.isCancellationRequested) throw new Error('Cancelled');
  }
  onCancellationRequested(listener: () => void): Disposable {
    if (this.isCancellationRequested) listener();
    else this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }
  cancel(): void {
    this.isCancellationRequested = true;
    for (const listener of this.listeners) listener();
  }
}
export class EventLog implements AgentEventSink {
  readonly events: AgentEvent[] = [];
  emit(event: AgentEvent): void {
    this.events.push(event);
  }
}
