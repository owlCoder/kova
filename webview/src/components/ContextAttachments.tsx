import type { ContextAttachmentView } from '../../../packages/protocol/src/ContextAttachmentView.js';
import { useI18n } from '../i18n/I18n.js';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

export function ContextAttachments({
  items,
  busy,
  onPreview,
}: {
  items: readonly ContextAttachmentView[];
  busy: boolean;
  onPreview(id: string): void;
}) {
  const { t, language } = useI18n();
  if (!items.length) return null;
  const characters = items.reduce((sum, item) => sum + item.characters, 0);
  return (
    <section className="attached-context" aria-label={t('Attached context')}>
      <div className="attachment-heading">
        <span>
          <Icon name="paperclip" size={12} />
          {t('Context')}
          <b>{items.length}/10</b>
        </span>
        <small>{t('{count} characters', { count: characters.toLocaleString(language) })}</small>
      </div>
      <div className="attachment-chips">
        {items.map((item) => (
          <div className="attachment-chip" key={item.id}>
            <button
              aria-haspopup="dialog"
              title={t('Preview {name}', { name: item.label })}
              aria-label={t('Preview {name}', { name: item.label })}
              onClick={() => onPreview(item.id)}
            >
              <Icon name={item.source === 'Selection' ? 'code' : 'file'} size={13} />
              <span>{item.label}</span>
            </button>
            <button
              disabled={busy}
              aria-label={t('Remove {name}', { name: item.label })}
              title={t('Remove {name}', { name: item.label })}
              onClick={() => send({ type: 'RemoveContext', attachmentId: item.id })}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
