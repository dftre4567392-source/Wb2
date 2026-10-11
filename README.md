# SI BASE

Railway-ready production copy of SI BASE.

## Что есть

- Два режима: Чат и Работа.
- Проекты, локальная история и пользовательские ассистенты.
- Вложения через серверный обработчик файлов.
- Серверный `/api/chat` обращается к MixRoute; API-ключ не попадает в браузер.
- Модели: Qwen 3.6, DeepSeek V4, GPT-6 Luna, Gemini 3.8 Flash, Grok 4.7, Claude Opus 4.8.
- Telegram WebApp `ready()` / `expand()`.
- Railway healthcheck: `/api/health`.
- Никаких Floot/Lovable/Render badge внутри интерфейса.

## Railway

Источник: ветка `main`.

Railway читает `railway.json`:

- Build: `npm install && npm run build`
- Start: `npm start`
- Healthcheck: `/api/health`
- Node: 20+

В Railway → Variables добавить серверные переменные из `.env.example`. Реальные ключи никогда не коммитить в GitHub.

Обязательная для AI:

- `MIXROUTER_API_KEY`

Подготовлены также:

- `MIXROUTER_BASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TRIBUTE_API_KEY`
- model ID переменные для 6 моделей

## Локальный запуск

```bash
npm install
npm run dev
```

Для локальной проверки скопируйте `.env.example` в `.env.local` и заполните только локальные секреты.
