import type { CancellationToken } from '../common/CancellationToken.js';
import type { AgentEventSink } from './AgentEventSink.js';
import type { AgentRequest } from './AgentRequest.js';
import type { RunOutcome } from './RunOutcome.js';

export interface Agent {
  run(
    request: AgentRequest,
    cancellation: CancellationToken,
    events: AgentEventSink,
  ): Promise<RunOutcome>;
}
