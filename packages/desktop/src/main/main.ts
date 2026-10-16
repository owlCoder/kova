import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session as electronSession,
  nativeTheme,
} from 'electron';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DesktopStore } from '../state/DesktopStore.js';
import { DesktopKeyStore } from '../state/DesktopKeyStore.js';
import { DesktopSession } from './DesktopSession.js';
import { DesktopController } from './DesktopController.js';

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  let window: BrowserWindow | null = null;
  let agent: DesktopSession | null = null;
  let closing = false;
  app.setName('Kova');
  if (process.env.KOVA_DESKTOP_DATA) app.setPath('userData', process.env.KOVA_DESKTOP_DATA);
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      const store = new DesktopStore(app.getPath('userData'));
      const keys = new DesktopKeyStore(app.getPath('userData'));
      await store.load();
      await keys.load();
      nativeTheme.themeSource = store.preferences.theme;
      const renderer = join(__dirname, '../renderer/index.html');
      const rendererUrl = pathToFileURL(renderer).href;
      const devUrl = !app.isPackaged ? process.env.KOVA_DESKTOP_DEV_URL : undefined;
      if (devUrl && !['127.0.0.1', 'localhost'].includes(new URL(devUrl).hostname))
        throw new Error('The development server must use loopback.');
      window = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 960,
        minHeight: 640,
        title: 'Kova',
        backgroundColor: '#111315',
        show: false,
        titleBarStyle: 'hiddenInset',
        ...(process.platform === 'darwin'
          ? { trafficLightPosition: { x: 18, y: 20 } }
          : { titleBarOverlay: { color: '#111315', symbolColor: '#b8bbc2', height: 48 } }),
        webPreferences: {
          preload: join(__dirname, '../preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      const currentWindow = window;
      agent = new DesktopSession(store, keys, (message) => {
        if (!currentWindow.isDestroyed()) currentWindow.webContents.send('kova:message', message);
      });
      const controller = new DesktopController(agent, currentWindow);
      electronSession.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      electronSession.defaultSession.setPermissionCheckHandler(() => false);
      currentWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      currentWindow.webContents.on('will-navigate', (event) => event.preventDefault());
      ipcMain.on('kova:send', (event, message: unknown) => {
        const allowed = devUrl ? new URL(devUrl).origin : rendererUrl;
        const sender = event.senderFrame;
        if (
          event.sender !== currentWindow.webContents ||
          !sender ||
          sender !== event.sender.mainFrame ||
          (devUrl ? new URL(sender.url).origin !== allowed : sender.url !== rendererUrl)
        )
          return;
        void controller.handle(message);
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === 'darwin'
            ? [
                {
                  label: 'Kova',
                  submenu: [
                    { role: 'about' as const },
                    { type: 'separator' as const },
                    { role: 'quit' as const },
                  ],
                },
              ]
            : []),
          {
            label: 'File',
            submenu: [
              {
                label: 'Open Project…',
                accelerator: 'CmdOrCtrl+O',
                click: () => {
                  void controller.handle({
                    protocolVersion: 1,
                    requestId: randomUUID(),
                    type: 'OpenWorkspace',
                  });
                },
              },
              {
                label: 'New Session',
                accelerator: 'CmdOrCtrl+N',
                click: () => {
                  void agent?.newConversation().catch(() => {});
                },
              },
              {
                label: 'Settings',
                accelerator: 'CmdOrCtrl+,',
                click: () => agent?.send({ type: 'OpenPreferences' }),
              },
              { type: 'separator' },
              { role: 'close' },
            ],
          },
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
          {
            label: 'View',
            submenu: [
              { role: 'togglefullscreen' },
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const }] : []),
            ],
          },
        ]),
      );
      currentWindow.once('ready-to-show', () => currentWindow.show());
      if (devUrl) await currentWindow.loadURL(devUrl);
      else await currentWindow.loadFile(renderer);
      void agent.initialize().catch((error: unknown) =>
        agent?.send({
          type: 'Notice',
          message: error instanceof Error ? error.message : 'Could not initialize Kova.',
        }),
      );
    })
    .catch((error: unknown) => {
      console.error(
        'Kova startup failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (closing) return;
    closing = true;
    event.preventDefault();
    void agent?.dispose().finally(() => app.quit());
    if (!agent) app.quit();
  });
}
