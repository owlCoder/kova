import { useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SavedPrompt } from '../../../packages/protocol/src/PromptLibrary.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { useI18n } from '../i18n/I18n.js';
import { isDesktop } from '../messaging/bridge.js';
import { recentPrompts } from '../state/recentPrompts.js';
import { usePromptLibrary } from '../state/usePromptLibrary.js';
import type { PromptEdit } from '../state/PromptEdit.js';
import { BrandMark } from './BrandMark.js';
import { Icon } from './Icon.js';
import { PromptEditor } from './PromptEditor.js';
import { promptTemplates } from './promptTemplates.js';
import { useDialogFocus } from './useDialogFocus.js';
import '../styles/prompt-library.css';

type Editable = PromptEdit;
const draftPrompt = (text: string): Editable => ({
  id: null,
  revision: null,
  title: text.replace(/\s+/g, ' ').trim().slice(0, 80),
  text,
});

export function PromptLibraryDialog({
  messages,
  seed,
  draft,
  onChoose,
  onClose,
}: {
  messages: SessionSnapshot['messages'] | undefined;
  seed: string | null;
  draft: string;
  onChoose(text: string): void;
  onClose(): void;
}) {
  const { t, language } = useI18n();
  const store = usePromptLibrary();
  const [tab, setTab] = useState<'saved' | 'templates' | 'recent'>('saved');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editable | null>(() =>
    seed === null ? null : draftPrompt(seed),
  );
  const [removed, setRemoved] = useState<SavedPrompt | null>(null);
  const [status, setStatus] = useState('');
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const lastEditor = useRef(editor);
  useLayoutEffect(() => {
    if (lastEditor.current !== editor || !panel.current?.contains(document.activeElement))
      panel.current
        ?.querySelector<HTMLInputElement>(editor ? '.prompt-editor input' : '.library-search input')
        ?.focus({ preventScroll: true });
    lastEditor.current = editor;
  }, [editor, store.library?.revision, removed]);
  useDialogFocus(panel, onClose, store.pending);
  const recent = useMemo(() => recentPrompts(messages), [messages]);
  const deferredQuery = useDeferredValue(query);
  const choices = useMemo(() => {
    const source =
      tab === 'saved'
        ? (store.library?.prompts ?? []).map((prompt) => ({ ...prompt, icon: 'pin' as const }))
        : tab === 'templates'
          ? promptTemplates.map((item) => ({
              id: item.id,
              title: t(item.title),
              text: t(item.text),
              icon: item.icon,
            }))
          : recent.map((text, index) => ({
              id: `recent-${index}`,
              title: text.replace(/\s+/g, ' ').slice(0, 80),
              text,
              icon: 'clock' as const,
            }));
    return source.map((item) => ({
      ...item,
      search: `${item.title}\n${item.text}`.toLocaleLowerCase(language),
      preview: item.text.replace(/\s+/g, ' ').slice(0, 180),
    }));
  }, [tab, store.library, recent, language]);
  const needle = deferredQuery.trim().toLocaleLowerCase(language);
  const options = choices.filter((item) => item.search.includes(needle));
  const conflict = Boolean(
    editor?.id && store.library && editor.revision !== store.library.revision,
  );
  const edit = (prompt: Editable) => {
    setEditor({ ...prompt, revision: prompt.id ? (store.library?.revision ?? null) : null });
    setStatus('');
  };
  const back = () => {
    setEditor(null);
    requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLInputElement>('.library-search input')?.focus(),
    );
  };
  return (
    <div
      className="modal-backdrop library-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !store.pending) onClose();
      }}
    >
      <section
        className="prompt-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
      >
        <header className="library-heading">
          <BrandMark />
          <div>
            <span className="eyebrow">{t('YOUR PROMPT WORKBENCH')}</span>
            <h2 id={titleId}>
              {t(editor ? (editor.id ? 'Edit prompt' : 'New prompt') : 'Prompt library')}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label={t('Close library')}
            title={t('Close library')}
            disabled={store.pending}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <p className="library-intro">
          {t(
            isDesktop
              ? 'Saved on this device, across your desktop projects.'
              : 'Saved locally in this VS Code workspace.',
          )}
        </p>
        {store.error && (
          <div className="library-error" role="alert">
            <Icon name="warning" size={15} />
            <span>{t(store.error)}</span>
            <button disabled={store.pending} onClick={() => void store.reload()}>
              {t('Reload library')}
            </button>
          </div>
        )}
        {editor ? (
          <PromptEditor
            key={editor.id ?? editor.text}
            initial={editor}
            pending={store.pending}
            conflict={conflict}
            canCreate={Boolean(store.library && store.library.prompts.length < 40)}
            full={Boolean(
              store.library && store.library.prompts.length >= 40 && (!editor.id || conflict),
            )}
            canSave={
              Boolean(store.library) &&
              !conflict &&
              (Boolean(editor.id) || store.library!.prompts.length < 40)
            }
            onCancel={back}
            onSave={async (prompt) => {
              if (!(await store.save(prompt))) return false;
              setTab('saved');
              setQuery('');
              setStatus('Prompt saved.');
              back();
              return true;
            }}
            onRemove={async () => {
              if (!editor.id) return;
              const prompt = { ...editor, id: editor.id };
              if (editor.revision && (await store.remove(prompt, editor.revision))) {
                setRemoved(prompt);
                setStatus('Prompt removed.');
                back();
              }
            }}
          />
        ) : (
          <>
            <div className="library-tools">
              <nav aria-label={t('Prompt collections')}>
                {(['saved', 'templates', 'recent'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={tab === value}
                    onClick={() => {
                      setTab(value);
                      setQuery('');
                    }}
                  >
                    <Icon
                      name={value === 'saved' ? 'pin' : value === 'templates' ? 'library' : 'clock'}
                      size={14}
                    />
                    <span className="library-tab-title">
                      {t({ saved: 'Saved', templates: 'Templates', recent: 'Recent' }[value])}
                    </span>
                    {value === 'saved' && (
                      <span className="library-tab-count">
                        {store.library?.prompts.length ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
              <div className="library-create">
                {Boolean(draft.trim()) && (
                  <button disabled={store.pending} onClick={() => edit(draftPrompt(draft))}>
                    <Icon name="pencil" size={14} />
                    {t('Save draft')}
                  </button>
                )}
                <button disabled={store.pending} onClick={() => edit(draftPrompt(''))}>
                  <Icon name="plus" size={14} />
                  {t('New prompt')}
                </button>
              </div>
            </div>
            <label className="library-search">
              <Icon name="search" size={15} />
              <input
                data-dialog-focus
                autoComplete="off"
                maxLength={128}
                aria-label={t('Search prompts')}
                placeholder={t('Search this collection…')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="library-entries" aria-busy={store.pending}>
              {!store.library && store.pending && (
                <p className="library-empty" role="status">
                  {t('Loading your library…')}
                </p>
              )}
              {options.map((item) => (
                <article className="library-entry" key={item.id}>
                  <button
                    className="library-insert"
                    title={t('Insert prompt')}
                    onClick={() => onChoose(item.text)}
                  >
                    <Icon name={item.icon} size={17} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.preview}</small>
                    </span>
                    <Icon name="upLeft" size={15} />
                  </button>
                  <button
                    className="icon-button library-edit"
                    aria-label={t(tab === 'saved' ? 'Edit {name}' : 'Save a copy of {name}', {
                      name: item.title,
                    })}
                    title={t(tab === 'saved' ? 'Edit prompt' : 'Save a copy')}
                    disabled={store.pending || !store.library}
                    onClick={() =>
                      edit({
                        id: tab === 'saved' ? item.id : null,
                        revision: store.library?.revision ?? null,
                        title: item.title,
                        text: item.text,
                      })
                    }
                  >
                    <Icon name={tab === 'saved' ? 'pencil' : 'pin'} size={14} />
                  </button>
                </article>
              ))}
              {!options.length && store.library && (
                <div className="library-empty">
                  <Icon name={query ? 'search' : tab === 'saved' ? 'pin' : 'clock'} size={24} />
                  <h3>
                    {t(
                      query
                        ? 'No matching prompts'
                        : tab === 'saved'
                          ? 'Keep your best starting points'
                          : 'No recent prompts yet',
                    )}
                  </h3>
                  <p>
                    {t(
                      query
                        ? 'Try a different word or another collection.'
                        : tab === 'saved'
                          ? 'Save a draft, keep a useful message or adapt a template.'
                          : 'Your messages from this conversation will appear here.',
                    )}
                  </p>
                </div>
              )}
            </div>
            <footer className="library-footer">
              <small>{t('Insert, review, then send. Your selected mode stays the same.')}</small>
              <span>{store.library ? `${store.library.prompts.length} / 40` : '—'}</span>
            </footer>
          </>
        )}
        {(status || removed) && (
          <div className="library-status" role="status">
            <Icon name="check" size={14} />
            <span>{t(status)}</span>
            {removed && (
              <button
                disabled={store.pending}
                onClick={async () => {
                  if (await store.save({ ...removed, id: null, revision: null })) {
                    setRemoved(null);
                    setStatus('Prompt restored.');
                  }
                }}
              >
                {t('Undo removal')}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
