import { useEffect, type RefObject } from 'react';

/** Keep keyboard navigation inside a dialog and return to its opener when it closes. */
export function useDialogFocus(dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opener = document.activeElement;
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
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const trap = (event: KeyboardEvent) => {
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
        if (opener instanceof HTMLElement && opener.isConnected && !opener.closest('[inert]'))
          opener.focus({ preventScroll: true });
      });
    };
  }, [dialog]);
}
