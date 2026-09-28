import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test(
  'browser: tasks, memo and table modes persist, remain searchable and fit mobile',
  { timeout: 30000 },
  async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'everyday-e2e-'));
    const frontend = spawn(process.execPath, ['src/frontend.js'], {
      cwd: root,
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const frontendUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        frontend.kill();
        reject(Error('frontend timeout'));
      }, 10000);
      frontend.stdout.on('data', (part) => {
        const match = String(part).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      frontend.once('error', reject);
    });
    const child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        DATA_DIR: dataDir,
        AUTH_USERNAME: 'tester',
        AUTH_PASSWORD: 'test-password-123',
        SEED_DATA: 'false',
        CORS_ORIGINS: frontendUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let browser;
    try {
      const base = await new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(Error('server startup timed out')), 10000);
        child.stdout.on('data', (part) => {
          output += part;
          const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (match) {
            clearTimeout(timer);
            resolve(match[0]);
          }
        });
        child.once('error', reject);
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(Error(`server exited early: ${code}`));
        });
      });
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(frontendUrl);
      await page.getByLabel('Backend URL').fill(base);
      await page.getByLabel('ユーザー名').fill('tester');
      await page.getByLabel('パスワード').fill('test-password-123');
      await page.getByRole('button', { name: 'ログイン', exact: true }).click();
      await page.getByRole('heading', { name: 'タスク', exact: true }).waitFor();
      await page.getByRole('textbox', { name: '新しいタスク' }).fill('E2E テストのタスク');
      await page.getByRole('textbox', { name: '新しいタスク' }).press('Enter');
      const task = page.locator('article.task').filter({ hasText: 'E2E テストのタスク' });
      await task.waitFor();
      await task.getByRole('button', { name: 'E2E テストのタスク' }).click();
      await page.getByRole('textbox', { name: 'メモ' }).fill('再読み込みしても残る');
      await page.getByRole('button', { name: 'メモを保存' }).click();
      await page.getByRole('button', { name: '今日の予定に追加' }).click();
      await task.getByRole('button', { name: '重要マークを切り替える' }).click();
      await page.reload();
      await page.getByRole('heading', { name: 'タスク', exact: true }).waitFor();
      await task.getByRole('button', { name: 'E2E テストのタスク' }).click();
      assert.equal(
        await page.getByRole('textbox', { name: 'メモ' }).inputValue(),
        '再読み込みしても残る',
      );
      await page.getByRole('button', { name: '詳細を閉じる' }).click();
      await page.getByRole('textbox', { name: 'タスクを検索' }).fill('再読み込みしても残る');
      await page.getByRole('heading', { name: '検索結果' }).waitFor();
      await page.getByRole('button', { name: 'E2E テストのタスク' }).waitFor();
      await task.getByRole('button', { name: '完了にする' }).click();
      await task.getByRole('button', { name: '未完了に戻す' }).waitFor();
      await page.getByRole('textbox', { name: 'タスクを検索' }).fill('');
      const modes = page.getByRole('group', { name: '入力モード' });
      await modes.getByRole('button', { name: 'メモ' }).click();
      await page.getByRole('textbox', { name: '新しいメモ' }).fill('買い物メモ\n袋を持っていく');
      await modes.getByRole('button', { name: '表' }).click();
      await modes.getByRole('button', { name: 'メモ' }).click();
      assert.equal(
        await page.getByRole('textbox', { name: '新しいメモ' }).inputValue(),
        '買い物メモ\n袋を持っていく',
      );
      assert.equal(await page.locator('#add-form button[type="submit"]').count(), 0);
      await page.getByRole('textbox', { name: '新しいメモ' }).press('Control+Enter');
      const memo = page.locator('article.entry-memo').filter({ hasText: '袋を持っていく' });
      await memo.waitFor();
      assert.equal(await memo.getByRole('button', { name: '完了にする' }).count(), 0);
      await modes.getByRole('button', { name: '表' }).click();
      assert.equal(await page.locator('#add-form .cell-input').count(), 2);
      await page.getByRole('textbox', { name: '新しい行 1列目', exact: true }).fill('バナナ');
      await page.getByRole('textbox', { name: '新しい行 2列目', exact: true }).fill('削除する列');
      await page.getByRole('button', { name: '新しい行に列を追加', exact: true }).click();
      await page.getByRole('textbox', { name: '新しい行 3列目', exact: true }).fill('スーパー');
      await page.getByRole('button', { name: '新しい行 2列目を削除', exact: true }).click();
      assert.equal(
        await page.getByRole('textbox', { name: '新しい行 1列目', exact: true }).inputValue(),
        'バナナ',
      );
      assert.equal(
        await page.getByRole('textbox', { name: '新しい行 2列目', exact: true }).inputValue(),
        'スーパー',
      );
      await page.getByRole('textbox', { name: '新しい行 2列目', exact: true }).press('Alt+Enter');
      await page.getByRole('textbox', { name: '新しい行 3列目', exact: true }).press('Alt+Enter');
      for (const [i, value] of ['バナナ', '200円', 'スーパー', '2本'].entries())
        await page.getByRole('textbox', { name: `新しい行 ${i + 1}列目`, exact: true }).fill(value);
      assert.equal(await page.getByRole('button', { name: '行を追加', exact: true }).count(), 0);
      await page
        .getByRole('textbox', { name: '新しい行 4列目', exact: true })
        .dispatchEvent('keydown', { key: 'Enter', isComposing: true });
      assert.equal(await page.locator('article.entry-table').count(), 0);
      await page.getByRole('textbox', { name: '新しい行 4列目', exact: true }).press('Enter');
      const table = page.locator('article.entry-table').filter({ hasText: 'バナナ' });
      await table.waitFor();
      assert.equal(await table.locator('.table-cell').count(), 4);
      await table.getByRole('button', { name: '表の行を編集' }).click();
      await page.getByRole('textbox', { name: '編集する行 2列目', exact: true }).fill('250円');
      await page.getByRole('button', { name: '編集する行 4列目を削除', exact: true }).click();
      await page.getByRole('button', { name: '行を保存', exact: true }).click();
      await table.getByText('250円', { exact: true }).waitFor();
      await page.reload();
      await memo.waitFor();
      await table.getByText('250円', { exact: true }).waitFor();
      assert.equal(await table.locator('.table-cell').count(), 3);
      // Drag a table row before a memo, then verify the saved order after reload.
      const transfer = await page.evaluateHandle(() => new DataTransfer());
      await table.dispatchEvent('dragstart', { dataTransfer: transfer });
      assert.equal(await table.evaluate((row) => getComputedStyle(row).opacity), '1');
      assert.equal(await memo.evaluate((row) => getComputedStyle(row).filter), 'brightness(0.4)');
      await table.dispatchEvent('dragend');
      assert.equal(await page.locator('.is-reordering').count(), 0);
      assert.equal(await page.locator('.empty-drag-image').count(), 0);
      await transfer.dispose();
      const moved = page.waitForResponse(
        (response) => response.url().endsWith('/api/tasks/reorder') && response.status() === 200,
      );
      await table.locator('.task-content').dragTo(memo, { targetPosition: { x: 40, y: 5 } });
      await moved;
      await page.reload();
      await table.waitFor();
      const tableId = await table.getAttribute('data-item-id'),
        memoId = await memo.getAttribute('data-item-id');
      const order = await page
        .locator('article[data-item-id]')
        .evaluateAll((rows) => rows.map((row) => row.dataset.itemId));
      assert.ok(order.indexOf(tableId) < order.indexOf(memoId));
      await page.getByRole('combobox', { name: '並び替え', exact: true }).selectOption('title');
      assert.equal(await table.getAttribute('draggable'), 'false');
      await page.getByRole('combobox', { name: '並び替え', exact: true }).selectOption('manual');
      await page.getByRole('textbox', { name: 'タスクを検索' }).fill('スーパー');
      await table.waitFor();
      assert.equal(await page.locator('article.task').count(), 1);
      // Narrow screens keep mode buttons and column inputs reachable.
      await page.setViewportSize({ width: 390, height: 844 });
      await modes.getByRole('button', { name: '表' }).click();
      assert.equal(await page.getByRole('button', { name: '行を追加', exact: true }).count(), 0);
      await page.getByRole('textbox', { name: '新しい行 1列目', exact: true }).fill('りんご');
      await page.getByRole('textbox', { name: '新しい行 1列目', exact: true }).press('Enter');
      await page.locator('article.entry-table').filter({ hasText: 'りんご' }).waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      if (frontend.exitCode === null)
        await new Promise((resolve) => {
          frontend.once('exit', resolve);
          frontend.kill();
        });
      if (child.exitCode === null)
        await new Promise((resolve) => {
          child.once('exit', resolve);
          child.kill();
        });
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
