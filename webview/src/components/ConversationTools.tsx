import { useEffect, useId } from 'react';
import { send } from '../messaging/bridge.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { modifierKey } from './modifierKey.js';
import { useModelPopover } from './useModelPopover.js';

export function ConversationTools({
  conversationId,
  hasMessages,
  busy,
  onFind,
}: {
  conversationId: string | undefined;
  hasMessages: boolean;
  busy: boolean;
  onFind(): void;
}) {
  const { t } = useI18n();
  const id = useId();
  const menu = useModelPopover(true, !hasMessages, 260);
  useEffect(() => {
    if (menu.open) menu.panel.current?.querySelector('button')?.focus();
  }, [menu.open, menu.panel]);
  const exportTo = (action: 'save' | 'copy') => {
    menu.hide(true);
    if (conversationId) send({ type: 'ExportConversation', conversationId, action });
  };
  return (
    <div className="conversation-tools" ref={menu.root}>
      <button
        className="icon-button"
        disabled={!hasMessages}
        title={t('Find in conversation')}
        aria-label={t('Find in conversation')}
        onClick={onFind}
      >
        <Icon name="search" size={16} />
      </button>
      <button
        className="icon-button"
        ref={(node) => {
          menu.trigger.current = node;
        }}
        disabled={!hasMessages}
        title={t('Conversation actions')}
        aria-label={t('Conversation actions')}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={id}
        onClick={() => (menu.open ? menu.hide() : menu.show())}
      >
        <Icon name="more" size={17} />
      </button>
      <div
        id={id}
        ref={menu.panel}
        popover="auto"
        role="menu"
        aria-label={t('Conversation actions')}
        className="conversation-actions"
        style={menu.position}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            menu.hide(true);
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            ];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
          }
        }}
      >
        <button
          role="menuitem"
          onClick={() => {
            menu.hide();
            onFind();
          }}
        >
          <Icon name="search" size={15} />
          <span>{t('Find in conversation')}</span>
          <kbd>{modifierKey()} F</kbd>
        </button>
        <button role="menuitem" disabled={busy} onClick={() => exportTo('save')}>
          <Icon name="download" size={15} />
          <span>{t('Export Markdown…')}</span>
        </button>
        <button role="menuitem" disabled={busy} onClick={() => exportTo('copy')}>
          <Icon name="copy" size={15} />
          <span>{t('Copy conversation')}</span>
        </button>
        <small>{t('Exports include messages, without tool logs or reasoning.')}</small>
      </div>
    </div>
  );
}
