import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
// DESKTOP_EXECUTABLE を指定するとパッケージ済みアプリ（electron-builder --dir の出力）を検証する
const executablePath = process.env.DESKTOP_EXECUTABLE;

test(
  'Electron loads the shared UI in a sandbox and releases its server on exit',
  { timeout: 30000 },
  async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'todo-desktop-'));
    let desktop;
    try {
      desktop = await electron.launch(
        executablePath
          ? { executablePath, args: [`--user-data-dir=${userData}`] }
          : { args: [root, `--user-data-dir=${userData}`] },
      );
      const page = await desktop.firstWindow();
      await page.getByRole('button', { name: 'ログイン', exact: true }).waitFor();
      assert.equal(new URL(page.url()).origin, 'http://127.0.0.1:17880');
      assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
      const preferences = await desktop.evaluate(({ BrowserWindow }) => {
        const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
        return {
          sandbox: prefs.sandbox,
          contextIsolation: prefs.contextIsolation,
          nodeIntegration: prefs.nodeIntegration,
        };
      });
      assert.deepEqual(preferences, {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      });
      await page.reload();
      await page.getByLabel('Backend URL').waitFor();
      await desktop.close();
      desktop = null;
      await assert.rejects(fetch('http://127.0.0.1:17880'));
    } finally {
      await desktop?.close();
      await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  },
);
