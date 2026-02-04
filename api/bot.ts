import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

/**
 * Vercel serverless function handling Telegram webhook updates.
 * Secret token is verified automatically by grammY's webhookCallback.
 */
export default webhookCallback(bot, "https", {
  secretToken: process.env.WEBHOOK_SECRET,
  timeoutMilliseconds: 9_000, // 1s buffer before Vercel's 10s hobby limit
  onTimeout: "return", // Return 200 on timeout to prevent Telegram re-sending
});
