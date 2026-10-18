import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { useI18n } from '../i18n/I18n.js';
import { recentPrompts } from '../state/recentPrompts.js';
import { Icon } from './Icon.js';
import { promptTemplates } from './promptTemplates.js';
import { useModelPopover } from './useModelPopover.js';

export function PromptPicker({
  messages,
  disabled,
  onChoose,
}: {
  messages: SessionSnapshot['messages'] | undefined;
  disabled: boolean;
  onChoose(text: string): void;
}) {
  const { t, language } = useI18n();
  const menu = useModelPopover(false, disabled, 390);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const results = useRef<HTMLDivElement>(null);
  const id = useId();
  const recent = useMemo(() => recentPrompts(messages), [messages]);
  const options = useMemo(
    () =>
      [
        ...promptTemplates.map((item) => ({
          id: item.id,
          title: t(item.title),
          text: t(item.text),
          description: t(item.description),
          icon: item.icon,
          recent: false,
        })),
        ...recent.map((text, index) => ({
          id: `recent-${index}`,
          title: text.replace(/\s+/g, ' ').slice(0, 100),
          text,
          description: t('Previous message'),
          icon: 'clock' as const,
          recent: true,
        })),
      ].filter((item) =>
        `${item.title} ${item.text}`
          .toLocaleLowerCase(language)
          .includes(query.toLocaleLowerCase(language)),
      ),
    [recent, language, query],
  );
  const active = Math.min(selected, options.length - 1);
  useEffect(() => {
    if (menu.open) {
      setQuery('');
      setSelected(0);
    }
  }, [menu.open]);
  useEffect(() => {
    results.current
      ?.querySelector(`[data-prompt-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);
  const choose = (index: number) => {
    const item = options[index];
    if (!item) return;
    menu.hide();
    onChoose(item.text);
  };
  return (
    <div ref={menu.root} className="prompt-picker">
      <button
        className="icon-button"
        disabled={disabled}
        ref={(node) => {
          menu.trigger.current = node;
        }}
        title={t('Prompt library')}
        aria-label={t('Prompt library')}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-controls={id}
        onClick={() => (menu.open ? menu.hide() : menu.show())}
      >
        <Icon name="library" size={16} />
      </button>
      <div
        ref={menu.panel}
        popover="auto"
        className="prompt-library"
        style={menu.position}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            menu.hide(true);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (options.length)
              setSelected(
                (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
              );
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose(active);
          }
        }}
      >
        <label className="prompt-search">
          <Icon name="search" size={15} />
          <input
            ref={menu.search}
            role="combobox"
            aria-label={t('Search prompts')}
            aria-expanded={menu.open}
            aria-controls={id}
            aria-activedescendant={active >= 0 ? `${id}-${options[active]!.id}` : undefined}
            placeholder={t('Search templates and previous messages…')}
            autoComplete="off"
            maxLength={128}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
          />
        </label>
        <div
          id={id}
          ref={results}
          role="listbox"
          aria-label={t('Prompt library')}
          className="prompt-results"
        >
          {options.map((item, index) => (
            <button
              id={`${id}-${item.id}`}
              key={item.id}
              data-prompt-index={index}
              role="option"
              aria-selected={active === index}
              tabIndex={-1}
              className={active === index ? 'selected' : ''}
              onMouseEnter={() => setSelected(index)}
              onClick={() => choose(index)}
            >
              <Icon name={item.icon} size={16} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <Icon name="plus" size={13} />
            </button>
          ))}
          {!options.length && <p>{t('No matching prompts')}</p>}
        </div>
        <small className="prompt-library-hint">
          {t('Insert, review, then send. Your selected mode stays the same.')}
        </small>
      </div>
    </div>
  );
}
