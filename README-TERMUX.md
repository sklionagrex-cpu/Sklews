# Sklews — запуск на Termux

## 1. Сервер на телефоне

```bash
pkg update && pkg install python git libsqlite sqlite
cd ~
git clone https://github.com/sklionagrex-cpu/Sklews.git
cd Sklews
pip install -r requirements.txt
chmod +x run-termux.sh
./run-termux.sh
```

Или вручную:

```bash
pkg install -y libsqlite sqlite
pip install -r requirements.txt
python app.py
```

> **Если была ошибка `ModuleNotFoundError: No module named '_sqlite3'`** — это решено:
> - в `requirements.txt` добавлен `pysqlite3-binary`
> - в `app.py` добавлен автоматический fallback на pysqlite3
> - `run-termux.sh` ставит `libsqlite` / `sqlite`

Открой в Chrome: **http://127.0.0.1:5000**

Чтобы сервер не засыпал: `termux-wake-lock` (нужен Termux:API).

---

## 2. «Приложение» без APK (PWA)

1. Запусти сервер в Termux  
2. Chrome → http://127.0.0.1:5000  
3. Меню ⋮ → **Установить приложение** / **Добавить на главный экран**

Получится иконка как у APK, открывается в отдельном окне.

---

## 3. Настоящий APK (WebView)

Собрать полноценный APK **внутри Termux** без Android SDK почти невозможно.

Варианты:

### A) Онлайн WebView APK
1. Залей сервер на хостинг **или** используй IP телефона в одной Wi‑Fi сети  
2. Сайты вроде *webview-apk*, *AppsGeyser*, *WebIntoApp* — укажи URL  
3. Скачай готовый APK  

Для локального сервера URL: `http://127.0.0.1:5000`  
(работает только если сервер крутится на том же телефоне)

### B) С ПК (Android Studio)
Проект WebView на 20 строк, `loadUrl("http://127.0.0.1:5000")`,  
в `AndroidManifest`: `android:usesCleartextTraffic="true"`.

### C) Другой телефон в той же Wi‑Fi
На сервере смотри IP (`./run-termux.sh` печатает).  
На втором устройстве: `http://192.168.x.x:5000`

---

## Важно

- База `sklews.db` хранится в папке проекта.
- Загрузки файлов — в `static/uploads/`.
- Для доступа из сети телефон и клиент должны быть в одной Wi‑Fi.
- Если Python всё равно ругается на sqlite — выполни:
  ```bash
  pkg reinstall python
  pkg install libsqlite
  pip install --force-reinstall pysqlite3-binary
  ```
