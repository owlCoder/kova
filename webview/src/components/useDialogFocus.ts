import { useEffect, useRef, type RefObject } from 'react';

/** Keep keyboard navigation inside a dialog and return to its opener when it closes. */
export function useDialogFocus(
  dialog: RefObject<HTMLElement | null>,
  onClose?: () => void,
  preventClose = false,
) {
  const close = useRef(onClose);
  const locked = useRef(preventClose);
  close.current = onClose;
  locked.current = preventClose;
  useEffect(() => {
    const opener = document.activeElement;
    const container = dialog.current;
    const controls = () =>
      [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(':disabled,[inert]') &&
          element.getClientRects().length,
      );
    const frame = requestAnimationFrame(() => {
      const preferred = container?.querySelector<HTMLElement>('[data-dialog-focus]');
      (preferred && !preferred.matches(':disabled') ? preferred : controls()[0])?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape' && !locked.current && close.current) {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) return;
      if (!dialog.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trap);
      requestAnimationFrame(() => {
        // Preserve deliberate focus transfers, such as a palette opening conversation search.
        const focused = document.activeElement;
        if (
          focused !== document.body &&
          focused !== document.documentElement &&
          !container?.contains(focused)
        )
          return;
        if (opener instanceof HTMLElement && opener.isConnected && !opener.closest('[inert]'))
          opener.focus({ preventScroll: true });
      });
    };
  }, [dialog]);
}
