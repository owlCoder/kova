import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { send } from '../messaging/bridge.js';

/** Keep immediate edits local; persist a bounded draft without messaging on every keystroke. */
export function useComposerDraft(conversationId: string | undefined, hostDraft: string) {
  const [prompt, update] = useState('');
  const current = useRef({ id: '', text: '' });
  const drafts = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    if (current.current.id)
      send({
        type: 'UpdateDraft',
        conversationId: current.current.id,
        prompt: current.current.text,
      });
  }, []);
  useLayoutEffect(() => {
    if (!conversationId || current.current.id === conversationId) return;
    flush();
    const text = drafts.current.get(conversationId) ?? hostDraft;
    current.current = { id: conversationId, text };
    update(text);
  }, [conversationId, hostDraft, flush]);
  useLayoutEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
  const setPrompt = useCallback(
    (value: string) => {
      const text = value.slice(0, 16_000);
      current.current.text = text;
      const id = current.current.id;
      if (id) {
        drafts.current.delete(id);
        drafts.current.set(id, text);
        while (drafts.current.size > 20) drafts.current.delete(drafts.current.keys().next().value!);
      }
      update(text);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, text ? 350 : 0);
    },
    [flush],
  );
  const getPrompt = useCallback(() => current.current.text, []);
  return { prompt, setPrompt, getPrompt };
}
