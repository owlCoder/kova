import { useEffect, useRef, useState } from 'react';
import logo from '../../assets/logo.png';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../packages/protocol/src/SessionSnapshot.js';
import type { AgentMode } from '../../packages/protocol/src/AgentMode.js';
import { send, inVscode } from './messaging/bridge.js';
import { activityText, applyEvent } from './state/presentation.js';
import { MessageContent } from './components/MessageContent.js';

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
  const active = useRef<string | null>(null);
  const retired = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    const listener = (message: MessageEvent<HostMessage>) => {
      const data = message.data;
      if (!data || data.protocolVersion !== 1 || typeof data.hostSessionId !== 'string') return;
      if (serial.current.session !== data.hostSessionId) {
        serial.current = { session: data.hostSessionId, sequence: 0 };
        active.current = null;
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
        setModel(data.snapshot.selectedModelId);
        setMode(data.snapshot.mode);
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
  return (
    <main className="app">
      <header>
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <strong>KOVA</strong>
          <span className="local">LOCAL</span>
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
            ＋
          </button>
          <button
            title="Settings"
            aria-label="Settings"
            onClick={() => send({ type: 'OpenSettings' })}
          >
            ⚙
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
            <img className="welcome-logo" src={logo} alt="Kova" />
            <h1>Kova</h1>
            <p>
              Local coding assistant for VS Code.
              <br />
              Ask a question or attach code to get started.
            </p>
            <div className="suggestions">
              <button
                onClick={() => setPrompt('Explain the code I attach and suggest improvements.')}
              >
                Explain code <span>↗</span>
              </button>
              <button
                onClick={() =>
                  setPrompt('Review my current changes for bugs and architecture issues.')
                }
              >
                Review my changes <span>↗</span>
              </button>
            </div>
            <small>Runs locally with Ollama</small>
          </section>
        )}
        {snapshot?.messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <div className="message-label">
              {message.role === 'user' ? 'YOU' : 'KOVA'}
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
          </article>
        ))}
        {!!activities.length && (
          <details className="activity" open={Boolean(approval)}>
            <summary>
              Activity <span>{activities.length}</span>
            </summary>
            {activities.map((item) => (
              <div key={item.id} className={`activity-row ${item.error ? 'error' : ''}`}>
                <pre>{item.text}</pre>
              </div>
            ))}
          </details>
        )}
        {approval && (
          <section className="approval">
            <div className="eyebrow">APPROVAL REQUIRED</div>
            <strong>{approval.toolName}</strong>
            <p>{approval.reasons.join(' · ')}</p>
            {approval.preview?.kind === 'FileChanges' && (
              <>
                <p>{approval.preview.relativePaths.join(', ')}</p>
                <button
                  onClick={() => send({ type: 'OpenDiffPreview', approvalId: approval.approvalId })}
                >
                  Inspect diff ↗
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
              ×
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
        {snapshot && (
          <div className="context">
            <div>
              <span>
                Context {used.toLocaleString()} / {max.toLocaleString()}
              </span>
              <span>{usage?.actualInputTokens === null || !usage ? 'estimated' : 'measured'}</span>
            </div>
            <progress value={Math.min(used, max)} max={max} />
            <small>
              Tool definitions {usage?.toolDefinitionTokens ?? 0} tokens
              {usage?.actualOutputTokens !== null && usage
                ? ` · Output ${usage.actualOutputTokens}`
                : ''}
              {usage?.evictions.length ? ` · ${usage.evictions.length} context reductions` : ''}
            </small>
          </div>
        )}
        {!!snapshot?.contextAttachments.length && (
          <div className="attachments">
            {snapshot.contextAttachments.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                onClick={() => send({ type: 'RemoveContext', attachmentId: item.id })}
              >
                {item.label} ×
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
          <div className="composer-bar">
            <details className="attach-menu">
              <summary title="Add context">＋</summary>
              <div>
                <button
                  disabled={busy}
                  onClick={() => send({ type: 'AddContext', source: 'Selection' })}
                >
                  Selection
                </button>
                <button
                  disabled={busy}
                  onClick={() => send({ type: 'AddContext', source: 'CurrentFile' })}
                >
                  Current file
                </button>
                <button
                  disabled={busy}
                  onClick={() => send({ type: 'AddContext', source: 'PickFiles' })}
                >
                  Choose files…
                </button>
              </div>
            </details>
            <select
              aria-label="Local model"
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
            >
              {!snapshot?.models.some((item) => item.id === model) && (
                <option value={model}>{model} · not installed</option>
              )}
              {snapshot?.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName} · {(item.sizeBytes / 1e9).toFixed(1)} GB
                  {item.tools !== 'Supported' ? ' · chat only' : ''}
                </option>
              ))}
            </select>
            <select
              aria-label="Agent mode"
              value={mode}
              disabled={busy}
              onChange={(event) => setMode(event.target.value as AgentMode)}
            >
              {(['Plan', 'Manual', 'Edit', 'Auto'] as const).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {busy ? (
              <button
                className="send stop"
                title="Stop generation"
                aria-label="Stop generation"
                onClick={() =>
                  snapshot?.activeRunId && send({ type: 'CancelRun', runId: snapshot.activeRunId })
                }
              >
                ■
              </button>
            ) : (
              <button
                className="send"
                title="Send"
                aria-label="Send"
                disabled={!prompt.trim() || !snapshot?.models.some((item) => item.id === model)}
                onClick={submit}
              >
                ↑
              </button>
            )}
          </div>
        </div>
        <div className="footer-note">
          <span
            className={`status-dot ${snapshot?.providerStatus === 'Available' ? 'online' : ''}`}
          />
          {snapshot?.toolsEnabled ? 'Local model · tools available' : 'Local model · chat only'}
          <span>↵ send · ⇧↵ newline</span>
        </div>
      </footer>
    </main>
  );
}
