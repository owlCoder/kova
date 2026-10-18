import { useId, useState } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';

export function PromptEditor({
  initial,
  pending,
  canSave,
  full,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: { id: string | null; title: string; text: string };
  pending: boolean;
  canSave: boolean;
  full: boolean;
  onSave(prompt: { id: string | null; title: string; text: string }): Promise<boolean>;
  onRemove(): void;
  onCancel(): void;
}) {
  const { t, language } = useI18n();
  const [title, setTitle] = useState(initial.title);
  const [text, setText] = useState(initial.text);
  const id = useId();
  return (
    <form
      className="prompt-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!pending && canSave && title.trim() && text.trim())
          await onSave({ id: initial.id, title, text });
      }}
    >
      <label htmlFor={`${id}-title`}>{t('Prompt title')}</label>
      <input
        data-dialog-focus
        id={`${id}-title`}
        value={title}
        maxLength={80}
        required
        disabled={pending}
        placeholder={t('A name you will recognize')}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor={`${id}-text`}>{t('Prompt text')}</label>
      <textarea
        id={`${id}-text`}
        value={text}
        maxLength={16_000}
        required
        disabled={pending}
        placeholder={t('Write a reusable starting point…')}
        onChange={(event) => setText(event.target.value)}
      />
      <small className="prompt-editor-count">{text.length.toLocaleString(language)} / 16,000</small>
      {full && (
        <p role="status">{t('Your library is full. Remove a prompt before saving another.')}</p>
      )}
      <footer>
        {initial.id && (
          <button type="button" disabled={pending} onClick={onRemove}>
            <Icon name="close" size={14} />
            {t('Remove prompt')}
          </button>
        )}
        <span />
        <button type="button" disabled={pending} onClick={onCancel}>
          {t('Back to library')}
        </button>
        <button
          className="primary"
          type="submit"
          disabled={pending || !canSave || !title.trim() || !text.trim()}
        >
          <Icon name="check" size={14} />
          {t(pending ? 'Saving…' : 'Save prompt')}
        </button>
      </footer>
    </form>
  );
}
