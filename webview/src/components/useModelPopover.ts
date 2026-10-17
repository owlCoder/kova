import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** Native light-dismiss behavior, with viewport placement and focus scoped to the control. */
export function useModelPopover(allowCustom: boolean, disabled: boolean) {
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
    const above = rect.top - 16;
    const below = window.innerHeight - rect.bottom - 16;
    const upward = below < 260 && above > below;
    const width = Math.min(Math.max(rect.width, 340), window.innerWidth - 24);
    setPosition({
      width,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: upward ? 'auto' : rect.bottom + 8,
      bottom: upward ? window.innerHeight - rect.top + 8 : 'auto',
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
      if (shown && !allowCustom) frame = requestAnimationFrame(() => search.current?.focus());
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
  }, [allowCustom]);
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
