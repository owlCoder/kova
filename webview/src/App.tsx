import { useCallback, useEffect, useRef, useState } from 'react';
import logo from '../../assets/logo.png';
import { ChatFooter } from './components/ChatFooter.js';
import { Icon } from './components/Icon.js';
import { Onboarding } from './components/Onboarding.js';
import { Welcome } from './components/Welcome.js';
import { Conversation } from './components/Conversation.js';
import { CommandPalette } from './components/CommandPalette.js';
import { Sidebar } from './desktop/Sidebar.js';
import { Inspector } from './desktop/Inspector.js';
import { ProviderPreferences } from './desktop/ProviderPreferences.js';
import { isDesktop, send } from './messaging/bridge.js';
import { useChat } from './state/useChat.js';
import { useHostResources } from './state/useHostResources.js';

export function App() {
  const chat = useChat();
  const { snapshot, busy } = chat;
  const resources = useHostResources(snapshot);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const showSetup = Boolean(
    snapshot &&
    !snapshot.activeRunId &&
    (setupOpen || (!snapshot.setupCompleted && !setupDismissed)),
  );
  const title =
    snapshot?.desktop?.sessions.find((session) => session.id === snapshot.conversationId)?.title ??
    'New session';
  const preferences = useCallback(() => {
    if (isDesktop) resources.setPreferences(true);
    else send({ type: 'OpenSettings' });
  }, [resources.setPreferences]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeInspector = useCallback(
    () => resources.setInspectorOpen(false),
    [resources.setInspectorOpen],
  );
  const closePreview = useCallback(() => resources.setPreview(null), [resources.setPreview]);
  useEffect(() => {
    if (!showSetup && nearBottom.current && scroller.current) {
      const frame = requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [snapshot?.messages, chat.activities, showSetup]);
  useEffect(() => {
    if (!showSetup) input.current?.focus();
  }, [showSetup]);
  useEffect(() => {
    if (!isDesktop) return;
    const theme = snapshot?.desktop?.theme ?? 'dark';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [snapshot?.desktop?.theme]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === ',') {
        event.preventDefault();
        preferences();
      }
      if (isDesktop && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
      if (isDesktop && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        resources.setInspectorOpen(true);
        resources.setInspectorTab('files');
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="Search project files"]')?.focus(),
        );
      }
      if (isDesktop && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        resources.setInspectorOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [preferences, resources.setInspectorOpen, resources.setInspectorTab]);
  const closeSetup = () => {
    setSetupOpen(false);
    setSetupDismissed(true);
  };
  return (
    <div className={isDesktop ? 'desktop-frame' : 'extension-frame'}>
      {isDesktop && (
        <div className="native-titlebar">
          <span>KOVA</span>
          <span className="native-titlebar-caption">A workspace for what’s next</span>
        </div>
      )}
      <main
        className={`workspace ${isDesktop ? 'desktop-workspace' : 'extension-workspace'}`}
        inert={resources.preferences || paletteOpen ? true : undefined}
      >
        {isDesktop && sidebarOpen && (
          <Sidebar
            desktop={snapshot?.desktop}
            conversationId={snapshot?.conversationId}
            busy={busy}
            onSearch={openPalette}
            onPreferences={preferences}
          />
        )}
        <div className="workspace-main">
          <header className="workspace-header">
            <div className="workspace-breadcrumb">
              {isDesktop ? (
                <>
                  <button
                    className="icon-button"
                    aria-label="Toggle sidebar"
                    title="Toggle sidebar"
                    onClick={() => setSidebarOpen((open) => !open)}
                  >
                    <Icon name="panelLeft" size={16} />
                  </button>
                  <Icon name="folder" size={14} />
                  <span
                    className="breadcrumb-project"
                    title={snapshot?.desktop?.workspacePath ?? undefined}
                  >
                    {snapshot?.desktop?.workspaceName ?? 'Kova'}
                  </span>
                  <span className="breadcrumb-divider">/</span>
                  <span className="breadcrumb-session" title={title}>
                    {title}
                  </span>
                </>
              ) : (
                <>
                  <img className="brand-logo" src={logo} alt="" />
                  <strong>Kova</strong>
                  <span className="extension-caption">Coding workspace</span>
                </>
              )}
            </div>
            <div className="header-actions">
              <button
                className="setup-toggle"
                disabled={busy}
                onClick={() => {
                  setSetupOpen((open) => !open);
                  if (scroller.current) scroller.current.scrollTop = 0;
                }}
              >
                Setup
              </button>
              {!isDesktop && (
                <button
                  className="icon-button"
                  title="New conversation"
                  aria-label="New conversation"
                  disabled={busy}
                  onClick={() => send({ type: 'NewConversation' })}
                >
                  <Icon name="plus" />
                </button>
              )}
              <button
                className="icon-button"
                title="Commands and sessions"
                aria-label="Commands and sessions"
                onClick={() => setPaletteOpen(true)}
              >
                <Icon name="command" size={16} />
              </button>
              {isDesktop ? (
                <button
                  className={`icon-button ${resources.inspectorOpen ? 'active' : ''}`}
                  title="Toggle project panel"
                  aria-label="Toggle project panel"
                  onClick={() => resources.setInspectorOpen((open) => !open)}
                >
                  <Icon name="panelRight" size={16} />
                </button>
              ) : (
                <button
                  className="icon-button"
                  title="Settings"
                  aria-label="Settings"
                  onClick={preferences}
                >
                  <Icon name="settings" size={16} />
                </button>
              )}
            </div>
          </header>
          <div
            className="conversation"
            ref={scroller}
            onScroll={() => {
              const view = scroller.current;
              if (view)
                nearBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < 120;
            }}
          >
            {showSetup && snapshot ? (
              <Onboarding
                snapshot={snapshot}
                mode={chat.mode}
                onModeChange={chat.setMode}
                onClose={closeSetup}
              />
            ) : !snapshot?.messages.length ? (
              <Welcome
                snapshot={snapshot}
                onChoose={(prompt) => {
                  chat.setPrompt(prompt);
                  input.current?.focus();
                }}
              />
            ) : null}
            {!showSetup && snapshot && (
              <Conversation
                snapshot={snapshot}
                thinking={chat.thinking}
                activities={chat.activities}
                busy={busy}
              />
            )}
          </div>
          {!showSetup && (
            <ChatFooter
              snapshot={snapshot}
              busy={busy}
              error={chat.error}
              prompt={chat.prompt}
              model={chat.model}
              mode={chat.mode}
              inputRef={input}
              onDismissError={chat.dismissError}
              onPromptChange={chat.setPrompt}
              onSubmit={chat.submit}
              onModelChange={chat.setModel}
              onModeChange={chat.setMode}
            />
          )}
          {isDesktop && (
            <div className="workspace-status">
              <span>
                <Icon name="shield" size={12} />
                {snapshot?.desktop?.workspacePath
                  ? 'Project boundaries enforced'
                  : 'Open a project to enable tools'}
              </span>
              <span>
                <span
                  className={`status-dot ${snapshot?.providerStatus === 'Available' ? 'online' : ''}`}
                />
                {busy
                  ? 'Working'
                  : snapshot?.providerStatus === 'Available'
                    ? 'Ready'
                    : 'Not connected'}
              </span>
            </div>
          )}
        </div>
        {isDesktop && resources.inspectorOpen && (
          <Inspector
            key={snapshot?.desktop?.workspacePath ?? 'empty'}
            files={resources.files}
            search={resources.search}
            busy={busy}
            preview={resources.preview}
            activities={chat.activities}
            tab={resources.inspectorTab}
            onTab={resources.setInspectorTab}
            onClose={closeInspector}
            onClosePreview={closePreview}
            hasWorkspace={Boolean(snapshot?.desktop?.workspacePath)}
          />
        )}
      </main>
      {resources.preferences && snapshot?.desktop && (
        <ProviderPreferences
          desktop={snapshot.desktop}
          busy={busy}
          onClose={() => resources.setPreferences(false)}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          snapshot={snapshot}
          busy={busy}
          onClose={() => setPaletteOpen(false)}
          onPreferences={preferences}
          onTogglePanel={() => resources.setInspectorOpen((open) => !open)}
        />
      )}
      {resources.notice && (
        <div className="toast" role="status">
          <Icon name="help" size={16} />
          <span>{resources.notice}</span>
          <button aria-label="Dismiss notification" onClick={() => resources.setNotice('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
