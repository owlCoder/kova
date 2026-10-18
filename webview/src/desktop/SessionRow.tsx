import { memo, useEffect, useId, useRef, useState } from 'react';
import type { SessionSummary } from '../../../packages/protocol/src/SessionSummary.js';
import { useI18n } from '../i18n/I18n.js';
import { send } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';
import { menuKeydown } from '../components/menuKeydown.js';
import { useModelPopover } from '../components/useModelPopover.js';

export const SessionRow = memo(function SessionRow({
  session,
  active,
  archived,
  busy,
  onRemoved,
}: {
  session: SessionSummary;
  active: boolean;
  archived: boolean;
  busy: boolean;
  onRemoved(): void;
}) {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const titleField = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const select = useRef<HTMLButtonElement>(null);
  const menu = useModelPopover(true, busy, 230);
  const id = useId();
  const label = session.title === 'New session' ? t('New session') : session.title;
  useEffect(() => {
    if (menu.open) menu.panel.current?.querySelector('button')?.focus();
  }, [menu.open, menu.panel]);
  useEffect(() => {
    if (renaming) titleField.current?.select();
  }, [renaming]);
  const finishRename = (save: boolean) => {
    if (!editing.current) return;
    editing.current = false;
    if (save && title.trim() && title.trim() !== session.title)
      send({ type: 'RenameConversation', conversationId: session.id, title: title.trim() });
    setRenaming(false);
    requestAnimationFrame(() => select.current?.focus({ preventScroll: true }));
  };
  const remove = () => {
    menu.hide();
    onRemoved();
    send({
      type: archived ? 'RestoreConversation' : 'ArchiveConversation',
      conversationId: session.id,
    });
  };
  return (
    <div className={`session-item ${active && !archived ? 'active' : ''}`}>
      {renaming ? (
        <input
          ref={titleField}
          autoFocus
          aria-label={t('Session title')}
          value={title}
          maxLength={72}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => finishRename(true)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              finishRename(event.key === 'Enter');
            }
          }}
        />
      ) : (
        <>
          <button
            className="session-select"
            ref={select}
            disabled={busy}
            aria-current={active && !archived ? 'page' : undefined}
            aria-label={archived ? t('Restore {name}', { name: label }) : undefined}
            title={archived ? t('Restore {name}', { name: label }) : label}
            onClick={() =>
              archived ? remove() : send({ type: 'SelectConversation', conversationId: session.id })
            }
          >
            <Icon name={archived ? 'restore' : session.pinned ? 'pin' : 'chat'} size={14} />
            <span>{label}</span>
          </button>
          <div ref={menu.root} className="session-menu">
            <button
              className="rename-session"
              ref={(node) => {
                menu.trigger.current = node;
              }}
              title={t('Session actions')}
              aria-label={t('Actions for {name}', { name: label })}
              aria-haspopup="menu"
              aria-expanded={menu.open}
              aria-controls={id}
              disabled={busy}
              onClick={() => (menu.open ? menu.hide() : menu.show())}
            >
              <Icon name="more" size={14} />
            </button>
            <div
              id={id}
              ref={menu.panel}
              popover="auto"
              role="menu"
              aria-label={t('Session actions')}
              className="conversation-actions"
              style={menu.position}
              onKeyDown={(event) => menuKeydown(event, () => menu.hide(true))}
            >
              {archived ? (
                <button role="menuitem" onClick={remove}>
                  <Icon name="restore" size={15} />
                  <span>{t('Restore session')}</span>
                </button>
              ) : (
                <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      menu.hide();
                      onRemoved();
                      send({
                        type: 'PinConversation',
                        conversationId: session.id,
                        pinned: !session.pinned,
                      });
                    }}
                  >
                    <Icon name="pin" size={15} />
                    <span>{t(session.pinned ? 'Unpin session' : 'Pin session')}</span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      menu.hide();
                      editing.current = true;
                      setTitle(session.title);
                      setRenaming(true);
                    }}
                  >
                    <Icon name="pencil" size={15} />
                    <span>{t('Rename session')}</span>
                  </button>
                  <button role="menuitem" onClick={remove}>
                    <Icon name="archive" size={15} />
                    <span>{t('Archive session')}</span>
                  </button>
                  <small>{t('Archived sessions can be restored at any time.')}</small>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
