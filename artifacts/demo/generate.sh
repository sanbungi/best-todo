#!/usr/bin/env bash
# Record the real Web UI, then create the full and 15-second MP4 demos.
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../.." && pwd)"
mode="${1:-all}"
usage() {
  cat <<'HELP'
使い方: bash artifacts/demo/generate.sh [--check | --render-only | --help]
  引数なし       Web版を操作・録画し、通常版と15秒版を生成
  --check        必要なコマンド・依存関係を確認（録画なし）
  --render-only  保存済みの録画から両方のMP4を再生成
  --help         この説明を表示
出力: artifacts/demo/best-todo-demo.mp4
      artifacts/demo/best-todo-demo-short.mp4
既存の同名動画・録画は上書きします。
HELP
}
if [[ $# -gt 1 ]]; then usage >&2; exit 2; fi
case "$mode" in
  --help|-h) usage; exit 0 ;;
  all|--check|--render-only) ;;
  *) usage >&2; exit 2 ;;
esac
cd -- "$project_dir"
trap 'echo "生成に失敗しました。上のエラーと artifacts/demo/README.md を確認してください。" >&2' ERR
fail() { echo "エラー: $*" >&2; exit 1; }
for command_name in python3 ffmpeg ffprobe fc-match; do
  command -v "$command_name" >/dev/null || fail "$command_name が必要です。README.md の初回セットアップを参照してください。"
done
encoders="$(ffmpeg -hide_banner -encoders 2>/dev/null)"
filters="$(ffmpeg -hide_banner -filters 2>/dev/null)"
[[ "$encoders" == *libx264* ]] || fail 'FFmpegにlibx264エンコーダーがありません。'
[[ "$filters" =~ [[:space:]]ass[[:space:]] ]] || fail 'FFmpegにassフィルター（libass）がありません。'
font="$(fc-match -f '%{family}' 'Noto Sans CJK JP')"
[[ "$font" == *'Noto Sans CJK JP'* ]] || fail 'Noto Sans CJK JPフォントが必要です。'
if [[ "$mode" != --render-only ]]; then
  command -v node >/dev/null || fail 'Node.js 22.13以降が必要です。'
  node --input-type=module -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 13)) throw Error("Node.js 22.13以降が必要です");
    await import("playwright");
  '
fi
if [[ "$mode" == --check ]]; then
  echo '依存関係の確認OK（Chromeの起動・ローカル通信は録画時に確認します）。'
  exit 0
fi
if [[ "$mode" == --render-only ]]; then
  [[ -s "$script_dir/recording.webm" && -s "$script_dir/chapters.json" ]] || fail '録画がありません。まず引数なしで実行してください。'
else
  echo '[1/3] Web版を起動・操作して録画します（約80秒）。'
  node "$script_dir/record.mjs"
fi
echo '[2/3] 通常版と15秒版を生成します。'
python3 "$script_dir/render.py"
echo '[3/3] MP4の形式・長さ・デコードを確認します。'
python3 - "$script_dir" <<'PY'
import json
import subprocess
import sys
from pathlib import Path
out = Path(sys.argv[1])
for name in ['best-todo-demo.mp4', 'best-todo-demo-short.mp4']:
    path = out / name
    info = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ]))
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    assert (video['codec_name'], video['width'], video['height']) == ('h264', 1440, 900), info
    duration = float(info['format']['duration'])
    assert duration > 0
    if name.endswith('-short.mp4'):
        assert abs(duration - 15) < 0.05, duration
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'], check=True)
    print(f'{path} ({duration:.1f}秒)')
PY
echo '完了: 通常版と15秒ショート版を生成しました。'
