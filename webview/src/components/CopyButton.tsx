import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { send, subscribe } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

/** Report success only after the host clipboard write succeeds; subscribe only while pending. */
export function CopyButton({
  text,
  label,
  caption,
  className,
  size = 13,
}: {
  text: string;
  label: string;
  caption?: string;
  className?: string;
  size?: number;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'pending' | 'copied'>('idle');
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const disabled = text.length > 60_000 || state === 'pending';
  const description =
    text.length > 60_000
      ? 'Select and copy a smaller section (60,000 character limit).'
      : state === 'copied'
        ? 'Copied'
        : label;
  return (
    <button
      className={className}
      title={t(description)}
      aria-label={t(description)}
      disabled={disabled}
      data-copied={state === 'copied' ? true : undefined}
      onClick={() => {
        cleanup.current?.();
        setState('pending');
        let requestId = '';
        const unsubscribe = subscribe((message) => {
          if (
            (message.type !== 'ClipboardCopied' && message.type !== 'Rejected') ||
            message.requestId !== requestId
          )
            return;
          unsubscribe();
          window.clearTimeout(timer);
          setState(message.type === 'ClipboardCopied' ? 'copied' : 'idle');
          const reset = window.setTimeout(() => setState('idle'), 2200);
          cleanup.current = () => window.clearTimeout(reset);
        });
        const timer = window.setTimeout(() => {
          unsubscribe();
          setState('idle');
          cleanup.current = null;
        }, 5000);
        cleanup.current = () => {
          unsubscribe();
          window.clearTimeout(timer);
        };
        requestId = send({ type: 'CopyText', text });
      }}
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={size} />
      {caption && <span aria-live="polite">{t(state === 'copied' ? 'Copied' : caption)}</span>}
    </button>
  );
}
