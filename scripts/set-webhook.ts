import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;
const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!token || !url || !secret) {
  console.error("Required env vars: BOT_TOKEN, WEBHOOK_URL, WEBHOOK_SECRET");
  process.exit(1);
}

const bot = new Bot(token);

await bot.api.setWebhook(url, {
  secret_token: secret,
  allowed_updates: ["message", "callback_query", "my_chat_member"],
  drop_pending_updates: true,
});

const info = await bot.api.getWebhookInfo();
console.log("Webhook set:", info.url);
console.log("Pending updates:", info.pending_update_count);
console.log("Allowed updates:", info.allowed_updates);
