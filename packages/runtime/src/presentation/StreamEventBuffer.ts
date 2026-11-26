import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';

type Delta = Extract<AgentEvent, { type: 'ResponseDelta' | 'ThinkingDelta' | 'CommandOutput' }>;

const isDelta = (event: AgentEvent): event is Delta =>
  event.type === 'ResponseDelta' ||
  event.type === 'ThinkingDelta' ||
  event.type === 'CommandOutput';

const deltaKey = (event: Delta): string =>
  event.type === 'CommandOutput' ? `call:${event.callId}` : `message:${event.messageId}`;

/** Coalesce adjacent deltas without reordering completion, approval or cancellation events. */
export class StreamEventBuffer {
  private pending: Delta | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deliver: (event: AgentEvent) => void) {}

  push(event: AgentEvent): void {
    if (!isDelta(event)) {
      this.flush();
      this.deliver(event);
      return;
    }
    if (
      this.pending &&
      (this.pending.type !== event.type || deltaKey(this.pending) !== deltaKey(event))
    )
      this.flush();
    this.pending = this.pending
      ? ({ ...this.pending, text: this.pending.text + event.text } as Delta)
      : event;
    if (this.pending.text.length >= 4096) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), 32);
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const event = this.pending;
    this.pending = null;
    if (event) this.deliver(event);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.pending = null;
    this.timer = undefined;
  }
}
