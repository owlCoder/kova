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
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const mod = desktop?.platform === 'darwin' ? '⌘' : 'Ctrl';
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
          title="Command palette"
          aria-label="Command palette"
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
        New session<kbd>{mod} N</kbd>
      </button>
      <button className="sidebar-search" onClick={onSearch}>
        <Icon name="search" size={15} />
        <span>Commands & sessions</span>
        <kbd>{mod} K</kbd>
      </button>
      <div className="nav-section-heading">
        <span>PROJECTS</span>
        <button
          title="Open project"
          aria-label="Open project"
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
              <small>Current workspace</small>
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
            <span>Open your first project</span>
          </button>
        )}
      </div>
      <div className="nav-section-heading">
        <span>SESSIONS</span>
        <span>{sessions.length}</span>
      </div>
      <label className="session-filter">
        <Icon name="search" size={12} />
        <input
          aria-label="Filter sessions"
          placeholder="Filter sessions…"
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
                aria-label="Session title"
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
                  disabled={busy}
                  title={session.title}
                  onClick={() => send({ type: 'SelectConversation', conversationId: session.id })}
                >
                  <Icon name="chat" size={14} />
                  <span>{session.title}</span>
                </button>
                <button
                  className="rename-session"
                  title="Rename session"
                  aria-label={`Rename ${session.title}`}
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
            <p>{query ? 'No matching sessions' : 'Your sessions will appear here'}</p>
            <small>Conversations stay on this device.</small>
          </div>
        )}
      </div>
      <div className="sidebar-bottom">
        <button onClick={onPreferences}>
          <Icon name="settings" size={16} />
          Settings<span className="key-hint">{mod} ,</span>
        </button>
        <div className="local-profile">
          <span className="profile-icon">
            <Icon name="terminal" size={15} />
          </span>
          <span>
            Local workspace<small>Everything in your control</small>
          </span>
          <span className="status-dot online" />
        </div>
      </div>
    </aside>
  );
});
