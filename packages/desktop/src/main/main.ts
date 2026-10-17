import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session as electronSession,
  nativeTheme,
} from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDesktopMenu } from './createDesktopMenu.js';
import { DesktopStore } from '../state/DesktopStore.js';
import { DesktopKeyStore } from '../state/DesktopKeyStore.js';
import { DesktopSession } from './DesktopSession.js';
import { DesktopController } from './DesktopController.js';

app.setName('Kova');
if (process.env.KOVA_DESKTOP_DATA) app.setPath('userData', process.env.KOVA_DESKTOP_DATA);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  let window: BrowserWindow | null = null;
  let agent: DesktopSession | null = null;
  let desktopController: DesktopController | null = null;
  let closing = false;
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
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        ...(process.platform === 'darwin'
          ? { trafficLightPosition: { x: 18, y: 18 } }
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
      const applyChrome = () => {
        if (currentWindow.isDestroyed()) return;
        const light = !nativeTheme.shouldUseDarkColors;
        currentWindow.setBackgroundColor(light ? '#f5f6f7' : '#111315');
        if (process.platform !== 'darwin')
          currentWindow.setTitleBarOverlay({
            color: light ? '#f5f6f7' : '#111315',
            symbolColor: light ? '#20242b' : '#b8bbc2',
            height: 46,
          });
      };
      const controller = (desktopController = new DesktopController(agent, currentWindow, () => {
        applyChrome();
        if (agent) Menu.setApplicationMenu(createDesktopMenu(controller, agent, app.isPackaged));
      }));
      const windowState = () =>
        agent?.send({
          type: 'WindowState',
          maximized: currentWindow.isMaximized(),
          fullscreen: currentWindow.isFullScreen(),
          focused: currentWindow.isFocused(),
        });
      currentWindow.on('maximize', windowState);
      currentWindow.on('unmaximize', windowState);
      currentWindow.on('enter-full-screen', windowState);
      currentWindow.on('leave-full-screen', windowState);
      currentWindow.on('focus', windowState);
      currentWindow.on('blur', windowState);
      nativeTheme.on('updated', applyChrome);
      applyChrome();
      electronSession.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      electronSession.defaultSession.setPermissionCheckHandler(() => false);
      currentWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      currentWindow.webContents.on('will-navigate', (event, destination) => {
        if (!devUrl || new URL(destination).origin !== new URL(devUrl).origin)
          event.preventDefault();
      });
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
      Menu.setApplicationMenu(createDesktopMenu(controller, agent, app.isPackaged));
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
    desktopController?.terminal.close();
    void agent?.dispose().finally(() => app.quit());
    if (!agent) app.quit();
  });
}
