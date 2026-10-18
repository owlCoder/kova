import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PromptLibrary,
  PromptLibraryMessage,
  SavedPrompt,
} from '../../../packages/protocol/src/PromptLibrary.js';
import { send, subscribe } from '../messaging/bridge.js';
import type { PromptEdit } from './PromptEdit.js';
import { savePromptIntent } from './savePromptIntent.js';

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
    save: (prompt: PromptEdit) => {
      if (!value.current) return Promise.resolve(false);
      try {
        return request(savePromptIntent(value.current, prompt));
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Request failed.');
        return Promise.resolve(false);
      }
    },
    remove: (prompt: SavedPrompt, revision: string) =>
      value.current
        ? request({ type: 'DeletePrompt', revision, id: prompt.id })
        : Promise.resolve(false),
  };
}
