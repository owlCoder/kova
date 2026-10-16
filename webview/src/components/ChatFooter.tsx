import { useRef, type RefObject } from 'react';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { inHost, isDesktop, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { ModelPicker } from './ModelPicker.js';

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
}: Props) {
  const contextMenu = useRef<HTMLDetailsElement>(null);
  const usage = snapshot?.usage;
  const used = usage
    ? (usage.actualInputTokens ?? usage.estimatedInputTokens) + (usage.actualOutputTokens ?? 0)
    : 0;
  const max = usage?.maxTokens ?? snapshot?.contextMaxTokens ?? 32768;
  const attach = (source: 'Selection' | 'CurrentFile' | 'PickFiles') => {
    send({ type: 'AddContext', source });
    if (contextMenu.current) contextMenu.current.open = false;
  };
  return (
    <footer className="chat-footer">
      {error && (
        <div className="error-banner" role="alert">
          <Icon name="warning" size={15} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={onDismissError}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {snapshot && snapshot.providerStatus !== 'Available' && (
        <div className="connection">
          <span className="status-dot" />
          <span>
            {snapshot.providerStatus === 'ModelMissing'
              ? 'Choose an available model'
              : 'Connect an AI provider to get started'}
          </span>
          <button disabled={busy} onClick={() => send({ type: 'OpenProviderSetup' })}>
            Connect
            <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
      <div className={`composer ${busy ? 'busy' : ''}`}>
        {!!snapshot?.contextAttachments.length && (
          <div className="attachments">
            {snapshot.contextAttachments.map((item) => (
              <button
                key={item.id}
                title={`Remove ${item.label}`}
                disabled={busy}
                onClick={() => send({ type: 'RemoveContext', attachmentId: item.id })}
              >
                <Icon name="file" size={13} />
                <span>{item.label}</span>
                <Icon name="close" size={12} />
              </button>
            ))}
          </div>
        )}
        <textarea
          aria-label="Ask Kova"
          placeholder="Ask anything, or describe what you want to build…"
          value={prompt}
          ref={inputRef}
          disabled={!inHost || snapshot?.configuringProvider}
          maxLength={16000}
          rows={3}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <details className="attach-menu" ref={contextMenu}>
              <summary title="Add context" aria-label="Add context">
                <Icon name="plus" />
              </summary>
              <div className="floating-menu">
                {!isDesktop && (
                  <button disabled={busy} onClick={() => attach('Selection')}>
                    <Icon name="code" size={14} />
                    Selection
                  </button>
                )}
                <button disabled={busy} onClick={() => attach('CurrentFile')}>
                  <Icon name="file" size={14} />
                  {isDesktop ? 'Current preview' : 'Current file'}
                </button>
                <button disabled={busy} onClick={() => attach('PickFiles')}>
                  <Icon name="folderOpen" size={14} />
                  Choose files…
                </button>
              </div>
            </details>
            <label className="mode-control">
              <Icon name={mode === 'Plan' ? 'plan' : mode === 'Auto' ? 'zap' : 'code'} size={14} />
              <select
                aria-label="Agent mode"
                value={mode}
                disabled={busy}
                onChange={(event) => onModeChange(event.target.value as AgentMode)}
              >
                <option value="Manual">Manual · approve changes</option>
                <option value="Plan">Plan · read only</option>
                <option value="Edit">Edit · approve commands</option>
                <option value="Auto">Auto · allowlisted commands</option>
              </select>
            </label>
            {!!snapshot?.skills.length && (
              <select
                className="skill-picker"
                aria-label="Skill"
                value={snapshot.activeSkillId ?? ''}
                disabled={busy}
                onChange={(event) =>
                  send({ type: 'SelectSkill', skillId: event.target.value || null })
                }
              >
                <option value="">No skill</option>
                {snapshot.skills.map((skill) => (
                  <option value={skill.id} key={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {busy && !snapshot?.configuringProvider ? (
            <button
              className="send stop"
              title="Stop generation"
              aria-label="Stop generation"
              onClick={() =>
                snapshot?.activeRunId && send({ type: 'CancelRun', runId: snapshot.activeRunId })
              }
            >
              <Icon name="stop" size={13} />
            </button>
          ) : (
            <button
              className="send"
              title="Send message"
              aria-label="Send"
              disabled={
                busy || !prompt.trim() || !snapshot?.models.some((item) => item.id === model)
              }
              onClick={onSubmit}
            >
              <Icon name="send" size={17} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-meta">
        <div className="provider-control">
          <button
            title="Configure AI provider"
            disabled={busy}
            onClick={() => send({ type: 'OpenProviderSetup' })}
          >
            <Icon name="sparkles" size={13} />
            <span>{snapshot?.providerLabel ?? 'AI provider'}</span>
          </button>
          <span className="meta-divider">/</span>
          <ModelPicker
            models={snapshot?.models}
            model={model}
            busy={busy}
            onChange={onModelChange}
          />
        </div>
        <details className="context">
          <summary title="Context usage">
            <span className="context-ring">◔</span>
            <span>
              {Math.round(used / 100) / 10}k / {Math.round(max / 100) / 10}k
            </span>
          </summary>
          <div className="context-details">
            <strong>Context window</strong>
            <progress value={Math.min(used, max)} max={max} />
            <span>
              Input <b>{usage?.actualInputTokens ?? usage?.estimatedInputTokens ?? 0}</b>
            </span>
            <span>
              Output <b>{usage?.actualOutputTokens ?? '—'}</b>
            </span>
            <span>
              Tool definitions <b>{usage?.toolDefinitionTokens ?? 0}</b>
            </span>
          </div>
        </details>
      </div>
      <div className="footer-note">
        <span
          className={`status-dot ${snapshot?.providerStatus === 'Available' ? 'online' : ''}`}
        />
        {snapshot?.toolsEnabled ? 'Workspace tools ready' : 'Chat mode'}
        <span>Shift + Enter for a new line</span>
      </div>
    </footer>
  );
}
