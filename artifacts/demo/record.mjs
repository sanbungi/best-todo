import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = process.cwd(),
  out = root + '/artifacts/demo';
const temp = await mkdtemp('/tmp/best-todo-demo-');
const env = { ...process.env };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, context, frontend, backend, page, start, video, videoStart;
const chapters = [];
const marks = {};
const errors = [];
async function chapter(title) {
  chapters.push({ start: (Date.now() - start) / 1000, title });
  console.log(title);
}
async function click(locator) {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  assert.ok(b);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await pause(250);
  await locator.click();
  await pause(500);
}
// Typing start/end times let the short version keep the actual typing on screen.
const mark = (name) => (marks[name] = (Date.now() - start) / 1000);
async function input(locator, value, name) {
  await click(locator);
  await page.keyboard.press('Control+a');
  if (name) mark(name);
  for (const char of value) {
    await page.keyboard.insertText(char);
    await pause(45);
  }
  if (name) mark(name + ':end');
  await pause(650);
}
const button = (name) => page.getByRole('button', { name, exact: true });
async function enter() {
  await page.keyboard.press('Enter');
  await pause(750);
}
try {
  const launchServer = async (file, extra) => {
    const child = spawn(process.execPath, [file], {
      cwd: root,
      env: { ...env, HOST: '127.0.0.1', PORT: '0', ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const url = await new Promise((resolve, reject) => {
      child.stdout.on('data', (d) => {
        const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (m) resolve(m[0]);
      });
      child.stderr.on('data', (d) => process.stderr.write(d));
      child.once('exit', (c) => reject(Error('server ' + c)));
    });
    return { child, url };
  };
  const front = await launchServer('src/frontend.js', {});
  frontend = front.child;
  const back = await launchServer('server.js', {
    DATA_DIR: temp + '/data',
    AUTH_USERNAME: 'demo',
    AUTH_PASSWORD: 'demo-video-password',
    CORS_ORIGINS: front.url,
    SEED_DATA: 'false',
  });
  backend = back.child;
  const base = back.url;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 820 },
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'dark',
    recordVideo: { dir: out + '/recordings', size: { width: 1440, height: 820 } },
  });
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      cursor.style.cssText =
        'position:fixed;left:720px;top:400px;width:18px;height:18px;border:2px solid #bac8ff;border-radius:50%;background:#829aff40;box-shadow:0 0 0 4px #829aff18;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%)';
      document.documentElement.appendChild(cursor);
      addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
      });
      addEventListener('mousedown', () => (cursor.style.background = '#bcc9ff'));
      addEventListener('mouseup', () => (cursor.style.background = '#829aff40'));
    });
  });
  page = await context.newPage();
  videoStart = Date.now();
  video = page.video();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(front.url);
  await page.getByLabel('Backend URL').waitFor();
  await page.getByLabel('Backend URL').fill(base);
  await page.getByLabel('ユーザー名').fill('demo');
  await page.getByLabel('パスワード').fill('demo-video-password');
  await click(button('ログイン'));
  await page.getByRole('heading', { name: 'マイタスク', exact: true }).waitFor();
  await page.screenshot({ path: out + '/initial.png' });
  start = Date.now();
  await chapter('Best ToDo｜Web版の実操作デモ');
  await pause(3500);
  await chapter('01  リストを作成して、仕事を整理');
  await click(page.locator('[data-new-list]'));
  await input(page.getByLabel('リスト名', { exact: true }), '新サービス公開');
  await click(page.locator('#list-form button[type="submit"]'));
  await pause(1800);
  await chapter('02  タスクを入力して Enter で登録');
  for (const [i, title] of [
    '公開ページを仕上げる',
    '動作チェックを行う',
    'チームに公開を知らせる',
  ].entries()) {
    await input(page.getByRole('textbox', { name: '新しいタスク' }), title, 'task' + i);
    await enter();
  }
  await chapter('03  ステップ・期限・メモで、作業を具体化');
  await click(
    page.locator('article.entry-task .task-content').filter({ hasText: '公開ページを仕上げる' }),
  );
  for (const title of ['原稿を確認する', '画像を配置する']) {
    await input(page.getByRole('textbox', { name: '新しいステップ' }), title);
    await enter();
  }
  await click(page.getByRole('checkbox', { name: '原稿を確認する' }));
  await click(page.getByLabel('期限', { exact: true }));
  await page.getByLabel('期限', { exact: true }).fill('2026-10-09');
  await page.keyboard.press('Tab');
  await pause(800);
  await input(
    page.getByRole('textbox', { name: 'メモ', exact: true }),
    'トップ画像と申込みボタンを最終確認。',
    'detailMemo',
  );
  await click(button('詳細を閉じる'));
  await pause(2000);
  await chapter('04  完了したタスクはチェックで管理');
  mark('complete');
  await click(
    page
      .locator('article.task')
      .filter({ hasText: '動作チェックを行う' })
      .getByRole('button', { name: '完了にする' }),
  );
  await pause(1800);
  if ((await page.locator('[data-completed="true"]').count()) === 0)
    await click(page.locator('.completed-toggle'));
  await pause(1500);
  await chapter('05  メモも同じリストへ｜Ctrl + Enter で保存');
  const modes = page.getByRole('group', { name: '入力モード' });
  await click(modes.getByRole('button', { name: 'メモ', exact: true }));
  await input(
    page.getByRole('textbox', { name: '新しいメモ' }),
    '公開日の確認事項\n告知は午前10時。チームへの共有を忘れずに。',
    'memo',
  );
  await page.keyboard.press('Control+Enter');
  await pause(2400);
  await chapter('06  表で情報を整理｜列を増やして Enter で登録');
  await click(modes.getByRole('button', { name: '表', exact: true }));
  await input(
    page.getByRole('textbox', { name: '新しい行 1列目', exact: true }),
    '公開ページ',
    'table',
  );
  await input(page.getByRole('textbox', { name: '新しい行 2列目', exact: true }), 'デザイン担当');
  await click(button('新しい行に列を追加'));
  await input(page.getByRole('textbox', { name: '新しい行 3列目', exact: true }), '10月9日');
  await enter();
  mark('table:end');
  await pause(2000);
  await chapter('07  検索で、必要なタスク・メモ・表を探す');
  await input(page.getByRole('textbox', { name: 'タスクを検索' }), '公開', 'search');
  await pause(3000);
  await click(button('検索をクリア'));
  await pause(1000);
  await chapter('08  並び順を切り替えて、期限を確認');
  await click(page.getByLabel('並び替え'));
  await page.keyboard.press('Escape');
  await page.getByLabel('並び替え').selectOption('due');
  await pause(750);
  await pause(2500);
  await chapter('09  再読み込みしても、入力内容を保持');
  await page.reload();
  await page.getByRole('heading', { name: 'マイタスク', exact: true }).waitFor();
  await click(page.locator('nav button.nav').filter({ hasText: '新サービス公開' }));
  await page.getByRole('heading', { name: '新サービス公開', exact: true }).waitFor();
  await pause(2300);
  if ((await page.locator('[data-completed="true"]').count()) === 0)
    await click(page.locator('.completed-toggle'));
  assert.equal(await page.locator('article.entry-task').count(), 3);
  assert.equal(await page.locator('article.entry-memo').count(), 1);
  assert.equal(await page.locator('article.entry-table').count(), 1);
  await click(
    page.locator('article.entry-task .task-content').filter({ hasText: '公開ページを仕上げる' }),
  );
  assert.equal(await page.getByLabel('期限', { exact: true }).inputValue(), '2026-10-09');
  assert.equal(
    await page.getByRole('textbox', { name: 'メモ', exact: true }).inputValue(),
    'トップ画像と申込みボタンを最終確認。',
  );
  assert.equal(await page.getByRole('checkbox', { name: '原稿を確認する' }).isChecked(), true);
  await pause(2000);
  await click(button('詳細を閉じる'));
  await chapter('Best ToDo｜タスク・メモ・表を、ひとつのリストに');
  await pause(4000);
  await page.screenshot({ path: out + '/final.png' });
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/chapters.json',
    JSON.stringify(
      {
        duration: (Date.now() - start) / 1000,
        // Seconds from the start of recording.webm to the first chapter.
        videoOffset: (start - videoStart) / 1000,
        chapters,
        marks,
        verified: { tasks: 3, memos: 1, tables: 1, persistence: true, pageErrors: errors },
      },
      null,
      2,
    ),
  );
  console.log('RECORDING COMPLETE');
} catch (error) {
  if (page) await page.screenshot({ path: out + '/error.png' }).catch(() => {});
  throw error;
} finally {
  await context?.close();
  if (video) await video.saveAs(out + '/recording.webm');
  await browser?.close();
  backend?.kill();
  frontend?.kill();
}
