import { useEffect, useRef, useState } from 'react';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import type { HostMessage } from '../../../packages/protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { send, subscribe } from '../messaging/bridge.js';
import { useComposerDraft } from './useComposerDraft.js';
import { activityText, applyEvent } from './presentation.js';

export function useChat() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const { prompt, setPrompt, getPrompt } = useComposerDraft(
    snapshot?.conversationId,
    snapshot?.draft ?? '',
  );
  const pendingSubmit = useRef<{ id: string; text: string; conversationId: string } | null>(null);
  const [model, setModel] = useState('qwen3:4b');
  const [mode, setMode] = useState<AgentMode>('Manual');
  const [activities, setActivities] = useState<{ id: number; text: string; error: boolean }[]>([]);
  const [thinking, setThinking] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const serial = useRef({ session: '', sequence: 0 });
  const hostSelection = useRef<{ modelId: string; mode: AgentMode } | null>(null);
  const active = useRef<string | null>(null);
  const currentConversation = useRef('');
  const retired = useRef(new Set<string>());

  useEffect(() => {
    const listener = (data: HostMessage) => {
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
        currentConversation.current = data.snapshot.conversationId;
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
        if (
          data.requestId === 'provider-configuration' &&
          data.snapshot.providerStatus === 'Available'
        )
          setError('');
        setSubmitting(false);
      } else if (data.type === 'Rejected') {
        if (pendingSubmit.current?.id === data.requestId) {
          if (pendingSubmit.current.conversationId === currentConversation.current && !getPrompt())
            setPrompt(pendingSubmit.current.text);
          pendingSubmit.current = null;
        }
        setError(data.message);
        setSubmitting(false);
        send({ type: 'Ready' });
      } else if (data.type === 'Accepted') {
        if (pendingSubmit.current?.id === data.requestId) {
          pendingSubmit.current = null;
          setSubmitting(false);
        }
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
    const unsubscribe = subscribe(listener);
    send({ type: 'Ready' });
    return unsubscribe;
  }, [getPrompt, setPrompt]);

  const busy =
    submitting || Boolean(snapshot?.activeRunId) || Boolean(snapshot?.configuringProvider);

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
    const id = send({
      type: 'SubmitPrompt',
      prompt,
      modelId: model,
      mode,
      skillId: snapshot.activeSkillId,
      attachmentIds: snapshot.contextAttachments.map((item) => item.id),
    });
    pendingSubmit.current = { id, text: prompt, conversationId: snapshot.conversationId };
    setPrompt('');
  };
  return {
    snapshot,
    prompt,
    setPrompt,
    model,
    setModel,
    mode,
    setMode,
    activities,
    thinking,
    error,
    dismissError: () => setError(''),
    busy,
    submit,
  };
}
