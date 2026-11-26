import { useEffect, useId, useMemo, useState } from 'react';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { useI18n } from '../i18n/I18n.js';
import { recentPrompts } from '../state/recentPrompts.js';
import { usePromptLibrary } from '../state/usePromptLibrary.js';
import { Icon } from './Icon.js';
import { menuKeydown } from './menuKeydown.js';
import { promptTemplates } from './promptTemplates.js';
import { usePopover } from './usePopover.js';

type Item = {
  id: string;
  group: string;
  icon: 'pin' | 'clock' | 'code';
  title: string;
  text: string;
};

/**
 * Quick prompt menu above the composer: saved prompts, templates and recent
 * messages. Choosing one inserts it into the draft; editing lives in the full
 * library, opened with Manage.
 */
export function PromptMenu({
  messages,
  disabled,
  onChoose,
  onManage,
}: {
  messages: SessionSnapshot['messages'] | undefined;
  disabled: boolean;
  onChoose(text: string): void;
  onManage(): void;
}) {
  const { t } = useI18n();
  const id = useId();
  const menu = usePopover({ disabled, minimumWidth: 340 });
  return (
    <div className="prompt-picker" ref={menu.root}>
      <button
        ref={(node) => {
          menu.trigger.current = node;
        }}
        className="icon-button"
        disabled={disabled}
        title={t('Prompt library')}
        aria-label={t('Prompt library')}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={id}
        onClick={() => (menu.open ? menu.hide() : menu.show())}
      >
        <Icon name="library" size={16} />
      </button>
      <div
        id={id}
        ref={menu.panel}
        popover="auto"
        role="menu"
        aria-label={t('Prompt library')}
        className="kova-popover prompt-popover"
        style={menu.position}
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLInputElement &&
            event.key !== 'Escape' &&
            event.key !== 'ArrowDown'
          )
            return;
          menuKeydown(event, () => menu.hide(true));
        }}
      >
        {menu.open && (
          <PromptMenuItems
            messages={messages}
            onChoose={(text) => {
              menu.hide();
              onChoose(text);
            }}
            onManage={() => {
              menu.hide();
              onManage();
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Mounted only while open, so the saved library is requested on demand. */
function PromptMenuItems({
  messages,
  onChoose,
  onManage,
}: {
  messages: SessionSnapshot['messages'] | undefined;
  onChoose(text: string): void;
  onManage(): void;
}) {
  const { t } = useI18n();
  const store = usePromptLibrary();
  const [query, setQuery] = useState('');
  const items = useMemo<Item[]>(() => {
    const saved = (store.library?.prompts ?? []).map((prompt) => ({
      id: `saved-${prompt.id}`,
      group: t('Saved'),
      icon: 'pin' as const,
      title: prompt.title,
      text: prompt.text,
    }));
    const templates = promptTemplates.map((item) => ({
      id: `template-${item.id}`,
      group: t('Templates'),
      icon: 'code' as const,
      title: t(item.title),
      text: t(item.text),
    }));
    const recent = recentPrompts(messages).map((text, index) => ({
      id: `recent-${index}`,
      group: t('Recent'),
      icon: 'clock' as const,
      title: text.split('\n')[0]!.slice(0, 80),
      text,
    }));
    const needle = query.trim().toLowerCase();
    return [...saved, ...templates, ...recent].filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.text.toLowerCase().includes(needle),
    );
  }, [store.library, messages, query, t]);
  useEffect(() => {
    document.querySelector<HTMLInputElement>('.prompt-popover input')?.focus();
  }, []);
  return (
    <>
      <div className="popover-heading">
        <span>{t('Prompts')}</span>
        <button className="popover-link" onClick={onManage}>
          {t('Manage…')}
        </button>
      </div>
      <input
        className="popover-search"
        type="search"
        value={query}
        placeholder={t('Search prompts…')}
        aria-label={t('Search prompts…')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="popover-list">
        {items.map((item, index) => (
          <div key={item.id}>
            {(index === 0 || items[index - 1]!.group !== item.group) && (
              <div className="popover-group">{item.group}</div>
            )}
            <button className="popover-item" role="menuitem" onClick={() => onChoose(item.text)}>
              <Icon name={item.icon} size={14} />
              <span className="popover-copy">
                <strong>{item.title}</strong>
                <small>{item.text.replace(/\s+/g, ' ')}</small>
              </span>
            </button>
          </div>
        ))}
        {!items.length && <p className="popover-empty">{t('No matching prompts.')}</p>}
        {store.error && <p className="popover-empty">{t(store.error)}</p>}
      </div>
    </>
  );
}
