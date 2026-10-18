import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Render recent Markdown first. Explicit history/search expansion preserves the reading position. */
export function useHistoryWindow(
  total: number,
  searching: boolean,
  followLatest: boolean,
  scroller: RefObject<HTMLDivElement | null>,
  thread: RefObject<HTMLDivElement | null>,
) {
  const recent = Math.max(0, total - 40);
  const [window, setWindow] = useState({ start: searching ? 0 : recent, all: searching });
  const anchor = useRef<{ node: HTMLElement; top: number } | null>(null);
  const bottom = useRef(false);
  const expanded = useRef(searching);
  const capture = () => {
    // The first article changes its top padding when older articles are inserted.
    const node = thread.current?.querySelector<HTMLElement>('.message-label');
    if (node) anchor.current = { node, top: node.getBoundingClientRect().top };
  };
  useLayoutEffect(() => {
    if (searching && !window.all) {
      expanded.current = true;
      capture();
      setWindow({ start: 0, all: true });
    } else if (!expanded.current && followLatest && total - window.start > 60) {
      bottom.current = true;
      setWindow({ start: recent, all: false });
    }
  }, [searching, total, followLatest, window.all, window.start, recent]);
  useLayoutEffect(() => {
    const view = scroller.current;
    if (!view) return;
    if (bottom.current) view.scrollTop = view.scrollHeight;
    else if (anchor.current?.node.isConnected)
      view.scrollTop += anchor.current.node.getBoundingClientRect().top - anchor.current.top;
    anchor.current = null;
    bottom.current = false;
  }, [window.start, scroller]);
  return {
    start: Math.min(window.start, total),
    showRecent: window.all || window.start < recent,
    earlier: () => {
      if (!window.start) return;
      expanded.current = true;
      capture();
      setWindow({ start: Math.max(0, window.start - 40), all: false });
    },
    latest: () => {
      expanded.current = false;
      bottom.current = true;
      setWindow({ start: recent, all: false });
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLTextAreaElement>('.composer textarea')
          ?.focus({ preventScroll: true }),
      );
    },
  };
}
