import type { WebviewMessage } from '../../../packages/protocol/src/WebviewMessage.js';
import type { HostMessage } from '../../../packages/protocol/src/HostMessage.js';

declare global {
  function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };
}
const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
export const inHost = api !== null;

export function send(
  intent: WebviewMessage extends infer M
    ? M extends WebviewMessage
      ? Omit<M, 'protocolVersion' | 'requestId'>
      : never
    : never,
): string {
  const requestId = crypto.randomUUID();
  api?.postMessage({ ...intent, protocolVersion: 1, requestId } as WebviewMessage);
  return requestId;
}

export function subscribe(listener: (message: HostMessage) => void): () => void {
  const receive = (event: MessageEvent<HostMessage>) => listener(event.data);
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}
