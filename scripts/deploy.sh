#!/bin/sh
# Публикация сайта на GitHub Pages: сборка и выкладка папки dist в ветку gh-pages.
# Запуск: npm run deploy
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Публикация сайта"
git -c credential.helper= -c credential.helper="!gh auth git-credential" push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Готово: сайт обновится через 1–2 минуты."
