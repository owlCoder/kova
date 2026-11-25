import { useEffect, useId } from 'react';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { menuKeydown } from './menuKeydown.js';
import { useModelPopover } from './useModelPopover.js';

/** Menu order; Shift+Tab in the composer walks the same order. */
export const modeOrder: readonly AgentMode[] = ['Manual', 'Edit', 'Plan', 'Auto'];

export const modeView: Record<
  AgentMode,
  { label: string; hint: string; icon: 'shield' | 'code' | 'zap' | 'plan' }
> = {
  Manual: { label: 'Ask before changes', hint: 'Approve every change and command', icon: 'shield' },
  Edit: {
    label: 'Accept edits',
    hint: 'Edits apply directly; commands need approval',
    icon: 'code',
  },
  Plan: { label: 'Plan mode', hint: 'Read only: explore and propose a plan', icon: 'plan' },
  Auto: { label: 'Auto mode', hint: 'Allowlisted commands run without asking', icon: 'zap' },
};

/** Permission mode picker: one row per mode with its description and a check. */
export function ModeMenu({
  mode,
  disabled,
  onChange,
}: {
  mode: AgentMode;
  disabled: boolean;
  onChange(mode: AgentMode): void;
}) {
  const { t } = useI18n();
  const id = useId();
  const menu = useModelPopover(true, disabled, 300);
  useEffect(() => {
    if (menu.open)
      menu.panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [menu.open, menu.panel]);
  const view = modeView[mode];
  return (
    <div className="mode-menu" ref={menu.root}>
      <button
        ref={(node) => {
          menu.trigger.current = node;
        }}
        className={`mode-toggle mode-${mode.toLowerCase()}`}
        disabled={disabled}
        title={`${t(view.hint)} · ${t('Shift+Tab to switch')}`}
        aria-label={`${t('Agent mode')}: ${t(view.label)}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={id}
        onClick={() => (menu.open ? menu.hide() : menu.show())}
      >
        <Icon name={view.icon} size={13} />
        <span>{t(view.label)}</span>
      </button>
      <div
        id={id}
        ref={menu.panel}
        popover="auto"
        role="menu"
        aria-label={t('Modes')}
        className="kova-popover mode-popover"
        style={menu.position}
        onKeyDown={(event) => menuKeydown(event, () => menu.hide(true))}
      >
        <div className="popover-heading">
          <span>{t('Modes')}</span>
          <span>
            <kbd>⇧</kbd> + <kbd>Tab</kbd> {t('to switch')}
          </span>
        </div>
        {modeOrder.map((item) => (
          <button
            key={item}
            role="menuitemradio"
            aria-checked={item === mode}
            className={`popover-item mode-${item.toLowerCase()}`}
            onClick={() => {
              onChange(item);
              menu.hide(true);
            }}
          >
            <Icon name={modeView[item].icon} size={15} />
            <span className="popover-copy">
              <strong>{t(modeView[item].label)}</strong>
              <small>{t(modeView[item].hint)}</small>
            </span>
            {item === mode && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}
