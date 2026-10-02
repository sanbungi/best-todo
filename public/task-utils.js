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

export function tasksForView(tasks, view, currentDay = today()) {
  return tasks.filter((task) =>
    view === 'today'
      ? task.myDay === currentDay
      : view === 'important'
        ? task.important
        : view === 'planned'
          ? Boolean(task.dueDate)
          : task.listId === view,
  );
}

export function visibleTasks(tasks, { view, query = '', sort = 'created', currentDay = today() }) {
  const matches = query
    ? tasks.filter((task) =>
        `${task.title} ${task.note} ${(task.cells || []).join(' ')}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      )
    : tasksForView(tasks, view, currentDay);
  const sorted = [...matches].sort((a, b) =>
    sort === 'manual'
      ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      : sort === 'title'
        ? a.title.localeCompare(b.title, 'ja')
        : sort === 'important'
          ? Number(b.important) - Number(a.important)
          : sort === 'due'
            ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
            : a.createdAt.localeCompare(b.createdAt),
  );
  return {
    active: sorted.filter((task) => !task.completed),
    done: sorted.filter((task) => task.completed),
  };
}
