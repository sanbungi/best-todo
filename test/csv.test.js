import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCsv, importCsv } from '../public/csv.js';

test('CSV round trip preserves Japanese, quotes, multiline and formula-like text', () => {
  const item = {
    listId: 'a',
    kind: 'task',
    title: '=SUM(1,2)',
    note: '日本語,"引用"\n次の行',
    completed: true,
    important: false,
    myDay: '',
    dueDate: '2026-10-01',
    cells: [],
    steps: [{ id: 's', title: '確認', completed: false }],
  };
  const csv = exportCsv([{ id: 'a', name: "'リスト" }], [item]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=SUM"));
  const { listId, ...expected } = item;
  assert.deepEqual(importCsv(csv), [{ list: "'リスト", ...expected }]);
});
test('CSV rejects invalid headers and unterminated quotes', () => {
  assert.throws(() => importCsv('title\nhello'), /ヘッダー/);
  assert.throws(() => importCsv('"unclosed'), /引用符/);
});
