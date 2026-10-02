import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('DEMO_MODE seeds on startup, publishes credentials and restricts shared settings', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'best-todo-demo-'));
  let child, base, token;
  async function start() {
    const env = { ...process.env };
    delete env.AUTH_USERNAME;
    delete env.AUTH_PASSWORD;
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: {
        ...env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '0',
        DATA_DIR: dir,
        DEMO_MODE: 'true',
        DEMO_RESET_MINUTES: '30',
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
    token = (await req('/auth/login', 'POST', { username: 'demo', password: 'demo' })).token;
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
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(r.status, status);
    return r.json();
  }
  try {
    await start();
    const info = await req('/demo');
    assert.equal(info.username, 'demo');
    assert.equal(info.password, 'demo');
    const untilReset = Date.parse(info.nextResetAt) - Date.now();
    assert.ok(untilReset > 29 * 60000 && untilReset <= 30 * 60000);

    // Wrong passwords never lock other visitors out.
    for (let i = 0; i < 12; i++)
      await req('/auth/login', 'POST', { username: 'demo', password: 'wrong' }, 401);
    await req('/auth/login', 'POST', { username: 'demo', password: 'demo' });

    const lists = await req('/lists');
    assert.equal(lists[0].id, 'ideas');
    assert.ok(lists.some((l) => l.id === 'seed-work'));
    const tasks = await req('/tasks');
    assert.ok(tasks.length > 40);
    assert.equal(new Set(tasks.map((t) => t.sortOrder)).size, tasks.length);

    await req('/auth/session', 'PATCH', { sessionTtlHours: 1 }, 403);
    await req('/auth/sessions/revoke', 'POST', {}, 403);
    assert.equal((await req('/auth/session')).sessionTtlHours, 24);

    const added = await req('/tasks', 'POST', { listId: 'ideas', title: '落書き' }, 201);
    await req('/lists/seed-work', 'DELETE');
    for (let i = lists.length - 1; i < 50; i++) await req('/lists', 'POST', { name: `L${i}` }, 201);
    await req('/lists', 'POST', { name: '上限超過' }, 403);
    const item = {
      list: 'アイディア',
      kind: 'task',
      title: 'x',
      note: '',
      cells: [],
      steps: [],
      completed: false,
      important: false,
      myDay: '',
      dueDate: '',
    };
    await req('/import', 'POST', { items: Array(1000).fill(item) }, 403);
    await req('/import', 'POST', { items: [{ ...item, list: '新しいリスト' }] }, 403);
    await req('/import', 'POST', { items: [item] }, 201);

    // Each start resets to the seed data.
    await stop();
    await start();
    const reset = await req('/tasks');
    assert.equal(reset.length, tasks.length);
    assert.equal(
      reset.some((t) => t.id === added.id),
      false,
    );
    assert.equal((await req('/lists')).length, lists.length);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
