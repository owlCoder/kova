import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import type { PresentationEvent } from '../../../packages/protocol/src/PresentationEvent.js';

export function applyEvent(
  snapshot: SessionSnapshot,
  event: PresentationEvent,
  runId: string | null,
): SessionSnapshot {
  if (event.type === 'StateChanged') return { ...snapshot, state: event.state };
  if (event.type === 'ContextUpdated') return { ...snapshot, usage: event.usage };
  if (event.type === 'ResponseStarted')
    return {
      ...snapshot,
      activeRunId: runId,
      messages: [
        ...snapshot.messages,
        { id: event.messageId, role: 'assistant', content: '', partial: true },
      ],
    };
  if (event.type === 'ResponseDelta')
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId
          ? { ...message, content: (message.content + event.text).slice(0, 65_536) }
          : message,
      ),
    };
  if (event.type === 'ResponseCompleted')
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId ? { ...message, partial: false } : message,
      ),
    };
  if (event.type === 'ToolAwaitingApproval') return { ...snapshot, pendingApproval: event.request };
  if (
    event.type === 'ToolStarted' ||
    event.type === 'ToolDenied' ||
    event.type === 'ToolBlocked' ||
    event.type === 'GenerationCancelled'
  )
    return { ...snapshot, pendingApproval: null };
  return snapshot;
}
