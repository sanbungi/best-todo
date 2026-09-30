import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createFrontendServer } from '../src/frontend-server.js';

test('shared frontend serves source files with security headers and rejects private paths', async (t) => {
  const server = createFrontendServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['index.html', 'app.js', 'style.css', 'task-utils.js', 'reorder.js']) {
    const response = await fetch(`${origin}/${name}`);
    assert.equal(response.status, 200);
    assert.equal(
      await response.text(),
      await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8'),
    );
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  }
  for (const name of [
    '.env',
    'package.json',
    'src/auth.js',
    '..%5cpackage.json',
    '%ZZ',
    'missing.js',
  ]) {
    assert.equal((await fetch(`${origin}/${name}`)).status, 404);
  }
  assert.equal((await fetch(origin, { method: 'POST' })).status, 404);
  assert.equal(await (await fetch(origin, { method: 'HEAD' })).text(), '');
});
