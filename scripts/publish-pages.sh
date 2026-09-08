#!/usr/bin/env bash
# 把 dist/ 构建产物发布到 gh-pages 分支（GitHub Pages 站点根目录）
# 用法：先 pnpm run build，再 bash scripts/publish-pages.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d dist ]; then
  echo "找不到 dist/，请先执行 pnpm run build" >&2
  exit 1
fi

REMOTE_URL="$(git remote get-url origin)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp -R dist/. "$WORK/"
touch "$WORK/.nojekyll"

cd "$WORK"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$REPO_ROOT" config user.name)" \
    -c user.email="$(git -C "$REPO_ROOT" config user.email)" \
    commit -q -m "发布站点构建产物"
git remote add origin "$REMOTE_URL"
git push -q --force origin gh-pages

echo "已发布到 gh-pages 分支"
