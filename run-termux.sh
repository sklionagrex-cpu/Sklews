#!/data/data/com.termux/files/usr/bin/bash
# Sklews server for Termux
cd "$(dirname "$0")"

echo "=== Sklews Termux ==="

# deps
pkg install -y python 2>/dev/null
pip install -q -r requirements.txt

# wake lock so phone doesn't kill server
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  echo "Wake-lock включён"
fi

export PORT="${PORT:-5000}"
export SECRET_KEY="${SECRET_KEY:-sklews-termux-secret-change-me}"

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
[ -z "$IP" ] && IP=$(ifconfig wlan0 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1)
[ -z "$IP" ] && IP="127.0.0.1"

echo ""
echo "Сервер:  http://127.0.0.1:$PORT"
echo "В сети:  http://${IP}:$PORT"
echo ""
echo "На этом телефоне открой Chrome → http://127.0.0.1:$PORT"
echo "Меню → «Установить приложение» / «На экран»"
echo ""
echo "Остановка: Ctrl+C"
echo ""

python app.py
