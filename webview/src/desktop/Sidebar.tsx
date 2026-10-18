import { useI18n } from '../i18n/I18n.js';
import { memo, useRef, useState } from 'react';
import { SessionRow } from './SessionRow.js';
import { BrandMark } from '../components/BrandMark.js';
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
  const [archived, setArchived] = useState(false);
  const filter = useRef<HTMLInputElement>(null);
  const mod = desktop?.platform === 'darwin' ? '⌘' : t('Ctrl');
  const source = archived ? desktop?.archivedSessions : desktop?.sessions;
  const sessions =
    source?.filter(
      (session) =>
        session.workspaceId === (desktop?.workspacePath ?? '') &&
        session.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ) ?? [];
  const pinned = sessions.filter((session) => !archived && session.pinned);
  const recent = sessions.filter((session) => archived || !session.pinned);
  const focusFilter = () => filter.current?.focus({ preventScroll: true });
  return (
    <aside className="sidebar-nav">
      <div className="sidebar-brand">
        <BrandMark />
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
        <span>{source?.length ?? 0}</span>
      </div>
      <div className="session-views" role="group" aria-label={t('Session view')}>
        <button aria-pressed={!archived} onClick={() => setArchived(false)}>
          <Icon name="clock" size={13} />
          {t('Recent')}
        </button>
        <button aria-pressed={archived} onClick={() => setArchived(true)}>
          <Icon name="archive" size={13} />
          {t('Archived')}
        </button>
      </div>
      <label className="session-filter">
        <Icon name="search" size={12} />
        <input
          ref={filter}
          aria-label={t('Filter sessions')}
          maxLength={128}
          placeholder={t('Filter sessions…')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="session-list">
        {!!pinned.length && <div className="session-group-label">{t('Pinned')}</div>}
        {pinned.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            archived={false}
            active={session.id === conversationId}
            busy={busy}
            onRemoved={focusFilter}
          />
        ))}
        {!!pinned.length && !!recent.length && (
          <div className="session-group-label">{t('Recent')}</div>
        )}
        {recent.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            archived={archived}
            active={session.id === conversationId}
            busy={busy}
            onRemoved={focusFilter}
          />
        ))}
        {!sessions.length && (
          <div className="empty-sessions">
            <Icon name={archived ? 'archive' : 'chat'} size={22} />
            <p>
              {query
                ? t('No matching sessions')
                : t(archived ? 'No archived sessions' : 'Your sessions will appear here')}
            </p>
            <small>
              {t(
                archived
                  ? 'Archived sessions can be restored at any time.'
                  : 'Conversations stay on this device.',
              )}
            </small>
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
