#!/bin/zsh
# Запуск «Кеплера» двойным щелчком в Finder.
# Ставит зависимости (при первом запуске), собирает приложение, поднимает сервер и открывает браузер.
# Чтобы остановить — закройте это окно Терминала или нажмите Ctrl+C.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=4173
URL="http://localhost:$PORT/"

echo "🛰  Кеплер — трасса спутника"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите его с https://nodejs.org (версия 20 или новее) и запустите снова."
  read -k1 "?Нажмите любую клавишу, чтобы закрыть…"
  exit 1
fi

# Уже запущено — просто открываем браузер
if curl -s -m 2 -o /dev/null "$URL"; then
  echo "Приложение уже работает: $URL"
  open "$URL"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: устанавливаю зависимости (1–2 минуты)…"
  npm install || { read -k1 "?Ошибка установки. Нажмите любую клавишу…"; exit 1; }
fi

echo "Собираю приложение…"
npm run build --silent >/dev/null 2>build-error.log || {
  echo "Сборка не удалась, подробности в build-error.log"
  read -k1 "?Нажмите любую клавишу, чтобы закрыть…"
  exit 1
}
rm -f build-error.log

echo "Открываю $URL"
echo "Чтобы остановить приложение, закройте это окно или нажмите Ctrl+C."
echo
(sleep 1.5 && open "$URL") &
exec node node_modules/vite/bin/vite.js preview --port $PORT --strictPort
