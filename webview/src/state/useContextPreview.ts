import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContextPreview } from '../../../packages/protocol/src/ContextAttachmentView.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { send, subscribe } from '../messaging/bridge.js';

/** Only the latest explicit request can open a preview, in its original conversation. */
export function useContextPreview(snapshot: SessionSnapshot | null, blocked: boolean) {
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const current = useRef({ snapshot, blocked });
  current.current = { snapshot, blocked };
  const pending = useRef<{
    requestId: string;
    conversationId: string;
    attachmentId: string;
  } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    pending.current = null;
    setPreview(null);
    requestAnimationFrame(() => {
      const control = opener.current?.isConnected
        ? opener.current
        : document.querySelector<HTMLTextAreaElement>('.composer textarea');
      if (control && !control.closest('[inert]')) control.focus({ preventScroll: true });
    });
  }, []);
  const open = useCallback((attachmentId: string) => {
    const { snapshot, blocked } = current.current;
    if (!snapshot || blocked) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestId = send({
      type: 'PreviewContext',
      conversationId: snapshot.conversationId,
      attachmentId,
    });
    pending.current = { requestId, conversationId: snapshot.conversationId, attachmentId };
  }, []);
  useEffect(
    () =>
      subscribe((message) => {
        const request = pending.current;
        if (message.type === 'Rejected' && message.requestId === request?.requestId)
          pending.current = null;
        if (message.type !== 'ContextPreview' || message.requestId !== request?.requestId) return;
        pending.current = null;
        const { snapshot, blocked } = current.current;
        if (
          !blocked &&
          snapshot?.conversationId === request.conversationId &&
          message.preview.conversationId === request.conversationId &&
          message.preview.id === request.attachmentId &&
          snapshot.contextAttachments.some((item) => item.id === request.attachmentId)
        )
          setPreview(message.preview);
      }),
    [],
  );
  useEffect(() => {
    if (
      preview &&
      (blocked ||
        preview.conversationId !== snapshot?.conversationId ||
        !snapshot.contextAttachments.some((item) => item.id === preview.id))
    )
      close();
  }, [preview, blocked, snapshot?.conversationId, snapshot?.contextAttachments, close]);
  return { preview, open, close };
}
