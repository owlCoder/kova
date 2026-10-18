import { useI18n } from '../i18n/I18n.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { ConversationMessage } from './ConversationMessage.js';
import { useRef, type RefObject } from 'react';
import { useHistoryWindow } from '../state/useHistoryWindow.js';

type Activity = { id: number; text: string; error: boolean };
export function Conversation({
  snapshot,
  thinking,
  activities,
  busy,
  onReuse,
  scroller,
  searching,
  followLatest,
}: {
  snapshot: SessionSnapshot;
  thinking: Record<string, string>;
  activities: readonly Activity[];
  busy: boolean;
  onReuse(text: string): void;
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
      {snapshot.messages.slice(history.start).map((message) => (
        <ConversationMessage
          key={message.id}
          role={message.role}
          content={message.content}
          partial={message.partial}
          working={message.partial && busy}
          reasoning={thinking[message.id] ?? ''}
          onReuse={onReuse}
        />
      ))}
      {!!activities.length && (
        <details className="activity" open={Boolean(approval) || busy}>
          <summary>
            <Icon name="terminal" size={14} />
            <span>{t('Agent activity')}</span>
            <span className="count-badge">{activities.length}</span>
            <Icon name="down" size={13} />
          </summary>
          <div className="activity-items">
            {activities.map((item) => (
              <details key={item.id} className={`activity-row ${item.error ? 'error' : ''}`}>
                <summary>
                  <span className="activity-dot" />
                  {item.text.split('\n')[0]}
                </summary>
                {item.text.includes('\n') && (
                  <pre>{item.text.slice(item.text.indexOf('\n') + 1)}</pre>
                )}
              </details>
            ))}
          </div>
        </details>
      )}
      {approval && (
        <section className="approval">
          <div className="eyebrow">
            <Icon name="shield" size={14} />
            {t('YOUR APPROVAL')}
          </div>
          <h3>{approval.toolName.replaceAll('_', ' ')}</h3>
          <p>{approval.reasons.join(' · ')}</p>
          {approval.preview?.kind === 'FileChanges' && (
            <button
              className="diff-open"
              onClick={() => send({ type: 'OpenDiffPreview', approvalId: approval.approvalId })}
            >
              <Icon name="review" size={15} />
              <span>{approval.preview.relativePaths.join(', ')}</span>
              <Icon name="arrow" size={14} />
            </button>
          )}
          {approval.preview?.kind === 'Command' && <pre>{approval.preview.command}</pre>}
          <div className="approval-buttons">
            <button
              onClick={() =>
                send({
                  type: 'ResolveApproval',
                  runId: approval.runId,
                  approvalId: approval.approvalId,
                  preparationKey: approval.preparationKey,
                  decision: 'Reject',
                })
              }
            >
              {t('Reject')}
            </button>
            <button
              className="primary"
              onClick={() =>
                send({
                  type: 'ResolveApproval',
                  runId: approval.runId,
                  approvalId: approval.approvalId,
                  preparationKey: approval.preparationKey,
                  decision: 'AllowOnce',
                })
              }
            >
              <Icon name="check" size={14} />
              {t('Allow once')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
