# 開発ガイド

## 必要なもの

- Node.js **22.13以降** / npm
- E2Eテスト: Google Chrome（Playwright）
- Android版: Android SDK、JDK 17以上
- デモ動画: [デモ動画の生成マニュアル](../artifacts/demo/README.md)を参照

## ローカルで起動する

```sh
npm ci
cp .env.example .env   # AUTH_USERNAME / AUTH_PASSWORD を変更
npm run dev            # バックエンド → http://127.0.0.1:3000
```

別のターミナルでフロントエンドを起動します。

```sh
npm run dev:frontend   # フロントエンド → http://127.0.0.1:8080
```

http://127.0.0.1:8080 を開き、ログイン画面でBackend URLに `http://127.0.0.1:3000`（`/api` を含めないオリジン）、`.env` のユーザー名・パスワードを入力します。

| コマンド                                          | 内容                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm start`                                       | バックエンド。`.env` があれば読み込み、実行環境で設定済みの環境変数を優先 |
| `npm run dev`                                     | `.env` を読み込むバックエンド（watch付き）                                |
| `npm run start:frontend` / `npm run dev:frontend` | フロントエンド。環境変数は実行環境から設定                                |

環境変数の一覧は[セルフホスト](self-hosting.md#環境変数)を参照してください。

### 開発用seed

`.env.example` は `SEED_DATA=true`・`DATA_DIR=./data-dev` なので、表示確認用のサンプルデータ入りで始まります。サンプルは `src/seed.js` にあります。

- seedはトランザクション内で一度だけ適用され、削除済みサンプルを再投入しません。
- サンプルは `demo-v1`（アイディア一覧）と `demo-v2`（メモ・表・期限・ステップ・日付リストなど表示確認用）に分かれ、未適用の分だけ投入されます。日付は投入した日を基準にします。
- やり直す場合は開発サーバーを止め、開発用データディレクトリだけを削除してください。

## プロジェクト構成

```text
.
├── public/                 # UI（全クライアント共通）、接続先指定・ログイン
├── src/
│   ├── server.js           # バックエンドAPI、DBマイグレーション
│   ├── auth.js             # 単一ユーザー認証・セッション
│   ├── seed.js             # 開発サンプル
│   ├── frontend.js         # 静的フロントエンドサーバー
│   └── frontend-server.js  # 静的配信処理（Web / Electron 共用）
├── electron/               # デスクトップ版
├── android/                # Android版（WebView）
├── test/                   # API / E2E / Electron テスト
├── docs/                   # ドキュメント、README用素材
├── artifacts/demo/         # デモ動画の自動生成
├── Dockerfile.backend      # バックエンドイメージ
└── Dockerfile.frontend     # フロントエンドイメージ
```

**画面の正は `public/`** です。Electron版・Android版に専用のHTML/CSS/画面ロジックはなく、ビルド時に `public/` を同梱します。

## テスト

```sh
npx playwright install chrome
npm test               # API / E2E テスト
npm run format:check   # Prettier（npm run format で整形）
```

API/E2Eは一時DBを使用します。E2Eは別ポートのフロントエンド・バックエンドを起動し、実際のログイン・CORS経由で操作を確認します。

## デスクトップ版（Electron）

```sh
npm run desktop       # 起動
npm run dev:desktop   # public/ の保存で自動再読み込みする開発モード
```

ローカルAPIに接続する場合は、バックエンドの `CORS_ORIGINS` に `http://127.0.0.1:17880` を追加して `npm run dev` を起動し、ログイン画面で `http://127.0.0.1:3000` と `.env` の認証情報を入力します。

- `dev:desktop` では `public/` の保存で自動再読み込みします（未保存の入力は失われます）。Electron本体や配信処理を変更した場合は再起動します。
- Web版とElectron版で `src/frontend-server.js` の静的配信処理を共用しています。`public/` 内のサブディレクトリや画像も配信できます。

### ビルド

Windows版（NSIS、x64）はWindows上、Linux版（AppImage・deb）はLinux上で実行します。初回はElectron・NSIS等のダウンロードにネット接続が必要です。

```sh
npm run pack:desktop         # dist/<os>-unpacked/ に実行可能なフォルダを生成
npm run build:desktop:win    # dist/ にNSISインストーラーを生成
npm run build:desktop:linux  # dist/ にAppImageとdebを生成
npm run test:desktop         # 実際のElectron起動テスト（GUI環境が必要。Linuxのヘッドレス環境では xvfb-run -a を付ける）
# パッケージ済みアプリを検証する場合
DESKTOP_EXECUTABLE=dist/linux-unpacked/best-todo npm run test:desktop
```

### 設計メモ

- 配布版にはビルド時点の `public/` を同梱します。画面更新の配布には再ビルド・再インストールが必要です。遠隔での画面更新や自動アップデートは実装していません。
- コード署名は未設定なので、配布先ではSmartScreenの警告が出ることがあります。`data/`、`.env`、APIサーバーは同梱しません。認証トークンはWeb版と同じsessionStorageで、アプリ終了後は再ログインします。
- ループバックの固定ポート17880だけで画面を配信します。ポート競合時はエラーを表示して終了し、既存のサーバーは読み込みません。多重起動は既存ウィンドウを表示します。
- Node.js連携は無効、sandbox/contextIsolationは有効。外部ページへの移動・新規ウィンドウ・権限要求は禁止しています。メニューはAltで表示できます。

## Android版（WebView）

```sh
cd android
./gradlew assembleDebug      # 開発用（httpのバックエンドにも接続可）
./gradlew testDebugUnitTest  # アセット配信処理のテスト
```

- ビルド時に `public/` を `android/app/src/main/assets/public` へコピーします。
- アプリ内のフロントエンドOriginは `https://todo.local` です。
- `usesCleartextTraffic=false`、WebViewもmixed content禁止です。本番バックエンドはHTTPSで指定してください。
- バージョンは `package.json` の `version` から決まります（versionCodeは `major*10000+minor*100+patch`）。
- release APKは環境変数 `ANDROID_KEYSTORE_FILE` などでkeystoreを指定するとその鍵で署名され、未指定の場合はdebug鍵で署名されます。
- Android Studioで `android/` を開いてビルドすることもできます（初回はAndroid Gradle Plugin等のダウンロードにネット接続が必要）。

## CI / リリース

| Workflow                       | トリガー                  | 内容                                                                                                                                      |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | 全ブランチへのpush・PR    | `format:check`、`npm test`、Electron起動テスト（xvfb）、AndroidのJUnitテスト                                                              |
| `.github/workflows/build.yml`  | `v*` タグのpush・手動実行 | CI通過後、Windows / Linux / Android をビルド（Linux版は起動確認付き）、GHCRへイメージ公開、タグ時は `SHA256SUMS` 付きでGitHub Release作成 |
| `.github/workflows/deploy.yml` | mainへのpush・手動実行    | CI通過後、GHCRへイメージ公開し、CapRoverへデプロイ（[設定](self-hosting.md#github-actionsから自動デプロイする)）                          |
| `.github/workflows/images.yml` | 他workflowから呼び出し    | backend / frontend のイメージをビルドしてGHCRへpush                                                                                       |

```sh
git tag v1.2.3 && git push origin v1.2.3
```

タグからバージョンが決まり、CI内で `package.json` とAndroidのversionName/versionCodeがそのタグの値になります（コミットはされません）。`-` を含むタグ（例: `v1.2.0-rc.1`）はprereleaseになります。本番デプロイはタグではなくmainへのpushで `deploy.yml` が行います。

### Android release APK の署名鍵

Androidのrelease APKを常に同じ鍵で署名するには、リポジトリのSecretsに次の3つを登録します。未登録の場合は実行のたびに異なるdebug鍵で署名されるため、更新時にアンインストールが必要です。

```sh
# リポジトリ外に作成する（*.jks はgitignore済みだが、コミットしないこと）。対話入力は使わない
umask 077
openssl rand -base64 33 | tr -d '/+=\n' > ~/besttodo-release.password
export STOREPASS="$(cat ~/besttodo-release.password)"
keytool -genkeypair -keystore ~/besttodo-release.jks -alias besttodo -keyalg RSA -keysize 4096 \
  -validity 10000 -storepass:env STOREPASS -dname "CN=Best ToDo"
keytool -list -keystore ~/besttodo-release.jks -storepass:env STOREPASS -alias besttodo  # 開けるか確認
# gh secret set は値を標準入力で渡すと対話入力を求めない（printf で末尾改行を付けない）
base64 -w0 ~/besttodo-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
printf '%s' "$STOREPASS" | gh secret set ANDROID_KEYSTORE_PASSWORD
printf '%s' besttodo | gh secret set ANDROID_KEY_ALIAS
```

PKCS12形式（keytoolの既定）では鍵のパスワードはkeystoreのパスワードと共通です。keystoreを失くすと同じ署名で更新できなくなるため、パスワードと一緒にバックアップしてください。

## デモ動画

Web版の実操作をPlaywrightで録画し、日本語字幕付きの通常版と15秒ショート版をまとめて生成します。詳細は[デモ動画の生成マニュアル](../artifacts/demo/README.md)を参照してください。

```sh
bash artifacts/demo/generate.sh
```

READMEで使う素材は `docs/assets/` にあります。撮り直したら次のコマンドで更新します。

```sh
cp artifacts/demo/best-todo-demo.mp4 docs/assets/demo.mp4
cp artifacts/demo/final.png docs/assets/screenshot.png
ffmpeg -y -i artifacts/demo/best-todo-demo-short.mp4 \
  -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 docs/assets/demo.gif
```

## コントリビュート

Issue・Pull Requestを歓迎します。PRを送る前に次を確認してください。

1. `npm run format` で整形し、`npm test` が通ること
2. 画面の変更は `public/` で行うこと（全クライアントに反映されます）
3. 見た目が変わる変更は、可能ならスクリーンショットやデモ動画を添付すること
