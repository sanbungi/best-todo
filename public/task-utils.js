export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Keep creation order within each group; dated lists lose priority after their day.
export function orderedLists(lists, currentDay = today()) {
  const rank = (list) =>
    list.listDate === currentDay ? 0 : list.listDate && list.listDate < currentDay ? 2 : 1;
  return [...lists].sort((a, b) => rank(a) - rank(b));
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

export function tasksForView(tasks, listId) {
  return tasks.filter((task) => task.listId === listId);
}

// Memos and table rows have no title, so name order falls back to their visible text.
export const entryText = (task) =>
  task.title || task.note || (task.cells || []).filter(Boolean).join(' ');

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
export function formatDue(dueDate, currentDay = today()) {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [cy, cm, cd] = currentDay.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(cy, cm - 1, cd)) / 86400000);
  if (days === 0) return '今日';
  if (days === 1) return '明日';
  if (days === -1) return '昨日';
  const weekday = weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y === cy ? '' : y + '/'}${m}/${d}(${weekday})`;
}

export function visibleTasks(tasks, { view, query = '', sort = 'created' }) {
  const matches = query
    ? tasks.filter((task) =>
        `${task.title} ${task.note} ${(task.cells || []).join(' ')}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      )
    : tasksForView(tasks, view);
  const sorted = [...matches].sort((a, b) =>
    sort === 'manual'
      ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      : sort === 'title'
        ? entryText(a).localeCompare(entryText(b), 'ja')
        : sort === 'due'
          ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
          : a.createdAt.localeCompare(b.createdAt),
  );
  return {
    active: sorted.filter((task) => !task.completed),
    done: sorted.filter((task) => task.completed),
  };
}
