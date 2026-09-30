import type { WebviewMessage } from '../../../packages/protocol/src/WebviewMessage.js';

declare global {
  function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };
}
const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
export function send(
  intent: WebviewMessage extends infer M
    ? M extends WebviewMessage
      ? Omit<M, 'protocolVersion' | 'requestId'>
      : never
    : never,
): void {
  api?.postMessage({
    ...intent,
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
  } as WebviewMessage);
}
export const inVscode = api !== null;
