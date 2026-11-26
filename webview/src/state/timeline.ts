import type { PresentationEvent } from '../../../packages/protocol/src/PresentationEvent.js';
import type { TodoItem } from '../../../packages/protocol/src/TodoItem.js';

export type ToolStatus =
  | 'Requested'
  | 'AwaitingApproval'
  | 'Running'
  | 'Success'
  | 'Error'
  | 'Blocked'
  | 'Denied'
  | 'Cancelled';

/** A tool call as the transcript shows it: one row anchored after a message. */
export interface ToolEntry {
  readonly kind: 'tool';
  readonly id: string;
  readonly anchor: number;
  readonly toolName: string;
  readonly source: string;
  readonly summary: string;
  readonly status: ToolStatus;
  readonly output: string;
  readonly detail: string;
  readonly durationMs: number | null;
  readonly omitted: number;
}

/**
 * Lifecycle information that is not a tool call (hooks, MCP, rules, stops).
 * `text` is an English i18n key with {placeholders}; `values` fills them when
 * the note is rendered through t().
 */
export interface NoteEntry {
  readonly kind: 'note';
  readonly id: string;
  readonly anchor: number;
  readonly text: string;
  readonly values: Readonly<Record<string, string>>;
  readonly detail: string;
  readonly tone: 'info' | 'warning' | 'error';
}

/** The agent's live plan, rendered as a checklist; one entry, updated in place. */
export interface TodosEntry {
  readonly kind: 'todos';
  readonly id: string;
  readonly anchor: number;
  readonly items: readonly TodoItem[];
}

export type TimelineEntry = ToolEntry | NoteEntry | TodosEntry;

const MAX_ENTRIES = 200;
const MAX_TEXT = 30_000;
const MAX_TOTAL = 256_000;

const clip = (text: string) => text.slice(0, MAX_TEXT);

function bound(entries: TimelineEntry[]): TimelineEntry[] {
  const next = entries.slice(-MAX_ENTRIES);
  const size = (entry: TimelineEntry) =>
    entry.kind === 'tool'
      ? entry.output.length + entry.detail.length
      : entry.kind === 'todos'
        ? entry.items.reduce((sum, item) => sum + item.content.length, 0)
        : entry.detail.length;
  let total = next.reduce((sum, entry) => sum + size(entry), 0);
  while (total > MAX_TOTAL && next.length > 1) total -= size(next.shift()!);
  return next;
}

function updateTool(
  entries: readonly TimelineEntry[],
  callId: string,
  patch: (entry: ToolEntry) => Partial<ToolEntry>,
): TimelineEntry[] {
  return entries.map((entry) =>
    entry.kind === 'tool' && entry.id === callId ? { ...entry, ...patch(entry) } : entry,
  );
}

function note(
  sequence: number,
  anchor: number,
  text: string,
  values: Readonly<Record<string, string>> = {},
  detail = '',
  tone: NoteEntry['tone'] = 'info',
): NoteEntry {
  return {
    kind: 'note',
    id: `note-${sequence}`,
    anchor,
    text,
    values,
    detail: clip(detail),
    tone,
  };
}

/**
 * Folds one presentation event into the transcript timeline. `anchor` is the
 * number of messages already shown, so rows appear where the agent acted.
 */
export function applyTimelineEvent(
  entries: readonly TimelineEntry[],
  event: PresentationEvent,
  anchor: number,
  sequence: number,
): readonly TimelineEntry[] {
  switch (event.type) {
    case 'TodosUpdated': {
      const existing = entries.findIndex((entry) => entry.kind === 'todos');
      const entry: TodosEntry = {
        kind: 'todos',
        id: existing === -1 ? `todos-${sequence}` : entries[existing]!.id,
        anchor: existing === -1 ? anchor : entries[existing]!.anchor,
        items: event.todos.map((item) => ({ ...item })),
      };
      return bound(
        existing === -1
          ? [...entries, entry]
          : entries.map((item) => (item === entries[existing] ? entry : item)),
      );
    }
    case 'ToolRequested': {
      const existing = entries.some((entry) => entry.kind === 'tool' && entry.id === event.callId);
      if (existing) return entries;
      return bound([
        ...entries,
        {
          kind: 'tool',
          id: event.callId,
          anchor,
          toolName: event.toolName,
          source: event.sourceLabel,
          summary: clip(event.argumentSummary),
          status: 'Requested',
          output: '',
          detail: '',
          durationMs: null,
          omitted: 0,
        },
      ]);
    }
    case 'ToolAwaitingApproval':
      return entries.some((entry) => entry.kind === 'tool' && entry.status === 'Requested')
        ? updateTool(
            entries,
            [...entries]
              .reverse()
              .find((entry) => entry.kind === 'tool' && entry.status === 'Requested')!.id,
            () => ({ status: 'AwaitingApproval' }),
          )
        : entries;
    case 'ToolStarted':
      return updateTool(entries, event.callId, () => ({ status: 'Running' }));
    case 'CommandOutput':
      return updateTool(entries, event.callId, (entry) =>
        entry.kind === 'tool' ? { output: clip(entry.output + event.text) } : {},
      );
    case 'ToolCompleted':
      return updateTool(entries, event.callId, () => ({
        status: event.result.status,
        output: clip(event.result.output),
        detail: event.result.error ? clip(event.result.error.message) : '',
        durationMs: event.result.durationMs,
        omitted: event.result.omittedCharacters,
      }));
    case 'ToolBlocked':
      return updateTool(entries, event.callId, () => ({
        status: 'Blocked',
        detail: clip(event.reasons.join('\n')),
      }));
    case 'ToolDenied':
      return updateTool(entries, event.callId, () => ({ status: 'Denied' }));
    case 'ToolValidationFailed':
      return bound([
        ...entries,
        note(
          sequence,
          anchor,
          'Tool repair {attempt}/2',
          { attempt: String(event.repairAttempt) },
          event.message,
          'warning',
        ),
      ]);
    case 'GuardrailEvaluated':
      return event.decision.action === 'Allow'
        ? entries
        : bound([
            ...entries,
            note(
              sequence,
              anchor,
              'Guardrail · {action}',
              { action: event.decision.action },
              event.decision.reasons.join('\n'),
              'warning',
            ),
          ]);
    case 'HookObserved':
      return bound([
        ...entries,
        note(
          sequence,
          anchor,
          'Hook {hookId} · {outcome}',
          { hookId: event.report.hookId, outcome: event.report.outcome },
          `${event.report.command} ${event.report.args.join(' ')}\n${event.report.message}`,
        ),
      ]);
    case 'SkillLoaded':
      return bound([...entries, note(sequence, anchor, 'Skill · {name}', { name: event.name })]);
    case 'ProjectInstructionsLoaded':
      return bound([
        ...entries,
        note(sequence, anchor, 'Project rules · {path}', { path: event.relativePath }),
      ]);
    case 'McpServerStarted':
      return bound([
        ...entries,
        note(
          sequence,
          anchor,
          'MCP server {serverId} started',
          { serverId: event.serverId },
          `${event.command} ${event.args.join(' ')}`,
        ),
      ]);
    case 'McpServerStopped':
      return bound([
        ...entries,
        note(
          sequence,
          anchor,
          'MCP server {serverId} stopped',
          { serverId: event.serverId },
          event.reason,
        ),
      ]);
    case 'ConfigurationReloaded':
      return bound([
        ...entries,
        note(
          sequence,
          anchor,
          event.hooksChanged
            ? 'Configuration reloaded · {count} MCP server changes · hooks updated'
            : 'Configuration reloaded · {count} MCP server changes',
          { count: String(event.changedServers.length) },
        ),
      ]);
    case 'AgentLoopStopped':
      return bound([
        ...entries,
        note(sequence, anchor, 'Agent stopped · {reason}', { reason: event.reason }, '', 'error'),
      ]);
    case 'GenerationCancelled':
      return bound([
        ...updateCancelled(entries),
        note(sequence, anchor, 'Interrupted', {}, '', 'warning'),
      ]);
    case 'ResponseCompleted':
      return event.finishReason === 'Length'
        ? bound([
            ...entries,
            note(sequence, anchor, 'Output token limit reached', {}, '', 'warning'),
          ])
        : entries;
    case 'ErrorOccurred':
      // Provider connection problems are shown in the composer banner instead.
      return event.code === 'ProviderUnavailable'
        ? entries
        : bound([...entries, note(sequence, anchor, event.code, {}, event.message, 'error')]);
    default:
      return entries;
  }
}

function updateCancelled(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return entries.map((entry) =>
    entry.kind === 'tool' && ['Requested', 'AwaitingApproval', 'Running'].includes(entry.status)
      ? { ...entry, status: 'Cancelled' as const }
      : entry,
  );
}
