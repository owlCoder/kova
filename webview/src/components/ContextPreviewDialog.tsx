import { useId, useRef } from 'react';
import type { ContextPreview } from '../../../packages/protocol/src/ContextAttachmentView.js';
import { useI18n } from '../i18n/I18n.js';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { BrandMark } from './BrandMark.js';
import { useDialogFocus } from './useDialogFocus.js';

export function ContextPreviewDialog({
  preview,
  busy,
  onClose,
}: {
  preview: ContextPreview;
  busy: boolean;
  onClose(): void;
}) {
  const { t, language } = useI18n();
  const panel = useRef<HTMLElement>(null);
  const id = useId();
  useDialogFocus(panel, onClose);
  return (
    <div
      className="modal-backdrop context-backdrop"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={panel}
        className="context-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <BrandMark />
          <div>
            <span className="eyebrow">{t('CONTEXT FOR KOVA')}</span>
            <h2 id={id}>{preview.label}</h2>
          </div>
          <button
            className="icon-button"
            title={t('Close preview')}
            aria-label={t('Close preview')}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="context-preview-meta">
          <span>
            <Icon name={preview.source === 'Selection' ? 'code' : 'file'} size={14} />
            {t(preview.source === 'Selection' ? 'Selection' : 'File snapshot')}
          </span>
          <span>
            {t('{count} characters', { count: preview.characters.toLocaleString(language) })}
          </span>
          <span>
            <Icon name="shield" size={13} />
            {t('Captured locally')}
          </span>
        </div>
        <p className="context-preview-note">
          {t(
            'This is an attachment snapshot. Reattach the file to refresh it. Model context limits may shorten it when sent.',
          )}
        </p>
        {preview.truncated && (
          <div className="context-preview-limit" role="status">
            <Icon name="warning" size={14} />
            {t('Preview shows the first 50,000 characters. The attachment itself is unchanged.')}
          </div>
        )}
        <pre className="context-preview-content" tabIndex={0} aria-label={t('Attachment content')}>
          {preview.content}
        </pre>
        <footer>
          <button
            disabled={busy}
            onClick={() => {
              send({ type: 'RemoveContext', attachmentId: preview.id });
              onClose();
            }}
          >
            <Icon name="close" size={14} />
            {t('Remove attachment')}
          </button>
          <span />
          <button onClick={() => send({ type: 'CopyText', text: preview.content })}>
            <Icon name="copy" size={14} />
            {t('Copy preview')}
          </button>
          <button className="primary" onClick={onClose}>
            {t('Done')}
          </button>
        </footer>
      </section>
    </div>
  );
}
