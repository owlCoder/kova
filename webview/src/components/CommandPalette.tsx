import { useI18n } from '../i18n/I18n.js';
import { useEffect, useRef, useState } from 'react';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { isDesktop, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

export function CommandPalette({
  snapshot,
  busy,
  onClose,
  onPreferences,
  onTogglePanel,
  onToggleTerminal,
}: {
  snapshot: SessionSnapshot | null;
  busy: boolean;
  onClose(): void;
  onPreferences(): void;
  onTogglePanel(): void;
  onToggleTerminal(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const mod =
    snapshot?.desktop?.platform === 'win32' || snapshot?.desktop?.platform === 'linux'
      ? 'Ctrl'
      : '⌘';
  const commands = [
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
      icon: 'chat' as const,
      shortcut: 'Session',
      disabled: busy,
      run: () => send({ type: 'SelectConversation', conversationId: session.id }),
    })),
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    input.current?.focus();
  }, []);
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
        role="dialog"
        aria-modal="true"
        aria-label={t('Command palette')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((index) => Math.min(commands.length - 1, index + 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((index) => Math.max(0, index - 1));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose(selected);
          }
        }}
      >
        <div className="palette-search">
          <Icon name="search" size={19} />
          <input
            ref={input}
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
        <div className="palette-results">
          {commands.map((command, i) => (
            <button
              className={selected === i ? 'selected' : ''}
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
