import { app, BrowserWindow, dialog, Menu, session } from 'electron';
import { watch } from 'node:fs';
import { createFrontendServer } from '../src/frontend-server.js';

// A stable origin keeps browser storage and the backend CORS allowlist predictable.
const origin = 'http://127.0.0.1:17880';
const development = !app.isPackaged && process.argv.includes('--dev');
let server;
let window;
let watcher;
let reloadTimer;

function createWindow() {
  window = new BrowserWindow({
    title: 'Everyday To Do',
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: '#f5f5f5',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    window = null;
  });
  return window.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    clearTimeout(reloadTimer);
    watcher?.close();
    server?.close();
    server?.closeAllConnections();
  });

  app.whenReady().then(async () => {
    try {
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.on('will-download', (event) => event.preventDefault());
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { label: 'ファイル', submenu: [{ role: 'quit', label: '終了' }] },
          {
            label: '編集',
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
            label: '表示',
            submenu: [
              { role: 'reload', label: '再読み込み' },
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { role: 'togglefullscreen' },
              ...(development ? [{ role: 'toggleDevTools' }] : []),
            ],
          },
        ]),
      );
      server = createFrontendServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(17880, '127.0.0.1', resolve);
      });
      await createWindow();
      if (development) {
        watcher = watch(new URL('../public/', import.meta.url), { recursive: true }, () => {
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => {
            if (window && !window.isDestroyed()) window.webContents.reloadIgnoringCache();
          }, 200);
        });
      }
    } catch (error) {
      dialog.showErrorBox(
        'Everyday To Doを起動できません',
        error.code === 'EADDRINUSE'
          ? 'ポート17880が使用されています。使用中のアプリを終了して再起動してください。'
          : error.message,
      );
      app.quit();
    }
  });
}
