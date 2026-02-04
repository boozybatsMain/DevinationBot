import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import type { MyContext } from "./types/index.js";
import { requireEnv } from "./utils/env.js";
import { createRedisSession } from "./storage/redis.js";
import { commandsComposer } from "./commands/index.js";
import { callbacksComposer } from "./callbacks/index.js";
import { addGroupForUser, removeGroupForUser } from "./services/groups.js";

export const bot = new Bot<MyContext>(requireEnv("BOT_TOKEN"), {
  botInfo: {
    id: Number(requireEnv("BOT_ID")),
    is_bot: true,
    first_name: "DevinationBot",
    username: requireEnv("BOT_USERNAME"),
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
  },
});

// API-level: autoRetry for rate limits and 5xx errors
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 5 }));

// Session: Upstash Redis with lazy loading
bot.use(createRedisSession());

// ─── my_chat_member: Track groups where bot is added/removed ───
bot.on("my_chat_member", async (ctx) => {
  const update = ctx.myChatMember;
  const chat = update.chat;
  const from = update.from;
  const newStatus = update.new_chat_member.status;
  const oldStatus = update.old_chat_member.status;

  // Only track group/supergroup chats
  if (chat.type !== "group" && chat.type !== "supergroup") return;

  const groupChat = chat as { id: number; title?: string; type: string };
  const chatTitle = groupChat.title ?? `Группа ${groupChat.id}`;

  if (
    (newStatus === "administrator" || newStatus === "member") &&
    oldStatus !== "administrator" &&
    oldStatus !== "member"
  ) {
    // Bot was added to the group — associate with the user who added it
    await addGroupForUser(from.id, {
      chatId: groupChat.id,
      title: chatTitle,
    });
    console.log(`Bot added to "${chatTitle}" by user ${from.id}`);
  } else if (
    (newStatus === "left" || newStatus === "kicked") &&
    (oldStatus === "administrator" || oldStatus === "member")
  ) {
    // Bot was removed from the group
    await removeGroupForUser(from.id, groupChat.id);
    console.log(`Bot removed from "${chatTitle}" by user ${from.id}`);
  }
});

// Handlers
bot.use(commandsComposer);
bot.use(callbacksComposer);

// Catch-all for unhandled callback queries (dismisses loading spinner)
bot.on("callback_query:data", async (ctx) => {
  console.warn("Unhandled callback query:", ctx.callbackQuery.data);
  await ctx.answerCallbackQuery();
});

// Global error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error handling update ${ctx.update.update_id}:`, err.error);
});
