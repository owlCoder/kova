import { useI18n } from '../i18n/I18n.js';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { inHost, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { ModelPicker } from './ModelPicker.js';
import { PromptPicker } from './PromptPicker.js';
import { ContextAttachments } from './ContextAttachments.js';
import { ContextMeter } from './ContextMeter.js';

type Props = {
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string;
  prompt: string;
  model: string;
  mode: AgentMode;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDismissError(): void;
  onPromptChange(value: string): void;
  onSubmit(): void;
  onModelChange(value: string): void;
  onModeChange(value: AgentMode): void;
  onOpenLibrary(): void;
  onPreviewContext(id: string): void;
};

/** Shift+Tab walks the modes from most to least supervised, then plan-only. */
const modeOrder: readonly AgentMode[] = ['Manual', 'Edit', 'Auto', 'Plan'];
const modeView: Record<AgentMode, { label: string; hint: string; icon: 'code' | 'zap' | 'plan' }> =
  {
    Manual: { label: 'Ask before changes', hint: 'Approve every change and command', icon: 'code' },
    Edit: {
      label: 'Accept edits',
      hint: 'Edits apply directly; commands need approval',
      icon: 'code',
    },
    Auto: { label: 'Auto mode', hint: 'Allowlisted commands run without asking', icon: 'zap' },
    Plan: { label: 'Plan mode', hint: 'Read only: explore and propose a plan', icon: 'plan' },
  };

export function ChatFooter({
  snapshot,
  busy,
  error,
  prompt,
  model,
  mode,
  inputRef,
  onDismissError,
  onPromptChange,
  onSubmit,
  onModelChange,
  onModeChange,
  onOpenLibrary,
  onPreviewContext,
}: Props) {
  const { t } = useI18n();
  const contextMenu = useRef<HTMLDetailsElement>(null);
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
    if (contextMenu.current) contextMenu.current.open = false;
  };
  const nextMode = () => modeOrder[(modeOrder.indexOf(mode) + 1) % modeOrder.length]!;
  const view = modeView[mode];
  const disabled = !inHost || !snapshot || snapshot.configuringProvider;
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
        <div className="connection">
          <span className="status-dot" />
          <span>
            {snapshot.providerStatus === 'ModelMissing'
              ? t('Choose an available model')
              : t('Connect an AI provider to get started')}
          </span>
          <button disabled={busy} onClick={() => send({ type: 'OpenProviderSetup' })}>
            {t('Connect')}
            <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
      <div className={`composer ${busy ? 'busy' : ''} mode-${mode.toLowerCase()}`}>
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
              : t('Ask Kova to explain, edit or test your code')
          }
          value={prompt}
          ref={inputRef}
          disabled={disabled}
          maxLength={16000}
          rows={1}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
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
            <button
              className={`mode-toggle mode-${mode.toLowerCase()}`}
              disabled={busy}
              title={`${t(view.hint)} · ${t('Shift+Tab to switch')}`}
              aria-label={`${t('Agent mode')}: ${t(view.label)}`}
              onClick={() => onModeChange(nextMode())}
            >
              <Icon name={view.icon} size={13} />
              <span>{t(view.label)}</span>
            </button>
            <details className="attach-menu" ref={contextMenu}>
              <summary title={t('Add context')} aria-label={t('Add context')}>
                <Icon name="paperclip" size={14} />
              </summary>
              <div className="floating-menu">
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
            </details>
            <PromptPicker disabled={disabled} onOpen={onOpenLibrary} />
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
