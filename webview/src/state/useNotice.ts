import { useEffect, useState } from 'react';
import { subscribe } from '../messaging/bridge.js';

/** Host notices and rejected intents shown as a dismissible toast. */
export function useNotice() {
  const [notice, setNotice] = useState('');
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'Notice' || message.type === 'Rejected') setNotice(message.message);
      }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timeout);
  }, [notice]);
  return { notice, setNotice };
}
