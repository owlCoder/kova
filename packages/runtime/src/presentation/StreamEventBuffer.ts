import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';

type Delta = Extract<AgentEvent, { type: 'ResponseDelta' | 'ThinkingDelta' }>;

/** Coalesce adjacent deltas without reordering completion, approval or cancellation events. */
export class StreamEventBuffer {
  private pending: Delta | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deliver: (event: AgentEvent) => void) {}

  push(event: AgentEvent): void {
    if (event.type !== 'ResponseDelta' && event.type !== 'ThinkingDelta') {
      this.flush();
      this.deliver(event);
      return;
    }
    if (
      this.pending &&
      (this.pending.type !== event.type || this.pending.messageId !== event.messageId)
    )
      this.flush();
    this.pending = this.pending ? { ...this.pending, text: this.pending.text + event.text } : event;
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
