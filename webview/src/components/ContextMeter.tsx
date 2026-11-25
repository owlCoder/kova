import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { useI18n } from '../i18n/I18n.js';
import { usePopover } from './usePopover.js';

/** Small ring showing how full the context window is, with a breakdown on open. */
export function ContextMeter({ snapshot }: { snapshot: SessionSnapshot | null }) {
  const { t } = useI18n();
  const menu = usePopover({ minimumWidth: 240, align: 'end' });
  const usage = snapshot?.usage;
  const used = usage
    ? (usage.actualInputTokens ?? usage.estimatedInputTokens) + (usage.actualOutputTokens ?? 0)
    : 0;
  const max = usage?.maxTokens ?? snapshot?.contextMaxTokens ?? 32768;
  const ratio = Math.min(1, used / Math.max(1, max));
  const circumference = 2 * Math.PI * 6;
  const level = ratio > 0.9 ? 'full' : ratio > 0.7 ? 'high' : 'ok';
  return (
    <div className={`context context-${level}`} ref={menu.root}>
      <button
        ref={(node) => {
          menu.trigger.current = node;
        }}
        type="button"
        className="context-trigger"
        title={t('Context usage')}
        aria-label={`${t('Context usage')}: ${Math.round(ratio * 100)}%`}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        onClick={() => (menu.open ? menu.hide() : menu.show())}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="6" className="ring-track" />
          <circle
            cx="8"
            cy="8"
            r="6"
            className="ring-value"
            strokeDasharray={`${ratio * circumference} ${circumference}`}
            transform="rotate(-90 8 8)"
          />
        </svg>
        <span>{Math.round(ratio * 100)}%</span>
      </button>
      <div
        ref={menu.panel}
        popover="auto"
        role="dialog"
        aria-label={t('Context window')}
        className="context-details"
        style={menu.position}
      >
        <strong>{t('Context window')}</strong>
        <progress value={Math.min(used, max)} max={max} />
        <span>
          {t('Used')}
          <b>
            {used.toLocaleString()} / {max.toLocaleString()}
          </b>
        </span>
        <span>
          {t('Input')}
          <b>{usage?.actualInputTokens ?? usage?.estimatedInputTokens ?? 0}</b>
        </span>
        <span>
          {t('Output')}
          <b>{usage?.actualOutputTokens ?? '—'}</b>
        </span>
        <span>
          {t('Tool definitions')}
          <b>{usage?.toolDefinitionTokens ?? 0}</b>
        </span>
      </div>
    </div>
  );
}
