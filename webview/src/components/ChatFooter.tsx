import { useRef, type RefObject } from 'react';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { inVscode, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

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
  const max = usage?.maxTokens ?? snapshot?.contextMaxTokens ?? 8192;
  const attachContext = (source: 'Selection' | 'CurrentFile' | 'PickFiles') => {
    send({ type: 'AddContext', source });
    if (contextMenu.current) contextMenu.current.open = false;
  };

  return (
    <footer>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={onDismissError}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {snapshot?.providerStatus !== 'Available' && (
        <div className="connection">
          <span className="status-dot" />
          {!inVscode
            ? 'Open this view in VS Code'
            : !snapshot
              ? 'Connecting to provider…'
              : snapshot.providerStatus === 'ModelMissing'
                ? 'Selected model is unavailable'
                : 'Configured provider is unavailable'}
          <div>
            <button onClick={() => send({ type: 'RetryProvider' })}>Retry</button>
            <button onClick={() => send({ type: 'OpenSetupInstructions' })}>Setup</button>
          </div>
        </div>
      )}
      {!!snapshot?.contextAttachments.length && (
        <div className="attachments">
          {snapshot.contextAttachments.map((item) => (
            <button
              key={item.id}
              title={`Remove ${item.label}`}
              disabled={busy}
              onClick={() => send({ type: 'RemoveContext', attachmentId: item.id })}
            >
              <Icon name="code" />
              <span>{item.label}</span>
              <Icon name="close" />
            </button>
          ))}
        </div>
      )}
      {!!snapshot?.skills.length && (
        <label className="skill-picker">
          Skill{' '}
          <select
            value={snapshot.activeSkillId ?? ''}
            disabled={busy}
            onChange={(event) => send({ type: 'SelectSkill', skillId: event.target.value || null })}
          >
            <option value="">None</option>
            {snapshot.skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={`composer ${busy ? 'busy' : ''}`}>
        <textarea
          aria-label="Ask Kova"
          placeholder="Ask Kova…"
          value={prompt}
          ref={inputRef}
          disabled={!inVscode}
          maxLength={16000}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="composer-actions">
          <details className="attach-menu" ref={contextMenu}>
            <summary title="Add context">
              <Icon name="paperclip" />
              <span>Add context</span>
            </summary>
            <div>
              <button disabled={busy} onClick={() => attachContext('Selection')}>
                Selection
              </button>
              <button disabled={busy} onClick={() => attachContext('CurrentFile')}>
                Current file
              </button>
              <button disabled={busy} onClick={() => attachContext('PickFiles')}>
                Choose files…
              </button>
            </div>
          </details>
          {busy ? (
            <button
              className="send stop"
              title="Stop generation"
              aria-label="Stop generation"
              onClick={() =>
                snapshot?.activeRunId && send({ type: 'CancelRun', runId: snapshot.activeRunId })
              }
            >
              <Icon name="stop" />
            </button>
          ) : (
            <button
              className="send"
              title="Send"
              aria-label="Send"
              disabled={!prompt.trim() || !snapshot?.models.some((item) => item.id === model)}
              onClick={onSubmit}
            >
              <Icon name="send" />
            </button>
          )}
        </div>
      </div>
      <div className="selection-row">
        <label>
          <span>Model</span>
          <select
            aria-label="Model"
            title={model}
            value={model}
            disabled={busy}
            onChange={(event) => onModelChange(event.target.value)}
          >
            {!snapshot?.models.some((item) => item.id === model) && (
              <option value={model}>{model} · not available</option>
            )}
            {snapshot?.models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
                {item.tools !== 'Supported' ? ' · chat only' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Mode</span>
          <select
            aria-label="Agent mode"
            title={
              {
                Plan: 'Read-only tools; no edits or commands',
                Manual: 'Approve edits and commands',
                Edit: 'Automatic workspace edits; approve commands',
                Auto: 'Automatic edits and exact allowlisted commands',
              }[mode]
            }
            value={mode}
            disabled={busy}
            onChange={(event) => onModeChange(event.target.value as AgentMode)}
          >
            {(['Plan', 'Manual', 'Edit', 'Auto'] as const).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {snapshot && (
        <details className="context">
          <summary>
            <span>
              Context{' '}
              <span className="context-count">
                {used.toLocaleString()} / {max.toLocaleString()}
              </span>
            </span>
            <span>
              {Math.min(100, Math.round((used / max) * 100))}% <Icon name="chevron" />
            </span>
          </summary>
          <progress value={Math.min(used, max)} max={max} />
          <div className="context-details">
            <span>
              {usage?.actualInputTokens === null || !usage ? 'Estimated input' : 'Measured input'}
              <strong>{usage?.actualInputTokens ?? usage?.estimatedInputTokens ?? 0}</strong>
            </span>
            <span>
              Tool definitions (estimated)<strong>{usage?.toolDefinitionTokens ?? 0}</strong>
            </span>
            <span>
              Output<strong>{usage?.actualOutputTokens ?? '—'}</strong>
            </span>
            {!!usage?.evictions.length && (
              <span>
                Context reductions<strong>{usage.evictions.length}</strong>
              </span>
            )}
          </div>
        </details>
      )}
      <div className="footer-note">
        <span
          className={`status-dot ${snapshot?.providerStatus === 'Available' ? 'online' : ''}`}
        />
        {snapshot?.toolsEnabled ? 'Tools enabled' : 'Chat only'}
        <span>Enter to send</span>
      </div>
    </footer>
  );
}
