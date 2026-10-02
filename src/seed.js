// Development samples only. Each marker prevents deleted samples from reappearing.
export function seed(db) {
  db.exec('CREATE TABLE IF NOT EXISTS seeds (id TEXT PRIMARY KEY)');
  seedIdeas(db);
  seedVariety(db);
}

function seedIdeas(db) {
  if (db.prepare('SELECT id FROM seeds WHERE id=?').get('demo-v1')) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [id, name] of [
      ['ideas', 'アイディア'],
      ['print', '3Dプリントしたいもの'],
      ['infra', 'インフラ'],
      ['travel', '旅'],
      ['youtube', 'YouTube'],
      ['blog', 'blog'],
      ['wish', 'ほしい物リスト'],
    ])
      db.prepare('INSERT OR IGNORE INTO lists (id,name) VALUES (?, ?)').run(id, name);
    [
      'pcスマホの履歴から日記自動',
      'センサーと自動農業',
      '気象観測装置',
      'タイムアタックゴルフ、格闘あり',
      '進路をバイブで教えてくれる歩き',
      'osmをゲームのマップとして変換する、マルチプレイで陣取り合戦',
      '指定時刻にAPIを呼び出す仕組み',
      '教育用のマルチプレイ、バーチャル机',
      'プロンプトシェアアプリ',
      'dnsサーバーを作ろう',
      'ニッチ言語系コントリビュート',
      '新しいアプリのスケッチ',
    ].forEach((title, i) => {
      db.prepare('INSERT OR IGNORE INTO tasks (id,listId,title,createdAt) VALUES (?,?,?,?)').run(
        `seed-${i}`,
        'ideas',
        title,
        new Date().toISOString(),
      );
    });
    db.prepare('INSERT INTO seeds VALUES (?)').run('demo-v1');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Local calendar day offset from today, matching the frontend's YYYY-MM-DD.
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Covers every entry kind and display state: steps, due dates, notes, completion and dated lists.
// Only tasks can be completed, as the API enforces.
function seedVariety(db) {
  if (db.prepare('SELECT id FROM seeds WHERE id=?').get('demo-v2')) return;
  const lists = [
    {
      id: 'seed-today',
      name: day(0).replaceAll('-', '/'),
      listDate: day(0),
      icon: '☀',
      color: '#e0b04c',
    },
    { id: 'seed-yesterday', name: day(-1).replaceAll('-', '/'), listDate: day(-1) },
    { id: 'seed-work', name: '仕事', icon: '💼', color: '#7aa7e0', pinned: 1 },
    { id: 'seed-shopping', name: '買い物', icon: '🛒', color: '#6fbf8f', pinned: 1 },
    { id: 'seed-reading', name: '読書メモ', icon: '📚', color: '#cbb27b' },
  ];
  const step = (title, completed = false) => ({ id: title, title, completed });
  const entries = [
    // Today's dated list: a mix of open, done and kinds.
    ['seed-today', { title: '朝のメール確認', completed: 1 }],
    ['seed-today', { title: '歯医者の予約を取る', dueDate: day(0) }],
    ['seed-today', { title: 'ジムに行く', note: '脚の日' }],
    ['seed-today', { kind: 'memo', note: '午後は集中作業。通知を切る。' }],
    ['seed-today', { kind: 'table', cells: ['10:00', '定例', '会議室B'] }],
    ['seed-today', { kind: 'table', cells: ['15:30', '1on1', 'オンライン'] }],
    // Yesterday's list sinks below normal lists.
    ['seed-yesterday', { title: '洗濯', completed: 1 }],
    ['seed-yesterday', { title: '請求書を送る' }],
    // Work: steps, notes and every due-date label.
    [
      'seed-work',
      {
        title: '四半期レポートを作成する',
        dueDate: day(-2),
        note: '先月分の数値は経理から受け取り済み',
        steps: [step('数値を集計', true), step('グラフを作る', true), step('所感を書く')],
      },
    ],
    ['seed-work', { title: 'デザインレビューのフィードバックを返す', dueDate: day(-1) }],
    ['seed-work', { title: 'リリースノートを書く', dueDate: day(0) }],
    [
      'seed-work',
      {
        title: '新メンバーのオンボーディング資料を更新',
        dueDate: day(1),
        steps: [step('アカウント発行手順'), step('開発環境セットアップ')],
      },
    ],
    ['seed-work', { title: '来週の勉強会の題材を決める', dueDate: day(5) }],
    ['seed-work', { title: '年次の契約更新', dueDate: day(400) }],
    [
      'seed-work',
      {
        title:
          'とても長いタスク名の表示確認：折り返しが崩れないか、詳細パネルや検索結果でも読みやすいかを確かめるためのサンプルです',
      },
    ],
    [
      'seed-work',
      { kind: 'memo', note: '会議のルール\n・開始5分前に資料共有\n・決定事項は最後に読み上げる' },
    ],
    ['seed-work', { kind: 'table', cells: ['担当', '作業', '状態'] }],
    ['seed-work', { kind: 'table', cells: ['佐藤', 'API設計', 'レビュー中'] }],
    ['seed-work', { kind: 'table', cells: ['鈴木', '画面実装', ''] }],
    ['seed-work', { title: '経費精算', completed: 1, dueDate: day(-3) }],
    // Shopping: table rows with varying column counts.
    ['seed-shopping', { kind: 'table', cells: ['牛乳', '2本'] }],
    ['seed-shopping', { kind: 'table', cells: ['卵', '1パック', '¥280'] }],
    ['seed-shopping', { kind: 'table', cells: ['トマト', '3個', '¥398', '八百屋', '赤いもの'] }],
    ['seed-shopping', { kind: 'table', cells: ['パン', '', '¥200'] }],
    ['seed-shopping', { title: '洗剤の詰め替えを買う', completed: 1 }],
    ['seed-shopping', { title: 'ポイントカードを持っていく' }],
    ['seed-shopping', { kind: 'memo', note: '日曜はスーパーが混むので土曜の夜に行く' }],
    // Reading: memos of different lengths.
    ['seed-reading', { kind: 'memo', note: '良いコードは、変更しやすいコード。' }],
    [
      'seed-reading',
      {
        kind: 'memo',
        note: '『達人プログラマー』\n・DRY原則\n・壊れた窓を放置しない\n・曳光弾で早く全体をつなぐ',
      },
    ],
    [
      'seed-reading',
      {
        kind: 'memo',
        note: '長めのメモの表示確認。'.repeat(12) + '\n\n段落を空けた二つ目の段落もあります。',
      },
    ],
    ['seed-reading', { kind: 'table', cells: ['書名', '著者', '読了日'] }],
    ['seed-reading', { kind: 'table', cells: ['リーダブルコード', 'Boswell / Foucher', day(-20)] }],
    ['seed-reading', { title: '次に読む本を選ぶ' }],
    // Existing sample lists get other kinds too.
    ['wish', { kind: 'table', cells: ['ワイヤレスイヤホン', '¥15,000', '候補比較中'] }],
    ['wish', { kind: 'table', cells: ['登山靴', '¥22,000'] }],
    ['wish', { title: 'セール日を調べる', dueDate: day(10) }],
    [
      'youtube',
      { kind: 'memo', note: '撮りたい動画\n・3Dプリンタのタイムラプス\n・自宅サーバー紹介' },
    ],
    ['youtube', { title: 'サムネイルを作る', important: 1, myDay: day(0) }],
  ];
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    for (const l of lists)
      db.prepare(
        'INSERT OR IGNORE INTO lists (id,name,listDate,icon,color,pinned) VALUES (?,?,?,?,?,?)',
      ).run(l.id, l.name, l.listDate || '', l.icon || '☰', l.color || '#6488d8', l.pinned || 0);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO tasks (id,listId,title,note,kind,cells,steps,completed,important,myDay,dueDate,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    entries.forEach(([listId, e], i) => {
      // Shuffle creation times so 追加順 differs from the manual order.
      const createdAt = new Date(now - ((i * 7) % entries.length) * 3600000).toISOString();
      insert.run(
        `seed2-${i}`,
        listId,
        // Same derived titles the API stores for memos and table rows.
        e.kind === 'memo'
          ? e.note.slice(0, 500)
          : e.kind === 'table'
            ? e.cells.filter(Boolean).join(' | ').slice(0, 500)
            : e.title,
        e.note || '',
        e.kind || 'task',
        JSON.stringify(e.cells || []),
        JSON.stringify(e.steps || []),
        e.completed || 0,
        e.important || 0,
        e.myDay || '',
        e.dueDate || '',
        createdAt,
      );
    });
    db.prepare('INSERT INTO seeds VALUES (?)').run('demo-v2');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
