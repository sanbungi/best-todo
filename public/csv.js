export const columns = [
  'list',
  'kind',
  'title',
  'note',
  'completed',
  'important',
  'myDay',
  'dueDate',
  'cells',
  'steps',
];

export function exportCsv(lists, tasks) {
  const quote = (value) => {
    let text = String(value ?? '');
    // Prevent spreadsheet formula execution; importing reverses this prefix.
    if (/^[=+\-@\t\r\n']/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    '\uFEFF' +
    [
      columns,
      ...tasks.map((task) =>
        columns.map((key) =>
          key === 'list'
            ? lists.find((list) => list.id === task.listId)?.name
            : ['cells', 'steps'].includes(key)
              ? JSON.stringify(task[key] || [])
              : task[key],
        ),
      ),
    ]
      .map((row) => row.map(quote).join(','))
      .join('\r\n')
  );
}

export function importCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    closed = false;
  const push = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === ',') push();
    else if (c === '\r' || c === '\n') {
      push();
      rows.push(row);
      row = [];
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw Error('CSVの引用符が不正です');
      cell += c;
    }
  }
  if (quoted) throw Error('CSVの引用符が閉じられていません');
  if (cell || row.length || closed) {
    push();
    rows.push(row);
  }
  const header = rows.shift() || [];
  if (header.join(',') !== columns.join(','))
    throw Error('CSVのヘッダーが不正です。エクスポートしたCSVを使用してください');
  return rows
    .filter((r) => r.some(Boolean))
    .map((r, index) => {
      try {
        if (r.length !== columns.length) throw Error('列数が不正です');
        const item = Object.fromEntries(
          columns.map((key, i) => [key, r[i].replace(/^'(?=[=+\-@\t\r\n'])/, '')]),
        );
        for (const key of ['completed', 'important']) {
          if (!['true', 'false', ''].includes(item[key]))
            throw Error(key + 'はtrue/falseで指定してください');
          item[key] = item[key] === 'true';
        }
        for (const key of ['cells', 'steps']) item[key] = JSON.parse(item[key] || '[]');
        return item;
      } catch (e) {
        throw Error(`CSV ${index + 2}行目: ${e.message}`);
      }
    });
}
