# Telegram Bot with grammY

Best practices for building Telegram bots using grammY (TypeScript) on serverless platforms.

## When to Use This Skill

Use when:
- Creating new bot commands or handlers
- Setting up middleware or plugins
- Working with inline keyboards and callback queries
- Configuring session/state management
- Handling errors, timeouts, or rate limits

**For Vercel deployment specifics**, see the `vercel-deployment` skill.

## Core Library: grammY

grammY is the recommended Telegram Bot framework for this project. It is TypeScript-first, serverless-native, and has built-in webhook support.

**Do NOT use**: Telegraf (stale, poor TS types), node-telegram-bot-api (no middleware, no serverless support), or `@grammyjs/conversations` (doesn't work on serverless).

## Reference Files

- See `references/grammy-patterns.md` for code patterns and examples

## Architecture Overview

```
Telegram → POST /api/bot → Serverless Function → grammY webhookCallback
                                                       ↓
                                             Secret token verification
                                                       ↓
                                             Bot middleware chain:
                                               1. Rate limiter
                                               2. Session (lazy, from Redis)
                                               3. Command handlers
                                               4. Callback query handlers
                                               5. Error catch-all
                                                       ↓
                                             Response → Telegram
```

## Key Principles

### 1. Module-Level Bot Initialization

The bot instance MUST be created at module scope. It persists across warm invocations on serverless.

```typescript
// api/bot.ts - CORRECT
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!, {
  botInfo: { /* pre-cached */ },
});
bot.use(session({ ... }));
bot.command("start", handleStart);
export default webhookCallback(bot, "https", { ... });
```

```typescript
// api/bot.ts - WRONG: Don't create bot inside handler
export default async function handler(req, res) {
  const bot = new Bot(token); // Re-created every request!
}
```

### 2. Always Pre-Cache botInfo

Skip the `getMe` API call on cold starts by providing `botInfo`:

```typescript
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!, {
  botInfo: {
    id: Number(process.env.BOT_ID),
    is_bot: true,
    first_name: "DevinationBot",
    username: process.env.BOT_USERNAME!,
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  },
});
```

### 3. Webhook-Only, No Long Polling

```typescript
// CORRECT: Export webhookCallback
export default webhookCallback(bot, "https", {
  secretToken: process.env.WEBHOOK_SECRET,
  timeoutMilliseconds: 9_000,
  onTimeout: "return",
});

// WRONG: Never use bot.start() on serverless
// bot.start(); // This blocks forever and will timeout
```

### 4. Typed Context with Session Flavors

```typescript
// src/types/index.ts
import { Context, SessionFlavor } from "grammy";
import { MenuFlavor } from "@grammyjs/menu";

export interface SessionData {
  step: "idle" | "awaiting_input" | "confirming";
  data?: Record<string, unknown>;
}

export type MyContext = Context & SessionFlavor<SessionData> & MenuFlavor;
```

### 5. Session-Based State Machines (Not Conversations Plugin)

```typescript
// CORRECT: Use session state machine
bot.on("message:text", async (ctx) => {
  switch (ctx.session.step) {
    case "idle":
      await ctx.reply("Send me your name:");
      ctx.session.step = "awaiting_input";
      break;
    case "awaiting_input":
      ctx.session.data = { name: ctx.message.text };
      await ctx.reply(`Confirm name: ${ctx.message.text}?`);
      ctx.session.step = "confirming";
      break;
  }
});

// WRONG: Don't use conversations plugin on serverless
// import { conversations } from "@grammyjs/conversations";
```

### 6. Always Answer Callback Queries

```typescript
bot.callbackQuery("action", async (ctx) => {
  await ctx.answerCallbackQuery(); // ALWAYS do this first
  await ctx.editMessageText("Done!");
});

// Catch-all for unhandled callbacks (MUST be last)
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();
});
```

### 7. Error Handling

```typescript
import { GrammyError, HttpError } from "grammy";

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Telegram API error:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Network error:", e);
  } else {
    console.error("Unknown error:", e);
  }
});
```

### 8. Use Composers for Organizing Handlers

```typescript
// src/commands/index.ts
import { Composer } from "grammy";
import type { MyContext } from "../types";

export const commandsComposer = new Composer<MyContext>();

commandsComposer.command("start", handleStart);
commandsComposer.command("help", handleHelp);
commandsComposer.command("settings", handleSettings);

// src/bot.ts
bot.use(commandsComposer);
bot.use(callbacksComposer);
```

## Plugin Reference

| Plugin | Package | Purpose | Serverless? |
|--------|---------|---------|-------------|
| Auto-retry | `@grammyjs/auto-retry` | Handle rate limits & 5xx | Yes |
| Session | Built-in | State management | Yes (with external storage) |
| Menu | `@grammyjs/menu` | Interactive menus | Yes |
| Redis Adapter | `@grammyjs/storage-redis` | Session storage | Yes (with @upstash/redis) |
| Conversations | `@grammyjs/conversations` | Multi-step flows | **NO** |
