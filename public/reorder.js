// Move relative to another visible item so filtered-out items are never lost.
export function bindReordering(container, enabled, move) {
  let dragged = null,
    busy = false;
  const rows = [...container.querySelectorAll('[data-item-id]')];
  let dragImage = null;
  const clear = () => {
    container.classList.remove('is-reordering');
    rows.forEach((row) => row.classList.remove('dragging', 'drop-before', 'drop-after'));
    dragImage?.remove();
    dragImage = null;
  };
  const save = async (id, targetId, position) => {
    if (busy) return;
    busy = true;
    try {
      await move(id, targetId, position);
    } finally {
      busy = false;
    }
  };
  for (const row of rows) {
    row.draggable = enabled;
    const handle = row.querySelector('.task-content');
    handle.title = enabled ? 'ドラッグで並べ替え（Alt + ↑↓でも移動）' : '';
    row.addEventListener('dragstart', (event) => {
      if (!enabled || busy) {
        event.preventDefault();
        return;
      }
      dragged = row;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.itemId);
      // Hide the browser's translucent duplicate; keep the original row readable.
      dragImage = document.createElement('canvas');
      dragImage.width = 1;
      dragImage.height = 1;
      dragImage.className = 'empty-drag-image';
      document.body.append(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);
      container.classList.add('is-reordering');
      row.classList.add('dragging');
    });
    row.addEventListener('dragover', (event) => {
      if (!dragged || row === dragged || row.dataset.completed !== dragged.dataset.completed)
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      rows.forEach((item) => item.classList.remove('drop-before', 'drop-after'));
      const bounds = row.getBoundingClientRect();
      row.classList.add(
        event.clientY < bounds.top + bounds.height / 2 ? 'drop-before' : 'drop-after',
      );
      const area = container.getBoundingClientRect();
      if (event.clientY < area.top + 45) container.scrollTop -= 18;
      if (event.clientY > area.bottom - 45) container.scrollTop += 18;
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!dragged || row === dragged || row.dataset.completed !== dragged.dataset.completed)
        return;
      const id = dragged.dataset.itemId;
      const bounds = row.getBoundingClientRect();
      const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
      clear();
      dragged = null;
      void save(id, row.dataset.itemId, position);
    });
    row.addEventListener('dragend', () => {
      clear();
      dragged = null;
    });
    handle.addEventListener('keydown', (event) => {
      if (!enabled || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const group = rows.filter((item) => item.dataset.completed === row.dataset.completed);
      const offset = event.key === 'ArrowUp' ? -1 : 1;
      const target = group[group.indexOf(row) + offset];
      if (target)
        void save(row.dataset.itemId, target.dataset.itemId, offset < 0 ? 'before' : 'after');
    });
  }
}
