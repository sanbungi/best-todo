# REST API

`GET /api/health` と `POST /api/auth/login` は認証不要。それ以外のAPIは `Authorization: Bearer <token>` が必要です。

| Method         | Path               | 内容                                               |
| -------------- | ------------------ | -------------------------------------------------- |
| GET            | /api/health        | ヘルスチェック                                     |
| POST           | /api/auth/login    | `{username,password}` → `{token,username}`         |
| POST           | /api/auth/logout   | 現在のセッション失効                               |
| GET / POST     | /api/lists         | リスト取得 / 作成（name）                          |
| PATCH / DELETE | /api/lists/:id     | 名前変更 / 削除                                    |
| GET / POST     | /api/tasks         | 全項目取得 / 作成                                  |
| POST           | /api/tasks/reorder | `{id,targetId,position: "before" または "after"}`  |
| PATCH / DELETE | /api/tasks/:id     | 更新 / 削除                                        |
| POST           | /api/import        | `{items}`（1〜10000件）を一括追加。CSVインポート用 |

- 作成は `listId` と `kind`（省略時task）。taskは `title`、memoは `note`、tableは `cells`（1〜20列）が必要です。
- 更新は `title`, `listId`, `completed`, `important`, `myDay`, `dueDate`, `note`, `steps`, `cells`。日付は `YYYY-MM-DD` または空文字。メモ・表の完了操作は不可。
- エラーは `{error: "メッセージ"}`。
