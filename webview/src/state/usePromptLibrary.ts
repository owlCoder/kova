import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PromptLibrary,
  PromptLibraryMessage,
  SavedPrompt,
} from '../../../packages/protocol/src/PromptLibrary.js';
import { send, subscribe } from '../messaging/bridge.js';

/** Mounted only while the library is open; saved text never enters streaming snapshots. */
export function usePromptLibrary() {
  const [library, setLibrary] = useState<PromptLibrary | null>(null);
  const value = useRef(library);
  value.current = library;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef<{
    id: string;
    type: PromptLibraryMessage['type'];
    timer: number;
    resolve(ok: boolean): void;
  } | null>(null);
  const request = useCallback((intent: PromptLibraryMessage, clearError = true) => {
    if (operation.current) return Promise.resolve(false);
    if (clearError) setError('');
    setPending(true);
    return new Promise<boolean>((resolve) => {
      const id = send(intent);
      const timer = window.setTimeout(() => {
        operation.current = null;
        setPending(false);
        setError('The library did not respond. Try loading it again.');
        resolve(false);
      }, 15_000);
      operation.current = { id, type: intent.type, timer, resolve };
    });
  }, []);
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      const current = operation.current;
      if (message.type === 'PromptLibrary') setLibrary(message.library);
      if (message.type !== 'PromptLibrary' && message.type !== 'Rejected') return;
      if (!current || message.requestId !== current.id) return;
      window.clearTimeout(current.timer);
      operation.current = null;
      setPending(false);
      if (message.type === 'Rejected') {
        setError(message.message);
        current.resolve(false);
        if (current.type !== 'GetPromptLibrary') void request({ type: 'GetPromptLibrary' }, false);
      } else current.resolve(true);
    });
    void request({ type: 'GetPromptLibrary' });
    return () => {
      unsubscribe();
      if (operation.current) {
        window.clearTimeout(operation.current.timer);
        operation.current.resolve(false);
        operation.current = null;
      }
    };
  }, [request]);
  return {
    library,
    pending,
    error,
    reload: () => request({ type: 'GetPromptLibrary' }),
    save: (prompt: { id: string | null; title: string; text: string }) =>
      value.current
        ? request({ type: 'SavePrompt', revision: value.current.revision, ...prompt })
        : Promise.resolve(false),
    remove: (prompt: SavedPrompt) =>
      value.current
        ? request({ type: 'DeletePrompt', revision: value.current.revision, id: prompt.id })
        : Promise.resolve(false),
  };
}
