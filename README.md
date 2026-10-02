# Best ToDo

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

- `npm start`: バックエンド。`.env`があれば読み込みます。実行環境で設定済みの環境変数が優先されます。
- `npm run dev`: `.env`を読み込むバックエンド、watch付き。
- `npm run start:frontend` / `npm run dev:frontend`: フロントエンド。環境変数は実行環境から設定。
- フロントエンドへの接続先URLのビルド時埋め込みは不要。利用者がログイン時に指定します。

## Android版（WebView）

`android/` に既存の `public/` を表示するAndroidクライアントを追加しています。バックエンドは内蔵せず、Web版と同じAPIへログインします。同じバックエンドならタスクも共有されます。

- 画面の正は引き続き `public/` です。Androidビルド時に `android/app/src/main/assets/public` へコピーします。
- アプリ内のフロントエンドOriginは `https://todo.local` です。バックエンドの `CORS_ORIGINS` にこのOriginを追加してください。
- Android側は `usesCleartextTraffic=false`、WebViewもmixed content禁止です。本番バックエンドはHTTPSで指定してください。

```sh
# Android SDK / JDK 17以上がある環境で実行
cd android
./gradlew assembleDebug      # 開発用（httpのバックエンドにも接続可）
./gradlew testDebugUnitTest  # アセット配信処理のテスト
```

バージョンは `package.json` の `version` から決まります（versionCodeは `major*10000+minor*100+patch`）。release APKは環境変数 `ANDROID_KEYSTORE_FILE` などでkeystoreを指定すると、その鍵で署名されます。未指定の場合はdebug鍵で署名されます。

Android Studioで `android/` を開いてビルドすることもできます。初回はAndroid Gradle Plugin等のダウンロードにネット接続が必要です。

## Windowsデスクトップ版（Electron）

既存の `public/` をそのまま表示するWindowsクライアントです。バックエンドは内蔵せず、Web版と同じAPIへログインします。同じバックエンドならタスクも共有されます。

```sh
npm ci
npm run desktop
# UIを編集すると自動で再読み込みする開発モード
npm run dev:desktop
```

バックエンドの `CORS_ORIGINS` に **`http://127.0.0.1:17880`** を追加して再起動してください。Web版も使う場合はカンマで併記します。

```text
CORS_ORIGINS=https://todo.example.com,http://127.0.0.1:17880
```

ローカルAPIを使う場合は別ターミナルで `npm run dev` を起動し、デスクトップのログイン画面で `http://127.0.0.1:3000` と `.env` の認証情報を入力します。リモートAPIへはHTTPSを使用してください。

### 画面変更の反映

- **画面の正は `public/`**。Electron専用のHTML/CSS/画面ロジックはありません。
- Web版とElectron版で `src/frontend-server.js` の静的配信処理も共用。`public/`内のサブディレクトリや画像も配信できます。
- `dev:desktop` では `public/` の保存で自動再読み込み（未保存の入力は失われます）。Electron本体や配信処理を変更した場合は再起動します。
- 配布版にはビルド時点の `public/` を同梱。画面更新の配布には再ビルド・再インストールが必要です。Webサイトの更新を遠隔で取り込む機能や自動アップデートは実装していません。

### Windows / Linux用ビルド

Windows版（NSIS、x64）はWindows上、Linux版（AppImage・deb）はLinux上で実行します。初回はElectron・NSIS等のダウンロードにネット接続が必要です。

```sh
npm run pack:desktop         # dist/<os>-unpacked/ に実行可能なフォルダを生成
npm run build:desktop:win    # dist/ にNSISインストーラーを生成
npm run build:desktop:linux  # dist/ にAppImageとdebを生成
npm run test:desktop         # 実際のElectron起動テスト（GUI環境が必要。Linuxのヘッドレス環境では xvfb-run -a を付ける）
# パッケージ済みアプリを検証する場合
DESKTOP_EXECUTABLE=dist/linux-unpacked/best-todo npm run test:desktop
```

コード署名は未設定なので、配布先ではSmartScreenの警告が出ることがあります。`data/`、`.env`、APIサーバーは同梱しません。SQLiteは引き続きバックエンドで管理されます。認証トークンはWeb版と同じsessionStorageで、アプリ終了後は再ログインします。

Electronはループバックの固定ポート17880だけで画面を配信します。ポート競合時はエラーを表示して終了し、既存のサーバーは読み込みません。多重起動は既存ウィンドウを表示します。Node.js連携は無効・sandbox/contextIsolationは有効、外部ページへの移動・新規ウィンドウ・権限要求は禁止しています。メニューはAltで表示できます。

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
seedはトランザクション内で一度だけ適用され、削除済みサンプルを再投入しません。サンプルは `demo-v1`（アイディア一覧）と `demo-v2`（メモ・表・期限・ステップ・日付リストなど表示確認用）に分かれ、未適用の分だけ投入されます。日付は投入した日を基準にします。やり直す場合は開発サーバーを止め、開発用データディレクトリだけを削除してください。
既存DBの項目は自動削除しません。以前のサンプルも保持されるため、不要なものは画面から削除するか、本番用に新しい保存先を指定してください。

## CapRoverで運用

1. `todo-backend` / `todo-frontend` の2アプリを作成。
2. Container HTTP Portをバックエンド `3000`、フロントエンド `8080` に設定。
3. バックエンドに永続ディレクトリ `/data` を追加（Named Volume推奨）。コンテナは非rootのnodeユーザー（UID 1000）で動作するので、ホストディレクトリを使う場合は書き込み権限を付与。
4. バックエンドの環境変数に `AUTH_USERNAME`、`AUTH_PASSWORD`、`CORS_ORIGINS=https://todo.example.com` を設定。`SEED_DATA`は未設定または `false`。
5. 両アプリにドメインを設定し、HTTPSを有効化・強制。利用者はフロントエンド画面で `https://api.example.com` にログイン。
6. バックエンドは **1レプリカ** で運用。SQLite・メモリ内セッションのため水平スケールは非対応。

Backend URLはブラウザから到達可能な公開URLです。CapRover内部のサービス名は指定しません。CORSには実際に利用するフロントエンドのスキーム・ホスト・ポートを正確に指定してください。本番の認証情報をHTTPで送らないでください。

### GitHub Actions

- `.github/workflows/ci.yml`（全ブランチへのpush・PR）：`format:check`、`npm test`、Electron起動テスト（xvfb）、AndroidのJUnitテスト。
- `.github/workflows/build.yml`（`v*` タグのpush・手動実行）：CIを通ったあとで次を行います。
  - Windowsインストーラー、Linux AppImage/deb、Android APKをビルドし、Actionsのartifactに保存します。Linux版は、パッケージ済みのアプリを実際に起動して確認します。
  - backend/frontendのイメージをGHCRへ公開します。
  - タグの場合は全成果物と `SHA256SUMS` を添えてGitHub Releaseを作成します。`-` を含むタグ（例: `v1.2.0-rc.1`）はprereleaseになります。

リリースの手順は `git tag v1.2.3 && git push origin v1.2.3` です。タグからバージョンが決まるため、CI内で `package.json` とAndroidのversionName/versionCodeがそのタグの値になります。コミットはされません。

Androidのrelease APKを常に同じ鍵で署名するには、リポジトリのSecretsに次の4つを登録します。未登録の場合は実行のたびに異なるdebug鍵で署名されるため、更新時にアンインストールが必要です。

```sh
keytool -genkeypair -v -keystore release.jks -alias besttodo -keyalg RSA -keysize 4096 -validity 10000
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 release.jks)
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body besttodo
gh secret set ANDROID_KEY_PASSWORD
```

GHCRに公開されるイメージは次のとおりです。

- `ghcr.io/<owner>/<repository>-backend:sha-<完全なcommit SHA>`
- `ghcr.io/<owner>/<repository>-frontend:sha-<完全なcommit SHA>`

名前は小文字です。タグ時とmainでの手動実行では `latest` が付き、タグ時はバージョン（例: `1.2.3`）も付きます。運用では変更されないSHAタグを推奨します。
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
