import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WorkspaceHeader } from './components/WorkspaceHeader.js';
import { ConversationSearch } from './components/ConversationSearch.js';
import { ChatFooter } from './components/ChatFooter.js';
import { Icon } from './components/Icon.js';
import { Onboarding } from './components/Onboarding.js';
import { Welcome } from './components/Welcome.js';
import { Conversation } from './components/Conversation.js';
import { CommandPalette } from './components/CommandPalette.js';

import { isDesktop, send } from './messaging/bridge.js';
import { WindowTitlebar } from './desktop/WindowTitlebar.js';
import { I18nProvider, useI18n } from './i18n/I18n.js';
import { subscribe } from './messaging/bridge.js';
import { useChat } from './state/useChat.js';
import { insertComposerText } from './state/insertComposerText.js';
import { useHostResources } from './state/useHostResources.js';

const ProviderPreferences = lazy(() =>
  import('./desktop/ProviderPreferences.js').then((module) => ({
    default: module.ProviderPreferences,
  })),
);
const TerminalPanel = lazy(() => import('./desktop/TerminalPanel.js'));
const Sidebar = lazy(() =>
  import('./desktop/Sidebar.js').then((module) => ({ default: module.Sidebar })),
);
const Inspector = lazy(() =>
  import('./desktop/Inspector.js').then((module) => ({ default: module.Inspector })),
);
export function App() {
  const chat = useChat();
  return (
    <I18nProvider language={chat.snapshot?.desktop?.language ?? chat.snapshot?.language ?? 'en'}>
      <Workspace chat={chat} />
    </I18nProvider>
  );
}
function Workspace({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { t } = useI18n();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalMounted, setTerminalMounted] = useState(false);
  const toggleTerminal = useCallback(() => {
    setTerminalMounted(true);
    setTerminalOpen((open) => !open);
  }, []);
  const hideTerminal = useCallback(() => setTerminalOpen(false), []);
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'ToggleTerminal') toggleTerminal();
      }),
    [toggleTerminal],
  );
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--text-scale',
      (chat.snapshot?.desktop?.textSize ?? chat.snapshot?.textSize) === 'larger'
        ? '1.24'
        : (chat.snapshot?.desktop?.textSize ?? chat.snapshot?.textSize) === 'large'
          ? '1.12'
          : '1',
    );
  }, [chat.snapshot?.desktop?.textSize, chat.snapshot?.textSize]);
  const { snapshot, busy } = chat;
  const resources = useHostResources(snapshot);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const openFind = useCallback(() => {
    setSetupOpen(false);
    setSetupDismissed(true);
    setFindOpen(true);
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('.conversation-search input')?.focus(),
    );
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLatest, setShowLatest] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const insertPrompt = useCallback(
    (text: string) => {
      const field = input.current;
      if (!field || field.disabled) return;
      const next = insertComposerText(field.value, text, field.selectionEnd);
      if (!next) {
        resources.setNotice('This prompt would exceed the 16,000 character draft limit.');
        field.focus({ preventScroll: true });
        return;
      }
      chat.setPrompt(next.text);
      requestAnimationFrame(() => {
        field.focus({ preventScroll: true });
        field.setSelectionRange(next.caret, next.caret);
      });
    },
    [chat.setPrompt, resources.setNotice],
  );
  const nearBottom = useRef(true);
  const showSetup = Boolean(
    snapshot &&
    !snapshot.activeRunId &&
    (setupOpen || (!snapshot.setupCompleted && !setupDismissed)),
  );
  const title =
    snapshot?.desktop?.sessions.find((session) => session.id === snapshot.conversationId)?.title ??
    t('New session');
  const preferences = useCallback(() => {
    if (isDesktop) {
      resources.setPreferencesTab('provider');
      resources.setPreferences(true);
    } else send({ type: 'OpenSettings' });
  }, [resources.setPreferences, resources.setPreferencesTab]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeInspector = useCallback(
    () => resources.setInspectorOpen(false),
    [resources.setInspectorOpen],
  );
  const closePreview = useCallback(() => resources.setPreview(null), [resources.setPreview]);
  useLayoutEffect(() => {
    nearBottom.current = true;
    setShowLatest(false);
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [snapshot?.conversationId]);
  useLayoutEffect(() => {
    if (
      !showSetup &&
      !findOpen &&
      snapshot?.messages.length &&
      nearBottom.current &&
      scroller.current
    ) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [snapshot?.messages, chat.activities, showSetup, findOpen]);
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
      if (resources.preferences) return;
      if (paletteOpen) {
        if (event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setPaletteOpen(false);
        }
        return;
      }
      if (
        isDesktop &&
        ((event.shiftKey && event.code === 'KeyT') || (event.ctrlKey && event.code === 'Backquote'))
      ) {
        event.preventDefault();
        toggleTerminal();
      }
      if (
        event.target instanceof Element &&
        event.target.closest('.xterm') &&
        event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      )
        return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (
        event.key.toLowerCase() === 'f' &&
        snapshot?.messages.length &&
        !showSetup &&
        !(event.target instanceof Element && event.target.closest('.xterm'))
      ) {
        event.preventDefault();
        openFind();
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
          document.querySelector<HTMLInputElement>('[data-file-search]')?.focus(),
        );
      }
      if (isDesktop && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        resources.setInspectorOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [
    preferences,
    resources.preferences,
    paletteOpen,
    resources.setInspectorOpen,
    resources.setInspectorTab,
    toggleTerminal,
    openFind,
    snapshot?.messages.length,
    showSetup,
  ]);
  const closeSetup = () => {
    setSetupOpen(false);
    setSetupDismissed(true);
  };
  return (
    <div className={isDesktop ? 'desktop-frame' : 'extension-frame'}>
      {isDesktop && (
        <WindowTitlebar
          desktop={snapshot?.desktop}
          terminalOpen={terminalOpen}
          inert={resources.preferences || paletteOpen}
          onTerminal={toggleTerminal}
          onCommands={openPalette}
        />
      )}
      <main
        className={`workspace ${isDesktop ? 'desktop-workspace' : 'extension-workspace'}`}
        inert={resources.preferences || paletteOpen ? true : undefined}
      >
        {isDesktop && sidebarOpen && (
          <Suspense fallback={<aside className="sidebar-nav" aria-busy="true" />}>
            <Sidebar
              desktop={snapshot?.desktop}
              conversationId={snapshot?.conversationId}
              busy={busy}
              onSearch={openPalette}
              onPreferences={preferences}
            />
          </Suspense>
        )}
        <div className="workspace-main">
          <WorkspaceHeader
            desktop={snapshot?.desktop}
            title={title}
            busy={busy}
            inspectorOpen={resources.inspectorOpen}
            conversationId={snapshot?.conversationId}
            hasMessages={Boolean(snapshot?.messages.length) && !showSetup}
            onSidebar={() => setSidebarOpen((open) => !open)}
            onSetup={() => {
              setSetupOpen((open) => !open);
              if (scroller.current) scroller.current.scrollTop = 0;
            }}
            onPalette={openPalette}
            onInspector={() => resources.setInspectorOpen((open) => !open)}
            onPreferences={preferences}
            onFind={openFind}
          />
          {findOpen && !showSetup && (
            <ConversationSearch
              key={snapshot?.conversationId}
              scroller={scroller}
              revision={snapshot?.messages}
              onClose={() => {
                setFindOpen(false);
                input.current?.focus({ preventScroll: true });
              }}
            />
          )}
          <div className="conversation-stage">
            <div
              className="conversation"
              ref={scroller}
              onScroll={() => {
                const view = scroller.current;
                if (view) {
                  nearBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < 120;
                  setShowLatest(!nearBottom.current);
                }
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
                <Welcome snapshot={snapshot} onChoose={insertPrompt} />
              ) : null}
              {!showSetup && snapshot && (
                <Conversation
                  snapshot={snapshot}
                  thinking={chat.thinking}
                  activities={chat.activities}
                  busy={busy}
                  onReuse={insertPrompt}
                />
              )}
            </div>
            {showLatest && !showSetup && Boolean(snapshot?.messages.length) && (
              <button
                className="jump-latest"
                onClick={() => {
                  scroller.current?.scrollTo({
                    top: scroller.current.scrollHeight,
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'instant'
                      : 'smooth',
                  });
                  input.current?.focus({ preventScroll: true });
                }}
              >
                <Icon name="down" size={14} />
                {t('Latest messages')}
              </button>
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
              onInsertPrompt={insertPrompt}
            />
          )}
          {isDesktop && terminalMounted && (
            <Suspense fallback={<div className="terminal-loading">{t('Opening terminal…')}</div>}>
              <TerminalPanel
                root={snapshot?.desktop?.workspacePath ?? null}
                visible={terminalOpen}
                theme={snapshot?.desktop?.theme ?? 'dark'}
                textSize={snapshot?.desktop?.textSize ?? 'standard'}
                onHide={hideTerminal}
              />
            </Suspense>
          )}
          {isDesktop && (
            <div className="workspace-status">
              <span>
                <Icon name="shield" size={12} />
                {snapshot?.desktop?.workspacePath
                  ? t('Project boundaries enforced')
                  : t('Open a project to enable tools')}
              </span>
              <span>
                <span
                  className={`status-dot ${snapshot?.providerStatus === 'Available' ? 'online' : ''}`}
                />
                {busy
                  ? t('Working')
                  : snapshot?.providerStatus === 'Available'
                    ? t('Ready')
                    : t('Not connected')}
              </span>
            </div>
          )}
        </div>
        {isDesktop && resources.inspectorOpen && (
          <Suspense fallback={<aside className="inspector" aria-busy="true" />}>
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
          </Suspense>
        )}
      </main>
      {resources.preferences && snapshot?.desktop && (
        <Suspense
          fallback={
            <div className="settings-loading" role="status">
              {t('Opening settings…')}
            </div>
          }
        >
          <ProviderPreferences
            desktop={snapshot.desktop}
            busy={busy}
            initialTab={resources.preferencesTab}
            onClose={() => resources.setPreferences(false)}
          />
        </Suspense>
      )}
      {paletteOpen && (
        <CommandPalette
          snapshot={snapshot}
          busy={busy}
          onClose={() => setPaletteOpen(false)}
          onPreferences={preferences}
          onFind={openFind}
          onToggleTerminal={toggleTerminal}
          onTogglePanel={() => resources.setInspectorOpen((open) => !open)}
        />
      )}
      {resources.notice && (
        <div className="toast" role="status">
          <Icon name="help" size={16} />
          <span>{t(resources.notice)}</span>
          <button aria-label={t('Dismiss notification')} onClick={() => resources.setNotice('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
