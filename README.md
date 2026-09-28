# Everyday To Do

Microsoft To Doのスクリーンショットを参考にした、日本語・ダークテーマのローカルTo Doアプリです。Microsoft公式製品ではありません。

## 起動

Node.js 22.13以降が必要です（Node組み込みSQLiteを使用）。アプリ本体に外部パッケージは不要です。テストにはPlaywrightと、ローカルにインストール済みのGoogle Chromeを使います。

```sh
cd outputs/todo-app
npm start
```

http://127.0.0.1:3000 を開きます。フォルダーを直接開いた場合は、そのフォルダーで `npm start` を実行してください。

開発時は `npm run dev`。NodeのバージョンによりSQLiteの実験的機能に関する警告が表示されます。

## 自動テスト

```sh
npm ci
npm test
```

`npm test` は単体テスト、APIテスト、小さなChrome E2Eテストを順に実行します。個別実行は `npm run test:unit`、`npm run test:api`、`npm run test:e2e` です。APIテストとE2Eテストは専用の一時データベースと空きポートを使用し、通常の `data/todo.sqlite` を変更しません。E2EテストではヘッドレスChromeを起動し、タスクの追加、メモ保存、今日の予定、重要マーク、再読み込み後の保持、検索、完了を確認します。Chromeがない環境ではPlaywright用Chromiumをインストールし、テストの `channel:'chrome'` を削除して利用できます。

## 構成

```text
server.js                起動用エントリーポイント
src/                     Node.js API・入力検証
public/                  画面・スタイル・並べ替え処理
test/                    単体・API・E2Eテスト
data/                    SQLiteデータ（Git管理対象外）
```

`npm run format` でコードを整形し、`npm run format:check` で書式を確認できます。依存パッケージは `package-lock.json` に固定し、`npm ci` で再現できます。

- フロントエンド: JavaScript ES Modules、HTML、CSS。ビルド不要。
- バックエンド: Node.js HTTP REST API。
- データベース: SQLite。`data/todo.sqlite` に永続化。
- 初回起動時のみサンプルリストとタスクを登録。
- `PORT`、`HOST`、`DATA_DIR` 環境変数で設定可能。既定はローカルループバックで待ち受けます。

## 実装機能

- リストの作成、名前変更、削除（配下タスクも削除）
- タスクの作成、編集、削除、完了・未完了、重要マーク、リスト移動
- 今日の予定（日付をまたぐと自動的に対象外）、重要、期限付きタスクのスマートビュー
- タスク名・メモの全リスト検索
- 期限、メモ、ステップ（チェックリスト）
- 追加順、重要度順、期限順、名前順の並び替え
- 完了済みタスクの表示切り替え、狭い画面向けレイアウト
- 追加欄の上で「タスク（青）」「メモ（黄）」「表（緑）」を切り替え
- 複数行メモを一覧へ直接追加（Ctrl / Command + Enterでも保存）
- 表は最初2列で開始。右端の「＋」またはAlt + Enterで列を追加、各列右上の「×」でその列を削除（1〜20列）。例：バナナ｜200円｜スーパー
- 表の行はどの列からでもEnterで追加。日本語変換中のEnterでは追加されません。
- メモ・表は一覧からクリックして編集・削除。表は保存後の列数変更も可能
- タスクの詳細に書いたメモも一覧に表示。表の全列を検索対象に含める
- 手動順では、行をそのままドラッグして順番を変更。順序は保存され、再読み込み後も保持されます。本文にフォーカスしてAlt + ↑↓キーでも移動できます。完了済みは完了済み同士で並べ替えます。

モードを切り替えても入力中の内容は保持されます（ページ再読み込み時には未保存の内容は消えます）。既存のデータベースは起動時に自動更新され、これまでのタスクとメモは引き継がれます。

単一ユーザー用です。アカウント認証、共同編集・共有、担当者割り当て、添付ファイル、通知、繰り返し、Microsoftアカウントとの同期は含みません。外部公開する場合は認証・認可とHTTPS等の追加が必要です。

## REST API

JSONを送受信します。エラーは `{ "error": "メッセージ" }` 形式です。

| Method         | Path               | 内容                                               |
| -------------- | ------------------ | -------------------------------------------------- |
| GET            | /api/health        | 動作確認                                           |
| GET / POST     | /api/lists         | リスト取得 / 作成（name）                          |
| PATCH / DELETE | /api/lists/:id     | 名前変更 / 削除                                    |
| GET / POST     | /api/tasks         | 全タスク取得 / 作成（title, listId）               |
| POST           | /api/tasks/reorder | 順番変更（id, targetId, position: before / after） |
| PATCH / DELETE | /api/tasks/:id     | 更新 / 削除                                        |

タスク更新フィールド: `title`, `listId`, `completed`, `important`, `myDay`, `dueDate`, `note`, `steps`。日付は `YYYY-MM-DD` または空文字。stepsは `{id, title, completed}` の配列です。作成時は `important`, `myDay`, `dueDate` も指定できます。

追加モードは作成時の `kind` で指定します。省略時は `task`。`memo` は `note`（1〜10,000文字）、`table` は `cells`（1〜20個の文字列、各500文字以内）を送ります。表は少なくとも1列に内容が必要です。メモは `note`、表は `cells` をPATCHで更新できます。メモと表に完了状態はありません。

```js
const lists = await fetch('http://127.0.0.1:3000/api/lists').then((r) => r.json());
await fetch('http://127.0.0.1:3000/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '新しいタスク', listId: lists[0].id }),
});
```

バックアップ時はアプリを停止してから `data` フォルダー全体をコピーしてください。
