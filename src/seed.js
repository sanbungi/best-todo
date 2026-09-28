// Development samples only. A marker prevents deleted samples from reappearing.
export function seed(db) {
  db.exec('CREATE TABLE IF NOT EXISTS seeds (id TEXT PRIMARY KEY)');
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
      db.prepare('INSERT OR IGNORE INTO lists VALUES (?, ?)').run(id, name);
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
