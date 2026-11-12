#!/usr/bin/env bash
# OCR 用の apt パッケージ（Tesseract 日本語・poppler-utils）を入れる。
#
# 2026-11-11 23:38 JST の定期スクレイプは、Ubuntu のパッケージミラー
# （azure.archive.ubuntu.com）の名前解決が一時的にできず、ここで 11 分待たされた末に
# exit 100 で落ち、スクレイプ本体に一度も入らずに終わった（stage=unknown）。
#
# 対策:
#   1. 前回取得した .deb を Actions cache から戻し、まずネットに出ずに入れる（--no-download）
#   2. 駄目ならミラーの名前解決を確かめてからネットで取りにいく（時間の上限つきで再試行）
#   3. それでも入らなければ ::warning:: を出して **成功で終わる**
#      Tesseract は予備の OCR（主は RapidOCR）、pdftoppm も無ければ使わない作りのため、
#      無いまま走ってもスクレイプはできる。ここで落としてデータ更新ごと止めるほうが害が大きい
#
# 出力（$GITHUB_OUTPUT）:
#   installed=true|false  … tesseract(jpn) と pdftoppm の両方が使えるか
#   debs_hash=<sha256>    … キャッシュ用。.deb の一覧のハッシュ（無ければ空）
set -uo pipefail

DEB_DIR="${1:?usage: install.sh <deb-cache-dir>}"
PACKAGES=(tesseract-ocr tesseract-ocr-jpn poppler-utils)
# この手順全体で使う時間の上限（秒）。超えたら諦めてスクレイプへ進む
BUDGET_SECONDS="${OCR_APT_BUDGET_SECONDS:-360}"
DEADLINE=$((SECONDS + BUDGET_SECONDS))

out() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT"; return 0; }
# timeout 0 は「上限なし」になるため、最小でも 1 秒にする
remaining() { local r=$((DEADLINE - SECONDS)); [ "$r" -lt 1 ] && r=1; echo "$r"; }

ocr_tools_ok() {
  command -v pdftoppm >/dev/null 2>&1 \
    && command -v tesseract >/dev/null 2>&1 \
    && tesseract --list-langs 2>/dev/null | grep -qx 'jpn'
}

mkdir -p "$DEB_DIR/partial"
# 1件あたりの待ちを短くし、失敗した取得は数回やり直す（既定は再試行なし・待ちが長い）
APT_OPTS=(
  -o "Dir::Cache::Archives=$DEB_DIR"
  -o APT::Keep-Downloaded-Packages=true
  -o Acquire::Retries=3
  -o Acquire::http::Timeout=15
  -o Acquire::https::Timeout=15
)

installed=false
if ocr_tools_ok; then
  echo "OCR 用パッケージは導入済みです"
  installed=true
fi

# ── 1. キャッシュ済みの .deb だけで入れる（ネット不要・数秒） ──
if [ "$installed" != true ] && ls "$DEB_DIR"/*.deb >/dev/null 2>&1; then
  echo "キャッシュ済みの .deb から導入します（ネットワークを使いません）"
  if timeout "$(remaining)" sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-download \
       "${APT_OPTS[@]}" "${PACKAGES[@]}"; then
    ocr_tools_ok && installed=true
  else
    echo "キャッシュの .deb では足りませんでした（ランナーのパッケージ一覧が更新された等）。ネットワークから取得します"
  fi
fi

# ── 2. ネットワークから取得（ミラーの名前解決を確かめてから） ──
mirror_resolvable() {
  local hosts=(archive.ubuntu.com security.ubuntu.com)
  if [ -r /etc/apt/apt-mirrors.txt ]; then
    while read -r line; do
      h=$(echo "$line" | sed -nE 's#^[a-z]+://([^/[:space:]]+).*#\1#p')
      [ -n "$h" ] && hosts=("$h" "${hosts[@]}")
    done < /etc/apt/apt-mirrors.txt
  fi
  for h in "${hosts[@]}"; do
    if timeout 5 getent hosts "$h" >/dev/null 2>&1; then return 0; fi
  done
  return 1
}

attempt=0
while [ "$installed" != true ] && [ "$(remaining)" -gt 20 ]; do
  attempt=$((attempt + 1))
  if ! mirror_resolvable; then
    echo "パッケージミラーの名前解決ができません（試行 $attempt）。少し待って再確認します"
    sleep 15
    continue
  fi
  echo "ネットワークから取得します（試行 $attempt・残り $(remaining) 秒）"
  timeout "$(remaining)" sudo apt-get update "${APT_OPTS[@]}" || echo "apt-get update に失敗（既存のパッケージ一覧で続行）"
  if timeout "$(remaining)" sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
       "${APT_OPTS[@]}" "${PACKAGES[@]}"; then
    ocr_tools_ok && installed=true
  fi
  [ "$installed" = true ] || sleep 10
done

# ── キャッシュ保存の準備（root 所有の lock / partial は除く） ──
sudo rm -rf "$DEB_DIR/partial" "$DEB_DIR/lock"
sudo chown -R "$(id -u):$(id -g)" "$DEB_DIR" 2>/dev/null || true
debs_hash=""
if ls "$DEB_DIR"/*.deb >/dev/null 2>&1; then
  debs_hash=$(cd "$DEB_DIR" && ls -1 ./*.deb | sort | sha256sum | cut -c1-16)
fi
out "debs_hash=$debs_hash"
out "installed=$installed"

if [ "$installed" = true ]; then
  echo "OCR 用パッケージ: 利用可（$(tesseract --version 2>&1 | head -1) / $(pdftoppm -v 2>&1 | head -1)）"
else
  echo "::warning::OCR 用パッケージ（Tesseract・poppler-utils）を導入できませんでした（パッケージミラーに接続できない等）。RapidOCR と API の OCR だけで続行します"
fi
exit 0
