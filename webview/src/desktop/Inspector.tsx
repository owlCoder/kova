import { memo, useEffect, useState } from 'react';
import type { HostMessage } from '../../../packages/protocol/src/HostMessage.js';
import { send } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';

type Preview = Extract<HostMessage, { type: 'FilePreview' | 'DiffPreview' }>;
export const Inspector = memo(function Inspector({
  files,
  search,
  busy,
  preview,
  activities,
  tab,
  onTab,
  onClose,
  onClosePreview,
  hasWorkspace,
}: {
  files: Extract<HostMessage, { type: 'WorkspaceFiles' }> | null;
  search: Extract<HostMessage, { type: 'WorkspaceSearchResults' }> | null;
  busy: boolean;
  preview: Preview | null;
  activities: readonly { id: number; text: string; error: boolean }[];
  tab: 'files' | 'changes' | 'activity';
  onTab(tab: 'files' | 'changes' | 'activity'): void;
  onClose(): void;
  onClosePreview(): void;
  hasWorkspace: boolean;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!hasWorkspace || query.trim().length < 2) return;
    const timer = setTimeout(
      () => send({ type: 'SearchWorkspaceFiles', query: query.trim() }),
      180,
    );
    return () => clearTimeout(timer);
  }, [query, hasWorkspace]);
  const searching = query.trim().length >= 2;
  const entries = searching
    ? search?.query === query.trim()
      ? search.entries
      : []
    : files?.entries;
  const chooseTab = (next: typeof tab) => {
    onTab(next);
    if (next === 'changes' && hasWorkspace) send({ type: 'WorkspaceDiff' });
  };
  const directory = files?.path ?? '.';
  const parent = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '.';
  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        {(['files', 'changes', 'activity'] as const).map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            onClick={() => chooseTab(item)}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
        <button
          className="inspector-close icon-button"
          title="Close panel"
          aria-label="Close panel"
          onClick={onClose}
        >
          <Icon name="panelRight" size={15} />
        </button>
      </div>
      {tab === 'files' && (
        <>
          <label className="file-search">
            <Icon name="search" size={13} />
            <input
              aria-label="Search project files"
              placeholder="Find files…"
              value={query}
              disabled={!hasWorkspace}
              maxLength={128}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="Clear file search" onClick={() => setQuery('')}>
                <Icon name="close" size={12} />
              </button>
            )}
          </label>
          <div className="file-path">
            <button
              className="icon-button"
              disabled={directory === '.'}
              title="Parent directory"
              aria-label="Parent directory"
              onClick={() => send({ type: 'ListWorkspaceFiles', path: parent })}
            >
              <Icon name="upLeft" size={13} />
            </button>
            <span>
              {searching ? 'Search results' : directory === '.' ? 'Project files' : directory}
            </span>
            <button
              className="icon-button"
              title="Refresh files"
              aria-label="Refresh files"
              disabled={!hasWorkspace}
              onClick={() => send({ type: 'ListWorkspaceFiles', path: directory })}
            >
              <Icon name="refresh" size={13} />
            </button>
          </div>
          <div className="file-tree">
            {entries?.map((entry) => (
              <button
                key={entry.path}
                className={
                  preview?.type === 'FilePreview' && preview.file.path === entry.path
                    ? 'selected'
                    : ''
                }
                title={entry.path}
                onClick={() =>
                  send(
                    entry.kind === 'Directory'
                      ? { type: 'ListWorkspaceFiles', path: entry.path }
                      : { type: 'OpenWorkspaceFile', path: entry.path },
                  )
                }
              >
                <Icon name={entry.kind === 'Directory' ? 'folder' : 'file'} size={14} />
                <span>
                  {entry.name}
                  {searching && <small>{entry.path}</small>}
                </span>
                {entry.kind === 'Directory' && <Icon name="chevron" size={12} />}
              </button>
            ))}
            {searching && !entries?.length && (
              <div className="panel-empty">
                <Icon name="search" size={27} />
                <p>{search?.query === query.trim() ? 'No matching files' : 'Searching…'}</p>
              </div>
            )}
            {searching && search?.query === query.trim() && search.truncated && (
              <small className="preview-limit">
                Search limit reached. Use a more specific path.
              </small>
            )}
            {!searching && !files && (
              <div className="panel-empty">
                <Icon name="folderOpen" size={27} />
                <p>{hasWorkspace ? 'Loading project files…' : 'Open a project to explore files'}</p>
              </div>
            )}
          </div>
          {preview?.type === 'FilePreview' && (
            <section className="file-preview">
              <div className="preview-toolbar">
                <span title={preview.file.path}>{preview.file.path.split('/').pop()}</span>
                <button
                  title="Attach this file"
                  aria-label="Attach preview file"
                  disabled={busy}
                  onClick={() => send({ type: 'AddContext', source: 'CurrentFile' })}
                >
                  <Icon name="paperclip" size={13} />
                </button>
                <button
                  title="Close preview"
                  aria-label="Close file preview"
                  onClick={onClosePreview}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <div className="source-preview">
                <pre className="line-numbers" aria-hidden="true">
                  {Array.from(
                    { length: Math.min(2000, preview.file.content.split('\n').length) },
                    (_, i) => i + 1,
                  ).join('\n')}
                </pre>
                <pre>
                  <code>{preview.file.content.split('\n').slice(0, 2000).join('\n')}</code>
                </pre>
              </div>
              {preview.file.content.split('\n').length > 2000 && (
                <small className="preview-limit">Showing the first 2,000 lines.</small>
              )}
            </section>
          )}
        </>
      )}
      {tab === 'changes' && (
        <div className="diff-panel">
          {preview?.type === 'DiffPreview' ? (
            <>
              <div className="panel-section-label">{preview.title}</div>
              {preview.changes.map((change) => (
                <details className="diff-file" key={change.path} open>
                  <summary>
                    <Icon name="file" size={14} />
                    {change.path}
                  </summary>
                  <div className="diff-before">
                    <span>BEFORE</span>
                    <pre>{change.before || '(new file)'}</pre>
                  </div>
                  <div className="diff-after">
                    <span>AFTER</span>
                    <pre>{change.after}</pre>
                  </div>
                </details>
              ))}
              {preview.diff ? (
                <pre className="git-diff">
                  {preview.diff.split('\n').map((line, i) => (
                    <span
                      className={
                        line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : ''
                      }
                      key={i}
                    >
                      {line}
                      {'\n'}
                    </span>
                  ))}
                </pre>
              ) : (
                !preview.changes.length && (
                  <div className="panel-empty">
                    <Icon name="check" size={27} />
                    <p>No uncommitted changes</p>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="panel-empty">
              <Icon name="review" size={27} />
              <p>
                {hasWorkspace
                  ? 'Review your working tree changes'
                  : 'Open a Git project to review changes'}
              </p>
              {hasWorkspace && (
                <button onClick={() => send({ type: 'WorkspaceDiff' })}>Refresh changes</button>
              )}
            </div>
          )}
        </div>
      )}
      {tab === 'activity' && (
        <div className="inspector-activity">
          {activities.length ? (
            activities.map((item) => (
              <details className={`activity-row ${item.error ? 'error' : ''}`} key={item.id}>
                <summary>
                  <span className="activity-dot" />
                  {item.text.split('\n')[0]}
                </summary>
                <pre>{item.text.slice(item.text.indexOf('\n') + 1)}</pre>
              </details>
            ))
          ) : (
            <div className="panel-empty">
              <Icon name="terminal" size={27} />
              <p>Agent activity will appear here</p>
              <small>Tool calls, permissions and results.</small>
            </div>
          )}
        </div>
      )}
    </aside>
  );
});
