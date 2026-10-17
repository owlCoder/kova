import { useI18n } from '../i18n/I18n.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { MessageContent } from './MessageContent.js';

type Activity = { id: number; text: string; error: boolean };
export function Conversation({
  snapshot,
  thinking,
  activities,
  busy,
}: {
  snapshot: SessionSnapshot;
  thinking: Record<string, string>;
  activities: readonly Activity[];
  busy: boolean;
}) {
  const { t } = useI18n();
  const approval = snapshot.pendingApproval;
  return (
    <div className="thread">
      {snapshot.messages.map((message) => (
        <article className={`message ${message.role}`} key={message.id}>
          <div className="message-label">
            <span className={`avatar ${message.role}`}>
              <Icon name={message.role === 'user' ? 'chat' : 'sparkles'} size={14} />
            </span>
            <strong>{message.role === 'user' ? t('You') : 'Kova'}</strong>
            {message.partial && (
              <span className="muted">{busy ? t('Working…') : t('Partial response')}</span>
            )}
            {!!message.content && (
              <button
                className="message-copy"
                title={t('Copy message')}
                aria-label={t('Copy message')}
                onClick={() => send({ type: 'CopyText', text: message.content })}
              >
                <Icon name="copy" size={13} />
              </button>
            )}
          </div>
          {thinking[message.id] && (
            <details className="thinking">
              <summary>
                <Icon name="sparkles" size={13} />
                {t('Reasoning')}
              </summary>
              <pre>{thinking[message.id]}</pre>
            </details>
          )}
          <MessageContent text={message.content} />
          {message.partial && busy && !message.content && !thinking[message.id] && (
            <div className="generating">
              <span />
              <span />
              <span />
              <small>{t('Thinking through your request')}</small>
            </div>
          )}
        </article>
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
