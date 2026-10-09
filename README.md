# SI BASE

Урезанная базовая версия SI BASE:

- Чат: текст, изображения, документы.
- Работа: проекты-папки и пользовательские ассистенты.
- Проекты можно создавать и в обычном чате, и в рабочем режиме.
- Локальная история/проекты/ассистенты сохраняются в localStorage.
- Серверный `/api/chat` проксирует запросы в MixRoute и не раскрывает API-ключ браузеру.
- Интерфейс: чёрный + фиолетово-синий.

## Локальный запуск

1. Скопируйте `.env.example` в `.env.local`.
2. Заполните `MIXROUTER_API_KEY` и актуальные model ID.
3. Выполните:

```bash
npm install
npm run dev
```

## Render

Web Service:
- Runtime: Node
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment: перенесите переменные из `.env.example`, но реальный ключ храните только как secret env var.

Важно: реальный API-ключ в ZIP не включён.
