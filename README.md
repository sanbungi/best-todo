# Everyday To Do

日本語の単一ユーザー向けTo Do。リスト・タスク・メモ・表・検索・並べ替えに対応。
フロントエンド（静的ファイル配信）とバックエンド（認証付きREST API / SQLite）は独立して起動・デプロイします。Node.js 22.13以降が必要です。

## ローカル開発

```sh
npm ci
cp .env.example .env
# .env のユーザー名・パスワードを変更
npm run dev
```

別ターミナルで `npm run dev:frontend` を実行し、http://127.0.0.1:8080 を開きます。
ログイン画面でBackend URLに `http://127.0.0.1:3000`、`.env`のユーザー名・パスワードを入力します。URLは `/api` を含めないオリジンを指定します。

- `npm start`: バックエンド。環境変数は実行環境から設定（`.env`は自動では読みません）。
- `npm run dev`: `.env`を読み込むバックエンド、watch付き。
- `npm run start:frontend` / `npm run dev:frontend`: フロントエンド。環境変数は実行環境から設定。
- フロントエンドへの接続先URLのビルド時埋め込みは不要。利用者がログイン時に指定します。

## 環境変数

| 対象    | 名前            | 内容                                                                                                                         |
| ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 両方    | `HOST`          | 待受アドレス。ローカル既定 `127.0.0.1`、Docker既定 `0.0.0.0`                                                                 |
| 両方    | `PORT`          | バックエンド既定 `3000`、フロントエンド既定 `8080`                                                                           |
| Backend | `DATA_DIR`      | SQLite保存先。既定 `./data`、Dockerでは `/data`                                                                              |
| Backend | `AUTH_USERNAME` | 必須。単一ユーザーの名前                                                                                                     |
| Backend | `AUTH_PASSWORD` | 必須。12文字以上。本番では十分長いランダム値を使用                                                                           |
| Backend | `CORS_ORIGINS`  | 許可するフロントエンドのオリジンをカンマ区切りで指定。末尾スラッシュなし。既定はブラウザからのクロスオリジン接続を許可しない |
| Backend | `SEED_DATA`     | `true`のときのみ開発サンプルを投入。既定は無効。productionでは使用不可                                                       |
| Backend | `NODE_ENV`      | 本番では `production`（Dockerで設定済み）                                                                                    |

ユーザー登録画面はありません。起動時に環境変数から1ユーザーを設定し、パスワードはメモリ内でscryptハッシュとして照合します。変更にはバックエンド再起動が必要です。
ログインは24時間有効なBearerトークンを発行します。トークンはブラウザのsessionStorage、セッションはサーバーのメモリ内に保存され、ログアウト・期限切れ・サーバー再起動で無効になります。パスワードは保存しません。ログイン失敗10回でサーバー全体に60秒の待機制限がかかります。

## 開発seedと既存データ

本番の新規DBには空の標準リスト「タスク」のみ作成します。以前のサンプルは `src/seed.js` に分離しました。`.env.example`は `SEED_DATA=true`、`DATA_DIR=./data-dev` として開発用に利用できます。
seedはトランザクション内で一度だけ適用され、削除済みサンプルを再投入しません。やり直す場合は開発サーバーを止め、開発用データディレクトリだけを削除してください。
既存DBの項目は自動削除しません。以前のサンプルも保持されるため、不要なものは画面から削除するか、本番用に新しい保存先を指定してください。

## CapRoverで運用

1. `todo-backend` / `todo-frontend` の2アプリを作成。
2. Container HTTP Portをバックエンド `3000`、フロントエンド `8080` に設定。
3. バックエンドに永続ディレクトリ `/data` を追加（Named Volume推奨）。コンテナは非rootのnodeユーザー（UID 1000）で動作するので、ホストディレクトリを使う場合は書き込み権限を付与。
4. バックエンドの環境変数に `AUTH_USERNAME`、`AUTH_PASSWORD`、`CORS_ORIGINS=https://todo.example.com` を設定。`SEED_DATA`は未設定または `false`。
5. 両アプリにドメインを設定し、HTTPSを有効化・強制。利用者はフロントエンド画面で `https://api.example.com` にログイン。
6. バックエンドは **1レプリカ** で運用。SQLite・メモリ内セッションのため水平スケールは非対応。

Backend URLはブラウザから到達可能な公開URLです。CapRover内部のサービス名は指定しません。CORSには実際に利用するフロントエンドのスキーム・ホスト・ポートを正確に指定してください。本番の認証情報をHTTPで送らないでください。

### GitHub Actions → GHCR → CapRover

`.github/workflows/images.yml` がテスト後に2イメージをビルドします。PRではビルドのみ、mainへのpush・`v*`タグ・手動実行ではGHCRへ公開します。`GITHUB_TOKEN` のpackages write権限を使用し、アプリの認証情報をビルドへ渡す必要はありません。

- `ghcr.io/<owner>/<repository>-backend:sha-<完全なcommit SHA>`
- `ghcr.io/<owner>/<repository>-frontend:sha-<完全なcommit SHA>`

名前は小文字です。mainでは `latest`、リリースタグではそのタグも付きます。運用では変更されないSHAタグを推奨します。
CapRoverの各アプリのDeploymentで対応するイメージ名を指定してデプロイしてください。非公開GHCRの場合はCapRoverにGHCRレジストリ認証（read:packagesを持つ資格情報）を設定します。Actionsからの本番自動デプロイは行いません。

ソースからCapRoverでビルドする場合は、各アプリでCaptain Definitionのパスに `captain-definition.backend` / `captain-definition.frontend` を指定できます。

バックアップはバックエンドを停止し、`/data`全体（SQLite/WALを含む）をコピーします。復元先でもnodeユーザーの書き込み権限が必要です。

## API

`GET /api/health` と `POST /api/auth/login` は認証不要。それ以外のAPIは `Authorization: Bearer <token>` が必要です。

| Method         | Path               | 内容                                              |
| -------------- | ------------------ | ------------------------------------------------- |
| POST           | /api/auth/login    | `{username,password}` → `{token,username}`        |
| POST           | /api/auth/logout   | 現在のセッション失効                              |
| GET / POST     | /api/lists         | リスト取得 / 作成（name）                         |
| PATCH / DELETE | /api/lists/:id     | 名前変更 / 削除                                   |
| GET / POST     | /api/tasks         | 全項目取得 / 作成                                 |
| POST           | /api/tasks/reorder | `{id,targetId,position: "before" または "after"}` |
| PATCH / DELETE | /api/tasks/:id     | 更新 / 削除                                       |

作成は `listId` と `kind`（省略時task）。taskは `title`、memoは `note`、tableは `cells`（1〜20列）が必要です。更新は `title`, `listId`, `completed`, `important`, `myDay`, `dueDate`, `note`, `steps`, `cells`。日付は `YYYY-MM-DD` または空文字。メモ・表の完了操作は不可。エラーは `{error: "メッセージ"}`。

## テスト・構成

```sh
npm ci
npx playwright install chrome
npm test
npm run format:check
```

API/E2Eは一時DBを使用。E2Eは別ポートのフロントエンド・バックエンドを起動し、実際のログイン・CORS経由で操作を確認します。

- `src/server.js`: バックエンドAPI、DBマイグレーション
- `src/auth.js`: 単一ユーザー認証・セッション
- `src/seed.js`: 開発サンプル
- `src/frontend.js`: 静的フロントエンドサーバー
- `public/`: UI、接続先指定・ログイン
- `Dockerfile.backend` / `Dockerfile.frontend`: 独立イメージ
