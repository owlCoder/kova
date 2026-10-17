import { memo, useEffect, useId, useMemo, useState } from 'react';
import type { ModelInfo } from '../../../packages/protocol/src/ModelInfo.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { modelChoices } from './modelChoices.js';
import { useModelPopover } from './useModelPopover.js';

export const ModelPicker = memo(function ModelPicker({
  models,
  model,
  busy,
  onChange,
  allowCustom = false,
  label,
  id,
}: {
  models: readonly ModelInfo[] | undefined;
  model: string;
  busy: boolean;
  onChange(value: string): void;
  allowCustom?: boolean;
  label?: string;
  id?: string;
}) {
  const { t, language } = useI18n();
  const uid = useId();
  const listId = `${uid}-models`;
  const popupId = `${uid}-popup`;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const popover = useModelPopover(allowCustom, busy);
  const { items, more } = useMemo(() => modelChoices(models, model, query), [models, model, query]);
  const index = Math.min(active, items.length - 1);
  const selected = models?.find((item) => item.id === model);
  useEffect(() => {
    if (!popover.open) setQuery('');
    else
      setActive(
        Math.max(
          0,
          items.findIndex((item) => item.id === model),
        ),
      );
  }, [popover.open]);
  useEffect(() => {
    if (popover.open)
      document.getElementById(`${uid}-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index, popover.open, uid]);
  const choose = (value: string) => {
    onChange(value);
    popover.hide(true);
  };
  const combobox = {
    role: 'combobox' as const,
    'aria-expanded': popover.open,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': popover.open && index >= 0 ? `${uid}-option-${index}` : undefined,
  };
  return (
    <div
      className={`model-picker ${allowCustom ? 'model-picker-editable' : ''}`}
      ref={popover.root}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && popover.open) {
          event.preventDefault();
          event.stopPropagation();
          popover.hide(true);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!popover.open) popover.show();
          else if (items.length)
            setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
        } else if (event.key === 'Enter' && popover.open) {
          event.preventDefault();
          if (items[index]) choose(items[index].id);
          else popover.hide(true);
        }
      }}
    >
      {allowCustom ? (
        <div className="model-entry">
          <Icon name="cpu" size={16} />
          <input
            ref={(node) => {
              popover.trigger.current = node;
            }}
            id={id}
            {...combobox}
            aria-label={label ?? t('Model')}
            value={model}
            disabled={busy}
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={256}
            placeholder={t('Choose or enter a chat model ID')}
            onFocus={() => {
              if (!popover.open) popover.show();
            }}
            onChange={(event) => {
              onChange(event.target.value);
              setQuery(event.target.value);
              setActive(0);
              popover.show();
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={busy}
            aria-label={t('Choose model')}
            onClick={popover.show}
          >
            <Icon name="down" size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="model-trigger"
          ref={(node) => {
            popover.trigger.current = node;
          }}
          id={id}
          aria-label={`${label ?? t('Model')}: ${selected?.displayName || model || t('Choose model')}`}
          aria-haspopup="dialog"
          aria-expanded={popover.open}
          aria-controls={popupId}
          title={model}
          disabled={busy}
          onClick={() => (popover.open ? popover.hide() : popover.show())}
        >
          <Icon name="cpu" size={14} />
          <span>{selected?.displayName || model || t('Choose model')}</span>
          <Icon name="down" size={12} />
        </button>
      )}
      <div
        ref={popover.panel}
        id={popupId}
        popover="auto"
        className="model-popover"
        style={popover.position}
        role={allowCustom ? undefined : 'dialog'}
        aria-label={t('Choose model')}
      >
        {!allowCustom && (
          <div className="model-search">
            <Icon name="search" size={16} />
            <input
              ref={popover.search}
              {...combobox}
              aria-label={t('Search models')}
              placeholder={t('Search models…')}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          </div>
        )}
        <div className="model-options" id={listId} role="listbox" aria-label={t('Model')}>
          {items.map((item, i) => (
            <button
              type="button"
              role="option"
              key={item.id}
              id={`${uid}-option-${i}`}
              tabIndex={-1}
              aria-selected={item.id === model}
              className={index === i ? 'active' : ''}
              onPointerMove={() => setActive(i)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.id)}
            >
              <Icon name="cpu" size={16} />
              <span className="model-option-copy">
                <strong>{item.displayName}</strong>
                {item.displayName !== item.id && <small className="model-id">{item.id}</small>}
                <small>
                  {t(
                    item.tools === 'Supported'
                      ? 'Workspace tools'
                      : item.tools === 'Unsupported'
                        ? 'Chat only'
                        : 'Capabilities unknown',
                  )}
                  {item.maxContextTokens
                    ? ` · ${t('{count} context', { count: new Intl.NumberFormat(language === 'sr' ? 'sr-Latn' : language, { notation: 'compact', maximumFractionDigits: 1 }).format(item.maxContextTokens) })}`
                    : ''}
                </small>
              </span>
              <span className="model-selected">
                {item.id === model && <Icon name="check" size={15} />}
              </span>
            </button>
          ))}
          {!items.length && (
            <p className="model-empty" role="status">
              {t('No matching models.')}
              {allowCustom && <small>{t('Your typed model ID will be used.')}</small>}
            </p>
          )}
        </div>
        {(allowCustom || more) && (
          <div className="model-picker-hint">
            {t(
              more
                ? 'Refine your search to see more models.'
                : 'You can also enter a model ID manually.',
            )}
          </div>
        )}
      </div>
    </div>
  );
});
