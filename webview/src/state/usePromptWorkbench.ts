import { useCallback, useEffect, useRef, useState } from 'react';

/** Capture focus before the lazy dialog loads and the workspace becomes inert. */
export function usePromptWorkbench(blocked: boolean) {
  const [library, setLibrary] = useState<{ seed: string | null } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((seed: string | null = null) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLibrary({ seed });
  }, []);
  const close = useCallback(() => {
    setLibrary(null);
    requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const target = opener.current?.isConnected
        ? opener.current
        : document.querySelector<HTMLTextAreaElement>('.composer textarea');
      if (target && !target.closest('[inert]')) target.focus({ preventScroll: true });
    });
  }, []);
  useEffect(() => {
    if (blocked) setLibrary(null);
  }, [blocked]);
  return { library, open, close };
}
