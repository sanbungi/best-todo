import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('API lifecycle, validation, persistence and cascading deletion', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'everyday-test-'));
  let child, base, token;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        DATA_DIR: dir,
        AUTH_USERNAME: 'tester',
        AUTH_PASSWORD: 'test-password-123',
        SEED_DATA: 'false',
        CORS_ORIGINS: 'https://frontend.example',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('startup timeout')), 10000);
      child.stdout.on('data', (d) => {
        output += d;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.on('error', reject);
    });
    assert.equal((await fetch(base + '/api/tasks')).status, 401);
    token = (
      await req('/auth/login', 'POST', { username: 'tester', password: 'test-password-123' })
    ).token;
  }
  async function stop() {
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill();
    });
  }
  async function req(p, method = 'GET', body, status = 200) {
    const r = await fetch(base + '/api' + p, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(r.status, status);
    return r.json();
  }
  try {
    await start();
    assert.deepEqual(await req('/tasks'), []);
    assert.deepEqual(await req('/lists'), [
      { id: 'inbox', name: 'マイタスク', pinned: 0, listDate: '', icon: '☰', color: '#6488d8' },
    ]);
    await req('/auth/login', 'POST', { username: 'tester', password: 'incorrect' }, 401);
    const preflight = await fetch(base + '/api/tasks', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://frontend.example',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://frontend.example');
    const daily = await req('/lists', 'POST', { listDate: '2026-09-30' }, 201);
    assert.equal(daily.name, '2026/09/30');
    assert.equal(daily.listDate, '2026-09-30');
    assert.equal((await req('/lists')).find((l) => l.id === daily.id).listDate, '2026-09-30');
    await req('/lists', 'POST', { listDate: '2026-02-30' }, 400);
    await req('/lists/' + daily.id, 'DELETE');
    const l = await req('/lists', 'POST', { name: 'テスト' }, 201);
    const styled = await req('/lists/' + l.id, 'PATCH', {
      pinned: true,
      icon: '💼',
      color: '#ff8800',
    });
    assert.equal(styled.pinned, 1);
    assert.equal(styled.icon, '💼');
    assert.equal(styled.color, '#ff8800');
    const renamed = await req('/lists/' + l.id, 'PATCH', { name: '変更後' });
    assert.equal(renamed.pinned, 1);
    assert.equal(renamed.icon, '💼');
    await req('/lists/' + l.id, 'PATCH', { pinned: 'true' }, 400);
    await req('/lists/' + l.id, 'PATCH', { color: 'red' }, 400);
    await req('/lists/' + l.id, 'PATCH', { icon: '' }, 400);
    const t = await req(
      '/tasks',
      'POST',
      { title: '期限付きタスク', listId: l.id, dueDate: '2026-10-01' },
      201,
    );
    assert.equal(t.kind, 'task');
    const memo = await req(
      '/tasks',
      'POST',
      { kind: 'memo', listId: l.id, note: '買い物のメモ\n忘れずに' },
      201,
    );
    const table = await req(
      '/tasks',
      'POST',
      { kind: 'table', listId: l.id, cells: ['バナナ', '200円', 'スーパー'] },
      201,
    );
    assert.equal(memo.note, '買い物のメモ\n忘れずに');
    assert.deepEqual(table.cells, ['バナナ', '200円', 'スーパー']);
    await req('/tasks/' + table.id, 'PATCH', { cells: ['バナナ', '250円', 'スーパー', '2本'] });
    await req('/tasks/' + memo.id, 'PATCH', { note: '更新したメモ' });
    await req('/tasks/' + memo.id, 'PATCH', { note: ' ' }, 400);
    await req('/tasks/' + table.id, 'PATCH', { cells: [] }, 400);
    await req('/tasks/' + table.id, 'PATCH', { completed: true }, 400);
    await req('/tasks', 'POST', { kind: 'memo', listId: l.id, note: '' }, 400);
    await req('/tasks', 'POST', { kind: 'table', listId: l.id, cells: ['', ''] }, 400);
    const updated = await req('/tasks/' + t.id, 'PATCH', {
      completed: true,
      important: true,
      myDay: '2026-09-28',
      note: '保存するメモ',
      steps: [{ id: 's1', title: '確認', completed: true }],
    });
    assert.equal(updated.completed, true);
    assert.equal(updated.steps.length, 1);
    await req('/tasks/' + t.id, 'PATCH', { dueDate: '2026-02-30' }, 400);
    await req('/tasks/' + t.id, 'PATCH', { completed: 'true' }, 400);
    await req('/tasks', 'POST', { title: ' ', listId: l.id }, 400);
    await req('/tasks', 'POST', { title: 'test', listId: 'missing' }, 404);
    await req('/lists/inbox', 'DELETE');
    const denied = await fetch(base + '/api/lists', {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(denied.status, 403);
    const reordered = await req('/tasks/reorder', 'POST', {
      id: table.id,
      targetId: memo.id,
      position: 'before',
    });
    assert.ok(
      reordered.findIndex((x) => x.id === table.id) < reordered.findIndex((x) => x.id === memo.id),
    );
    await req(
      '/tasks/reorder',
      'POST',
      { id: table.id, targetId: 'missing', position: 'after' },
      404,
    );
    await req(
      '/tasks/reorder',
      'POST',
      { id: table.id, targetId: memo.id, position: 'wrong' },
      400,
    );
    await req('/tasks/reorder', 'POST', { id: table.id, targetId: t.id, position: 'after' }, 400);
    await stop();
    await start();
    const tasks = await req('/tasks');
    assert.equal(tasks.find((x) => x.id === t.id).note, '保存するメモ');
    assert.ok(tasks.findIndex((x) => x.id === table.id) < tasks.findIndex((x) => x.id === memo.id));
    assert.equal(tasks.find((x) => x.id === memo.id).note, '更新したメモ');
    assert.deepEqual(tasks.find((x) => x.id === table.id).cells, [
      'バナナ',
      '250円',
      'スーパー',
      '2本',
    ]);
    await req('/lists/' + l.id, 'DELETE');
    assert.equal(
      (await req('/tasks')).some((x) => x.id === t.id),
      false,
    );
    const page = await fetch(base);
    assert.equal(page.status, 404);
    await req('/auth/logout', 'POST', {});
    await req('/tasks', 'GET', undefined, 401);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
