import type { ConversationEntry } from './Conversation.js';
import type { ConversationSummary } from './ConversationSummary.js';
import { TokenCounter } from '../context/TokenCounter.js';

/** Compact only complete turns; the implementation must not call an LLM. */
export class ConversationCompactor {
  constructor(private readonly counter: TokenCounter) {}
  compact(
    entries: readonly ConversationEntry[],
    previous: ConversationSummary | null,
    maxTokens: number,
  ): ConversationSummary {
    const users = entries.filter((entry) => entry.message.role === 'user');
    const calls = entries.flatMap((entry) =>
      entry.message.role === 'assistant' ? entry.message.toolCalls : [],
    );
    const successful = new Set(
      entries
        .filter((entry) => {
          if (entry.message.role !== 'tool') return false;
          try {
            return (JSON.parse(entry.message.content) as { status?: string }).status === 'Success';
          } catch {
            return false;
          }
        })
        .map((entry) => (entry.message.role === 'tool' ? entry.message.callId : '')),
    );
    const inspected = calls
      .filter(
        (call) => successful.has(call.id) && ['read_file', 'list_directory'].includes(call.name),
      )
      .map((call) =>
        typeof call.arguments.path === 'string' ? call.arguments.path.slice(0, 200) : '',
      )
      .filter(Boolean);
    const changes = calls
      .filter((call) => successful.has(call.id) && ['write_file', 'edit_file'].includes(call.name))
      .map(
        (call) =>
          `${call.name}: ${typeof call.arguments.path === 'string' ? call.arguments.path.slice(0, 200) : 'workspace file'}`,
      );
    let summary: ConversationSummary = {
      goal:
        previous?.goal || users[0]?.message.content.slice(0, 500) || 'Continue the conversation.',
      filesInspected: [...new Set([...(previous?.filesInspected ?? []), ...inspected])].slice(-12),
      changes: [...(previous?.changes ?? []), ...changes].slice(-8),
      outstanding: [
        ...(previous?.outstanding ?? []),
        ...users.slice(-2).map((entry) => entry.message.content.slice(0, 300)),
      ].slice(-4),
      throughTurnId: entries.at(-1)?.turnId ?? previous?.throughTurnId ?? '',
    };
    while (this.counter.estimate(JSON.stringify(summary)) > maxTokens) {
      if (summary.outstanding.length)
        summary = { ...summary, outstanding: summary.outstanding.slice(1) };
      else if (summary.changes.length) summary = { ...summary, changes: summary.changes.slice(1) };
      else if (summary.filesInspected.length)
        summary = { ...summary, filesInspected: summary.filesInspected.slice(1) };
      else if (summary.goal.length)
        summary = { ...summary, goal: summary.goal.slice(0, Math.floor(summary.goal.length / 2)) };
      else break;
    }
    return summary;
  }
}
