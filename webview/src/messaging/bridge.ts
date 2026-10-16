import type { WebviewMessage } from '../../../packages/protocol/src/WebviewMessage.js';
import type { HostMessage } from '../../../packages/protocol/src/HostMessage.js';

declare global {
  function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };
  interface Window {
    kovaDesktop?: {
      send(message: WebviewMessage): void;
      subscribe(callback: (message: HostMessage) => void): () => void;
    };
  }
}
const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
export const isDesktop = typeof window !== 'undefined' && Boolean(window.kovaDesktop);
export const inVscode = api !== null;
export const inHost = inVscode || isDesktop;

export function send(
  intent: WebviewMessage extends infer M
    ? M extends WebviewMessage
      ? Omit<M, 'protocolVersion' | 'requestId'>
      : never
    : never,
): string {
  const requestId = crypto.randomUUID();
  const message = { ...intent, protocolVersion: 1, requestId } as WebviewMessage;
  if (window.kovaDesktop) window.kovaDesktop.send(message);
  else api?.postMessage(message);
  return requestId;
}

export function subscribe(listener: (message: HostMessage) => void): () => void {
  if (window.kovaDesktop) return window.kovaDesktop.subscribe(listener);
  const receive = (event: MessageEvent<HostMessage>) => listener(event.data);
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}
