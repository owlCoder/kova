import { useEffect, useRef, useState, type CSSProperties } from 'react';

export type PopoverOptions = {
  disabled?: boolean;
  minimumWidth?: number;
  /** 'end' right-aligns the panel with the trigger (context meter). */
  align?: 'start' | 'end';
  focusSearch?: boolean;
};

/**
 * Native light-dismiss popover: clicking empty space closes it, Escape closes
 * it, and opening one closes the others (only one auto popover in the top
 * layer). Upward placement floats the panel above the whole composer.
 */
export function usePopover({
  disabled = false,
  minimumWidth = 340,
  align = 'start',
  focusSearch = false,
}: PopoverOptions = {}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const place = () => {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    if (rect.bottom <= 8 || rect.top >= window.innerHeight - 8) {
      if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
      return;
    }
    // Menus float above the whole composer, not above the trigger inside it.
    const anchor = (trigger.current.closest('.composer') as HTMLElement | null) ?? trigger.current;
    const anchorRect = anchor.getBoundingClientRect();
    const above = anchorRect.top - 16;
    const below = window.innerHeight - rect.bottom - 16;
    const upward = below < 260 && above > below;
    const width = Math.min(Math.max(rect.width, minimumWidth), window.innerWidth - 24);
    const rawLeft = align === 'end' ? rect.right - width : rect.left;
    setPosition({
      width,
      left: Math.max(12, Math.min(rawLeft, window.innerWidth - width - 12)),
      top: upward ? 'auto' : rect.bottom + 8,
      bottom: upward ? window.innerHeight - anchorRect.top + 8 : 'auto',
      maxHeight: Math.min(380, Math.max(100, upward ? above : below)),
    });
  };
  const show = () => {
    if (disabled || !panel.current || !trigger.current) return;
    place();
    if (!panel.current.matches(':popover-open'))
      panel.current.showPopover({ source: trigger.current });
  };
  const hide = (restore = false) => {
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const popup = panel.current;
    let frame = 0;
    const toggle = () => {
      const shown = Boolean(popup?.matches(':popover-open'));
      setOpen(shown);
      cancelAnimationFrame(frame);
      if (shown && focusSearch) frame = requestAnimationFrame(() => search.current?.focus());
    };
    const blur = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) hide();
    };
    popup?.addEventListener('toggle', toggle);
    document.addEventListener('focusin', blur);
    return () => {
      cancelAnimationFrame(frame);
      popup?.removeEventListener('toggle', toggle);
      document.removeEventListener('focusin', blur);
    };
  }, [focusSearch]);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const update = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      place();
    };
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [open]);
  return { root, trigger, panel, search, open, position, show, hide };
}
