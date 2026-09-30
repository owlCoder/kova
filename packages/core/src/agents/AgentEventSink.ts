import type { AgentEvent } from './AgentEvent.js';

/** Observational only: sinks never grant permissions or change agent state. */
export interface AgentEventSink {
  emit(event: AgentEvent): void;
}
