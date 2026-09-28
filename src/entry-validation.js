function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

export function entryKind(value = 'task') {
  if (!['task', 'memo', 'table'].includes(value))
    invalid('種類はタスク・メモ・表のいずれかにしてください');
  return value;
}

export function entryCells(value, kind) {
  if (!Array.isArray(value) || value.length > 20 || (kind === 'table' && value.length < 1))
    invalid('表の列数は1〜20列にしてください');
  if (kind !== 'table' && value.length) invalid('列を保存できるのは表モードだけです');
  const cells = value.map((cell) => {
    if (typeof cell !== 'string' || cell.length > 500)
      invalid('各列は500文字以内で入力してください');
    return cell.trim();
  });
  if (kind === 'table' && !cells.some(Boolean)) invalid('少なくとも1列に内容を入力してください');
  return cells;
}
