import { useEffect, useRef, useState } from 'react';
import logo from '../../assets/logo.png';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../packages/protocol/src/SessionSnapshot.js';
import type { AgentMode } from '../../packages/protocol/src/AgentMode.js';
import { send, inVscode } from './messaging/bridge.js';
import { activityText, applyEvent } from './state/presentation.js';
import { MessageContent } from './components/MessageContent.js';
import { Icon } from './components/Icon.js';

export function App() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('qwen3:4b');
  const [mode, setMode] = useState<AgentMode>('Manual');
  const [activities, setActivities] = useState<{ id: number; text: string; error: boolean }[]>([]);
  const [thinking, setThinking] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const serial = useRef({ session: '', sequence: 0 });
  const hostSelection = useRef<{ modelId: string; mode: AgentMode } | null>(null);
  const active = useRef<string | null>(null);
  const retired = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const contextMenu = useRef<HTMLDetailsElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    const listener = (message: MessageEvent<HostMessage>) => {
      const data = message.data;
      if (!data || data.protocolVersion !== 1 || typeof data.hostSessionId !== 'string') return;
      if (serial.current.session !== data.hostSessionId) {
        serial.current = { session: data.hostSessionId, sequence: 0 };
        active.current = null;
        hostSelection.current = null;
        retired.current.clear();
        setThinking({});
      }
      if (data.sequence <= serial.current.sequence) return;
      if (
        serial.current.sequence &&
        data.sequence !== serial.current.sequence + 1 &&
        data.type !== 'Snapshot'
      ) {
        send({ type: 'Ready' });
        return;
      }
      serial.current.sequence = data.sequence;
      if (data.type === 'Snapshot') {
        if (active.current && active.current !== data.snapshot.activeRunId)
          retired.current.add(active.current);
        if (retired.current.size > 200)
          retired.current.delete(retired.current.values().next().value!);
        active.current = data.snapshot.activeRunId;
        setSnapshot((previous) => {
          if (previous?.conversationId !== data.snapshot.conversationId) {
            setActivities([]);
            setThinking({});
          }
          return data.snapshot;
        });
        // Idle attachment/history updates must preserve choices for the next prompt.
        // During a run, both views display the options captured by the host.
        if (
          !hostSelection.current ||
          data.snapshot.activeRunId ||
          hostSelection.current.modelId !== data.snapshot.selectedModelId
        )
          setModel(data.snapshot.selectedModelId);
        if (
          !hostSelection.current ||
          data.snapshot.activeRunId ||
          hostSelection.current.mode !== data.snapshot.mode
        )
          setMode(data.snapshot.mode);
        hostSelection.current = {
          modelId: data.snapshot.selectedModelId,
          mode: data.snapshot.mode,
        };
        setSubmitting(false);
      } else if (data.type === 'Rejected') {
        setError(data.message);
        setSubmitting(false);
      } else if (data.type === 'Accepted') {
        setSubmitting(false);
        if (data.runId && !retired.current.has(data.runId)) {
          active.current = data.runId;
          setSnapshot((previous) =>
            previous ? { ...previous, activeRunId: data.runId } : previous,
          );
        }
      } else if (data.type === 'Event') {
        if (
          data.runId &&
          (retired.current.has(data.runId) || (active.current && active.current !== data.runId))
        )
          return;
        if (data.runId) active.current = data.runId;
        setSnapshot((previous) => {
          if (
            !previous ||
            (previous.activeRunId && data.runId && previous.activeRunId !== data.runId)
          )
            return previous;
          return applyEvent(previous, data.event, data.runId);
        });
        if (data.event.type === 'ThinkingDelta') {
          const event = data.event;
          setThinking((previous) => ({
            ...previous,
            [event.messageId]: ((previous[event.messageId] ?? '') + event.text).slice(-16_000),
          }));
        }
        const text = activityText(data.event);
        if (text)
          setActivities((previous) => {
            const next = [
              ...previous,
              {
                id: data.sequence,
                text: text.slice(0, 30_000),
                error: ['ErrorOccurred', 'ToolBlocked', 'AgentLoopStopped'].includes(
                  data.event.type,
                ),
              },
            ].slice(-200);
            let total = next.reduce((sum, item) => sum + item.text.length, 0);
            while (total > 256_000 && next.length > 1) {
              total -= next.shift()!.text.length;
            }
            return next;
          });
        if (data.event.type === 'ErrorOccurred') setError(data.event.message);
      }
    };
    window.addEventListener('message', listener);
    send({ type: 'Ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [snapshot?.messages, activities]);
  const busy = submitting || Boolean(snapshot?.activeRunId);
  const usage = snapshot?.usage;
  const used = usage
    ? (usage.actualInputTokens ?? usage.estimatedInputTokens) + (usage.actualOutputTokens ?? 0)
    : 0;
  const max = usage?.maxTokens ?? snapshot?.contextMaxTokens ?? 8192;
  const submit = () => {
    if (!prompt.trim() || busy || !snapshot) return;
    setError('');
    setThinking({});
    setSubmitting(true);
    setSnapshot({
      ...snapshot,
      messages: [
        ...snapshot.messages,
        { id: crypto.randomUUID(), role: 'user', content: prompt, partial: false },
      ],
    });
    send({
      type: 'SubmitPrompt',
      prompt,
      modelId: model,
      mode,
      skillId: snapshot.activeSkillId,
      attachmentIds: snapshot.contextAttachments.map((item) => item.id),
    });
    setPrompt('');
  };
  const approval = snapshot?.pendingApproval;
  const choosePrompt = (value: string) => {
    setPrompt(value);
    input.current?.focus();
  };
  const attachContext = (source: 'Selection' | 'CurrentFile' | 'PickFiles') => {
    send({ type: 'AddContext', source });
    if (contextMenu.current) contextMenu.current.open = false;
  };
  return (
    <main className="app">
      <header>
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <div>
            <strong>Kova</strong>
            <span>Local coding assistant</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            title="New conversation"
            aria-label="New conversation"
            onClick={() => {
              send({ type: 'NewConversation' });
              setError('');
            }}
          >
            <Icon name="plus" />
          </button>
          <button
            title="Settings"
            aria-label="Settings"
            onClick={() => send({ type: 'OpenSettings' })}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      <div
        className="conversation"
        ref={scroller}
        onScroll={() => {
          const view = scroller.current;
          if (view)
            nearBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < 100;
        }}
      >
        {!snapshot?.messages.length && (
          <section className="welcome">
            <h1>Ask about your code</h1>
            <p>Attach a file or selection, then tell Kova what you need.</p>
            <div className="suggestions">
              <button
                onClick={() => choosePrompt('Explain the code I attach and suggest improvements.')}
              >
                <Icon name="code" />
                <span>
                  <strong>Explain code</strong>
                  <small>Understand a file or selection</small>
                </span>
                <Icon name="arrow" />
              </button>
              <button
                onClick={() =>
                  choosePrompt('Review my current changes for bugs and architecture issues.')
                }
              >
                <Icon name="review" />
                <span>
                  <strong>Review changes</strong>
                  <small>Check the current Git diff</small>
                </span>
                <Icon name="arrow" />
              </button>
              <button
                onClick={() =>
                  choosePrompt(
                    'Help me plan this change. Inspect relevant code before suggesting an implementation.',
                  )
                }
              >
                <Icon name="plan" />
                <span>
                  <strong>Plan a change</strong>
                  <small>Work out the next steps</small>
                </span>
                <Icon name="arrow" />
              </button>
            </div>
          </section>
        )}
        {snapshot?.messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <div className="message-label">
              {message.role === 'user' ? 'You' : 'Kova'}
              {message.partial && (
                <span className="muted"> {busy ? '· generating' : '· partial'}</span>
              )}
            </div>
            {thinking[message.id] && (
              <details className="thinking">
                <summary>Thinking</summary>
                <pre>{thinking[message.id]}</pre>
              </details>
            )}
            <MessageContent text={message.content} />
            {message.partial && busy && !message.content && !thinking[message.id] && (
              <div className="generating">
                <span />
                <span />
                <span />
                <span>Generating</span>
              </div>
            )}
          </article>
        ))}
        {!!activities.length && (
          <details className="activity" open={Boolean(approval) || busy}>
            <summary>
              <Icon name="chevron" /> Activity <span>{activities.length}</span>
            </summary>
            {activities.map((item) => (
              <details key={item.id} className={`activity-row ${item.error ? 'error' : ''}`}>
                <summary>
                  <span className="activity-dot" />
                  {item.text.split('\n')[0]}
                </summary>
                {item.text.includes('\n') && (
                  <pre>{item.text.slice(item.text.indexOf('\n') + 1)}</pre>
                )}
              </details>
            ))}
          </details>
        )}
        {approval && (
          <section className="approval">
            <div className="eyebrow">
              <Icon name="warning" /> Approval required
            </div>
            <strong>{approval.toolName}</strong>
            <p>{approval.reasons.join(' · ')}</p>
            {approval.preview?.kind === 'FileChanges' && (
              <>
                <p>{approval.preview.relativePaths.join(', ')}</p>
                <button
                  onClick={() => send({ type: 'OpenDiffPreview', approvalId: approval.approvalId })}
                >
                  Inspect diff <Icon name="arrow" />
                </button>
              </>
            )}
            {approval.preview?.kind === 'Command' && <pre>{approval.preview.command}</pre>}
            <div className="approval-buttons">
              <button
                onClick={() =>
                  send({
                    type: 'ResolveApproval',
                    runId: approval.runId,
                    approvalId: approval.approvalId,
                    preparationKey: approval.preparationKey,
                    decision: 'Reject',
                  })
                }
              >
                Reject
              </button>
              <button
                className="primary"
                onClick={() =>
                  send({
                    type: 'ResolveApproval',
                    runId: approval.runId,
                    approvalId: approval.approvalId,
                    preparationKey: approval.preparationKey,
                    decision: 'AllowOnce',
                  })
                }
              >
                Allow once
              </button>
            </div>
          </section>
        )}
      </div>
      <footer>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
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
                ? 'Connecting to Ollama…'
                : snapshot.providerStatus === 'ModelMissing'
                  ? 'Selected model is not installed'
                  : 'Ollama is unavailable'}
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
              onChange={(event) =>
                send({ type: 'SelectSkill', skillId: event.target.value || null })
              }
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
            ref={input}
            disabled={!inVscode}
            maxLength={16000}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
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
                onClick={submit}
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
              aria-label="Local model"
              title={model}
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
            >
              {!snapshot?.models.some((item) => item.id === model) && (
                <option value={model}>{model} · not installed</option>
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
              onChange={(event) => setMode(event.target.value as AgentMode)}
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
          {snapshot?.toolsEnabled ? 'Local · tools enabled' : 'Local · chat only'}
          <span>Enter to send</span>
        </div>
      </footer>
    </main>
  );
}
