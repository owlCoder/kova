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
}: {
  snapshot: SessionSnapshot | null;
  busy: boolean;
  onClose(): void;
  onPreferences(): void;
  onTogglePanel(): void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const commands = [
    {
      id: 'new',
      label: 'New session',
      icon: 'plus' as const,
      shortcut: '⌘ N',
      disabled: busy,
      run: () => send({ type: 'NewConversation' }),
    },
    ...(isDesktop
      ? [
          {
            id: 'project',
            label: 'Open project…',
            icon: 'folderOpen' as const,
            shortcut: '⌘ O',
            disabled: busy,
            run: () => send({ type: 'OpenWorkspace' }),
          },
          {
            id: 'panel',
            label: 'Toggle project panel',
            icon: 'panelRight' as const,
            shortcut: '⌘ J',
            disabled: false,
            run: onTogglePanel,
          },
        ]
      : []),
    {
      id: 'provider',
      label: 'Configure AI provider',
      icon: 'sparkles' as const,
      shortcut: '',
      disabled: busy,
      run: () => (isDesktop ? onPreferences() : send({ type: 'OpenProviderSetup' })),
    },
    {
      id: 'settings',
      label: 'Open settings',
      icon: 'settings' as const,
      shortcut: '⌘ ,',
      disabled: false,
      run: () => (isDesktop ? onPreferences() : send({ type: 'OpenSettings' })),
    },
    ...(snapshot?.activeRunId
      ? [
          {
            id: 'stop',
            label: 'Stop active task',
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
        aria-label="Command palette"
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
            aria-label="Search commands and sessions"
            placeholder="Search commands or sessions…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
          />
          <button onClick={onClose}>
            <kbd>esc</kbd>
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
          {!commands.length && <p>No matching commands or sessions.</p>}
        </div>
        <div className="palette-footer">
          <span>↑ ↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </section>
    </div>
  );
}
