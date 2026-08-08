# Sklews Android (WebView)

Обычное приложение: иконка → открывает твой сервер Sklews (без браузера).

## Что нужно

1. **ПК** с [Android Studio](https://developer.android.com/studio)
2. Запущенный сервер Sklews (Termux на телефоне + cloudflared, или IP в Wi‑Fi)

## Шаги

### 1. Укажи URL сервера

Открой файл:

`app/src/main/java/com/sklews/app/MainActivity.java`

Строка:

```java
private static final String SERVER_URL = "https://sklewss.onrender.com";
```

Замени на свой адрес, например:

```java
private static final String SERVER_URL = "https://xxxx.trycloudflare.com";
```

или в одной Wi‑Fi с телефоном-сервером:

```java
private static final String SERVER_URL = "http://192.168.1.50:5000";
```

### 2. Открой проект

Android Studio → **Open** → папка `android` из репозитория Sklews.

Дождись Gradle Sync.

### 3. Собери APK

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

Готовый файл:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Установи на телефон (разрешить установку из неизвестных источников).

### 4. Release APK (для раздачи)

**Build → Generate Signed Bundle / APK** → создай keystore → APK release.

## Сервер на телефоне (Termux)

```bash
cd ~/Sklews && python app.py
# второй сеанс:
cloudflared tunnel --url http://127.0.0.1:5000
```

Скопируй выданный `https://....trycloudflare.com` в `SERVER_URL`.

## Важно

- `http://127.0.0.1:5000` в APK работает **только если сервер на том же устройстве**, куда ставишь APK.
- Для друзей нужен публичный URL (cloudflared) или IP в одной сети.
- Камера/микрофон в кружках: в манифесте уже есть разрешения; WebView запрашивает доступ.
