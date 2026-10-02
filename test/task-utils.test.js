import test from 'node:test';
import assert from 'node:assert/strict';
import {
  today,
  escapeHtml,
  tasksForView,
  visibleTasks,
  orderedLists,
  entryText,
  formatDue,
} from '../public/task-utils.js';
import { entryKind, entryCells } from '../src/entry-validation.js';

test('dated lists lead on their day and move behind normal lists afterwards', () => {
  const lists = [
    { id: 'old', listDate: '2026-09-29' },
    { id: 'normal' },
    { id: 'daily', listDate: '2026-09-30' },
    { id: 'new' },
  ];
  assert.deepEqual(
    orderedLists(lists, '2026-09-30').map((l) => l.id),
    ['daily', 'normal', 'new', 'old'],
  );
  assert.deepEqual(
    orderedLists(lists, '2026-10-01').map((l) => l.id),
    ['normal', 'new', 'old', 'daily'],
  );
  assert.equal(lists[0].id, 'old');
});

const tasks = [
  {
    id: 'a',
    listId: 'ideas',
    title: '午後の買い物',
    note: '牛乳',
    completed: false,
    important: false,
    myDay: '2026-09-28',
    dueDate: '',
    createdAt: '2026-09-01',
  },
  {
    id: 'b',
    listId: 'inbox',
    title: '書類を送る',
    note: '取引先へ',
    completed: true,
    important: true,
    myDay: '2026-09-27',
    dueDate: '2026-10-01',
    createdAt: '2026-09-02',
  },
  {
    id: 'c',
    listId: 'ideas',
    title: '読書',
    note: '午後に読む',
    completed: false,
    important: true,
    myDay: '',
    dueDate: '2026-09-30',
    createdAt: '2026-09-03',
  },
];

test('list views only contain entries from that list', () => {
  assert.deepEqual(
    tasksForView(tasks, 'ideas').map((t) => t.id),
    ['a', 'c'],
  );
  assert.equal(today(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
});

test('name order uses memo text and table cells when there is no title', () => {
  const entries = [
    { id: 't', listId: 'x', kind: 'task', title: 'いちご', note: '', cells: [], createdAt: '1' },
    { id: 'm', listId: 'x', kind: 'memo', title: '', note: 'あめ', cells: [], createdAt: '2' },
    {
      id: 'r',
      listId: 'x',
      kind: 'table',
      title: '',
      note: '',
      cells: ['', 'うどん'],
      createdAt: '3',
    },
  ];
  assert.deepEqual(
    visibleTasks(entries, { view: 'x', sort: 'title' }).active.map((t) => t.id),
    ['m', 't', 'r'],
  );
  assert.equal(entryText(entries[2]), 'うどん');
});

test('due dates read relative to the local day', () => {
  assert.equal(formatDue('2026-10-02', '2026-10-02'), '今日');
  assert.equal(formatDue('2026-10-03', '2026-10-02'), '明日');
  assert.equal(formatDue('2026-10-01', '2026-10-02'), '昨日');
  assert.equal(formatDue('2026-10-05', '2026-10-02'), '10/5(月)');
  assert.equal(formatDue('2027-01-04', '2026-10-02'), '2027/1/4(月)');
});

test('search spans lists and notes, then splits completion without mutating input', () => {
  const original = tasks.map((t) => t.id);
  const result = visibleTasks(tasks, { view: 'ideas', query: '午後', sort: 'title' });
  assert.deepEqual(
    result.active.map((t) => t.id),
    ['a', 'c'],
  );
  assert.deepEqual(result.done, []);
  assert.deepEqual(
    visibleTasks(tasks, { view: 'ideas', query: '取引先' }).done.map((t) => t.id),
    ['b'],
  );
  assert.deepEqual(
    tasks.map((t) => t.id),
    original,
  );
});

test('due sort places undated tasks after dated tasks', () => {
  assert.deepEqual(
    visibleTasks(tasks, { view: 'ideas', sort: 'due' }).active.map((t) => t.id),
    ['c', 'a'],
  );
});

test('manual ordering uses persisted positions independently of creation dates', () => {
  const entries = tasks.map((t, i) => ({ ...t, sortOrder: 3 - i }));
  assert.deepEqual(
    visibleTasks(entries, { view: 'ideas', sort: 'manual' }).active.map((t) => t.id),
    ['c', 'a'],
  );
  assert.deepEqual(
    visibleTasks(entries, { view: 'ideas', sort: 'created' }).active.map((t) => t.id),
    ['a', 'c'],
  );
});

test('task text is escaped before insertion into HTML', () => {
  assert.equal(
    escapeHtml(`<img src="x" onerror='bad'>&`),
    '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;',
  );
});

test('entry validation allows variable columns but rejects empty or malformed rows', () => {
  assert.equal(entryKind(), 'task');
  assert.equal(entryKind('memo'), 'memo');
  assert.throws(() => entryKind('unknown'), { status: 400 });
  assert.deepEqual(entryCells([' バナナ ', '200円', 'スーパー'], 'table'), [
    'バナナ',
    '200円',
    'スーパー',
  ]);
  assert.equal(entryCells(Array(20).fill('x'), 'table').length, 20);
  for (const cells of [[], [' ', ''], Array(21).fill('x'), ['x'.repeat(501)], [2], null])
    assert.throws(() => entryCells(cells, 'table'), { status: 400 });
  assert.throws(() => entryCells(['x'], 'memo'), { status: 400 });
});

test('search includes every table column, including content beyond the title preview', () => {
  const row = { ...tasks[0], kind: 'table', title: '先頭列', cells: ['先頭列', 'スーパー'] };
  assert.deepEqual(visibleTasks([row], { view: 'ideas', query: 'スーパー' }).active, [row]);
});
