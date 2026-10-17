import type { DesktopState } from '../../../packages/protocol/src/DesktopState.js';
import { send } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';
import { useI18n } from '../i18n/I18n.js';

export function AppearanceSettings({ desktop }: { desktop: DesktopState }) {
  const { t } = useI18n();
  return (
    <>
      <div className="eyebrow">{t('APPEARANCE & LANGUAGE')}</div>
      <h2>{t('A space that feels right.')}</h2>
      <p className="settings-description">
        {t(
          'Make text comfortable to read, choose your language and match your workspace to your day.',
        )}
      </p>
      <section className="settings-section">
        <h3>{t('Language')}</h3>
        <p>
          {t('Applies immediately to the interface. Your code and conversations stay as written.')}
        </p>
        <select
          aria-label={t('Interface language')}
          value={desktop.language}
          onChange={(event) =>
            send({ type: 'SetLanguage', language: event.target.value as DesktopState['language'] })
          }
        >
          <option value="en" lang="en">
            English
          </option>
          <option value="sr" lang="sr-Latn">
            Srpski (latinica)
          </option>
          <option value="de" lang="de">
            Deutsch
          </option>
        </select>
      </section>
      <section className="settings-section">
        <h3>{t('Text size')}</h3>
        <p>{t('Adjust labels, conversations and settings together.')}</p>
        <div className="text-size-options" role="group" aria-label={t('Text size')}>
          {(['standard', 'large', 'larger'] as const).map((size) => (
            <button
              key={size}
              aria-pressed={desktop.textSize === size}
              className={desktop.textSize === size ? 'selected' : ''}
              onClick={() => send({ type: 'SetTextSize', textSize: size })}
            >
              {t({ standard: 'Comfortable', large: 'Large', larger: 'Extra large' }[size])}
            </button>
          ))}
        </div>
        <div className="type-preview">
          <strong>{t('Clear ideas deserve clear type.')}</strong>
          <span>{t('Readable text, calmer controls and room to focus.')}</span>
          <code>{t("const workspace = 'yours';")}</code>
        </div>
      </section>
      <section className="settings-section">
        <h3>{t('Theme')}</h3>
        <div className="theme-options">
          {(['dark', 'light', 'system'] as const).map((theme) => (
            <button
              key={theme}
              className={`theme-option ${desktop.theme === theme ? 'selected' : ''}`}
              onClick={() => send({ type: 'SetTheme', theme })}
            >
              <Icon
                name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'}
                size={24}
              />
              <strong>{t({ dark: 'Dark', light: 'Light', system: 'System' }[theme])}</strong>
              <span>{desktop.theme === theme ? t('Selected') : t('Use theme')}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
