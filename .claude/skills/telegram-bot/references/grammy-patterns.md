# grammY Code Patterns Reference

## Command Handler Pattern

```typescript
// src/commands/start.ts
import { CommandContext } from "grammy";
import type { MyContext } from "../types";
import { mainMenuKeyboard } from "../keyboards/mainMenu";

/**
 * Handles the /start command. Resets session and shows main menu.
 */
export async function handleStart(ctx: CommandContext<MyContext>): Promise<void> {
  ctx.session.step = "idle";
  ctx.session.data = undefined;
  await ctx.reply("Welcome to DevinationBot! Choose an option:", {
    reply_markup: mainMenuKeyboard,
  });
}
```

## Callback Query Pattern

```typescript
// src/callbacks/menu.ts
import { Composer } from "grammy";
import type { MyContext } from "../types";

export const menuCallbacks = new Composer<MyContext>();

menuCallbacks.callbackQuery("option_a", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Selected A" });
  await ctx.editMessageText("You chose Option A. What next?", {
    reply_markup: nextStepKeyboard,
  });
});

menuCallbacks.callbackQuery("option_b", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Selected B" });
  await ctx.editMessageText("You chose Option B.");
});

// Regex pattern matching for dynamic callbacks
menuCallbacks.callbackQuery(/^select:(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Selected item #${index}`);
});
```

## Inline Keyboard Builder Pattern

```typescript
// src/keyboards/mainMenu.ts
import { InlineKeyboard } from "grammy";

export const mainMenuKeyboard = new InlineKeyboard()
  .text("Option A", "option_a")
  .text("Option B", "option_b")
  .row()
  .text("Help", "show_help")
  .text("Settings", "show_settings");
```

## Dynamic Keyboard Pattern

```typescript
// src/keyboards/dynamicList.ts
import { InlineKeyboard } from "grammy";

export function buildListKeyboard(items: { id: string; label: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const item of items) {
    keyboard.text(item.label, `select:${item.id}`).row();
  }
  keyboard.text("Cancel", "cancel");
  return keyboard;
}
```

## Middleware Pattern

```typescript
// src/middleware/logging.ts
import { Middleware } from "grammy";
import type { MyContext } from "../types";

export const loggingMiddleware: Middleware<MyContext> = async (ctx, next) => {
  const start = Date.now();
  const userId = ctx.from?.id;
  const updateType = ctx.update.message ? "message" : "callback_query";

  console.log(`[${updateType}] user=${userId}`);

  await next();

  const duration = Date.now() - start;
  console.log(`[${updateType}] user=${userId} duration=${duration}ms`);
};
```

## Auth Middleware Pattern

```typescript
// src/middleware/auth.ts
import { Composer } from "grammy";
import type { MyContext } from "../types";

const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map(Number)
  .filter(Boolean);

export const adminOnly = new Composer<MyContext>();

adminOnly.use(async (ctx, next) => {
  if (!ctx.from || !ADMIN_IDS.includes(ctx.from.id)) {
    await ctx.reply("Unauthorized. This command is for admins only.");
    return;
  }
  return next();
});
```

## Rate Limiting Pattern (Upstash)

```typescript
// src/middleware/rateLimit.ts
import { Middleware } from "grammy";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { MyContext } from "../types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
});

export const rateLimitMiddleware: Middleware<MyContext> = async (ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return next();

  const { success } = await ratelimit.limit(userId);
  if (!success) {
    await ctx.reply("Too many requests. Please wait a moment.");
    return;
  }
  return next();
};
```

## Session with Upstash Redis Pattern

```typescript
// src/storage/redisSession.ts
import { session, lazySession } from "grammy";
import { RedisAdapter } from "@grammyjs/storage-redis";
import { Redis } from "@upstash/redis";
import type { SessionData, MyContext } from "../types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const storage = new RedisAdapter<SessionData>({
  instance: redis,
  ttl: 3600, // 1 hour TTL
});

/** Standard session - reads from Redis on every update */
export function createSession() {
  return session<SessionData, MyContext>({
    initial: (): SessionData => ({ step: "idle" }),
    storage,
  });
}

/** Lazy session - only reads from Redis when ctx.session is accessed */
export function createLazySession() {
  return lazySession<SessionData, MyContext>({
    initial: (): SessionData => ({ step: "idle" }),
    storage,
  });
}
```

## Menu Plugin Pattern

```typescript
// src/keyboards/settingsMenu.ts
import { Menu } from "@grammyjs/menu";
import type { MyContext } from "../types";

export const settingsMenu = new Menu<MyContext>("settings")
  .text("Toggle Notifications", async (ctx) => {
    ctx.session.data = {
      ...ctx.session.data,
      notifications: !ctx.session.data?.notifications,
    };
    await ctx.editMessageText(
      `Notifications: ${ctx.session.data.notifications ? "ON" : "OFF"}`
    );
  })
  .row()
  .text("Back to Main Menu", async (ctx) => {
    await ctx.editMessageText("Main menu:", { reply_markup: mainMenuKeyboard });
  });
```

## Complete Bot Setup Pattern

```typescript
// src/bot.ts
import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import type { MyContext } from "./types";
import { createLazySession } from "./storage/redisSession";
import { loggingMiddleware } from "./middleware/logging";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { commandsComposer } from "./commands";
import { callbacksComposer } from "./callbacks";
import { settingsMenu } from "./keyboards/settingsMenu";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const bot = new Bot<MyContext>(requireEnv("BOT_TOKEN"), {
  botInfo: {
    id: Number(requireEnv("BOT_ID")),
    is_bot: true,
    first_name: "DevinationBot",
    username: requireEnv("BOT_USERNAME"),
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  },
});

// API-level plugins
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 5 }));

// Middleware chain (order matters!)
bot.use(loggingMiddleware);
bot.use(rateLimitMiddleware);
bot.use(createLazySession());

// Register menus before handlers that reference them
bot.use(settingsMenu);

// Handlers
bot.use(commandsComposer);
bot.use(callbacksComposer);

// Catch-all for unhandled callback queries (MUST be last)
bot.on("callback_query:data", async (ctx) => {
  console.warn("Unhandled callback:", ctx.callbackQuery.data);
  await ctx.answerCallbackQuery();
});

// Global error handler
bot.catch((err) => {
  console.error(`Error handling update ${err.ctx.update.update_id}:`, err.error);
});
```

## Webhook Entry Point Pattern

```typescript
// api/bot.ts
import { webhookCallback } from "grammy";
import { bot } from "../src/bot";

export default webhookCallback(bot, "https", {
  secretToken: process.env.WEBHOOK_SECRET,
  timeoutMilliseconds: 9_000,
  onTimeout: "return",
});
```

## Webhook Registration Script

```typescript
// scripts/set-webhook.ts
import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;
const url = process.env.WEBHOOK_URL; // e.g. https://your-app.vercel.app/api/bot
const secret = process.env.WEBHOOK_SECRET;

if (!token || !url || !secret) {
  console.error("Missing BOT_TOKEN, WEBHOOK_URL, or WEBHOOK_SECRET");
  process.exit(1);
}

const bot = new Bot(token);

await bot.api.setWebhook(url, {
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});

const info = await bot.api.getWebhookInfo();
console.log("Webhook set:", info.url);
console.log("Pending updates:", info.pending_update_count);
```

## Filter Queries (Type Narrowing)

```typescript
// Text messages only (ctx.message.text is guaranteed string)
bot.on("message:text", (ctx) => {
  console.log(ctx.message.text);
});

// Photo messages
bot.on("message:photo", (ctx) => {
  const photo = ctx.message.photo; // PhotoSize[]
});

// Specific callback data
bot.callbackQuery("confirm", (ctx) => {
  // ctx.callbackQuery.data === "confirm"
});

// Regex callback data
bot.callbackQuery(/^item:(\d+)$/, (ctx) => {
  const itemId = ctx.match[1]; // string
});

// Has callback data (any)
bot.on("callback_query:data", (ctx) => {
  console.log(ctx.callbackQuery.data); // string
});
```

## Environment Validation Pattern

```typescript
// src/utils/env.ts
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// Validate all required env vars at module load time
export const config = {
  botToken: requireEnv("BOT_TOKEN"),
  botId: Number(requireEnv("BOT_ID")),
  botUsername: requireEnv("BOT_USERNAME"),
  webhookSecret: requireEnv("WEBHOOK_SECRET"),
  redisUrl: requireEnv("UPSTASH_REDIS_REST_URL"),
  redisToken: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
} as const;
```
