import { InlineKeyboard, type Api } from "grammy";
import type { ComposedMessage } from "../types/index.js";
import { redis } from "../storage/redis.js";

/**
 * Sends the composed message to a target group/channel chat.
 * Handles text-only and photo-with-caption layouts.
 * Returns true on success.
 */
export async function sendComposedMessage(
  api: Api,
  chatId: number,
  msg: ComposedMessage,
): Promise<boolean> {
  if (!msg.text && !msg.imageFileId) {
    throw new Error("Cannot send message: both text and image are empty");
  }

  const keyboard = await buildInlineKeyboard(msg.buttons);
  const replyMarkup = keyboard.inline_keyboard.length > 0 ? keyboard : undefined;

  if (!msg.imageFileId) {
    // Text-only message
    await api.sendMessage(chatId, msg.text, {
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    return true;
  }

  // Photo with caption
  await api.sendPhoto(chatId, msg.imageFileId, {
    caption: msg.text || undefined,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
  return true;
}

/** Max bytes for Telegram callback_data */
const MAX_CALLBACK_DATA = 64;

/**
 * Builds a Telegram InlineKeyboard from the 2D buttons array.
 * Alert texts that exceed the callback_data limit are stored in Redis
 * and referenced by a short key.
 */
async function buildInlineKeyboard(
  buttons: ComposedMessage["buttons"],
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard();
  for (const row of buttons) {
    for (const btn of row) {
      if (btn.action === "url") {
        keyboard.url(btn.text, btn.value);
      } else {
        const inlineData = `alert:${btn.value}`;
        if (Buffer.byteLength(inlineData, "utf-8") <= MAX_CALLBACK_DATA) {
          keyboard.text(btn.text, inlineData);
        } else {
          // Store in Redis with a short random key, 30-day TTL
          const shortId = crypto.randomUUID().slice(0, 8);
          const key = `alert:${shortId}`;
          await redis.set(key, btn.value, { ex: 2_592_000 });
          keyboard.text(btn.text, `alrt:${shortId}`);
        }
      }
    }
    keyboard.row();
  }
  return keyboard;
}
