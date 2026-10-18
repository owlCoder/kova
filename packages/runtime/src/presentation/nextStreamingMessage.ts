import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';

export function nextStreamingMessage(
  previous: SessionSnapshot['messages'][number] | null,
  event: AgentEvent,
): SessionSnapshot['messages'][number] | null {
  if (event.type === 'ResponseStarted')
    return { id: event.messageId, role: 'assistant', content: '', partial: true };
  if (event.type === 'ResponseDelta' && previous?.id === event.messageId)
    return { ...previous, content: (previous.content + event.text).slice(0, 65_536) };
  if (event.type === 'ResponseCompleted' && previous?.id === event.messageId)
    return { ...previous, partial: false };
  return previous;
}
