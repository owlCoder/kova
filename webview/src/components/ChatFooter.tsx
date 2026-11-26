import { useI18n } from '../i18n/I18n.js';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { inHost, send, subscribe } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { ModelPicker } from './ModelPicker.js';
import { PromptMenu } from './PromptMenu.js';
import { ContextAttachments } from './ContextAttachments.js';
import { ContextMeter } from './ContextMeter.js';
import { ModeMenu, modeOrder } from './ModeMenu.js';
import { ProviderBanner } from './ProviderBanner.js';
import { usePopover } from './usePopover.js';
import { menuKeydown } from './menuKeydown.js';
import { matchSlashCommands, type SlashCommand } from './slashCommands.js';

type Props = {
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string;
  providerIssue: string;
  prompt: string;
  model: string;
  mode: AgentMode;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDismissError(): void;
  onPromptChange(value: string): void;
  onSubmit(): void;
  onSubmitText(text: string): void;
  onModelChange(value: string): void;
  onModeChange(value: AgentMode): void;
  onOpenLibrary(): void;
  onOpenSettings(): void;
  onOpenPalette(): void;
  onInsertPrompt(text: string): void;
  onPreviewContext(id: string): void;
};

export function ChatFooter({
  snapshot,
  busy,
  error,
  providerIssue,
  prompt,
  model,
  mode,
  inputRef,
  onDismissError,
  onPromptChange,
  onSubmit,
  onSubmitText,
  onModelChange,
  onModeChange,
  onOpenLibrary,
  onOpenSettings,
  onOpenPalette,
  onInsertPrompt,
  onPreviewContext,
}: Props) {
  const { t } = useI18n();
  const attachMenu = usePopover({ disabled: busy, minimumWidth: 190 });
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const slashMatches = matchSlashCommands(prompt);
  const slashOpen = prompt.startsWith('/') && !slashDismissed;
  // @mention: a "@query" fragment right before the caret opens the file menu.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [mentionFiles, setMentionFiles] = useState<readonly string[]>([]);
  const [mentionTruncated, setMentionTruncated] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRequest = useRef<string | null>(null);
  const mentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'WorkspaceFiles' && message.requestId === mentionRequest.current) {
          setMentionFiles(message.files);
          setMentionTruncated(message.truncated);
          setMentionIndex(0);
        }
      }),
    [],
  );
  const mentionOpen =
    !slashOpen && !mentionDismissed && mention !== null && Boolean(snapshot?.toolsEnabled);
  const updateMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = /(?:^|\s)@([^\s@]{0,80})$/.exec(before);
    if (match) {
      const next = { query: match[1] ?? '', start: before.length - match[0].length };
      setMention(next);
      setMentionDismissed(false);
      if (mentionTimer.current) clearTimeout(mentionTimer.current);
      mentionTimer.current = setTimeout(() => {
        mentionRequest.current = send({ type: 'ListWorkspaceFiles', query: next.query });
      }, 120);
    } else {
      setMention(null);
      setMentionFiles([]);
    }
  };
  const pickMention = (path: string) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    onPromptChange(`${prompt.slice(0, mention.start)}@${path} ${prompt.slice(end)}`);
    setMention(null);
    setMentionFiles([]);
    send({ type: 'AttachPath', path });
    inputRef.current?.focus();
  };
  useLayoutEffect(() => {
    const resize = () => {
      const field = inputRef.current;
      if (!field) return;
      field.style.height = 'auto';
      field.style.height = `${Math.min(field.scrollHeight, 260)}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [prompt, inputRef, snapshot?.textSize]);
  const attach = (source: 'Selection' | 'CurrentFile' | 'PickFiles') => {
    send({ type: 'AddContext', source });
    attachMenu.hide();
  };
  const nextMode = () => modeOrder[(modeOrder.indexOf(mode) + 1) % modeOrder.length]!;
  const disabled = !inHost || !snapshot || snapshot.configuringProvider;
  const runSlashCommand = (command: SlashCommand) => {
    onPromptChange('');
    setSlashDismissed(false);
    setSlashIndex(0);
    if (command.action.type === 'message') {
      send({ type: command.action.message });
    } else if (command.action.type === 'submit') {
      onSubmitText(command.action.prompt);
    } else if (command.action.type === 'export') {
      if (snapshot)
        send({
          type: 'ExportConversation',
          conversationId: snapshot.conversationId,
          action: command.action.action,
        });
    } else {
      const target = command.action.target;
      if (target === 'settings') onOpenSettings();
      else if (target === 'library') onOpenLibrary();
      else if (target === 'palette') onOpenPalette();
      else {
        // Open the matching composer popover: model picker, mode menu or context ring.
        const selector =
          target === 'model'
            ? '.model-trigger'
            : target === 'mode'
              ? '.mode-toggle'
              : '.context-trigger';
        document.querySelector<HTMLButtonElement>(selector)?.click();
      }
    }
  };
  return (
    <footer className="chat-footer">
      {error && (
        <div className="error-banner" role="alert">
          <Icon name="warning" size={14} />
          <span>{error}</span>
          <button aria-label={t('Dismiss error')} onClick={onDismissError}>
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      {snapshot && snapshot.providerStatus !== 'Available' && (
        <ProviderBanner snapshot={snapshot} issue={providerIssue} busy={busy} />
      )}
      <div className={`composer ${busy ? 'busy' : ''} mode-${mode.toLowerCase()}`}>
        {slashOpen && (
          <div className="slash-menu" role="menu" aria-label={t('Slash commands')}>
            {slashMatches.length ? (
              slashMatches.map((command, index) => (
                <button
                  key={command.id}
                  role="menuitemradio"
                  aria-checked={index === slashIndex}
                  className={index === slashIndex ? 'active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runSlashCommand(command)}
                  onMouseEnter={() => setSlashIndex(index)}
                >
                  <strong>{command.command}</strong>
                  <small>{t(command.hintKey)}</small>
                </button>
              ))
            ) : (
              <p className="slash-empty">{t('No matching commands.')}</p>
            )}
          </div>
        )}
        {mentionOpen && (
          <div className="slash-menu mention-menu" role="menu" aria-label={t('Mention a file')}>
            {mentionFiles.length ? (
              mentionFiles.map((path, index) => (
                <button
                  key={path}
                  role="menuitemradio"
                  aria-checked={index === mentionIndex}
                  className={index === mentionIndex ? 'active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickMention(path)}
                  onMouseEnter={() => setMentionIndex(index)}
                >
                  <strong>@{path}</strong>
                </button>
              ))
            ) : (
              <p className="slash-empty">{t('No matching files.')}</p>
            )}
            {mentionTruncated && <p className="slash-empty">{t('Showing first matches only.')}</p>}
          </div>
        )}
        <ContextAttachments
          items={snapshot?.contextAttachments ?? []}
          busy={busy}
          onPreview={onPreviewContext}
        />
        <textarea
          aria-label={t('Ask Kova')}
          placeholder={
            busy
              ? t('Kova is working… Esc to interrupt')
              : t('Ask Kova to explain, edit or test your code, or type / for commands')
          }
          value={prompt}
          ref={inputRef}
          disabled={disabled}
          maxLength={16000}
          rows={1}
          onChange={(event) => {
            onPromptChange(event.target.value);
            setSlashIndex(0);
            setSlashDismissed(false);
            updateMention(event.target.value, event.target.selectionStart);
          }}
          onKeyUp={(event) =>
            updateMention(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onClick={(event) =>
            updateMention(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (mentionOpen && mentionFiles.length) {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setMentionDismissed(true);
                return;
              }
              if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                setMentionIndex(
                  (index) =>
                    (index + (event.key === 'ArrowDown' ? 1 : -1) + mentionFiles.length) %
                    mentionFiles.length,
                );
                return;
              }
              if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
                event.preventDefault();
                pickMention(mentionFiles[Math.min(mentionIndex, mentionFiles.length - 1)]!);
                return;
              }
            }
            if (slashOpen && event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setSlashDismissed(true);
              return;
            }
            if (slashOpen && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
              event.preventDefault();
              setSlashIndex(
                (index) =>
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + slashMatches.length) %
                  Math.max(1, slashMatches.length),
              );
              return;
            }
            if (slashOpen && event.key === 'Enter' && !event.shiftKey && slashMatches.length) {
              event.preventDefault();
              runSlashCommand(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]!);
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            } else if (event.key === 'Tab' && event.shiftKey && !busy) {
              event.preventDefault();
              onModeChange(nextMode());
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-tools">
            <ModeMenu mode={mode} disabled={busy} onChange={onModeChange} />
            <div className="attach-menu" ref={attachMenu.root}>
              <button
                ref={(node) => {
                  attachMenu.trigger.current = node;
                }}
                type="button"
                className="icon-button"
                disabled={busy}
                title={t('Add context')}
                aria-label={t('Add context')}
                aria-haspopup="menu"
                aria-expanded={attachMenu.open}
                onClick={() => (attachMenu.open ? attachMenu.hide() : attachMenu.show())}
              >
                <Icon name="paperclip" size={14} />
              </button>
              <div
                ref={attachMenu.panel}
                popover="auto"
                role="menu"
                aria-label={t('Add context')}
                className="floating-menu"
                style={attachMenu.position}
                onKeyDown={(event) => menuKeydown(event, () => attachMenu.hide(true))}
              >
                <button disabled={busy} onClick={() => attach('Selection')}>
                  <Icon name="code" size={14} />
                  {t('Selection')}
                </button>
                <button disabled={busy} onClick={() => attach('CurrentFile')}>
                  <Icon name="file" size={14} />
                  {t('Current file')}
                </button>
                <button disabled={busy} onClick={() => attach('PickFiles')}>
                  <Icon name="folderOpen" size={14} />
                  {t('Choose files…')}
                </button>
              </div>
            </div>
            <PromptMenu
              messages={snapshot?.messages}
              disabled={disabled}
              onChoose={onInsertPrompt}
              onManage={onOpenLibrary}
            />
            {!!snapshot?.skills.length && (
              <select
                className="skill-picker"
                aria-label={t('Skill')}
                value={snapshot.activeSkillId ?? ''}
                disabled={busy}
                onChange={(event) =>
                  send({ type: 'SelectSkill', skillId: event.target.value || null })
                }
              >
                <option value="">{t('No skill')}</option>
                {snapshot.skills.map((skill) => (
                  <option value={skill.id} key={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="composer-send">
            <ModelPicker
              models={snapshot?.models}
              model={model}
              busy={busy}
              onChange={onModelChange}
            />
            <ContextMeter snapshot={snapshot} />
            {busy && !snapshot?.configuringProvider ? (
              <button
                className="send stop"
                title={t('Stop generation')}
                aria-label={t('Stop generation')}
                onClick={() =>
                  snapshot?.activeRunId && send({ type: 'CancelRun', runId: snapshot.activeRunId })
                }
              >
                <Icon name="stop" size={12} />
              </button>
            ) : (
              <button
                className="send"
                title={t('Send message')}
                aria-label={t('Send')}
                disabled={
                  busy || !prompt.trim() || !snapshot?.models.some((item) => item.id === model)
                }
                onClick={onSubmit}
              >
                <Icon name="up" size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
