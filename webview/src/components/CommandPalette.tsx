import { useI18n } from '../i18n/I18n.js';
import { useEffect, useRef, useState } from 'react';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { isDesktop, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { modifierKey } from './modifierKey.js';
import { useDialogFocus } from './useDialogFocus.js';

export function CommandPalette({
  snapshot,
  busy,
  onClose,
  onPreferences,
  onTogglePanel,
  onToggleTerminal,
  onFind,
}: {
  snapshot: SessionSnapshot | null;
  busy: boolean;
  onClose(): void;
  onPreferences(): void;
  onTogglePanel(): void;
  onToggleTerminal(): void;
  onFind(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose);
  const mod = modifierKey(snapshot?.desktop?.platform);
  const commands = [
    {
      id: 'find-conversation',
      label: t('Find in conversation'),
      icon: 'search' as const,
      shortcut: `${mod} F`,
      disabled: !snapshot?.messages.length,
      run: onFind,
    },
    {
      id: 'export-conversation',
      label: t('Export Markdown…'),
      icon: 'download' as const,
      shortcut: '',
      disabled: busy || !snapshot?.messages.length,
      run: () =>
        snapshot &&
        send({
          type: 'ExportConversation',
          conversationId: snapshot.conversationId,
          action: 'save',
        }),
    },
    {
      id: 'new',
      label: t('New session'),
      icon: 'plus' as const,
      shortcut: `${mod} N`,
      disabled: busy,
      run: () => send({ type: 'NewConversation' }),
    },
    ...(isDesktop
      ? [
          {
            id: 'project',
            label: t('Open project…'),
            icon: 'folderOpen' as const,
            shortcut: `${mod} O`,
            disabled: busy,
            run: () => send({ type: 'OpenWorkspace' }),
          },
          {
            id: 'terminal',
            label: t('Toggle terminal'),
            icon: 'terminal' as const,
            shortcut: `${mod} ⇧ T`,
            disabled: false,
            run: onToggleTerminal,
          },
          {
            id: 'panel',
            label: t('Toggle project panel'),
            icon: 'panelRight' as const,
            shortcut: `${mod} J`,
            disabled: false,
            run: onTogglePanel,
          },
        ]
      : []),
    {
      id: 'provider',
      label: t('Configure AI provider'),
      icon: 'sparkles' as const,
      shortcut: '',
      disabled: busy,
      run: () => (isDesktop ? onPreferences() : send({ type: 'OpenProviderSetup' })),
    },
    {
      id: 'settings',
      label: t('Open settings'),
      icon: 'settings' as const,
      shortcut: `${mod} ,`,
      disabled: false,
      run: () => (isDesktop ? onPreferences() : send({ type: 'OpenSettings' })),
    },
    ...(snapshot?.activeRunId
      ? [
          {
            id: 'stop',
            label: t('Stop active task'),
            icon: 'stop' as const,
            shortcut: '',
            disabled: false,
            run: () => send({ type: 'CancelRun', runId: snapshot.activeRunId! }),
          },
        ]
      : []),
    ...(snapshot?.desktop?.sessions ?? []).map((session) => ({
      id: session.id,
      label: session.title,
      icon: session.pinned ? ('pin' as const) : ('chat' as const),
      shortcut: t('Session'),
      disabled: busy,
      run: () => send({ type: 'SelectConversation', conversationId: session.id }),
    })),
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
  const active = commands[selected]?.disabled
    ? commands.findIndex((command) => !command.disabled)
    : Math.min(selected, commands.length - 1);
  useEffect(() => {
    dialog.current
      ?.querySelector(`[data-command-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const choose = (index: number) => {
    const command = commands[index];
    if (command && !command.disabled) {
      command.run();
      onClose();
    }
  };
  return (
    <div
      className="modal-backdrop palette-backdrop"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="command-palette"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('Command palette')}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            for (let step = 1; step <= commands.length; step++) {
              const index = (active + direction * step + commands.length) % commands.length;
              if (!commands[index]?.disabled) {
                setSelected(index);
                break;
              }
            }
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose(active);
          }
        }}
      >
        <div className="palette-search">
          <Icon name="search" size={19} />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={active >= 0 ? `command-${commands[active]!.id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('Search commands and sessions')}
            placeholder={t('Search commands or sessions…')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
          />
          <button onClick={onClose}>
            <kbd>{t('esc')}</kbd>
          </button>
        </div>
        <div
          className="palette-results"
          id="command-results"
          role="listbox"
          aria-label={t('Commands & sessions')}
        >
          {commands.map((command, i) => (
            <button
              className={active === i ? 'selected' : ''}
              id={`command-${command.id}`}
              role="option"
              aria-selected={active === i}
              tabIndex={-1}
              data-command-index={i}
              disabled={command.disabled}
              key={command.id}
              onMouseEnter={() => setSelected(i)}
              onClick={() => choose(i)}
            >
              <Icon name={command.icon} size={16} />
              <span>{command.label}</span>
              <kbd>{command.shortcut}</kbd>
            </button>
          ))}
          {!commands.length && <p>{t('No matching commands or sessions.')}</p>}
        </div>
        <div className="palette-footer">
          <span>{t('↑ ↓ navigate')}</span>
          <span>{t('↵ select')}</span>
          <span>{t('esc close')}</span>
        </div>
      </section>
    </div>
  );
}
