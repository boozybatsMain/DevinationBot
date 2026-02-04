# DevinationBot

Telegram-бот для создания и отправки красивых сообщений с кнопками в группы. Построен на [grammY](https://grammy.dev/) (TypeScript), развёрнут на [Vercel](https://vercel.com/) serverless functions.

## Возможности

- **Создание сообщений** с форматированным текстом (HTML)
- **Прикрепление изображений** с выбором расположения (над или под текстом)
- **Интерактивные кнопки** — ссылки (URL) и всплывающие уведомления (alert)
- **Визуальный конструктор кнопок** — добавление в любую позицию (вверх/вниз/влево/вправо)
- **Выбор группы** для отправки из списка групп, где бот — администратор
- **Deep link** для быстрого добавления бота в новую группу с нужными правами
- **Предпросмотр** на каждом шаге создания сообщения

## Технологии

| Компонент | Технология |
|-----------|------------|
| Фреймворк | [grammY](https://grammy.dev/) v1.35+ |
| Язык | TypeScript 5.5+ (strict mode) |
| Деплой | [Vercel](https://vercel.com/) Serverless Functions |
| Хранилище | [Upstash Redis](https://upstash.com/) (HTTP-based) |
| Сессии | `@grammyjs/storage-redis` + lazy sessions |
| Retry | `@grammyjs/auto-retry` |

## Архитектура

```
Telegram Update → POST /api/bot → Vercel Serverless Function
                                         ↓
                                  webhookCallback (grammY)
                                         ↓
                                  Secret token verification
                                         ↓
                                  Middleware chain:
                                    1. Auto-retry (API level)
                                    2. Lazy Redis sessions
                                    3. my_chat_member tracker
                                    4. Command handlers
                                    5. Callback query handlers
                                    6. Text/photo input handlers
                                    7. Error catch-all
                                         ↓
                                  Response → Telegram
```

## Структура проекта

```
DevinationBot/
├── api/
│   └── bot.ts                    # Webhook endpoint (Vercel serverless)
├── src/
│   ├── bot.ts                    # Bot instance, plugins, middleware
│   ├── types/
│   │   └── index.ts              # SessionData, MyContext, ComposedMessage
│   ├── commands/
│   │   ├── index.ts              # Commands composer
│   │   ├── start.ts              # /start — главное меню
│   │   └── help.ts               # /help — справка
│   ├── callbacks/
│   │   ├── index.ts              # Callbacks + input composer
│   │   ├── messageBuilder.ts     # Все callback-обработчики конструктора
│   │   └── messageInput.ts       # Обработчики текста и фото по шагам
│   ├── keyboards/
│   │   └── messageBuilder.ts     # Все клавиатуры конструктора
│   ├── services/
│   │   ├── groups.ts             # Redis: привязка пользователь → группы
│   │   ├── preview.ts            # Генерация текста предпросмотра
│   │   └── sender.ts             # Отправка сообщения в группу
│   ├── storage/
│   │   └── redis.ts              # Upstash Redis клиент и сессии
│   ├── middleware/                # (зарезервировано для будущих middleware)
│   └── utils/
│       └── env.ts                # Валидация env переменных
├── scripts/
│   └── set-webhook.ts            # Регистрация webhook в Telegram
├── thoughts/                     # Исследования и планы
├── .env.example                  # Шаблон переменных окружения
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

## Пользовательский флоу

```
/start
  └─→ [📝 Создать сообщение]
        └─→ Шаг 1: Написать текст
              └─→ Шаг 2: Добавить изображение? (да/пропустить)
                    └─→ Шаг 2.1: Отправить изображение
                          └─→ Шаг 3: Расположение (над/под текстом)
                                └─→ Шаг 4: Конструктор кнопок
                                      │   ┌──────┬──────┬──────┐
                                      │   │      │ + ↑  │      │
                                      │   │ + ←  │ Btn  │ + →  │
                                      │   │      │ + ↓  │      │
                                      │   └──────┴──────┴──────┘
                                      └─→ Шаг 5: Текст кнопки
                                            └─→ Шаг 6: Действие (URL / уведомление)
                                                  └─→ Шаг 7: Значение (URL или текст)
                                                        └─→ Шаг 8: Предпросмотр
                                                              └─→ Шаг 9: Выбор группы
                                                                    └─→ Шаг 10: Подтверждение → Отправка
```

На каждом шаге (начиная со 2-го) отображается **предпросмотр** текущего сообщения и кнопка **⬅️ Назад**.

## Быстрый старт

### Предварительные требования

- **Node.js** 22 LTS (или 20+)
- **npm** 10+
- **Telegram Bot** — создайте через [@BotFather](https://t.me/BotFather)
- **Upstash Redis** — создайте бесплатную базу на [upstash.com](https://upstash.com/)
- **Vercel** аккаунт (для деплоя)

### 1. Клонирование и установка

```bash
git clone https://github.com/YOUR_USERNAME/DevinationBot.git
cd DevinationBot
npm install
```

### 2. Настройка окружения

Скопируйте `.env.example` и заполните значения:

```bash
cp .env.example .env.local
```

```env
# Telegram Bot (от @BotFather)
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
BOT_ID=123456789
BOT_USERNAME=your_bot_username

# Webhook Security
# Сгенерируйте: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
WEBHOOK_SECRET=your-random-64-char-hex-string
WEBHOOK_URL=https://your-app.vercel.app/api/bot

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx
```

**Как получить значения:**

| Переменная | Где взять |
|------------|-----------|
| `BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` → скопировать токен |
| `BOT_ID` | Число перед `:` в токене (например, `123456789:ABC...` → `123456789`) |
| `BOT_USERNAME` | Имя бота без `@` (например, `devination_bot`) |
| `WEBHOOK_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `WEBHOOK_URL` | URL вашего Vercel-приложения + `/api/bot` |
| `UPSTASH_REDIS_REST_URL` | [Upstash Console](https://console.upstash.com/) → Redis → REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → Redis → REST API Token |

### 3. Деплой на Vercel

```bash
# Установите Vercel CLI
npm i -g vercel

# Залогиньтесь
vercel login

# Задайте env переменные
vercel env add BOT_TOKEN
vercel env add BOT_ID
vercel env add BOT_USERNAME
vercel env add WEBHOOK_SECRET
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN

# Preview деплой
vercel

# Production деплой
vercel --prod
```

### 4. Регистрация webhook

После деплоя обновите `WEBHOOK_URL` в env и запустите:

```bash
# Установите WEBHOOK_URL (замените на ваш домен)
export WEBHOOK_URL=https://your-app.vercel.app/api/bot

# Зарегистрируйте webhook
npm run set-webhook
```

Скрипт выведет:
```
Webhook set: https://your-app.vercel.app/api/bot
Pending updates: 0
Allowed updates: message,callback_query,my_chat_member
```

### 5. Проверка

Откройте бота в Telegram и отправьте `/start`. Вы должны увидеть приветственное сообщение с кнопкой «📝 Создать сообщение».

## Локальное тестирование

Vercel serverless функции работают через webhook, поэтому для локального тестирования нужен туннель.

### Способ 1: ngrok (рекомендуется)

```bash
# 1. Установите ngrok (https://ngrok.com/)
brew install ngrok   # macOS
# или скачайте с ngrok.com

# 2. Запустите Vercel dev-сервер
vercel dev

# 3. В другом терминале создайте туннель
ngrok http 3000

# 4. Скопируйте HTTPS URL из ngrok (например, https://abc123.ngrok-free.app)
# 5. Зарегистрируйте webhook с ngrok URL:
export BOT_TOKEN=your_token
export WEBHOOK_URL=https://abc123.ngrok-free.app/api/bot
export WEBHOOK_SECRET=your_secret
npx tsx scripts/set-webhook.ts

# 6. Теперь бот работает локально! Тестируйте в Telegram.
```

### Способ 2: Vercel Preview Deploy

```bash
# Каждый push в git или `vercel` создаёт preview deployment
vercel

# Используйте preview URL для webhook:
export WEBHOOK_URL=https://devination-bot-abc123.vercel.app/api/bot
npm run set-webhook
```

### Способ 3: Прямой вызов API (без webhook)

Для быстрой проверки отдельных обработчиков можно эмулировать webhook вызов:

```bash
# Запустите vercel dev
vercel dev

# Отправьте тестовый update (пример для /start)
curl -X POST http://localhost:3000/api/bot \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_WEBHOOK_SECRET" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "from": {"id": 123, "is_bot": false, "first_name": "Test"},
      "chat": {"id": 123, "type": "private", "first_name": "Test"},
      "date": 1700000000,
      "text": "/start",
      "entities": [{"offset": 0, "length": 6, "type": "bot_command"}]
    }
  }'
```

## Команды разработки

```bash
npm run type-check    # Проверка типов TypeScript
npm run lint          # ESLint
npm run lint:fix      # Авто-исправление lint ошибок
npm run format        # Форматирование Prettier
npm run test          # Запуск тестов (vitest)
npm run set-webhook   # Регистрация webhook в Telegram
```

## Ограничения Vercel (Hobby план)

| Параметр | Лимит |
|----------|-------|
| Время выполнения | 10 секунд |
| Память | 1024 MB |
| Размер payload | 4.5 MB |

Бот настроен с `timeoutMilliseconds: 9_000` (буфер 1с) и `onTimeout: "return"` чтобы Telegram не переотправлял обновления при таймауте.

## Ключевые решения

### Почему grammY, а не Telegraf/node-telegram-bot-api?

- **TypeScript-first** — полная типизация из коробки
- **Serverless-native** — встроенный `webhookCallback`
- **Активное развитие** — поддерживается, частые обновления
- **Плагины** — auto-retry, sessions, menus, storage adapters

### Почему session state machine, а не conversations?

Плагин `@grammyjs/conversations` **не работает на serverless** — он требует persistent process. Вместо этого используется session-based state machine с 12 состояниями, хранящимися в Redis.

### Почему Upstash Redis?

- **HTTP-based** — работает в serverless (нет persistent TCP connections)
- **Бесплатный тарифик** — 10,000 запросов/день
- **Автоматический TTL** — сессии автоматически удаляются через 1 час

### Как бот узнаёт о группах?

Bot API **не имеет метода** для получения списка групп бота. Бот отслеживает `my_chat_member` обновления — когда его добавляют/удаляют из группы, он сохраняет связь `пользователь → группы` в Redis.

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|:---:|----------|
| `BOT_TOKEN` | ✅ | Токен бота от @BotFather |
| `BOT_ID` | ✅ | ID бота (число перед `:` в токене) |
| `BOT_USERNAME` | ✅ | Username бота без `@` |
| `WEBHOOK_SECRET` | ✅ | Случайная строка для верификации webhook |
| `WEBHOOK_URL` | ⚙️ | URL webhook (только для скрипта регистрации) |
| `UPSTASH_REDIS_REST_URL` | ✅ | URL Upstash Redis REST API |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Токен Upstash Redis REST API |

## Лицензия

MIT
