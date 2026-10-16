import { contextBridge, ipcRenderer } from 'electron';
import type { HostMessage } from '../../protocol/src/HostMessage.js';
import type { WebviewMessage } from '../../protocol/src/WebviewMessage.js';

contextBridge.exposeInMainWorld(
  'kovaDesktop',
  Object.freeze({
    send: (message: WebviewMessage) => ipcRenderer.send('kova:send', message),
    subscribe: (callback: (message: HostMessage) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: HostMessage) =>
        callback(message);
      ipcRenderer.on('kova:message', listener);
      return () => {
        ipcRenderer.removeListener('kova:message', listener);
      };
    },
  }),
);
