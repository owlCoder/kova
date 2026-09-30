import { useEffect, useRef, useState } from 'react';
import logo from '../../assets/logo.png';
import type { AgentMode } from '../../packages/protocol/src/AgentMode.js';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../packages/protocol/src/SessionSnapshot.js';
import { ChatFooter } from './components/ChatFooter.js';
import { Icon } from './components/Icon.js';
import { MessageContent } from './components/MessageContent.js';
import { send } from './messaging/bridge.js';
import { activityText, applyEvent } from './state/presentation.js';

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

  return (
    <main className="app">
      <header>
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <div>
            <strong>Kova</strong>
            <span>Coding assistant</span>
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
      <ChatFooter
        snapshot={snapshot}
        busy={busy}
        error={error}
        prompt={prompt}
        model={model}
        mode={mode}
        inputRef={input}
        onDismissError={() => setError('')}
        onPromptChange={setPrompt}
        onSubmit={submit}
        onModelChange={setModel}
        onModeChange={setMode}
      />
    </main>
  );
}
