import { Fragment, useRef, type RefObject } from 'react';
import { send } from '../messaging/bridge.js';
import { useI18n } from '../i18n/I18n.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import type { TimelineEntry } from '../state/timeline.js';
import { Icon } from './Icon.js';
import { ConversationMessage } from './ConversationMessage.js';
import { ToolCallRow } from './ToolCallRow.js';
import { TodoList } from './TodoList.js';
import { TimelineNote } from './TimelineNote.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';
import { WorkingIndicator } from './WorkingIndicator.js';
import { useHistoryWindow } from '../state/useHistoryWindow.js';

function Entry({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === 'tool') return <ToolCallRow entry={entry} />;
  if (entry.kind === 'todos') return <TodoList entry={entry} />;
  return <TimelineNote entry={entry} />;
}

/**
 * The transcript: messages with tool calls and lifecycle notes interleaved at
 * the point where the agent acted, then the pending approval and run status.
 */
export function Conversation({
  snapshot,
  thinking,
  timeline,
  runStartedAt,
  busy,
  onReuse,
  onSavePrompt,
  scroller,
  searching,
  followLatest,
}: {
  snapshot: SessionSnapshot;
  thinking: Record<string, string>;
  timeline: readonly TimelineEntry[];
  runStartedAt: number | null;
  busy: boolean;
  onReuse(text: string): void;
  onSavePrompt(text: string): void;
  scroller: RefObject<HTMLDivElement | null>;
  searching: boolean;
  followLatest: boolean;
}) {
  const { t } = useI18n();
  const approval = snapshot.pendingApproval;
  const thread = useRef<HTMLDivElement>(null);
  const history = useHistoryWindow(
    snapshot.messages.length,
    searching,
    followLatest,
    scroller,
    thread,
  );
  const byAnchor = new Map<number, TimelineEntry[]>();
  for (const entry of timeline) {
    const anchor = Math.min(entry.anchor, snapshot.messages.length);
    byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), entry]);
  }
  const streaming = snapshot.messages.at(-1)?.partial && Boolean(snapshot.messages.at(-1)?.content);
  return (
    <div className="thread" ref={thread}>
      {snapshot.messages.length > 40 && (
        <nav className="history-controls" aria-label={t('Conversation history')}>
          <button aria-disabled={!history.start} onClick={history.earlier}>
            <Icon name="up" size={14} />
            {t(history.start ? 'Load earlier messages' : 'All messages loaded')}
          </button>
          <span role="status">
            {t('{visible} of {total} messages', {
              visible: snapshot.messages.length - history.start,
              total: snapshot.messages.length,
            })}
          </span>
          {history.showRecent && (
            <button disabled={searching} onClick={history.latest}>
              <Icon name="down" size={14} />
              {t('Show recent')}
            </button>
          )}
        </nav>
      )}
      {history.start === 0 &&
        (byAnchor.get(0) ?? []).map((entry) => <Entry key={entry.id} entry={entry} />)}
      {snapshot.messages.slice(history.start).map((message, index) => (
        <Fragment key={message.id}>
          <ConversationMessage
            role={message.role}
            content={message.content}
            partial={message.partial}
            working={message.partial && busy}
            reasoning={thinking[message.id] ?? ''}
            onReuse={onReuse}
            onSavePrompt={onSavePrompt}
          />
          {(byAnchor.get(history.start + index + 1) ?? []).map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </Fragment>
      ))}
      {approval && <ApprovalPrompt key={approval.approvalId} approval={approval} />}
      {busy && !approval && !streaming && (
        <WorkingIndicator state={snapshot.state} startedAt={runStartedAt} />
      )}
      {snapshot.revertibleRun && !busy && !approval && (
        <div className="revert-bar">
          <span>
            {t('This run changed {count} files', {
              count: String(snapshot.revertibleRun.files.length),
            })}
            {snapshot.revertibleRun.checkpointed && (
              <small className="revert-checkpoint"> · {t('Git checkpoint saved')}</small>
            )}
          </span>
          <button
            onClick={() =>
              snapshot.revertibleRun &&
              send({ type: 'RevertRun', runId: snapshot.revertibleRun.runId })
            }
          >
            {t('Revert run changes')}
          </button>
        </div>
      )}
    </div>
  );
}
