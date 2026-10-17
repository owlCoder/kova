import { useEffect, useState } from 'react';
import type { DesktopState } from '../../../packages/protocol/src/DesktopState.js';
import { send, subscribe } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';
import { useI18n } from '../i18n/I18n.js';

export function WindowTitlebar({
  desktop,
  terminalOpen,
  inert,
  onTerminal,
  onCommands,
}: {
  desktop: DesktopState | undefined;
  terminalOpen: boolean;
  inert: boolean;
  onTerminal(): void;
  onCommands(): void;
}) {
  const { t } = useI18n();
  const [windowState, setWindowState] = useState({
    focused: true,
    maximized: false,
    fullscreen: false,
  });
  useEffect(() => {
    const off = subscribe((message) => {
      if (message.type === 'WindowState') setWindowState(message);
    });
    send({ type: 'WindowAction', action: 'sync' });
    return off;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.windowFocused = String(windowState.focused);
    document.documentElement.dataset.windowMaximized = String(
      windowState.maximized || windowState.fullscreen,
    );
  }, [windowState]);
  return (
    <div
      className={`native-titlebar platform-${desktop?.platform ?? 'darwin'} ${windowState.fullscreen ? 'fullscreen' : ''}`}
      inert={inert}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest('button'))
          send({ type: 'WindowAction', action: 'maximize' });
      }}
    >
      <div className="titlebar-identity">
        <strong>KOVA</strong>
        <span>{t('Desktop workspace')}</span>
      </div>
      <button className="titlebar-project" onClick={onCommands} title={t('Commands & sessions')}>
        <Icon name="folder" size={14} />
        <span>{desktop?.workspacePath ? desktop.workspaceName : t('Open a project')}</span>
        <kbd>
          {desktop?.platform === 'darwin' ? '⌘' : t('Ctrl')}
          {' K'}
        </kbd>
      </button>
      <div className="titlebar-actions">
        <button
          aria-label={t('Toggle terminal')}
          title={t('Toggle terminal')}
          className={terminalOpen ? 'active' : ''}
          onClick={onTerminal}
        >
          <Icon name="terminal" size={17} />
        </button>
      </div>
    </div>
  );
}
