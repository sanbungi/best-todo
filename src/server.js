import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import {
  login,
  authorize,
  logout,
  sessionSettings,
  setSessionTtlHours,
  revokeSessions,
} from './auth.js';
import { seed } from './seed.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { entryKind, entryCells } from './entry-validation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'todo.sqlite'));
db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, listId TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, important INTEGER NOT NULL DEFAULT 0,
myDay TEXT NOT NULL DEFAULT '', dueDate TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
steps TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const envSessionHours = process.env.AUTH_SESSION_TTL_HOURS || '24';
db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)').run('sessionTtlHours', envSessionHours);
setSessionTtlHours(db.prepare('SELECT value FROM settings WHERE key=?').get('sessionTtlHours').value);
// Additive migration keeps all existing tasks and notes intact.
const columns = db
  .prepare('PRAGMA table_info(tasks)')
  .all()
  .map((column) => column.name);
if (!columns.includes('kind'))
  db.exec("ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task'");
if (!columns.includes('cells'))
  db.exec("ALTER TABLE tasks ADD COLUMN cells TEXT NOT NULL DEFAULT '[]'");
if (!columns.includes('sortOrder')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE tasks SET sortOrder=rowid');
}
db.prepare('INSERT OR IGNORE INTO lists VALUES (?, ?)').run('inbox', 'タスク');
if (process.env.SEED_DATA === 'true') {
  if (process.env.NODE_ENV === 'production') throw new Error('Production seed is disabled');
  seed(db);
}
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)
  .map((v) => {
    try {
      return new URL(v).origin;
    } catch {
      return v.replace(/\/$/, '');
    }
  });
db.exec('UPDATE tasks SET sortOrder=rowid WHERE sortOrder=0');
const decode = (row) =>
  row && {
    ...row,
    completed: !!row.completed,
    important: !!row.important,
    steps: JSON.parse(row.steps),
    cells: JSON.parse(row.cells),
  };
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function cleanText(value, name, max = 500, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()))
    fail(400, `${name}が不正です`);
  return value.trim();
}
function date(value) {
  if (value === '') return value;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail(400, '日付が不正です');
  return value;
}
async function body(req, maxBytes = 100000) {
  let data = '';
  for await (const part of req) {
    data += part;
    if (Buffer.byteLength(data) > maxBytes) fail(413, 'データが大きすぎます');
  }
  try {
    const v = JSON.parse(data);
    if (!v || Array.isArray(v) || typeof v !== 'object') throw Error();
    return v;
  } catch {
    fail(400, 'JSONが不正です');
  }
}
function listExists(id) {
  if (!db.prepare('SELECT id FROM lists WHERE id=?').get(id)) fail(404, 'リストがありません');
}
export const server = http.createServer(async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const method = req.method;
    if (p.startsWith('/api/')) {
      res.setHeader('Vary', 'Origin');
      if (req.headers.origin) {
        if (!allowedOrigins.includes(req.headers.origin))
          fail(403, 'このアクセス元は許可されていません');
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      if (p === '/api/health' && method === 'GET') return send(200, { status: 'ok' });
      if (p === '/api/auth/login' && method === 'POST') {
        const b = await body(req);
        return send(200, login(b.username, b.password));
      }
      const token = authorize(req);
      if (p === '/api/auth/logout' && method === 'POST') {
        logout(token);
        return send(200, { loggedOut: true });
      }
      if (p === '/api/auth/session' && method === 'GET') return send(200, sessionSettings(token));
      if (p === '/api/auth/session' && method === 'PATCH') {
        const b = await body(req);
        const hours = Number(b.sessionTtlHours);
        if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365)
          fail(400, 'ログイン維持時間は1〜8760時間で指定してください');
        db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(
          'sessionTtlHours',
          String(hours),
        );
        return send(200, setSessionTtlHours(hours));
      }
      if (p === '/api/auth/sessions/revoke' && method === 'POST')
        return send(200, revokeSessions(token));
      if (p === '/api/import' && method === 'POST') {
        const b = await body(req, 10000000);
        if (!Array.isArray(b.items) || !b.items.length || b.items.length > 10000)
          fail(400, '1〜10000件の項目を指定してください');
        const items = b.items.map((item, i) => {
          try {
            if (!item || typeof item !== 'object') fail(400, '項目が不正です');
            const list = cleanText(item.list, 'リスト名', 100);
            const kind = entryKind(item.kind);
            const cells = entryCells(item.cells, kind);
            const note = cleanText(item.note, 'メモ', 10000, kind !== 'memo');
            const title =
              kind === 'memo'
                ? note.slice(0, 500)
                : kind === 'table'
                  ? cells.filter(Boolean).join(' | ').slice(0, 500)
                  : cleanText(item.title, 'タスク名');
            if (
              typeof item.completed !== 'boolean' ||
              typeof item.important !== 'boolean' ||
              (kind !== 'task' && item.completed)
            )
              fail(400, '完了・重要の値が不正です');
            if (!Array.isArray(item.steps) || item.steps.length > 100)
              fail(400, 'ステップが不正です');
            const steps = item.steps.map((s) => {
              if (!s || typeof s.completed !== 'boolean') fail(400, 'ステップが不正です');
              return {
                id: randomUUID(),
                title: cleanText(s.title, 'ステップ'),
                completed: s.completed,
              };
            });
            return {
              ...item,
              list,
              kind,
              cells,
              note,
              title,
              steps,
              myDay: date(item.myDay),
              dueDate: date(item.dueDate),
            };
          } catch (e) {
            fail(400, `${i + 2}行目: ${e.message}`);
          }
        });
        db.exec('BEGIN IMMEDIATE');
        try {
          const lists = new Map(
            db
              .prepare('SELECT * FROM lists ORDER BY rowid')
              .all()
              .map((l) => [l.name, l.id]),
          );
          let order = db.prepare('SELECT COALESCE(MAX(sortOrder),0) AS n FROM tasks').get().n;
          const insert = db.prepare(
            'INSERT INTO tasks (id,listId,title,note,kind,cells,steps,completed,important,myDay,dueDate,createdAt,sortOrder) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          );
          for (const item of items) {
            if (!lists.has(item.list)) {
              const id = randomUUID();
              db.prepare('INSERT INTO lists VALUES (?,?)').run(id, item.list);
              lists.set(item.list, id);
            }
            insert.run(
              randomUUID(),
              lists.get(item.list),
              item.title,
              item.note,
              item.kind,
              JSON.stringify(item.cells),
              JSON.stringify(item.steps),
              +item.completed,
              +item.important,
              item.myDay,
              item.dueDate,
              new Date().toISOString(),
              ++order,
            );
          }
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        return send(201, { imported: items.length });
      }
      if (p === '/api/lists' && method === 'GET')
        return send(200, db.prepare('SELECT * FROM lists ORDER BY rowid').all());
      if (p === '/api/lists' && method === 'POST') {
        const b = await body(req);
        const item = { id: randomUUID(), name: cleanText(b.name, 'リスト名', 100) };
        db.prepare('INSERT INTO lists VALUES (?,?)').run(item.id, item.name);
        return send(201, item);
      }
      const lm = p.match(/^\/api\/lists\/([^/]+)$/);
      if (lm) {
        const id = lm[1];
        listExists(id);
        if (method === 'PATCH') {
          const b = await body(req);
          const name = cleanText(b.name, 'リスト名', 100);
          db.prepare('UPDATE lists SET name=? WHERE id=?').run(name, id);
          return send(200, { id, name });
        }
        if (method === 'DELETE') {
          if (id === 'inbox') fail(400, '標準のタスクは削除できません');
          db.prepare('DELETE FROM lists WHERE id=?').run(id);
          return send(200, { deleted: true });
        }
      }
      if (p === '/api/tasks' && method === 'GET')
        return send(
          200,
          db.prepare('SELECT * FROM tasks ORDER BY sortOrder, rowid').all().map(decode),
        );
      if (p === '/api/tasks/reorder' && method === 'POST') {
        const b = await body(req);
        const id = cleanText(b.id, '移動する項目ID'),
          targetId = cleanText(b.targetId, '移動先の項目ID');
        if (!['before', 'after'].includes(b.position) || id === targetId)
          fail(400, '移動先が不正です');
        const rows = db.prepare('SELECT * FROM tasks ORDER BY sortOrder, rowid').all();
        const source = rows.find((row) => row.id === id),
          target = rows.find((row) => row.id === targetId);
        if (!source || !target) fail(404, '項目がありません');
        if (source.completed !== target.completed)
          fail(400, '完了状態が同じ項目の間で並べ替えてください');
        const ordered = rows.filter((row) => row.id !== id);
        ordered.splice(
          ordered.findIndex((row) => row.id === targetId) + (b.position === 'after' ? 1 : 0),
          0,
          source,
        );
        db.exec('BEGIN IMMEDIATE');
        try {
          const update = db.prepare('UPDATE tasks SET sortOrder=? WHERE id=?');
          ordered.forEach((row, i) => {
            row.sortOrder = i + 1;
            update.run(row.sortOrder, row.id);
          });
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return send(200, ordered.map(decode));
      }
      if (p === '/api/tasks' && method === 'POST') {
        const b = await body(req);
        const listId = cleanText(b.listId, 'リストID');
        listExists(listId);
        const kind = entryKind(b.kind),
          cells = entryCells(b.cells ?? [], kind);
        const note = cleanText(b.note ?? '', 'メモ', 10000, kind !== 'memo');
        const title =
          kind === 'memo'
            ? note.slice(0, 500)
            : kind === 'table'
              ? cells.filter(Boolean).join(' | ').slice(0, 500)
              : cleanText(b.title, 'タスク名');
        const id = randomUUID();
        db.prepare(
          'INSERT INTO tasks (id,listId,title,important,myDay,dueDate,createdAt,kind,cells,note) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).run(
          id,
          listId,
          title,
          b.important === true ? 1 : 0,
          date(b.myDay ?? ''),
          date(b.dueDate ?? ''),
          new Date().toISOString(),
          kind,
          JSON.stringify(cells),
          note,
        );
        db.prepare(
          'UPDATE tasks SET sortOrder=(SELECT COALESCE(MAX(sortOrder),0)+1 FROM tasks) WHERE id=?',
        ).run(id);
        return send(201, decode(db.prepare('SELECT * FROM tasks WHERE id=?').get(id)));
      }
      const tm = p.match(/^\/api\/tasks\/([^/]+)$/);
      if (tm) {
        const id = tm[1];
        const old = decode(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
        if (!old) fail(404, 'タスクがありません');
        if (method === 'DELETE') {
          db.prepare('DELETE FROM tasks WHERE id=?').run(id);
          return send(200, { deleted: true });
        }
        if (method === 'PATCH') {
          const b = await body(req);
          const next = { ...old };
          for (const key of Object.keys(b)) {
            if (['title', 'note', 'listId'].includes(key))
              next[key] = cleanText(b[key], key, key === 'note' ? 10000 : 500, key === 'note');
            else if (['completed', 'important'].includes(key)) {
              if (typeof b[key] !== 'boolean') fail(400, '真偽値が必要です');
              next[key] = b[key];
            } else if (['dueDate', 'myDay'].includes(key)) next[key] = date(b[key]);
            else if (key === 'cells') next.cells = entryCells(b.cells, old.kind);
            else if (key === 'steps') {
              if (!Array.isArray(b.steps) || b.steps.length > 100) fail(400, 'ステップが不正です');
              next.steps = b.steps.map((s) => {
                if (!s || typeof s.completed !== 'boolean') fail(400, 'ステップが不正です');
                return {
                  id: cleanText(s.id, 'ID', 100),
                  title: cleanText(s.title, 'ステップ'),
                  completed: s.completed,
                };
              });
            } else fail(400, '未対応のフィールドです');
          }
          listExists(next.listId);
          if (next.kind === 'memo') {
            next.note = cleanText(next.note, 'メモ', 10000);
            next.title = next.note.slice(0, 500);
          }
          if (next.kind === 'table')
            next.title = next.cells.filter(Boolean).join(' | ').slice(0, 500);
          if (next.kind !== 'task' && next.completed) fail(400, '完了にできるのはタスクだけです');
          db.prepare(
            'UPDATE tasks SET listId=?,title=?,completed=?,important=?,myDay=?,dueDate=?,note=?,steps=?,cells=? WHERE id=?',
          ).run(
            next.listId,
            next.title,
            +next.completed,
            +next.important,
            next.myDay,
            next.dueDate,
            next.note,
            JSON.stringify(next.steps),
            JSON.stringify(next.cells),
            id,
          );
          return send(200, next);
        }
      }
      fail(404, 'APIが見つかりません');
    }
    fail(404, 'APIが見つかりません');
  } catch (error) {
    if (!error.status) console.error(error);
    send(error.status || 500, {
      error: error.status ? error.message : 'サーバーエラーが発生しました',
    });
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () =>
  console.log(`To Do: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`),
);
