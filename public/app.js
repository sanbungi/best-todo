import { exportCsv, importCsv } from './csv.js';
import { bindReordering } from './reorder.js';
import { escapeHtml as esc, today, tasksForView, visibleTasks } from './task-utils.js';
const $ = (s) => document.querySelector(s);
const icons = {
  sun: '☀',
  star: '☆',
  calendar: '▣',
  home: '⌂',
  list: '☰',
  plus: '＋',
  search: '⌕',
  server: '⚙',
};
const state = {
  lists: [],
  tasks: [],
  view: 'inbox',
  query: '',
  selected: null,
  sort: 'manual',
  showDone: true,
  menu: false,
  mobile: false,
  mode: 'task',
  drafts: { task: '', memo: '', cells: ['', ''] },
  saving: false,
  sessionSettings: null,
  loadingSessionSettings: false,
};
const authStorageKey = 'backendLogin';
function savedLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(authStorageKey) || '{}');
    if (
      saved.backend &&
      saved.token &&
      (!saved.expiresAt || Date.parse(saved.expiresAt) > Date.now())
    )
      return saved;
    localStorage.removeItem(authStorageKey);
  } catch {
    localStorage.removeItem(authStorageKey);
  }
  return {
    backend: sessionStorage.getItem('backend') || '',
    token: sessionStorage.getItem('token') || '',
  };
}
const initialLogin = savedLogin();
let backend = initialLogin.backend || '';
let token = initialLogin.token || '';
function saveLogin(expiresAt) {
  localStorage.setItem(authStorageKey, JSON.stringify({ backend, token, expiresAt }));
  sessionStorage.setItem('backend', backend);
  sessionStorage.setItem('token', token);
}
function clearLogin() {
  localStorage.removeItem(authStorageKey);
  sessionStorage.removeItem('token');
}
const serverProfileKey = () => 'serverProfile:' + backend;
function backendOrigin() {
  try {
    return new URL(backend).origin;
  } catch {
    return backend;
  }
}
function defaultServerName() {
  try {
    return new URL(backend).hostname.replace(/^www\./, '') || 'マイワークスペース';
  } catch {
    return 'マイワークスペース';
  }
}
function defaultServerLogo() {
  const name = defaultServerName();
  const parts = name.split(/[^a-zA-Z0-9一-龠ぁ-んァ-ヶ]+/).filter(Boolean);
  const logo = (
    parts.length > 1 ? parts.map((p) => p[0]).join('') : name.slice(0, 2)
  ).toUpperCase();
  return logo.slice(0, 2) || 'ME';
}
function serverProfile() {
  try {
    return {
      name: defaultServerName(),
      logo: defaultServerLogo(),
      ...JSON.parse(sessionStorage.getItem(serverProfileKey()) || '{}'),
    };
  } catch {
    return { name: defaultServerName(), logo: defaultServerLogo() };
  }
}
function showLogin() {
  token = '';
  clearLogin();
  state.lists = [];
  state.tasks = [];
  state.selected = null;
  state.view = 'inbox';
  state.query = '';
  state.drafts = { task: '', memo: '', cells: ['', ''] };
  state.sessionSettings = null;
  $('#app').innerHTML =
    `<form id="login-form" class="login-form stack-form"><h1>バックエンドにログイン</h1><label>Backend URL<input class="control" name="backend" type="url" inputmode="url" placeholder="https://api.example.com" value="${esc(backend)}" required autocomplete="url"></label><label>ユーザー名<input class="control" name="username" autocomplete="username" required></label><label>パスワード<input class="control" name="password" type="password" autocomplete="current-password" required></label><button class="save" type="submit">ログイン</button><p class="field-hint">接続先のオリジンだけを入力してください。ログイン状態は同じブラウザにセッション期限まで保存されます。</p></form>`;
  $('#login-form').onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      const values = new FormData(form);
      const url = new URL(values.get('backend'));
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw Error('接続先のオリジンURLを指定してください');
      if (location.protocol === 'https:' && url.protocol !== 'https:')
        throw Error('HTTPSの接続先を指定してください');
      backend = url.origin;
      const result = await api('/auth/login', 'POST', {
        username: values.get('username'),
        password: values.get('password'),
      });
      token = result.token;
      saveLogin(result.expiresAt);
      form.reset();
      await refresh();
    });
  };
}
async function api(path, method = 'GET', data) {
  const r = await fetch(backend + '/api' + path, {
    method,
    credentials: 'omit',
    redirect: 'error',
    headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await r.json();
  if (!r.ok) {
    if (r.status === 401 && token) showLogin();
    throw Error(result.error);
  }
  return result;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
async function run(fn) {
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  }
}
async function refresh() {
  [state.lists, state.tasks] = await Promise.all([api('/lists'), api('/tasks')]);
  if (state.view !== 'server' && !state.lists.some((l) => l.id === state.view))
    state.view = state.lists[0]?.id || 'server';
  render();
}
async function patch(id, data) {
  const task = await api('/tasks/' + id, 'PATCH', data);
  state.tasks = state.tasks.map((t) => (t.id === id ? task : t));
  render();
}
function filter(view) {
  return tasksForView(state.tasks, view);
}
function nav(list) {
  const { id, name, icon } = list;
  const n = filter(id).filter((t) => !t.completed).length;
  return `<div class="list-nav"><button class="nav ${state.view === id && !state.query ? 'active' : ''}" data-view="${id}" data-list-id="${id}" aria-haspopup="menu"><span class="nav-icon">${esc(icon)}</span><span>${esc(name)}</span>${n ? `<small>${n}</small>` : ''}</button><button class="list-options" data-list-options="${id}" aria-label="${esc(name)}のメニュー" aria-haspopup="menu">•••</button></div>`;
}
const modes = {
  task: { name: 'タスク', icon: '✓' },
  memo: { name: 'メモ', icon: '≡' },
  table: { name: '表', icon: '▤' },
};
function row(t) {
  const kind = t.kind || 'task';
  const content =
    kind === 'table'
      ? `<span class="table-cells">${t.cells.map((cell, i) => `<span class="table-cell"><span>${esc(cell) || '—'}</span></span>`).join('')}</span>`
      : kind === 'memo'
        ? `<span class="memo-body">${esc(t.note)}</span>`
        : `<span>${esc(t.title)}</span>${t.note ? `<span class="inline-note">${esc(t.note)}</span>` : ''}`;
  return `<article data-item-id="${t.id}" data-completed="${t.completed}" class="task entry-${kind} ${t.completed ? 'done' : ''} ${state.selected === t.id ? 'selected' : ''}">${kind === 'task' ? `<button class="check ${t.completed ? 'checked' : ''}" data-check="${t.id}" aria-label="${t.completed ? '未完了に戻す' : '完了にする'}">${t.completed ? '✓' : ''}</button>` : `<span class="entry-symbol" aria-label="${modes[kind].name}">${modes[kind].icon}</span>`}<button class="task-content" data-open="${t.id}" ${kind === 'table' ? 'aria-label="表の行を編集"' : ''}>${content}${t.dueDate || t.myDay === today() || t.steps.length ? `<small>${t.myDay === today() ? '☀ 今日の予定　' : ''}${t.dueDate ? `<span class="${t.dueDate < today() && !t.completed ? 'overdue' : ''}">▣ ${esc(t.dueDate)}</span>` : ''}${t.steps.length ? `　${t.steps.filter((s) => s.completed).length}/${t.steps.length} ステップ` : ''}</small>` : ''}</button><button class="star-button ${t.important ? 'on' : ''}" data-star="${t.id}" aria-label="重要マークを切り替える">${t.important ? '★' : '☆'}</button></article>`;
}

function cellInputs(cells, prefix, labeled = false) {
  return (
    cells
      .map((value, i) => {
        const id = `${prefix === '新しい行' ? 'new' : 'edit'}-cell-${i}`;
        const remove = `<button type="button" class="icon-button remove-column" data-remove-column="${i}" aria-label="${prefix} ${i + 1}列目を削除" title="この列を削除" ${cells.length === 1 ? 'disabled' : ''}>×</button>`;
        const input = `<input class="${labeled ? 'control' : ''}" id="${id}" name="cell-${i}" data-cell-index="${i}" aria-label="${prefix} ${i + 1}列目" placeholder="列 ${i + 1}" maxlength="500" autocomplete="off" enterkeyhint="done" value="${esc(value)}">`;
        return labeled
          ? `<div class="cell-input"><div class="cell-heading"><label for="${id}">列 ${i + 1}</label>${remove}</div>${input}</div>`
          : `<div class="cell-input">${input}${remove}</div>`;
      })
      .join('') +
    `<button type="button" class="add-column" data-add-column aria-label="${prefix}に列を追加" title="列を追加" ${cells.length >= 20 ? 'disabled' : ''}>${labeled ? '列を追加' : '＋'}</button>`
  );
}
function composer() {
  const mode = state.mode;
  const field =
    mode === 'task'
      ? `<input id="new-task" name="title" placeholder="タスクを追加" autocomplete="off" maxlength="500" required aria-label="新しいタスク" enterkeyhint="done" value="${esc(state.drafts.task)}">`
      : mode === 'memo'
        ? `<textarea id="new-memo" name="note" placeholder="メモを書き留める" maxlength="10000" required aria-label="新しいメモ" rows="1">${esc(state.drafts.memo)}</textarea>`
        : `<div class="cell-inputs">${cellInputs(state.drafts.cells, '新しい行')}</div>`;
  return `<footer class="composer mode-${mode}"><div class="mode-switch" role="group" aria-label="入力モード">${Object.entries(
    modes,
  )
    .map(
      ([key, m]) =>
        `<button type="button" data-mode="${key}" class="mode-${key}" aria-pressed="${mode === key}"><span aria-hidden="true">${m.icon}</span>${m.name}</button>`,
    )
    .join(
      '<span class="mode-divider" aria-hidden="true"></span>',
    )}</div><form id="add-form" class="add-${mode}" aria-busy="${state.saving}">${field}</form></footer>`;
}
function tableEditor(t) {
  return `<form id="cells-form" class="stack-form"><div id="edit-cells" class="edit-cells">${cellInputs(t.cells, '編集する行', true)}</div><div class="field-actions"><button class="save" type="submit">行を保存</button></div></form>`;
}
function detail(t) {
  const kind = t.kind || 'task';
  const titleField =
    kind === 'task'
      ? `<form id="title-form" class="stack-form"><label for="title">タスク名</label><input id="title" class="control" name="title" maxlength="500" required autocomplete="off" value="${esc(t.title)}"><div class="field-actions"><button class="save" type="submit">タイトルを保存</button></div></form>`
      : '';
  const steps =
    kind === 'task'
      ? `<div class="steps"><p class="field-label">ステップ</p>${t.steps.map((s) => `<div class="step"><input type="checkbox" aria-label="${esc(s.title)}" data-step="${esc(s.id)}" ${s.completed ? 'checked' : ''}><span class="${s.completed ? 'strike' : ''}">${esc(s.title)}</span><button type="button" class="icon-button" data-remove-step="${esc(s.id)}" aria-label="ステップを削除">×</button></div>`).join('')}<form id="step-form" class="inline-add"><input class="control" name="step" placeholder="ステップを追加" maxlength="500" required aria-label="新しいステップ" autocomplete="off" enterkeyhint="done"><button class="save" type="submit">追加</button></form></div>`
      : '';
  return `<aside class="detail entry-${kind}"><div class="detail-top"><span>${modes[kind].name}の詳細</span><button type="button" class="icon-button" data-close aria-label="詳細を閉じる">✕</button></div>${kind === 'table' ? tableEditor(t) : titleField}${steps}<button type="button" class="detail-action ${t.myDay === today() ? 'accent' : ''}" data-day>☀　${t.myDay === today() ? '今日の予定から削除' : '今日の予定に追加'}</button><label class="field">期限<input class="control" type="date" id="due" value="${esc(t.dueDate)}"></label><label class="field">リスト<select class="control" id="move">${state.lists.map((l) => `<option value="${l.id}" ${l.id === t.listId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label><form id="note-form" class="stack-form"><label for="note">メモ</label><textarea id="note" class="control" name="note" placeholder="詳細を書き留める" maxlength="10000" ${kind === 'memo' ? 'required' : ''}>${esc(t.note)}</textarea><div class="field-actions"><button class="save" type="submit">メモを保存</button></div></form><div class="detail-bottom"><small>${new Date(t.createdAt).toLocaleDateString('ja-JP')} に作成</small><button type="button" class="btn btn-danger" data-delete-task>${modes[kind].name}を削除</button></div></aside>`;
}
function serverSettings() {
  const profile = serverProfile();
  const session = state.sessionSettings;
  const expires = session?.currentSessionExpiresAt
    ? new Date(session.currentSessionExpiresAt).toLocaleString('ja-JP')
    : '取得中…';
  return `<main class="server-main"><header><div class="heading"><button class="mobile-toggle" data-mobile aria-label="リストを表示">☰</button><div><h1>サーバー管理</h1><p>接続先、ログインセッション、CSVを管理します</p></div></div></header><section class="server-panel"><div class="server-preview"><div class="avatar">${esc(profile.logo)}</div><div><strong>${esc(profile.name)}</strong><small>${esc(backendOrigin())}</small></div></div><form id="server-form" class="stack-form"><label>ワークスペース名<input class="control" name="name" maxlength="80" value="${esc(profile.name)}" required autocomplete="organization"></label><label>ロゴ文字<input class="control" name="logo" maxlength="2" value="${esc(profile.logo)}" required autocapitalize="characters"></label><label>接続先<input class="control" value="${esc(backendOrigin())}" readonly></label><div class="field-actions"><button class="save" type="submit">保存</button><button type="button" class="btn" data-reset-server>接続先から自動設定</button><button type="button" class="btn btn-danger" data-change-server>接続先を変更</button></div></form></section><section class="server-panel"><h2>ログインセッション</h2><p class="field-hint">ログイン状態を維持する時間を設定します。変更後の新しいログインから適用されます。</p><div class="server-preview"><div><strong>${session ? `${session.activeSessions} セッション` : '取得中…'}</strong><small>現在のセッション期限: ${esc(expires)}</small></div></div><form id="session-form" class="stack-form"><label>ログイン維持時間（時間）<input class="control" name="sessionTtlHours" type="number" min="1" max="8760" step="1" value="${esc(String(session?.sessionTtlHours ?? 24))}" required></label><div class="field-actions"><button class="save" type="submit">セッション設定を保存</button><button type="button" class="btn btn-danger" data-revoke-sessions>他のセッションをログアウト</button></div></form></section><section class="server-panel"><h2>CSV 一括インポート／エクスポート</h2><p class="field-hint">全リストのタスク・メモ・表をUTF-8 CSVで保存します。インポートは追加のみ（再取込すると重複）。同名リストに追加し、存在しないリストは作成します。空のリストは対象外です。</p><button type="button" class="btn" data-export-csv>CSVをエクスポート</button><form id="csv-form" class="stack-form"><label>CSVファイル（UTF-8・最大5MB）<input class="control" type="file" name="csv" accept=".csv,text/csv" required></label><p class="field-hint">エクスポートしたCSVのヘッダーを使用してください。completed / important はtrueまたはfalse、日付はYYYY-MM-DD、cells / steps はJSON形式です。</p><button class="save" type="submit">CSVをインポート</button></form></section></main>`;
}
function render() {
  const isServer = state.view === 'server';
  const title = state.query
    ? '検索結果'
    : state.lists.find((l) => l.id === state.view)?.name || 'タスク';
  const { active, done } = isServer
    ? { active: [], done: [] }
    : visibleTasks(state.tasks, {
        view: state.view,
        query: state.query,
        sort: state.sort,
      });
  const selected = isServer ? null : state.tasks.find((t) => t.id === state.selected);
  const profile = serverProfile();
  const mainHtml = isServer
    ? serverSettings()
    : `<main><header><div class="heading"><button class="mobile-toggle" data-mobile aria-label="リストを表示">☰</button><div><h1>${esc(title)}</h1><p>${state.query ? `「${esc(state.query)}」の検索結果` : `${active.length} 件の項目${state.view === 'today' ? ' · ' + new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' }) : ''}`}</p></div></div><div class="toolbar"><label class="toolbar-sort"><span class="sr-only">並び替え</span><select id="sort" class="control"><option value="manual">手動順</option><option value="created">追加順</option><option value="important">重要度順</option><option value="due">期限順</option><option value="title">名前順</option></select></label><button type="button" class="icon-button" data-menu aria-label="リストメニュー">•••</button>${state.menu ? `<div class="menu"><button type="button" data-toggle-done>${state.showDone ? '完了済みを隠す' : '完了済みを表示'}</button>${!state.query && state.lists.some((l) => l.id === state.view) ? '<button type="button" data-rename>リスト名を変更</button>' : ''}${!state.query && state.lists.some((l) => l.id === state.view) ? '<button type="button" class="danger" data-delete-list>リストを削除</button>' : ''}</div>` : ''}</div></header><section class="task-list" aria-label="タスク一覧">${active.map(row).join('')}${!active.length && !done.length ? '<div class="empty"><p>項目がありません</p></div>' : ''}${done.length ? `<button class="completed-toggle" data-toggle-done>${state.showDone ? '⌄' : '›'} 完了済み <small>${done.length}</small></button>${state.showDone ? done.map(row).join('') : ''}` : ''}</section>${composer()}</main>`;
  $('#app').innerHTML =
    `<aside class="sidebar ${state.mobile ? 'mobile-open' : ''}"><div class="brand"><span>✓</span> EVERYDAY <small>TO DO</small></div><div class="profile"><div class="avatar">${esc(profile.logo)}</div><div><strong>${esc(profile.name)}</strong><small>${esc(backendOrigin())}</small></div></div><div class="search"><span class="search-icon" aria-hidden="true">⌕</span><input id="search" aria-label="タスクを検索" placeholder="タスク、メモ、表を検索" value="${esc(state.query)}" autocomplete="off" enterkeyhint="search">${state.query ? '<button type="button" class="icon-button" data-clear-search aria-label="検索をクリア">×</button>' : ''}</div><nav>${
      state.lists.some((l) => l.pinned)
        ? `<div class="list-caption">ピン留め</div>${state.lists
            .filter((l) => l.pinned)
            .map(nav)
            .join('')}<div class="divider"></div>`
        : ''
    }<div class="list-caption">マイリスト <span>${state.lists.filter((l) => !l.pinned).length}</span></div>${state.lists
      .filter((l) => !l.pinned)
      .map(nav)
      .join(
        '',
      )}</nav><button class="new-list" data-new-list>＋ <span>新しいリスト</span></button><button class="server-tab ${isServer ? 'active' : ''}" data-view="server"><span class="nav-icon server">${icons.server}</span><span>サーバー管理</span></button><div class="local-status" title="${esc(backend)}">バックエンドに保存 <button type="button" data-logout>ログアウト</button></div></aside>${mainHtml}${selected ? detail(selected) : ''}<dialog id="list-dialog"><form id="list-form" class="stack-form"><h2 id="dialog-title"></h2><label for="list-name">リスト名</label><input id="list-name" class="control" name="name" maxlength="100" required autocomplete="off"><div class="field-actions"><button type="button" class="btn" data-cancel>キャンセル</button><button class="save" type="submit">保存</button></div></form></dialog>`;
  if ($('#sort')) $('#sort').value = state.sort;
  bind();
}
function listDialog(list = null, appearance = false) {
  const d = $('#list-dialog');
  const form = $('#list-form');
  $('#dialog-title').textContent = appearance
    ? 'アイコンと色'
    : list
      ? 'リスト名を変更'
      : '新しいリスト';
  $('#list-name').value = list?.name || '';
  form.querySelector('.appearance-fields')?.remove();
  if (appearance) {
    const fields = document.createElement('div');
    fields.className = 'appearance-fields';
    fields.innerHTML = `<label>アイコン<input class="control" name="icon" maxlength="8" required value="${esc(list.icon)}" aria-label="アイコン（絵文字や記号）"></label><div class="icon-presets">${['☰', '★', '♥', '●', '☀', '✓', '🏠', '💼', '🛒', '📚', '🎯', '✈️'].map((icon) => `<button type="button" class="btn" data-icon="${icon}" aria-label="${icon}">${icon}</button>`).join('')}</div><label>色<input type="color" name="color" value="${esc(list.color)}"></label>`;
    form.insertBefore(fields, form.querySelector('.field-actions'));
    fields.querySelectorAll('[data-icon]').forEach(
      (b) =>
        (b.onclick = () => {
          form.elements.icon.value = b.dataset.icon;
        }),
    );
  }
  d.showModal();
  $('#list-name').focus();
  $('[data-cancel]').onclick = () => d.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = { name: $('#list-name').value };
    if (appearance)
      Object.assign(data, { icon: form.elements.icon.value, color: form.elements.color.value });
    const save = form.querySelector('[type="submit"]');
    save.disabled = true;
    run(async () => {
      try {
        const result = await api(
          '/lists' + (list ? '/' + list.id : ''),
          list ? 'PATCH' : 'POST',
          data,
        );
        if (!list) {
          state.view = result.id;
          state.query = '';
        }
        state.menu = false;
        d.close();
        await refresh();
      } finally {
        save.disabled = false;
      }
    });
  };
}
function deleteList(list) {
  if (!confirm(`「${list.name}」とすべての項目を削除しますか？`)) return;
  run(async () => {
    await api('/lists/' + list.id, 'DELETE');
    state.selected = null;
    state.menu = false;
    await refresh();
  });
}
let closeListMenu = () => {};
function openListMenu(event, id) {
  event.preventDefault();
  closeListMenu();
  const list = state.lists.find((l) => l.id === id);
  const trigger = event.currentTarget;
  const menu = document.createElement('div');
  menu.className = 'menu list-context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `<button role="menuitem" data-action="pin">${list.pinned ? 'ピン留めを解除' : 'ピン留め'}</button><button role="menuitem" data-action="appearance">アイコンと色を設定</button><button role="menuitem" data-action="rename">リネーム</button><button role="menuitem" class="danger" data-action="delete">削除</button>`;
  document.body.append(menu);
  const rect = trigger.getBoundingClientRect();
  menu.style.left =
    Math.max(8, Math.min(event.clientX || rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top =
    Math.max(8, Math.min(event.clientY || rect.bottom, innerHeight - menu.offsetHeight - 8)) + 'px';
  const outside = (e) => {
    if (!menu.contains(e.target)) closeListMenu();
  };
  const keydown = (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      closeListMenu();
      trigger.focus();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const buttons = [...menu.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      buttons[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ].focus();
    }
  };
  closeListMenu = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('resize', closeListMenu);
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', keydown);
  window.addEventListener('resize', closeListMenu);
  menu.onclick = (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    closeListMenu();
    trigger.focus();
    if (action === 'pin')
      run(async () => {
        await api('/lists/' + id, 'PATCH', { pinned: !list.pinned });
        await refresh();
      });
    if (action === 'appearance' || action === 'rename') listDialog(list, action === 'appearance');
    if (action === 'delete') deleteList(list);
  };
  menu.querySelector('button').focus();
}
function bindListMenus() {
  closeListMenu();
  $('[data-new-list]').onclick = () => listDialog();
  if ($('[data-rename]'))
    $('[data-rename]').onclick = () => listDialog(state.lists.find((l) => l.id === state.view));
  if ($('[data-delete-list]'))
    $('[data-delete-list]').onclick = () =>
      deleteList(state.lists.find((l) => l.id === state.view));
  document.querySelectorAll('[data-list-id]').forEach((b) => {
    b.querySelector('.nav-icon').style.color = state.lists.find(
      (l) => l.id === b.dataset.listId,
    ).color;
    b.oncontextmenu = (e) => openListMenu(e, b.dataset.listId);
    b.onkeydown = (e) => {
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
        openListMenu(e, b.dataset.listId);
    };
  });
  document
    .querySelectorAll('[data-list-options]')
    .forEach((b) => (b.onclick = (e) => openListMenu(e, b.dataset.listOptions)));
}
function bind() {
  bindListMenus();
  if ($('#csv-form')) {
    $('[data-export-csv]').onclick = () =>
      run(async () => {
        const [lists, tasks] = await Promise.all([api('/lists'), api('/tasks')]);
        const url = URL.createObjectURL(
          new Blob([exportCsv(lists, tasks)], { type: 'text/csv;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `todo-${today()}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    $('#csv-form').onsubmit = (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button');
      if (button.disabled) return;
      button.disabled = true;
      run(async () => {
        try {
          const file = form.elements.csv.files[0];
          if (!file || file.size > 5000000) throw Error('5MB以下のCSVを選択してください');
          const items = importCsv(await file.text());
          if (!items.length) throw Error('インポートする項目がありません');
          if (!confirm(`${items.length}件を追加します。既存の項目は変更しません。よろしいですか？`))
            return;
          const result = await api('/import', 'POST', { items });
          await refresh();
          toast(`${result.imported}件をインポートしました`);
        } finally {
          button.disabled = false;
        }
      });
    };
  }
  $('[data-logout]').onclick = () =>
    run(async () => {
      try {
        await api('/auth/logout', 'POST', {});
      } finally {
        showLogin();
      }
    });
  if ($('.task-list'))
    bindReordering($('.task-list'), state.sort === 'manual', async (id, targetId, position) => {
      await run(async () => {
        state.tasks = await api('/tasks/reorder', 'POST', { id, targetId, position });
        render();
        document
          .querySelector('[data-item-id="' + id + '"] .task-content')
          ?.focus({ preventScroll: true });
        toast('順番を保存しました');
      });
    });
  document.querySelectorAll('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        state.view = b.dataset.view;
        state.query = '';
        state.selected = null;
        state.menu = false;
        state.mobile = false;
        render();
      }),
  );
  $('#search').oninput = (e) => {
    const pos = e.target.selectionStart;
    state.query = e.target.value;
    render();
    $('#search').focus();
    $('#search').setSelectionRange(pos, pos);
  };
  if ($('[data-clear-search]'))
    $('[data-clear-search]').onclick = () => {
      state.query = '';
      render();
      $('#search')?.focus();
    };
  if (state.view === 'server') {
    if (!state.sessionSettings && !state.loadingSessionSettings) {
      state.loadingSessionSettings = true;
      run(async () => {
        try {
          state.sessionSettings = await api('/auth/session');
        } finally {
          state.loadingSessionSettings = false;
          if (state.view === 'server') render();
        }
      });
    }
    $('[data-mobile]').onclick = () => {
      state.mobile = !state.mobile;
      render();
    };
    $('#session-form').onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        state.sessionSettings = await api('/auth/session', 'PATCH', {
          sessionTtlHours: Number(new FormData(e.currentTarget).get('sessionTtlHours')),
        });
        render();
        toast('セッション設定を保存しました');
      });
    };
    $('[data-revoke-sessions]').onclick = () =>
      run(async () => {
        if (!confirm('現在の端末以外のログインセッションをログアウトしますか？')) return;
        state.sessionSettings = await api('/auth/sessions/revoke', 'POST', {});
        render();
        toast('他のセッションをログアウトしました');
      });
    $('#server-form').onsubmit = (e) => {
      e.preventDefault();
      const values = new FormData(e.currentTarget);
      sessionStorage.setItem(
        serverProfileKey(),
        JSON.stringify({
          name: values.get('name').trim(),
          logo: values.get('logo').trim().slice(0, 2).toUpperCase(),
        }),
      );
      render();
      toast('サーバー表示を保存しました');
    };
    $('[data-reset-server]').onclick = () => {
      sessionStorage.removeItem(serverProfileKey());
      render();
    };
    $('[data-change-server]').onclick = () => showLogin();
    return;
  }
  $('#sort').onchange = (e) => {
    state.sort = e.target.value;
    render();
  };
  document.querySelectorAll('[data-check]').forEach(
    (b) =>
      (b.onclick = () =>
        run(() =>
          patch(b.dataset.check, {
            completed: !state.tasks.find((t) => t.id === b.dataset.check).completed,
          }),
        )),
  );
  document.querySelectorAll('[data-star]').forEach(
    (b) =>
      (b.onclick = () =>
        run(() =>
          patch(b.dataset.star, {
            important: !state.tasks.find((t) => t.id === b.dataset.star).important,
          }),
        )),
  );
  document.querySelectorAll('[data-open]').forEach(
    (b) =>
      (b.onclick = () => {
        state.selected = b.dataset.open;
        render();
      }),
  );
  $('[data-menu]').onclick = () => {
    state.menu = !state.menu;
    render();
  };
  $('[data-mobile]').onclick = () => {
    state.mobile = !state.mobile;
    render();
  };
  document.querySelectorAll('[data-toggle-done]').forEach(
    (b) =>
      (b.onclick = () => {
        state.showDone = !state.showDone;
        state.menu = false;
        render();
      }),
  );
  document.querySelectorAll('[data-mode]').forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        render();
        document.querySelector('#add-form input, #add-form textarea')?.focus();
      }),
  );
  if ($('#new-task')) {
    $('#new-task').oninput = (e) => {
      state.drafts.task = e.target.value;
    };
    $('#new-task').onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!state.saving && !e.isComposing && e.keyCode !== 229) $('#add-form').requestSubmit();
      }
    };
  }
  if ($('#new-memo')) {
    $('#new-memo').oninput = (e) => {
      state.drafts.memo = e.target.value;
    };
    $('#new-memo').onkeydown = (e) => {
      if (
        e.key === 'Enter' &&
        !state.saving &&
        !e.isComposing &&
        e.keyCode !== 229 &&
        (e.ctrlKey || e.metaKey)
      ) {
        e.preventDefault();
        $('#add-form').requestSubmit();
      }
    };
  }
  if ($('#add-form [data-add-column]'))
    $('#add-form [data-add-column]').onclick = () => {
      if (state.drafts.cells.length >= 20) return;
      state.drafts.cells.push('');
      render();
      $('#add-form .cell-input:last-of-type input')?.focus();
    };
  document.querySelectorAll('#add-form [data-remove-column]').forEach(
    (button) =>
      (button.onclick = () => {
        if (state.drafts.cells.length <= 1) return;
        const index = Number(button.dataset.removeColumn);
        state.drafts.cells.splice(index, 1);
        render();
        document
          .querySelectorAll('#add-form input')
          [Math.min(index, state.drafts.cells.length - 1)]?.focus();
      }),
  );
  document.querySelectorAll('#add-form [data-cell-index]').forEach((input) => {
    input.oninput = () => {
      state.drafts.cells[Number(input.dataset.cellIndex)] = input.value;
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (state.saving) return;
        if (e.altKey) {
          if (state.drafts.cells.length >= 20) return;
          state.drafts.cells.push('');
          render();
          $('#add-form .cell-input:last-of-type input')?.focus();
        } else $('#add-form').requestSubmit();
      }
    };
  });
  $('#add-form').onsubmit = (e) => {
    e.preventDefault();
    if (state.saving) return;
    const mode = state.mode;
    const payload =
      mode === 'task'
        ? { title: state.drafts.task.trim() }
        : mode === 'memo'
          ? { note: state.drafts.memo.trim() }
          : { cells: [...state.drafts.cells] };
    if (
      (mode === 'task' && !payload.title) ||
      (mode === 'memo' && !payload.note) ||
      (mode === 'table' && !payload.cells.some((c) => c.trim()))
    ) {
      toast('内容を入力してください');
      return;
    }
    state.saving = true;
    $('#add-form')?.setAttribute('aria-busy', 'true');
    run(async () => {
      try {
        const smartView = !state.lists.some((l) => l.id === state.view);
        const task = await api('/tasks', 'POST', {
          ...payload,
          kind: mode,
          listId: smartView ? 'inbox' : state.view,
          important: state.view === 'important',
          myDay: state.view === 'today' ? today() : '',
          dueDate: state.view === 'planned' ? today() : '',
        });
        state.tasks.push(task);
        state.query = '';
        if (mode === 'table') state.drafts.cells = state.drafts.cells.map(() => '');
        else state.drafts[mode] = '';
      } finally {
        state.saving = false;
        render();
        document.querySelector('#add-form input, #add-form textarea')?.focus();
      }
    });
  };
  const t = state.tasks.find((t) => t.id === state.selected);
  if (!t) return;
  $('[data-close]').onclick = () => {
    state.selected = null;
    render();
  };
  if ($('#title-form'))
    $('#title-form').onsubmit = (e) => {
      e.preventDefault();
      run(() => patch(t.id, { title: $('#title').value }));
    };
  $('#note-form').onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await patch(t.id, { note: $('#note').value });
      toast('メモを保存しました');
    });
  };
  $('#due').onchange = (e) => run(() => patch(t.id, { dueDate: e.target.value }));
  $('#move').onchange = (e) => run(() => patch(t.id, { listId: e.target.value }));
  $('[data-day]').onclick = () =>
    run(() => patch(t.id, { myDay: t.myDay === today() ? '' : today() }));
  if ($('#step-form'))
    $('#step-form').onsubmit = (e) => {
      e.preventDefault();
      const title = new FormData(e.target).get('step').trim();
      if (title)
        run(() =>
          patch(t.id, {
            steps: [...t.steps, { id: crypto.randomUUID(), title, completed: false }],
          }),
        );
    };
  document.querySelectorAll('[data-step]').forEach(
    (b) =>
      (b.onchange = () =>
        run(() =>
          patch(t.id, {
            steps: t.steps.map((s) =>
              s.id === b.dataset.step ? { ...s, completed: b.checked } : s,
            ),
          }),
        )),
  );
  document
    .querySelectorAll('[data-remove-step]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          run(() => patch(t.id, { steps: t.steps.filter((s) => s.id !== b.dataset.removeStep) }))),
    );
  if ($('#cells-form')) {
    const draft = [...t.cells];
    const capture = () =>
      document.querySelectorAll('#edit-cells input').forEach((input, i) => {
        draft[i] = input.value;
      });
    const bindColumns = () => {
      $('#edit-cells [data-add-column]').onclick = () => {
        if (draft.length >= 20) return;
        capture();
        draft.push('');
        redraw();
        $('#edit-cells .cell-input:last-of-type input')?.focus();
      };
      document.querySelectorAll('#edit-cells input').forEach(
        (input) =>
          (input.onkeydown = (e) => {
            if (e.key === 'Enter' && e.altKey && !e.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              if (draft.length >= 20) return;
              capture();
              draft.push('');
              redraw();
              $('#edit-cells .cell-input:last-of-type input')?.focus();
            }
          }),
      );
      document.querySelectorAll('#edit-cells [data-remove-column]').forEach(
        (button) =>
          (button.onclick = () => {
            if (draft.length <= 1) return;
            capture();
            const index = Number(button.dataset.removeColumn);
            draft.splice(index, 1);
            redraw();
            document
              .querySelectorAll('#edit-cells input')
              [Math.min(index, draft.length - 1)]?.focus();
          }),
      );
    };
    const redraw = () => {
      $('#edit-cells').innerHTML = cellInputs(draft, '編集する行');
      bindColumns();
    };
    bindColumns();
    $('#cells-form').onsubmit = (e) => {
      e.preventDefault();
      capture();
      run(() => patch(t.id, { cells: [...draft] }));
    };
  }
  $('[data-delete-task]').onclick = () => {
    if (confirm('この項目を削除しますか？'))
      run(async () => {
        await api('/tasks/' + t.id, 'DELETE');
        state.selected = null;
        await refresh();
      });
  };
}
$('#app').innerHTML = '<div class="loading">読み込み中…</div>';
if (token && backend) {
  refresh().catch((error) => {
    showLogin();
    toast(error.message);
  });
} else showLogin();
