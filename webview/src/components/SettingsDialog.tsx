import { useEffect, useMemo, useRef, useState } from 'react';
import type { KovaSettingsView } from '../../../packages/protocol/src/KovaSettingsView.js';
import { useI18n } from '../i18n/I18n.js';
import { useKovaSettings } from '../state/useKovaSettings.js';
import { Icon } from './Icon.js';
import { settingsSections, type SettingField } from './settingsSchema.js';
import { useDialogFocus } from './useDialogFocus.js';

type Draft = Record<string, string | number | boolean | readonly string[]>;

const toDraft = (settings: KovaSettingsView): Draft =>
  Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value as readonly string[]).slice() : value,
    ]),
  );

/** Kova's own settings dialog; values are validated again by the host on save. */
export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const { settings, error, saving, save } = useKovaSettings();
  const [draft, setDraft] = useState<Draft>({});
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  const changed = useMemo(() => {
    if (!settings) return {};
    const values: Draft = {};
    for (const [key, value] of Object.entries(draft)) {
      const original = settings[key];
      const same = Array.isArray(value)
        ? Array.isArray(original) &&
          value.length === original.length &&
          value.every((entry, index) => entry === original[index])
        : typeof original === 'number' && typeof value === 'string'
          ? Number(value) === original
          : value === original;
      if (!same) values[key] = value;
    }
    return values;
  }, [draft, settings]);

  const set = (key: string, value: string | number | boolean | readonly string[]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const submit = () => {
    if (!settings || saving || !Object.keys(changed).length) return;
    const values: Record<string, string | number | boolean | readonly string[]> = {};
    for (const [key, value] of Object.entries(changed)) {
      values[key] =
        typeof value === 'string' && typeof settings[key] === 'number' ? Number(value) : value;
    }
    save(values);
  };

  const field = (item: SettingField) => {
    const value = draft[item.key];
    const label = t(item.labelKey);
    switch (item.kind) {
      case 'select':
        return (
          <select
            aria-label={label}
            value={String(value ?? '')}
            onChange={(event) => set(item.key, event.target.value)}
          >
            {item.options.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        );
      case 'number':
        return (
          <input
            type="number"
            aria-label={label}
            min={item.min}
            max={item.max}
            value={String(value ?? '')}
            onChange={(event) => set(item.key, event.target.value)}
          />
        );
      case 'checkbox':
        return (
          <input
            type="checkbox"
            aria-label={label}
            checked={Boolean(value)}
            onChange={(event) => set(item.key, event.target.checked)}
          />
        );
      case 'commandList':
        return (
          <textarea
            aria-label={label}
            rows={4}
            value={Array.isArray(value) ? value.join('\n') : String(value ?? '')}
            onChange={(event) =>
              set(
                item.key,
                event.target.value.split('\n').map((line) => line.trim()),
              )
            }
          />
        );
      default:
        return (
          <input
            type="text"
            aria-label={label}
            value={String(value ?? '')}
            onChange={(event) => set(item.key, event.target.value)}
          />
        );
    }
  };

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('Kova settings')}
        ref={dialog}
      >
        <header className="settings-heading">
          <div>
            <span className="eyebrow">{t('KOVA')}</span>
            <h2>{t('Kova settings')}</h2>
          </div>
          <button
            className="icon-button"
            aria-label={t('Close settings')}
            title={t('Close settings')}
            onClick={onClose}
          >
            <Icon name="close" size={15} />
          </button>
        </header>
        {!settings ? (
          <p className="settings-pending" role="status">
            {t('Loading settings…')}
          </p>
        ) : (
          <div className="settings-body">
            {error && (
              <p className="settings-error" role="alert">
                {t(error)}
              </p>
            )}
            {settingsSections.map((section) => (
              <section key={section.titleKey} className="settings-section">
                <h3>{t(section.titleKey)}</h3>
                {section.fields.map((item) => (
                  <label key={item.key} className={`settings-field field-${item.kind}`}>
                    <span className="settings-label">{t(item.labelKey)}</span>
                    {field(item)}
                    <small className="settings-hint">{t(item.hintKey)}</small>
                  </label>
                ))}
              </section>
            ))}
          </div>
        )}
        <footer className="settings-actions">
          <button className="settings-button secondary" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            className="settings-button primary"
            disabled={!settings || saving || !Object.keys(changed).length}
            onClick={submit}
          >
            {saving ? t('Saving…') : t('Save settings')}
          </button>
        </footer>
      </div>
    </div>
  );
}
