import { memo } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { BrandMark } from './BrandMark.js';
import { MessageContent } from './MessageContent.js';

/** Scalar props keep completed messages out of streaming and tool-activity renders. */
export const ConversationMessage = memo(function ConversationMessage({
  role,
  content,
  partial,
  working,
  reasoning,
}: {
  role: 'user' | 'assistant';
  content: string;
  partial: boolean;
  working: boolean;
  reasoning: string;
}) {
  const { t } = useI18n();
  return (
    <article className={`message ${role}`}>
      <div className="message-label">
        <span className={`avatar ${role}`}>
          {role === 'user' ? <Icon name="chat" size={14} /> : <BrandMark />}
        </span>
        <strong>{role === 'user' ? t('You') : 'Kova'}</strong>
        {partial && (
          <span className="muted">{working ? t('Working…') : t('Partial response')}</span>
        )}
        {!!content && (
          <button
            className="message-copy"
            title={t('Copy message')}
            aria-label={t('Copy message')}
            onClick={() => send({ type: 'CopyText', text: content })}
          >
            <Icon name="copy" size={13} />
          </button>
        )}
      </div>
      {reasoning && (
        <details className="thinking">
          <summary>
            <Icon name="brain" size={13} />
            {t('Reasoning')}
          </summary>
          <pre>{reasoning}</pre>
        </details>
      )}
      <MessageContent text={content} />
      {partial && working && !content && !reasoning && (
        <div className="generating">
          <span />
          <span />
          <span />
          <small>{t('Thinking through your request')}</small>
        </div>
      )}
    </article>
  );
});
