import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WorkspaceHeader } from './components/WorkspaceHeader.js';
import { ConversationSearch } from './components/ConversationSearch.js';
import { ChatFooter } from './components/ChatFooter.js';
import { Icon } from './components/Icon.js';
import { Onboarding } from './components/Onboarding.js';
import { Welcome } from './components/Welcome.js';
import { Conversation } from './components/Conversation.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ContextPreviewDialog } from './components/ContextPreviewDialog.js';
import { send } from './messaging/bridge.js';
import { I18nProvider, useI18n } from './i18n/I18n.js';
import { useChat } from './state/useChat.js';
import { useNotice } from './state/useNotice.js';
import { insertComposerText } from './state/insertComposerText.js';
import { useContextPreview } from './state/useContextPreview.js';
import { usePromptWorkbench } from './state/usePromptWorkbench.js';

const PromptLibraryDialog = lazy(() =>
  import('./components/PromptLibraryDialog.js').then((module) => ({
    default: module.PromptLibraryDialog,
  })),
);

const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog.js').then((module) => ({
    default: module.SettingsDialog,
  })),
);

export function App() {
  const chat = useChat();
  return (
    <I18nProvider language={chat.snapshot?.language ?? 'en'}>
      <Workspace chat={chat} />
    </I18nProvider>
  );
}

/** First line of the opening prompt, like a conversation title. */
function conversationTitle(messages: readonly { role: string; content: string }[]) {
  const first = messages.find((message) => message.role === 'user')?.content.trim();
  if (!first) return null;
  const line = first.split('\n')[0]!;
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

function Workspace({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { t } = useI18n();
  useEffect(() => {
    const size = chat.snapshot?.textSize;
    document.documentElement.style.setProperty(
      '--text-scale',
      size === 'larger' ? '1.24' : size === 'large' ? '1.12' : '1',
    );
  }, [chat.snapshot?.textSize]);
  const { snapshot, busy } = chat;
  const { notice, setNotice } = useNotice();
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (chat.settingsRequest > 0) setSettingsOpen(true);
  }, [chat.settingsRequest]);
  const { library, open: openLibrary, close: closeLibrary } = usePromptWorkbench(paletteOpen);
  const context = useContextPreview(snapshot, paletteOpen || Boolean(library));
  const [findOpen, setFindOpen] = useState(false);
  const openFind = useCallback(() => {
    setSetupOpen(false);
    setSetupDismissed(true);
    setFindOpen(true);
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('.conversation-search input')?.focus(),
    );
  }, []);
  const [showLatest, setShowLatest] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const insertPrompt = useCallback(
    (text: string) => {
      const field = input.current;
      if (!field || field.disabled) return;
      const next = insertComposerText(field.value, text, field.selectionEnd);
      if (!next) {
        setNotice('This prompt would exceed the 16,000 character draft limit.');
        field.focus({ preventScroll: true });
        return;
      }
      chat.setPrompt(next.text);
      requestAnimationFrame(() => {
        field.focus({ preventScroll: true });
        field.setSelectionRange(next.caret, next.caret);
      });
    },
    [chat.setPrompt, setNotice],
  );
  const nearBottom = useRef(true);
  const showSetup = Boolean(
    snapshot &&
    !snapshot.activeRunId &&
    (setupOpen || (!snapshot.setupCompleted && !setupDismissed)),
  );
  // A fresh conversation has no title yet; the header shows just the mark.
  const title = conversationTitle(snapshot?.messages ?? []);
  const dialogOpen = paletteOpen || settingsOpen || Boolean(context.preview) || Boolean(library);
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
  }, [snapshot?.messages, snapshot?.pendingApproval, chat.timeline, showSetup, findOpen]);
  useEffect(() => {
    if (!showSetup) input.current?.focus();
  }, [showSetup]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      // Escape interrupts the active run, as in a terminal agent session.
      if (event.key === 'Escape' && !dialogOpen && !findOpen && snapshot?.activeRunId) {
        event.preventDefault();
        send({ type: 'CancelRun', runId: snapshot.activeRunId });
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || context.preview || library) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (!paletteOpen && key === 'f' && snapshot?.messages.length && !showSetup) {
        event.preventDefault();
        openFind();
      } else if (!paletteOpen && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [
    context.preview,
    library,
    paletteOpen,
    dialogOpen,
    findOpen,
    openFind,
    snapshot?.activeRunId,
    snapshot?.messages.length,
    showSetup,
  ]);
  const closeSetup = () => {
    setSetupOpen(false);
    setSetupDismissed(true);
  };
  return (
    <div className="extension-frame">
      <main className="workspace extension-workspace" inert={dialogOpen ? true : undefined}>
        <div className="workspace-main">
          <WorkspaceHeader
            title={title}
            busy={busy}
            conversationId={snapshot?.conversationId}
            hasMessages={Boolean(snapshot?.messages.length) && !showSetup}
            onSetup={() => {
              setSetupOpen((open) => !open);
              if (scroller.current) scroller.current.scrollTop = 0;
            }}
            onPalette={() => setPaletteOpen(true)}
            onPreferences={() => setSettingsOpen(true)}
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
              className={`conversation${showSetup || snapshot?.messages.length ? '' : ' conversation-empty'}`}
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
                  key={snapshot.conversationId}
                  snapshot={snapshot}
                  thinking={chat.thinking}
                  timeline={chat.timeline}
                  runStartedAt={chat.runStartedAt}
                  busy={busy}
                  onReuse={insertPrompt}
                  onSavePrompt={openLibrary}
                  scroller={scroller}
                  searching={findOpen}
                  followLatest={!showLatest}
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
              providerIssue={chat.providerIssue}
              prompt={chat.prompt}
              model={chat.model}
              mode={chat.mode}
              inputRef={input}
              onDismissError={chat.dismissError}
              onPromptChange={chat.setPrompt}
              onSubmit={chat.submit}
              onModelChange={chat.setModel}
              onModeChange={chat.setMode}
              onOpenLibrary={() => openLibrary()}
              onInsertPrompt={insertPrompt}
              onPreviewContext={context.open}
            />
          )}
        </div>
      </main>
      {library && !paletteOpen && (
        <Suspense
          fallback={
            <div className="settings-loading" role="status">
              {t('Loading your library…')}
            </div>
          }
        >
          <PromptLibraryDialog
            messages={snapshot?.messages}
            seed={library.seed}
            draft={chat.prompt}
            onClose={closeLibrary}
            onChoose={(text) => {
              closeLibrary();
              insertPrompt(text);
            }}
          />
        </Suspense>
      )}
      {context.preview && !library && !paletteOpen && (
        <ContextPreviewDialog preview={context.preview} busy={busy} onClose={context.close} />
      )}
      {paletteOpen && (
        <CommandPalette
          snapshot={snapshot}
          busy={busy}
          onClose={() => setPaletteOpen(false)}
          onFind={openFind}
          onLibrary={() => openLibrary()}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {settingsOpen && (
        <Suspense
          fallback={
            <div className="settings-loading" role="status">
              {t('Loading settings…')}
            </div>
          }
        >
          <SettingsDialog onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="help" size={16} />
          <span>{t(notice)}</span>
          <button aria-label={t('Dismiss notification')} onClick={() => setNotice('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
