import { useI18n } from '../i18n/I18n.js';
import { memo, useState } from 'react';
import logo from '../../../assets/logo.png';
import type { DesktopState } from '../../../packages/protocol/src/DesktopState.js';
import { send } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';

export const Sidebar = memo(function Sidebar({
  desktop,
  conversationId,
  busy,
  onSearch,
  onPreferences,
}: {
  desktop: DesktopState | undefined;
  conversationId: string | undefined;
  busy: boolean;
  onSearch(): void;
  onPreferences(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const mod = desktop?.platform === 'darwin' ? '⌘' : t('Ctrl');
  const sessions =
    desktop?.sessions.filter(
      (session) =>
        session.workspaceId === (desktop.workspacePath ?? '') &&
        session.title.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const rename = () => {
    if (renaming && title.trim())
      send({ type: 'RenameConversation', conversationId: renaming, title });
    setRenaming(null);
  };
  return (
    <aside className="sidebar-nav">
      <div className="sidebar-brand">
        <img src={logo} alt="" />
        <strong>
          kova<span>DESKTOP</span>
        </strong>
        <button
          className="icon-button"
          title={t('Command palette')}
          aria-label={t('Command palette')}
          onClick={onSearch}
        >
          <Icon name="command" size={15} />
        </button>
      </div>
      <button
        className="new-session"
        disabled={busy}
        onClick={() => send({ type: 'NewConversation' })}
      >
        <Icon name="plus" size={17} />
        {t('New session')}
        <kbd>
          {mod}
          {t('N')}
        </kbd>
      </button>
      <button
        className="sidebar-search"
        onClick={onSearch}
        aria-label={t('Commands & sessions')}
        title={t('Commands & sessions')}
      >
        <Icon name="search" size={15} />
        <span>{t('Search…')}</span>
        <kbd>
          {mod}
          {t('K')}
        </kbd>
      </button>
      <div className="nav-section-heading">
        <span>{t('PROJECTS')}</span>
        <button
          title={t('Open project')}
          aria-label={t('Open project')}
          disabled={busy}
          onClick={() => send({ type: 'OpenWorkspace' })}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
      <div className="project-list">
        {desktop?.workspacePath && (
          <button
            className="project-row selected"
            title={desktop.workspacePath}
            onClick={() => send({ type: 'ListWorkspaceFiles', path: '.' })}
          >
            <span className="project-monogram">
              {desktop.workspaceName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              {desktop.workspaceName}
              <small>{t('Current workspace')}</small>
            </span>
            <span className="status-dot online" />
          </button>
        )}
        {desktop?.recentWorkspaces
          .filter((path) => path !== desktop.workspacePath)
          .slice(0, 4)
          .map((path) => (
            <button
              key={path}
              className="project-row"
              title={path}
              disabled={busy}
              onClick={() => send({ type: 'SelectWorkspace', path })}
            >
              <Icon name="folder" size={16} />
              <span>{path.split(/[\\/]/).pop()}</span>
            </button>
          ))}
        {!desktop?.workspacePath && (
          <button
            className="project-row empty-project"
            disabled={busy}
            onClick={() => send({ type: 'OpenWorkspace' })}
          >
            <Icon name="folderOpen" size={16} />
            <span>{t('Open your first project')}</span>
          </button>
        )}
      </div>
      <div className="nav-section-heading">
        <span>{t('SESSIONS')}</span>
        <span>{sessions.length}</span>
      </div>
      <label className="session-filter">
        <Icon name="search" size={12} />
        <input
          aria-label={t('Filter sessions')}
          placeholder={t('Filter sessions…')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="session-list">
        {sessions.map((session) => (
          <div
            className={`session-item ${session.id === conversationId ? 'active' : ''}`}
            key={session.id}
          >
            {renaming === session.id ? (
              <input
                aria-label={t('Session title')}
                autoFocus
                value={title}
                maxLength={72}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={rename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') rename();
                  if (event.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <>
                <button
                  className="session-select"
                  aria-current={session.id === conversationId ? 'page' : undefined}
                  disabled={busy}
                  title={session.title}
                  onClick={() => send({ type: 'SelectConversation', conversationId: session.id })}
                >
                  <Icon name="chat" size={14} />
                  <span>{session.title === 'New session' ? t('New session') : session.title}</span>
                </button>
                <button
                  className="rename-session"
                  title={t('Rename session')}
                  aria-label={t('Rename {name}', { name: session.title })}
                  disabled={busy}
                  onClick={() => {
                    setRenaming(session.id);
                    setTitle(session.title);
                  }}
                >
                  <Icon name="pencil" size={12} />
                </button>
              </>
            )}
          </div>
        ))}
        {!sessions.length && (
          <div className="empty-sessions">
            <Icon name="chat" size={22} />
            <p>{query ? t('No matching sessions') : t('Your sessions will appear here')}</p>
            <small>{t('Conversations stay on this device.')}</small>
          </div>
        )}
      </div>
      <div className="sidebar-bottom">
        <button onClick={onPreferences}>
          <Icon name="settings" size={16} />
          {t('Settings')}
          <span className="key-hint">{mod} ,</span>
        </button>
        <div className="local-profile">
          <span className="profile-icon">
            <Icon name="terminal" size={15} />
          </span>
          <span>
            {t('Local workspace')}
            <small>{t('Everything in your control')}</small>
          </span>
          <span className="status-dot online" />
        </div>
      </div>
    </aside>
  );
});
