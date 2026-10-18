import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';

export function PromptPicker({ disabled, onOpen }: { disabled: boolean; onOpen(): void }) {
  const { t } = useI18n();
  return (
    <div className="prompt-picker">
      <button
        className="icon-button"
        disabled={disabled}
        title={t('Prompt library')}
        aria-label={t('Prompt library')}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <Icon name="library" size={16} />
      </button>
    </div>
  );
}
